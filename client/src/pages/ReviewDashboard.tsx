import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useLang, useT } from '@/contexts/LangContext';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import type { Difficulty, ProgressStatus } from '@shared/problemTypes';

type ReviewProblem = {
  problemId: number;
  status: ProgressStatus;
  nextReviewAt?: Date | string | null;
  reviewCount?: number | null;
  frontendId: number;
  titleSlug: string;
  titleEn?: string | null;
  titleZh?: string | null;
  difficulty: Difficulty;
};

type RecentSubmission = {
  id: number;
  language: 'python' | 'java' | 'cpp';
  verdict: string;
  passedCount: number;
  totalCount: number;
  runtimeMs?: number | null;
  createdAt: Date | string;
  frontendId: number;
  titleSlug: string;
  titleEn?: string | null;
  titleZh?: string | null;
  difficulty: Difficulty;
};

const VERDICT_TONE: Record<string, string> = {
  accepted: 'bg-emerald-100 text-emerald-800',
  wrong_answer: 'bg-rose-100 text-rose-800',
  compile_error: 'bg-amber-100 text-amber-800',
  runtime_error: 'bg-orange-100 text-orange-800',
  time_limit_exceeded: 'bg-purple-100 text-purple-800',
  internal_error: 'bg-slate-200 text-slate-700',
};

function titleFor(p: { titleEn?: string | null; titleZh?: string | null }, lang: 'en' | 'zh') {
  return lang === 'zh' ? p.titleZh || p.titleEn || '' : p.titleEn || p.titleZh || '';
}

function formatDate(value: Date | string | null | undefined, locale: string) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(locale);
}

