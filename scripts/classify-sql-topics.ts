import 'dotenv/config';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '../server/db';
import { problems, problemSolutions } from '../drizzle/schema';
import { classifySqlProblem } from '../server/sync/sqlTopics';
import { extractReferenceSql } from '../server/judge/sqlJudge';

const FORCE = process.env.FORCE_RECLASSIFY === '1';
const CONCURRENCY = 6;

(async () => {
  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL not set');

  const rows = await db
    .select({
      id: problems.id,
      titleSlug: problems.titleSlug,
      titleEn: problems.titleEn,
      contentEn: problems.contentEn,
      sqlTagsJson: problems.sqlTagsJson,
    })
    .from(problems)
    .where(
      FORCE
        ? eq(problems.category, 'database')
        : and(
            eq(problems.category, 'database'),
            or(isNull(problems.sqlTagsJson), sql`JSON_LENGTH(${problems.sqlTagsJson}) = 0`),
          ),
    );
  console.log(`classifying ${rows.length} database problems (force=${FORCE})`);
  if (rows.length === 0) return process.exit(0);

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
        inArray(problemSolutions.problemId, rows.map(r => r.id)),
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
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) return;
        const sol = solsByProblem.get(row.id);
        const referenceSql = extractReferenceSql([sol?.zh, sol?.en]);
        try {
          const tags = await classifySqlProblem({
            titleEn: row.titleEn,
            contentEn: row.contentEn,
            referenceSql,
          });
          if (tags) {
            await db.update(problems).set({ sqlTagsJson: tags }).where(eq(problems.id, row.id));
            ok++;
            console.log(`[${++done}/${rows.length}] ${row.titleSlug}: ${tags.map(t => t.slug).join(', ')}`);
          } else {
            failed++;
            console.log(`[${++done}/${rows.length}] ${row.titleSlug}: NO RESULT`);
          }
        } catch (e) {
          failed++;
          console.log(`[${++done}/${rows.length}] ${row.titleSlug}: ERROR ${(e as Error).message}`);
        }
      }
    }),
  );
  console.log(`done: ${ok} classified, ${failed} failed`);
  process.exit(0);
})();
