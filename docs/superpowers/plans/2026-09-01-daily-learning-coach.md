# Daily Learning Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an adherence-first Today workflow that combines Google SWE interview practice with GCP Professional Data Engineer study in repeatable 25- or 90-minute sessions.

**Architecture:** A deterministic, bundled 60-day curriculum feeds a pure scheduling engine and a transactional tRPC study service. Three MySQL tables persist the profile, one local-date session, and task completion; Electron runs an idempotent schema upgrade before starting the server. A new Today page orchestrates the flow, while the existing problem page receives optional study context for progressive hints and automatic task completion.

**Tech Stack:** TypeScript 5.9, React 19, Wouter, tRPC 11, Drizzle ORM/MySQL, Vitest, Testing Library, Electron 43.

**Spec:** `docs/superpowers/specs/2026-09-01-daily-learning-coach-design.md`

## Global Constraints

- Target five completed learning days per week.
- Standard mode is 90 minutes and requires review, DSA lesson, one core problem, and one career task.
- Minimum mode is 25 minutes and requires only review and DSA lesson.
- The curriculum advances only after a completed session; missed dates create no tasks or backlog.
- A gap of at least three local calendar days recommends minimum mode.
- Exactly one core problem is required in every standard session.
- Curriculum content is bundled and offline; no new LLM dependency is allowed.
- Existing user data, judge behavior, AI solutions, SM-2 reviews, and other routes must remain intact.
- Desktop schema upgrades must be idempotent and may not drop or overwrite existing tables.

## File Map

- `shared/studyTypes.ts` — shared Zod enums and public study DTO types.
- `server/study/curriculum.ts` — the 60-day static curriculum and runtime validation.
- `server/study/schedule.ts` — pure local-date, gap, requirement, and candidate-selection functions.
- `server/study/service.ts` — database orchestration used by both study and progress routers.
- `server/routers/study.ts` — tRPC input validation and study endpoints.
- `server/_core/desktopSchema.ts` — repeatable MySQL DDL upgrade for installed desktops.
- `drizzle/schema.ts`, `drizzle/0002_daily_learning_coach.sql`, `server/testHelpers/inMemoryDb.ts` — persistent and test schemas.
- `client/src/pages/TodayPage.tsx` — daily session UI.
- `client/src/components/StudyHintPanel.tsx` — progressive hint ladder on problem detail.
- `client/src/App.tsx`, `client/src/components/AppShell.tsx`, `client/src/i18n/{en,zh}.ts` — route, navigation, and localized copy.

---

### Task 1: Shared types, curriculum, and pure scheduling engine

**Files:**
- Create: `shared/studyTypes.ts`
- Create: `server/study/curriculum.ts`
- Create: `server/study/schedule.ts`
- Test: `server/__tests__/study.curriculum.test.ts`
- Test: `server/__tests__/study.schedule.test.ts`

**Interfaces:**
- Produces: `StudyModeSchema`, `StudyTaskTypeSchema`, `StudySessionStatusSchema`, and their inferred types.
- Produces: `CURRICULUM: readonly CurriculumDay[]` and `getCurriculumDay(index: number): CurriculumDay`.
- Produces: `requiredTaskKeys(mode)`, `localDateKey(date)`, `daysBetweenLocalDates(from, to)`, `shouldGentleRestart(lastCompletedAt, now)`, and `selectProblemCandidate(candidates, progressBySlug)`.

- [ ] **Step 1: Write curriculum validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { CURRICULUM, CurriculumDaySchema } from '../study/curriculum';

