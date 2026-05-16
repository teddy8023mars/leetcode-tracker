import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { createPortal } from 'react-dom';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';
import { useTheme } from '@/contexts/ThemeContext';

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
  exampleTestcases?: string | null;
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

type EditorSettings = {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  relativeLineNumbers: boolean;
  vimMode: boolean;
};

const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: true,
  relativeLineNumbers: false,
  vimMode: false,
};

function loadEditorSettings(): EditorSettings {
  try {
    const saved = localStorage.getItem('lc.editorSettings');
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export function SolvePanel({ problemId, titleSlug, codeSnippets, exampleTestcases }: SolvePanelProps) {
  const t = useT();
  const { lang: uiLang } = useLang();
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const isLoggedIn = !!me.data;
  const { resolved: themeResolved } = useTheme();

  const vimDisposeRef = useRef<{ dispose: () => void } | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const statusBarRef = useRef<HTMLDivElement | null>(null);
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(loadEditorSettings);
  const [showSettings, setShowSettings] = useState(false);
  const updateSetting = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    setEditorSettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('lc.editorSettings', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (editorSettings.vimMode && editorRef.current && statusBarRef.current) {
      import('monaco-vim').then(({ initVimMode }) => {
        if (vimDisposeRef.current) vimDisposeRef.current.dispose();
        vimDisposeRef.current = initVimMode(editorRef.current!, statusBarRef.current!);
      });
    } else if (!editorSettings.vimMode && vimDisposeRef.current) {
      vimDisposeRef.current.dispose();
      vimDisposeRef.current = null;
    }
  }, [editorSettings.vimMode]);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    if (editorSettings.vimMode && statusBarRef.current) {
      import('monaco-vim').then(({ initVimMode }) => {
        vimDisposeRef.current = initVimMode(editor, statusBarRef.current!);
      });
    }
  }, [editorSettings.vimMode]);

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

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(s => !s)}
            className="px-2.5 py-1 text-sm font-mono text-ink-soft hover:text-ink hover:bg-secondary rounded transition-colors"
            title="Settings"
          >
            ⚙ Settings
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(codeKey(language));
              setCode(pickStarter(language, codeSnippets));
            }}
            className="px-2.5 py-1 text-sm font-mono text-ink-soft hover:text-ink hover:bg-secondary rounded transition-colors"
          >
            ↺ {t('problem.reset')}
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

      {showSettings && (
        <div className="flex items-center gap-5 flex-wrap text-sm font-mono border border-border rounded-lg px-4 py-3 bg-white/80 dark:bg-slate-800/80 dark:bg-slate-800/80">
          <label className="flex items-center gap-1.5">
            <span className="text-ink-soft">Font</span>
            <select value={editorSettings.fontSize} onChange={e => updateSetting('fontSize', Number(e.target.value))} className="border rounded px-1 py-0.5">
              {[12, 13, 14, 15, 16, 18, 20].map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-ink-soft">Tab</span>
            <select value={editorSettings.tabSize} onChange={e => updateSetting('tabSize', Number(e.target.value))} className="border rounded px-1 py-0.5">
              {[2, 4, 8].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={editorSettings.wordWrap} onChange={e => updateSetting('wordWrap', e.target.checked)} />
            <span className="text-ink-soft">Wrap</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={editorSettings.relativeLineNumbers} onChange={e => updateSetting('relativeLineNumbers', e.target.checked)} />
            <span className="text-ink-soft">Relative #</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={editorSettings.vimMode} onChange={e => updateSetting('vimMode', e.target.checked)} />
            <span className="text-ink-soft">Vim</span>
          </label>
        </div>
      )}

      <div className="border border-border rounded overflow-hidden resize-y" style={{ height: 400, minHeight: 200, overflow: 'hidden' }}>
        <Editor
          height="100%"
          language={MONACO_LANG[language]}
          value={code}
          onChange={(v) => setCode(v ?? '')}
          onMount={handleEditorMount}
          theme={themeResolved === 'dark' ? 'vs-dark' : 'vs'}
          options={{
            minimap: { enabled: false },
            fontSize: editorSettings.fontSize,
            tabSize: editorSettings.tabSize,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            wordWrap: editorSettings.wordWrap ? 'on' : 'off',
            automaticLayout: true,
            renderLineHighlight: 'line',
            lineNumbers: editorSettings.relativeLineNumbers ? 'relative' : 'on',
          }}
        />
        {editorSettings.vimMode && (
          <div ref={statusBarRef} className="px-3 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 border-t border-border" />
        )}
      </div>

      <BottomPanel
        result={result}
        runMut={runMut}
        verdictPill={verdictPill}
        exampleTestcases={exampleTestcases}
        t={t}
      />

      {isLoggedIn && (
        <section className="space-y-2">
          <h3 className="font-mono uppercase text-xs tracking-widest text-ink-soft">
            {t('judge.history')}
          </h3>
          {submissions.isLoading ? (
            <p className="text-sm text-ink-soft">{t('loading')}</p>
          ) : submissions.data && submissions.data.length > 0 ? (
            <ul className="border border-border rounded divide-y divide-border bg-white/60 dark:bg-slate-800/60 dark:bg-slate-800/60">
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
              <div className="text-xs font-mono uppercase tracking-widest text-ink-soft">
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
      <div className="text-xs font-mono uppercase tracking-widest text-ink-soft">{label}</div>
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

function parseExampleTestcases(raw: string | null | undefined): Array<{ label: string; lines: string[] }> {
  if (!raw) return [];
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  // Group lines into cases — heuristic: each case has the same number of params
  // Try grouping by 1, 2, 3 params and pick the one that divides evenly
  for (const groupSize of [2, 3, 1, 4]) {
    if (lines.length % groupSize === 0) {
      const cases: Array<{ label: string; lines: string[] }> = [];
      for (let i = 0; i < lines.length; i += groupSize) {
        cases.push({ label: `Case ${cases.length + 1}`, lines: lines.slice(i, i + groupSize) });
      }
      return cases;
    }
  }
  return [{ label: 'Case 1', lines }];
}

function BottomPanel({ result, runMut, verdictPill, exampleTestcases, t }: {
  result: unknown;
  runMut: { isPending: boolean; isError: boolean; error?: { message?: string } | null };
  verdictPill: React.ReactNode;
  exampleTestcases: string | null | undefined;
  t: (key: string) => string;
}) {
  const [bottomTab, setBottomTab] = useState<'cases' | 'result'>(result ? 'result' : 'cases');
  const [activeCase, setActiveCase] = useState(0);
  const cases = useMemo(() => parseExampleTestcases(exampleTestcases), [exampleTestcases]);
  const r = result as {
    verdict?: string; passedCount?: number; totalCount?: number; runtimeMs?: number;
    firstFail?: { i: number; input: unknown; expected: unknown; actual: unknown; error?: string };
    compileStderr?: string; stderr?: string;
  } | null;

  // Auto-switch to result tab when result arrives
  useEffect(() => { if (r) setBottomTab('result'); }, [r]);

  return (
    <div className="border border-border rounded-lg bg-white/60 dark:bg-slate-800/60 dark:bg-slate-800/60 overflow-hidden">
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setBottomTab('cases')}
          className={`px-4 py-2 text-xs font-mono ${bottomTab === 'cases' ? 'text-emerald-700 border-b-2 border-emerald-600 -mb-px' : 'text-ink-soft hover:text-ink'}`}
        >
          ☑ {t('judge.cases')}
        </button>
        <button
          type="button"
          onClick={() => setBottomTab('result')}
          className={`px-4 py-2 text-xs font-mono ${bottomTab === 'result' ? 'text-emerald-700 border-b-2 border-emerald-600 -mb-px' : 'text-ink-soft hover:text-ink'}`}
        >
          {'>'} {t('judge.case')}
          {r && (
            <span className={`ml-1.5 ${r.verdict === 'accepted' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {r.passedCount}/{r.totalCount}
            </span>
          )}
        </button>
      </div>

      <div className="p-4 max-h-64 overflow-y-auto">
        {bottomTab === 'cases' && (
          <div className="space-y-3">
            {cases.length === 0 ? (
              <p className="text-xs text-ink-soft font-mono">{t('empty')}</p>
            ) : (
              <>
                <div className="flex gap-1">
                  {cases.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveCase(i)}
                      className={`px-3 py-1 text-xs font-mono rounded ${activeCase === i ? 'bg-secondary text-ink' : 'text-ink-soft hover:text-ink'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                {cases[activeCase] && (
                  <div className="space-y-2">
                    {cases[activeCase].lines.map((line, i) => (
                      <div key={i}>
                        <pre className="bg-secondary/80 dark:bg-slate-700/80 rounded px-3 py-2 text-xs font-mono overflow-x-auto">{line}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {bottomTab === 'result' && (
          <div className="space-y-3">
            {runMut.isPending && (
              <p className="text-xs text-ink-soft font-mono">{t('judge.submitting')}</p>
            )}
            {runMut.isError && (
              <div className="text-rose-800 text-xs font-mono">{runMut.error?.message ?? 'submit failed'}</div>
            )}
            {!r && !runMut.isPending && !runMut.isError && (
              <p className="text-xs text-ink-soft font-mono">{t('judge.firstGenerationHint')}</p>
            )}
            {r && (
              <>
                {verdictPill}
                {r.firstFail && (
                  <div className="space-y-2 text-sm">
                    <h4 className="font-mono uppercase text-xs tracking-widest text-ink-soft">
                      {t('judge.failingCase')} · {t('judge.case')} {r.firstFail.i + 1}
                    </h4>
                    <CaseBlock label={t('judge.input')} value={r.firstFail.input} />
                    <CaseBlock label={t('judge.expected')} value={r.firstFail.expected} />
                    <CaseBlock label={t('judge.actual')} value={r.firstFail.actual} />
                    {r.firstFail.error && <CaseBlock label={t('judge.error')} value={r.firstFail.error} pre />}
                  </div>
                )}
                {r.compileStderr && <CaseBlock label={t('judge.stderr')} value={r.compileStderr} pre />}
                {!r.firstFail && r.stderr && r.verdict !== 'accepted' && (
                  <CaseBlock label={t('judge.stderr')} value={r.stderr} pre />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
