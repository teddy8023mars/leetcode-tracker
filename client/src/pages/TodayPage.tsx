import { Check, Circle, Clock3, Cloud, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useLang, useT } from '@/contexts/LangContext';
import { navigationStateWithOrigin } from '@/lib/appNavigation';
import { trpc } from '@/lib/trpc';
import type { StudyTaskKey } from '@shared/studyTypes';

type VisibleTaskKey = Exclude<StudyTaskKey, 'dsa'>;

export function TodayPage() {
  const t = useT();
  const { lang } = useLang();
  const utils = trpc.useUtils();
  const query = trpc.study.today.useQuery(undefined, { staleTime: 15_000 });
  const refresh = () => {
    utils.study.today.invalidate();
    utils.progress?.dashboard?.invalidate();
  };
  const start = trpc.study.start.useMutation({ onSuccess: refresh });
  const setMode = trpc.study.setMode.useMutation({ onSuccess: refresh });
  const completeTask = trpc.study.completeTask.useMutation({ onSuccess: refresh });
  const completeSession = trpc.study.completeSession.useMutation({ onSuccess: refresh });
  const recommendation = query.data?.recommendedMode ?? 'standard';
  const [selectedMode, setSelectedMode] = useState<'standard' | 'minimum'>(recommendation);

  useEffect(() => {
    if (!query.data?.session) setSelectedMode(recommendation);
  }, [query.data?.session?.id, recommendation]);

  if (query.isLoading) return <p className="text-ink-soft">{t('loading')}</p>;
  if (!query.data) return <p className="text-ink-soft">{t('empty')}</p>;
  const data = query.data;
  const day = data.curriculumDay;
  const session = data.session;
  const mode = session?.mode ?? selectedMode;
  const taskByKey = new Map(data.tasks.map((task) => [task.taskKey, task]));
  const isComplete = (key: StudyTaskKey) => taskByKey.get(key)?.status === 'completed';
  const required = new Set(data.requiredTaskKeys);
  const canFinish = !!session && session.status === 'in_progress' && data.requiredTaskKeys.every((key) => isComplete(key));
  const visibleKeys: VisibleTaskKey[] = session && mode === 'minimum'
    ? (['review', 'problem', 'career'] as VisibleTaskKey[]).filter((key) => required.has(key) || isComplete(key))
    : ['review', 'problem', 'career'];
  const title = lang === 'zh' ? day.titleZh : day.titleEn;
  const topic = lang === 'zh' ? day.topicZh : day.topicEn;
  const problemLinkState = navigationStateWithOrigin(
    { section: 'today', href: '/today' },
    window.history.state,
  );

  const setSessionMode = (nextMode: 'standard' | 'minimum') => {
    if (session) setMode.mutate({ sessionId: session.id, mode: nextMode });
    else setSelectedMode(nextMode);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <header className="flex items-start justify-between gap-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">{t('today.dayOf', { day: day.index + 1 })}</Badge>
            <span className="text-xs font-mono text-ink-soft">{topic}</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">{t('today.title')}</h1>
          <p className="text-ink-soft mt-2">{t('today.subtitle')}</p>
        </div>
        <div className="w-56 rounded-lg border border-border bg-white/70 dark:bg-slate-800/70 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>{t('today.weekly')}</span>
            <strong>{t('today.weeklyCount', { done: data.weeklyCompleted, target: data.profile.targetDaysPerWeek })}</strong>
          </div>
          <Progress value={Math.min(100, data.weeklyCompleted / data.profile.targetDaysPerWeek * 100)} />
        </div>
      </header>

      {data.gentleRestart && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/40 p-4 flex items-start gap-3">
          <RotateCcw className="w-5 h-5 text-amber-700 mt-0.5" />
          <div><strong>{t('today.welcomeBack')}</strong><p className="text-sm text-ink-soft mt-1">{t('today.restartBody')}</p></div>
        </div>
      )}

      <Card className="bg-white/75 dark:bg-slate-800/75">
        <CardHeader className="border-b flex-row items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">{t('today.currentPlan')}</p>
            <CardTitle className="text-xl mt-2">{title}</CardTitle>
          </div>
          <div className="flex rounded-lg border border-border p-1 bg-secondary/40">
            <button
              type="button"
              onClick={() => setSessionMode('standard')}
              disabled={setMode.isPending || (!!session && session.status !== 'in_progress')}
              className={`px-3 py-2 rounded-md text-sm font-medium ${mode === 'standard' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-ink-soft'}`}
            >{t('today.standardMode')}</button>
            <button
              type="button"
              onClick={() => setSessionMode('minimum')}
              disabled={setMode.isPending || (!!session && session.status !== 'in_progress')}
              className={`px-3 py-2 rounded-md text-sm font-medium ${mode === 'minimum' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-ink-soft'}`}
            >{t('today.minimumMode')}</button>
          </div>
        </CardHeader>
        {!session && (
          <CardContent className="space-y-4">
            <p className="text-sm text-ink-soft">{t('today.noBacklog')}</p>
            <Button
              size="lg"
              onClick={() => start.mutate({ mode: selectedMode })}
              disabled={start.isPending}
            >
              <Sparkles className="w-4 h-4" />
              {selectedMode === 'minimum' ? t('today.startMinimum') : t('today.startStandard')}
            </Button>
          </CardContent>
        )}
      </Card>

      {session && (
        <div className="grid gap-4">
          {visibleKeys.includes('review') && (
            <StudyTaskCard
              taskKey="review" icon={<RotateCcw className="w-5 h-5" />} number={1} minutes={10}
              title={t('today.reviewTitle')} description={data.reviewProblem ? displayProblem(data.reviewProblem, lang) : t('today.reviewEmpty')}
              done={isComplete('review')} required={required.has('review')}
            >
              {data.reviewProblem && !isComplete('review') && (
                <Button asChild variant="outline"><Link state={problemLinkState} href={problemLink(data.reviewProblem.titleSlug, session.id, 'review')}>{t('today.openWarmup')}</Link></Button>
              )}
            </StudyTaskCard>
          )}

          {visibleKeys.includes('problem') && (
            <StudyTaskCard
              taskKey="problem" icon={<Circle className="w-5 h-5" />} number={2} minutes={40}
              title={data.coreIsTimedReview ? t('today.timedReview') : t('today.problemTitle')}
              description={data.coreProblem ? displayProblem(data.coreProblem, lang) : t('today.problemEmpty')}
              done={isComplete('problem')} required={required.has('problem')}
            >
              {data.coreProblem && !isComplete('problem') && (
                <Button asChild><Link state={problemLinkState} href={problemLink(data.coreProblem.titleSlug, session.id, 'problem')}>{t('today.solveProblem')}</Link></Button>
              )}
            </StudyTaskCard>
          )}

          {visibleKeys.includes('career') && (
            <StudyTaskCard
              taskKey="career" icon={<Cloud className="w-5 h-5" />} number={3} minutes={20}
              title={lang === 'zh' ? day.career.titleZh : day.career.titleEn}
              description={lang === 'zh' ? day.career.bodyZh : day.career.bodyEn}
              done={isComplete('career')} required={required.has('career')}
            >
              {!isComplete('career') && <Button onClick={() => completeTask.mutate({ sessionId: session.id, taskKey: 'career' })}>{t('today.completeCareer')}</Button>}
            </StudyTaskCard>
          )}
        </div>
      )}

      {session && session.status === 'in_progress' && (
        <div className="sticky bottom-4 rounded-xl border border-border bg-white/95 dark:bg-slate-900/95 shadow-lg p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-ink-soft">{canFinish ? t('today.readyToFinish') : t('today.finishHint')}</p>
          <Button disabled={!canFinish || completeSession.isPending} onClick={() => completeSession.mutate({ sessionId: session.id })}>
            <Check className="w-4 h-4" />{t('today.finishDay')}
          </Button>
        </div>
      )}
    </div>
  );
}

