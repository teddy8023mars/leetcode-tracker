# LeetCode Tracker — Design Specification

**Document ID**: `2026-05-10-leetcode-tracker-design`
**Status**: Draft (awaiting user review)
**Author**: Manus Agent (under obra/superpowers + openai/codex-plugin-cc methodology)
**Date**: 2026-05-10
**Owner**: Teddy哥

---

## 0. Document Purpose

This document is the single source of truth for the LeetCode Tracker project. It captures every product decision, architectural choice, schema design, sync rule, API surface, frontend structure, visual style, test strategy, deployment plan, and identified risk. All implementation plans (`docs/superpowers/plans/*`) MUST be derivable from this spec without further user clarification.

The spec was produced through 8 brainstorming rounds with the user, applying obra/superpowers' "one question at a time, multiple choice first" rule. Each section was self-reviewed using openai/codex-plugin-cc's adversarial-review schema before being recorded here. All findings rated `high` or `critical` were resolved in this final document; `medium` and `low` findings are tracked in §9.

---

## 1. Architecture Overview

### 1.1 Product Positioning

A single-user, locally-runnable + cloud-deployable LeetCode practice companion that consolidates Hot 100, Top Interview 150, and the high-frequency interview problems of 25 major tech companies. Strong offline-friendliness (data is fully cached locally) combined with strong automation (daily syncs via Heartbeat cron run silently).

### 1.2 Deployment Topology

| Environment | Purpose |
|---|---|
| **Manus Cloud (primary)** | Public URL hosts the running app and is the only environment where Heartbeat cron can reach the scheduled endpoints. This is the day-to-day workspace. |
| **Local backup** | Project source code + weekly DB dump exported as ZIP. The user can `pnpm install && pnpm db:push && pnpm dev` against a local MySQL/SQLite to keep an offline working copy. |

### 1.3 System Diagram

```
┌──────────────────────────────────────────────────┐
│  Client (React 19 + Tailwind 4 + shadcn/ui)      │
│  ├─ Dashboard  ├─ Problem List  ├─ Problem Detail│
│  ├─ Lists      ├─ Companies     ├─ Review        │
│  └─ Settings   ├─ Sync Status   └─ i18n (en/zh)  │
└──────────────┬───────────────────────────────────┘
               │ tRPC over HTTPS (/api/trpc)
┌──────────────▼───────────────────────────────────┐
│  Server (Express 4 + tRPC 11)                    │
│  ├─ problems / progress / aiSolution / stats     │
│  ├─ lists / companies / sync                     │
│  └─ /api/scheduled/*  ← Heartbeat cron entrypoints
└────────┬───────────────────────┬─────────────────┘
         │                       │
   ┌─────▼──────┐         ┌──────▼──────────┐
   │  MySQL DB  │         │ External Sources│
   │  9 tables  │         │ ├─ leetcode.com │
   │            │         │ │   GraphQL    │
   └────────────┘         │ ├─ leetcode.cn  │
                          │ │   GraphQL    │
                          │ └─ liquidslr   │
                          │   GitHub raw   │
                          └──────────────────┘
                                  ▲
                                  │ daily 02:00 UTC
                          ┌───────┴─────────┐
                          │ Heartbeat Cron  │
                          │ (Manus platform)│
                          └─────────────────┘
```

### 1.4 Module Boundaries

| Module | Responsibility | Inputs | Outputs |
|---|---|---|---|
| `server/sync/leetcode.ts` | LeetCode GraphQL client (en/zh dual-site) | titleSlug or list type | metadata / detail JSON |
| `server/sync/liquidslr.ts` | GitHub CSV fetch + parse with zod schema | company directory listing | normalized rows |
| `server/sync/orchestrator.ts` | Coordinate sources, write DB, log results | sync type | SyncLog row |
| `server/sync/aiPregenerate.ts` | Bulk pre-generate AI solutions for Hot100+Top150 | list of problemIds | inserted aiSolutions rows |
| `server/db.ts` | Drizzle query helpers (returns raw rows) | — | typed result objects |
| `server/routers/*.ts` | tRPC procedures | tRPC ctx + input | tRPC output |
| `server/_core/heartbeatAuth.ts` | Validate `X-Heartbeat-Secret` header | Express req | next() or 401 |
| `client/pages/*.tsx` | UI views | tRPC hooks | React elements |
| `client/i18n/*.ts` | English / Chinese UI message dictionaries | message key | localized string |

### 1.5 Hard Constraints

1. UI code MUST NOT call LeetCode or GitHub directly. All external traffic flows through `server/sync/*`.
2. AI generation MUST go through `server/_core/llm.ts` (Manus internal). No third-party LLM SDK is added.
3. Scheduled tasks MUST be registered through Heartbeat cron after deployment, not via in-process `setInterval`.
4. The schema is finalized in M1 in one migration. M2 and M3 only fill rows; no further schema changes are planned.
5. All long-text body content is stored as Markdown source. Rendering happens at view time via `streamdown` and `shiki`.

### 1.6 Milestones

| ID | Scope | Acceptance |
|---|---|---|
| **M1** | Database schema, sync pipeline (incl. leetcode.cn reachability probe + LLM-translation fallback), problem list page, problem detail page (problem text + official solution tab + manual code answer placeholder), basic auth, ZIP backup | User can browse Hot100 / Top150 / company lists, search and filter, open a problem, see content in current language, and read the official solution if available. |
| **M2** | AI solution lazy-generate + cache, three-state progress tracking, notes, spaced-repetition scheduling, dashboard (overview cards + 30-day trend + company×difficulty heatmap + tag completion bars), `/review` page | User can mark progress, write notes, view dashboard with real data, and study via `/review` queue. |
| **M3** | i18n full coverage (UI + problem text + AI solution dual-language), daily Heartbeat cron registration, manual sync trigger UI, weekly DB backup cron, owner notifications | Cron runs daily without user action; UI fully bilingual; owner is alerted on sync failure. |

---

## 2. Database Schema

The schema defines **9 tables**: `users` (kept from the scaffold), and 8 new tables. All long-form content is stored as Markdown text. All timestamps are MySQL `TIMESTAMP` (UTC under the hood, displayed in browser local time on the client).

### 2.1 Tables

#### 2.1.1 `users` (existing, unchanged)

