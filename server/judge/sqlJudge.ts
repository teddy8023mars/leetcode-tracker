import mysql from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';
import { ENV } from '../_core/env';

/**
 * Local SQL judge: replay the problem's example schema into a scratch
 * database, run the reference solution to produce the expected result,
 * run the user's submission against a fresh copy, and compare.
 *
 * Three problem shapes are supported, detected from the reference solution:
 *  - query:        SELECT / WITH — compare result sets
 *  - function:     CREATE FUNCTION — create it, probe with sample arguments
 *  - modification: INSERT / UPDATE / DELETE — run it, compare table contents
 *
 * Everything runs as a dedicated MySQL user that only has privileges on
 * `judge_tmp_%` databases, so submitted SQL cannot touch application data.
 */

export type SqlJudgeOutcome = {
  verdict: 'accepted' | 'wrong_answer' | 'runtime_error' | 'internal_error';
  runtimeMs: number;
  columns: string[] | null;
  expected: string[][] | null;
  actual: string[][] | null;
  stderr: string;
};

export type SqlMode = 'query' | 'function' | 'modification';

const JUDGE_USER = 'lc_sql_judge';
const JUDGE_PASSWORD = 'lc_sql_judge_local';
const FUNCTION_PROBE_ARGS = [0, 1, 2, 3, 4, 5, 8, 100];

