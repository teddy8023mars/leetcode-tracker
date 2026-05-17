import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { SyncStatus } from '@/pages/SyncStatus';
import { trpc } from '@/lib/trpc';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    sync: {
      status: { useQuery: vi.fn() },
      triggerManual: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      cancel: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    problems: {
      list: { useQuery: vi.fn().mockReturnValue({ data: { total: 0 } }) },
    },
    useUtils: vi.fn(() => ({ sync: { status: { invalidate: vi.fn() } } })),
  },
}));

vi.mock('@/_core/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

describe('SyncStatus', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());
  it('renders rows from status query', () => {
    (trpc.sync.status.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        {
          id: 1,
          syncType: 'manual',
          status: 'success',
          startedAt: new Date(),
          itemsProcessed: 100,
        },
      ],
      isLoading: false,
    });
    render(
      <LangProvider>
        <SyncStatus />
      </LangProvider>,
    );
    // syncType cell uses font-mono and exact text 'manual'
    const matches = screen.getAllByText('manual');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});
