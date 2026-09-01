# Code Thinking Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chaptered 代码随想录 roadmap that preserves upstream order, reuses existing LeetCode progress and solving flows, and provides roadmap-aware navigation without a database migration.

**Architecture:** A pinned, generated TypeScript snapshot is the source of route structure. A pure server projector joins that snapshot with batched local problem/progress rows and exposes one `roadmaps.getBySlug` query. The React roadmap page consumes the projected view, while `ProblemDetail` validates optional roadmap query parameters before replacing normal numeric neighbors with route-aware navigation.

**Tech Stack:** TypeScript 5.9, React 19, Wouter, tRPC 11, Drizzle ORM/MySQL, Zod 4, Vitest, Testing Library, Electron 43, pnpm/tsx.

**Spec:** `docs/superpowers/specs/2026-09-01-code-thinking-roadmap-design.md`

## Global Constraints

- Pin the first snapshot to upstream commit `b43def349578bdbda371f00da505d3099374910d`.
- Preserve all twelve upstream chapters and the exact node order within each chapter.
- Runtime imports committed metadata and performs no upstream network request.
- Store only titles, node kinds, problem identifiers, source URLs, attribution, and source revision; do not bundle article bodies, images, or solutions.
- Reuse `userProgress`; add no roadmap database tables or migrations.
- Overall progress de-duplicates LeetCode problems; chapter progress counts mapped occurrences.
- Articles and external ACM nodes do not count toward completion.
- Version 1 does not change Today curriculum selection and does not add local ACM judging.
- Missing problem mappings render external fallbacks and never fail the full roadmap response.
- External links must be HTTPS and restricted to hosts declared in the bundled roadmap.
- Preserve all existing Today, Review, Problems, Sync, Settings, judge, note, AI-solution, and SM-2 behavior.

---

## File Structure

### New shared and generation files

- `shared/roadmaps/types.ts` — Zod schemas and inferred types for roadmap definitions and nodes.
- `shared/roadmaps/codeThinking.ts` — deterministic generated snapshot; no runtime fetching or business logic.
- `scripts/generate-code-thinking-roadmap.ts` — explicit-commit README parser and TypeScript emitter.
- `scripts/code-thinking-overrides.ts` — reviewed classifications and title-slug mappings for ambiguous upstream entries.

### New server files

- `server/roadmaps/projector.ts` — pure merge, progress totals, continuation, and neighbor helpers.
- `server/roadmaps/repository.ts` — two batched database reads for problem metadata and progress.
- `server/routers/roadmaps.ts` — `getBySlug` input validation, lookup, projection, and not-found behavior.

### New client files

- `client/src/pages/Roadmap.tsx` — roadmap header, continue action, chapters, and ordered nodes.
- `client/src/components/RoadmapContextPanel.tsx` — validated route context and previous/next controls on problem detail.
- `client/src/lib/roadmapLinks.ts` — local context URLs and safe external URL validation.

### Existing files to modify

- `package.json` — add explicit snapshot and catalog-maintenance scripts.
- `server/routers.ts` — register `roadmaps`.
- `server/sync/leetcode.ts` — expose one metadata/detail fetch used by the catalog repair script.
- `scripts/ensure-roadmap-catalog.ts` — add missing route problems without overwriting existing user data.
- `client/src/App.tsx` — register `/roadmap/:slug`.
- `client/src/components/AppShell.tsx` — add Roadmap after Today.
- `client/src/pages/ProblemDetail.tsx` — validate roadmap context, render route panel, invalidate route progress.
- `client/src/i18n/en.ts`, `client/src/i18n/zh.ts` — bilingual navigation and roadmap copy.
- `client/src/__tests__/pages.problemDetail.test.tsx` — route-context regression coverage.
- `client/src/__tests__/components.appShell.test.tsx` — sidebar regression coverage.

---

### Task 1: Shared Roadmap Model and Pinned Snapshot

**Files:**
- Create: `shared/roadmaps/types.ts`
- Create: `shared/roadmaps/codeThinking.ts`
- Create: `scripts/code-thinking-overrides.ts`
- Create: `scripts/generate-code-thinking-roadmap.ts`
- Create: `server/__tests__/roadmap.snapshot.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `RoadmapDefinitionSchema`, `RoadmapDefinition`, `RoadmapNode`, `RoadmapLeetCodeNode`, and `CODE_THINKING_ROADMAP`.
- Produces: CLI `pnpm roadmap:generate -- --commit <40-char-sha>` that writes `shared/roadmaps/codeThinking.ts` deterministically.
- Consumes: pinned raw README at `https://raw.githubusercontent.com/youngyangyang04/leetcode-master/<commit>/README.md` only when the developer runs the CLI.

