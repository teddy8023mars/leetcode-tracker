type RoadmapProblemLinkItem = {
  position: number;
  localProblem: { titleSlug: string };
};

export function roadmapProblemHref(
  slug: string,
  section: string,
  item: RoadmapProblemLinkItem,
) {
  const params = new URLSearchParams({
    roadmap: slug,
    section,
    step: String(item.position),
  });
  return `/problems/${item.localProblem.titleSlug}?${params.toString()}`;
}

export function safeExternalRoadmapUrl(raw: string, allowedHosts: string[]): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}