Provided by the scaffold. Fields: `id`, `openId` (unique), `name`, `email`, `loginMethod`, `role`, `createdAt`, `updatedAt`, `lastSignedIn`.

#### 2.1.2 `problems`

Stores problem metadata and detail. Detail fields are nullable; they are populated either by the initial bootstrap (Hot100+Top150) or lazy fetch (other problems).

```ts
{
  id: int PK auto,
  frontendId: int unique,
  titleSlug: varchar(255) unique,
  titleEn: varchar(500),
  titleZh: varchar(500),
  difficulty: enum('Easy','Medium','Hard') NOT NULL,
  paidOnly: boolean default false,
  acRate: decimal(5,2),

  // detail (lazy-populated)
  contentEn: longtext,
  contentZh: longtext,                       // null when leetcode.cn unreachable; LLM-translated value goes here too
  contentZhSource: enum('leetcode-cn','llm-translated') default null,
  hintsJson: json,
  exampleTestcases: text,
  topicTagsJson: json,                       // [{slug, nameEn, nameZh}]
  similarQuestionsJson: json,
  codeSnippetsJson: json,                    // [{lang:'python3', code:'...'}, ...]

  contentFetchedAt: timestamp,                // null = detail not yet fetched
  metaUpdatedAt: timestamp,
  createdAt: timestamp default now,
}

INDEX idx_difficulty (difficulty)
INDEX idx_frontendId (frontendId)
INDEX idx_paidOnly (paidOnly)
```

#### 2.1.3 `problemSolutions`

Replaces the originally-planned `officialSolution*` columns on `problems`. Mirrors `aiSolutions` structurally so a future "community top-3" source could be added with no schema change.

```ts
{
  id: int PK auto,
  problemId: int FK NOT NULL,
  source: enum('leetcode-cn-official','leetcode-en-official') NOT NULL,
  language: enum('en','zh') NOT NULL,
  contentMarkdown: longtext NOT NULL,
  fetchedAt: timestamp default now,
}

UNIQUE (problemId, source, language)
INDEX idx_problemId (problemId)
```

#### 2.1.4 `companyTags`

Maps a problem to a company with frequency and timeframe. A problem may appear under multiple companies and multiple timeframes.

```ts
{
  id: int PK auto,
  problemId: int FK NOT NULL,
  companySlug: varchar(64) NOT NULL,           // 'google', 'meta', 'bytedance', ...
  companyName: varchar(128) NOT NULL,
  frequency: decimal(5,2),                      // higher = more frequently asked
  timeframe: enum('30d','3m','6m','1y','all') NOT NULL,
  source: enum('liquidslr','leetcode-companyTag') NOT NULL,
  syncedAt: timestamp default now,
}

UNIQUE (problemId, companySlug, timeframe)
INDEX idx_companySlug (companySlug)
INDEX idx_frequency (frequency)
```

#### 2.1.5 `problemLists`

Represents canonical list bundles only. Per the boundary rule established in §2.3, **company lists are NOT stored here**; they are derived from `companyTags` at query time.

```ts
{
  id: int PK auto,
  slug: varchar(64) unique NOT NULL,            // 'hot-100', 'top-interview-150'
  titleEn: varchar(255) NOT NULL,
  titleZh: varchar(255) NOT NULL,
  source: enum('leetcode-list','custom') NOT NULL,
  metaJson: json,
}
```

#### 2.1.6 `problemListItems`

```ts
{
  id: int PK auto,
  listId: int FK NOT NULL,
  problemId: int FK NOT NULL,
  position: int NOT NULL,
}

UNIQUE (listId, problemId)
INDEX idx_listId (listId)
```

#### 2.1.7 `aiSolutions`

```ts
{
  id: int PK auto,
  problemId: int FK NOT NULL,
  language: enum('en','zh') NOT NULL,
  approachMarkdown: longtext NOT NULL,           // step-by-step reasoning
  complexityMarkdown: text NOT NULL,             // time + space derivation
  pythonCode: text NOT NULL,
  javaCode: text NOT NULL,
  cppCode: text NOT NULL,
  pitfallsMarkdown: text,                        // common mistakes / edge cases
  generatedAt: timestamp default now,
  modelVersion: varchar(64),
}

UNIQUE (problemId, language)
INDEX idx_problemId (problemId)
```

#### 2.1.8 `aiGenerationLocks`

Prevents duplicate LLM calls when the same problem is opened from multiple tabs simultaneously.

```ts
{
  id: int PK auto,
  problemId: int FK NOT NULL,
  language: enum('en','zh') NOT NULL,
  lockedAt: timestamp default now,
  lockedUntil: timestamp NOT NULL,               // lockedAt + 60s
}

UNIQUE (problemId, language)
```

Lock acquisition: `INSERT ... ON DUPLICATE KEY UPDATE lockedAt = IF(lockedUntil < NOW(), VALUES(lockedAt), lockedAt)`. The thread that wins the row (lockedAt matches its own value) generates; others poll `aiSolutions` every 1s up to 90s.

#### 2.1.9 `userProgress`

```ts
{
  id: int PK auto,
  userId: int FK NOT NULL,
  problemId: int FK NOT NULL,
  status: enum('todo','reviewing','done') NOT NULL default 'todo',
  noteMarkdown: longtext,

  // spaced repetition
  reviewIntervalDays: int default 0,
  nextReviewAt: timestamp,
  reviewCount: int default 0,
  lastReviewedAt: timestamp,
  firstCompletedAt: timestamp,

  createdAt: timestamp default now,
  updatedAt: timestamp default now on update now,
}

UNIQUE (userId, problemId)
INDEX idx_user_status (userId, status)
INDEX idx_user_next_review (userId, nextReviewAt)
```

#### 2.1.10 `attempts`

Append-only event log. Replaces the originally-planned JSON column on `userProgress` (per §2.3 finding 1). Used by the dashboard 30-day trend.

```ts
{
  id: int PK auto,
  userId: int FK NOT NULL,
  problemId: int FK NOT NULL,
  attemptedAt: timestamp default now,
}

INDEX idx_user_date (userId, attemptedAt)
```

#### 2.1.11 `syncLogs`

