import { describe, expect, it } from 'vitest';

import {
  navigationOriginFromHref,
  problemNavigationState,
  readNavigationOrigin,
} from '@/lib/appNavigation';

describe('app navigation origins', () => {
  it.each([
    ['/today', { section: 'today', href: '/today' }],
    ['/review?queue=due', { section: 'review', href: '/review?queue=due' }],
    ['/problems?company=google#results', { section: 'problems', href: '/problems?company=google#results' }],
    ['/roadmap/code-thinking#section-array', { section: 'roadmap', href: '/roadmap/code-thinking#section-array' }],
    ['/sync', { section: 'sync', href: '/sync' }],
    ['/settings', { section: 'settings', href: '/settings' }],
  ] as const)('recognizes the entry section for %s', (href, expected) => {
    expect(navigationOriginFromHref(href)).toEqual(expected);
  });

  it.each([
    'https://example.com/review',
    '//example.com/review',
    '/problems/two-sum',
    '/unknown',
  ])('rejects an unsafe or non-section origin: %s', (href) => {
    expect(navigationOriginFromHref(href)).toBeNull();
  });

  it('preserves the original section while moving between problem details', () => {
    const existingState = {
      appNavigationOrigin: { section: 'today', href: '/today' },
      unrelated: 'kept',
    };

    expect(problemNavigationState('/problems/two-sum', existingState)).toEqual(existingState);
  });

  it('records the current section when entering a problem', () => {
    expect(problemNavigationState('/review?queue=focus', { unrelated: 'kept' })).toEqual({
      unrelated: 'kept',
      appNavigationOrigin: { section: 'review', href: '/review?queue=focus' },
    });
  });

  it('does not trust malformed history state', () => {
    expect(readNavigationOrigin({
      appNavigationOrigin: { section: 'review', href: 'https://example.com/review' },
    })).toBeNull();
  });
});