- [ ] **Step 1: Write the failing snapshot test**

```ts
import { describe, expect, it } from 'vitest';
import { CODE_THINKING_ROADMAP } from '@shared/roadmaps/codeThinking';
import { RoadmapDefinitionSchema } from '@shared/roadmaps/types';

describe('Code Thinking roadmap snapshot', () => {
  it('is a pinned, valid twelve-chapter route', () => {
    const route = RoadmapDefinitionSchema.parse(CODE_THINKING_ROADMAP);
    expect(route.slug).toBe('code-thinking');
    expect(route.sourceCommit).toBe('b43def349578bdbda371f00da505d3099374910d');
    expect(route.sections.map(section => section.slug)).toEqual([
      'array', 'linked-list', 'hash-table', 'string', 'two-pointers', 'stack-queue',
      'binary-tree', 'backtracking', 'greedy', 'dynamic-programming', 'monotonic-stack', 'graph',
    ]);
    const nodes = route.sections.flatMap(section => section.items);
    expect(nodes).toHaveLength(228);
    expect(nodes.filter(node => node.kind === 'leetcode')).toHaveLength(141);
    expect(new Set(nodes.map(node => node.key)).size).toBe(nodes.length);
    expect(new Set(nodes.filter(node => node.kind === 'leetcode').map(node => node.frontendId)).size).toBe(129);
    expect(new Set(nodes.map(node => node.kind))).toEqual(new Set(['leetcode', 'article', 'external']));
  });
});
```

- [ ] **Step 2: Run the test and verify the missing modules fail**

Run: `pnpm vitest run server/__tests__/roadmap.snapshot.test.ts`

Expected: FAIL because `@shared/roadmaps/codeThinking` and `@shared/roadmaps/types` do not exist.

- [ ] **Step 3: Define exact shared schemas**

```ts
import { z } from 'zod';

const BaseNodeSchema = z.object({
  key: z.string().min(1),
  position: z.number().int().positive(),
  titleZh: z.string().min(1),
  titleEn: z.string().min(1).optional(),
  sourceUrl: z.string().url().refine(value => value.startsWith('https://')),
});

export const RoadmapNodeSchema = z.discriminatedUnion('kind', [
  BaseNodeSchema.extend({ kind: z.literal('article') }),
  BaseNodeSchema.extend({ kind: z.literal('external'), provider: z.string().min(1) }),
  BaseNodeSchema.extend({
    kind: z.literal('leetcode'),
    frontendId: z.number().int().positive(),
    titleSlug: z.string().min(1),
  }),
]);

export const RoadmapDefinitionSchema = z.object({
  slug: z.literal('code-thinking'),
  titleZh: z.string().min(1),
  titleEn: z.string().min(1),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
  allowedExternalHosts: z.array(z.string().min(1)).min(1),
  sections: z.array(z.object({
    slug: z.string().min(1),
    titleZh: z.string().min(1),
    titleEn: z.string().min(1),
    items: z.array(RoadmapNodeSchema).min(1),
  })).length(12),
});

export type RoadmapDefinition = z.infer<typeof RoadmapDefinitionSchema>;
export type RoadmapNode = z.infer<typeof RoadmapNodeSchema>;
export type RoadmapLeetCodeNode = Extract<RoadmapNode, { kind: 'leetcode' }>;
```

Add `superRefine` checks that section-relative positions equal `index + 1`, section slugs are unique, node keys are globally unique, every source URL host appears in `allowedExternalHosts`, and the twelve section slugs exactly match the expected order.

- [ ] **Step 4: Implement the explicit-commit parser and reviewed overrides**

The CLI must reject a missing or non-40-character `--commit`, fetch only the immutable raw README URL, isolate the twelve `<summary>` blocks, parse numbered Markdown links, resolve `./problems/...` links against the pinned GitHub blob URL, and classify nodes with these deterministic rules:

