import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV, isLocalNoAuthMode } from "./env";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const ownerOnlyProcedure = t.procedure.use(async ({ ctx, next }) => {
  // Local dev server / desktop build: single user, no login, no owner check.
  if (!isLocalNoAuthMode()) {
    if (!ctx.user)
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
    if (ctx.user.openId !== ENV.ownerOpenId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Owner-only operation",
      });
    }
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
