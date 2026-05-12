import { describe, it, expect, beforeEach } from 'vitest';
import { parseCompanyCsv, __setFetchForLiquidslr } from '../sync/liquidslr';

describe('sync/liquidslr', () => {
  beforeEach(() => __setFetchForLiquidslr(undefined));

  it('parses a valid CSV', () => {
    const csv = [
      'Difficulty,Title,Frequency,Acceptance Rate,Link,Topics',
      'Easy,Two Sum,75.5,55.0,https://leetcode.com/problems/two-sum,"Array,Hash Table"',
      'Medium,Add Two Numbers,40.0,42.5,https://leetcode.com/problems/add-two-numbers,"Linked List,Math"',
    ].join('\n');
    const rows = parseCompanyCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      difficulty: 'Easy',
      title: 'Two Sum',
      frequency: 75.5,
      titleSlug: 'two-sum',
    });
  });

  it('drops invalid rows but keeps valid ones', () => {
    const csv = [
      'Difficulty,Title,Frequency,Acceptance Rate,Link,Topics',
      ',No difficulty,1,1,https://leetcode.com/problems/x,',
      'Easy,Two Sum,75.5,55.0,https://leetcode.com/problems/two-sum,Array',
    ].join('\n');
    const rows = parseCompanyCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Two Sum');
  });

  it('rejects whole CSV when failure rate >= 50%', () => {
    const csv = [
      'Difficulty,Title,Frequency,Acceptance Rate,Link,Topics',
      ',bad1,1,1,https://leetcode.com/problems/a,',
      ',bad2,1,1,https://leetcode.com/problems/b,',
      'Easy,Good,1,1,https://leetcode.com/problems/c,',
    ].join('\n');
    expect(() => parseCompanyCsv(csv)).toThrow(/failure rate/i);
  });

  it('extracts titleSlug from leetcode link', () => {
    const csv = [
      'Difficulty,Title,Frequency,Acceptance Rate,Link,Topics',
      'Easy,Foo,1,1,https://leetcode.com/problems/word-ladder/,Array',
    ].join('\n');
    expect(parseCompanyCsv(csv)[0].titleSlug).toBe('word-ladder');
  });
});
