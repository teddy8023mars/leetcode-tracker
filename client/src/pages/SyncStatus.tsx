import { trpc } from '@/lib/trpc';
import { useT } from '@/contexts/LangContext';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';

type SyncRow = {
  id: number;
  syncType: string;
  status: 'running' | 'success' | 'failed' | 'partial' | string;
  startedAt: Date | string | number;
  itemsProcessed?: number | null;
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
  const q = trpc.sync.status.useQuery(undefined, { staleTime: 10_000, refetchInterval: 5_000 });
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
  const rows = (q.data ?? []) as SyncRow[];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('sync.pageTitle')}</h1>
        {user ? (
          <Button
            onClick={() => trigger.mutate({ syncType: 'manual' })}
            disabled={trigger.isPending}
          >
            {trigger.isPending ? t('loading') : t('sync.runManual')}
          </Button>
        ) : (
          <span className="text-xs text-ink-soft font-mono">{t('sync.loginFirst')}</span>
        )}
      </div>

      <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest">
        {t('sync.recent')}
      </h2>

      <table className="w-full text-sm">
        <thead className="text-left text-ink-soft font-mono text-xs">
          <tr className="border-b border-border">
            <th className="py-2 pr-3">{t('sync.type')}</th>
            <th className="pr-3">{t('sync.statusLabel')}</th>
            <th className="pr-3">{t('sync.items')}</th>
            <th className="pr-3">{t('sync.started')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="py-2 pr-3 font-mono">{r.syncType}</td>
              <td className="pr-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded font-mono text-[11px] ${
                    STATUS_TONE[r.status] ?? 'bg-secondary text-ink-soft'
                  }`}
                >
                  {t(`sync.status.${r.status}`) === `sync.status.${r.status}`
                    ? r.status
                    : t(`sync.status.${r.status}`)}
                </span>
              </td>
              <td className="pr-3 font-mono">{r.itemsProcessed ?? 0}</td>
              <td className="pr-3 font-mono text-ink-soft">
                {new Date(r.startedAt).toLocaleString()}
              </td>
            </tr>
          ))}
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
