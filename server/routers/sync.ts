import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, publicProcedure } from '../_core/trpc';
import { ownerOnlyProcedure } from '../_core/ownerOnly';
import { getRecentSyncLogs, getDb } from '../db';
import { syncLogs, aiGenerationLocks } from '../../drizzle/schema';
import { SyncTypeSchema } from '@shared/problemTypes';
import { runSync } from '../sync';

export const syncRouter = router({
  status: publicProcedure.query(async () => await getRecentSyncLogs(50)),
  triggerManual: ownerOnlyProcedure
    .input(z.object({ syncType: SyncTypeSchema }))
    .mutation(async ({ input }) => {
      runSync(input.syncType).catch((e) => console.error('[sync.triggerManual]', e));
      return { started: true, syncType: input.syncType };
    }),
  cancel: ownerOnlyProcedure
    .input(z.object({ syncLogId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { cancelled: false };
      await db.update(syncLogs)
        .set({ status: 'failed', finishedAt: new Date(), errorSummary: 'Cancelled by user' })
        .where(eq(syncLogs.id, input.syncLogId));
      await db.delete(aiGenerationLocks).catch(() => {});
      return { cancelled: true };
    }),
});
