import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { ReviewDashboard } from '@/pages/ReviewDashboard';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    progress: {
      dashboard: { useQuery: vi.fn() },
    },
    problems: {
      list: { useQuery: vi.fn() },
    },
    auth: {
      me: { useQuery: vi.fn() },
    },
    judge: {
      listRecent: { useQuery: vi.fn() },
    },
  },
}));

const dashboardData = {
  counts: { todo: 3, reviewing: 2, done: 5 },
  dueProblems: [
    {
      problemId: 1,
      status: 'done',
      nextReviewAt: new Date('2026-05-17T00:00:00Z'),
      reviewCount: 2,
      frontendId: 1,
      titleSlug: 'two-sum',
      titleEn: 'Two Sum',
      titleZh: '两数之和',
      difficulty: 'Easy',
    },
  ],
  focusProblems: [
    {
      problemId: 2,
      status: 'reviewing',
      nextReviewAt: null,
      reviewCount: 0,
      frontendId: 2,
      titleSlug: 'add-two-numbers',
      titleEn: 'Add Two Numbers',
      titleZh: '两数相加',
      difficulty: 'Medium',
    },
  ],
};

describe('ReviewDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.removeItem('lt.lang');
    (trpc.progress.dashboard.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: dashboardData,
      isLoading: false,
    });
    (trpc.problems.list.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { total: 10 },
      isLoading: false,
    });
    (trpc.auth.me.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
    });
    (trpc.judge.listRecent.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  afterEach(() => cleanup());

  it('renders review stats and due/focus queues', () => {
    render(
      <LangProvider>
        <ReviewDashboard />
      </LangProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByText('Due now')).toBeInTheDocument();
    expect(screen.getByText('Focus queue')).toBeInTheDocument();
    expect(screen.getByText('Two Sum')).toBeInTheDocument();
    expect(screen.getByText('Add Two Numbers')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Sign in to see recent submissions.')).toBeInTheDocument();
  });

  it('renders recent submissions when authenticated', () => {
    (trpc.auth.me.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 1, openId: 'user' },
      isLoading: false,
    });
    (trpc.judge.listRecent.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        {
          id: 10,
          language: 'python',
          verdict: 'accepted',
          passedCount: 12,
          totalCount: 12,
          runtimeMs: 41,
          createdAt: new Date('2026-05-18T00:00:00Z'),
          frontendId: 1,
          titleSlug: 'two-sum',
          titleEn: 'Two Sum',
          titleZh: '两数之和',
          difficulty: 'Easy',
        },
      ],
      isLoading: false,
    });

    render(
      <LangProvider>
        <ReviewDashboard />
      </LangProvider>,
    );

    expect(screen.getByText('Recent submissions')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('12/12')).toBeInTheDocument();
  });
});
