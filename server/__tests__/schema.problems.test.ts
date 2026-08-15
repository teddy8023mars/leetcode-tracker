import { describe, it, expect } from 'vitest';
import { problems, problemSolutions } from '../../drizzle/schema';
import { getTableConfig } from 'drizzle-orm/mysql-core';

describe('schema/problems', () => {
  it('problems table has expected columns', () => {
    const cfg = getTableConfig(problems);
    const names = cfg.columns.map(c => c.name).sort();
    expect(names).toEqual([
      'acRate','category','codeSnippetsJson','contentEn','contentFetchedAt','contentZh','contentZhSource',
      'createdAt','difficulty','exampleTestcases','frontendId','hintsJson',
      'id','metaUpdatedAt','paidOnly','similarQuestionsJson',
      'titleEn','titleSlug','titleZh','topicTagsJson',
    ].sort());
  });
  it('problemSolutions has unique on (problemId,source,language)', () => {
    const cfg = getTableConfig(problemSolutions);
    const uniques = cfg.uniqueConstraints.flatMap(u => u.columns.map(c => c.name));
    expect(uniques.sort()).toEqual(['language','problemId','source']);
  });
});
