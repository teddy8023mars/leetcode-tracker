import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

/**
 * Export a seed snapshot for the desktop app installer: full schema for every
 * table, data only for shared content tables (no personal progress). Output:
 * electron/seed.sql.gz, bundled into the app via electron-builder
 * extraResources and imported on first run by server/_core/seedImport.ts.
 */

const CONTENT_TABLES = [
  'problems',
  'problemSolutions',
  'aiSolutions',
  'companyTags',
  'problemLists',
  'problemListItems',
  'problemTestcases',
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('[seed-export] DATABASE_URL not set — skipping seed export');
  process.exit(0);
}
const u = new URL(url);
const db = u.pathname.replace(/^\//, '');
const baseArgs = [
  '-h', u.hostname || 'localhost',
  '-P', u.port || '3306',
  '-u', decodeURIComponent(u.username || 'root'),
  '--skip-comments',
  '--no-tablespaces',
  '--set-gtid-purged=OFF',
  '--single-transaction',
];
const env = { ...process.env, MYSQL_PWD: decodeURIComponent(u.password || '') };
const run = (args: string[]) =>
  execFileSync('mysqldump', [...baseArgs, ...args], { env, maxBuffer: 1024 * 1024 * 1024 }).toString('utf8');

console.log('[seed-export] dumping schema…');
const schema = run(['--no-data', db]);
console.log('[seed-export] dumping content tables…');
const data = run(['--no-create-info', db, ...CONTENT_TABLES]);

const out = path.join('electron', 'seed.sql.gz');
fs.writeFileSync(out, zlib.gzipSync(schema + '\n' + data, { level: 9 }));
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`[seed-export] wrote ${out} (${mb} MB)`);
