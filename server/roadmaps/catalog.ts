import type { RoadmapLeetCodeNode } from '../../shared/roadmaps/types';
import type { CatalogEntry } from '../sync/leetcode';

function catalogTitleFromRoadmapTitle(titleZh: string): string {
  return titleZh.match(/^[^：]+：\d+\.(.+)$/)?.[1] ?? titleZh;
}

export function applyRoadmapTitleFallback(
  entry: CatalogEntry,
  node: Pick<RoadmapLeetCodeNode, 'titleZh'>,
): CatalogEntry {
  if (entry.titleZh !== null) return entry;
  return { ...entry, titleZh: catalogTitleFromRoadmapTitle(node.titleZh) };
}
