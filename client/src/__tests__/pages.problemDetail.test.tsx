import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { ProblemDetail } from '@/pages/ProblemDetail';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    problems: {
      getBySlug: { useQuery: vi.fn() },
      neighbors: { useQuery: vi.fn().mockReturnValue({ data: { prev: null, next: null }, isLoading: false }) },
      companyTags: { useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false }) },
      solutions: { useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false }) },
    },
    aiSolutions: {
      get: { useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false }) },
    },
    progress: {
      get: { useQuery: vi.fn().mockReturnValue({ data: null }) },
      update: { useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }) },
      listDue: { invalidate: vi.fn() },
      listAll: { invalidate: vi.fn() },
    },
    study: {
      today: { useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false }) },
    },
    roadmaps: {
      getBySlug: { useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false }) },
    },
    useUtils: vi.fn().mockReturnValue({
      progress: { get: { invalidate: vi.fn() }, listDue: { invalidate: vi.fn() }, listAll: { invalidate: vi.fn() } },
      study: { today: { invalidate: vi.fn() } },
      roadmaps: { getBySlug: { invalidate: vi.fn() } },
    }),
  },
}));

vi.mock('@/components/SolvePanel', () => ({
  SolvePanel: () => <div data-testid="solve-panel" />,
}));

describe('ProblemDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/problems/two-sum');
    (trpc.problems.neighbors.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        prev: { frontendId: 1, titleSlug: 'one' },
        next: { frontendId: 3, titleSlug: 'three' },
      },
      isLoading: false,
    });
    (trpc.roadmaps.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: roadmapData(), isLoading: false,
    });
  });
  afterEach(() => cleanup());
  it('renders title and difficulty', () => {
    (trpc.problems.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: 1,
        frontendId: 1,
        titleEn: 'Two Sum',
        titleZh: '两数之和',
        titleSlug: 'two-sum',
        difficulty: 'Easy',
        contentEn: '<p>desc</p>',
        codeSnippetsJson: [],
      },
      isLoading: false,
    });
    window.localStorage.removeItem('lt.lang');
    render(
      <LangProvider>
        <ProblemDetail titleSlug="two-sum" />
      </LangProvider>,
    );
    expect(screen.getByText('Two Sum')).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });
  it('renders empty state when null', () => {
    (trpc.problems.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
    });
    render(
      <LangProvider>
        <ProblemDetail titleSlug="missing" />
      </LangProvider>,
    );
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });

  it('shows matching Today hints only for a valid study-linked problem', () => {
    (trpc.problems.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: 1, frontendId: 1, titleEn: 'Two Sum', titleZh: '两数之和', titleSlug: 'two-sum',
        difficulty: 'Easy', contentEn: '<p>desc</p>', codeSnippetsJson: [],
      },
      isLoading: false,
    });
    (trpc.study.today.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        session: { id: 12, status: 'in_progress' },
        tasks: [{ taskKey: 'problem', status: 'pending', problemId: 1 }],
        coreProblem: { id: 1, titleSlug: 'two-sum' },
        reviewProblem: null,
        curriculumDay: {
          hints: ['Name the invariant.', 'Store complements.', 'Check before insert.'],
          hintsZh: ['写出不变量。', '保存补数。', '先查再插。'],
        },
      },
      isLoading: false,
    });
    window.history.replaceState({}, '', '/problems/two-sum?studySession=12&studyTask=problem');

    render(<LangProvider><ProblemDetail titleSlug="two-sum" /></LangProvider>);

    expect(screen.getByRole('heading', { name: 'Progressive hints' })).toBeInTheDocument();
    expect(screen.queryByText('Name the invariant.')).not.toBeInTheDocument();
  });

  it('uses roadmap navigation for a validated roadmap problem URL', () => {
    (trpc.problems.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: problem('binary-search'), isLoading: false,
    });
    window.history.replaceState({}, '', '/problems/binary-search?roadmap=code-thinking&section=array&step=2');

    render(<LangProvider><ProblemDetail titleSlug="binary-search" /></LangProvider>);

    expect(screen.getByText(/Code Thinking/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to roadmap/ })).toHaveAttribute(
      'href', '/roadmap/code-thinking#section-array',
    );
    expect(screen.getByRole('link', { name: /Remove Element/ })).toHaveAttribute(
      'href', '/problems/remove-element?roadmap=code-thinking&section=linked-list&step=1',
    );
    expect(screen.queryByRole('link', { name: /#1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /#3/ })).not.toBeInTheDocument();
  });

  it.each([
    ['invalid section', '/problems/binary-search?roadmap=code-thinking&section=missing&step=2', 'binary-search'],
    ['wrong step', '/problems/binary-search?roadmap=code-thinking&section=array&step=1', 'binary-search'],
    ['wrong current slug', '/problems/different?roadmap=code-thinking&section=array&step=2', 'different'],
  ])('keeps numeric neighbors when roadmap context has an %s', (_case, url, titleSlug) => {
    (trpc.problems.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: problem(titleSlug), isLoading: false,
    });
    window.history.replaceState({}, '', url);

    render(<LangProvider><ProblemDetail titleSlug={titleSlug} /></LangProvider>);

    expect(screen.getByRole('link', { name: /#1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /#3/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Back to roadmap/ })).not.toBeInTheDocument();
  });
});

function problem(titleSlug: string) {
  return {
    id: 704,
    frontendId: 704,
    titleEn: 'Binary Search',
    titleZh: '二分查找',
    titleSlug,
    difficulty: 'Easy' as const,
    contentEn: '<p>desc</p>',
    codeSnippetsJson: [],
  };
}

function roadmapData() {
  const sourceUrl = 'https://programmercarl.com/0704.html';
  return {
    slug: 'code-thinking',
    titleEn: 'Code Thinking Roadmap',
    titleZh: '代码随想录',
    allowedExternalHosts: ['programmercarl.com'],
    sections: [
      {
        slug: 'array', titleEn: 'Arrays', titleZh: '数组', items: [
          { key: 'array-1', kind: 'article' as const, position: 1, titleEn: 'Start here', titleZh: 'Start here', sourceUrl },
          {
            key: 'array-2', kind: 'leetcode' as const, position: 2, frontendId: 704,
            titleEn: 'Binary Search', titleZh: '二分查找', sourceUrl, mapping: 'mapped' as const,
            localProblem: { titleSlug: 'binary-search', titleEn: 'Binary Search', titleZh: '二分查找' },
          },
        ],
      },
      {
        slug: 'linked-list', titleEn: 'Linked Lists', titleZh: '链表', items: [
          {
            key: 'linked-list-1', kind: 'leetcode' as const, position: 1, frontendId: 27,
            titleEn: 'Remove Element', titleZh: '移除元素', sourceUrl, mapping: 'mapped' as const,
            localProblem: { titleSlug: 'remove-element', titleEn: 'Remove Element', titleZh: '移除元素' },
          },
        ],
      },
    ],
  };
}