function StatBox({
  href,
  label,
  value,
  tone,
}: {
  href?: string;
  label: string;
  value: string | number;
  tone?: string;
}) {
  const className = [
    'block border border-border bg-white/70 dark:bg-slate-800/70 rounded-lg px-4 py-3',
    href ? 'hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors' : '',
  ].join(' ');
  const content = (
    <>
      <div className="font-mono text-xs uppercase tracking-widest text-ink-soft">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${tone ?? ''}`}>{value}</div>
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function ProblemRow({ problem }: { problem: ReviewProblem }) {
  const { lang } = useLang();
  const t = useT();
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  return (
    <Link
      href={`/problems/${problem.titleSlug}`}
      className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 border-t border-border px-3 py-3 hover:bg-secondary/60"
    >
      <span className="font-mono text-sm text-ink-soft">#{problem.frontendId}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{titleFor(problem, lang)}</span>
        {problem.nextReviewAt && (
          <span className="block text-xs text-ink-soft font-mono">
            {t('review.nextReview', { date: formatDate(problem.nextReviewAt, locale) })}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <StatusBadge status={problem.status} />
        <DifficultyBadge difficulty={problem.difficulty} />
      </span>
    </Link>
  );
}

export function ReviewDashboard() {
  const t = useT();
  const { lang } = useLang();
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  const dashboardQ = trpc.progress.dashboard.useQuery(undefined, { staleTime: 30_000 });
  const totalQ = trpc.problems.list.useQuery({ limit: 1 }, { staleTime: 60_000 });
  const meQ = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const isLoggedIn = Boolean(meQ.data);
  const recentQ = trpc.judge.listRecent.useQuery(
    { limit: 8 },
    { enabled: isLoggedIn, staleTime: 30_000 },
  );

  const dashboard = dashboardQ.data ?? {
    counts: { todo: 0, reviewing: 0, done: 0 },
    dueProblems: [] as ReviewProblem[],
    focusProblems: [] as ReviewProblem[],
  };
  const totalProblems = (totalQ.data as { total?: number } | undefined)?.total ?? 0;
  const tracked = dashboard.counts.todo + dashboard.counts.reviewing + dashboard.counts.done;
  const untracked = Math.max(totalProblems - tracked, 0);
  const completion = totalProblems > 0
    ? `${Math.round((dashboard.counts.done / totalProblems) * 100)}%`
    : '0%';
  const dueProblems = dashboard.dueProblems as ReviewProblem[];
  const focusProblems = dashboard.focusProblems as ReviewProblem[];
  const recent = (recentQ.data ?? []) as RecentSubmission[];

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('review.title')}</h1>
          <p className="text-sm text-ink-soft mt-1 font-mono">{t('review.subtitle')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/problems">{t('problemList.backToProblems')}</Link>
        </Button>
      </header>

      <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <StatBox label={t('review.statDue')} value={dueProblems.length} tone="text-orange-600" />
        <StatBox href="/problems?status=done" label={t('review.statDone')} value={dashboard.counts.done} tone="text-emerald-600" />
        <StatBox href="/problems?status=reviewing" label={t('review.statReviewing')} value={dashboard.counts.reviewing} tone="text-blue-600" />
        <StatBox href="/problems?status=todo" label={t('review.statTodo')} value={dashboard.counts.todo} tone="text-amber-600" />
        <StatBox label={t('review.statUntracked')} value={untracked} />
        <StatBox label={t('review.statCompletion')} value={completion} />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <section className="border border-border bg-white/70 dark:bg-slate-800/70 rounded-lg overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-ink-soft">
              {t('review.dueTitle')}
            </h2>
            <span className="font-mono text-xs text-ink-soft">{dueProblems.length}</span>
          </div>
          {dashboardQ.isLoading ? (
            <p className="border-t border-border px-4 py-6 text-sm text-ink-soft">{t('loading')}</p>
          ) : dueProblems.length > 0 ? (
            dueProblems.slice(0, 8).map((problem) => (
              <ProblemRow key={problem.problemId} problem={problem} />
            ))
          ) : (
            <p className="border-t border-border px-4 py-6 text-sm text-ink-soft">
              {t('review.dueEmpty')}
            </p>
          )}
        </section>

        <section className="border border-border bg-white/70 dark:bg-slate-800/70 rounded-lg overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-ink-soft">
              {t('review.focusTitle')}
            </h2>
            <span className="font-mono text-xs text-ink-soft">{focusProblems.length}</span>
          </div>
          {dashboardQ.isLoading ? (
            <p className="border-t border-border px-4 py-6 text-sm text-ink-soft">{t('loading')}</p>
          ) : focusProblems.length > 0 ? (
            focusProblems.map((problem) => <ProblemRow key={problem.problemId} problem={problem} />)
          ) : (
            <p className="border-t border-border px-4 py-6 text-sm text-ink-soft">
              {t('review.focusEmpty')}
            </p>
          )}
        </section>
      </div>

      <section className="border border-border bg-white/70 dark:bg-slate-800/70 rounded-lg overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-ink-soft">
            {t('review.recentTitle')}
          </h2>
          {isLoggedIn && (
            <span className="font-mono text-xs text-ink-soft">{recent.length}</span>
          )}
        </div>
        {!isLoggedIn ? (
          <p className="border-t border-border px-4 py-6 text-sm text-ink-soft">
            {t('review.recentLogin')}
          </p>
        ) : recentQ.isLoading ? (
          <p className="border-t border-border px-4 py-6 text-sm text-ink-soft">{t('loading')}</p>
        ) : recent.length > 0 ? (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm">
              <thead className="text-left text-ink-soft font-mono text-xs">
                <tr className="border-b border-border">
                  <th className="px-4 py-2">{t('problemList.name')}</th>
                  <th className="px-4 py-2">{t('judge.language')}</th>
                  <th className="px-4 py-2">{t('sync.statusLabel')}</th>
                  <th className="px-4 py-2">{t('judge.cases')}</th>
                  <th className="px-4 py-2">{t('judge.runtimeMs')}</th>
                  <th className="px-4 py-2">{t('review.submittedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <Link href={`/problems/${row.titleSlug}`} className="font-medium hover:underline">
                        #{row.frontendId} {titleFor(row, lang)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono">{row.language}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 font-mono text-xs ${VERDICT_TONE[row.verdict] ?? 'bg-secondary text-ink-soft'}`}>
                        {t(`judge.verdict.${row.verdict}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono">{row.passedCount}/{row.totalCount}</td>
                    <td className="px-4 py-2 font-mono">{row.runtimeMs ?? '-'}ms</td>
                    <td className="px-4 py-2 font-mono text-ink-soft">
                      {new Date(row.createdAt).toLocaleString(locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border-t border-border px-4 py-6 text-sm text-ink-soft">
            {t('review.recentEmpty')}
          </p>
        )}
      </section>
    </div>
  );
}
