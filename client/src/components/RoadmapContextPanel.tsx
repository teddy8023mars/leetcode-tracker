import { Link } from 'wouter';

import { useLang } from '@/contexts/LangContext';
import { roadmapProblemHref, safeExternalRoadmapUrl } from '@/lib/roadmapLinks';
import { flattenRoadmapNodes } from '@shared/roadmaps/navigation';

type LocalProblem = {
  titleSlug: string;
  titleEn?: string | null;
  titleZh?: string | null;
};

type RoadmapItem = {
  key: string;
  kind: 'article' | 'external' | 'leetcode';
  position: number;
  titleEn?: string | null;
  titleZh?: string | null;
  sourceUrl: string;
  provider?: string;
  mapping?: 'mapped' | 'missing';
  localProblem?: LocalProblem | null;
};

type RoadmapSection = {
  slug: string;
  titleEn?: string | null;
  titleZh?: string | null;
  items: RoadmapItem[];
};

export type RoadmapView = {
  slug: string;
  titleEn?: string | null;
  titleZh?: string | null;
  allowedExternalHosts: string[];
  sections: RoadmapSection[];
};

export type RoadmapContext = {
  roadmapSlug: string;
  sectionSlug: string;
  step: number;
};

export type ResolvedRoadmapContext = {
  current: RoadmapItem;
  section: RoadmapSection;
  previous: RoadmapItem | null;
  previousSection: RoadmapSection | null;
  next: RoadmapItem | null;
  nextSection: RoadmapSection | null;
};

export function parseRoadmapContext(search: string): RoadmapContext | null {
  const params = new URLSearchParams(search);
  const roadmapSlug = params.get('roadmap');
  const sectionSlug = params.get('section');
  const rawStep = params.get('step');

  const step = rawStep ? Number(rawStep) : NaN;
  if (!roadmapSlug || !sectionSlug || !rawStep || !/^[1-9]\d*$/.test(rawStep) || !Number.isSafeInteger(step)) return null;

  return { roadmapSlug, sectionSlug, step };
}

export function resolveRoadmapContext(
  view: RoadmapView,
  context: RoadmapContext,
  currentTitleSlug: string,
): ResolvedRoadmapContext | null {
  if (view.slug !== context.roadmapSlug) return null;

  const section = view.sections.find(candidate => candidate.slug === context.sectionSlug);
  const current = section?.items.find(item => item.position === context.step);
  if (!section || !current || current.kind !== 'leetcode' || current.mapping !== 'mapped'
    || current.localProblem?.titleSlug !== currentTitleSlug) return null;

  const nodes = flattenRoadmapNodes(view);
  const currentIndex = nodes.indexOf(current);
  if (currentIndex < 0) return null;

  const findSection = (item: RoadmapItem | null) => item
    ? view.sections.find(candidate => candidate.items.includes(item)) ?? null
    : null;
  const previous = nodes[currentIndex - 1] ?? null;
  const next = nodes[currentIndex + 1] ?? null;

  return {
    current,
    section,
    previous,
    previousSection: findSection(previous),
    next,
    nextSection: findSection(next),
  };
}

function displayTitle(item: { titleEn?: string | null; titleZh?: string | null }, lang: 'en' | 'zh', fallback = '') {
  return (lang === 'zh' ? item.titleZh ?? item.titleEn : item.titleEn ?? item.titleZh) ?? fallback;
}

function NeighborLink({
  direction,
  item,
  section,
  view,
}: {
  direction: 'previous' | 'next';
  item: RoadmapItem | null;
  section: RoadmapSection | null;
  view: RoadmapView;
}) {
  const { lang } = useLang();
  if (!item) return null;

  const label = displayTitle(item.localProblem ?? item, lang, item.localProblem?.titleSlug ?? item.key);
  const localHref = item.kind === 'leetcode' && item.mapping === 'mapped' && item.localProblem && section
    ? roadmapProblemHref(view.slug, section.slug, {
      position: item.position,
      localProblem: item.localProblem,
    })
    : null;
  const externalHref = !localHref
    ? safeExternalRoadmapUrl(item.sourceUrl, view.allowedExternalHosts)
    : null;
  if (!localHref && !externalHref) return null;

  const content = direction === 'previous' ? `← ${label}` : `${label} →`;
  const className = 'text-sm font-mono text-ink-soft hover:text-ink px-2 py-1 hover:bg-secondary rounded';

  return localHref
    ? <Link href={localHref} className={className}>{content}</Link>
    : <a href={externalHref!} target="_blank" rel="noreferrer" className={className}>{content}</a>;
}

export function RoadmapContextPanel({
  view,
  resolved,
}: {
  view: RoadmapView;
  resolved: ResolvedRoadmapContext;
}) {
  const { lang } = useLang();
  const chapter = displayTitle(resolved.section, lang, resolved.section.slug);
  const roadmapTitle = displayTitle(view, lang, view.slug);

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <span className="text-sm font-mono text-ink-soft">
        {roadmapTitle} · {chapter} · {resolved.current.position}/{resolved.section.items.length}
      </span>
      <Link href={`/roadmap/${view.slug}#section-${resolved.section.slug}`} className="text-sm font-mono underline hover:text-ink">
        Back to roadmap
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <NeighborLink direction="previous" item={resolved.previous} section={resolved.previousSection} view={view} />
        <NeighborLink direction="next" item={resolved.next} section={resolved.nextSection} view={view} />
      </div>
    </section>
  );
}