describe('daily curriculum', () => {
  it('contains 60 sequential, valid study days', () => {
    expect(CURRICULUM).toHaveLength(60);
    CURRICULUM.forEach((day, index) => {
      expect(CurriculumDaySchema.parse(day).index).toBe(index);
      expect(day.hints).toHaveLength(3);
      expect(new Set(day.hints).size).toBe(3);
    });
    expect(new Set(CURRICULUM.map((day) => day.key)).size).toBe(60);
  });

  it('schedules one career item per day and regular system-design practice', () => {
    expect(CURRICULUM.every((day) => day.career.body.trim().length > 0)).toBe(true);
    expect(CURRICULUM.filter((day) => day.career.type === 'system_design')).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run the curriculum test and verify it fails because the module is missing**

Run: `pnpm vitest run server/__tests__/study.curriculum.test.ts`

Expected: FAIL with an import error for `server/study/curriculum`.

- [ ] **Step 3: Define the shared schemas and all 60 curriculum entries**

```ts
// shared/studyTypes.ts
import { z } from 'zod';

export const StudyModeSchema = z.enum(['standard', 'minimum']);
export const StudySessionStatusSchema = z.enum(['in_progress', 'completed']);
export const StudyTaskTypeSchema = z.enum([
  'review', 'dsa_lesson', 'problem', 'gcp', 'system_design', 'behavioral',
]);
export type StudyMode = z.infer<typeof StudyModeSchema>;
export type StudyTaskType = z.infer<typeof StudyTaskTypeSchema>;
```

In `server/study/curriculum.ts`, define `CurriculumDaySchema` with non-empty strings, slug regex `/^[a-z0-9-]+$/`, exactly three hints, at least two core candidates, and a career discriminant. Build 12 explicit week objects, each with five explicit day objects; flatten them, assign sequential `index`, validate with `z.array(CurriculumDaySchema).length(60).parse(...)`, and export a frozen array. Content must cover the topic order in the design spec and must include a `system_design` item on every fourth day of each week.

- [ ] **Step 4: Run the curriculum test and verify it passes**

Run: `pnpm vitest run server/__tests__/study.curriculum.test.ts`

Expected: PASS, 60 entries validated.

- [ ] **Step 5: Write failing pure scheduling tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  localDateKey, requiredTaskKeys, selectProblemCandidate, shouldGentleRestart,
} from '../study/schedule';

describe('study schedule', () => {
  it('requires four standard tasks and only two minimum tasks', () => {
    expect(requiredTaskKeys('standard', 'gcp')).toEqual(['review', 'dsa', 'problem', 'career']);
    expect(requiredTaskKeys('minimum', 'gcp')).toEqual(['review', 'dsa']);
  });

  it('recommends a gentle restart after three local days away', () => {
    expect(shouldGentleRestart(new Date('2026-08-28T12:00:00+08:00'), new Date('2026-09-01T08:00:00+08:00'))).toBe(true);
    expect(shouldGentleRestart(new Date('2026-08-30T12:00:00+08:00'), new Date('2026-09-01T08:00:00+08:00'))).toBe(false);
  });

  it('uses the first unfinished core candidate and labels an all-done fallback as review', () => {
    const candidates = ['two-sum', 'group-anagrams'];
    expect(selectProblemCandidate(candidates, { 'two-sum': 'done' })).toEqual({ slug: 'group-anagrams', isTimedReview: false });
    expect(selectProblemCandidate(candidates, { 'two-sum': 'done', 'group-anagrams': 'done' })).toEqual({ slug: 'two-sum', isTimedReview: true });
  });

  it('creates a stable local date key', () => {
    expect(localDateKey(new Date(2026, 8, 1, 23, 30))).toBe('2026-09-01');
  });
});
```

- [ ] **Step 6: Run the scheduling tests and verify they fail**

Run: `pnpm vitest run server/__tests__/study.schedule.test.ts`

Expected: FAIL with an import error for `server/study/schedule`.

- [ ] **Step 7: Implement the pure scheduling functions**

Implement local-calendar arithmetic by constructing local midnight values from year/month/day, not by slicing `toISOString()`. `requiredTaskKeys` must always return one `problem` key only in standard mode. `selectProblemCandidate` must preserve input order and return the primary candidate with `isTimedReview: true` only when all candidates are `done`.

- [ ] **Step 8: Run both pure test files and type checking**

Run: `pnpm vitest run server/__tests__/study.curriculum.test.ts server/__tests__/study.schedule.test.ts && pnpm check`

Expected: PASS.

- [ ] **Step 9: Commit the pure domain layer**

```bash
git add shared/studyTypes.ts server/study/curriculum.ts server/study/schedule.ts server/__tests__/study.curriculum.test.ts server/__tests__/study.schedule.test.ts
git commit -m "feat: add daily study curriculum engine"
```

### Task 2: Persistent schema and safe desktop upgrade

**Files:**
- Modify: `drizzle/schema.ts`
- Create: `drizzle/0002_daily_learning_coach.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `server/testHelpers/inMemoryDb.ts`
- Create: `server/_core/desktopSchema.ts`
- Modify: `electron/main.mjs`
- Modify: `electron/server-entry.ts`
- Test: `server/__tests__/schema.study.test.ts`
- Test: `server/__tests__/core.desktopSchema.test.ts`

**Interfaces:**
- Produces: Drizzle tables `studyProfiles`, `studySessions`, and `studyTaskProgress` with inferred row types.
- Produces: `ensureDesktopSchema(args: { databaseUrl: string; connect?: Connector }): Promise<void>`.

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from 'vitest';
import { createInMemoryDb } from '../testHelpers/inMemoryDb';

describe('study schema', () => {
  it('enforces one profile per user, one session per local date, and one task key per session', () => {
    const { sqlite } = createInMemoryDb();
    sqlite.prepare("INSERT INTO users (id, openId) VALUES (1, 'local-dev')").run();
    sqlite.prepare('INSERT INTO studyProfiles (userId) VALUES (1)').run();
    expect(() => sqlite.prepare('INSERT INTO studyProfiles (userId) VALUES (1)').run()).toThrow();
    sqlite.prepare("INSERT INTO studySessions (id,userId,localDate,curriculumDayIndex,mode,status) VALUES (1,1,'2026-09-01',0,'standard','in_progress')").run();
    expect(() => sqlite.prepare("INSERT INTO studySessions (userId,localDate,curriculumDayIndex,mode,status) VALUES (1,'2026-09-01',0,'minimum','in_progress')").run()).toThrow();
    sqlite.prepare("INSERT INTO studyTaskProgress (sessionId,taskKey,taskType,status) VALUES (1,'dsa','dsa_lesson','pending')").run();
    expect(() => sqlite.prepare("INSERT INTO studyTaskProgress (sessionId,taskKey,taskType,status) VALUES (1,'dsa','dsa_lesson','pending')").run()).toThrow();
  });
});
```

- [ ] **Step 2: Run the schema test and verify missing-table failure**

Run: `pnpm vitest run server/__tests__/schema.study.test.ts`

Expected: FAIL with `no such table: studyProfiles`.

- [ ] **Step 3: Add the Drizzle schema, guarded migration, and SQLite mirror**

Define all columns and enums exactly as specified. `studyTaskProgress` also has a nullable `problemId` foreign key used only by review/problem tasks, so later progress integration can match a solved problem without parsing task keys. Add indexes for `(userId,status)`, `(userId,localDate)`, `sessionId`, and `problemId`. The migration must use `CREATE TABLE IF NOT EXISTS` and named unique keys. Add equivalent SQLite tables to `SCHEMA_SQL`.

- [ ] **Step 4: Run the schema test**

Run: `pnpm vitest run server/__tests__/schema.study.test.ts`

Expected: PASS.

- [ ] **Step 5: Write a failing idempotent desktop-upgrade test**

Inject a fake connector that records queries. Call `ensureDesktopSchema` twice and assert both calls execute only guarded `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX` statements, contain no `DROP`, `TRUNCATE`, or unguarded `ALTER`, and close both connections.

- [ ] **Step 6: Implement `ensureDesktopSchema` and wire it before server startup**

Reuse the database URL parsing behavior from seeding without logging credentials. `electron/server-entry.ts` must export the upgrader into the bundled `server.mjs`; `electron/main.mjs` must call it after `ensureSeeded` and before `startServer`:

```js
const { startServer, ensureSeeded, ensureDesktopSchema } = await import('./server.mjs');
await ensureSeeded({ databaseUrl: process.env.DATABASE_URL, seedPath });
await ensureDesktopSchema({ databaseUrl: process.env.DATABASE_URL });
```

- [ ] **Step 7: Run upgrade, schema, seed, and type tests**

Run: `pnpm vitest run server/__tests__/schema.study.test.ts server/__tests__/core.desktopSchema.test.ts server/__tests__/core.seedImport.test.ts && pnpm check`

Expected: PASS.

- [ ] **Step 8: Commit the safe schema upgrade**

```bash
git add drizzle/schema.ts drizzle/0002_daily_learning_coach.sql drizzle/meta/_journal.json server/testHelpers/inMemoryDb.ts server/_core/desktopSchema.ts electron/main.mjs electron/server-entry.ts server/__tests__/schema.study.test.ts server/__tests__/core.desktopSchema.test.ts
git commit -m "feat: persist daily study sessions safely"
```

### Task 3: Study service and tRPC workflow

**Files:**
- Create: `server/study/service.ts`
- Create: `server/routers/study.ts`
- Modify: `server/routers.ts`
- Test: `server/__tests__/routers.study.test.ts`
- Modify: `server/__tests__/routers.assembly.test.ts`

**Interfaces:**
- Produces: `getTodayStudy(db, userId, now)`, `startTodayStudy(db, userId, mode, now)`, `setStudyMode(db, userId, sessionId, mode)`, `completeStudyTask(db, userId, sessionId, taskKey, now)`, and `completeStudySession(db, userId, sessionId, now)`.
- Produces tRPC procedures `study.today`, `study.start`, `study.setMode`, `study.completeTask`, and `study.completeSession`.

- [ ] **Step 1: Write failing router tests for preview, idempotent start, and no backlog**

Use the existing app-router caller and test DB stubbing pattern from `routers.progress.test.ts`. Freeze `Date` with `vi.useFakeTimers()` and `vi.setSystemTime(new Date('2026-09-01T08:00:00+08:00'))`, seed user 1 and curriculum problem slugs, and assert:

```ts
const preview = await caller.study.today();
expect(preview.session).toBeNull();
expect(preview.curriculumDay.index).toBe(0);

const first = await caller.study.start({ mode: 'standard' });
const again = await caller.study.start({ mode: 'minimum' });
expect(again.session.id).toBe(first.session.id);
expect(again.session.mode).toBe('standard');
```

Complete a session on September 1, start again on September 9, and assert the new session has curriculum day 1, not day 8.

- [ ] **Step 2: Run the router tests and verify the router is missing**

Run: `pnpm vitest run server/__tests__/routers.study.test.ts`

Expected: FAIL because `caller.study` is undefined.

- [ ] **Step 3: Implement preview and start inside transactions**

`today` must create the default profile if absent but must not create a session. `start` must use `localDateKey(now)`, select review/core problems before inserting tasks, and use the unique date constraint plus a re-read to stay idempotent under duplicate requests. Return a DTO containing profile, session, tasks, curriculum day, selected problem summaries, weekly count, gap days, and recommended mode.

- [ ] **Step 4: Add failing tests for mode switching and completion rules**

Assert a standard session cannot complete with only `review` and `dsa`; switching to minimum allows it; completed task rows are preserved; repeated completion returns the already completed session and leaves `currentDayIndex` at 1.

- [ ] **Step 5: Implement mode and task/session completion**

Reject task keys that are not part of the session. Reject mutations against another user’s session. `completeTask` is an idempotent update. `completeSession` must lock/read the session and profile in one transaction, calculate requirements from the persisted mode, reject missing requirements with `TRPCError({ code: 'PRECONDITION_FAILED' })`, mark completion, and advance only when the prior session status was `in_progress`.

- [ ] **Step 6: Add failing selection and restart tests**

Cover due SM-2 review, oldest completed fallback, curriculum easy fallback, first unfinished core fallback, timed-review core fallback, local-week completion count, and minimum recommendation after a three-day gap.

- [ ] **Step 7: Implement selection queries and complete the Today DTO**

Selection queries must load only the rows required to choose candidates. Problem summaries return `id`, `frontendId`, `titleSlug`, localized titles, and difficulty. Weekly count includes completed sessions from local Monday through Sunday.

- [ ] **Step 8: Register the router and extend the assembly test**

Add `study: studyRouter` to `server/routers.ts` and assert all five procedures exist in the router assembly test.

- [ ] **Step 9: Run study router, assembly, and type tests**

Run: `pnpm vitest run server/__tests__/routers.study.test.ts server/__tests__/routers.assembly.test.ts && pnpm check`

Expected: PASS.

- [ ] **Step 10: Commit the server workflow**

```bash
git add server/study/service.ts server/routers/study.ts server/routers.ts server/__tests__/routers.study.test.ts server/__tests__/routers.assembly.test.ts
git commit -m "feat: add transactional daily study workflow"
```

### Task 4: Automatically connect problem completion to Today

**Files:**
- Modify: `server/study/service.ts`
- Modify: `server/routers/progress.ts`
- Modify: `server/__tests__/routers.progress.test.ts`
- Modify: `server/__tests__/routers.study.test.ts`

**Interfaces:**
- Produces: `completeMatchingStudyProblemTasks(db, userId, problemId, now): Promise<number>`.
- Consumes: active task metadata written by `startTodayStudy`.

- [ ] **Step 1: Write failing integration tests**

Start a standard session, mark its selected review problem and core problem `done` through `progress.update`, then query Today and assert the corresponding `review` and `problem` tasks are completed. Mark another problem done and assert no study task changes. Repeat either matching progress update and assert there is still one row per task key.

- [ ] **Step 2: Run the integration tests and verify they fail on pending task state**

Run: `pnpm vitest run server/__tests__/routers.progress.test.ts server/__tests__/routers.study.test.ts`

Expected: FAIL only on the new study-task assertions.

- [ ] **Step 3: Implement automatic matching**

Use the nullable `studyTaskProgress.problemId` foreign key created in Task 2. After the existing SM-2 upsert succeeds, call `completeMatchingStudyProblemTasks`. It must update only `review` or `problem` tasks in an in-progress session belonging to the same user and having the matching problem id; return the number of changed rows.

- [ ] **Step 4: Invalidate no unrelated behavior and run regression tests**

Run: `pnpm vitest run server/__tests__/routers.progress.test.ts server/__tests__/routers.study.test.ts server/__tests__/progress.sm2.test.ts && pnpm check`

Expected: PASS.

- [ ] **Step 5: Commit progress integration**

```bash
git add drizzle/schema.ts drizzle/0002_daily_learning_coach.sql server/testHelpers/inMemoryDb.ts server/study/service.ts server/routers/progress.ts server/__tests__/routers.progress.test.ts server/__tests__/routers.study.test.ts
git commit -m "feat: sync solved problems with daily study"
```

### Task 5: Today page, navigation, and localization

**Files:**
- Create: `client/src/pages/TodayPage.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/AppShell.tsx`
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/zh.ts`
- Create: `client/src/__tests__/pages.today.test.tsx`
- Modify: `client/src/__tests__/components.appShell.test.tsx`
- Modify: `client/src/__tests__/i18n.test.tsx`

**Interfaces:**
- Consumes: the five `study` tRPC procedures and their inferred DTOs.
- Produces: `/today` route and Today links to `/problems/:slug?studySession=<id>&studyTask=problem`.

- [ ] **Step 1: Write failing Today-page component tests**

Mock `trpc.study.today/start/setMode/completeTask/completeSession`. Cover preview and active-session states:

```tsx
expect(screen.getByText('0/5 learning days')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Start 90-minute session' })).toBeEnabled();
await user.click(screen.getByRole('button', { name: 'Minimum · 25 min' }));
expect(setMode.mutate).toHaveBeenCalledWith({ sessionId: 12, mode: 'minimum' });
expect(screen.queryByTestId('task-problem-required')).not.toBeInTheDocument();
```

Also assert the gentle-restart banner, four ordered standard cards, two required minimum cards, completed styling, and disabled/enabled finish button.

- [ ] **Step 2: Run the Today tests and verify the page is missing**

Run: `pnpm vitest run client/src/__tests__/pages.today.test.tsx`

Expected: FAIL with import error for `TodayPage`.

- [ ] **Step 3: Implement the Today page with the existing design system**

Use existing `Button`, `Card`, `Badge`, and progress components. Keep one primary action per card. The query is the source of truth; each mutation invalidates `study.today`, and completion additionally invalidates progress dashboard/list queries. Render standard-only tasks as optional completed history after a switch to minimum, but do not label them required.

- [ ] **Step 4: Add failing navigation and i18n tests**

Assert `/` redirects to `/today`, Today is the first nav item and active on `/today`, and all new keys exist with non-empty English and Chinese values.

- [ ] **Step 5: Wire route, first navigation item, and copy**

Add `TodayPage` to `App.tsx`, change the redirect, prepend `{ href: '/today', key: 'nav.today' }`, and add the complete `today.*` and `studyHints.*` string sets in both languages.

- [ ] **Step 6: Run client tests and type checking**

Run: `pnpm vitest run client/src/__tests__/pages.today.test.tsx client/src/__tests__/components.appShell.test.tsx client/src/__tests__/i18n.test.tsx && pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit the Today experience**

```bash
git add client/src/pages/TodayPage.tsx client/src/App.tsx client/src/components/AppShell.tsx client/src/i18n/en.ts client/src/i18n/zh.ts client/src/__tests__/pages.today.test.tsx client/src/__tests__/components.appShell.test.tsx client/src/__tests__/i18n.test.tsx
git commit -m "feat: add adherence-first Today page"
```

### Task 6: Progressive problem hints and return flow

**Files:**
- Create: `client/src/components/StudyHintPanel.tsx`
- Modify: `client/src/pages/ProblemDetail.tsx`
- Create: `client/src/__tests__/components.studyHintPanel.test.tsx`
- Modify: `client/src/__tests__/pages.problemDetail.test.tsx`

**Interfaces:**
- Consumes: `studySession` and `studyTask` URL query parameters plus the active `study.today` DTO.
- Produces: `StudyHintPanel({ hints, completed, onBack })` with sequential reveal behavior.

- [ ] **Step 1: Write failing hint-ladder tests**

```tsx
render(<StudyHintPanel hints={['Think hash map', 'Store complements', 'One pass']} completed={false} />);
expect(screen.queryByText('Think hash map')).not.toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Reveal hint 1' }));
expect(screen.getByText('Think hash map')).toBeInTheDocument();
expect(screen.queryByText('Store complements')).not.toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Reveal hint 2' }));
expect(screen.getByText('Store complements')).toBeInTheDocument();
```

- [ ] **Step 2: Run the component test and verify the component is missing**

Run: `pnpm vitest run client/src/__tests__/components.studyHintPanel.test.tsx`

Expected: FAIL with import error.

- [ ] **Step 3: Implement the isolated hint panel**

Keep reveal state local to the page visit. Render numbered revealed hints, one next reveal button, an encouragement message after all three, and a Today return link when the task is complete. Do not hide or alter the existing solution panel.

- [ ] **Step 4: Write failing ProblemDetail context tests**

Render a Today-linked URL and mock `study.today` with matching session id, task key, slug, and hints. Assert the panel appears above the resizable content. Render the same problem without query parameters and assert the panel is absent. After progress `done` succeeds, assert both `progress.*` and `study.today` queries are invalidated.

- [ ] **Step 5: Integrate study context into ProblemDetail**

Parse URL parameters using `URLSearchParams(window.location.search)`. Enable `study.today` only when both study parameters are valid. Render hints only when the active session and problem slug match; ignore stale or forged context. Extend the existing progress mutation success handler to invalidate `study.today`.

- [ ] **Step 6: Run problem-page tests, client regression tests, and type checking**

Run: `pnpm vitest run client/src/__tests__/components.studyHintPanel.test.tsx client/src/__tests__/pages.problemDetail.test.tsx client/src/__tests__/pages.today.test.tsx && pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit progressive hints**

```bash
git add client/src/components/StudyHintPanel.tsx client/src/pages/ProblemDetail.tsx client/src/__tests__/components.studyHintPanel.test.tsx client/src/__tests__/pages.problemDetail.test.tsx
git commit -m "feat: guide daily problems with progressive hints"
```

### Task 7: Full regression, production packaging, and local installation

**Files:**
- Modify only files required to fix issues exposed by verification.

**Interfaces:**
- Consumes the complete feature.
- Produces a tested arm64 Electron app in `release/mac-arm64/LeetCode Tracker.app` and an installed app in `/Applications/LeetCode Tracker.app`.

- [ ] **Step 1: Run formatting checks without bulk-rewriting unrelated files**

Run: `git diff --check && pnpm check`

Expected: PASS with no TypeScript or whitespace errors.

- [ ] **Step 2: Run the complete automated suite**

Run: `pnpm test`

Expected: all existing and new Vitest suites PASS.

- [ ] **Step 3: Build the production web/server bundle**

Run: `pnpm build`

Expected: Vite and server bundling exit 0.

- [ ] **Step 4: Build the Electron application**

Run: `pnpm electron:build`

Expected: seed export, client build, Electron server bundle, and arm64 packaging exit 0; `release/mac-arm64/LeetCode Tracker.app` exists.

- [ ] **Step 5: Smoke-test the packaged app without replacing the installed app**

Quit the running installed app, launch `release/mac-arm64/LeetCode Tracker.app`, and verify the Today route loads against the existing database. Exercise start/resume, mode switch, one lesson completion, problem hint reveals, problem completion sync, and session completion. Also open Review, Problems, Sync, and Settings and run one existing problem-detail/judge navigation smoke check.

- [ ] **Step 6: Back up and replace the installed application bundle**

Resolve the exact current and new bundle paths. Move `/Applications/LeetCode Tracker.app` to a timestamped `/Applications/LeetCode Tracker.backup-YYYYMMDD-HHMMSS.app`, then copy the verified `release/mac-arm64/LeetCode Tracker.app` into `/Applications`. Do not touch the MySQL database or Electron user-data directory.

- [ ] **Step 7: Launch the installed build and repeat critical acceptance checks**

Verify default Today route, persisted active session, mode switch, progressive hints, automatic problem-task completion, finish gating, and weekly count. Confirm the app can be quit and reopened with state intact.

- [ ] **Step 8: Inspect final version-control state and commit any verification fixes**

Run: `git status --short && git log --oneline -8`

Expected: only the visual brainstorming session directory remains untracked; all product changes are committed. If verification required code fixes, commit only those exact files with `fix: harden daily study release`.

## Final Acceptance Checklist

- [ ] The 60-day curriculum validates and can be completed in sequence without calendar catch-up.
- [ ] Standard and minimum modes enforce the correct tasks.
- [ ] A three-day gap recommends, but does not force, minimum mode.
- [ ] Starting and completing requests are idempotent.
- [ ] Existing databases receive the new tables on startup without data loss.
- [ ] Today is the default route and reports weekly learning days without a streak.
- [ ] A Today problem exposes exactly three progressive hints.
- [ ] Marking that problem done completes the Today problem task.
- [ ] Type checking, every Vitest suite, production build, and Electron packaging pass.
- [ ] The packaged app is manually exercised before and after local installation.
