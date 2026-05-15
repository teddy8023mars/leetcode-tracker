import { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';
import { useFilters } from '@/hooks/useFilters';
import { useDebounce } from '@/hooks/useDebounce';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Difficulty } from '@shared/problemTypes';

type ProblemRow = {
  id: number;
  frontendId: number;
  titleSlug: string;
  titleEn: string;
  titleZh?: string | null;
  difficulty: Difficulty;
  acRate?: number | string | null;
  paidOnly?: boolean;
};

const PAGE_SIZES = [20, 50, 100];

export function ProblemList() {
  const t = useT();
  const { lang } = useLang();
  const { filters, setFilter, reset } = useFilters({ defaults: {} });
  const search = useDebounce(filters.search as string | undefined, 300);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const query = trpc.problems.list.useQuery(
    {
      filters: {
        difficulty: filters.difficulty as Difficulty | undefined,
        search,
        paidOnly:
          typeof filters.paidOnly === 'boolean' ? (filters.paidOnly as boolean) : undefined,
        status: filters.status as 'todo' | 'reviewing' | 'done' | undefined,
      },
      limit: 200,
    },
    { staleTime: 60_000 },
  );

  const progressQ = trpc.progress.listAll.useQuery(undefined, { staleTime: 30_000 });
  const dueQ = trpc.progress.listDue.useQuery(undefined, { staleTime: 30_000 });

  const progressMap = new Map<number, string>();
  for (const p of (progressQ.data ?? []) as Array<{ problemId: number; status: string }>) {
    progressMap.set(p.problemId, p.status);
  }
  const dueSet = new Set(dueQ.data ?? []);

  const allItems = (query.data?.items ?? []) as ProblemRow[];
  const total = query.data?.total ?? allItems.length;
  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const items = allItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('problemList.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-6">
        <aside className="space-y-4">
          <div>
            <label className="font-mono text-xs text-ink-soft block mb-1">
              {t('filter.difficulty')}
            </label>
            <Select
              value={(filters.difficulty as string) ?? 'all'}
              onValueChange={(v) => {
                setFilter('difficulty', v === 'all' ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter.all')}</SelectItem>
                <SelectItem value="Easy">{t('difficulty.Easy')}</SelectItem>
                <SelectItem value="Medium">{t('difficulty.Medium')}</SelectItem>
                <SelectItem value="Hard">{t('difficulty.Hard')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="font-mono text-xs text-ink-soft block mb-1">
              {t('filter.status')}
            </label>
            <Select
              value={(filters.status as string) ?? 'all'}
              onValueChange={(v) => {
                setFilter('status', v === 'all' ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter.all')}</SelectItem>
                <SelectItem value="todo">{t('status.todo')}</SelectItem>
                <SelectItem value="reviewing">{t('status.reviewing')}</SelectItem>
                <SelectItem value="done">{t('status.done')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              setPage(1);
            }}
          >
            {t('filter.clear')}
          </Button>
        </aside>

        <section className="min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <Input
              placeholder={t('filter.search')}
              value={(filters.search as string) ?? ''}
              onChange={(e) => {
                setFilter('search', e.target.value || undefined);
                setPage(1);
              }}
              className="font-mono max-w-md"
            />
            <span className="text-xs text-ink-soft font-mono whitespace-nowrap">
              {t('problemList.showing', { shown: items.length, total })}
            </span>
          </div>

          {query.isLoading ? (
            <p className="text-ink-soft">{t('loading')}</p>
          ) : items.length === 0 ? (
            <p className="text-ink-soft">{t('empty')}</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="text-left text-ink-soft font-mono text-xs">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 w-16">{t('problemList.no')}</th>
                    <th className="pr-3">{t('problemList.name')}</th>
                    <th className="pr-3 w-24">{t('problemList.diff')}</th>
                    <th className="pr-3 w-28">{t('filter.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-secondary/50">
                      <td className="py-2 pr-3 font-mono text-ink-soft">{p.frontendId}</td>
                      <td className="pr-3 py-2">
                        <Link
                          href={`/problems/${p.titleSlug}`}
                          className="font-medium hover:underline"
                        >
                          {lang === 'zh' ? p.titleZh || p.titleEn : p.titleEn}
                        </Link>
                        {Boolean(p.paidOnly) && (
                          <span className="ml-2 text-[10px] font-mono text-amber-700 uppercase">
                            {t('problem.paidOnly')}
                          </span>
                        )}
                      </td>
                      <td className="pr-3 py-2">
                        <DifficultyBadge difficulty={p.difficulty} />
                      </td>
                      <td className="pr-3 py-2">
                        <div className="flex items-center gap-1">
                          {progressMap.has(p.id) && (
                            <StatusBadge status={progressMap.get(p.id) as 'todo' | 'reviewing' | 'done'} />
                          )}
                          {dueSet.has(p.id) && (
                            <span className="w-2 h-2 rounded-full bg-orange-400" title={t('progress.dueForReview')} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-soft font-mono">{t('problemList.perPage')}</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                  >
                    <SelectTrigger className="w-20 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((s) => (
                        <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage(1)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    «
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    ‹
                  </Button>
                  <span className="text-xs font-mono text-ink-soft px-2">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    ›
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(totalPages)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    »
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
