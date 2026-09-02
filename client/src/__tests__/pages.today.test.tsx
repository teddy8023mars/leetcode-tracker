import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LangProvider } from '@/contexts/LangContext';
import { TodayPage } from '@/pages/TodayPage';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: vi.fn(),
    study: {
      today: { useQuery: vi.fn() },
      start: { useMutation: vi.fn() },
      setMode: { useMutation: vi.fn() },
      completeTask: { useMutation: vi.fn() },
      completeSession: { useMutation: vi.fn() },
    },
  },
}));

const problem = {
  id: 1, frontendId: 1, titleSlug: 'two-sum', titleEn: 'Two Sum', titleZh: '两数之和', difficulty: 'Easy' as const,
};
const curriculumDay = {
  index: 0, key: 'week-1-day-1', week: 1, titleEn: 'Two Sum', titleZh: '两数之和',
  topicEn: 'Arrays & hashing', topicZh: '数组与哈希',
  lessonEn: 'Trade memory for lookup.', lessonZh: '用空间换查找时间。',
  patternEn: 'Store complements.', patternZh: '保存补数。',
  mistakeEn: 'Do not reuse the same item.', mistakeZh: '不要重复使用同一元素。',
  primarySlug: 'two-sum', fallbackSlugs: ['contains-duplicate'], warmupSlug: 'two-sum',
  hints: ['Name the invariant.', 'Store the complement.', 'Check before insert.'],
  hintsZh: ['写出不变量。', '保存补数。', '先查再插。'],
  career: { type: 'gcp' as const, titleEn: 'PDE exam map', titleZh: 'PDE 考试地图', bodyEn: 'Map the domains.', bodyZh: '梳理考试领域。' },
};

function todayData(active = false) {
  return {
    profile: { id: 1, userId: 1, currentDayIndex: 0, targetDaysPerWeek: 5, standardMinutes: 70, minimumMinutes: 10, lastCompletedAt: null },
    session: active ? { id: 12, userId: 1, localDate: '2026-09-01', curriculumDayIndex: 0, mode: 'standard' as const, status: 'in_progress' as const, startedAt: new Date(), completedAt: null } : null,
    tasks: active ? [
      { id: 1, sessionId: 12, taskKey: 'review' as const, taskType: 'review' as const, problemId: 1, status: 'completed' as const, completedAt: new Date() },
      { id: 2, sessionId: 12, taskKey: 'dsa' as const, taskType: 'dsa_lesson' as const, problemId: null, status: 'pending' as const, completedAt: null },
      { id: 3, sessionId: 12, taskKey: 'problem' as const, taskType: 'problem' as const, problemId: 1, status: 'pending' as const, completedAt: null },
      { id: 4, sessionId: 12, taskKey: 'career' as const, taskType: 'gcp' as const, problemId: null, status: 'pending' as const, completedAt: null },
    ] : [],
    curriculumDay,
    reviewProblem: problem,
    coreProblem: problem,
    coreIsTimedReview: false,
    requiredTaskKeys: ['review', 'problem', 'career'] as const,
    weeklyCompleted: 0,
    gentleRestart: false,
    recommendedMode: 'standard' as 'standard' | 'minimum',
  };
}

describe('TodayPage', () => {
  const invalidate = vi.fn();
  const start = vi.fn();
  const setMode = vi.fn();
  const completeTask = vi.fn();
  const completeSession = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/today');
    window.localStorage.removeItem('lt.lang');
    (trpc.useUtils as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      study: { today: { invalidate } }, progress: { dashboard: { invalidate } },
    });
    (trpc.study.start.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: start, isPending: false });
    (trpc.study.setMode.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: setMode, isPending: false });
    (trpc.study.completeTask.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: completeTask, isPending: false });
    (trpc.study.completeSession.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: completeSession, isPending: false });
  });

  afterEach(() => cleanup());

  it('lets the learner choose a mode before starting and starts that selection', async () => {
    (trpc.study.today.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: todayData(false), isLoading: false });
    render(<LangProvider><TodayPage /></LangProvider>);

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('0/5 learning days')).toBeInTheDocument();
    expect(screen.getByText('Day 1 of 60')).toBeInTheDocument();
    expect(screen.getByText('Missing a day never creates backlog.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standard · 70 min' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Minimum · 10 min' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Minimum · 10 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start 10-minute session' }));
    expect(start).toHaveBeenCalledWith({ mode: 'minimum' });
    expect(setMode).not.toHaveBeenCalled();
  });

  it('synchronizes an untouched preview selection when the recommendation changes', () => {
    const standard = todayData(false);
    (trpc.study.today.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data: standard, isLoading: false });
    const { rerender } = render(<LangProvider><TodayPage /></LangProvider>);

    const minimum = todayData(false);
    minimum.recommendedMode = 'minimum';
    (trpc.study.today.useQuery as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({ data: minimum, isLoading: false });
    rerender(<LangProvider><TodayPage /></LangProvider>);

    expect(screen.getByRole('button', { name: 'Start 10-minute session' })).toBeEnabled();
  });

  it('omits the retired micro-lesson even when a legacy task record exists', async () => {
    (trpc.study.today.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: todayData(true), isLoading: false });
    render(<LangProvider><TodayPage /></LangProvider>);

    expect(screen.getAllByTestId(/^study-task-/).map((card) => card.dataset.testid)).toEqual([
      'study-task-review',
      'study-task-problem',
      'study-task-career',
    ]);
    expect(screen.queryByText('DSA micro-lesson')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete micro-lesson' })).not.toBeInTheDocument();
    expect(screen.getByTestId('study-task-review')).toHaveTextContent('Done');
    expect(screen.getByRole('button', { name: 'Finish learning day' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Minimum · 10 min' }));
    expect(setMode).toHaveBeenCalledWith({ sessionId: 12, mode: 'minimum' });
  });

  it('records Today as the origin when opening a problem', async () => {
    (trpc.study.today.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: todayData(true), isLoading: false });
    render(<LangProvider><TodayPage /></LangProvider>);

    await userEvent.click(screen.getByRole('link', { name: 'Solve with progressive hints' }));

    expect(window.history.state).toMatchObject({
      appNavigationOrigin: { section: 'today', href: '/today' },
    });
  });

  it('shows a gentle restart without shame language', () => {
    const data = todayData(false);
    data.gentleRestart = true;
    data.recommendedMode = 'minimum';
    (trpc.study.today.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data, isLoading: false });
    render(<LangProvider><TodayPage /></LangProvider>);
    expect(screen.getByText('Welcome back. Start small today.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start 10-minute session' })).toBeEnabled();
  });
});
