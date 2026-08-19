import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import { isLocalNoAuthMode } from "../_core/env";
import { syncRouter } from "../routers/sync";

vi.mock("../sync", () => ({ runSync: vi.fn(async () => {}) }));

const ORIGINAL = {
  OAUTH_SERVER_URL: process.env.OAUTH_SERVER_URL,
  NODE_ENV: process.env.NODE_ENV,
  LOCAL_DESKTOP: process.env.LOCAL_DESKTOP,
};

function setEnv(patch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => setEnv(ORIGINAL));

describe("isLocalNoAuthMode", () => {
  it("is true for a local dev server with no OAuth configured", () => {
    setEnv({
      OAUTH_SERVER_URL: undefined,
      NODE_ENV: "development",
      LOCAL_DESKTOP: undefined,
    });
    expect(isLocalNoAuthMode()).toBe(true);
  });

  it("is true for the packaged desktop build", () => {
    setEnv({
      OAUTH_SERVER_URL: undefined,
      NODE_ENV: "production",
      LOCAL_DESKTOP: "1",
    });
    expect(isLocalNoAuthMode()).toBe(true);
  });

  it("is false for a hosted deployment with OAuth configured", () => {
    setEnv({
      OAUTH_SERVER_URL: "https://oauth.example.com",
      NODE_ENV: "production",
      LOCAL_DESKTOP: undefined,
    });
    expect(isLocalNoAuthMode()).toBe(false);
  });
});

describe("sync in local no-auth mode", () => {
  beforeEach(() => {
    setEnv({
      OAUTH_SERVER_URL: undefined,
      NODE_ENV: "production",
      LOCAL_DESKTOP: "1",
    });
  });

  it("triggerManual runs without any logged-in user", async () => {
    const caller = syncRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    await expect(
      caller.triggerManual({ syncType: "manual" })
    ).resolves.toMatchObject({
      started: true,
      syncType: "manual",
    });
  });
});
