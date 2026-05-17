import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { ProblemDetail } from '@/pages/ProblemDetail';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    problems: {
      getBySlug: { useQuery: vi.fn() },
      list: { useQuery: vi.fn().mockReturnValue({ data: { items: [] }, isLoading: false }) },
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
    useUtils: vi.fn().mockReturnValue({
      progress: { get: { invalidate: vi.fn() }, listDue: { invalidate: vi.fn() }, listAll: { invalidate: vi.fn() } },
    }),
  },
}));

vi.mock('@/components/SolvePanel', () => ({
  SolvePanel: () => <div data-testid="solve-panel" />,
}));

describe('ProblemDetail', () => {
  beforeEach(() => vi.clearAllMocks());
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
});
