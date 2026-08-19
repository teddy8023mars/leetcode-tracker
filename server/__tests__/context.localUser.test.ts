import { describe, it, expect, vi, afterEach } from "vitest";
import type { User } from "../../drizzle/schema";

const getUserByOpenId = vi.fn();
const upsertUser = vi.fn();

vi.mock("../db", () => ({
  getUserByOpenId: (...args: unknown[]) => getUserByOpenId(...args),
  upsertUser: (...args: unknown[]) => upsertUser(...args),
}));

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => {
      throw new Error("no session");
    }),
  },
}));

const ORIGINAL = {
  OAUTH_SERVER_URL: process.env.OAUTH_SERVER_URL,
  NODE_ENV: process.env.NODE_ENV,
  LOCAL_DESKTOP: process.env.LOCAL_DESKTOP,
};

afterEach(() => {
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.clearAllMocks();
});

const localUser = { id: 1, openId: "local-dev", role: "admin" } as User;

describe("createContext in local no-auth mode", () => {
  it("provisions the local user on first run instead of leaving it logged out", async () => {
    delete process.env.OAUTH_SERVER_URL;
    process.env.NODE_ENV = "production";
    process.env.LOCAL_DESKTOP = "1";
    getUserByOpenId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(localUser);

    const { createContext } = await import("../_core/context");
    const ctx = await createContext({ req: {}, res: {} } as never);

    expect(upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ openId: "local-dev", role: "admin" })
    );
    expect(ctx.user).toEqual(localUser);
  });
});
