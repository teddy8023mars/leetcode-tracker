import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { Lists } from '@/pages/Lists';
import { ListDetail } from '@/pages/ListDetail';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    lists: { all: { useQuery: vi.fn() }, getBySlug: { useQuery: vi.fn() } },
    problems: { list: { useQuery: vi.fn() } },
  },
}));

describe('Lists / ListDetail', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());
  it('Lists renders cards', () => {
    (trpc.lists.all.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: 1, slug: 'top-100-liked', titleEn: 'Hot 100' }],
      isLoading: false,
    });
    window.localStorage.removeItem('lt.lang');
    render(
      <LangProvider>
        <Lists />
      </LangProvider>,
    );
    expect(screen.getByText('Hot 100')).toBeInTheDocument();
  });
  it('ListDetail filters by listSlug', () => {
    (trpc.lists.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { slug: 'hot-100', titleEn: 'Hot 100' },
      isLoading: false,
    });
    (trpc.problems.list.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [
          {
            id: 2,
            frontendId: 1,
            titleSlug: 'two-sum',
            titleEn: 'Two Sum',
            difficulty: 'Easy',
          },
        ],
        nextCursor: undefined,
      },
      isLoading: false,
    });
    render(
      <LangProvider>
        <ListDetail slug="hot-100" />
      </LangProvider>,
    );
    expect(screen.getByText('Two Sum')).toBeInTheDocument();
  });
});
