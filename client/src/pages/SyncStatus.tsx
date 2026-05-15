import { trpc } from '@/lib/trpc';
import { useT } from '@/contexts/LangContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';

type SyncRow = {
  id: number;
  syncType: string;
  status: 'running' | 'success' | 'failed' | 'partial' | string;
  startedAt: Date | string | number;
  itemsProcessed?: number | null;
  itemsSucceeded?: number | null;
  itemsFailed?: number | null;
};

const STATUS_TONE: Record<string, string> = {
  running: 'bg-amber-100 text-amber-800',
  success: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  partial: 'bg-yellow-100 text-yellow-800',
};

export function SyncStatus() {
  const t = useT();
  const { user } = useAuth();
  const q = trpc.sync.status.useQuery(undefined, { staleTime: 2_000, refetchInterval: 2_000 });
  const problemsQ = trpc.problems.list.useQuery({ limit: 1 }, { staleTime: 60_000 });
  const utils = trpc.useUtils();
  const trigger = trpc.sync.triggerManual.useMutation({
    onSuccess: () => {
      toast.success(t('sync.triggered'));
      utils.sync.status.invalidate();
    },
    onError: (e) => {
      toast.error(t('sync.triggerFailed') + ': ' + e.message);
    },
  });
  const cancel = trpc.sync.cancel.useMutation({
    onSuccess: () => {
      utils.sync.status.invalidate();
    },
  });
  const rows = (q.data ?? []) as SyncRow[];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('sync.pageTitle')}</h1>
        {user ? (
          <div className="flex gap-2">
            <Button
              onClick={() => trigger.mutate({ syncType: 'manual' })}
              disabled={trigger.isPending}
            >
              {trigger.isPending ? t('loading') : t('sync.runManual')}
            </Button>
            <Button
              variant="outline"
              onClick={() => trigger.mutate({ syncType: 'ai-pregenerate' })}
              disabled={trigger.isPending}
            >
              {trigger.isPending ? t('loading') : t('sync.runAiPregenerate')}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-ink-soft font-mono">{t('sync.loginFirst')}</span>
        )}
      </div>

      <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest">
        {t('sync.recent')}
      </h2>

      <table className="w-full text-sm">
        <colgroup>
          <col style={{ width: '30%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '30%' }} />
        </colgroup>
        <thead className="text-left text-ink-soft font-mono text-xs">
          <tr className="border-b border-border">
            <th className="py-2">{t('sync.type')}</th>
            <th>{t('sync.statusLabel')}</th>
            <th>{t('sync.items')}</th>
            <th>{t('sync.started')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const totalProblems = (problemsQ.data as { total?: number } | undefined)?.total ?? 0;
            const isAiTask = r.syncType === 'ai-pregenerate';
            const isRunning = r.status === 'running';
            const expectedTotal = isAiTask ? totalProblems * 2 : 0;
            const processed = r.itemsProcessed ?? 0;
            const pct = isRunning && isAiTask && expectedTotal > 0
              ? Math.min(Math.round((processed / expectedTotal) * 100), 100)
              : null;

            return (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2 font-mono">{r.syncType}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-14 text-center py-0.5 rounded font-mono text-[11px] ${
                        STATUS_TONE[r.status] ?? 'bg-secondary text-ink-soft'
                      }`}
                    >
                      {t(`sync.status.${r.status}`) === `sync.status.${r.status}`
                        ? r.status
                        : t(`sync.status.${r.status}`)}
                    </span>
                    {isRunning && user && (
                      <button
                        type="button"
                        onClick={() => cancel.mutate({ syncLogId: r.id })}
                        disabled={cancel.isPending}
                        className="px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-100 rounded font-mono"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
                <td className="font-mono">
                  {pct !== null ? (
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="h-2 w-24" />
                      <span className="text-[11px] text-ink-soft">{pct}%</span>
                    </div>
                  ) : (
                    processed
                  )}
                </td>
                <td className="font-mono text-ink-soft">
                  {new Date(r.startedAt).toLocaleString()}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td className="py-3 text-ink-soft" colSpan={4}>
                {t('empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
