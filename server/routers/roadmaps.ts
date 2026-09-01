import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { CODE_THINKING_ROADMAP } from "@shared/roadmaps/codeThinking";
import type { RoadmapLeetCodeNode } from "@shared/roadmaps/types";
import { publicProcedure, router } from "../_core/trpc";
import { projectRoadmap } from "../roadmaps/projector";
import { loadRoadmapProblemStates } from "../roadmaps/repository";

const LOCAL_USER_ID = 1;

export const roadmapsRouter = router({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      if (input.slug !== CODE_THINKING_ROADMAP.slug) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Roadmap not found",
        });
      }

      const frontendIds = Array.from(
        new Set(
          CODE_THINKING_ROADMAP.sections.flatMap(section =>
            section.items
              .filter(
                (item): item is RoadmapLeetCodeNode => item.kind === "leetcode"
              )
              .map(item => item.frontendId)
          )
        )
      );
      const rows = await loadRoadmapProblemStates(
        frontendIds,
        ctx.user?.id ?? LOCAL_USER_ID
      );

      return projectRoadmap(CODE_THINKING_ROADMAP, rows);
    }),
});
