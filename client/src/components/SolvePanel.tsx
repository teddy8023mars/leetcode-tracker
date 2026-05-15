import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { createPortal } from 'react-dom';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';

interface CodeSnippet {
  lang?: string;
  langSlug?: string;
  code?: string;
}

type Lang = 'python' | 'java' | 'cpp';

const LANG_LABELS: Record<Lang, string> = {
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
};

const LANG_TO_SNIPPET: Record<Lang, string[]> = {
  python: ['python3', 'python'],
  java: ['java'],
  cpp: ['cpp'],
};

const MONACO_LANG: Record<Lang, string> = {
  python: 'python',
  java: 'java',
  cpp: 'cpp',
};

const STARTER: Record<Lang, string> = {
  python:
    `class Solution:\n    def solve(self, *args):\n        # Write your code here\n        return None\n`,
  java:
    `class Solution {\n    // Write your code here\n}\n`,
  cpp:
    `class Solution {\npublic:\n    // Write your code here\n};\n`,
};

function pickStarter(lang: Lang, snippets: CodeSnippet[] | null | undefined): string {
  if (!snippets || !Array.isArray(snippets)) return STARTER[lang];
  const wanted = LANG_TO_SNIPPET[lang];
  const match = snippets.find((s) => {
    const slug = (s?.langSlug || '').toLowerCase();
    return wanted.includes(slug);
  });
  return match?.code || STARTER[lang];
}

export interface SolvePanelProps {
  problemId: number;
  titleSlug: string;
  codeSnippets: CodeSnippet[] | null | undefined;
}

type Verdict =
  | 'accepted'
  | 'wrong_answer'
  | 'compile_error'
  | 'runtime_error'
  | 'time_limit_exceeded'
  | 'internal_error';

const VERDICT_TONE: Record<Verdict, string> = {
  accepted: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  wrong_answer: 'bg-rose-50 text-rose-800 border-rose-300',
  compile_error: 'bg-amber-50 text-amber-800 border-amber-300',
  runtime_error: 'bg-orange-50 text-orange-800 border-orange-300',
  time_limit_exceeded: 'bg-purple-50 text-purple-800 border-purple-300',
  internal_error: 'bg-slate-100 text-slate-800 border-slate-300',
};

