import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LangProvider } from '@/contexts/LangContext';
import { ProblemList } from '@/pages/ProblemList';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    problems: {
      list: { useQuery: vi.fn() },
    },
    progress: {
      listAll: { useQuery: vi.fn().mockReturnValue({ data: [] }) },
      listDue: { useQuery: vi.fn().mockReturnValue({ data: [] }) },
    },
  },
}));

describe('ProblemList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/problems');
  });
  afterEach(() => cleanup());
  it('renders problems table when data is present', () => {
    (trpc.problems.list.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            frontendId: 1,
            titleSlug: 'two-sum',
            titleEn: 'Two Sum',
            titleZh: '两数之和',
            difficulty: 'Easy',
            acRate: 50.5,
            paidOnly: false,
          },
        ],
        nextCursor: undefined,
      },
      isLoading: false,
    });
    window.localStorage.removeItem('lt.lang');
    render(
      <LangProvider>
        <ProblemList />
      </LangProvider>,
    );
    expect(screen.getByText('Two Sum')).toBeInTheDocument();
  });
  it('renders empty state when no items', () => {
    (trpc.problems.list.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], nextCursor: undefined },
      isLoading: false,
    });
    render(
      <LangProvider>
        <ProblemList />
      </LangProvider>,
    );
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });

  it('does not render literal 0 when paidOnly is the number 0 from MySQL tinyint (regression: BUG-26)', () => {
    (trpc.problems.list.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            frontendId: 1,
            titleSlug: 'two-sum',
            titleEn: 'Two Sum',
            difficulty: 'Easy',
            // MySQL boolean comes back as 0/1 number, not boolean
            paidOnly: 0,
            acRate: '0.4567', // and acRate may be a decimal string
          },
        ],
        total: 1,
      },
      isLoading: false,
    });
    render(
      <LangProvider>
        <ProblemList />
      </LangProvider>,
    );
    // Title row must not contain the trailing '0'
    const titleLink = screen.getByText('Two Sum');
    const cell = titleLink.closest('td')!;
    expect(cell.textContent).toBe('Two Sum');
  });

  it('shows total count when server returns total (regression: BUG-5)', () => {
    (trpc.problems.list.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: Array.from({ length: 3 }, (_, i) => ({
          id: i + 1,
          frontendId: i + 1,
          titleSlug: `p-${i}`,
          titleEn: `Problem ${i}`,
          difficulty: 'Easy',
          paidOnly: false,
        })),
        total: 184,
      },
      isLoading: false,
    });
    render(
      <LangProvider>
        <ProblemList />
      </LangProvider>,
    );
    // i18n string includes "3" and "184"
    const text = document.body.textContent || '';
    expect(text).toContain('3');
    expect(text).toContain('184');
  });

  it('opens a title once and records Problems as the origin', async () => {
    (trpc.problems.list.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [{
          id: 1, frontendId: 1, titleSlug: 'two-sum', titleEn: 'Two Sum',
          difficulty: 'Easy', paidOnly: false,
        }],
        total: 1,
      },
      isLoading: false,
    });
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<LangProvider><ProblemList /></LangProvider>);

    await userEvent.click(screen.getByRole('link', { name: 'Two Sum' }));

    expect(pushState).toHaveBeenCalledOnce();
    expect(window.history.state).toMatchObject({
      appNavigationOrigin: { section: 'problems', href: '/problems' },
    });
    pushState.mockRestore();
  });
});
