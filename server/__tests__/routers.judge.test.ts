import { describe, it, expect, vi } from 'vitest';
import { judgeRouter } from '../routers/judge';
import * as db from '../db';
import { runUserCode } from '../judge/sandboxRunner';
import { buildOfficialExampleSuite, generateTestcaseSuite } from '../judge/testcaseGenerator';
import type { Request, Response } from 'express';

vi.mock('../judge/sandboxRunner', () => ({
  runUserCode: vi.fn().mockResolvedValue({
    ok: true, reason: 'ok',
    stdout: '{"i":0,"ok":true,"actual":[0,1],"error":null}\n__SUMMARY__{"passed":1,"total":1}',
    stderr: '', timeMs: 42, exitCode: 0, signal: null,
  }),
}));
vi.mock('../judge/testcaseGenerator', () => ({
  buildOfficialExampleSuite: vi.fn(),
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
  it('runs official examples with debug output without creating a submission', async () => {
    const limit = vi.fn().mockResolvedValueOnce([{
      id: 704,
      titleSlug: 'binary-search',
      titleEn: 'Binary Search',
      titleZh: '二分查找',
      contentEn: 'Example 1',
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [],
      exampleTestcases: '[-1,0,3,5,9,12]\n9',
    }]);
    const insert = vi.fn();
    const fakeDb = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) })),
      insert,
    };
    vi.spyOn(db, 'getDb').mockResolvedValue(fakeDb as never);
    vi.spyOn(db, 'markProblemSolved').mockResolvedValue(undefined);
    vi.mocked(buildOfficialExampleSuite).mockReturnValueOnce({
      methodName: 'search',
      cases: [{ input: [[-1, 0, 3, 5, 9, 12], 9], expected: 4 }],
      source: 'official-examples',
    });
    vi.mocked(runUserCode).mockResolvedValueOnce({
      ok: true,
      reason: 'ok',
      stdout: '{"i":0,"ok":true,"actual":4,"elapsedMs":1,"error":null,"stdout":"nums = [-1, 0, 3, 5, 9, 12]\\n"}\n{"summary":true,"passed":1,"total":1}',
      stderr: '',
      timeMs: 5,
      exitCode: 0,
      signal: null,
    });
    const caller = judgeRouter.createCaller({
      user: mockUser,
      req: {} as Request,
      res: {} as Response,
    });
    const runExamples = (caller as unknown as { runExamples?: Function }).runExamples;

    expect(runExamples).toBeTypeOf('function');
    const result = await runExamples!({
      problemId: 704,
      language: 'python',
      code: 'class Solution: pass',
    });

    expect(result).toMatchObject({
      mode: 'run',
      verdict: 'accepted',
      passedCount: 1,
      totalCount: 1,
      cases: [{
        input: [[-1, 0, 3, 5, 9, 12], 9],
        expected: 4,
        actual: 4,
        stdout: 'nums = [-1, 0, 3, 5, 9, 12]\n',
      }],
    });
    expect(insert).not.toHaveBeenCalled();
    expect(db.markProblemSolved).not.toHaveBeenCalled();
  });

  it('preserves suite judging metadata through the real submit route', async () => {
    const limit = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 1,
        titleSlug: 'reverse-string',
        titleEn: 'Reverse String',
        titleZh: null,
        contentEn: '',
        contentZh: null,
        difficulty: 'Easy',
        codeSnippetsJson: [],
        exampleTestcases: '["h","i"]',
      }]);
    const fakeDb = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 99 }]) })),
    };
    vi.spyOn(db, 'getDb').mockResolvedValue(fakeDb as never);
    vi.spyOn(db, 'markProblemSolved').mockResolvedValue(undefined);
    vi.mocked(generateTestcaseSuite).mockResolvedValueOnce({
      methodName: 'reverseString',
      cases: [{ input: [['h', 'i']], expected: ['i', 'h'] }],
      source: 'official-examples',
      comparison: 'unordered',
      resultFromArg: 0,
      className: 'FixtureClass',
      inputAdapter: 'linked-list-cycle',
      resultAdapter: 'linked-list-node-index',
      validator: 'remove-element',
    });
    vi.mocked(runUserCode).mockImplementationOnce(async ({ stdin }) => {
      const payload = JSON.parse(stdin) as Record<string, unknown>;
      const preserved =
        payload.comparison === 'unordered' &&
        payload.resultFromArg === 0 &&
        payload.className === 'FixtureClass' &&
        payload.inputAdapter === 'linked-list-cycle' &&
        payload.resultAdapter === 'linked-list-node-index' &&
        payload.validator === 'remove-element';
      return {
        ok: true,
        reason: 'ok',
        stdout: preserved
          ? '{"i":0,"ok":true,"actual":["i","h"],"elapsedMs":1,"error":null}\n{"summary":true,"passed":1,"total":1}'
          : '{"i":0,"ok":false,"actual":null,"elapsedMs":1,"error":null}\n{"summary":true,"passed":0,"total":1}',
        stderr: '',
        timeMs: 5,
        exitCode: 0,
        signal: null,
      };
    });
    const caller = judgeRouter.createCaller({
      user: mockUser,
      req: {} as Request,
      res: {} as Response,
    });

    const result = await caller.run({
      problemId: 1,
      language: 'python',
      code: 'class Solution: pass',
    });

    expect(result.stderr).toBe('');
    expect(result.verdict).toBe('accepted');
  });

  it('enriches a legacy cached suite with offline semantic comparison metadata', async () => {
    const limit = vi.fn()
      .mockResolvedValueOnce([{
        problemId: 1,
        suiteJson: {
          methodName: 'twoSum',
          cases: [{ input: [[2, 7], 9], expected: [0, 1] }],
          source: 'llm',
        },
        source: 'llm',
      }])
      .mockResolvedValueOnce([{
        id: 1,
        titleSlug: 'two-sum',
        titleEn: 'Two Sum',
        titleZh: null,
        contentEn: 'You may return the answer in any order.\nOutput: [0,1]',
        contentZh: null,
        difficulty: 'Easy',
        codeSnippetsJson: [],
        exampleTestcases: '[2,7]\n9',
      }]);
    const fakeDb = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 100 }]) })),
    };
    vi.spyOn(db, 'getDb').mockResolvedValue(fakeDb as never);
    vi.mocked(buildOfficialExampleSuite).mockReturnValueOnce({
      methodName: 'twoSum',
      cases: [{ input: [[2, 7], 9], expected: [0, 1] }],
      source: 'official-examples',
      comparison: 'unordered',
    });
    vi.mocked(runUserCode).mockImplementationOnce(async ({ stdin }) => {
      const payload = JSON.parse(stdin) as Record<string, unknown>;
      const passed = payload.comparison === 'unordered';
      return {
        ok: true,
        reason: 'ok',
        stdout: `{"i":0,"ok":${passed},"actual":[1,0],"elapsedMs":1,"error":null}\n{"summary":true,"passed":${passed ? 1 : 0},"total":1}`,
        stderr: '',
        timeMs: 5,
        exitCode: 0,
        signal: null,
      };
    });
    const caller = judgeRouter.createCaller({
      user: mockUser,
      req: {} as Request,
      res: {} as Response,
    });

    const result = await caller.run({
      problemId: 1,
      language: 'python',
      code: 'class Solution: pass',
    });

    expect(result.verdict).toBe('accepted');
  });

  it('rejects contradictory summary output instead of accepting a forged pass', async () => {
    const limit = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 1,
        titleSlug: 'two-sum',
        titleEn: 'Two Sum',
        titleZh: null,
        contentEn: '',
        contentZh: null,
        difficulty: 'Easy',
        codeSnippetsJson: [],
        exampleTestcases: '[2,7]\n9',
      }]);
    const fakeDb = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 101 }]) })),
    };
    vi.spyOn(db, 'getDb').mockResolvedValue(fakeDb as never);
    vi.mocked(generateTestcaseSuite).mockResolvedValueOnce({
      methodName: 'twoSum',
      cases: [{ input: [[2, 7], 9], expected: [0, 1] }],
      source: 'official-examples',
    });
    vi.mocked(runUserCode).mockResolvedValueOnce({
      ok: true,
      reason: 'ok',
      stdout: [
        '{"i":0,"ok":false,"actual":[0,0],"elapsedMs":1,"error":null}',
        '{"summary":true,"passed":0,"total":1}',
        '{"summary":true,"passed":1,"total":1}',
      ].join('\n'),
      stderr: '',
      timeMs: 5,
      exitCode: 0,
      signal: null,
    });
    const caller = judgeRouter.createCaller({
      user: mockUser,
      req: {} as Request,
      res: {} as Response,
    });

    const result = await caller.run({
      problemId: 1,
      language: 'python',
      code: 'class Solution: pass',
    });

    expect(result.verdict).toBe('runtime_error');
  });

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