```ts
export type NodeOverride = {
  kind: 'article' | 'external' | 'leetcode';
  frontendId?: number;
  titleSlug?: string;
  provider?: string;
};

export const CODE_THINKING_OVERRIDES: Record<string, NodeOverride> = {
  './problems/面试题02.07.链表相交.md': {
    kind: 'leetcode', frontendId: 160, titleSlug: 'intersection-of-two-linked-lists',
  },
};
```

Classification order is: exact override; any `/kamacoder/` path becomes `external`; an entry with a recognized LeetCode number becomes `leetcode`; everything else becomes `article`. For every LeetCode node, resolve `titleSlug` through the reviewed override map and a generated `frontendId -> titleSlug` map built from the current local catalog; abort rather than emit a blank slug. Emit sorted, stable object keys and end the output with:

```ts
export const CODE_THINKING_ROADMAP = RoadmapDefinitionSchema.parse(generatedRoadmap);
```

Add to `package.json`:

```json
"roadmap:generate": "tsx scripts/generate-code-thinking-roadmap.ts"
```

- [ ] **Step 5: Generate the pinned snapshot and verify determinism**

Run twice:

```bash
DATABASE_URL=mysql://root@localhost:3306/leetcode_tracker pnpm roadmap:generate -- --commit b43def349578bdbda371f00da505d3099374910d
shasum -a 256 shared/roadmaps/codeThinking.ts
DATABASE_URL=mysql://root@localhost:3306/leetcode_tracker pnpm roadmap:generate -- --commit b43def349578bdbda371f00da505d3099374910d
shasum -a 256 shared/roadmaps/codeThinking.ts
```

Expected: both hashes are identical; the generator report prints 12 sections, 228 nodes, 141 LeetCode occurrences, 129 unique LeetCode IDs, and 87 article/external nodes.

- [ ] **Step 6: Run validation and type checking**

Run: `pnpm vitest run server/__tests__/roadmap.snapshot.test.ts && pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit the shared model and snapshot**

```bash
git add package.json shared/roadmaps scripts/code-thinking-overrides.ts scripts/generate-code-thinking-roadmap.ts server/__tests__/roadmap.snapshot.test.ts
git commit -m "feat: add pinned Code Thinking roadmap"
```

---

### Task 2: Pure Roadmap Projection and Batched Router

**Files:**
- Create: `server/roadmaps/projector.ts`
- Create: `server/roadmaps/repository.ts`
- Create: `server/routers/roadmaps.ts`
- Create: `server/__tests__/roadmap.projector.test.ts`
- Create: `server/__tests__/routers.roadmaps.test.ts`
- Modify: `server/routers.ts`

**Interfaces:**
- Consumes: `RoadmapDefinition` and `CODE_THINKING_ROADMAP` from Task 1.
- Produces: `RoadmapProblemState`, `RoadmapView`, and `projectRoadmap(definition, rows)`.
- Produces: `loadRoadmapProblemStates(frontendIds, userId)` using one problem/progress join query.
- Produces: tRPC `roadmaps.getBySlug({ slug: string })`.

- [ ] **Step 1: Write projector tests for duplicates, totals, continuation, and missing mappings**

```ts
const definition = makeRoadmap([
  section('array', [leetcode('a-1', 1), article('a-2'), leetcode('a-3', 2)]),
  section('hash-table', [leetcode('h-1', 1), external('h-2')]),
]);
const rows = [
  { id: 10, frontendId: 1, titleSlug: 'one', titleEn: 'One', titleZh: '一', difficulty: 'Easy', status: 'done' },
  { id: 20, frontendId: 2, titleSlug: 'two', titleEn: 'Two', titleZh: '二', difficulty: 'Medium', status: 'reviewing' },
];
const view = projectRoadmap(definition, rows);
expect(view.progress).toEqual({ completed: 1, total: 2 });
expect(view.sections[0].progress).toEqual({ completed: 1, total: 2 });
expect(view.sections[1].progress).toEqual({ completed: 1, total: 1 });
expect(view.next?.frontendId).toBe(2);
expect(view.sections[0].items[1].kind).toBe('article');
```

Add a separate case with no row for ID 2 and assert `mapping: 'missing'`, `localProblem: null`, no endpoint-style exception, and continuation skipping the missing mapping in favor of the next incomplete mapped problem.

- [ ] **Step 2: Run the projector test and verify it fails**

Run: `pnpm vitest run server/__tests__/roadmap.projector.test.ts`

Expected: FAIL because `projectRoadmap` does not exist.

- [ ] **Step 3: Implement the pure projector**

```ts
export type RoadmapProblemState = {
  id: number;
  frontendId: number;
  titleSlug: string;
  titleEn: string | null;
  titleZh: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  status: 'todo' | 'reviewing' | 'done' | null;
};

