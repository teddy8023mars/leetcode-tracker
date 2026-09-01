import { describe, expect, it, vi } from 'vitest';

import { ensureDesktopSchema } from '../_core/desktopSchema';

describe('desktop study schema upgrade', () => {
  it('is repeatable and executes only non-destructive guarded DDL', async () => {
    const queries: string[] = [];
    const end = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({
      query: async (sql: string) => { queries.push(sql); return [[], []] as const; },
      end,
    }));

    await ensureDesktopSchema({ databaseUrl: 'mysql://root@localhost:3306/leetcode_tracker', connect });
    await ensureDesktopSchema({ databaseUrl: 'mysql://root@localhost:3306/leetcode_tracker', connect });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);
    expect(queries).toHaveLength(6);
    for (const sql of queries) {
      expect(sql).toMatch(/^CREATE TABLE IF NOT EXISTS/);
      expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
    }
  });
});