function rootConfig() {
  const url = new URL(ENV.databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

let judgeUserReady = false;
async function ensureJudgeUser(): Promise<void> {
  if (judgeUserReady) return;
  const root = await mysql.createConnection(rootConfig());
  try {
    await root.query(
      `CREATE USER IF NOT EXISTS '${JUDGE_USER}'@'%' IDENTIFIED BY '${JUDGE_PASSWORD}'`,
    );
    await root.query(`GRANT ALL PRIVILEGES ON \`judge\\_tmp\\_%\`.* TO '${JUDGE_USER}'@'%'`);
    try {
      // Non-SUPER users can't create functions under binary logging otherwise.
      await root.query('SET GLOBAL log_bin_trust_function_creators = 1');
    } catch {
      // No privilege or no binlog — function problems may still work.
    }
    await root.query('FLUSH PRIVILEGES');
    judgeUserReady = true;
  } finally {
    await root.end();
  }
}

/** Strip leading hash, dash-dash and block comments so keyword checks see the real statement. */
export function stripLeadingSqlComments(sqlText: string): string {
  let s = sqlText;
  for (;;) {
    const next = s.replace(/^\s*(?:#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)\s*/, '');
    if (next === s) return s.trimStart();
    s = next;
  }
}

export function detectSqlMode(sqlText: string): SqlMode | null {
  const s = stripLeadingSqlComments(sqlText);
  if (/^(select|with)\b/i.test(s)) return 'query';
  if (/^create\s+(definer\s*=\s*\S+\s+)?function\b/i.test(s)) return 'function';
  if (/^(insert|update|delete|replace)\b/i.test(s)) return 'modification';
  return null;
}

/** Reject anything that smuggles in a second statement (not applied to function bodies). */
function isSingleStatement(sqlText: string): boolean {
  const withoutStrings = sqlText.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`/g, '');
  const withoutComments = withoutStrings.replace(/--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g, '');
  return !/;\s*\S/.test(withoutComments);
}

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  // Normalize numeric formatting so 200, 200.0 and '200.00' compare equal.
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n * 1e9) / 1e9);
  }
  return s;
}

function serializeRows(rows: unknown[][], ordered: boolean): string[] {
  const out = rows.map((r) => JSON.stringify(r.map(normalizeValue)));
  if (!ordered) out.sort();
  return out;
}

type RunResult = { columns: string[]; rows: unknown[][]; ordered: boolean };

async function withFreshDb<T>(
  schemas: string[],
  fn: (conn: Connection) => Promise<T>,
): Promise<T> {
  const dbName = `judge_tmp_${process.hrtime.bigint().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const conn = await mysql.createConnection({
    ...rootConfig(),
    user: JUDGE_USER,
    password: JUDGE_PASSWORD,
    dateStrings: true,
  });
  try {
    await conn.query(`CREATE DATABASE \`${dbName}\``);
    await conn.changeUser({ database: dbName });
    for (const stmt of schemas) {
      if (stmt.trim()) await conn.query(stmt);
    }
    return await fn(conn);
  } finally {
    try {
      await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    } catch {
      // best effort
    }
    await conn.end();
  }
}

async function runQueryMode(conn: Connection, sqlText: string, ordered: boolean): Promise<RunResult> {
  const [rows, fields] = await conn.query({ sql: sqlText, rowsAsArray: true, timeout: 8000 });
  return { columns: (fields ?? []).map((f) => f.name), rows: rows as unknown[][], ordered };
}

async function runFunctionMode(
  conn: Connection,
  sqlText: string,
  probe: { name: string; argCount: number },
): Promise<RunResult> {
  await conn.query(sqlText);
  // The user's function may have a different name than the reference —
  // call the one this submission actually created.
  const created = stripLeadingSqlComments(sqlText).match(
    /^create\s+(?:definer\s*=\s*\S+\s+)?function\s+`?(\w+)`?/i,
  );
  const fnName = created?.[1] ?? probe.name;
  const rows: unknown[][] = [];
  if (probe.argCount === 0) {
    const [r] = await conn.query({ sql: `SELECT \`${fnName}\`()`, rowsAsArray: true, timeout: 8000 });
    rows.push([(r as unknown[][])[0]?.[0] ?? null]);
  } else {
    for (const arg of FUNCTION_PROBE_ARGS) {
      const [r] = await conn.query({
        sql: `SELECT \`${fnName}\`(${arg})`,
        rowsAsArray: true,
        timeout: 8000,
      });
      rows.push([arg, (r as unknown[][])[0]?.[0] ?? null]);
    }
  }
  return {
    columns: probe.argCount === 0 ? ['result'] : ['arg', 'result'],
    rows,
    ordered: true,
  };
}

async function runModificationMode(conn: Connection, sqlText: string): Promise<RunResult> {
  await conn.query({ sql: sqlText, timeout: 8000 });
  const [tableRows] = await conn.query({ sql: 'SHOW TABLES', rowsAsArray: true });
  const tables = (tableRows as unknown[][]).map((r) => String(r[0])).sort();
  const rows: unknown[][] = [];
  for (const table of tables) {
    const [r] = await conn.query({
      sql: `SELECT * FROM \`${table}\``,
      rowsAsArray: true,
      timeout: 8000,
    });
    const sorted = serializeRows(r as unknown[][], false);
    for (const s of sorted) rows.push([table, ...(JSON.parse(s) as unknown[])]);
  }
  return { columns: ['table', '…'], rows, ordered: true };
}

export async function judgeSql(args: {
  schemas: string[];
  referenceSql: string;
  userSql: string;
}): Promise<SqlJudgeOutcome> {
  const started = Date.now();
  const fail = (verdict: SqlJudgeOutcome['verdict'], stderr: string): SqlJudgeOutcome => ({
    verdict,
    runtimeMs: Date.now() - started,
    columns: null,
    expected: null,
    actual: null,
    stderr,
  });

  const mode = detectSqlMode(args.referenceSql);
  if (!mode) return fail('internal_error', 'unsupported reference solution');

  const userMode = detectSqlMode(args.userSql);
  if (userMode !== mode) {
    const expectedShape = {
      query: 'a SELECT / WITH query',
      function: 'a CREATE FUNCTION statement',
      modification: 'an INSERT / UPDATE / DELETE statement',
    }[mode];
    return fail('runtime_error', `This problem expects ${expectedShape}.`);
  }
  if (mode !== 'function' && !isSingleStatement(args.userSql)) {
    return fail('runtime_error', 'Submit a single SQL statement.');
  }

  let probe: { name: string; argCount: number } = { name: '', argCount: 0 };
  if (mode === 'function') {
    const sig = stripLeadingSqlComments(args.referenceSql).match(
      /^create\s+(?:definer\s*=\s*\S+\s+)?function\s+`?(\w+)`?\s*\(([^)]*)\)/i,
    );
    if (!sig) return fail('internal_error', 'cannot parse reference function signature');
    const params = sig[2].trim() === '' ? [] : sig[2].split(',');
    if (params.length > 1 || (params.length === 1 && !/\bint\b/i.test(params[0]))) {
      return fail('internal_error', 'unsupported reference function signature');
    }
    probe = { name: sig[1], argCount: params.length };
  }

  const runSide = (sqlText: string) =>
    withFreshDb(args.schemas, (conn) => {
      if (mode === 'query') {
        const ordered = /\border\s+by\b/i.test(args.referenceSql);
        return runQueryMode(conn, sqlText, ordered);
      }
      if (mode === 'function') return runFunctionMode(conn, sqlText, probe);
      return runModificationMode(conn, sqlText);
    });

  try {
    await ensureJudgeUser();
  } catch (e) {
    return fail('internal_error', `judge user setup failed: ${(e as Error).message}`);
  }

  let expected: RunResult;
  try {
    expected = await runSide(args.referenceSql);
  } catch (e) {
    return fail('internal_error', `reference solution failed: ${(e as Error).message}`);
  }

  let actual: RunResult;
  try {
    actual = await runSide(args.userSql);
  } catch (e) {
    return fail('runtime_error', (e as Error).message);
  }

  const toDisplay = (r: RunResult) =>
    r.rows.slice(0, 100).map((row) => row.map((v) => (v === null ? 'null' : String(v))));

  const expectedSer = serializeRows(expected.rows, expected.ordered);
  const actualSer = serializeRows(actual.rows, expected.ordered);
  // Column names must match for plain queries (aliases are part of the task);
  // function/modification modes use synthetic column labels.
  const columnsMatch =
    mode !== 'query' ||
    (expected.columns.length === actual.columns.length &&
      expected.columns.every((c, i) => c.toLowerCase() === actual.columns[i].toLowerCase()));
  const rowsMatch =
    expectedSer.length === actualSer.length && expectedSer.every((r, i) => r === actualSer[i]);

  return {
    verdict: columnsMatch && rowsMatch ? 'accepted' : 'wrong_answer',
    runtimeMs: Date.now() - started,
    columns: expected.columns,
    expected: toDisplay(expected),
    actual: toDisplay(actual),
    stderr: columnsMatch
      ? ''
      : `expected columns [${expected.columns.join(', ')}], got [${actual.columns.join(', ')}]`,
  };
}
