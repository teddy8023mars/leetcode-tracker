import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { syncRouter } from "../routers/sync";
import * as db from "../db";
import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";

describe("routers/sync", () => {
  // Auth checks only apply to hosted deployments; a local/desktop build has no
  // login at all (see isLocalNoAuthMode).
  const originalOAuthUrl = process.env.OAUTH_SERVER_URL;
  beforeEach(() => {
    process.env.OAUTH_SERVER_URL = "https://oauth.example.com";
  });
  afterEach(() => {
    if (originalOAuthUrl === undefined) delete process.env.OAUTH_SERVER_URL;
    else process.env.OAUTH_SERVER_URL = originalOAuthUrl;
  });

  it("status returns recent logs", async () => {
    vi.spyOn(db, "getRecentSyncLogs").mockResolvedValue([
      { id: 1, syncType: "manual", status: "success" } as never,
    ]);
    const caller = syncRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    const r = await caller.status();
    expect((r[0] as { syncType: string }).syncType).toBe("manual");
  });

  it("triggerManual without user throws UNAUTHORIZED", async () => {
    const caller = syncRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    await expect(
      caller.triggerManual({ syncType: "manual" })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("triggerManual with non-owner user throws FORBIDDEN", async () => {
    const caller = syncRouter.createCaller({
      user: {
        id: 99,
        openId: "not-owner",
        name: null,
        email: null,
        loginMethod: null,
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as User,
      req: {} as Request,
      res: {} as Response,
    });
    await expect(
      caller.triggerManual({ syncType: "manual" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
