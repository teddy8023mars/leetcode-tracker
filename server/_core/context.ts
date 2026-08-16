import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { getUserByOpenId } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

async function getLocalDevUser(): Promise<User | null> {
  if (ENV.oAuthServerUrl) return null;
  if (ENV.isProduction && !ENV.isLocalDesktop) return null;
  return (await getUserByOpenId("local-dev")) ?? null;
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
    user = await getLocalDevUser();
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
