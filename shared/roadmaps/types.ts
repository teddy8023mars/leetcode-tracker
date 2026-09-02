import { z } from "zod";

const EXPECTED_SECTION_SLUGS = [
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
] as const;

const BaseNodeSchema = z.object({
  key: z.string().min(1),
  position: z.number().int().positive(),
  titleZh: z.string().min(1),
  titleEn: z.string().min(1).optional(),
  sourceUrl: z
    .string()
    .url()
    .refine(value => value.startsWith("https://")),
});

export const RoadmapNodeSchema = z.discriminatedUnion("kind", [
  BaseNodeSchema.extend({ kind: z.literal("article") }),
  BaseNodeSchema.extend({
    kind: z.literal("external"),
    provider: z.string().min(1),
  }),
  BaseNodeSchema.extend({
    kind: z.literal("leetcode"),
    frontendId: z.number().int().positive(),
    titleSlug: z.string().min(1),
  }),
]);

export const RoadmapDefinitionSchema = z
  .object({
    slug: z.literal("code-thinking"),
    titleZh: z.string().min(1),
    titleEn: z.string().min(1),
    sourceName: z.string().min(1),
    sourceUrl: z.string().url(),
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    allowedExternalHosts: z.array(z.string().min(1)).min(1),
    sections: z
      .array(
        z.object({
          slug: z.string().min(1),
          titleZh: z.string().min(1),
          titleEn: z.string().min(1),
          items: z.array(RoadmapNodeSchema).min(1),
        })
      )
      .length(12),
  })
  .superRefine((route, context) => {
    const sectionSlugs = route.sections.map(section => section.slug);
    if (sectionSlugs.join("|") !== EXPECTED_SECTION_SLUGS.join("|")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sections must use the expected Code Thinking order.",
        path: ["sections"],
      });
    }

    if (new Set(sectionSlugs).size !== sectionSlugs.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Section slugs must be unique.",
        path: ["sections"],
      });
    }

    const keys = new Set<string>();
    const allowedHosts = new Set(route.allowedExternalHosts);
    if (!allowedHosts.has(new URL(route.sourceUrl).host)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Roadmap source URL host must be explicitly allowed.",
        path: ["sourceUrl"],
      });
    }
    for (
      let sectionIndex = 0;
      sectionIndex < route.sections.length;
      sectionIndex += 1
    ) {
      const section = route.sections[sectionIndex];
      for (
        let itemIndex = 0;
        itemIndex < section.items.length;
        itemIndex += 1
      ) {
        const item = section.items[itemIndex];
        if (item.position !== itemIndex + 1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Item positions must be consecutive within their section.",
            path: ["sections", sectionIndex, "items", itemIndex, "position"],
          });
        }
        if (keys.has(item.key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Node keys must be unique across the roadmap.",
            path: ["sections", sectionIndex, "items", itemIndex, "key"],
          });
        }
        keys.add(item.key);
        if (!allowedHosts.has(new URL(item.sourceUrl).host)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Node source URL host must be explicitly allowed.",
            path: ["sections", sectionIndex, "items", itemIndex, "sourceUrl"],
          });
        }
      }
    }
  });

export type RoadmapDefinition = z.infer<typeof RoadmapDefinitionSchema>;
export type RoadmapNode = z.infer<typeof RoadmapNodeSchema>;
export type RoadmapLeetCodeNode = Extract<RoadmapNode, { kind: "leetcode" }>;
