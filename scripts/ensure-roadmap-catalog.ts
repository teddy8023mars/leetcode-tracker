import { getDb } from '../server/db';
import { problems } from '../drizzle/schema';
import { CODE_THINKING_ROADMAP } from '../shared/roadmaps/codeThinking';
import type { RoadmapLeetCodeNode } from '../shared/roadmaps/types';
import { fetchQuestionCatalogEntry } from '../server/sync/leetcode';

function collectUniqueLeetCodeNodes(): RoadmapLeetCodeNode[] {
  const byFrontendId = new Map<number, RoadmapLeetCodeNode>();
  for (const item of CODE_THINKING_ROADMAP.sections.flatMap(section => section.items)) {
    if (item.kind === 'leetcode' && !byFrontendId.has(item.frontendId)) {
      byFrontendId.set(item.frontendId, item);
    }
  }
  return [...byFrontendId.values()];
}

function formatIds(ids: number[]): string {
  return ids.length ? ids.join(', ') : 'none';
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to repair the roadmap catalog.');
  }

  const db = await getDb();
  if (!db) throw new Error('Unable to connect to the roadmap catalog database.');

  const routeNodes = collectUniqueLeetCodeNodes();
  const existingRows = await db.select({ frontendId: problems.frontendId }).from(problems);
  const existingIds = new Set(existingRows.map(row => row.frontendId));
  const alreadyPresent = routeNodes
    .filter(node => existingIds.has(node.frontendId))
    .map(node => node.frontendId);
  const missingNodes = routeNodes.filter(node => !existingIds.has(node.frontendId));
  const inserted: number[] = [];
  const failed: number[] = [];

  for (const node of missingNodes) {
    try {
      const entry = await fetchQuestionCatalogEntry(node.titleSlug);
      if (!entry) throw new Error('LeetCode did not return a question.');
      if (entry.frontendId !== node.frontendId) {
        throw new Error(`LeetCode returned #${entry.frontendId} for route #${node.frontendId}.`);
      }
      await db
        .insert(problems)
        .values(entry)
        .onDuplicateKeyUpdate({ set: { metaUpdatedAt: new Date() } });
      inserted.push(node.frontendId);
    } catch (error) {
      failed.push(node.frontendId);
      console.error(
        `[roadmap:ensure-catalog] Failed #${node.frontendId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(`[roadmap:ensure-catalog] Inserted IDs: ${formatIds(inserted)}`);
  console.log(`[roadmap:ensure-catalog] Already present IDs: ${formatIds(alreadyPresent)}`);
  console.log(`[roadmap:ensure-catalog] Failed IDs: ${formatIds(failed)}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
