import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    window.history.replaceState({}, '', '/roadmap/code-thinking');
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
    expect(screen.getByText('Suggested preceding article:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start here.*opens in system browser/ }))
      .toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /Read original.*opens in system browser/ }))
      .toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /View source.*opens in system browser/ }))
      .toHaveAttribute('target', '_blank');
    expect(screen.getByText('External ACM problem')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /External ACM problem · KamaCoder.*opens in system browser/ }))
      .toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByRole('link', { name: /Based on Carl.*opens in system browser/ }))
      .toHaveAttribute('target', '_blank');
  });

  it('records the exact roadmap chapter when opening a problem', async () => {
    render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    await userEvent.click(screen.getByRole('link', { name: /^Two$/ }));

    expect(window.history.state).toMatchObject({
      appNavigationOrigin: {
        section: 'roadmap',
        href: '/roadmap/code-thinking#section-array',
      },
    });
  });

  it('renders a completed state with a localized review action to the first chapter', async () => {
    const data = roadmapData();
    data.progress = { completed: 2, total: 2 };
    data.next = null as never;
    (trpc.roadmaps.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data, isLoading: false });

    render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    expect(screen.getByText('Roadmap complete. Review any chapter at your own pace.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review first chapter' }))
      .toHaveAttribute('href', '#section-array');
    expect(screen.queryByText('No local problem is ready to continue.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arrays/ })).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(screen.getByRole('link', { name: 'Review first chapter' }));

    expect(screen.getByRole('button', { name: /Arrays/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('retains the no-local-problem state when the roadmap has no mapped problems', () => {
    const data = roadmapData();
    data.progress = { completed: 0, total: 0 };
    data.next = null as never;
    (trpc.roadmaps.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data, isLoading: false });

    render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    expect(screen.getByText('No local problem is ready to continue.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review first chapter' })).not.toBeInTheDocument();
  });

  it('opens the current chapter by default and leaves it closed when the learner collapses it', async () => {
    render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    const arrayToggle = screen.getByRole('button', { name: /Arrays/ });
    expect(arrayToggle).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(arrayToggle);
    expect(arrayToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a changed current chapter without closing chapters the learner already has open', async () => {
    const { rerender } = render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);
    const data = roadmapData() as any;
    const next = {
      key: 'linked-list-2', kind: 'leetcode', position: 2, frontendId: 4,
      titleSlug: 'four', titleZh: 'Four', titleEn: 'Four', sourceUrl,
      mapping: 'mapped',
      localProblem: { id: 4, frontendId: 4, titleSlug: 'four', titleEn: 'Four', titleZh: '四', difficulty: 'Easy', status: 'todo' },
    };
    data.next = next;
    data.sections[1].items.push(next);
    data.sections[1].progress = { completed: 0, total: 1 };
    (trpc.roadmaps.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data, isLoading: false });

    rerender(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    await waitFor(() => expect(screen.getByRole('button', { name: /Linked Lists/ }))
      .toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('button', { name: /Arrays/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not reopen a chapter the learner closed when it becomes current again', async () => {
    const { rerender } = render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);
    const arrayToggle = screen.getByRole('button', { name: /Arrays/ });
    await userEvent.click(arrayToggle);
    expect(arrayToggle).toHaveAttribute('aria-expanded', 'false');

    const linkedListCurrent = roadmapData() as any;
    const next = {
      key: 'linked-list-2', kind: 'leetcode', position: 2, frontendId: 4,
      titleSlug: 'four', titleZh: 'Four', titleEn: 'Four', sourceUrl,
      mapping: 'mapped',
      localProblem: { id: 4, frontendId: 4, titleSlug: 'four', titleEn: 'Four', titleZh: '四', difficulty: 'Easy', status: 'todo' },
    };
    linkedListCurrent.next = next;
    linkedListCurrent.sections[1].items.push(next);
    linkedListCurrent.sections[1].progress = { completed: 0, total: 1 };
    (trpc.roadmaps.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data: linkedListCurrent, isLoading: false });
    rerender(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: /Linked Lists/ }))
      .toHaveAttribute('aria-expanded', 'true'));

    (trpc.roadmaps.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data: roadmapData(), isLoading: false });
    rerender(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    await waitFor(() => expect(screen.getByText('Current chapter: Arrays')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Arrays/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps article and external explanations visible when source URLs are rejected', () => {
    const data = roadmapData();
    data.sections[0].items[0].sourceUrl = 'https://evil.example/article';
    data.sections[0].items[4].sourceUrl = 'https://evil.example/external';
    (trpc.roadmaps.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data, isLoading: false });

    render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    expect(screen.getByText('Read original')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Read original' })).not.toBeInTheDocument();
    expect(screen.getByText('External ACM problem · KamaCoder')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'External ACM problem · KamaCoder' })).not.toBeInTheDocument();
  });

  it('renders roadmap labels and chapter progress in Chinese', () => {
    window.localStorage.setItem('lt.lang', 'zh');
    render(<LangProvider><Roadmap slug="code-thinking" /></LangProvider>);

    expect(screen.getByText('学习路线')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '继续下一题' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2 题已完成')).toBeInTheDocument();
  });
});
