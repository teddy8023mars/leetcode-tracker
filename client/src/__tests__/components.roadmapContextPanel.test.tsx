import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import {
  parseRoadmapContext,
  RoadmapContextPanel,
  resolveRoadmapContext,
} from '@/components/RoadmapContextPanel';
import { LangProvider } from '@/contexts/LangContext';

const sourceUrl = 'https://programmercarl.com/0704.html';

const view = {
  slug: 'code-thinking',
  titleEn: 'Code Thinking Roadmap',
  titleZh: '代码随想录',
  allowedExternalHosts: ['programmercarl.com'],
  sections: [
    {
      slug: 'array',
      titleEn: 'Arrays',
      titleZh: '数组',
      items: [
        { key: 'array-1', kind: 'article' as const, position: 1, titleEn: 'Start here', titleZh: 'Start here', sourceUrl },
        {
          key: 'array-2', kind: 'leetcode' as const, position: 2, frontendId: 704,
          titleEn: 'Binary Search', titleZh: '二分查找', sourceUrl, mapping: 'mapped' as const,
          localProblem: { titleSlug: 'binary-search', titleEn: 'Binary Search', titleZh: '二分查找' },
        },
      ],
    },
    {
      slug: 'linked-list',
      titleEn: 'Linked Lists',
      titleZh: '链表',
      items: [
        {
          key: 'linked-list-1', kind: 'leetcode' as const, position: 1, frontendId: 27,
          titleEn: 'Remove Element', titleZh: '移除元素', sourceUrl, mapping: 'mapped' as const,
          localProblem: { titleSlug: 'remove-element', titleEn: 'Remove Element', titleZh: '移除元素' },
        },
      ],
    },
  ],
};

describe('roadmap context helpers', () => {
  afterEach(() => cleanup());

  it('parses only a complete positive roadmap step', () => {
    expect(parseRoadmapContext('?roadmap=code-thinking&section=array&step=2')).toEqual({
      roadmapSlug: 'code-thinking', sectionSlug: 'array', step: 2,
    });
    expect(parseRoadmapContext('?roadmap=code-thinking&section=array&step=0')).toBeNull();
    expect(parseRoadmapContext('?roadmap=code-thinking&section=array&step=2oops')).toBeNull();
    expect(parseRoadmapContext('?roadmap=code-thinking&section=array&step=999999999999999999999')).toBeNull();
  });

  it('resolves full-route neighbors only for the mapped current problem', () => {
    const context = { roadmapSlug: 'code-thinking', sectionSlug: 'array', step: 2 };

    expect(resolveRoadmapContext(view, context, 'binary-search')).toMatchObject({
      current: { kind: 'leetcode', frontendId: 704 },
      previous: { kind: 'article' },
      next: { kind: 'leetcode', frontendId: 27 },
    });
    expect(resolveRoadmapContext(view, context, 'wrong-slug')).toBeNull();
  });

  it('keeps mapped neighbors local and article neighbors safely external', () => {
    const resolved = resolveRoadmapContext(view, {
      roadmapSlug: 'code-thinking', sectionSlug: 'array', step: 2,
    }, 'binary-search');
    if (!resolved) throw new Error('expected the roadmap route to resolve');

    render(<LangProvider><RoadmapContextPanel view={view} resolved={resolved} /></LangProvider>);

    expect(screen.getByRole('link', { name: /Back to roadmap/ })).toHaveAttribute(
      'href', '/roadmap/code-thinking#section-array',
    );
    expect(screen.getByRole('link', { name: /Remove Element/ })).toHaveAttribute(
      'href', '/problems/remove-element?roadmap=code-thinking&section=linked-list&step=1',
    );
    expect(screen.getByRole('link', { name: /Start here/ })).toHaveAttribute('target', '_blank');
  });

  it('omits an unsafe non-local neighbor control', () => {
    const unsafeView = {
      ...view,
      sections: [{
        ...view.sections[0],
        items: [
          {
            key: 'array-1', kind: 'article' as const, position: 1,
            titleEn: 'Unsafe article', titleZh: 'Unsafe article', sourceUrl: 'https://evil.example/article',
          },
          view.sections[0].items[1],
        ],
      }],
    };
    const resolved = resolveRoadmapContext(unsafeView, {
      roadmapSlug: 'code-thinking', sectionSlug: 'array', step: 2,
    }, 'binary-search');
    if (!resolved) throw new Error('expected the roadmap route to resolve');

    render(<LangProvider><RoadmapContextPanel view={unsafeView} resolved={resolved} /></LangProvider>);

    expect(screen.queryByRole('link', { name: /Unsafe article/ })).not.toBeInTheDocument();
  });
});
