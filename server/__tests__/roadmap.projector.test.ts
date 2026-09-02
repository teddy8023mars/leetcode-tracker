import { describe, expect, it } from "vitest";

import { flattenRoadmapNodes } from "@shared/roadmaps/navigation";
import type { RoadmapDefinition, RoadmapNode } from "@shared/roadmaps/types";
import {
  projectRoadmap,
  type RoadmapProblemState,
} from "../roadmaps/projector";

const SOURCE_URL = "https://github.com/example/roadmap";

function leetcode(
  key: string,
  position: number,
  frontendId: number
): RoadmapNode {
  return {
    key,
    kind: "leetcode",
    position,
    frontendId,
    sourceUrl: SOURCE_URL,
    titleSlug: key,
    titleZh: key,
  };
}

function article(key: string, position: number): RoadmapNode {
  return {
    key,
    kind: "article",
    position,
    sourceUrl: SOURCE_URL,
    titleZh: key,
  };
}

function external(key: string, position: number): RoadmapNode {
  return {
    key,
    kind: "external",
    position,
    provider: "Example",
    sourceUrl: SOURCE_URL,
    titleZh: key,
  };
}

function section(slug: string, items: RoadmapNode[]) {
  return { slug, titleEn: slug, titleZh: slug, items };
}

function makeRoadmap(
  sections: RoadmapDefinition["sections"]
): RoadmapDefinition {
  return {
    slug: "code-thinking",
    titleEn: "Code Thinking",
    titleZh: "代码随想录",
    sourceName: "Example",
    sourceUrl: SOURCE_URL,
    sourceCommit: "0000000000000000000000000000000000000000",
    allowedExternalHosts: ["github.com"],
    sections,
  };
}

const rows: RoadmapProblemState[] = [
  {
    id: 10,
    frontendId: 1,
    titleSlug: "one",
    titleEn: "One",
    titleZh: "一",
    difficulty: "Easy",
    status: "done",
  },
  {
    id: 20,
    frontendId: 2,
    titleSlug: "two",
    titleEn: "Two",
    titleZh: "二",
    difficulty: "Medium",
    status: "reviewing",
  },
];

describe("projectRoadmap", () => {
  it("deduplicates overall progress while preserving section totals and continuation order", () => {
    const definition = makeRoadmap([
      section("array", [
        leetcode("a-1", 1, 1),
        article("a-2", 2),
        leetcode("a-3", 3, 2),
      ]),
      section("hash-table", [leetcode("h-1", 1, 1), external("h-2", 2)]),
    ]);

    const view = projectRoadmap(definition, rows);

    expect(view.progress).toEqual({ completed: 1, total: 2 });
    expect(view.sections[0].progress).toEqual({ completed: 1, total: 2 });
    expect(view.sections[1].progress).toEqual({ completed: 1, total: 1 });
    expect(view.next?.frontendId).toBe(2);
    expect(view.sections[0].items[1].kind).toBe("article");
    expect(flattenRoadmapNodes(view).map(node => node.key)).toEqual([
      "a-1",
      "a-2",
      "a-3",
      "h-1",
      "h-2",
    ]);
  });

  it("marks missing mappings without throwing and skips them for continuation", () => {
    const definition = makeRoadmap([
      section("array", [
        leetcode("a-1", 1, 1),
        article("a-2", 2),
        leetcode("a-3", 3, 2),
      ]),
      section("hash-table", [leetcode("h-1", 1, 3), external("h-2", 2)]),
    ]);
    const view = projectRoadmap(definition, [
      rows[0],
      {
        ...rows[1],
        id: 30,
        frontendId: 3,
        titleSlug: "three",
        status: "reviewing",
      },
    ]);
    const missing = view.sections[0].items[2];

    expect(missing).toMatchObject({ mapping: "missing", localProblem: null });
    expect(view.missingFrontendIds).toEqual([2]);
    expect(view.next?.frontendId).toBe(3);
  });
});