export function projectRoadmap(
  definition: RoadmapDefinition,
  rows: RoadmapProblemState[],
): RoadmapView {
  const byFrontendId = new Map(rows.map(row => [row.frontendId, row]));
  const uniqueMapped = new Map<number, RoadmapProblemState>();
  const sections = definition.sections.map(section => {
    const items = section.items.map(item => {
      if (item.kind !== 'leetcode') return item;
      const localProblem = byFrontendId.get(item.frontendId) ?? null;
      if (localProblem) uniqueMapped.set(item.frontendId, localProblem);
      return { ...item, mapping: localProblem ? 'mapped' as const : 'missing' as const, localProblem };
    });
    const mapped = items.filter(isMappedLeetCodeView);
    return {
      ...section,
      items,
      progress: {
        completed: mapped.filter(item => item.localProblem.status === 'done').length,
        total: mapped.length,
      },
    };
  });
  const unique = [...uniqueMapped.values()];
  const next = sections.flatMap(section => section.items)
    .find(item => isMappedLeetCodeView(item) && item.localProblem.status !== 'done') ?? null;
  return {
    ...definition,
    sections,
    progress: { completed: unique.filter(row => row.status === 'done').length, total: unique.length },
    next,
    missingFrontendIds: definition.sections.flatMap(s => s.items)
      .filter(node => node.kind === 'leetcode' && !byFrontendId.has(node.frontendId))
      .map(node => node.frontendId)
      .filter((id, index, ids) => ids.indexOf(id) === index),
  };
}
```

Expose a pure `flattenRoadmapNodes(view)` helper so Task 5 can resolve full-order neighbors without duplicating traversal logic.

- [ ] **Step 4: Run projector tests**

Run: `pnpm vitest run server/__tests__/roadmap.projector.test.ts`

Expected: PASS.

- [ ] **Step 5: Write router tests before the repository and router**

```ts
vi.spyOn(repository, 'loadRoadmapProblemStates').mockResolvedValue([
  { id: 7, frontendId: 704, titleSlug: 'binary-search', titleEn: 'Binary Search', titleZh: '二分查找', difficulty: 'Easy', status: 'done' },
]);
const caller = roadmapsRouter.createCaller({ user: null, req: {} as Request, res: {} as Response });
const result = await caller.getBySlug({ slug: 'code-thinking' });
expect(result.slug).toBe('code-thinking');
expect(repository.loadRoadmapProblemStates).toHaveBeenCalledWith(expect.any(Array), 1);
await expect(caller.getBySlug({ slug: 'unknown' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
```

- [ ] **Step 6: Run the router test and verify it fails**

Run: `pnpm vitest run server/__tests__/routers.roadmaps.test.ts`

Expected: FAIL because the repository and router do not exist.

- [ ] **Step 7: Implement the single batched repository query**

Use `inArray(problems.frontendId, uniqueIds)` and a `leftJoin` constrained by `userProgress.userId = userId`. Select only the fields in `RoadmapProblemState`. Return `[]` immediately for an empty input or unavailable database.

```ts
return db.select({
  id: problems.id,
  frontendId: problems.frontendId,
  titleSlug: problems.titleSlug,
  titleEn: problems.titleEn,
  titleZh: problems.titleZh,
  difficulty: problems.difficulty,
  status: userProgress.status,
}).from(problems)
  .leftJoin(userProgress, and(
    eq(userProgress.problemId, problems.id),
    eq(userProgress.userId, userId),
  ))
  .where(inArray(problems.frontendId, uniqueIds));
```

- [ ] **Step 8: Implement and register `roadmaps.getBySlug`**

```ts
export const roadmapsRouter = router({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      if (input.slug !== CODE_THINKING_ROADMAP.slug) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Roadmap not found' });
      }
      const frontendIds = [...new Set(CODE_THINKING_ROADMAP.sections.flatMap(section =>
        section.items.filter((item): item is RoadmapLeetCodeNode => item.kind === 'leetcode')
          .map(item => item.frontendId),
      ))];
      const rows = await loadRoadmapProblemStates(frontendIds, ctx.user?.id ?? 1);
      return projectRoadmap(CODE_THINKING_ROADMAP, rows);
    }),
});
```

Register `roadmaps: roadmapsRouter` in `server/routers.ts` and add an assembly assertion to the router test.

- [ ] **Step 9: Run server roadmap tests and type checking**

Run: `pnpm vitest run server/__tests__/roadmap.projector.test.ts server/__tests__/routers.roadmaps.test.ts && pnpm check`

Expected: PASS.

- [ ] **Step 10: Commit the server projection and router**

```bash
git add server/roadmaps server/routers/roadmaps.ts server/routers.ts server/__tests__/roadmap.projector.test.ts server/__tests__/routers.roadmaps.test.ts
git commit -m "feat: expose projected roadmap progress"
```

---

### Task 3: Roadmap Page, Navigation, and Bilingual Copy

**Files:**
- Create: `client/src/pages/Roadmap.tsx`
- Create: `client/src/lib/roadmapLinks.ts`
- Create: `client/src/__tests__/pages.roadmap.test.tsx`
- Create: `client/src/__tests__/lib.roadmapLinks.test.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/AppShell.tsx`
- Modify: `client/src/__tests__/components.appShell.test.tsx`
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/zh.ts`
- Modify: `client/src/__tests__/i18n.test.tsx`

