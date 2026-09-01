import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { StudyModeSchema } from '@shared/studyTypes';
import { getDb } from '../db';
import { publicProcedure, router } from '../_core/trpc';
import { createDrizzleStudyRepository, StudyService } from '../study/service';

const LOCAL_USER_ID = 1;
const TaskKeySchema = z.enum(['review', 'dsa', 'problem', 'career']);

async function service() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database is unavailable' });
  return new StudyService(createDrizzleStudyRepository(db));
}

export const studyRouter = router({
  today: publicProcedure.query(async () => (await service()).today(LOCAL_USER_ID)),
  start: publicProcedure.input(z.object({ mode: StudyModeSchema }))
    .mutation(async ({ input }) => (await service()).startToday(LOCAL_USER_ID, input.mode)),
  setMode: publicProcedure.input(z.object({ sessionId: z.number().int().positive(), mode: StudyModeSchema }))
    .mutation(async ({ input }) => (await service()).setMode(LOCAL_USER_ID, input.sessionId, input.mode)),
  completeTask: publicProcedure.input(z.object({ sessionId: z.number().int().positive(), taskKey: TaskKeySchema }))
    .mutation(async ({ input }) => (await service()).completeTask(LOCAL_USER_ID, input.sessionId, input.taskKey)),
  completeSession: publicProcedure.input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ input }) => (await service()).completeSession(LOCAL_USER_ID, input.sessionId)),
});
