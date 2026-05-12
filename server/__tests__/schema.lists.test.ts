import { describe, it, expect } from 'vitest';
import { companyTags, problemLists, problemListItems } from '../../drizzle/schema';
import { getTableConfig } from 'drizzle-orm/mysql-core';

describe('schema/lists', () => {
  it('companyTags has unique (problemId,companySlug,timeframe)', () => {
    const cols = getTableConfig(companyTags).uniqueConstraints
      .flatMap(u => u.columns.map(c => c.name)).sort();
    expect(cols).toEqual(['companySlug','problemId','timeframe']);
  });
  it('problemLists.slug is unique', () => {
    const cfg = getTableConfig(problemLists);
    expect(cfg.columns.find(c => c.name === 'slug')?.isUnique).toBe(true);
  });
  it('problemListItems has unique (listId,problemId)', () => {
    const cols = getTableConfig(problemListItems).uniqueConstraints
      .flatMap(u => u.columns.map(c => c.name)).sort();
    expect(cols).toEqual(['listId','problemId']);
  });
});
