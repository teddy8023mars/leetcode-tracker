import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { isLocalNoAuthMode } from "./env";
import { getUserByOpenId, upsertUser } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** openId of the implicit single user of a local dev server / desktop build. */
export const LOCAL_USER_OPEN_ID = "local-dev";

/**
 * Local/desktop builds have no login, so every request runs as one implicit
 * user. Create that user on first run — a fresh database (or the bundled seed
 * snapshot, which carries no user rows) has none, which would otherwise leave
 * the app permanently logged out and block sync.
 */
async function getLocalUser(): Promise<User | null> {
  if (!isLocalNoAuthMode()) return null;

  const existing = await getUserByOpenId(LOCAL_USER_OPEN_ID);
  if (existing) return existing;

  try {
    await upsertUser({
      openId: LOCAL_USER_OPEN_ID,
      name: "Local",
      loginMethod: "local",
      role: "admin",
    });
  } catch (error) {
    console.error("[context] Failed to provision local user:", error);
    return null;
  }

  return (await getUserByOpenId(LOCAL_USER_OPEN_ID)) ?? null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user) {
    user = await getLocalUser();
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
