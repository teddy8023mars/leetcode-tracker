import { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';
import { useFilters } from '@/hooks/useFilters';
import { useDebounce } from '@/hooks/useDebounce';
import { DifficultyBadge } from '@/components/DifficultyBadge';
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

const PAGE = 50;

export function ProblemList() {
  const t = useT();
  const { lang } = useLang();
  const { filters, setFilter, reset } = useFilters({ defaults: {} });
  const search = useDebounce(filters.search as string | undefined, 300);
  const [limit, setLimit] = useState(PAGE);

  const query = trpc.problems.list.useQuery(
    {
      filters: {
        difficulty: filters.difficulty as Difficulty | undefined,
        search,
        paidOnly:
          typeof filters.paidOnly === 'boolean' ? (filters.paidOnly as boolean) : undefined,
      },
      limit,
    },
    { staleTime: 60_000 },
  );

  const items = (query.data?.items ?? []) as ProblemRow[];
  const total = query.data?.total ?? items.length;

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
                setLimit(PAGE);
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              setLimit(PAGE);
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
                setLimit(PAGE);
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
                    </tr>
                  ))}
                </tbody>
              </table>

              {items.length < total && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLimit((l) => l + PAGE)}
                  >
                    {t('problemList.loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
