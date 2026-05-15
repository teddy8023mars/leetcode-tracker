import { z } from 'zod';
import { and, eq, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { router, publicProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { userProgress } from '../../drizzle/schema';
import { ProgressStatusSchema } from '@shared/problemTypes';
import { sm2 } from '../progress/sm2';

const LOCAL_USER_ID = 1;

export const progressRouter = router({
  /**
   * Get a single userProgress row for the local user + problemId.
   * Returns null if not found or DB unavailable.
   */
  get: publicProcedure
    .input(z.object({ problemId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(userProgress)
        .where(
          and(
            eq(userProgress.userId, LOCAL_USER_ID),
            eq(userProgress.problemId, input.problemId),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    }),

  /**
   * Upsert progress for a problem.
   * - status='done': quality is required; runs SM-2 to compute next review interval.
   * - status='todo'/'reviewing': just updates the status.
   */
  update: publicProcedure
    .input(
      z.object({
        problemId: z.number().int().positive(),
        status: ProgressStatusSchema,
        quality: z.number().int().min(0).max(5).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { problemId, status, quality } = input;

      if (status === 'done' && quality === undefined) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'quality is required when status is done',
        });
      }

      const db = await getDb();
      if (!db) return null;

      if (status === 'done') {

        // Fetch existing progress to seed SM-2 inputs
        const existing = await db
          .select()
          .from(userProgress)
          .where(
            and(
              eq(userProgress.userId, LOCAL_USER_ID),
              eq(userProgress.problemId, problemId),
            ),
          )
          .limit(1);

        const prev = existing[0];
        const result = sm2({
          quality: quality!,
          repetition: prev?.reviewCount ?? 0,
          interval: prev?.reviewIntervalDays ?? 0,
          easinessFactor: prev ? parseFloat(prev.easinessFactor) : 2.5,
        });

        const now = new Date();
        const nextReviewAt = new Date(now.getTime() + result.interval * 24 * 60 * 60 * 1000);

        await db
          .insert(userProgress)
          .values({
            userId: LOCAL_USER_ID,
            problemId,
            status: 'done',
            reviewIntervalDays: result.interval,
            nextReviewAt,
            reviewCount: result.repetition,
            easinessFactor: String(result.easinessFactor),
            lastReviewedAt: now,
            firstCompletedAt: prev?.firstCompletedAt ?? now,
          })
          .onDuplicateKeyUpdate({
            set: {
              status: 'done',
              reviewIntervalDays: result.interval,
              nextReviewAt,
              reviewCount: result.repetition,
              easinessFactor: String(result.easinessFactor),
              lastReviewedAt: now,
              firstCompletedAt: prev?.firstCompletedAt ?? now,
            },
          });
      } else {
        await db
          .insert(userProgress)
          .values({
            userId: LOCAL_USER_ID,
            problemId,
            status,
          })
          .onDuplicateKeyUpdate({
            set: { status },
          });
      }

      // Return the updated row
      const updated = await db
        .select()
        .from(userProgress)
        .where(
          and(
            eq(userProgress.userId, LOCAL_USER_ID),
            eq(userProgress.problemId, problemId),
          ),
        )
        .limit(1);

      return updated[0] ?? null;
    }),

  /**
   * List problemIds that are due for review:
   * status='done' AND nextReviewAt <= NOW()
   */
  listDue: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({ problemId: userProgress.problemId })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, LOCAL_USER_ID),
          eq(userProgress.status, 'done'),
          lte(userProgress.nextReviewAt, new Date()),
        ),
      );

    return rows.map((r) => r.problemId);
  }),

  /**
   * List all userProgress rows for the local user.
   */
  listAll: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    return await db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, LOCAL_USER_ID));
  }),
});