**Interfaces:**
- Consumes: `trpc.roadmaps.getBySlug.useQuery({ slug })` and the `RoadmapView` shape from Task 2.
- Produces: `roadmapProblemHref(slug, section, item)` and `safeExternalRoadmapUrl(raw, allowedHosts)`.
- Produces: `/roadmap/:slug` UI and sidebar entry after Today.

- [ ] **Step 1: Write URL helper tests**

```ts
expect(roadmapProblemHref('code-thinking', 'array', {
  position: 2, localProblem: { titleSlug: 'binary-search' },
})).toBe('/problems/binary-search?roadmap=code-thinking&section=array&step=2');
expect(safeExternalRoadmapUrl('https://programmercarl.com/0704.html', ['programmercarl.com']))
  .toBe('https://programmercarl.com/0704.html');
expect(safeExternalRoadmapUrl('http://programmercarl.com/0704.html', ['programmercarl.com'])).toBeNull();
expect(safeExternalRoadmapUrl('https://evil.example/phish', ['programmercarl.com'])).toBeNull();
```

- [ ] **Step 2: Run the helper test and verify it fails**

Run: `pnpm vitest run client/src/__tests__/lib.roadmapLinks.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement URL building and exact host validation**

```ts
export function safeExternalRoadmapUrl(raw: string, allowedHosts: string[]): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}
```

Build local links with `URLSearchParams` so slugs and section names are encoded once.

- [ ] **Step 4: Write the failing Roadmap page test**

Mock `trpc.roadmaps.getBySlug.useQuery` with two chapters containing all three node kinds. Assert:

```ts
expect(screen.getByRole('heading', { name: 'Code Thinking Roadmap' })).toBeInTheDocument();
expect(screen.getByText('1 / 2 problems complete')).toBeInTheDocument();
expect(screen.getByRole('link', { name: /Continue/ })).toHaveAttribute(
  'href', '/problems/two?roadmap=code-thinking&section=array&step=3',
);
expect(screen.getByRole('link', { name: /Read original/ })).toHaveAttribute('target', '_blank');
expect(screen.getByText('External ACM problem')).toBeInTheDocument();
```

Also render in Chinese by setting `lt.lang=zh` and assert `学习路线`, `继续下一题`, and chapter progress text.

- [ ] **Step 5: Run the page test and verify it fails**

Run: `pnpm vitest run client/src/__tests__/pages.roadmap.test.tsx`

Expected: FAIL because `Roadmap` does not exist.

- [ ] **Step 6: Implement the roadmap page**

Use existing card, button, badge, and collapsible components. The current section is the section containing `data.next`; open it initially. The header shows attribution, the first seven characters of `sourceCommit`, overall progress, current chapter, suggested preceding article, and one primary continue link.

For every ordered node:

- mapped LeetCode: local link from `roadmapProblemHref`, difficulty badge, and shared status badge;
- missing LeetCode: safe source link and unavailable-local badge;
- article: safe source link with “Read original”;
- external: safe source link with provider plus “External ACM problem”.

Each chapter toggle must include `aria-expanded`, chapter title, and textual `completed/total`. Give chapter containers `id={'section-' + section.slug}` so the detail return link can restore location.

- [ ] **Step 7: Register the route, navigation item, and translations**

Add to `App.tsx` before the problem routes:

```tsx
<Route path="/roadmap/:slug">{params => <Roadmap slug={params.slug} />}</Route>
```

Add `{ href: '/roadmap/code-thinking', key: 'nav.roadmap' }` immediately after Today in `AppShell.tsx`. Add matching `nav.roadmap` plus all `roadmap.*` strings to both dictionaries. Extend the AppShell test to assert Roadmap appears between Today and Review using the rendered link order.

- [ ] **Step 8: Run all client roadmap/navigation tests and type checking**

Run:

```bash
pnpm vitest run client/src/__tests__/lib.roadmapLinks.test.ts client/src/__tests__/pages.roadmap.test.tsx client/src/__tests__/components.appShell.test.tsx client/src/__tests__/i18n.test.tsx
pnpm check
```

Expected: PASS.

- [ ] **Step 9: Commit the roadmap UI**

```bash
git add client/src/pages/Roadmap.tsx client/src/lib/roadmapLinks.ts client/src/App.tsx client/src/components/AppShell.tsx client/src/i18n client/src/__tests__
git commit -m "feat: add Code Thinking roadmap page"
```

---

### Task 4: Roadmap-Aware Problem Navigation

**Files:**
- Create: `client/src/components/RoadmapContextPanel.tsx`
- Create: `client/src/__tests__/components.roadmapContextPanel.test.tsx`
- Modify: `client/src/pages/ProblemDetail.tsx`
- Modify: `client/src/__tests__/pages.problemDetail.test.tsx`

**Interfaces:**
- Consumes: `trpc.roadmaps.getBySlug`, `roadmapProblemHref`, `safeExternalRoadmapUrl`, and the flattened full route order.
- Produces: `parseRoadmapContext(search)` returning `{ roadmapSlug, sectionSlug, step } | null`.
- Produces: `resolveRoadmapContext(view, context, currentTitleSlug)` returning the validated current node, section, previous node, and next node, or `null`.

- [ ] **Step 1: Write context parser and resolver tests**

```ts
expect(parseRoadmapContext('?roadmap=code-thinking&section=array&step=2')).toEqual({
  roadmapSlug: 'code-thinking', sectionSlug: 'array', step: 2,
});
expect(parseRoadmapContext('?roadmap=code-thinking&section=array&step=0')).toBeNull();
expect(resolveRoadmapContext(view, validContext, 'binary-search')).toMatchObject({
  current: { kind: 'leetcode', frontendId: 704 },
  previous: { kind: 'article' },
  next: { kind: 'leetcode', frontendId: 27 },
});
expect(resolveRoadmapContext(view, validContext, 'wrong-slug')).toBeNull();
```

- [ ] **Step 2: Run the panel test and verify it fails**

Run: `pnpm vitest run client/src/__tests__/components.roadmapContextPanel.test.tsx`

Expected: FAIL because the context panel does not exist.

- [ ] **Step 3: Implement strict context validation and the compact panel**

Parse `step` as a positive integer with no trailing characters. Resolve the exact section, exact one-based position, and require a mapped LeetCode node whose `localProblem.titleSlug` equals the detail page slug. Flatten all section items only after validation to derive full-order previous and next nodes.

The panel renders:

- `代码随想录 · <chapter> · <step>/<chapter item count>`;
- a return link to `/roadmap/code-thinking#section-<section>`;
- previous/next local links with complete roadmap query context for mapped nodes;
- safe `_blank` external links for article, external, and missing nodes;
- no control for a neighbor with an invalid source URL.

