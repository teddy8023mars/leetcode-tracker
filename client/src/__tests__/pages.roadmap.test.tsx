import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { LangProvider } from '@/contexts/LangContext';
import { Roadmap } from '@/pages/Roadmap';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    roadmaps: {
      getBySlug: { useQuery: vi.fn() },
    },
  },
}));

const sourceUrl = 'https://programmercarl.com/0704.html';

function roadmapData() {
  return {
    slug: 'code-thinking',
    titleEn: 'Code Thinking Roadmap',
    titleZh: '代码随想录',
    sourceName: 'Carl',
    sourceUrl,
    sourceCommit: 'abcdef0123456789abcdef0123456789abcdef01',
    allowedExternalHosts: ['programmercarl.com'],
    progress: { completed: 1, total: 2 },
    next: {
      key: 'array-3', kind: 'leetcode', position: 3, frontendId: 2,
      titleSlug: 'two', titleZh: 'Two', titleEn: 'Two', sourceUrl,
      mapping: 'mapped',
      localProblem: { id: 2, frontendId: 2, titleSlug: 'two', titleEn: 'Two', titleZh: '二', difficulty: 'Medium', status: 'todo' },
    },
    missingFrontendIds: [3],
    sections: [
      {
        slug: 'array', titleEn: 'Arrays', titleZh: '数组', progress: { completed: 1, total: 2 },
        items: [
          { key: 'array-1', kind: 'article', position: 1, titleZh: 'Start here', titleEn: 'Start here', sourceUrl },
          {
            key: 'array-2', kind: 'leetcode', position: 2, frontendId: 1, titleSlug: 'one', titleZh: 'One', titleEn: 'One', sourceUrl,
            mapping: 'mapped',
            localProblem: { id: 1, frontendId: 1, titleSlug: 'one', titleEn: 'One', titleZh: '一', difficulty: 'Easy', status: 'done' },
          },
          {
            key: 'array-3', kind: 'leetcode', position: 3, frontendId: 2, titleSlug: 'two', titleZh: 'Two', titleEn: 'Two', sourceUrl,
            mapping: 'mapped',
            localProblem: { id: 2, frontendId: 2, titleSlug: 'two', titleEn: 'Two', titleZh: '二', difficulty: 'Medium', status: 'todo' },
          },
          {
            key: 'array-4', kind: 'leetcode', position: 4, frontendId: 3, titleSlug: 'three', titleZh: 'Three', titleEn: 'Three', sourceUrl,
            mapping: 'missing', localProblem: null,
          },
          { key: 'array-5', kind: 'external', position: 5, titleZh: 'External ACM problem', titleEn: 'External ACM problem', provider: 'KamaCoder', sourceUrl },
        ],
      },
      {
        slug: 'linked-list', titleEn: 'Linked Lists', titleZh: '链表', progress: { completed: 0, total: 0 },
        items: [{ key: 'linked-list-1', kind: 'article', position: 1, titleZh: 'Linked list intro', titleEn: 'Linked list intro', sourceUrl }],
      },
    ],
  };
}

describe('Roadmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.removeItem('lt.lang');
    (trpc.roadmaps.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data: roadmapData(), isLoading: false });
  });

  afterEach(() => cleanup());

  it('renders roadmap progress, the next local problem, and every node type', () => {
    render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    expect(screen.getByRole('heading', { name: 'Code Thinking Roadmap' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2 problems complete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Continue/ })).toHaveAttribute(
      'href', '/problems/two?roadmap=code-thinking&section=array&step=3',
    );
    expect(screen.getByRole('link', { name: /Read original/ })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('External ACM problem')).toBeInTheDocument();
  });

  it('renders roadmap labels and chapter progress in Chinese', () => {
    window.localStorage.setItem('lt.lang', 'zh');
    render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    expect(screen.getByText('学习路线')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '继续下一题' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2 题已完成')).toBeInTheDocument();
  });
});
