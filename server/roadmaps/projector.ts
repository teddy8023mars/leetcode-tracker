import { flattenRoadmapNodes } from "@shared/roadmaps/navigation";
import type {
  RoadmapDefinition,
  RoadmapLeetCodeNode,
  RoadmapNode,
} from "@shared/roadmaps/types";

export type RoadmapProblemState = {
  id: number;
  frontendId: number;
  titleSlug: string;
  titleEn: string | null;
  titleZh: string | null;
  difficulty: "Easy" | "Medium" | "Hard";
  status: "todo" | "reviewing" | "done" | null;
};

type RoadmapProgress = {
  completed: number;
  total: number;
};

export type RoadmapLeetCodeView = RoadmapLeetCodeNode & {
  mapping: "mapped" | "missing";
  localProblem: RoadmapProblemState | null;
};

export type RoadmapViewItem =
  | Exclude<RoadmapNode, RoadmapLeetCodeNode>
  | RoadmapLeetCodeView;

export type RoadmapViewSection = Omit<
  RoadmapDefinition["sections"][number],
  "items"
> & {
  items: RoadmapViewItem[];
  progress: RoadmapProgress;
};

export type RoadmapView = Omit<RoadmapDefinition, "sections"> & {
  sections: RoadmapViewSection[];
  progress: RoadmapProgress;
  next: RoadmapLeetCodeView | null;
  missingFrontendIds: number[];
};

function isMappedLeetCodeView(
  item: RoadmapViewItem
): item is RoadmapLeetCodeView & {
  mapping: "mapped";
  localProblem: RoadmapProblemState;
} {
  return item.kind === "leetcode" && item.mapping === "mapped";
}

export function projectRoadmap(
  definition: RoadmapDefinition,
  rows: RoadmapProblemState[]
): RoadmapView {
  const byFrontendId = new Map(rows.map(row => [row.frontendId, row]));
  const uniqueMapped = new Map<number, RoadmapProblemState>();
  const sections = definition.sections.map(section => {
    const items = section.items.map(item => {
      if (item.kind !== "leetcode") return item;

      const localProblem = byFrontendId.get(item.frontendId) ?? null;
      if (localProblem) uniqueMapped.set(item.frontendId, localProblem);

      return {
        ...item,
        mapping: localProblem ? ("mapped" as const) : ("missing" as const),
        localProblem,
      };
    });
    const mapped = items.filter(isMappedLeetCodeView);

    return {
      ...section,
      items,
      progress: {
        completed: mapped.filter(item => item.localProblem.status === "done")
          .length,
        total: mapped.length,
      },
    };
  });
  const unique = Array.from(uniqueMapped.values());
  const next =
    flattenRoadmapNodes({ sections })
      .filter(isMappedLeetCodeView)
      .find(item => item.localProblem.status !== "done") ?? null;

  return {
    ...definition,
    sections,
    progress: {
      completed: unique.filter(row => row.status === "done").length,
      total: unique.length,
    },
    next,
    missingFrontendIds: flattenRoadmapNodes(definition)
      .filter(
        (node): node is RoadmapLeetCodeNode =>
          node.kind === "leetcode" && !byFrontendId.has(node.frontendId)
      )
      .map(node => node.frontendId)
      .filter((id, index, ids) => ids.indexOf(id) === index),
  };
}
