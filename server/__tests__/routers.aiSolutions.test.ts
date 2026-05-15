import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../sync/aiGeneration', () => ({
  generateAiSolution: vi.fn().mockResolvedValue({
    id: 1,
    problemId: 1,
    language: 'en',
    approachMarkdown: '# Approach',
    complexityMarkdown: 'O(n)',
    pythonCode: 'class Solution: pass',
    javaCode: 'class Solution {}',
    cppCode: 'class Solution {};',
    pitfallsMarkdown: null,
    generatedAt: new Date(),
    modelVersion: 'test',
  }),
}));

import { aiSolutionsRouter } from '../routers/aiSolutions';
import * as db from '../db';
import * as aiGeneration from '../sync/aiGeneration';

const adminUser = {
  id: 1,
  openId: 'admin',
  name: 'Admin',
  email: null,
  loginMethod: null,
  role: 'admin' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const regularUser = { ...adminUser, id: 2, openId: 'user', role: 'user' as const };

describe('routers/aiSolutions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiGeneration.generateAiSolution).mockResolvedValue({
      id: 1,
      problemId: 1,
      language: 'en',
      approachMarkdown: '# Approach',
      complexityMarkdown: 'O(n)',
      pythonCode: 'class Solution: pass',
      javaCode: 'class Solution {}',
      cppCode: 'class Solution {};',
      pitfallsMarkdown: null,
      generatedAt: new Date(),
      modelVersion: 'test',
    });
  });

  describe('get', () => {
    it('returns null when DB unavailable', async () => {
      vi.spyOn(db, 'getDb').mockResolvedValue(null);
      const caller = aiSolutionsRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });
      const result = await caller.get({ problemId: 1, language: 'en' });
      expect(result).toBeNull();
    });
  });

  describe('generate', () => {
    it('rejects unauthenticated calls (user=null) with FORBIDDEN', async () => {
      const caller = aiSolutionsRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });
      await expect(
        caller.generate({ problemId: 1, language: 'en' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects non-admin users with FORBIDDEN', async () => {
      const caller = aiSolutionsRouter.createCaller({
        user: regularUser,
        req: {} as Request,
        res: {} as Response,
      });
      await expect(
        caller.generate({ problemId: 1, language: 'en' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('succeeds for admin users', async () => {
      const caller = aiSolutionsRouter.createCaller({
        user: adminUser,
        req: {} as Request,
        res: {} as Response,
      });
      const result = await caller.generate({ problemId: 1, language: 'en' });
      expect(aiGeneration.generateAiSolution).toHaveBeenCalledWith(1, 'en');
      expect(result).toMatchObject({
        problemId: 1,
        language: 'en',
        approachMarkdown: '# Approach',
      });
    });
  });
});