```ts
{
  id: int PK auto,
  syncType: enum('initial-bootstrap','daily-sync-lists','daily-sync-meta','daily-sync-companies','manual','detail-fetch','ai-pregenerate','ai-on-demand','db-backup','probe-leetcode-cn') NOT NULL,
  status: enum('running','success','failed','partial') NOT NULL,
  startedAt: timestamp default now,
  finishedAt: timestamp,
  itemsProcessed: int default 0,
  itemsSucceeded: int default 0,
  itemsFailed: int default 0,
  errorSummary: text,
  metaJson: json,
}

INDEX idx_type_started (syncType, startedAt)
```

### 2.2 Boundary Rule: Company Lists vs problemLists

A "Google high-frequency" list as displayed in the UI is not stored as a row in `problemLists`. Instead, the frontend fetches it via `companies.getBySlug({slug:'google'})` which queries `companyTags` filtered by `companySlug='google'` ordered by `frequency DESC`. Only Hot100 and Top150 (which are LeetCode's first-party curated lists) live in `problemLists`.

This avoids data duplication and avoids the question "if a problem is in Hot100 AND Google, do we duplicate the row?".

### 2.3 Resolved Schema Findings

The §2 self-review surfaced 4 findings; all `high` and `medium` were resolved in this final design:

- **F1 (high) attemptCountJson unbounded growth** → resolved by introducing `attempts` table (§2.1.10) instead of JSON column.
- **F2 (medium) companyTags vs problemLists overlap** → resolved by §2.2 boundary rule.
- **F3 (medium) officialSolutionContent inflates problems row** → resolved by introducing `problemSolutions` table (§2.1.3).
- **F4 (low) syncLogs cleanup** → deferred to M3 §9, will add monthly retention cron deleting rows older than 90 days.

---

## 3. Sync Pipeline

### 3.1 Sources

| Source | URL | Used For |
|---|---|---|
| LeetCode US GraphQL | `https://leetcode.com/graphql` | English titles + content + topic tags + code snippets + Hot100/Top150 list members |
| LeetCode CN GraphQL | `https://leetcode.cn/graphql` | Chinese titles + translated content + Chinese official solution |
| liquidslr GitHub raw | `https://raw.githubusercontent.com/liquidslr/interview-company-wise-problems/main/...` | 25-company high-frequency CSVs |

### 3.2 Sync Tasks

| Task ID | Trigger | Work | Frequency |
|---|---|---|---|
| `initial-bootstrap` | Manual, post-deploy | (1) Fetch Hot100 & Top150 list members → upsert into `problemLists` + `problemListItems`. (2) For these ~250 problems, fetch full bilingual detail + leetcode.cn official solution → write `problems` (with `contentFetchedAt`) and `problemSolutions`. (3) Fetch all 25 company CSVs from liquidslr → write `companyTags` (only metadata; content stays null until lazy fetch). | Once per fresh deploy |
| `probe-leetcode-cn` | First step of `initial-bootstrap` | Issue 3 test queries against leetcode.cn. If any 2 succeed → mark Chinese channel as available. Else → mark unavailable and set `contentZhSource='llm-translated'` for the run. | Once at bootstrap; rerun weekly |
| `daily-sync-lists` | Heartbeat cron, 02:00 UTC | Re-fetch Hot100 + Top150 list members. Upsert `problemListItems`. Add new problems to `problems` (metadata only). | Daily |
| `daily-sync-meta` | Heartbeat cron, 02:10 UTC | For all known `problems`, refresh `acRate`, `topicTagsJson`, `titleEn/Zh`. Batch in chunks of 50 problems per GraphQL request. | Daily |
| `daily-sync-companies` | Heartbeat cron, 02:20 UTC | (1) HEAD/GET the GitHub commits API for liquidslr to detect new commit since last sync. (2) If new → fetch all 25 company CSVs and upsert `companyTags`. (3) If unchanged → no-op. | Daily |
| `detail-fetch` | tRPC `problems.getBySlug` when `contentEn IS NULL` | Lazy-fetch full bilingual detail for one slug. Returns immediately with whatever is already cached; populates DB asynchronously so subsequent calls hit the cache. | Per problem, on demand |
| `ai-pregenerate` | Background task after `initial-bootstrap` | For each of ~250 Hot100+Top150 problems, generate 2 AI solutions (en + zh). Skip rows already present in `aiSolutions` (resumable). | Once after bootstrap |
| `ai-on-demand` | tRPC `aiSolution.getOrGenerate` cache miss | Generate one (problemId, language) pair. Uses lock from §2.1.8. | Per request, on demand |
| `db-backup-weekly` | Heartbeat cron, Sunday 03:00 UTC | mysqldump-equivalent into S3 storage as `.sql.gz`. Retains last 8 weeks. | Weekly (M3) |

### 3.3 GraphQL Queries

| Query | Used Fields |
|---|---|
| `problemsetQuestionListV2(filtersV2: { listFilter: { listId } })` | `total`, `questions { titleSlug, frontendQuestionId, title, difficulty, paidOnly, acRate, topicTags { slug, name } }` |
| `questionData(titleSlug)` (US) | `content`, `hints`, `exampleTestcases`, `topicTags`, `similarQuestions`, `codeSnippets { lang, langSlug, code }`, `acRate`, `difficulty` |
| `questionTranslations(titleSlug)` (CN) | `translatedTitle`, `translatedContent`, `topicTags { translatedName }` |
| `solution(questionSlug)` (CN) | `content`, `title` (used for `problemSolutions.contentMarkdown` with HTML → Markdown conversion via `turndown`) |

### 3.4 Idempotency & Resumability

- All upserts use Drizzle's `.onDuplicateKeyUpdate({ set: {...} })`. Repeating a sync produces zero net change.
- Bootstrap and ai-pregenerate skip rows where `contentFetchedAt IS NOT NULL` or `aiSolutions(problemId, language)` already exists. Mid-run failure followed by retry resumes from the missing item.
- `syncLogs` rows with `status='running'` older than 30 minutes are auto-marked `failed` at the start of the next sync of the same type.

### 3.5 Rate Limiting & Retry

| Risk | Mitigation |
|---|---|
| LeetCode IP throttle | 200 ms delay between GraphQL calls (5 req/s ceiling). |
| LeetCode transient 5xx / network error | Exponential backoff: 1s → 2s → 4s, max 3 retries. |
| LeetCode returns null `questionData` (problem deleted/private) | Soft-fail. Log to `syncLogs.errorSummary`. Do not abort batch. |
| GitHub raw 404 / rate limit | Retry twice with 5s delay. On final failure, keep existing `companyTags` rows untouched. |
| LLM call timeout / 429 | Skip this (problemId, language). Will be retried next time the user opens the problem (on-demand path). |
| Heartbeat single-call timeout (assumed ~5 min cap) | Three separate cron registrations (lists/meta/companies) split the work. Each completes within budget. |
| Process restart mid-sync | Per §3.4, resumable. The orphaned `running` row is auto-cleaned. |
| leetcode.cn unreachable from Manus cloud | Fallback chain: try leetcode.cn → if probe failed or this call fails, mark `contentZhSource='llm-translated'`, call `invokeLLM` to translate `contentEn` to Chinese, store in `contentZh`. |

### 3.6 zod Validation for liquidslr CSV

```ts
const csvRowSchema = z.object({
  Title: z.string().min(1),
  Difficulty: z.enum(['Easy','Medium','Hard']),
  Frequency: z.coerce.number().min(0).max(100),
  AcceptanceRate: z.coerce.number().optional(),
  Link: z.string().url(),
});
```

Any row failing validation is logged to `syncLogs.errorSummary` and skipped. The whole CSV is rejected (no upserts written) only if validation success rate is below 50%.

### 3.7 Resolved Sync Findings

- **F1 (critical) leetcode.cn unreachable from Manus cloud** → resolved by §3.5 fallback chain + §3.2 `probe-leetcode-cn` task.
- **F2 (high) bootstrap no resumability** → resolved by §3.4 idempotency rules.
- **F3 (high) Heartbeat single-call timeout** → resolved by splitting `daily-sync` into 3 separate cron entries (§3.2).
- **F4 (medium) liquidslr CSV format drift** → resolved by §3.6 zod schema.

---

## 4. Backend API & tRPC Routers

### 4.1 Module Structure

```
server/routers/
├── problems.ts
├── progress.ts
├── stats.ts
├── aiSolution.ts
├── lists.ts
├── companies.ts
├── sync.ts
└── index.ts        ← assembles appRouter
```

`server/_core/heartbeatAuth.ts` is a new Express middleware that validates an `X-Heartbeat-Secret: <HEARTBEAT_SECRET>` header on every `/api/scheduled/*` request. Missing or wrong header → 401.

`server/_core/ownerOnly.ts` exports `ownerOnlyProcedure = protectedProcedure.use(({ctx, next}) => {  if (ctx.user.openId !== ENV.ownerOpenId) throw new TRPCError({code:'FORBIDDEN'}); return next({ctx}); })`. Used for `sync.triggerManual` and any future admin actions.

### 4.2 Procedure Surface

#### `problems`
- `list({ filters: { difficulty?, listSlug?, companySlug?, tagSlug?, search?, paidOnly?, status? }, limit:int=50, cursor?:int }) → { items: Problem[], nextCursor?:int }` — public.
- `getBySlug({ titleSlug }) → ProblemFull` — public. If `contentEn IS NULL`, kicks off `detail-fetch` and returns whatever is cached.
- `getMetadata({ ids:int[] }) → Problem[]` — public, batch-fetch helper used by lists.

#### `progress`
- `setStatus({ problemId, status }) → UserProgress` — protected. Side effect: when `status='done'`, recomputes `nextReviewAt` and increments `reviewCount`; when transitioning out of `done`, resets `reviewIntervalDays` to 1.
- `addNote({ problemId, noteMarkdown }) → UserProgress` — protected.
- `recordAttempt({ problemId }) → { id }` — protected. Inserts an `attempts` row.
- `getMine({ problemId }) → UserProgress | null` — protected.
- `dueForReview() → Problem[]` — protected. `WHERE userId=ctx.user.id AND nextReviewAt <= NOW()` ordered by `nextReviewAt`.

#### `stats`
- `overview() → { total, todo, reviewing, done, byDifficulty:{Easy:{done,total},Medium:{...},Hard:{...}}, dueToday }` — protected.
- `dailyTrend({ days:int=30 }) → { date:string, attempts:int }[]` — protected.
- `companyHeatmap() → { companySlug, companyName, difficulty, doneCount, totalCount }[]` — protected.
- `tagCompletion({ topN:int=20 }) → { tagSlug, tagName, doneCount, totalCount }[]` — protected.

#### `aiSolution`
- `getOrGenerate({ problemId, language }) → AiSolution` — protected. Algorithm:
  1. SELECT from `aiSolutions` WHERE matching → return.
  2. Acquire lock via `aiGenerationLocks` upsert.
  3. If lock won: call `invokeLLM` with structured-JSON `response_format`, parse, INSERT into `aiSolutions`, release lock, return.
  4. If lock not won: poll every 1s up to 90s; on timeout return TRPCError `TIMEOUT`.

#### `lists`
- `all() → ProblemList[]` — public.
- `getBySlug({ slug }) → { list, items: (Problem & { position:int })[] }` — public.

#### `companies`
- `all() → { companySlug, companyName, problemCount }[]` — public. Aggregated from `companyTags` GROUP BY `companySlug`.
- `getBySlug({ slug, timeframe?='all' }) → { companySlug, companyName, problems: (Problem & { frequency:number })[] }` — public.

#### `sync`
- `status() → { lastByType: Record<SyncType, SyncLog>, recentLogs: SyncLog[] }` — public.
- `triggerManual({ syncType }) → { syncLogId:int }` — owner-only. Spawns the work asynchronously (fire-and-forget) and returns immediately.

### 4.3 Heartbeat Endpoints

| Method | Path | Header | Body | Action |
|---|---|---|---|---|
| POST | `/api/scheduled/sync-lists` | `X-Heartbeat-Secret` | empty | Run `daily-sync-lists` |
| POST | `/api/scheduled/sync-meta` | `X-Heartbeat-Secret` | empty | Run `daily-sync-meta` |
| POST | `/api/scheduled/sync-companies` | `X-Heartbeat-Secret` | empty | Run `daily-sync-companies` |
| POST | `/api/scheduled/db-backup-weekly` | `X-Heartbeat-Secret` | empty | Run `db-backup` (M3) |

All endpoints respond `200 { ok:true, syncLogId }` immediately and execute the work asynchronously. The `syncLogs` row is the canonical record.

### 4.4 Error Handling Convention

- Business errors → `throw new TRPCError({ code, message, cause })`. Codes used: `NOT_FOUND`, `FORBIDDEN`, `TIMEOUT`, `INTERNAL_SERVER_ERROR`, `BAD_REQUEST`, `CONFLICT`.
- User-data-not-found (e.g. progress for an unstarted problem) → return `null`, not throw.
- Sync errors → log to `syncLogs.errorSummary`. Do not surface to UI unless the user explicitly opens `/sync`.
- `notifyOwner` is called from `orchestrator.runSync` whenever `status` ends as `'failed'` or `'partial'` with > 10% failure rate.

### 4.5 Resolved API Findings

- **F1 (high) AI generation race** → resolved by `aiGenerationLocks` table (§2.1.8) + locking algorithm in §4.2.
- **F2 (high) Heartbeat endpoints unauthenticated** → resolved by `heartbeatAuth` middleware (§4.1).
- **F3 (medium) list query SQL performance** → acceptance criterion: p95 < 500 ms for any single combined filter against ~2 000 problems. Implementation uses indexed JOINs; if exceeded, add fulltext index on `titleEn` + `titleZh`.
- **F4 (medium) stats route load** → resolved by client-side `staleTime: 60_000` on all `stats.*` queries.

---

## 5. Frontend Structure

### 5.1 Routes (wouter)

```
/                       → redirect to /dashboard
/dashboard              → Dashboard
/problems               → Problem list (default browse view)
/problems/:titleSlug    → Problem detail
/lists                  → List overview
/lists/:listSlug        → Single list
/companies              → Companies grid
/companies/:companySlug → Company detail
/review                 → Today's spaced-repetition queue
/sync                   → Sync status & manual trigger
/settings               → Language, theme, backup
/404                    → fallback
```

### 5.2 Component Tree

```
client/src/
├── App.tsx                         (Routes + ThemeProvider + LangProvider + ErrorBoundary)
├── pages/
│   ├── Dashboard.tsx
│   ├── ProblemList.tsx
│   ├── ProblemDetail.tsx
│   ├── ListOverview.tsx
│   ├── ListDetail.tsx
│   ├── Companies.tsx
│   ├── CompanyDetail.tsx
│   ├── Review.tsx
│   ├── SyncStatus.tsx
│   ├── Settings.tsx
│   └── NotFound.tsx
├── components/
│   ├── DashboardLayout.tsx         (kept from scaffold)
│   ├── ProblemTable.tsx
│   ├── DifficultyBadge.tsx
│   ├── StatusBadge.tsx
│   ├── FilterSidebar.tsx
│   ├── SearchBar.tsx
│   ├── ProblemContent.tsx          (DOMPurify-sanitized HTML render)
│   ├── CodeBlock.tsx               (shiki-highlighted)
│   ├── SolutionTabs.tsx
│   ├── AiSolutionView.tsx
│   ├── NoteEditor.tsx
│   ├── TrendChart.tsx              (recharts line)
│   ├── HeatmapGrid.tsx
│   ├── TagCompletionBar.tsx
│   ├── LangSwitcher.tsx
│   ├── BlueprintBackground.tsx     (SVG grid + decorative geometry)
│   └── ui/                         (shadcn/ui — generated)
├── i18n/
│   ├── index.ts                    (LangContext + useT hook)
│   ├── en.ts
│   └── zh.ts
├── hooks/
│   ├── useFilters.ts
│   ├── useDebounce.ts
│   └── useProblemList.ts
├── contexts/
│   ├── ThemeContext.tsx            (kept)
│   └── LangContext.tsx             (new)
├── lib/
│   ├── trpc.ts                     (kept)
│   └── shiki.ts                    (singleton highlighter with 5s timeout fallback)
└── index.css                       (design tokens)
```

### 5.3 Key Page Behavior

#### `/problems`
- Layout: 256 px filter sidebar (left) + main area with search bar + table.
- Filter dimensions: difficulty (Easy/Medium/Hard), list (Hot100/Top150), companies (25 chips), tags (dynamic from loaded problems), status (todo/reviewing/done), Premium toggle.
- Table columns: # | Title | Difficulty | Tags (top 3) | Acceptance | Companies | My Status.
- All filter state mirrored to URL query string. Refresh restores state.
- Cursor-based pagination with infinite scroll OR "Load more" button.

#### `/problems/:titleSlug`
- Layout: 60% left (problem text + examples + constraints + similar) + 40% right (solution tabs + progress panel).
- Right top: three-state status buttons (Todo / Reviewing / Done) and a "Record attempt" button.
- Solution tabs:
  - **Official** — markdown rendered from `problemSolutions` (filtered by current language). If absent, shows a "No official solution" notice with a link to the LeetCode discuss page.
  - **AI Analysis** — calls `aiSolution.getOrGenerate({problemId, language})`. While generating, shows skeleton; on result, sub-tabs for Approach / Complexity / Python / Java / C++ / Pitfalls.
- Note editor — collapsible markdown textarea, autosaved with 1s debounce.

#### `/dashboard`
- Row 1: 4 stat cards (Total / Done / Reviewing / Due Today).
- Row 2: 30-day attempt trend (line chart) + difficulty completion donut.
- Row 3: company × difficulty heatmap (25 rows × 3 cols) + top-20 tag completion horizontal bars.

#### `/review`
- Vertical card stack of problems where `nextReviewAt <= NOW()`.
- Click → opens detail in same tab. Returning to `/review` removes completed ones.

### 5.4 Visual Design Tokens

Defined in `client/src/index.css` under `@theme inline`:

```css
--accent-cyan: #B5DCDC;          /* primary accent — soft cyan */
--accent-pink: #F5C9D6;          /* secondary accent — light pink */
--ink-primary: #0D0D0D;          /* heading black */
--ink-secondary: #4A4A4A;        /* body text */
--paper: #FAFAF7;                /* warm paper white */
--grid-line-minor: rgba(13,13,13,0.04);
--grid-line-major: rgba(13,13,13,0.08);

--font-display: 'Inter', 'Plus Jakarta Sans', sans-serif;  /* bold sans heading */
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', monospace; /* technical labels */
--font-body: 'Inter', sans-serif;
```

Visual rules:
- Global background: `BlueprintBackground` SVG with 24 px major grid + 4 px minor grid. Sparse decorative geometry (circle, triangle, equation glyph) at fixed corners, 6% opacity.
- Cards: white fill, 1 px solid black border, 4 px radius, no shadow.
- Tag chips: mono font, 1 px outline, transparent fill.
- Difficulty badges: Easy = cyan fill; Medium = pink fill; Hard = white fill with 2 px black border.
- Buttons: black fill + white text + 0 radius. Hover inverts to white fill + black text + black border.
- Table rows: alternating white / `#FAFAF7`. Hover adds 4 px black left border.
- Code blocks: `#0D0D0D` background, shiki theme `github-dark-default`.
- Charts: lines & bars use `--accent-cyan` and `--accent-pink`; axis labels in `--ink-secondary` mono font.

### 5.5 i18n Strategy

- `useT()` hook returns a function `t(key)` that looks up dot-notation paths in `messages[lang]`.
- Initial language: `localStorage.lang` ?? (`navigator.language.startsWith('zh')` ? 'zh' : 'en').
- On switch, persist to localStorage; React Query cache is keyed by `[procedure, input]` so AI solutions for both languages coexist.
- Problem text: in `ProblemContent`, render `contentZh` if `lang==='zh'` else `contentEn`. Fall back to the other language with a tag if the requested one is null.
- Single-file en.ts / zh.ts in M3 initial pass; per-page split deferred (see §9).

### 5.6 Resolved Frontend Findings

- **F1 (high) XSS in problem HTML** → `ProblemContent` uses `isomorphic-dompurify` with allowlist `[p, pre, code, em, strong, ul, ol, li, img, a, sup, sub, table, thead, tbody, tr, td, th, br, hr, span, div, h1-h6, blockquote, kbd]` and attribute allowlist `[href, src, alt, title, class]`. `<script>`, event handlers, and `javascript:` URIs are stripped.
- **F2 (medium) shiki failure blocks all code** → `lib/shiki.ts` exports `highlight(code, lang)` that races a 5s `Promise.race` between shiki and a fallback returning `<pre><code class={lang}>{code}</code></pre>`. On failure, mono font keeps it readable.
- **F3 (medium) URL filter sync infinite loop** → `useFilters` uses a stable object reference via `useMemo` keyed on `JSON.stringify(filters)`; navigation only triggered inside an event handler, never inside `useEffect`.
- **F4 (low) i18n single-file size** → tracked in §9 for future split.

---

## 6. Testing, i18n Implementation, Deployment & Backup

### 6.1 Testing Pyramid

| Layer | Share | Tooling | Scope |
|---|---|---|---|
| Unit | 70% | Vitest | Pure functions: sync parsers, spaced-repetition algorithm, filter SQL builder, useFilters URL sync, i18n key lookup, DOMPurify allowlist. |
| Integration | 25% | Vitest + appRouter.createCaller + in-memory SQLite | tRPC procedures end-to-end with real DB but mocked external HTTP (LeetCode/GitHub/LLM). |
| Manual E2E | 5% | Browser | Full flows: list → detail → AI solution → mark done → dashboard updates. |

### 6.2 Test DB Strategy

The default `DATABASE_URL` points to remote MySQL. Tests must not depend on it.

Approach: introduce `server/db.ts` as a thin layer over Drizzle, and a test-time `getDb()` injection that returns a `drizzle(sqliteDb)` backed by `better-sqlite3` in-memory. The MySQL/SQLite divergence is small for our queries; we'll prefer Drizzle's portable APIs (no MySQL-specific functions in app code) and document any unavoidable difference.

If `better-sqlite3` integration proves too heavy in early tasks, the fallback is to mock `getDb()` at the module level in each test using `vi.mock`. Decision is deferred to the first DB-touching task in the implementation plan; the spec only mandates that **no test requires a live MySQL**.

### 6.3 Test Cases (≥ 45 specs across modules)

Sync (server/sync/*.test.ts):
- `leetcode.fetchListProblems('hot-100')` returns ≥ 100 items each with `frontendId` and `titleSlug`.
- `leetcode.fetchQuestionDetail` returns null for a deleted slug — caller logs and continues.
- `leetcode.fetchQuestionDetail` retries up to 3 times on 5xx, then throws `RetryExhausted`.
- `liquidslr.parseCsv` rejects rows missing required columns.
- `liquidslr.fetchCompanyData` skips download when GitHub commit hash matches last sync.
- `orchestrator.runSync` rejects with `CONCURRENT_SYNC` when another row of same type has `status='running'`.
- `orchestrator.runSync` resumes by skipping problems with non-null `contentFetchedAt`.
- `aiPregenerate` skips already-existing `(problemId, language)` rows.
- `probe-leetcode-cn` returns `{ available:false }` when 2 of 3 probe requests fail.

Spaced repetition (server/srs.test.ts):
- First completion (`reviewCount=0`) sets `interval=1, nextReviewAt=now+1d`.
- Second completion (`reviewCount=1`) sets `interval=2`.
- Sequence 1→2→4→7→15→30→60 across 7 completions.
- Status reverted from `done` to `reviewing` resets `interval=0` and clears `nextReviewAt`.

Routers (server/routers/*.test.ts):
- `problems.list` filters by `companySlug='google'` returns only google-tagged problems.
- `problems.list` cursor pagination is stable (no duplicates, no skipped rows across pages).
- `problems.list` search is case-insensitive across `titleEn` and `titleZh`.
- `progress.setStatus({status:'done'})` writes `nextReviewAt` and increments `reviewCount`.
- `aiSolution.getOrGenerate` cache hit returns without calling LLM.
- `aiSolution.getOrGenerate` lock contention: second concurrent call polls and returns the first call's result without invoking LLM twice.
- `stats.overview` numbers reconcile with `userProgress` table aggregates.
- `sync.triggerManual` rejects non-owner with `FORBIDDEN`.
- `/api/scheduled/sync-lists` without secret header returns 401.

Frontend (client/src/**/*.test.tsx):
- `ProblemContent` strips `<script>` from input HTML.
- `DifficultyBadge` renders correct color class for each difficulty.
- `useFilters` writes to URL on change without retriggering effect when underlying object identity changes but content is equal.
- `LangSwitcher` clicking 'zh' updates `useT()('dashboard.title')` to the Chinese version.
- `useDebounce(value, 300)` only emits final value when input changes 5 times within 300 ms.

### 6.4 i18n Implementation

```ts
// client/src/i18n/index.ts
type Lang = 'en' | 'zh';

const LangContext = createContext<{lang: Lang; setLang: (l: Lang) => void}>({...});

export function LangProvider({ children }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('lang') as Lang | null;
    if (stored === 'en' || stored === 'zh') return stored;
    return navigator.language.startsWith('zh') ? 'zh' : 'en';
  });
  const setLang = (l: Lang) => {
    localStorage.setItem('lang', l);
    setLangState(l);
  };
  return <LangContext.Provider value={{lang, setLang}}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

export function useT() {
  const { lang } = useContext(LangContext);
  return useCallback((key: string) => {
    return key.split('.').reduce((obj: any, k) => obj?.[k], messages[lang]) ?? key;
  }, [lang]);
}
```

The `LangProvider` is mounted in `App.tsx` outside `Switch`, so language changes re-render the whole app.

### 6.5 Deployment Plan

1. After M3 completion, run `webdev_save_checkpoint`.
2. User clicks **Publish** in the Manus management UI. This produces a public URL like `https://leetcode-tracker.manus.space`.
3. Generate `HEARTBEAT_SECRET` and store via `webdev_request_secrets`.
4. Register 4 Heartbeat cron entries:
   - `02:00 UTC daily` → `POST /api/scheduled/sync-lists` with `X-Heartbeat-Secret`.
   - `02:10 UTC daily` → `POST /api/scheduled/sync-meta`.
   - `02:20 UTC daily` → `POST /api/scheduled/sync-companies`.
   - `03:00 UTC weekly Sunday` → `POST /api/scheduled/db-backup-weekly`.
5. Trigger `initial-bootstrap` once via `sync.triggerManual` from the UI.
6. Wait for `ai-pregenerate` to finish (~30–50 min for 250 problems × 2 languages).
7. Owner-notification smoke test: temporarily break a sync (e.g. wrong header) and confirm `notifyOwner` fires.

### 6.6 Local Backup Plan

- **Code backup** — after M3, create a project ZIP via Manus management UI's "Download as ZIP" or `manus-export-slides`-equivalent. Store separately.
- **DB backup** — two channels:
  1. Weekly automatic dump to S3 by `db-backup` cron, retained 8 weeks.
  2. Manual on-demand: `scripts/dump-db.ts` invoked via the management UI Database panel exports a compressed SQL file the user downloads.
- **Local rerun guide** — `README.md` documents:
  ```bash
  pnpm install
  cp .env.example .env   # fill in DATABASE_URL pointing to local MySQL/SQLite
  pnpm db:push
  pnpm dev
  # Optional: import a previous DB dump
  ```
  Manus-platform-only ENVs (`BUILT_IN_FORGE_API_KEY`, `OAUTH_*`) are optional locally; if absent the LLM and OAuth features degrade gracefully (read-only browse still works).

### 6.7 Resolved Test/Deploy Findings

- **F1 (low) test DB unreachable** → resolved by §6.2 in-memory SQLite + dependency injection.

---

## 7. Out of Scope

The following are explicitly **not** in M1–M3:
- Code editor / submit-to-LeetCode integration. Solving happens externally; the app only tracks status.
- Multi-user / sharing / leaderboards.
- Mobile-native app. Responsive web only.
- Community solutions ingestion (only official + AI as decided).
- More than 25 companies.
- Languages beyond English and Simplified Chinese.
- Premium-locked problems' content (we record `paidOnly=true` and show a "Premium-only" notice instead of fetching).

---

## 8. 25-Company Roster

Final list (frozen at spec time; the user may extend it via a one-off DB seed without code changes since `companyTags` is open-ended):

| Region | Companies |
|---|---|
| US | Google, Meta, Amazon, Microsoft, Apple, Netflix, Uber, Airbnb, LinkedIn, Salesforce, Adobe, Nvidia, Tesla |
| China | ByteDance, Tencent, Alibaba, Baidu, Meituan, Xiaohongshu, DiDi |
| SEA / Multi | Grab, Shopee, Sea, TikTok, Lazada |

Each company's `companySlug` is the lowercased canonical name. The mapping from liquidslr's directory names to these slugs is defined in `server/sync/liquidslr.ts` `COMPANY_SLUG_MAP`.

---

## 9. Tracked Deferred Items (post-spec backlog)

Low-severity findings not blocking M1 launch; revisited in their target milestone:

| ID | Description | Target | From |
|---|---|---|---|
| D1 | `syncLogs` retention (delete > 90 days monthly) | M3 | §2.3 F4 |
| D2 | Split `i18n/en.ts` and `i18n/zh.ts` into per-page modules | post-M3 | §5.6 F4 |
| D3 | Optional fulltext index on `titleEn` + `titleZh` if list query p95 > 500 ms | M2 perf check | §4.5 F3 |

---

## 10. Spec Self-Audit (codex-plugin-cc adversarial review of the full document)

Run after the document was assembled. Treat the spec itself as the artifact under review.

```json
{
  "verdict": "needs-attention",
  "summary": "Spec is comprehensive but has 3 medium ambiguities and 1 high traceability gap that must be resolved before plan-writing.",
  "findings": [
    {
      "severity": "high",
      "title": "leetcode.cn fallback path lacks a concrete LLM-translation prompt contract",
      "body": "§3.5 says 'invokeLLM to translate contentEn'. The plan can't be derived without (a) the system+user prompt, (b) what HTML structure should be preserved, (c) acceptance criterion for translation quality.",
      "file": "docs/superpowers/specs/2026-05-10-leetcode-tracker-design.md",
      "line_start": 0, "line_end": 0,
      "confidence": 0.9,
      "recommendation": "Add §3.8 specifying: input is contentEn HTML; system prompt 'You are a technical translator. Translate LeetCode problem statement to Simplified Chinese. Preserve all <pre>, <code>, <var>, <strong>, <em> tags and all variable names, numbers, math expressions verbatim. Output only the translated HTML.'; max length 8000 chars; if longer, truncate at paragraph boundary and translate in chunks. Acceptance: spot-check 5 random problems, no broken HTML and all code identifiers preserved."
    },
    {
      "severity": "medium",
      "title": "AI solution structured-output JSON schema not specified",
      "body": "§4.2 aiSolution.getOrGenerate uses 'response_format'. The plan needs the exact schema name, properties, and required fields to write the integration test fixtures.",
      "file": "docs/superpowers/specs/2026-05-10-leetcode-tracker-design.md",
      "line_start": 0, "line_end": 0,
      "confidence": 0.85,
      "recommendation": "Add §4.6 with JSON schema: { name:'leetcode_ai_solution', strict:true, schema: { type:'object', properties: { approachMarkdown, complexityMarkdown, pythonCode, javaCode, cppCode, pitfallsMarkdown }, required:[approach,complexity,python,java,cpp], additionalProperties:false } }."
    },
    {
      "severity": "medium",
      "title": "Heartbeat cron registration mechanism not concretized",
      "body": "§6.5 mentions 'Register 4 Heartbeat cron entries' but does not name the actual command/API. Plan can't tell if it's a CLI, a manual UI, or an API.",
      "file": "docs/superpowers/specs/2026-05-10-leetcode-tracker-design.md",
      "line_start": 0, "line_end": 0,
      "confidence": 0.8,
      "recommendation": "Defer the exact mechanism to the first task that needs it; the task will read /home/ubuntu/leetcode-tracker/references/periodic-updates.md (already pulled by the periodic-updates skill) and follow whatever pattern that file specifies. Spec records the 4 cron entries (path, schedule, header) as the contract."
    },
    {
      "severity": "medium",
      "title": "Frontend ProblemContent does not specify how Markdown vs HTML differ across content sources",
      "body": "leetcode.com returns content as HTML; leetcode.cn similar; LLM translation per §10.F1 returns HTML; problemSolutions.contentMarkdown is Markdown (per §3.3 turndown step). The component must know which renderer to use.",
      "file": "docs/superpowers/specs/2026-05-10-leetcode-tracker-design.md",
      "line_start": 0, "line_end": 0,
      "confidence": 0.7,
      "recommendation": "Clarify §5.3: ProblemContent always renders HTML (DOMPurify+innerHTML). SolutionTabs/AiSolutionView always render Markdown via Streamdown. problemSolutions stores Markdown (turndown converts at sync time)."
    }
  ],
  "next_steps": [
    "Add §3.8 LLM translation prompt contract.",
    "Add §4.6 AI solution JSON schema.",
    "Clarify §6.5 cron registration via periodic-updates.md reference.",
    "Clarify §5.3 HTML vs Markdown rendering boundary."
  ]
}
```

### 10.1 Resolved (added below)

#### §3.8 LLM Translation Prompt (resolves §10 F1)

```
System: You are a technical translator. Translate the LeetCode problem statement
        below from English to Simplified Chinese. Preserve every HTML tag exactly
        (<p>, <pre>, <code>, <var>, <strong>, <em>, <ul>, <ol>, <li>, <sup>, <sub>,
        <img>, <table>, <tr>, <td>, <th>, <br>, <hr>, <span>, <div>). Preserve all
        code, variable names, numbers, mathematical expressions, and identifiers
        verbatim — never translate identifiers like nums, target, root, dp[i].
        Output ONLY the translated HTML — no preamble, no explanation, no Markdown
        fences.

User:   {contentEn}
```

Constraints:
- Max input: 8 000 characters. If exceeded, split at the nearest `</p>` boundary and translate chunks in sequence; concatenate.
- Output validation: must contain at least one Chinese character (`/[\u4e00-\u9fa5]/`); otherwise mark sync as failed for this slug and retry on next pass.
- Acceptance: spot-check 5 problems post-bootstrap; all HTML tags balanced and all `<code>` content intact.

#### §4.6 AI Solution JSON Schema (resolves §10 F2)

```json
{
  "name": "leetcode_ai_solution",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "approachMarkdown":   { "type": "string", "minLength": 50 },
      "complexityMarkdown": { "type": "string", "minLength": 20 },
      "pythonCode":         { "type": "string", "minLength": 20 },
      "javaCode":           { "type": "string", "minLength": 20 },
      "cppCode":            { "type": "string", "minLength": 20 },
      "pitfallsMarkdown":   { "type": "string" }
    },
    "required": ["approachMarkdown","complexityMarkdown","pythonCode","javaCode","cppCode","pitfallsMarkdown"],
    "additionalProperties": false
  }
}
```

System prompt (per language):
- `en`: "You are an expert competitive-programming coach. Provide a thorough, step-by-step approach (brute force → optimization), rigorous time and space complexity derivation, and clean, idiomatic implementations in Python 3, Java, and C++ with inline comments on tricky lines. Highlight common pitfalls."
- `zh`: same content translated into Simplified Chinese; code identifiers and language keywords stay English.

#### §6.5 Cron Registration (resolves §10 F3)

The implementation plan's first M3 task reads `/home/ubuntu/leetcode-tracker/references/periodic-updates.md` (auto-installed by the periodic-updates skill) and follows that file's exact instructions for registering scheduled callbacks. The spec contract is the 4-row table in §4.3 (path, schedule, header). Whether registration uses a CLI, an HTTP API, or a UI form is determined by the reference doc.

#### §5.3 Rendering Boundary (resolves §10 F4)

| Content | Stored As | Rendered By |
|---|---|---|
| `problems.contentEn` / `contentZh` | HTML (LeetCode native) or HTML (LLM-translated) | `ProblemContent` → `DOMPurify.sanitize` then `dangerouslySetInnerHTML` |
| `problemSolutions.contentMarkdown` | Markdown (converted from leetcode.cn HTML at sync time via `turndown`) | `Streamdown` |
| `aiSolutions.{approach,complexity,pitfalls}Markdown` | Markdown | `Streamdown` |
| `aiSolutions.{python,java,cpp}Code` | Plain code text | `CodeBlock` (shiki) |
| `userProgress.noteMarkdown` | Markdown | `Streamdown` (read mode), textarea (edit mode) |

---

## 11. Approval

This spec is presented to the user for review. Once approved, it is frozen as the contract for `docs/superpowers/plans/*` files. Any later requirement change MUST update this spec first (with a new dated revision section) before plan changes are accepted.

**Spec Status**: ☐ Awaiting user approval.
