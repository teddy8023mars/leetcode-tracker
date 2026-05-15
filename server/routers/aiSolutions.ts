import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { router, publicProcedure, adminProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { aiSolutions } from '../../drizzle/schema';
import { LanguageSchema } from '@shared/problemTypes';
import { generateAiSolution } from '../sync/aiGeneration';

export const aiSolutionsRouter = router({
  /**
   * Get a cached AI solution for a problem in the given language.
   * Returns the row or null if not yet generated.
   */
  get: publicProcedure
    .input(
      z.object({
        problemId: z.number().int().positive(),
        language: LanguageSchema,
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(aiSolutions)
        .where(
          and(
            eq(aiSolutions.problemId, input.problemId),
            eq(aiSolutions.language, input.language),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    }),

  /**
   * Generate (or regenerate) an AI solution for a problem.
   * Admin-only; triggers the LLM and caches the result.
   */
  generate: adminProcedure
    .input(
      z.object({
        problemId: z.number().int().positive(),
        language: LanguageSchema,
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await generateAiSolution(input.problemId, input.language);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('already in progress')) {
          throw new TRPCError({ code: 'CONFLICT', message });
        }
        if (message.includes('not found')) {
          throw new TRPCError({ code: 'NOT_FOUND', message });
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
      }
    }),
});
