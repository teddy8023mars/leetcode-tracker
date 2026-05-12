import { describe, it, expect, vi } from 'vitest';
import { problemsRouter } from '../routers/problems';
import * as db from '../db';
import type { Request, Response } from 'express';

describe('routers/problems', () => {
  it('list calls listProblemsQuery with given filters', async () => {
    vi.spyOn(db, 'listProblemsQuery').mockResolvedValue({
      items: [{ id: 1, titleSlug: 'two-sum' } as never],
      nextCursor: undefined,
    });
    const caller = problemsRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    const r = await caller.list({ filters: { difficulty: 'Easy' }, limit: 10 });
    expect((r.items[0] as { titleSlug: string }).titleSlug).toBe('two-sum');
    expect(db.listProblemsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { difficulty: 'Easy' }, limit: 10 }),
    );
  });

  it('getBySlug returns null when not found', async () => {
    vi.spyOn(db, 'getProblemBySlug').mockResolvedValue(null);
    const caller = problemsRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    const r = await caller.getBySlug({ titleSlug: 'unknown' });
    expect(r).toBeNull();
  });
});
