import { describe, expect, it } from 'vitest';

import {
  daysBetweenLocalDates,
  localDateKey,
  requiredTaskKeys,
  selectProblemCandidate,
  shouldGentleRestart,
  weekBounds,
} from '../study/schedule';

describe('study schedule', () => {
  it('does not require the removed micro-lesson in either study mode', () => {
    expect(requiredTaskKeys('standard')).toEqual(['review', 'problem', 'career']);
    expect(requiredTaskKeys('minimum')).toEqual(['review']);
  });

  it('recommends a gentle restart only after at least three missed local days', () => {
    expect(shouldGentleRestart(new Date(2026, 7, 28, 12), new Date(2026, 8, 1, 8))).toBe(true);
    expect(shouldGentleRestart(new Date(2026, 7, 30, 12), new Date(2026, 8, 1, 8))).toBe(false);
    expect(shouldGentleRestart(null, new Date(2026, 8, 1, 8))).toBe(false);
  });

  it('counts calendar dates without depending on time of day', () => {
    expect(daysBetweenLocalDates(new Date(2026, 7, 31, 23, 59), new Date(2026, 8, 1, 0, 1))).toBe(1);
    expect(localDateKey(new Date(2026, 8, 1, 23, 30))).toBe('2026-09-01');
  });

  it('uses the first unfinished problem and marks an all-done fallback as timed review', () => {
    const candidates = ['two-sum', 'group-anagrams'];
    expect(selectProblemCandidate(candidates, { 'two-sum': 'done' })).toEqual({ slug: 'group-anagrams', isTimedReview: false });
    expect(selectProblemCandidate(candidates, { 'two-sum': 'done', 'group-anagrams': 'done' })).toEqual({ slug: 'two-sum', isTimedReview: true });
  });

  it('uses local Monday and Sunday as weekly bounds', () => {
    const bounds = weekBounds(new Date(2026, 8, 1, 9));
    expect(bounds.start).toBe('2026-08-31');
    expect(bounds.end).toBe('2026-09-06');
  });
});
