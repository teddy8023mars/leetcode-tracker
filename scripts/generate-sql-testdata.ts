import 'dotenv/config';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { getDb } from '../server/db';
import { problems, problemSolutions } from '../drizzle/schema';
import { generateSqlJudgeDatasets } from '../server/judge/sqlDataGenerator';
import { extractReferenceSql, judgeSql, nonInsertStatements } from '../server/judge/sqlJudge';

const FORCE = process.env.FORCE_REGENERATE === '1';
const CONCURRENCY = 4;

(async () => {
  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL not set');

  const rows = await db
    .select({
      id: problems.id,
      titleSlug: problems.titleSlug,
      titleEn: problems.titleEn,
      contentEn: problems.contentEn,
      mysqlSchemasJson: problems.mysqlSchemasJson,
    })
    .from(problems)
    .where(
      FORCE
        ? eq(problems.category, 'database')
        : and(eq(problems.category, 'database'), or(isNull(problems.sqlJudgeDataJson))),
    );
  const only = process.env.ONLY_SLUG;
  const targets = rows.filter(
    (r) => (r.mysqlSchemasJson ?? []).length > 0 && (!only || r.titleSlug === only),
  );
  console.log(`generating judge data for ${targets.length} problems (force=${FORCE})`);
  if (targets.length === 0) return process.exit(0);

  const sols = await db
    .select({
      problemId: problemSolutions.problemId,
      language: problemSolutions.language,
      contentMarkdown: problemSolutions.contentMarkdown,
    })
    .from(problemSolutions)
    .where(
      and(
        eq(problemSolutions.source, 'community'),
        inArray(problemSolutions.problemId, targets.map((r) => r.id)),
      ),
    );
  const solsByProblem = new Map<number, { zh?: string; en?: string }>();
  for (const s of sols) {
    const entry = solsByProblem.get(s.problemId) ?? {};
    entry[s.language as 'zh' | 'en'] = s.contentMarkdown;
    solsByProblem.set(s.problemId, entry);
  }

  let done = 0;
  let ok = 0;
  let failed = 0;
  const queue = [...targets];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) return;
        const label = () => `[${++done}/${targets.length}] ${row.titleSlug}`;
        try {
          const sol = solsByProblem.get(row.id);
          const referenceSql = extractReferenceSql([sol?.zh, sol?.en]);
          if (!referenceSql) {
            failed++;
            console.log(`${label()}: NO REFERENCE SQL`);
            continue;
          }
          const schemas = row.mysqlSchemasJson as string[];
          const datasets = await generateSqlJudgeDatasets({
            titleEn: row.titleEn,
            contentEn: row.contentEn,
            schemas,
            referenceSql,
          });
          if (!datasets) {
            failed++;
            console.log(`${label()}: LLM RETURNED NOTHING USABLE`);
            continue;
          }
          // Keep only datasets the reference solution actually runs on.
          const creates = nonInsertStatements(schemas);
          const valid: string[][] = [];
          for (const inserts of datasets) {
            const probe = await judgeSql({
              schemas: [...creates, ...inserts],
              referenceSql,
              userSql: referenceSql,
            });
            if (probe.verdict === 'accepted') valid.push(inserts);
          }
          if (valid.length === 0) {
            failed++;
            console.log(`${label()}: 0/${datasets.length} datasets validated`);
            continue;
          }
          await db.update(problems).set({ sqlJudgeDataJson: valid }).where(eq(problems.id, row.id));
          ok++;
          console.log(`${label()}: ${valid.length}/${datasets.length} datasets saved`);
        } catch (e) {
          failed++;
          console.log(`${label()}: ERROR ${(e as Error).message.slice(0, 200)}`);
        }
      }
    }),
  );
  console.log(`done: ${ok} saved, ${failed} failed`);
  process.exit(0);
})();
