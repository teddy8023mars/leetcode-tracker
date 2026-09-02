import { describe, expect, it, vi } from 'vitest';

import { ensureDesktopSchema } from '../_core/desktopSchema';

describe('desktop study schema upgrade', () => {
  it('is repeatable and executes only non-destructive guarded DDL', async () => {
    const queries: string[] = [];
    let timedReviewColumnExists = false;
    const end = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.startsWith('SELECT 1 AS present')) {
          return [timedReviewColumnExists ? [{ present: 1 }] : [], []] as const;
        }
        if (sql.startsWith('ALTER TABLE studySessions')) timedReviewColumnExists = true;
        return [[], []] as const;
      },
      end,
    }));

    await ensureDesktopSchema({ databaseUrl: 'mysql://root@localhost:3306/leetcode_tracker', connect });
    await ensureDesktopSchema({ databaseUrl: 'mysql://root@localhost:3306/leetcode_tracker', connect });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);
    expect(queries.filter((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS'))).toHaveLength(6);
    expect(queries.filter((sql) => sql.startsWith('SELECT 1 AS present'))).toHaveLength(2);
    expect(queries.filter((sql) => sql.startsWith('ALTER TABLE studySessions'))).toHaveLength(1);
    for (const sql of queries) {
      expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
    }
  });
});
