import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';

import { DifficultyBadge } from '@/components/DifficultyBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLang, useT } from '@/contexts/LangContext';
import { roadmapProblemHref, safeExternalRoadmapUrl } from '@/lib/roadmapLinks';
import { trpc } from '@/lib/trpc';

type LocalProblem = {
  titleSlug: string;
  titleEn: string | null;
  titleZh: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  status: 'todo' | 'reviewing' | 'done' | null;
};

type RoadmapItem = {
  key: string;
  kind: 'article' | 'external' | 'leetcode';
  position: number;
  titleEn?: string;
  titleZh: string;
  sourceUrl: string;
  provider?: string;
  mapping?: 'mapped' | 'missing';
  localProblem?: LocalProblem | null;
};

type RoadmapData = {
  slug: string;
  titleEn: string;
  titleZh: string;
  sourceName: string;
  sourceUrl: string;
  sourceCommit: string;
  allowedExternalHosts: string[];
  progress: { completed: number; total: number };
  next: RoadmapItem | null;
  sections: Array<{
    slug: string;
    titleEn: string;
    titleZh: string;
    items: RoadmapItem[];
    progress: { completed: number; total: number };
  }>;
};

function displayTitle(item: { titleEn?: string | null; titleZh: string | null }, lang: 'en' | 'zh', fallback = '') {
  return (lang === 'zh' ? item.titleZh ?? item.titleEn : item.titleEn ?? item.titleZh) ?? fallback;
}

