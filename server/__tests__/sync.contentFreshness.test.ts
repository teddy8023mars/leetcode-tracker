import { describe, it, expect } from 'vitest';
import { needsContentRefresh, CONTENT_FRESH_MS } from '../sync';

const NOW = new Date('2026-08-19T00:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000);

describe('needsContentRefresh', () => {
  it('refetches a problem that is not in the database yet', () => {
    expect(needsContentRefresh(undefined, NOW)).toBe(true);
  });

  it('refetches a problem whose content was never fetched', () => {
    expect(needsContentRefresh({ contentEn: null, contentFetchedAt: null }, NOW)).toBe(true);
    expect(
      needsContentRefresh({ contentEn: null, contentFetchedAt: daysAgo(1) }, NOW),
    ).toBe(true);
    expect(
      needsContentRefresh({ contentEn: '<p>x</p>', contentFetchedAt: null }, NOW),
    ).toBe(true);
  });

  it('skips a problem fetched inside the freshness window', () => {
    expect(
      needsContentRefresh({ contentEn: '<p>x</p>', contentFetchedAt: daysAgo(1) }, NOW),
    ).toBe(false);
  });

  it('refetches once the content has aged out', () => {
    expect(
      needsContentRefresh({ contentEn: '<p>x</p>', contentFetchedAt: daysAgo(30) }, NOW),
    ).toBe(true);
  });

  it('treats the window boundary as stale', () => {
    const at = new Date(NOW - CONTENT_FRESH_MS);
    expect(needsContentRefresh({ contentEn: '<p>x</p>', contentFetchedAt: at }, NOW)).toBe(true);
  });
});
