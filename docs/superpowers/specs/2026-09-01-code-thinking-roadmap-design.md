# Code Thinking Roadmap — Design Spec

Add the official 代码随想录 (Code Thinking) sequence to LeetCode Tracker as a chaptered learning roadmap, not as a flat problem list. The roadmap must preserve the upstream learning order, connect mapped LeetCode nodes to the app's existing problem-solving and SM-2 flows, and keep theory and external ACM nodes visible without copying copyrighted article content into the application.

Version 1 is intentionally independent from the 60-day Today curriculum. The two experiences share `userProgress`, so completing a problem in either place updates both, but the Today curriculum does not automatically select the roadmap's next problem.

## Product Principles

- Preserve the upstream order: theory, practice, and recap nodes remain visible within each chapter.
- Reuse the existing local problem detail, editor, judge, notes, AI solution, and SM-2 progress flows.
- Count progress only for locally mapped LeetCode problems. Reading and external ACM nodes are references, not required completion records in version 1.
- Store only metadata required for attribution and navigation: titles, node kinds, problem identifiers, source URLs, and the pinned source revision.
- Never fetch or parse the upstream repository during normal application startup.
- Missing or unmapped problems must degrade to an explanatory external link rather than break the roadmap.
- Keep the roadmap calm and sequential: one obvious “continue” action, chapter-level progress, and no streak or overdue-debt mechanics.

## Source and Versioning

The first bundled snapshot is pinned to the `leetcode-master` master commit:

`b43def349578bdbda371f00da505d3099374910d`

The generated metadata includes:

- roadmap slug and bilingual title;
- upstream repository URL and pinned commit;
- ordered chapters;
- ordered nodes inside each chapter;
- node kind, bilingual display title where available, source URL, and stable node key;
- `frontendId` and `titleSlug` for LeetCode nodes when known.

The application does not bundle upstream article bodies, images, or solutions. The roadmap page visibly attributes 代码随想录 and links each reference node to its original page.

An offline maintenance script reads the pinned upstream README, normalizes the directory into metadata, validates it, and writes a deterministic TypeScript data file. Updating the snapshot is an explicit developer operation:

1. select a new upstream commit;
2. run the generator against that commit;
3. inspect the generated diff and validation report;
4. resolve mapping changes manually;
5. commit the new snapshot with the new source revision.

Runtime code imports only the generated snapshot and performs no network synchronization.

## Roadmap Model

Add a shared, discriminated metadata model with three node kinds.

### `leetcode`

- Stable `key` and chapter-relative `position`.
- Chinese and optional English display titles.
- `frontendId` and `titleSlug`.
- Original 代码随想录 source URL.
- Opens the existing local problem detail when the problem exists.
- Falls back to the source URL with an “unavailable locally” label when it cannot be mapped.

### `article`

- Stable key, title, position, and original source URL.
- Represents theory, weekly recaps, and chapter summaries.
- Opens the original article externally.
- Does not count toward completion in version 1.

### `external`

- Stable key, title, position, source URL, and provider label such as 卡码网.
- Represents ACM-style exercises or other nodes unsupported by the local LeetCode judge.
- Shows an “External ACM problem” badge and opens the original page externally.
- Does not count toward completion in version 1.

The bundled route contains the twelve primary chapters in upstream order:

1. arrays;
2. linked lists;
3. hash tables;
4. strings;
5. two pointers;
6. stacks and queues;
7. binary trees;
8. backtracking;
9. greedy algorithms;
10. dynamic programming;
11. monotonic stacks;
12. graph theory.

Graph theory retains its full ordered directory as external ACM nodes. Adding an ACM judge is a separate project.

## Progress Semantics

No roadmap tables or database migration are introduced.

