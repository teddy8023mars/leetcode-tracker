import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { syncLogs } from '../../drizzle/schema';
import { generateAiSolution } from './aiGeneration';
import type { TaskResult } from './orchestrator';
import type { Language } from '@shared/problemTypes';

const LANGUAGES: Language[] = ['en', 'zh'];
const CONCURRENCY = 5;

async function updateRunningLog(processed: number, succeeded: number, failed: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(syncLogs)
    .set({ itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed })
    .where(and(eq(syncLogs.syncType, 'ai-pregenerate'), eq(syncLogs.status, 'running')))
    .catch(() => {});
}

export async function taskAiPregenerate(): Promise<TaskResult> {
  const db = await getDb();
  if (!db) return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, errorSummary: 'DB unavailable' };

  let processed = 0, succeeded = 0, failed = 0;
  const errors: string[] = [];

  type Job = { problemId: number; language: Language };
  const jobs: Job[] = [];

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
    for (const row of rows) jobs.push({ problemId: row.id, language });
  }

  async function runJob(job: Job) {
    try {
      await generateAiSolution(job.problemId, job.language);
      succeeded++;
    } catch (e) {
      failed++;
      const msg = `problem=${job.problemId} lang=${job.language}: ${(e as Error).message}`;
      if (errors.length < 10) errors.push(msg);
    }
    processed++;
    if (processed % CONCURRENCY === 0 || processed === jobs.length) {
      await updateRunningLog(processed, succeeded, failed);
    }
  }

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(runJob));
  }

  return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, errorSummary: errors.length > 0 ? errors.join('; ') : undefined };
}
