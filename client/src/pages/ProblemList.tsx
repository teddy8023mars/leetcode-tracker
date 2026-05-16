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
};

const PAGE_SIZES = [20, 50, 100];

const TAG_ZH: Record<string, string> = {
  'array': '数组', 'string': '字符串', 'hash-table': '哈希表',
  'dynamic-programming': '动态规划', 'two-pointers': '双指针',
  'depth-first-search': '深度优先搜索', 'tree': '树',
  'binary-tree': '二叉树', 'breadth-first-search': '广度优先搜索',
  'linked-list': '链表', 'math': '数学', 'matrix': '矩阵',
  'divide-and-conquer': '分治', 'sorting': '排序', 'stack': '栈',
  'binary-search': '二分查找', 'backtracking': '回溯',
  'recursion': '递归', 'greedy': '贪心', 'bit-manipulation': '位运算',
  'sliding-window': '滑动窗口', 'heap-priority-queue': '堆（优先队列）',
  'design': '设计', 'trie': '字典树', 'binary-search-tree': '二叉搜索树',
  'monotonic-stack': '单调栈', 'simulation': '模拟',
  'union-find': '并查集', 'graph-theory': '图论', 'counting': '计数',
  'prefix-sum': '前缀和', 'merge-sort': '归并排序',
  'memoization': '记忆化搜索', 'topological-sort': '拓扑排序',
  'quickselect': '快速选择', 'queue': '队列', 'graph': '图',
  'monotonic-queue': '单调队列', 'string-matching': '字符串匹配',
  'combinatorics': '组合数学', 'doubly-linked-list': '双向链表',
  'geometry': '几何', 'iterator': '迭代器', 'counting-sort': '计数排序',
  'data-stream': '数据流', 'bucket-sort': '桶排序',
  'randomized': '随机化', 'shortest-path': '最短路径',
  'number-theory': '数论', 'bitmask': '状态压缩',
  'ordered-set': '有序集合', 'line-sweep': '扫描线',
  'enumeration': '枚举', 'interactive': '交互',
  'hash-function': '哈希函数', 'rolling-hash': '滚动哈希',
  'brainteaser': '脑筋急转弯', 'database': '数据库',
  'concurrency': '多线程', 'probability-and-statistics': '概率与统计',
  'suffix-array': '后缀数组', 'segment-tree': '线段树',
  'binary-indexed-tree': '树状数组', 'game-theory': '博弈论',
};

export function ProblemList() {
  const t = useT();
  const { lang } = useLang();
  const [, navigate] = useLocation();
  const { filters, setFilter, reset } = useFilters({ defaults: {} });
  const search = useDebounce(filters.search as string | undefined, 300);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'id' | 'difficulty'>('id');

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

  const rawItems = (query.data?.items ?? []) as ProblemRow[];

  const allTags = useMemo(() => {
    const tagCount = new Map<string, { name: string; count: number }>();
    for (const p of rawItems) {
      for (const t of (p.topicTagsJson ?? [])) {
        const existing = tagCount.get(t.slug);
        if (existing) existing.count++;
        else tagCount.set(t.slug, { name: t.name, count: 1 });
      }
    }
    return Array.from(tagCount.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([slug, { name, count }]) => ({ slug, name, count }));
  }, [rawItems]);

  const tagFilter = filters.tag as string | undefined;
  const DIFF_ORDER: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 };
  const filteredItems = tagFilter
    ? rawItems.filter(p => (p.topicTagsJson ?? []).some(t => t.slug === tagFilter))
    : rawItems;
  const allItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'difficulty') return (DIFF_ORDER[a.difficulty] ?? 1) - (DIFF_ORDER[b.difficulty] ?? 1);
    return a.frontendId - b.frontendId;
  });
  const total = allItems.length;
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
                      {lang === 'zh' ? (TAG_ZH[tag.slug] ?? tag.name) : tag.name} ({tag.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
              {t('problemList.showing', { shown: `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, allItems.length)}`, total: allItems.length })}
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
                    <th className="py-2 pr-3 w-16 cursor-pointer hover:text-ink" onClick={() => { setSortBy('id'); setPage(1); }}>
                      {t('problemList.no')} {sortBy === 'id' && '↑'}
                    </th>
                    <th className="pr-3">{t('problemList.name')}</th>
                    <th className="pr-3 w-24 cursor-pointer hover:text-ink" onClick={() => { setSortBy('difficulty'); setPage(1); }}>
                      {t('problemList.diff')} {sortBy === 'difficulty' && '↑'}
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