- A mapped LeetCode node is complete when its shared `userProgress.status` is `done`.
- `todo` and `reviewing` retain their existing meanings and badges.
- A problem repeated in several chapters shows the same shared status everywhere.
- Roadmap completion is `done unique mapped LeetCode problems / unique mapped LeetCode problems`.
- Chapter completion is `done mapped node occurrences / mapped node occurrences`. A repeated problem can therefore contribute to multiple chapter totals while counting once in the overall unique total.
- Articles, summaries, and external nodes never inflate the denominator.
- “Continue” chooses the first mapped LeetCode node in roadmap order whose shared status is not `done`.
- If every mapped problem is complete, the page shows a completed state and offers the first chapter for review.
- The closest preceding article in the same chapter is shown beside the continue action as suggested reading, but reading it is not tracked.

This definition makes progress deterministic and recoverable from existing data while avoiding a second, conflicting completion system.

## Server Design

Add a `roadmaps` tRPC router with one public operation:

### `roadmaps.getBySlug`

Input:

- `slug`, initially only `code-thinking`.

Output:

- roadmap metadata and pinned source information;
- ordered chapters and nodes;
- for each LeetCode node, the matched local problem summary and shared progress state when available;
- chapter totals and completed counts;
- unique roadmap totals and completed counts;
- the next incomplete mapped LeetCode node;
- explicit mapping diagnostics for nodes missing from the local problem library.

The router loads the bundled metadata, queries local problems by `frontendId` in one batch, loads the current user's progress in one batch, and merges the results with a pure roadmap projector. It must not issue one database query per node.

Add pure shared/server helpers for:

- validating the snapshot and stable keys;
- resolving problem mappings;
- calculating occurrence-based chapter totals and unique overall totals;
- selecting the next incomplete problem;
- resolving previous and next roadmap nodes.

An unknown roadmap slug returns the existing typed tRPC not-found error. Missing local mappings are returned as data, not treated as an endpoint failure.

## Client Design

### Navigation and route

Add “Roadmap / 学习路线” to the main navigation after Today. Register:

`/roadmap/:slug`

The initial navigation destination is `/roadmap/code-thinking`.

### Roadmap page

The header shows:

- the 代码随想录 title and attribution link;
- the pinned snapshot revision in a compact source note;
- overall unique-problem progress;
- the current chapter derived from the next incomplete problem;
- one primary “Continue” action.

Below the header, render twelve chapters in order. Each chapter shows its mapped-problem completion count and an expandable ordered list of nodes. The current chapter opens by default; completed chapters may start collapsed.

Node actions:

- mapped LeetCode node: “Start problem” or “Review”, linking to the local detail page;
- unmapped LeetCode node: “Read externally”, with an unavailable-local badge;
- article: “Read original”;
- external: “Open ACM problem”, with provider and external badges.

The page preserves exact upstream order even though only LeetCode nodes affect progress. It remains usable offline for local problem nodes; external nodes clearly indicate that opening them requires network access.

### Roadmap-aware problem detail

Local problem links include validated context:

`/problems/binary-search?roadmap=code-thinking&section=array&step=2`

`ProblemDetail` accepts roadmap context only when all three values resolve to the current mapped node. Invalid or stale query parameters fall back to the existing normal problem view.

Valid context adds a compact roadmap panel containing:

- chapter and position;
- link back to the roadmap anchored to the chapter;
- previous and next roadmap item labels;
- local links for mapped LeetCode neighbors;
- source links for article, external, or unmapped neighbors.

The existing numeric/category neighbors remain unchanged when no valid roadmap context exists. Completing the problem through existing progress controls invalidates the roadmap query so the roadmap progress is fresh on return.

### External navigation

Only HTTPS URLs whose host matches the bundled roadmap metadata are rendered as external actions. Links open outside the app window and use safe `noopener` behavior. Missing or invalid URLs render disabled explanatory text.

### Internationalization and accessibility

Add Chinese and English labels for the navigation entry, progress summary, node types, missing mappings, continue state, and roadmap navigation. Source article titles remain in their official Chinese form when no accurate English title exists.

Chapter toggles expose expanded state, progress is available as text rather than color alone, and external actions clearly announce that they leave the app.

## LeetCode 376 and Missing Data

