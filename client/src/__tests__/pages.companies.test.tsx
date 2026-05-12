import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { Companies } from '@/pages/Companies';
import { CompanyDetail } from '@/pages/CompanyDetail';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    companies: { all: { useQuery: vi.fn() }, getBySlug: { useQuery: vi.fn() } },
    problems: { list: { useQuery: vi.fn() } },
  },
}));

describe('Companies', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());
  it('renders 25 company cards', () => {
    const arr = Array.from({ length: 25 }, (_, i) => ({
      slug: `c${i}`,
      nameEn: `Company ${i}`,
      region: 'us',
    }));
    (trpc.companies.all.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: arr,
      isLoading: false,
    });
    render(
      <LangProvider>
        <Companies />
      </LangProvider>,
    );
    expect(screen.getAllByText(/Company /).length).toBe(25);
  });
  it('CompanyDetail filters by companySlug', () => {
    (trpc.companies.getBySlug.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { slug: 'google', nameEn: 'Google' },
      isLoading: false,
    });
    (trpc.problems.list.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            frontendId: 1,
            titleSlug: 'two-sum',
            titleEn: 'Two Sum',
            difficulty: 'Easy',
          },
        ],
      },
      isLoading: false,
    });
    render(
      <LangProvider>
        <CompanyDetail slug="google" />
      </LangProvider>,
    );
    expect(screen.getByText('Two Sum')).toBeInTheDocument();
  });
});
