import { describe, expect, it } from "vitest";
import { CODE_THINKING_ROADMAP } from "@shared/roadmaps/codeThinking";
import { RoadmapDefinitionSchema } from "@shared/roadmaps/types";

describe("Code Thinking roadmap snapshot", () => {
  it("is a pinned, valid twelve-chapter route", () => {
    const route = RoadmapDefinitionSchema.parse(CODE_THINKING_ROADMAP);
    expect(route.slug).toBe("code-thinking");
    expect(route.sourceCommit).toBe("b43def349578bdbda371f00da505d3099374910d");
    expect(route.sections.map(section => section.slug)).toEqual([
      "array",
      "linked-list",
      "hash-table",
      "string",
      "two-pointers",
      "stack-queue",
      "binary-tree",
      "backtracking",
      "greedy",
      "dynamic-programming",
      "monotonic-stack",
      "graph",
    ]);
    const nodes = route.sections.flatMap(section => section.items);
    expect(nodes).toHaveLength(228);
    expect(nodes.filter(node => node.kind === "leetcode")).toHaveLength(141);
    expect(new Set(nodes.map(node => node.key)).size).toBe(nodes.length);
    expect(
      new Set(
        nodes
          .filter(node => node.kind === "leetcode")
          .map(node => node.frontendId)
      ).size
    ).toBe(129);
    expect(new Set(nodes.map(node => node.kind))).toEqual(
      new Set(["leetcode", "article", "external"])
    );
  });
});