function StudyTaskCard(props: {
  taskKey: VisibleTaskKey;
  icon: React.ReactNode;
  number: number;
  minutes: number;
  title: string;
  description: string;
  done: boolean;
  required: boolean;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <Card data-testid={`study-task-${props.taskKey}`} className={props.done ? 'border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30' : 'bg-white/75 dark:bg-slate-800/75'}>
      <CardHeader className="flex-row items-start gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${props.done ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-ink'}`}>
          {props.done ? <Check className="w-5 h-5" /> : props.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-ink-soft">{String(props.number).padStart(2, '0')}</span>
            <CardTitle>{props.title}</CardTitle>
            {props.done && <Badge className="bg-emerald-600">{t('today.done')}</Badge>}
            {!props.required && <Badge variant="outline">{t('today.optional')}</Badge>}
          </div>
          <p className="text-sm text-ink-soft mt-2">{props.description}</p>
          <span className="inline-flex items-center gap-1 text-xs font-mono text-ink-soft mt-2"><Clock3 className="w-3 h-3" />{props.minutes} {t('today.minutes')}</span>
        </div>
      </CardHeader>
      {props.children && <CardContent>{props.children}</CardContent>}
      {props.done && <CardFooter className="text-xs text-emerald-700">{t('today.taskComplete')}</CardFooter>}
    </Card>
  );
}

function displayProblem(problem: { frontendId: number; titleEn: string | null; titleZh: string | null }, lang: 'en' | 'zh') {
  return `#${problem.frontendId} ${lang === 'zh' ? problem.titleZh || problem.titleEn : problem.titleEn}`;
}

function problemLink(slug: string, sessionId: number, taskKey: 'review' | 'problem') {
  return `/problems/${slug}?studySession=${sessionId}&studyTask=${taskKey}`;
}
