import fs from 'node:fs';
import zlib from 'node:zlib';
import mysql from 'mysql2/promise';

/**
 * First-run data seeding for the desktop app: if the configured database is
 * missing or has no problems, create it and import the bundled mysqldump
 * snapshot (schema for every table + content data, no personal progress).
 */

/**
 * Split a mysqldump file into executable statements. mysqldump escapes
 * newlines inside string literals, so a real newline only ever appears
 * between lines of one statement; a statement ends when its line ends in `;`.
 */
export function splitSqlDump(dump: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  for (const line of dump.split('\n')) {
    const trimmed = line.trim();
    if (current.length === 0) {
      if (trimmed === '' || trimmed.startsWith('--')) continue;
    }
    current.push(line);
    if (trimmed.endsWith(';')) {
      statements.push(current.join('\n').trim());
      current = [];
    }
  }
  return statements;
}

function parseDbUrl(databaseUrl: string) {
  const u = new URL(databaseUrl);
  return {
    host: u.hostname || 'localhost',
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username || 'root'),
    password: decodeURIComponent(u.password || ''),
    database: u.pathname.replace(/^\//, ''),
  };
}

/** True when the database or its problems table is missing/empty. */
async function needsSeed(cfg: ReturnType<typeof parseDbUrl>): Promise<boolean> {
  let conn: mysql.Connection;
  try {
    conn = await mysql.createConnection({ ...cfg, database: cfg.database });
  } catch {
    return true; // database doesn't exist yet
  }
  try {
    const [rows] = await conn.query('SELECT COUNT(*) AS c FROM problems');
    return Number((rows as Array<{ c: number }>)[0]?.c ?? 0) === 0;
  } catch {
    return true; // table doesn't exist
  } finally {
    await conn.end().catch(() => {});
  }
}

export async function ensureSeeded(args: {
  databaseUrl: string;
  seedPath: string;
  log?: (msg: string) => void;
}): Promise<'seeded' | 'skipped'> {
  const log = args.log ?? ((m) => console.log(`[seed] ${m}`));
  if (!fs.existsSync(args.seedPath)) return 'skipped';
  const cfg = parseDbUrl(args.databaseUrl);
  if (!cfg.database) return 'skipped';

  if (!(await needsSeed(cfg))) return 'skipped';

  log(`first run: importing bundled data into ${cfg.database}…`);
  const server = await mysql.createConnection({ ...cfg, database: undefined });
  try {
    await server.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database.replace(/`/g, '')}\` DEFAULT CHARACTER SET utf8mb4`,
    );
  } finally {
    await server.end().catch(() => {});
  }

  const raw = fs.readFileSync(args.seedPath);
  const sql = args.seedPath.endsWith('.gz')
    ? zlib.gunzipSync(raw).toString('utf8')
    : raw.toString('utf8');
  const statements = splitSqlDump(sql);

  const conn = await mysql.createConnection({ ...cfg, database: cfg.database });
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    let done = 0;
    for (const stmt of statements) {
      await conn.query(stmt);
      if (++done % 200 === 0) log(`imported ${done}/${statements.length} statements`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end().catch(() => {});
  }
  log(`import complete: ${statements.length} statements`);
  return 'seeded';
}
