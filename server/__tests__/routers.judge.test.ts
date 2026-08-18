import { describe, it, expect, vi } from 'vitest';
import { judgeRouter } from '../routers/judge';
import * as db from '../db';
import type { Request, Response } from 'express';

vi.mock('../judge/sandboxRunner', () => ({
  runUserCode: vi.fn().mockResolvedValue({
    ok: true, reason: 'ok',
    stdout: '{"i":0,"ok":true,"actual":[0,1],"error":null}\n__SUMMARY__{"passed":1,"total":1}',
    stderr: '', timeMs: 42, exitCode: 0, signal: null,
  }),
}));
vi.mock('../judge/testcaseGenerator', () => ({
  generateTestcaseSuite: vi.fn().mockResolvedValue({
    methodName: 'twoSum',
    cases: [{ input: [[2, 7, 11, 15], 9], expected: [0, 1] }],
    referenceSolution: '',
  }),
}));

const mockUser = {
  id: 1, openId: 'test-user', name: 'Test', email: null,
  loginMethod: null, role: 'user' as const,
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
};

describe('routers/judge', () => {
  it('run rejects unauthenticated calls (UNAUTHORIZED)', async () => {
    const caller = judgeRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    await expect(
      caller.run({ problemId: 1, language: 'python', code: 'def twoSum(): pass' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('listSubmissions rejects unauthenticated calls (UNAUTHORIZED)', async () => {
    const caller = judgeRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    await expect(
      caller.listSubmissions({ problemId: 1 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('getSubmission rejects unauthenticated calls (UNAUTHORIZED)', async () => {
    const caller = judgeRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    await expect(
      caller.getSubmission({ id: 1 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('listRecent rejects unauthenticated calls (UNAUTHORIZED)', async () => {
    const caller = judgeRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    await expect(
      caller.listRecent({ limit: 8 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('listSubmissions returns empty array when db unavailable', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const caller = judgeRouter.createCaller({
      user: mockUser,
      req: {} as Request,
      res: {} as Response,
    });
    const result = await caller.listSubmissions({ problemId: 1 });
    expect(result).toEqual([]);
  });

  it('listRecent returns empty array when db unavailable', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const caller = judgeRouter.createCaller({
      user: mockUser,
      req: {} as Request,
      res: {} as Response,
    });
    const result = await caller.listRecent({ limit: 8 });
    expect(result).toEqual([]);
  });
});
