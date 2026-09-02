import { useState } from 'react';
import { Lightbulb, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';

import { Button } from '@/components/ui/button';
import { useT } from '@/contexts/LangContext';

export function StudyHintPanel({
  hints,
  completed,
}: {
  hints: readonly [string, string, string] | readonly string[];
  completed: boolean;
}) {
  const t = useT();
  const [revealed, setRevealed] = useState(0);
  return (
    <section className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/35 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-700" />
          <div><h2 className="font-semibold">{t('studyHints.title')}</h2><p className="text-xs text-ink-soft">{t('studyHints.subtitle')}</p></div>
        </div>
        {completed && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />{t('studyHints.completed')}</span>}
      </div>
      {revealed > 0 && (
        <ol className="space-y-2">
          {hints.slice(0, revealed).map((hint, index) => (
            <li key={`${index}-${hint}`} className="flex gap-3 rounded-lg bg-white/75 dark:bg-slate-900/50 p-3 text-sm">
              <span className="font-mono text-amber-700 font-bold">{index + 1}</span><span>{hint}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        {revealed < hints.length && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRevealed((count) => count + 1)}>
            {t('studyHints.reveal', { number: revealed + 1 })}
          </Button>
        )}
        {revealed === hints.length && <p className="text-sm text-ink-soft">{t('studyHints.allRevealed')}</p>}
        {completed && <Button asChild size="sm"><Link href="/today">{t('studyHints.backToday')}</Link></Button>}
      </div>
    </section>
  );
}