- [ ] **Step 4: Extend ProblemDetail tests before integration**

Mock `roadmaps.getBySlug.useQuery` and assert:

```ts
window.history.replaceState({}, '', '/problems/binary-search?roadmap=code-thinking&section=array&step=2');
render(<LangProvider><ProblemDetail titleSlug="binary-search" /></LangProvider>);
expect(screen.getByText(/Code Thinking/)).toBeInTheDocument();
expect(screen.getByRole('link', { name: /Back to roadmap/ })).toHaveAttribute(
  'href', '/roadmap/code-thinking#section-array',
);
```

Add invalid-section, wrong-step, and wrong-current-slug cases. In every invalid case, assert the existing numeric previous/next links remain visible and the roadmap panel is absent.

- [ ] **Step 5: Run the ProblemDetail test and verify the new cases fail**

Run: `pnpm vitest run client/src/__tests__/pages.problemDetail.test.tsx`

Expected: FAIL because ProblemDetail does not query or render roadmap context.

- [ ] **Step 6: Integrate context without changing normal neighbors**

In `ProblemDetail`, parse roadmap params independently from Today params. Enable `trpc.roadmaps.getBySlug.useQuery` only when the parser returns context. After both the problem and route data exist, resolve the validated context.

Render the normal `problems.neighbors` links only when route context is invalid. Render `RoadmapContextPanel` when valid. Do not disable the normal neighbors query; retaining it avoids conditional-hook and cache regressions.

