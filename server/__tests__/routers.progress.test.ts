import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

import { progressRouter } from '../routers/progress';
import * as db from '../db';
import * as studyService from '../study/service';

describe('routers/progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('returns null when DB unavailable', async () => {
      vi.spyOn(db, 'getDb').mockResolvedValue(null);
      const caller = progressRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });
      const result = await caller.get({ problemId: 1 });
      expect(result).toBeNull();
    });
  });

  describe('dashboard', () => {
    it('returns empty summary when DB unavailable', async () => {
      vi.spyOn(db, 'getDb').mockResolvedValue(null);
      const caller = progressRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });
      const result = await caller.dashboard();
      expect(result).toEqual({
        counts: { todo: 0, reviewing: 0, done: 0 },
        dueProblems: [],
        focusProblems: [],
      });
    });

    it('returns counts plus ordered due and focus queues', async () => {
      const rows = [
        {
          problemId: 3,
          status: 'done',
          nextReviewAt: new Date('2000-01-02T00:00:00Z'),
          reviewCount: 1,
          frontendId: 3,
          titleSlug: 'three',
          titleEn: 'Three',
          titleZh: null,
          difficulty: 'Easy',
        },
        {
          problemId: 1,
          status: 'reviewing',
          nextReviewAt: null,
          reviewCount: 0,
          frontendId: 1,
          titleSlug: 'one',
          titleEn: 'One',
          titleZh: null,
          difficulty: 'Medium',
        },
        {
          problemId: 2,
          status: 'todo',
          nextReviewAt: null,
          reviewCount: 0,
          frontendId: 2,
          titleSlug: 'two',
          titleEn: 'Two',
          titleZh: null,
          difficulty: 'Hard',
        },
        {
          problemId: 4,
          status: 'done',
          nextReviewAt: new Date('2999-01-01T00:00:00Z'),
          reviewCount: 1,
          frontendId: 4,
          titleSlug: 'four',
          titleEn: 'Four',
          titleZh: null,
          difficulty: 'Easy',
        },
        {
          problemId: 5,
          status: 'done',
          nextReviewAt: new Date('2000-01-01T00:00:00Z'),
          reviewCount: 2,
          frontendId: 5,
          titleSlug: 'five',
          titleEn: 'Five',
          titleZh: null,
          difficulty: 'Medium',
        },
      ];
      vi.spyOn(db, 'getDb').mockResolvedValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(rows),
            }),
          }),
        }),
      } as never);
      const caller = progressRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });

      const result = await caller.dashboard();

      expect(result.counts).toEqual({ todo: 1, reviewing: 1, done: 3 });
      expect(result.dueProblems.map((p) => p.problemId)).toEqual([5, 3]);
      expect(result.focusProblems.map((p) => p.problemId)).toEqual([1, 2]);
    });
  });

  describe('update', () => {
    it('throws BAD_REQUEST when status=done without quality', async () => {
      // DB mock not needed — validation error should occur before DB access
      vi.spyOn(db, 'getDb').mockResolvedValue(null);
      const caller = progressRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });
      await expect(
        caller.update({ problemId: 1, status: 'done' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('syncs a completed problem into the active study session', async () => {
      const limit = vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 7, userId: 1, problemId: 42, status: 'done' }]);
      const fakeDb = {
        select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ onDuplicateKeyUpdate: vi.fn(async () => undefined) })),
        })),
      };
      vi.spyOn(db, 'getDb').mockResolvedValue(fakeDb as never);
      const sync = vi.spyOn(studyService, 'completeMatchingStudyProblemTasks').mockResolvedValue(1);
      const caller = progressRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });

      const result = await caller.update({ problemId: 42, status: 'done', quality: 4 });

      expect(result?.status).toBe('done');
      expect(sync).toHaveBeenCalledWith(fakeDb, 1, 42, expect.any(Date));
    });
  });

  describe('listDue', () => {
    it('returns empty array when DB unavailable', async () => {
      vi.spyOn(db, 'getDb').mockResolvedValue(null);
      const caller = progressRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });
      const result = await caller.listDue();
      expect(result).toEqual([]);
    });
  });

  describe('listAll', () => {
    it('returns empty array when DB unavailable', async () => {
      vi.spyOn(db, 'getDb').mockResolvedValue(null);
      const caller = progressRouter.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });
      const result = await caller.listAll();
      expect(result).toEqual([]);
    });
  });
});
