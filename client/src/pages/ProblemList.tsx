import { useState, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
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
import { collectTagOptions, problemHasTag, tagDisplayName } from '@/lib/problemTags';

type ProblemRow = {
  id: number;
  frontendId: number;
  titleSlug: string;
  titleEn: string;
  titleZh?: string | null;
  difficulty: Difficulty;
  acRate?: number | string | null;
  paidOnly?: boolean;
  topicTagsJson?: Array<{ name: string; slug: string }> | null;
  sqlTagsJson?: Array<{ name: string; slug: string }> | null;
};

const PAGE_SIZES = [20, 50, 100];

const COMPANIES = [
  { slug: 'google', name: 'Google', zh: '谷歌', domain: 'google.com' },
  { slug: 'meta', name: 'Meta', zh: 'Meta', domain: 'meta.com' },
  { slug: 'amazon', name: 'Amazon', zh: '亚马逊', domain: 'amazon.com' },
  { slug: 'microsoft', name: 'Microsoft', zh: '微软', domain: 'microsoft.com' },
  { slug: 'apple', name: 'Apple', zh: '苹果', domain: 'apple.com' },
  { slug: 'adobe', name: 'Adobe', zh: 'Adobe', domain: 'adobe.com' },
  { slug: 'nvidia', name: 'Nvidia', zh: '英伟达', domain: 'nvidia.com' },
  { slug: 'uber', name: 'Uber', zh: '优步', domain: 'uber.com' },
  { slug: 'salesforce', name: 'Salesforce', zh: 'Salesforce', domain: 'salesforce.com' },
  { slug: 'linkedin', name: 'LinkedIn', zh: '领英', domain: 'linkedin.com' },
  { slug: 'bytedance', name: 'ByteDance', zh: '字节跳动', domain: 'jobs.bytedance.com' },
  { slug: 'tiktok', name: 'TikTok', zh: 'TikTok', domain: 'tiktok.com' },
  { slug: 'netflix', name: 'Netflix', zh: '奈飞', domain: 'netflix.com' },
  { slug: 'tesla', name: 'Tesla', zh: '特斯拉', domain: 'tesla.com' },
  { slug: 'airbnb', name: 'Airbnb', zh: '爱彼迎', domain: 'airbnb.com' },
  { slug: 'tencent', name: 'Tencent', zh: '腾讯', domain: 'tencent.com' },
  { slug: 'grab', name: 'Grab', zh: 'Grab', domain: 'grab.com' },
  { slug: 'shopee', name: 'Shopee', zh: '虾皮', domain: 'shopee.sg' },
  { slug: 'alibaba', name: 'Alibaba', zh: '阿里巴巴', domain: 'alibaba.com' },
  { slug: 'baidu', name: 'Baidu', zh: '百度', domain: 'baidu.com' },
];

export function ProblemList() {
  const t = useT();
  const { lang } = useLang();
  const [, navigate] = useLocation();
  const { filters, setFilter, reset } = useFilters({ defaults: {} });
  const search = useDebounce(filters.search as string | undefined, 300);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'id' | 'difficulty' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (col: 'id' | 'difficulty') => {
    if (sortBy === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortBy(null); setSortDir('asc'); }
    } else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };

  const category = (filters.category as 'algorithms' | 'database' | 'all' | undefined) ?? 'algorithms';

  const query = trpc.problems.list.useQuery(
    {
      filters: {
        category: category === 'all' ? undefined : category,
        difficulty: filters.difficulty as Difficulty | undefined,
        search,
        paidOnly:
          typeof filters.paidOnly === 'boolean' ? (filters.paidOnly as boolean) : undefined,
        status: filters.status as 'todo' | 'reviewing' | 'done' | undefined,
        companySlug: filters.company as string | undefined,
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

  const rawItems = (query.data?.items ?? []) as ProblemRow[];

  const allTags = useMemo(() => collectTagOptions(rawItems), [rawItems]);

  const tagFilter = filters.tag as string | undefined;
  const DIFF_ORDER: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 };
  const filteredItems = tagFilter
    ? rawItems.filter(p => problemHasTag(p, tagFilter))
    : rawItems;
  const allItems = sortBy ? [...filteredItems].sort((a, b) => {
    let cmp: number;
    if (sortBy === 'difficulty') cmp = (DIFF_ORDER[a.difficulty] ?? 1) - (DIFF_ORDER[b.difficulty] ?? 1);
    else cmp = a.frontendId - b.frontendId;
    return sortDir === 'desc' ? -cmp : cmp;
  }) : filteredItems;
  const serverTotal = typeof query.data?.total === 'number' ? query.data.total : undefined;
  const displayTotal = tagFilter ? allItems.length : serverTotal ?? allItems.length;
  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const items = allItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('problemList.title')}</h1>

      <div className="flex items-center gap-1 border-b border-border">
        {(['algorithms', 'database', 'all'] as const).map((c) => (
          <button
            key={c}
            onClick={() => {
              setFilter('category', c === 'algorithms' ? undefined : c);
              setPage(1);
            }}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              category === c
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {c === 'all' ? t('filter.all') : t(`category.${c}`)}
          </button>
        ))}
      </div>

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
                <SelectItem value="Easy"><span className="text-emerald-600">{t('difficulty.Easy')}</span></SelectItem>
                <SelectItem value="Medium"><span className="text-amber-600">{t('difficulty.Medium')}</span></SelectItem>
                <SelectItem value="Hard"><span className="text-rose-600">{t('difficulty.Hard')}</span></SelectItem>
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
                <SelectItem value="todo"><span className="text-amber-500">{t('status.todo')}</span></SelectItem>
                <SelectItem value="reviewing"><span className="text-blue-600">{t('status.reviewing')}</span></SelectItem>
                <SelectItem value="done"><span className="text-emerald-600">{t('status.done')}</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          {allTags.length > 0 && (
            <div>
              <label className="font-mono text-xs text-ink-soft block mb-1">
                {t('filter.tag')}
              </label>
              <Select
                value={(filters.tag as string) ?? 'all'}
                onValueChange={(v) => {
                  setFilter('tag', v === 'all' ? undefined : v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filter.all')}</SelectItem>
                  {allTags.map(tag => (
                    <SelectItem key={tag.slug} value={tag.slug}>
                      {tagDisplayName(tag, lang)} ({tag.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="font-mono text-xs text-ink-soft block mb-1">
              {t('filter.company')}
            </label>
            <Select
              value={(filters.company as string) ?? 'all'}
              onValueChange={(v) => {
                setFilter('company', v === 'all' ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter.all')}</SelectItem>
                {COMPANIES.map(c => (
                  <SelectItem key={c.slug} value={c.slug}>
                    <span className="inline-flex items-center gap-2">
                      <img
                        src={`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${c.domain}&size=32`}
                        alt=""
                        className="w-4 h-4"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {lang === 'zh' ? c.zh : c.name}
                    </span>
                  </SelectItem>
                ))}
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
              {t('problemList.showing', { shown: `${allItems.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, allItems.length)}`, total: displayTotal })}
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
                    <th className="py-2 pr-3 w-16 cursor-pointer hover:text-ink select-none" onClick={() => toggleSort('id')}>
                      <span className="inline-flex items-center gap-1">{t('problemList.no')} {sortBy === 'id' ? (sortDir === 'asc' ? <span className="text-emerald-600">▲</span> : <span className="text-emerald-600">▼</span>) : <span className="opacity-20">▲▼</span>}</span>
                    </th>
                    <th className="pr-3">{t('problemList.name')}</th>
                    <th className="pr-3 w-24 cursor-pointer hover:text-ink select-none" onClick={() => toggleSort('difficulty')}>
                      <span className="inline-flex items-center gap-1">{t('problemList.diff')} {sortBy === 'difficulty' ? (sortDir === 'asc' ? <span className="text-emerald-600">▲</span> : <span className="text-emerald-600">▼</span>) : <span className="opacity-20">▲▼</span>}</span>
                    </th>
                    <th className="pr-3 w-28">{t('filter.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-secondary/50 cursor-pointer" onClick={() => navigate(`/problems/${p.titleSlug}`)}>
                      <td className="py-2 pr-3 font-mono text-ink-soft">{p.frontendId}</td>
                      <td className="pr-3 py-2">
                        <Link
                          href={`/problems/${p.titleSlug}`}
                          className="font-medium hover:underline"
                        >
                          {lang === 'zh' ? p.titleZh || p.titleEn : p.titleEn}
                        </Link>
                        {Boolean(p.paidOnly) && (
                          <span className="ml-2 text-xs font-mono text-amber-700 uppercase">
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

              <div className="mt-4 flex items-center justify-center gap-4">
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
                  <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(1)} className="h-8 w-8 p-0 text-xs">«</Button>
                  <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 w-8 p-0 text-xs">‹</Button>
                  <span className="text-xs font-mono text-ink-soft px-2">{safePage} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 w-8 p-0 text-xs">›</Button>
                  <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)} className="h-8 w-8 p-0 text-xs">»</Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
