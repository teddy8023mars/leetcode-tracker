import { z } from 'zod';
import { router, publicProcedure } from '../_core/trpc';
import { ownerOnlyProcedure } from '../_core/ownerOnly';
import { getRecentSyncLogs } from '../db';
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
});
