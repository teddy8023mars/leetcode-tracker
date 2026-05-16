import { useEffect, useState } from 'react';
import { getHighlighter } from '@/lib/shiki';
import { useTheme } from '@/contexts/ThemeContext';

export function CodeBlock({
  language,
  code,
}: {
  language: 'python' | 'java' | 'cpp';
  code: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { resolved } = useTheme();
  const theme = resolved === 'dark' ? 'github-dark' : 'github-light';

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    const timer = setTimeout(() => {
      if (!cancelled) setFailed(true);
    }, 5000);
    getHighlighter()
      .then((h) => {
        if (cancelled) return;
        const out = h.codeToHtml(code, { lang: language, theme });
        clearTimeout(timer);
        setHtml(out);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [language, code, theme]);

  if (failed || !html) {
    return (
      <pre className="overflow-auto rounded-md bg-secondary p-4 font-mono text-sm">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="overflow-auto rounded-md bg-white dark:bg-slate-900 border border-border p-4 [&_pre]:!bg-transparent [&_pre]:!p-0 font-mono text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