export function SolvePanel({ problemId, titleSlug, codeSnippets }: SolvePanelProps) {
  const t = useT();
  const { lang: uiLang } = useLang();
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const isLoggedIn = !!me.data;

  const codeKey = (l: Lang) => `lc.code.${titleSlug}.${l}`;
  const [language, setLanguage] = useState<Lang>('python');
  const [code, setCode] = useState<string>(() => {
    const saved = localStorage.getItem(codeKey('python'));
    return saved || pickStarter('python', codeSnippets);
  });
  const [seededLang, setSeededLang] = useState<Lang>('python');
  const [openSubmissionId, setOpenSubmissionId] = useState<number | null>(null);

  // Reseed code when language switches.
  useEffect(() => {
    if (language !== seededLang) {
      const saved = localStorage.getItem(codeKey(language));
      setCode(saved || pickStarter(language, codeSnippets));
      setSeededLang(language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Auto-save code to localStorage
  useEffect(() => {
    const starter = pickStarter(language, codeSnippets);
    if (code !== starter) {
      localStorage.setItem(codeKey(language), code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const utils = trpc.useUtils();
  const runMut = trpc.judge.run.useMutation({
    onSuccess: () => {
      utils.judge.listSubmissions.invalidate({ problemId });
    },
  });

  // Ctrl+Enter to submit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !runMut.isPending && code.trim().length > 0) {
        e.preventDefault();
        runMut.mutate({ problemId, language, code });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [code, language, problemId, runMut]);

  const submissions = trpc.judge.listSubmissions.useQuery(
    { problemId, limit: 10 },
    { enabled: isLoggedIn, staleTime: 5_000 },
  );

  const result = runMut.data;

  const verdictPill = useMemo(() => {
    if (!result) return null;
    const verdict = result.verdict as Verdict;
    const tone = VERDICT_TONE[verdict];
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-mono ${tone}`}>
        <span className="font-semibold">{t(`judge.verdict.${verdict}` as never)}</span>
        <span className="opacity-70">
          {t('judge.pillCases')
            .replace('{passed}', String(result.passedCount))
            .replace('{total}', String(result.totalCount))}
        </span>
        {typeof result.runtimeMs === 'number' && (
          <span className="opacity-70">· {result.runtimeMs}ms</span>
        )}
      </div>
    );
  }, [result, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-mono uppercase tracking-widest text-ink-soft">
          {t('judge.language')}
        </span>
        <span className="text-sm font-mono">{LANG_LABELS[language]}</span>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(codeKey(language));
              setCode(pickStarter(language, codeSnippets));
            }}
            className="text-[11px] font-mono text-ink-soft hover:text-ink"
          >
            {t('problem.reset')}
          </button>
          <button
            type="button"
            disabled={runMut.isPending || code.trim().length === 0}
            onClick={() =>
              runMut.mutate({
                problemId,
                language,
                code,
              })
            }
            className="px-4 py-1.5 rounded bg-emerald-600 text-white font-mono text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Ctrl+Enter"
          >
            {runMut.isPending ? t('judge.submitting') : `${t('judge.submit')} ⌘↵`}
          </button>
        </div>
      </div>

      <div className="border border-border rounded overflow-hidden">
        <Editor
          height="500px"
          language={MONACO_LANG[language]}
          value={code}
          onChange={(v) => setCode(v ?? '')}
          theme="vs"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            tabSize: 4,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            renderLineHighlight: 'line',
          }}
        />
      </div>

      {runMut.isPending && (
        <p className="text-xs text-ink-soft font-mono">
          {t('judge.firstGenerationHint')}
        </p>
      )}

      {runMut.isError && (
        <div className="border border-rose-300 bg-rose-50 text-rose-800 rounded px-3 py-2 text-sm font-mono">
          {runMut.error?.message ?? 'submit failed'}
        </div>
      )}

      {result && (
        <section className="space-y-3 border border-border rounded-lg p-4 bg-white/60">
          {verdictPill}

          {result.firstFail && (
            <div className="space-y-2 text-sm">
              <h4 className="font-mono uppercase text-xs tracking-widest text-ink-soft">
                {t('judge.failingCase')} · {t('judge.case')} {result.firstFail.i + 1}
              </h4>
              <CaseBlock label={t('judge.input')} value={result.firstFail.input} />
              <CaseBlock label={t('judge.expected')} value={result.firstFail.expected} />
              <CaseBlock label={t('judge.actual')} value={result.firstFail.actual} />
              {result.firstFail.error && (
                <CaseBlock label={t('judge.error')} value={result.firstFail.error} pre />
              )}
            </div>
          )}

          {result.compileStderr && (
            <CaseBlock label={t('judge.stderr')} value={result.compileStderr} pre />
          )}

          {!result.firstFail && result.stderr && result.verdict !== 'accepted' && (
            <CaseBlock label={t('judge.stderr')} value={result.stderr} pre />
          )}
        </section>
      )}

      {isLoggedIn && (
        <section className="space-y-2">
          <h3 className="font-mono uppercase text-xs tracking-widest text-ink-soft">
            {t('judge.history')}
          </h3>
          {submissions.isLoading ? (
            <p className="text-sm text-ink-soft">{t('loading')}</p>
          ) : submissions.data && submissions.data.length > 0 ? (
            <ul className="border border-border rounded divide-y divide-border bg-white/60">
              {submissions.data.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setOpenSubmissionId(s.id)}
                    className="w-full px-3 py-2 flex items-center gap-3 text-sm font-mono text-left hover:bg-emerald-50/60 transition-colors cursor-pointer"
                  >
                    <VerdictDot verdict={s.verdict as Verdict} />
                    <span className="font-semibold w-44 truncate">
                      {t(`judge.verdict.${s.verdict}` as never)}
                    </span>
                    <span className="text-ink-soft w-20">{LANG_LABELS[s.language as Lang]}</span>
                    <span className="text-ink-soft w-28">
                      {s.passedCount}/{s.totalCount}
                    </span>
                    <span className="text-ink-soft w-24">
                      {typeof s.runtimeMs === 'number' ? `${s.runtimeMs}ms` : '\u2014'}
                    </span>
                    <span className="text-ink-soft text-xs ml-auto">
                      {new Date(s.createdAt as unknown as string).toLocaleString(uiLang === 'zh' ? 'zh-CN' : 'en-US')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">{t('judge.historyEmpty')}</p>
          )}
        </section>
      )}

      <div className="hidden">{titleSlug}</div>

      <SubmissionDetailDialog
        submissionId={openSubmissionId}
        onClose={() => setOpenSubmissionId(null)}
      />
    </div>
  );
}

function SubmissionDetailDialog({
  submissionId,
  onClose,
}: {
  submissionId: number | null;
  onClose: () => void;
}) {
  const t = useT();
  const { lang: uiLang } = useLang();
  const open = submissionId !== null;
  const q = trpc.judge.getSubmission.useQuery(
    { id: submissionId ?? 0 },
    { enabled: open, staleTime: 60_000 },
  );

  const sub = q.data;
  const result = sub?.resultJson as
    | {
        firstFail?: {
          i: number;
          input: unknown;
          expected: unknown;
          actual: unknown;
          error: string | null;
        } | null;
        stderr?: string;
        compileStderr?: string | null;
      }
    | null
    | undefined;

  const verdict = (sub?.verdict ?? 'internal_error') as Verdict;

  // Reset position whenever a new submission is opened (anchor near top-center).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (open) setPos(null);
  }, [open, submissionId]);

  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return; // don't start drag from close btn
    e.preventDefault();
    const cur = pos ?? defaultAnchor();
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: cur.x, baseY: cur.y };
    const onMove = (ev: PointerEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = ev.clientX - ds.startX;
      const dy = ev.clientY - ds.startY;
      const nx = Math.max(8, Math.min(window.innerWidth - 80, ds.baseX + dx));
      const ny = Math.max(8, Math.min(window.innerHeight - 40, ds.baseY + dy));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const anchor = pos ?? defaultAnchor();

  const node = (
    <div
      role="dialog"
      aria-modal="false"
      style={{ position: 'fixed', top: anchor.y, left: anchor.x, zIndex: 60, maxWidth: 'min(900px, 92vw)', maxHeight: '82vh' }}
      className="flex flex-col rounded-lg border border-border bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5"
    >
      <div
        onPointerDown={onDragStart}
        className="flex items-center gap-3 px-4 py-2 border-b border-border bg-slate-50 rounded-t-lg cursor-move select-none"
      >
        <span className="font-mono text-sm font-semibold">
          {sub
            ? `${t(`judge.verdict.${verdict}` as never)} · ${LANG_LABELS[(sub.language as Lang) ?? 'python']} · ${sub.passedCount}/${sub.totalCount}`
            : t('loading')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-ink-soft hover:bg-slate-200 hover:text-ink"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="px-4 py-3 overflow-auto">
        {q.isLoading && <p className="text-sm text-ink-soft">{t('loading')}</p>}

        {sub && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap text-xs font-mono text-ink-soft">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${VERDICT_TONE[verdict]}`}
              >
                <span className="font-semibold">{t(`judge.verdict.${verdict}` as never)}</span>
                <span className="opacity-70">
                  {sub.passedCount}/{sub.totalCount}
                </span>
                {typeof sub.runtimeMs === 'number' && (
                  <span className="opacity-70">· {sub.runtimeMs}ms</span>
                )}
              </div>
              <span>
                {new Date(sub.createdAt as unknown as string).toLocaleString(
                  uiLang === 'zh' ? 'zh-CN' : 'en-US',
                )}
              </span>
            </div>

            {result?.firstFail && (
              <div className="space-y-2 text-sm">
                <h4 className="font-mono uppercase text-xs tracking-widest text-ink-soft">
                  {t('judge.failingCase')} · {t('judge.case')} {result.firstFail.i + 1}
                </h4>
                <CaseBlock label={t('judge.input')} value={result.firstFail.input} />
                <CaseBlock label={t('judge.expected')} value={result.firstFail.expected} />
                <CaseBlock label={t('judge.actual')} value={result.firstFail.actual} />
                {result.firstFail.error && (
                  <CaseBlock label={t('judge.error')} value={result.firstFail.error} pre />
                )}
              </div>
            )}

            {result?.compileStderr && (
              <CaseBlock label={t('judge.stderr')} value={result.compileStderr} pre />
            )}

            {!result?.firstFail && result?.stderr && verdict !== 'accepted' && (
              <CaseBlock label={t('judge.stderr')} value={result.stderr} pre />
            )}

            <div className="space-y-1">
              <div className="text-[11px] font-mono uppercase tracking-widest text-ink-soft">
                {t('judge.code')}
              </div>
              <pre className="text-xs font-mono bg-slate-50 border border-border rounded p-3 overflow-auto whitespace-pre">
                {sub.code}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function defaultAnchor(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 100, y: 100 };
  const w = Math.min(window.innerWidth * 0.92, 900);
  return { x: Math.max(16, (window.innerWidth - w) / 2), y: Math.max(16, window.innerHeight * 0.08) };
}

function CaseBlock({ label, value, pre }: { label: string; value: unknown; pre?: boolean }) {
  let display: string;
  if (value === null || value === undefined) display = String(value);
  else if (typeof value === 'string') display = value;
  else {
    try {
      display = JSON.stringify(value, null, 2);
    } catch {
      display = String(value);
    }
  }
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-mono uppercase tracking-widest text-ink-soft">{label}</div>
      <pre className={`text-xs font-mono bg-slate-50 border border-border rounded p-2 overflow-auto whitespace-pre${pre ? '-wrap' : ''} max-h-48`}>
        {display}
      </pre>
    </div>
  );
}

function VerdictDot({ verdict }: { verdict: Verdict }) {
  const color =
    verdict === 'accepted'
      ? 'bg-emerald-500'
      : verdict === 'wrong_answer'
      ? 'bg-rose-500'
      : verdict === 'time_limit_exceeded'
      ? 'bg-purple-500'
      : verdict === 'compile_error'
      ? 'bg-amber-500'
      : verdict === 'runtime_error'
      ? 'bg-orange-500'
      : 'bg-slate-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}
