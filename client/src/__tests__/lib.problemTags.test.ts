import { describe, it, expect } from 'vitest';
import { collectTagOptions, problemHasTag } from '@/lib/problemTags';

const p = (topic: { name: string; slug: string }[], sql: { name: string; slug: string }[] = []) => ({
  topicTagsJson: topic,
  sqlTagsJson: sql,
});

describe('lib/problemTags', () => {
  it('collectTagOptions merges topic tags and sql tags with counts, sorted by count desc', () => {
    const items = [
      p([{ name: 'Array', slug: 'array' }]),
      p([{ name: 'Array', slug: 'array' }], [{ name: 'Joins', slug: 'sql-join' }]),
      p([], [{ name: 'Joins', slug: 'sql-join' }]),
      p([], [{ name: 'Joins', slug: 'sql-join' }]),
    ];
    expect(collectTagOptions(items)).toEqual([
      { slug: 'sql-join', name: 'Joins', count: 3 },
      { slug: 'array', name: 'Array', count: 2 },
    ]);
  });

  it('problemHasTag matches slugs in either tag array', () => {
    const item = p([{ name: 'Array', slug: 'array' }], [{ name: 'Joins', slug: 'sql-join' }]);
    expect(problemHasTag(item, 'array')).toBe(true);
    expect(problemHasTag(item, 'sql-join')).toBe(true);
    expect(problemHasTag(item, 'sql-window')).toBe(false);
    expect(problemHasTag({ topicTagsJson: null, sqlTagsJson: null }, 'array')).toBe(false);
  });
});
