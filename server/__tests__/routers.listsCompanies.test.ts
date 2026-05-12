import { describe, it, expect, vi } from 'vitest';
import { listsRouter } from '../routers/lists';
import { companiesRouter } from '../routers/companies';
import * as db from '../db';
import type { Request, Response } from 'express';

describe('routers/lists', () => {
  it('all returns rows from getAllProblemLists', async () => {
    vi.spyOn(db, 'getAllProblemLists').mockResolvedValue([
      { id: 1, slug: 'top-100-liked', titleEn: 'Hot 100' } as never,
    ]);
    vi.spyOn(db, 'countListItems').mockResolvedValue([{ listId: 1, count: 100 }]);
    const caller = listsRouter.createCaller({ user: null, req: {} as Request, res: {} as Response });
    const r = await caller.all();
    expect((r[0] as { slug: string }).slug).toBe('top-100-liked');
    // regression: BUG-13 — problemCount must be joined into the response
    expect((r[0] as { problemCount: number }).problemCount).toBe(100);
  });

  it('getBySlug returns problemCount from countListItems join (regression: BUG-13)', async () => {
    vi.spyOn(db, 'getProblemListBySlug').mockResolvedValue({ id: 7, slug: 's', titleEn: 'X' } as never);
    vi.spyOn(db, 'countListItems').mockResolvedValue([{ listId: 7, count: 42 }]);
    const caller = listsRouter.createCaller({ user: null, req: {} as Request, res: {} as Response });
    const r = await caller.getBySlug({ slug: 's' });
    expect(r).not.toBeNull();
    expect((r as { problemCount: number }).problemCount).toBe(42);
  });
});

describe('routers/companies', () => {
  it('all returns the static 25 companies sorted by region with problemCount joined (regression: BUG-15)', async () => {
    vi.spyOn(db, 'countCompanyTags').mockResolvedValue([
      { companySlug: 'google', count: 100 },
      { companySlug: 'amazon', count: 88 },
    ]);
    const caller = companiesRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    const r = await caller.all();
    expect(r).toHaveLength(25);
    expect(r.map((c) => c.region)).toEqual(expect.arrayContaining(['us', 'cn', 'sea']));
    const google = r.find((c) => c.slug === 'google')!;
    expect((google as unknown as { problemCount: number }).problemCount).toBe(100);
    const noTagCompany = r.find((c) => c.slug !== 'google' && c.slug !== 'amazon')!;
    // companies without tags must default to 0, not undefined
    expect((noTagCompany as unknown as { problemCount: number }).problemCount).toBe(0);
  });
});
