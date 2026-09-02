import mysql from "mysql2/promise";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CODE_THINKING_OVERRIDES,
  type NodeOverride,
} from "./code-thinking-overrides";
import { format } from "prettier";

const EXPECTED_SECTIONS = [
  { summary: "数组", slug: "array", titleEn: "Arrays" },
  { summary: "链表", slug: "linked-list", titleEn: "Linked Lists" },
  { summary: "哈希表", slug: "hash-table", titleEn: "Hash Tables" },
  { summary: "字符串", slug: "string", titleEn: "Strings" },
  { summary: "双指针法", slug: "two-pointers", titleEn: "Two Pointers" },
  { summary: "栈与队列", slug: "stack-queue", titleEn: "Stacks and Queues" },
  { summary: "二叉树", slug: "binary-tree", titleEn: "Binary Trees" },
  { summary: "回溯算法", slug: "backtracking", titleEn: "Backtracking" },
  { summary: "贪心算法", slug: "greedy", titleEn: "Greedy" },
  {
    summary: "动态规划",
    slug: "dynamic-programming",
    titleEn: "Dynamic Programming",
  },
  { summary: "单调栈", slug: "monotonic-stack", titleEn: "Monotonic Stack" },
  { summary: "图论", slug: "graph", titleEn: "Graphs" },
] as const;

type CatalogRow = { frontendId: number; titleSlug: string };
type ParsedEntry = { titleZh: string; href: string };

function readCommit(args: string[]): string {
  const commitIndex = args.indexOf("--commit");
  const commit = commitIndex >= 0 ? args[commitIndex + 1] : undefined;
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("Usage: pnpm roadmap:generate -- --commit <40-char-sha>");
  }
  return commit;
}

function isolateSummaryBlocks(readme: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const matcher =
    /<summary><b>([^<]+)<\/b><\/summary>([\s\S]*?)(?=<summary>|$)/g;
  for (const match of readme.matchAll(matcher)) {
    blocks.set(match[1].trim(), match[2]);
  }
  return blocks;
}

function parseNumberedLinks(block: string): ParsedEntry[] {
  return [...block.matchAll(/^\s*\d+\.\s+\[([^\]]+)]\(([^)]+)\)/gm)].map(
    ([, titleZh, href]) => ({
      titleZh: titleZh.trim(),
      href: href.trim(),
    })
  );
}

function recognizedLeetCodeNumber(href: string): number | undefined {
  const match = href.match(/\/problems\/(\d+)\./);
  return match ? Number(match[1]) : undefined;
}

function nodeOverride(href: string): NodeOverride | undefined {
  return CODE_THINKING_OVERRIDES[href];
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortForStableJson(child)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortForStableJson(value), null, 2);
}

async function loadCatalog(): Promise<Map<number, string>> {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is required to load the local problem catalog."
    );
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query<CatalogRow[]>(
      "SELECT frontendId, titleSlug FROM problems"
    );
    return new Map(rows.map(row => [Number(row.frontendId), row.titleSlug]));
  } finally {
    await connection.end();
  }
}

async function main(): Promise<void> {
  const commit = readCommit(process.argv.slice(2));
  const rawReadmeUrl = `https://raw.githubusercontent.com/youngyangyang04/leetcode-master/${commit}/README.md`;
  const response = await fetch(rawReadmeUrl);
  if (!response.ok)
    throw new Error(
      `Unable to fetch pinned README: ${response.status} ${response.statusText}`
    );
  const blocks = isolateSummaryBlocks(await response.text());
  const catalog = await loadCatalog();
  const blobReadmeUrl = `https://github.com/youngyangyang04/leetcode-master/blob/${commit}/README.md`;

  const sections = EXPECTED_SECTIONS.map(section => {
    const block = blocks.get(section.summary);
    if (!block)
      throw new Error(
        `Pinned README is missing the ${section.summary} section.`
      );
    const items = parseNumberedLinks(block).map((entry, index) => {
      const override = nodeOverride(entry.href);
      const sourceUrl = new URL(entry.href, blobReadmeUrl).toString();
      const base = {
        key: `${section.slug}-${index + 1}`,
        position: index + 1,
        sourceUrl,
        titleZh: entry.titleZh,
      };
      if (override) {
        if (override.kind === "external")
          return {
            ...base,
            kind: "external" as const,
            provider: override.provider ?? "external",
          };
        if (override.kind === "article")
          return { ...base, kind: "article" as const };
        const titleSlug =
          override.titleSlug ?? catalog.get(override.frontendId!);
        if (!titleSlug)
          throw new Error(
            `No title slug for overridden LeetCode problem: ${entry.href}`
          );
        return {
          ...base,
          frontendId: override.frontendId!,
          kind: "leetcode" as const,
          titleSlug,
        };
      }
      if (entry.href.includes("/kamacoder/"))
        return { ...base, kind: "external" as const, provider: "KamaCoder" };
      const frontendId = recognizedLeetCodeNumber(entry.href);
      if (frontendId) {
        const titleSlug = catalog.get(frontendId);
        if (!titleSlug)
          throw new Error(
            `No title slug in local catalog for LeetCode #${frontendId}: ${entry.href}`
          );
        return { ...base, frontendId, kind: "leetcode" as const, titleSlug };
      }
      return { ...base, kind: "article" as const };
    });
    return {
      items,
      slug: section.slug,
      titleEn: section.titleEn,
      titleZh: section.summary,
    };
  });

  const generatedRoadmap = {
    allowedExternalHosts: ["github.com"],
    sections,
    slug: "code-thinking",
    sourceCommit: commit,
    sourceName: "代码随想录",
    sourceUrl: blobReadmeUrl,
    titleEn: "Code Thinking Roadmap",
    titleZh: "代码随想录路线图",
  };
  const leetcodeNodes = sections
    .flatMap(section => section.items)
    .filter(item => item.kind === "leetcode");
  const source = await format(
    [
      "import { RoadmapDefinitionSchema } from './types';",
      "",
      `const generatedRoadmap = ${stableJson(generatedRoadmap)};`,
      "",
      "export const CODE_THINKING_ROADMAP = RoadmapDefinitionSchema.parse(generatedRoadmap);",
      "",
    ].join("\n"),
    { parser: "typescript" }
  );
  const outputPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../shared/roadmaps/codeThinking.ts"
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, source, "utf8");
  console.log(
    `Generated ${sections.length} sections, ${sections.flatMap(section => section.items).length} nodes, ${leetcodeNodes.length} LeetCode occurrences, ${new Set(leetcodeNodes.map(item => item.frontendId)).size} unique LeetCode IDs, ${sections.flatMap(section => section.items).length - leetcodeNodes.length} article/external nodes.`
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
