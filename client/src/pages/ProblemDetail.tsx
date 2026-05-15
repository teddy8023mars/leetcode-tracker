import { useState } from 'react';
import { Link } from 'wouter';
import { Streamdown } from 'streamdown';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';
import { ProblemContent } from '@/components/ProblemContent';
import type { CodeSnippet } from '@/components/SolutionTabs';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { SolvePanel } from '@/components/SolvePanel';
import { CodeBlock } from '@/components/CodeBlock';
import type { Difficulty } from '@shared/problemTypes';

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
};

type Tab = 'description' | 'solution' | 'solve';

export function ProblemDetail({ titleSlug }: { titleSlug: string }) {
  const t = useT();
  const { lang } = useLang();
  const q = trpc.problems.getBySlug.useQuery({ titleSlug }, { staleTime: 60_000 });
  const [tab, setTab] = useState<Tab>('description');

  if (q.isLoading) return <p className="text-ink-soft">{t('loading')}</p>;
  if (!q.data) return <p className="text-ink-soft">{t('empty')}</p>;
  const p = q.data as ProblemDetailRow;

  const wantZh = lang === 'zh';
  const usedZh = wantZh && !!p.contentZh;
  const content = wantZh ? p.contentZh || p.contentEn : p.contentEn;
  const snippets = (p.codeSnippetsJson ?? []) as CodeSnippet[];

  const containerWidth = tab === 'solve' ? 'max-w-[1600px]' : 'max-w-5xl';

  const descriptionCard = (
    <section className="bg-white/70 backdrop-blur border border-border rounded-lg p-6">
      <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
        <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest">
          {t('problem.description')}
        </h2>
        {wantZh && !usedZh && p.contentEn && (
          <span className="text-[11px] text-amber-700 font-mono">
            ZH not available — showing EN
          </span>
        )}
      </div>
      <ProblemContent html={content} />
    </section>
  );

  return (
    <div className={`${containerWidth} space-y-6`}>
      <div className="flex flex-col gap-2">
        <Link
          href="/problems"
          className="text-sm font-mono text-ink-soft hover:text-ink w-fit"
        >
          {t('problemList.backToProblems')}
        </Link>
        <header className="flex items-baseline gap-3 flex-wrap">
          <span className="font-mono text-ink-soft text-lg">#{p.frontendId}</span>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {wantZh ? p.titleZh || p.titleEn : p.titleEn}
          </h1>
          <DifficultyBadge difficulty={p.difficulty} />
        </header>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'description'} onClick={() => setTab('description')}>
          {t('problem.description')}
        </TabButton>
        <TabButton active={tab === 'solution'} onClick={() => setTab('solution')}>
          {t('problem.solutionTab')}
        </TabButton>
        <TabButton active={tab === 'solve'} onClick={() => setTab('solve')}>
          {t('judge.tab')}
        </TabButton>
      </div>

      {tab === 'description' && descriptionCard}

      {tab === 'solution' && <SolutionPanel problemId={p.id} />}

      {tab === 'solve' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            {descriptionCard}
          </div>
          <div className="lg:col-span-7">
            <section className="bg-white/70 backdrop-blur border border-border rounded-lg p-6">
              <SolvePanel
                problemId={p.id}
                titleSlug={p.titleSlug}
                codeSnippets={snippets}
              />
            </section>
          </div>
        </div>
      )}
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
  if (solutions.length === 0) {
    return <p className="text-ink-soft text-sm">{t('problem.noSolution')}</p>;
  }

  const preferred = lang === 'zh' ? 'zh' : 'en';
  const sol = solutions.find(s => s.language === preferred) ?? solutions[0];
  const cleaned = cleanSolutionMarkdown(sol.contentMarkdown);

  return (
    <div className="space-y-6">
      <section className="bg-white/70 backdrop-blur border border-border rounded-lg p-6">
        <div className="prose prose-sm max-w-none">
          <Streamdown>{cleaned}</Streamdown>
        </div>
      </section>

      {aiQ.isLoading && (
        <div className="bg-white/70 backdrop-blur border border-border rounded-lg p-6">
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
    <section className="bg-white/70 backdrop-blur border border-border rounded-lg p-6 space-y-5">
      <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest">
        {t('problem.aiSolution')}
      </h2>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">{t('problem.aiApproach')}</h3>
        <div className="prose prose-sm max-w-none">
          <Streamdown>{data.approachMarkdown}</Streamdown>
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">{t('problem.aiComplexity')}</h3>
        <div className="prose prose-sm max-w-none">
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
                'px-3 py-1 text-xs font-mono rounded transition-colors ' +
                (codeLang === key
                  ? 'bg-emerald-100 text-emerald-800'
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
          <div className="prose prose-sm max-w-none">
            <Streamdown>{data.pitfallsMarkdown}</Streamdown>
          </div>
        </div>
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'px-4 py-2 text-sm font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors ' +
        (active
          ? 'border-emerald-600 text-ink'
          : 'border-transparent text-ink-soft hover:text-ink')
      }
    >
      {children}
    </button>
  );
}