Extend `trpc.useUtils()` handling so a successful progress update can invalidate `roadmaps.getBySlug` in addition to existing progress and Today queries. Use optional invalidation in the shared `ProgressSection` path so ordinary problems behave identically.

- [ ] **Step 7: Run focused detail and roadmap tests**

Run:

```bash
pnpm vitest run client/src/__tests__/components.roadmapContextPanel.test.tsx client/src/__tests__/pages.problemDetail.test.tsx client/src/__tests__/pages.roadmap.test.tsx
pnpm check
```

Expected: PASS.

- [ ] **Step 8: Commit roadmap-aware detail navigation**

```bash
git add client/src/components/RoadmapContextPanel.tsx client/src/pages/ProblemDetail.tsx client/src/__tests__/components.roadmapContextPanel.test.tsx client/src/__tests__/pages.problemDetail.test.tsx
git commit -m "feat: navigate problems within roadmap context"
```

---

### Task 5: Repair Missing Roadmap Catalog Problems Safely

**Files:**
- Create: `scripts/ensure-roadmap-catalog.ts`
- Create: `server/__tests__/sync.roadmapCatalog.test.ts`
- Modify: `server/sync/leetcode.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: unique LeetCode nodes from `CODE_THINKING_ROADMAP`, existing `getDb`, `problems`, and LeetCode GraphQL transport.
- Produces: `fetchQuestionCatalogEntry(titleSlug)` returning complete problem metadata/detail without user progress.
- Produces: CLI `pnpm roadmap:ensure-catalog` that inserts only missing problem catalog rows.

- [ ] **Step 1: Write the failing catalog-fetch test**

Mock the LeetCode GraphQL response and assert:

```ts
expect(await fetchQuestionCatalogEntry('wiggle-subsequence')).toEqual(expect.objectContaining({
  frontendId: 376,
  titleSlug: 'wiggle-subsequence',
  titleEn: 'Wiggle Subsequence',
  difficulty: 'Medium',
  paidOnly: false,
  contentEn: '<p>...</p>',
  codeSnippetsJson: expect.any(Array),
}));
```

Add a null-question case and assert `null`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run server/__tests__/sync.roadmapCatalog.test.ts`

Expected: FAIL because `fetchQuestionCatalogEntry` does not exist.

- [ ] **Step 3: Implement the catalog query without changing existing fetch contracts**

Add a separate GraphQL query selecting `questionFrontendId`, `titleSlug`, `title`, `translatedTitle`, `difficulty`, `isPaidOnly`, `content`, `translatedContent`, `hints`, `exampleTestcases`, topic tags, similar questions, and code snippets. Map LeetCode difficulty values through the existing `DIFF_MAP`. Keep `fetchQuestionDetailEn` and `fetchQuestionDetailZh` signatures unchanged.

- [ ] **Step 4: Write and implement the safe catalog repair CLI**

The script must require `DATABASE_URL`, collect unique route LeetCode nodes, query existing `problems.frontendId` values once, fetch only missing nodes, and insert them with `db.insert(problems).values(entry).onDuplicateKeyUpdate({ set: { metaUpdatedAt: new Date() } })`.

The duplicate branch deliberately updates only `metaUpdatedAt`; it must not overwrite existing content, notes, submissions, or progress. Print inserted, already-present, and failed IDs, and exit nonzero if any required fetch fails.

Add:

