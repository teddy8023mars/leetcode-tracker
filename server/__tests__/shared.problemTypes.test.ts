import { describe, it, expect } from 'vitest';
import { DIFFICULTIES, SYNC_TYPES, SyncTypeSchema, DifficultySchema } from '@shared/problemTypes';

describe('shared/problemTypes', () => {
  it('exposes the 3 difficulties', () => {
    expect(DIFFICULTIES).toEqual(['Easy', 'Medium', 'Hard']);
  });
  it('exposes the 10 sync types', () => {
    expect(SYNC_TYPES).toEqual([
      'initial-bootstrap',
      'daily-sync-lists',
      'daily-sync-meta',
      'daily-sync-companies',
      'manual',
      'detail-fetch',
      'ai-pregenerate',
      'ai-on-demand',
      'db-backup',
      'probe-leetcode-cn',
    ]);
  });
  it('parses a valid sync type', () => {
    expect(SyncTypeSchema.parse('manual')).toBe('manual');
  });
  it('rejects an invalid difficulty', () => {
    expect(() => DifficultySchema.parse('Trivial')).toThrow();
  });
});
