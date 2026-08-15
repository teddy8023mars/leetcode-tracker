import mysql from 'mysql2/promise';
import { ENV } from '../_core/env';

/**
 * Local SQL judge: replay the problem's example schema into a scratch
 * database, run the reference solution to produce the expected result,
 * run the user's query against a fresh copy, and compare result sets.
 *
 * Queries run as a dedicated MySQL user that only has privileges on
 * `judge_tmp_%` databases, so user SQL cannot touch application data.
 */

export type SqlJudgeOutcome = {
  verdict: 'accepted' | 'wrong_answer' | 'runtime_error' | 'internal_error';
  runtimeMs: number;
  columns: string[] | null;
  expected: string[][] | null;
  actual: string[][] | null;
  stderr: string;
};

const JUDGE_USER = 'lc_sql_judge';
const JUDGE_PASSWORD = 'lc_sql_judge_local';

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

export function isReadQuery(sqlText: string): boolean {
  return /^(select|with)\b/i.test(stripLeadingSqlComments(sqlText));
}

/** Reject anything that smuggles in a second statement. */
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

async function runOnFreshDb(
  schemas: string[],
  query: string,
): Promise<{ columns: string[]; rows: unknown[][] }> {
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
    const [rows, fields] = await conn.query({ sql: query, rowsAsArray: true, timeout: 8000 });
    return {
      columns: (fields ?? []).map((f) => f.name),
      rows: rows as unknown[][],
    };
  } finally {
    try {
      await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    } catch {
      // best effort
    }
    await conn.end();
  }
}

export async function judgeSql(args: {
  schemas: string[];
  referenceSql: string;
  userSql: string;
}): Promise<SqlJudgeOutcome> {
  const started = Date.now();
  const fail = (
    verdict: SqlJudgeOutcome['verdict'],
    stderr: string,
    extra?: Partial<SqlJudgeOutcome>,
  ): SqlJudgeOutcome => ({
    verdict,
    runtimeMs: Date.now() - started,
    columns: null,
    expected: null,
    actual: null,
    stderr,
    ...extra,
  });

  if (!isReadQuery(args.userSql)) {
    return fail('runtime_error', 'Only SELECT / WITH queries are supported.');
  }
  if (!isSingleStatement(args.userSql)) {
    return fail('runtime_error', 'Submit a single SQL statement.');
  }

  try {
    await ensureJudgeUser();
  } catch (e) {
    return fail('internal_error', `judge user setup failed: ${(e as Error).message}`);
  }

  let expected: { columns: string[]; rows: unknown[][] };
  try {
    expected = await runOnFreshDb(args.schemas, args.referenceSql);
  } catch (e) {
    return fail('internal_error', `reference solution failed: ${(e as Error).message}`);
  }

  let actual: { columns: string[]; rows: unknown[][] };
  try {
    actual = await runOnFreshDb(args.schemas, args.userSql);
  } catch (e) {
    return fail('runtime_error', (e as Error).message);
  }

  const toDisplay = (r: { rows: unknown[][] }) =>
    r.rows.slice(0, 100).map((row) => row.map((v) => (v === null ? 'null' : String(v))));

  const ordered = /\border\s+by\b/i.test(args.referenceSql);
  const expectedSer = serializeRows(expected.rows, ordered);
  const actualSer = serializeRows(actual.rows, ordered);
  const columnsMatch =
    expected.columns.length === actual.columns.length &&
    expected.columns.every((c, i) => c.toLowerCase() === actual.columns[i].toLowerCase());
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
