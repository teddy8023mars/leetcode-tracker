import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { Streamdown } from 'streamdown';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';
import { ProblemContent } from '@/components/ProblemContent';
import type { CodeSnippet } from '@/components/SolutionTabs';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { SolvePanel } from '@/components/SolvePanel';
import { CodeBlock } from '@/components/CodeBlock';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import type { Difficulty } from '@shared/problemTypes';

type SimilarQuestion = { title: string; titleSlug: string; difficulty: string };

type ProblemDetailRow = {
  id: number;
  frontendId: number;
  titleEn: string;
  titleZh?: string | null;
  titleSlug: string;
  difficulty: Difficulty;
  contentEn?: string | null;
  contentZh?: string | null;
  codeSnippetsJson?: CodeSnippet[] | null;
  similarQuestionsJson?: SimilarQuestion[] | null;
  topicTagsJson?: { name: string; slug: string }[] | null;
};

export function ProblemDetail({ titleSlug }: { titleSlug: string }) {
  const t = useT();
  const { lang } = useLang();
  const q = trpc.problems.getBySlug.useQuery({ titleSlug }, { staleTime: 60_000 });
  const allQ = trpc.problems.list.useQuery({ limit: 200 }, { staleTime: 120_000 });
  const problemId = (q.data as ProblemDetailRow | undefined)?.id ?? 0;
  const companyQ = trpc.problems.companyTags.useQuery({ problemId }, { staleTime: 120_000, enabled: problemId > 0 });

  const { prev, next } = useMemo(() => {
    const all = ((allQ.data as { items?: unknown[] } | undefined)?.items ?? []) as Array<{ frontendId: number; titleSlug: string }>;
    const sorted = [...all].sort((a, b) => a.frontendId - b.frontendId);
    const idx = sorted.findIndex(x => x.titleSlug === titleSlug);
    return {
      prev: idx > 0 ? sorted[idx - 1] : null,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [allQ.data, titleSlug]);

  if (q.isLoading) return <p className="text-ink-soft">{t('loading')}</p>;
  if (!q.data) return <p className="text-ink-soft">{t('empty')}</p>;
  const p = q.data as ProblemDetailRow;

  const wantZh = lang === 'zh';
  const usedZh = wantZh && !!p.contentZh;
  const content = wantZh ? p.contentZh || p.contentEn : p.contentEn;
  const snippets = (p.codeSnippetsJson ?? []) as CodeSnippet[];

  const similarQuestions = (p.similarQuestionsJson ?? []) as SimilarQuestion[];
  const topicTags = (p.topicTagsJson ?? []) as { name: string; slug: string }[];
  const companies = (companyQ.data ?? []) as Array<{ companySlug: string; companyName: string }>;
  const uniqueCompanies = Array.from(new Map(companies.map(c => [c.companySlug, c])).values());

  const descriptionCard = (
    <section className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border border-border rounded-lg p-6">
      <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
        <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest">
          {t('problem.description')}
        </h2>
        {wantZh && !usedZh && p.contentEn && (
          <span className="text-xs text-amber-700 font-mono">
            ZH not available — showing EN
          </span>
        )}
      </div>
      <ProblemContent html={content} />
    </section>
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Link
            href="/problems"
            className="text-sm font-mono text-ink-soft hover:text-ink w-fit"
          >
            {t('problemList.backToProblems')}
          </Link>
          <div className="flex items-center gap-2">
            {prev && (
              <Link href={`/problems/${prev.titleSlug}`} className="text-sm font-mono text-ink-soft hover:text-ink px-2 py-1 hover:bg-secondary rounded">
                ← #{prev.frontendId}
              </Link>
            )}
            {next && (
              <Link href={`/problems/${next.titleSlug}`} className="text-sm font-mono text-ink-soft hover:text-ink px-2 py-1 hover:bg-secondary rounded">
                #{next.frontendId} →
              </Link>
            )}
          </div>
        </div>
        <header className="flex items-baseline gap-3 flex-wrap">
          <span className="font-mono text-ink-soft text-lg">#{p.frontendId}</span>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {wantZh ? p.titleZh || p.titleEn : p.titleEn}
          </h1>
          <DifficultyBadge difficulty={p.difficulty} />
        </header>
        {(topicTags.length > 0 || uniqueCompanies.length > 0) && (
          <div className="flex gap-1.5 flex-wrap items-center">
            {topicTags.map(tag => (
              <span key={tag.slug} className="px-2.5 py-1 text-xs font-mono bg-secondary rounded text-ink-soft">
                {tag.name}
              </span>
            ))}
            {uniqueCompanies.length > 0 && topicTags.length > 0 && (
              <span className="text-border mx-1">|</span>
            )}
            {uniqueCompanies.map(c => (
              <span key={c.companySlug} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded" title={c.companyName}>
                <img
                  src={`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${c.companySlug === 'bytedance' ? 'jobs.bytedance.com' : c.companySlug === 'shopee' ? 'shopee.sg' : c.companySlug === 'didi' ? 'didiglobal.com' : c.companySlug + '.com'}&size=32`}
                  alt=""
                  className="w-4 h-4"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                {c.companyName}
              </span>
            ))}
          </div>
        )}
        <ProgressSection problemId={p.id} />
      </div>

      <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-12rem)]">
        <ResizablePanel defaultSize={40} minSize={20}>
          <div className="h-full overflow-y-auto pr-2 space-y-4">
            {descriptionCard}
            <SolutionPanel problemId={p.id} />
            {similarQuestions.length > 0 && (
              <section className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border border-border rounded-lg p-4">
                <h3 className="font-mono text-xs uppercase text-ink-soft tracking-widest mb-3">
                  {t('problem.relatedProblems')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {similarQuestions.slice(0, 8).map(sq => (
                    <Link
                      key={sq.titleSlug}
                      href={`/problems/${sq.titleSlug}`}
                      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-mono bg-secondary/50 hover:bg-secondary rounded transition-colors"
                    >
                      <span>{sq.title}</span>
                      <DifficultyBadge difficulty={sq.difficulty as Difficulty} />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="h-full flex flex-col">
            <section className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border border-border rounded-lg p-6 flex-1 overflow-hidden flex flex-col">
              <SolvePanel
                problemId={p.id}
                titleSlug={p.titleSlug}
                codeSnippets={snippets}
                exampleTestcases={(p as { exampleTestcases?: string | null }).exampleTestcases}
              />
            </section>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function cleanSolutionMarkdown(raw: string): string {
  return raw
    .replace(/^\[TOC\]\s*/i, '')
    .replace(/## Video Solution[\s\S]*?(?=## )/i, '')
    .replace(/<div[^>]*>[\s\S]*?<iframe[^>]*vimeo[^>]*>[\s\S]*?<\/iframe>[\s\S]*?<\/div>/gi, '')
    .replace(/<div>&nbsp;\s*<\/div>/gi, '')
    .replace(/<iframe[^>]*leetcode\.com\/playground\/([^/]+)\/shared[^>]*><\/iframe>\s*/gi,
      '> *See full code on [LeetCode Playground](https://leetcode.com/playground/$1/shared)*\n\n')
    .replace(/\{:align="[^"]*"\}/g, '')
    .replace(/!\[[^\]]*\]\(https?:\/\/leetcode\.cn\/[^)]+\)/g, '')
    .trim();
}

function SolutionPanel({ problemId }: { problemId: number }) {
  const t = useT();
  const { lang } = useLang();
  const q = trpc.problems.solutions.useQuery({ problemId }, { staleTime: 60_000 });
  const aiQ = trpc.aiSolutions.get.useQuery(
    { problemId, language: lang as 'en' | 'zh' },
    { staleTime: 5 * 60_000 },
  );

  if (q.isLoading) return <p className="text-ink-soft">{t('loading')}</p>;

  const solutions = q.data ?? [];
  const preferred = lang === 'zh' ? 'zh' : 'en';
  const preferredSol = solutions.find(s => s.language === preferred);
  const sol = preferredSol ?? (lang === 'zh' ? null : solutions[0] ?? null);
  const cleaned = sol ? cleanSolutionMarkdown(sol.contentMarkdown) : null;

  return (
    <div className="space-y-6">
      {cleaned != null ? (
        <section className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border border-border rounded-lg p-6">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Streamdown>{cleaned}</Streamdown>
          </div>
        </section>
      ) : (
        <p className="text-ink-soft text-sm">{t('problem.noSolution')}</p>
      )}

      {aiQ.isLoading && (
        <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border border-border rounded-lg p-6">
          <div className="h-4 rounded bg-secondary animate-pulse w-1/3 mb-4" />
          <div className="space-y-2">
            <div className="h-3 rounded bg-secondary animate-pulse w-full" />
            <div className="h-3 rounded bg-secondary animate-pulse w-5/6" />
            <div className="h-3 rounded bg-secondary animate-pulse w-4/6" />
          </div>
        </div>
      )}

      {!aiQ.isLoading && aiQ.data && (
        <AiSolutionSection data={aiQ.data} />
      )}
    </div>
  );
}

type AiSolutionData = {
  approachMarkdown: string;
  complexityMarkdown: string;
  pythonCode: string;
  javaCode: string;
  cppCode: string;
  pitfallsMarkdown?: string | null;
};

function AiSolutionSection({ data }: { data: AiSolutionData }) {
  const t = useT();
  const [codeLang, setCodeLang] = useState<'python' | 'java' | 'cpp'>('python');

  const codeTabs: { key: 'python' | 'java' | 'cpp'; label: string }[] = [
    { key: 'python', label: t('problem.code.python') },
    { key: 'java', label: t('problem.code.java') },
    { key: 'cpp', label: t('problem.code.cpp') },
  ];

  const codeByLang: Record<'python' | 'java' | 'cpp', string> = {
    python: data.pythonCode,
    java: data.javaCode,
    cpp: data.cppCode,
  };

  return (
    <section className="bg-gradient-to-br from-emerald-50/80 to-white/70 dark:from-emerald-950/50 dark:to-slate-800/70 backdrop-blur border border-emerald-200 dark:border-emerald-800 rounded-lg p-6 space-y-5">
      <div className="flex items-center gap-2 border-b border-emerald-200 dark:border-emerald-800 pb-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">AI</span>
        <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest">
          {t('problem.aiSolution')}
        </h2>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">{t('problem.aiApproach')}</h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <Streamdown>{data.approachMarkdown}</Streamdown>
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">{t('problem.aiComplexity')}</h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <Streamdown>{data.complexityMarkdown}</Streamdown>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-1">
          {codeTabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setCodeLang(key)}
              className={
                'px-3 py-1.5 text-sm font-mono rounded transition-colors ' +
                (codeLang === key
                  ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-secondary text-ink-soft hover:text-ink')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <CodeBlock language={codeLang} code={codeByLang[codeLang]} />
      </div>

      {data.pitfallsMarkdown && data.pitfallsMarkdown.trim() !== '' && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-ink">{t('problem.aiPitfalls')}</h3>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Streamdown>{data.pitfallsMarkdown}</Streamdown>
          </div>
        </div>
      )}
    </section>
  );
}

function ProgressSection({ problemId }: { problemId: number }) {
  const t = useT();
  const utils = trpc.useUtils();
  const q = trpc.progress.get.useQuery({ problemId }, { staleTime: 30_000 });
  const mutation = trpc.progress.update.useMutation({
    onSuccess: () => {
      utils.progress.get.invalidate({ problemId });
      utils.progress.listDue.invalidate();
      utils.progress.listAll.invalidate();
    },
  });
  const [showRating, setShowRating] = useState(false);

  const currentStatus = (q.data?.status as 'todo' | 'reviewing' | 'done' | undefined) ?? undefined;
  const nextReview = q.data?.nextReviewAt ? new Date(q.data.nextReviewAt) : null;

  const statusButtons: { status: 'todo' | 'reviewing' | 'done'; label: string; activeClass: string }[] = [
    { status: 'todo', label: t('progress.todo'), activeClass: 'bg-secondary text-ink' },
    { status: 'reviewing', label: t('progress.reviewing'), activeClass: 'bg-pink-100 text-pink-800' },
    { status: 'done', label: t('progress.done'), activeClass: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200' },
  ];

  const handleStatus = (status: 'todo' | 'reviewing' | 'done') => {
    if (status === 'done') {
      setShowRating(true);
    } else {
      setShowRating(false);
      mutation.mutate({ problemId, status });
    }
  };

  const handleRate = (quality: number) => {
    mutation.mutate({ problemId, status: 'done', quality });
    setShowRating(false);
  };

  const ratings = [
    { quality: 1, label: t('progress.rate1'), color: 'bg-red-100 text-red-700' },
    { quality: 2, label: t('progress.rate2'), color: 'bg-orange-100 text-orange-700' },
    { quality: 3, label: t('progress.rate3'), color: 'bg-yellow-100 text-yellow-700' },
    { quality: 4, label: t('progress.rate4'), color: 'bg-blue-100 text-blue-700' },
    { quality: 5, label: t('progress.rate5'), color: 'bg-emerald-100 text-emerald-700' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {statusButtons.map((btn) => (
          <button
            key={btn.status}
            type="button"
            onClick={() => handleStatus(btn.status)}
            disabled={mutation.isPending}
            className={
              'px-3 py-1.5 text-sm font-mono rounded transition-colors ' +
              (currentStatus === btn.status
                ? btn.activeClass
                : 'bg-secondary/50 text-ink-soft hover:text-ink')
            }
          >
            {btn.label}
          </button>
        ))}
        {nextReview && currentStatus === 'done' && (
          <span className="text-xs text-ink-soft font-mono">
            {t('progress.nextReview', { date: nextReview.toLocaleDateString() })}
          </span>
        )}
      </div>
      {showRating && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-ink-soft">{t('progress.rateTitle')}</span>
          {ratings.map((r) => (
            <button
              key={r.quality}
              type="button"
              onClick={() => handleRate(r.quality)}
              disabled={mutation.isPending}
              className={`px-3 py-1.5 text-sm font-mono rounded ${r.color} hover:opacity-80`}
            >
              {r.quality} {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

