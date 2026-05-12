import { describe, it, expect } from 'vitest';
import { buildListSql } from '../db';

describe('db/buildListSql', () => {
  it('builds SQL for difficulty + companySlug filter with cursor', () => {
    const { sql, params } = buildListSql({
      filters: { difficulty: 'Medium', companySlug: 'google' },
      limit: 50,
      cursor: 100,
    });
    expect(sql).toContain('LEFT JOIN companyTags');
    expect(sql).toContain('difficulty = ?');
    expect(sql).toContain('companyTags.companySlug = ?');
    expect(sql).toContain('problems.id > ?');
    expect(sql).toContain('LIMIT 51');
    expect(params).toEqual(['google', 'Medium', 100]);
  });

  it('builds SQL with search across titleEn and titleZh', () => {
    const { sql, params } = buildListSql({
      filters: { search: 'two sum' },
      limit: 50,
    });
    expect(sql).toContain('LIKE');
    expect(params.some((p) => String(p).includes('two sum'))).toBe(true);
  });

  it('omits WHERE when no filters', () => {
    const { sql, params } = buildListSql({ filters: {}, limit: 20 });
    expect(sql).not.toContain('WHERE');
    expect(params).toEqual([]);
  });
});