The roadmap must not depend on every mapped problem being present. The API and page render any missing problem as an external fallback.

For the first snapshot, add LeetCode 376 “Wiggle Subsequence / 摆动序列” to the bundled seed through the existing data-export workflow if it remains absent at release time. Its presence is verified after packaging. The runtime roadmap feature still retains its missing-mapping fallback for future upstream changes and older databases.

Do not overwrite user progress, notes, submissions, or existing problem content while filling missing catalog metadata.

## Generator and Validation

Add a developer-only route generation script that accepts an explicit commit SHA. It fetches raw files from that immutable revision, emits deterministic output, and fails on:

- duplicate chapter keys or node keys;
- missing titles or source URLs;
- unsupported node kinds;
- a LeetCode node without a positive `frontendId`;
- invalid or non-HTTPS source URLs;
- changed chapter ordering;
- a parsed node that cannot be classified.

The generated file is reviewed and committed; it is not generated during package installation or application startup.

Tests pin expected structural invariants for the committed snapshot, including twelve chapters, non-empty chapters, stable ordering, unique stable keys, and at least one node of every supported kind. Exact counts are recorded by the generated snapshot report so unexpected upstream changes are visible in review rather than silently accepted.

## Failure Handling and Data Safety

- The roadmap is read-only metadata plus existing progress; it creates no new user-data lifecycle.
- Missing mappings do not prevent other chapters or nodes from rendering.
- A failed external link never changes progress.
- Invalid roadmap context never replaces normal problem navigation.
- Existing Today, Review, Problems, Sync, Settings, judging, and progress behavior remains unchanged.
- Desktop startup performs no new schema work for this feature.
- Updating the route snapshot is explicit, pinned, reproducible, and reviewable.

## Testing and Acceptance

### Metadata and projector tests

- Snapshot validates all chapters and stable keys.
- Node kinds and source URLs are valid.
- Repeated problems share one progress record.
- Overall progress de-duplicates problems while chapter progress counts occurrences.
- Articles and external nodes do not affect completion totals.
- Continue selects the first incomplete mapped LeetCode problem.
- Missing local mappings become external fallbacks.
- Previous and next resolution preserves full route order.

### Router tests

- `getBySlug` rejects unknown slugs.
- Problem and progress loading is batched.
- Mapped problems include local metadata and status.
- Missing problems are reported without failing the response.
- Anonymous/local-user behavior follows existing desktop conventions.

### Client tests

- Navigation exposes the roadmap entry.
- Roadmap renders attribution, overall progress, current chapter, and all node kinds.
- Chapter progress and continue action use server results.
- Completed and repeated problems display shared status correctly.
- External and missing nodes render correct actions.
- Valid problem-detail context shows roadmap navigation.
- Invalid context preserves normal problem navigation.
- Completing a roadmap problem refreshes roadmap progress.
- Chinese and English UI strings render correctly.

### Release verification

Run formatting checks, type checking, the full automated test suite, production build, and Electron packaging. Install only after these pass. Back up the current app bundle and preserve the MySQL database, then manually verify:

1. Learning Roadmap appears after Today in the sidebar.
2. The Code Thinking page opens with twelve ordered chapters and source attribution.
3. Overall and chapter progress match existing solved problems.
4. Continue opens the first incomplete mapped local problem.
5. The detail page shows route-aware previous/next navigation.
6. Marking a problem done refreshes route progress.
7. Article and ACM nodes open the correct official external pages.
8. Missing mappings degrade to external actions.
9. Today, Review, Problems, Sync, Settings, judging, and SM-2 flows still work.
10. Restarting the packaged app preserves all existing user data.

## Non-goals for Version 1

- Database-backed article or external-node completion.
- Coupling Today problem selection to the roadmap.
- Local ACM input/output judging.
- Bundling upstream article text, images, or solutions.
- Runtime scraping or automatic upstream updates.
- User-authored custom roadmaps.
- Cloud synchronization of roadmap progress.
