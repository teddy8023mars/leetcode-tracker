import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { User } from '../../drizzle/schema';

const localUser: User = {
  id: 1,
  openId: 'local-dev',
  name: 'Local Dev',
  email: null,
  loginMethod: 'local',
  role: 'admin',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  lastSignedIn: new Date('2026-01-01T00:00:00Z'),
};

describe('_core/context local dev auth', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('creates and returns a local-dev user in local development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OAUTH_SERVER_URL', '');
    const getDb = vi.fn().mockResolvedValue({});
    const getUserByOpenId = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(localUser);
    const upsertUser = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../db', () => ({ getDb, getUserByOpenId, upsertUser }));
    vi.doMock('../_core/sdk', () => ({
      sdk: { authenticateRequest: vi.fn().mockRejectedValue(new Error('missing session')) },
    }));

    const { createContext } = await import('../_core/context');
    const ctx = await createContext({
      req: { headers: {} } as Request,
      res: {} as Response,
    });

    expect(ctx.user).toEqual(localUser);
    expect(upsertUser).toHaveBeenCalledWith({
      openId: 'local-dev',
      name: 'Local Dev',
      email: null,
      loginMethod: 'local',
      role: 'admin',
    });
  });

  it('does not synthesize a local user when OAuth is configured', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OAUTH_SERVER_URL', 'https://oauth.example.test');
    const getDb = vi.fn().mockResolvedValue({});
    const getUserByOpenId = vi.fn();
    const upsertUser = vi.fn();

    vi.doMock('../db', () => ({ getDb, getUserByOpenId, upsertUser }));
    vi.doMock('../_core/sdk', () => ({
      sdk: { authenticateRequest: vi.fn().mockRejectedValue(new Error('missing session')) },
    }));

    const { createContext } = await import('../_core/context');
    const ctx = await createContext({
      req: { headers: {} } as Request,
      res: {} as Response,
    });

    expect(ctx.user).toBeNull();
    expect(upsertUser).not.toHaveBeenCalled();
  });
});
