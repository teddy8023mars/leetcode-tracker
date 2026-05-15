import { describe, it, expect } from 'vitest';
import { appRouter } from '../routers';
import type { Request, Response } from 'express';

describe('appRouter assembly', () => {
  it('exposes problems/lists/companies/sync/judge sub-routers', () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    expect(caller.problems).toBeDefined();
    expect(caller.lists).toBeDefined();
    expect(caller.companies).toBeDefined();
    expect(caller.sync).toBeDefined();
    expect(caller.auth).toBeDefined();
    expect(caller.judge).toBeDefined();
  });
});
