import { and, eq, inArray } from "drizzle-orm";

import { problems, userProgress } from "../../drizzle/schema";
import { getDb } from "../db";
import type { RoadmapProblemState } from "./projector";

export async function loadRoadmapProblemStates(
  frontendIds: number[],
  userId: number
): Promise<RoadmapProblemState[]> {
  const uniqueIds = Array.from(new Set(frontendIds));
  if (uniqueIds.length === 0) return [];

  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: problems.id,
      frontendId: problems.frontendId,
      titleSlug: problems.titleSlug,
      titleEn: problems.titleEn,
      titleZh: problems.titleZh,
      difficulty: problems.difficulty,
      status: userProgress.status,
    })
    .from(problems)
    .leftJoin(
      userProgress,
      and(
        eq(userProgress.problemId, problems.id),
        eq(userProgress.userId, userId)
      )
    )
    .where(inArray(problems.frontendId, uniqueIds));
}
