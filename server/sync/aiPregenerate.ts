import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { generateAiSolution } from './aiGeneration';
import type { TaskResult } from './orchestrator';
import type { Language } from '@shared/problemTypes';

const LANGUAGES: Language[] = ['en', 'zh'];
const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function taskAiPregenerate(): Promise<TaskResult> {
  const db = await getDb();
  if (!db) return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, errorSummary: 'DB unavailable' };

  let processed = 0, succeeded = 0, failed = 0;
  const errors: string[] = [];

  for (const language of LANGUAGES) {
    const missing = await db.execute(
      sql`SELECT p.id FROM problems p
          WHERE p.contentEn IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM aiSolutions a
            WHERE a.problemId = p.id AND a.language = ${language}
          )
          ORDER BY p.frontendId ASC`,
    );
    const rows = (Array.isArray(missing) && Array.isArray((missing as unknown[])[0])
      ? (missing as unknown[])[0]
      : missing) as Array<{ id: number }>;

    for (const row of rows) {
      processed++;
      try {
        await generateAiSolution(row.id, language);
        succeeded++;
      } catch (e) {
        failed++;
        const msg = `problem=${row.id} lang=${language}: ${(e as Error).message}`;
        if (errors.length < 10) errors.push(msg);
      }
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }

  return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, errorSummary: errors.length > 0 ? errors.join('; ') : undefined };
}
