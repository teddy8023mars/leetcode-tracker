import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, publicProcedure } from '../_core/trpc';
import { listProblemsQuery, getProblemBySlug, getDb, getCompanyTagsForProblem } from '../db';
import { problemSolutions } from '../../drizzle/schema';
import { DifficultySchema, ProgressStatusSchema } from '@shared/problemTypes';

const FiltersSchema = z.object({
  difficulty: DifficultySchema.optional(),
  listSlug: z.string().optional(),
  companySlug: z.string().optional(),
  search: z.string().optional(),
  paidOnly: z.boolean().optional(),
  status: ProgressStatusSchema.optional(),
});

export const problemsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        filters: FiltersSchema.default({}),
        limit: z.number().min(1).max(200).default(50),
        cursor: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await listProblemsQuery({
        filters: input.filters,
        limit: input.limit,
        cursor: input.cursor,
        userId: ctx.user?.id ?? 1,
      });
    }),
  getBySlug: publicProcedure
    .input(z.object({ titleSlug: z.string().min(1) }))
    .query(async ({ input }) => {
      return await getProblemBySlug(input.titleSlug);
    }),
  solutions: publicProcedure
    .input(z.object({ problemId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select()
        .from(problemSolutions)
        .where(eq(problemSolutions.problemId, input.problemId));
    }),
  companyTags: publicProcedure
    .input(z.object({ problemId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await getCompanyTagsForProblem(input.problemId);
    }),
});