```json
"roadmap:ensure-catalog": "tsx scripts/ensure-roadmap-catalog.ts"
```

- [ ] **Step 5: Run focused tests and repair the current local catalog**

Run:

```bash
pnpm vitest run server/__tests__/sync.roadmapCatalog.test.ts
DATABASE_URL=mysql://root@localhost:3306/leetcode_tracker pnpm roadmap:ensure-catalog
mysql -uroot leetcode_tracker -e "SELECT frontendId,titleSlug,titleEn,titleZh,difficulty FROM problems WHERE frontendId=376;"
```

Expected: tests pass; the query returns exactly one `wiggle-subsequence` row. Before running the repair, record whether ID 376 exists so any manual acceptance cleanup can distinguish pre-existing data from newly added shared catalog content. The new catalog row is release content and is not removed after acceptance.

- [ ] **Step 6: Run type checking and commit catalog repair support**

Run: `pnpm check`

Expected: PASS.

```bash
git add package.json scripts/ensure-roadmap-catalog.ts server/sync/leetcode.ts server/__tests__/sync.roadmapCatalog.test.ts
git commit -m "feat: repair missing roadmap catalog entries"
```

---

### Task 6: Full Verification, Packaging, and Installed-App Acceptance

**Files:**
- Modify only if verification exposes a defect; every defect starts with a focused failing regression test.
- Generated: `electron/seed.sql.gz`
- Generated: `release/mac-arm64/LeetCode Tracker.app`
- Generated: `release/LeetCode Tracker-1.2.0-arm64.dmg`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: tested and locally installed desktop application with preserved user data and a recoverable previous app bundle.

- [ ] **Step 1: Confirm a clean feature tree and run static/full automated gates**

Run:

```bash
git diff --check
pnpm check
pnpm test
pnpm build
```

Expected: all commands exit 0; no test is skipped to obtain a green run.

- [ ] **Step 2: Build with a fresh full content snapshot**

Run:

```bash
DATABASE_URL=mysql://root@localhost:3306/leetcode_tracker pnpm electron:build
```

Expected: seed export is non-empty, web/server/Electron builds succeed, and the app plus DMG are created. Verify the seed embedded in the app matches the exported seed:

```bash
shasum -a 256 electron/seed.sql.gz release/mac-arm64/LeetCode\ Tracker.app/Contents/Resources/seed.sql.gz
```

Expected: identical hashes.

- [ ] **Step 3: Launch the candidate app and manually verify the roadmap**

Use Computer Use against the full candidate app path. Verify:

1. Roadmap appears immediately after Today in the sidebar.
2. `/roadmap/code-thinking` shows source attribution and twelve chapters.
3. Overall and chapter counts match the existing solved state.
4. Continue opens the first incomplete mapped problem with `roadmap`, `section`, and `step` query parameters.
5. Route context replaces numeric neighbors only when valid.
6. Previous article/external and next local actions preserve exact route order.
7. Marking one previously-unsolved test problem done updates roadmap progress after return.
8. Article and external nodes expose safe official HTTPS targets.
9. A restart returns with shared problem progress preserved.
10. Today, Review, Problems, Sync, Settings, normal problem details, judge, and SM-2 screens still open.

Before changing progress, snapshot the exact `userProgress` row. After acceptance, restore the original row or remove only the row created by this test, then verify the original database state with exact SQL predicates.

- [ ] **Step 4: Install with a recoverable application backup**

Quit the candidate and installed app. Record an explicit timestamp, move `/Applications/LeetCode Tracker.app` to `/Applications/LeetCode Tracker.backup-<timestamp>.app`, and copy the verified candidate bundle into `/Applications/LeetCode Tracker.app`. Never remove an older backup.

- [ ] **Step 5: Verify the installed bundle and clean user state**

Launch `/Applications/LeetCode Tracker.app` with Computer Use. Confirm it opens Today, the Roadmap link is present, the roadmap page loads, and no acceptance-test progress remains. Check the installed embedded seed hash against the candidate hash.

- [ ] **Step 6: Run final regression evidence on the exact committed tree**

Run:

```bash
git status --short
git diff --check
pnpm check
pnpm test
git log --oneline --max-count=12
```

Expected: clean feature tree and all tests pass. Follow `superpowers:finishing-a-development-branch` for the final integration choice; do not delete or merge a branch without the user's selected option.