export function Roadmap({ slug }: { slug: string }) {
  const t = useT();
  const { lang } = useLang();
  const query = trpc.roadmaps.getBySlug.useQuery({ slug }, { staleTime: 60_000 });
  const data = query.data as RoadmapData | undefined;
  const current = useMemo(() => {
    if (!data?.next) return null;
    const section = data.sections.find(candidate => candidate.items.some(item => item.key === data.next?.key));
    if (!section) return null;
    const nextIndex = section.items.findIndex(item => item.key === data.next?.key);
    return {
      section,
      precedingArticle: nextIndex > 0 && section.items[nextIndex - 1].kind === 'article'
        ? section.items[nextIndex - 1]
        : null,
    };
  }, [data]);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const initializedCurrentSections = useRef(new Set<string>());

  useEffect(() => {
    if (!data || !current) return;
    const currentSectionKey = `${data.slug}:${current.section.slug}`;
    if (initializedCurrentSections.current.has(currentSectionKey)) return;
    initializedCurrentSections.current.add(currentSectionKey);
    setOpenSections(existing => existing.includes(current.section.slug)
      ? existing
      : [...existing, current.section.slug]);
  }, [data?.slug, current?.section.slug]);

  if (query.isLoading) return <p className="font-mono text-sm text-ink-soft">{t('roadmap.loading')}</p>;
  if (!data) return <p className="font-mono text-sm text-ink-soft">{t('roadmap.unavailable')}</p>;

  const sourceLink = safeExternalRoadmapUrl(data.sourceUrl, data.allowedExternalHosts);
  const nextHref = current?.section && data.next?.localProblem
    ? roadmapProblemHref(data.slug, current.section.slug, {
      position: data.next.position,
      localProblem: { titleSlug: data.next.localProblem.titleSlug },
    })
    : null;

  return (
    <div className="max-w-5xl space-y-6">
      <Card>
        <CardHeader className="gap-4">
          <div>
            <p className="font-mono text-sm text-ink-soft">{t('nav.roadmap')}</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{displayTitle(data, lang)}</h1>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm text-ink-soft">
            {sourceLink ? (
              <a href={sourceLink} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                {t('roadmap.attribution', { source: data.sourceName })}
              </a>
            ) : <span>{t('roadmap.attribution', { source: data.sourceName })}</span>}
            <span>{t('roadmap.sourceCommit', { commit: data.sourceCommit.slice(0, 7) })}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-lg font-semibold">
            {t('roadmap.progress', data.progress)}
          </p>
          {current && <p className="text-sm text-ink-soft">
            {t('roadmap.currentChapter', { chapter: displayTitle(current.section, lang) })}
          </p>}
          {current?.precedingArticle && (
            <PrecedingArticle item={current.precedingArticle} allowedHosts={data.allowedExternalHosts} lang={lang} />
          )}
          {nextHref && data.next?.localProblem ? (
            <Button asChild>
              <Link href={nextHref}>{t('roadmap.continue')}</Link>
            </Button>
          ) : <p className="text-sm text-ink-soft">{t('roadmap.noContinue')}</p>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {data.sections.map(section => {
          const open = openSections.includes(section.slug);
          return (
            <Collapsible key={section.slug} open={open} onOpenChange={(isOpen) => {
              setOpenSections(existing => isOpen
                ? Array.from(new Set([...existing, section.slug]))
                : existing.filter(value => value !== section.slug));
            }}>
              <Card id={`section-${section.slug}`}>
                <CardHeader className="p-0">
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left">
                    <span className="font-semibold">{displayTitle(section, lang)}</span>
                    <span className="font-mono text-sm text-ink-soft">
                      {t('roadmap.chapterProgress', section.progress)}
                    </span>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-3 pb-6">
                    {section.items.map(item => (
                      <RoadmapNode
                        key={item.key}
                        item={item}
                        roadmapSlug={data.slug}
                        sectionSlug={section.slug}
                        allowedHosts={data.allowedExternalHosts}
                        lang={lang}
                      />
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

function PrecedingArticle({ item, allowedHosts, lang }: { item: RoadmapItem; allowedHosts: string[]; lang: 'en' | 'zh' }) {
  const t = useT();
  const href = safeExternalRoadmapUrl(item.sourceUrl, allowedHosts);
  return (
    <p className="text-sm text-ink-soft">
      {t('roadmap.suggestedArticle')}{' '}
      {href ? <a href={href} target="_blank" rel="noreferrer" className="underline hover:text-ink">{displayTitle(item, lang)}</a> : displayTitle(item, lang)}
    </p>
  );
}

function RoadmapNode({ item, roadmapSlug, sectionSlug, allowedHosts, lang }: {
  item: RoadmapItem;
  roadmapSlug: string;
  sectionSlug: string;
  allowedHosts: string[];
  lang: 'en' | 'zh';
}) {
  const t = useT();
  const sourceHref = safeExternalRoadmapUrl(item.sourceUrl, allowedHosts);
  const title = item.localProblem
    ? displayTitle(item.localProblem, lang, item.localProblem.titleSlug)
    : displayTitle(item, lang);
  const link = item.kind === 'leetcode' && item.mapping === 'mapped' && item.localProblem
    ? roadmapProblemHref(roadmapSlug, sectionSlug, { position: item.position, localProblem: item.localProblem })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-4 py-3">
      <span className="font-mono text-xs text-ink-soft">{item.position}</span>
      {link ? <Link href={link} className="font-medium hover:underline">{title}</Link> : <span className="font-medium">{title}</span>}
      {item.kind === 'leetcode' && item.mapping === 'mapped' && item.localProblem && <>
        <DifficultyBadge difficulty={item.localProblem.difficulty} />
        {item.localProblem.status && <StatusBadge status={item.localProblem.status} />}
      </>}
      {item.kind === 'leetcode' && item.mapping === 'missing' && <>
        <Badge variant="secondary">{t('roadmap.unavailableLocal')}</Badge>
        {sourceHref && <a href={sourceHref} target="_blank" rel="noreferrer" className="text-sm underline">{t('roadmap.viewSource')}</a>}
      </>}
      {item.kind === 'article' && (sourceHref ? (
        <a href={sourceHref} target="_blank" rel="noreferrer" className="text-sm underline">{t('roadmap.readOriginal')}</a>
      ) : <span className="text-sm text-ink-soft">{t('roadmap.readOriginal')}</span>)}
      {item.kind === 'external' && (sourceHref ? (
        <a href={sourceHref} target="_blank" rel="noreferrer" className="text-sm underline">
          {t('roadmap.externalProblem', { provider: item.provider ?? '' })}
        </a>
      ) : <span className="text-sm text-ink-soft">{t('roadmap.externalProblem', { provider: item.provider ?? '' })}</span>)}
    </div>
  );
}
