import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

import { progressRouter } from '../routers/progress';
import * as db from '../db';

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
