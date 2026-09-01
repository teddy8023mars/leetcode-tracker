import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { problemsRouter } from "./routers/problems";
import { listsRouter } from "./routers/lists";
import { companiesRouter } from "./routers/companies";
import { syncRouter } from "./routers/sync";
import { judgeRouter } from "./routers/judge";
import { aiSolutionsRouter } from "./routers/aiSolutions";
import { progressRouter } from "./routers/progress";
import { studyRouter } from "./routers/study";
import { roadmapsRouter } from "./routers/roadmaps";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  problems: problemsRouter,
  lists: listsRouter,
  companies: companiesRouter,
  sync: syncRouter,
  judge: judgeRouter,
  aiSolutions: aiSolutionsRouter,
  progress: progressRouter,
  study: studyRouter,
  roadmaps: roadmapsRouter,
});

export type AppRouter = typeof appRouter;
