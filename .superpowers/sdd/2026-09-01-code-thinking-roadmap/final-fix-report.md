# Final review fix report

Date: 2026-09-02
Branch: `feature/daily-learning-coach`
Reviewed base: `64b8db08a50e12e69dcf0d44deeae4ec3f537852`
Status: all Critical, Important, Minor, and documentation findings addressed; focused and full verification pass.

## Commits

- `0cbe2cb284bbb090b78dee8e5ade52d291c799c9` — `fix: make daily study completion exactly once`
- `4da89f9b5fe1b4acd4be3be32dce91f635a57012` — `fix: complete daily and roadmap learning states`

The report itself is committed separately after these two implementation commits so it can cite their stable hashes.

## Finding-by-finding disposition

### 1. Critical — exactly-once completion and mode race

Status: fixed.

Code changes:

- `server/study/service.ts:119` adds `completeStudySessionTransaction`, the single completion state machine used by production and transaction-faithful tests.
- The state machine locks and reads the persisted session and profile in the same transaction, derives required task keys from the locked session mode, validates the locked profile's `currentDayIndex` against the session's `curriculumDayIndex`, and reads completed task keys only after those locks.
- The session transition is guarded by user, session id, local date, and `status = in_progress`. A zero-row transition is treated as an idempotent duplicate; more than one affected row throws so the transaction rolls back.
- Profile advancement runs only after exactly one successful session transition and is guarded by the locked curriculum index. Any result other than one affected profile row throws so the transaction rolls back.
- `server/study/service.ts:329` adds the narrow `StudyCompletionConnector` production adapter. Its session and profile reads use MySQL `FOR UPDATE`, and its update methods return actual `affectedRows`.
- `server/study/service.ts:378` allows narrowly injecting the completion connector without replacing the surrounding repository/service logic.
- `server/study/service.ts:421`, `:436`, and `:452` serialize mode, explicit task, and problem-task mutations against the session row, preventing them from crossing completion while holding stale state.

Tests:

- `server/__tests__/study.transaction.test.ts:280` issues concurrent duplicate completions against a real SQLite transaction/state store and proves one `completed` plus one `already_completed`, with profile index exactly one.
- `server/__tests__/study.transaction.test.ts:298` holds the session lock while racing a mode change and proves completion validates the locked standard mode rather than the queued minimum mode.
- The same file verifies the exact lock order/arguments, zero-row transition behavior, multi-row invariant rollback, guarded profile index, profile-update rollback, and use of the injected production repository connector.

### 2. Important — prior-date unfinished sessions and curriculum-index validation

Status: fixed by rejecting stale mutations; prior sessions remain non-destructive historical records and create no backlog/debt.

Code changes:

- Service mutation methods capture one `now`, derive one local-date key, and pass it through every repository mutation contract.
- `setSessionMode`, `completeTask`, and `completeProblemTasks` require the session's persisted `localDate` to equal today.
- Problem matching locks and scans only today's `in_progress` session rows.
- Completion returns `stale_session` when an unfinished session is from a prior local date or its curriculum index no longer equals the locked profile index; the service exposes this as `PRECONDITION_FAILED` without changing progress.

Tests:

- `server/__tests__/study.repository.integration.test.ts:28` uses a real SQLite database to start unfinished sessions on consecutive dates, proves both remain on curriculum index zero (no backlog), rejects old-session mode/task/session completion, ignores an unrelated problem, and updates only today's matching problem tasks.
- `server/__tests__/study.service.test.ts:147` supplies a focused service-level regression for every historical mutation path.
- `server/__tests__/study.transaction.test.ts` independently proves a locked profile/session index mismatch cannot transition or advance.

### 3. Important — pre-start Today mode selection

Status: fixed.

Code changes:

- `client/src/pages/TodayPage.tsx:28` adds preview `selectedMode`, initializes and synchronizes it from `recommendedMode`, and keeps persisted session mode authoritative after start.
- Both selectors are enabled in preview; preview clicks update local selection, active-session clicks continue using `study.setMode`.
- Start submits and labels the selected mode rather than always submitting the recommendation.

Tests:

- `client/src/__tests__/pages.today.test.tsx:79` proves both preview controls are enabled, selecting minimum changes the start action, Start sends `{ mode: 'minimum' }`, and no premature `setMode` mutation occurs.
- A second regression proves a changed recommendation synchronizes an untouched preview.

### 4. Important — completed roadmap state

Status: fixed.

Code changes:

- `client/src/pages/Roadmap.tsx:94` distinguishes `completed === total && total > 0` from `total === 0`.
- A completed roadmap renders localized completion copy plus a localized review action targeting the first chapter; activating it also expands that chapter.
- `total === 0` retains the no-local-problem explanation.

Tests:

- `client/src/__tests__/pages.roadmap.test.tsx:98` verifies completed copy, the first-chapter target, chapter expansion, and absence of the no-local message.
- A separate test pins the zero-total no-local state.
- English and Chinese strings are asserted in `client/src/__tests__/i18n.test.tsx`.

### 5. Important — persistence/transaction-faithful coverage

Status: fixed.

Added coverage:

- `server/__tests__/study.transaction.test.ts` exercises the actual completion state machine through a narrow transaction connector, including concurrent duplicate completion and a serialized mode race.
- `server/testHelpers/sqliteStudyRepository.ts` provides a database-backed `StudyRepository` test adapter over the existing SQLite schema; it does not replace `StudyService` logic.
- `server/__tests__/study.repository.integration.test.ts` covers real uniqueness/state persistence and queries for date rollover, matching/unrelated progress, due/completed/easy warm-ups, first-unfinished core fallback, timed-review persistence, and Monday-Sunday counting.
- `server/__tests__/schema.study.test.ts` and `server/__tests__/core.desktopSchema.test.ts` cover the additive timed-review column and idempotent desktop upgrade.
- Existing `server/__tests__/routers.progress.test.ts` remains green and continues proving `progress.update(done)` calls the real matching integration boundary after the SM-2 upsert.

MySQL row-lock syntax itself cannot execute under SQLite. The production adapter therefore contains the MySQL `FOR UPDATE` calls, while the injected connector tests assert the lock/affected-row contract and the SQLite harness exercises serialized transactional outcomes against a real database.

### 6. Minor — timed-review persistence

Status: fixed with a safe additive schema change.

Code/data changes:

- `studySessions.coreIsTimedReview` is written when the session is created and read directly when Today is reconstructed, so an all-completed core remains labeled after navigation/restart.
- `drizzle/0003_persist_timed_review.sql` adds the non-destructive column with default `false`.
- `drizzle/schema.ts:303`, `server/testHelpers/inMemoryDb.ts:138`, and the desktop fresh-install DDL contain the matching field.
- `server/_core/desktopSchema.ts:65` queries `information_schema.COLUMNS` and issues the additive `ALTER TABLE` only when an existing desktop database lacks the column.
- Daily coach design/plan documentation now records the durable selection flag and upgrade behavior.

Tests:

- `server/__tests__/study.repository.integration.test.ts:96` starts an all-completed candidate session, resumes it, and asserts both DTOs plus the stored database row remain timed-review true.
- `server/__tests__/study.service.test.ts:193` provides a smaller regression.
- Schema and desktop-upgrade tests verify the default and one-time additive upgrade.

### 7. Minor — closest preceding article

Status: fixed.

Code changes:

- `client/src/pages/Roadmap.tsx:69` searches all earlier nodes in the current chapter and selects the closest article with `findLast`, rather than checking only the immediate previous node.

Tests:

- The main roadmap fixture places a completed problem between the article and next problem; `client/src/__tests__/pages.roadmap.test.tsx:84` proves the earlier article is still suggested.

### 8. Minor — localized return and system-browser announcements

Status: fixed.

Code changes:

- Added English/Chinese `roadmap.back` and `roadmap.opensInBrowser` keys.
- `client/src/components/RoadmapContextPanel.tsx:162` localizes the roadmap return link.
- External source attribution, suggested reading, missing-problem source, original article, ACM action, and external context-neighbor links now expose localized accessible names that explicitly say they open in the system browser.

Tests:

- `client/src/__tests__/pages.roadmap.test.tsx:85-95` asserts the browser-navigation wording for every roadmap external-action class.
- `client/src/__tests__/components.roadmapContextPanel.test.tsx:87` checks external neighbor wording, and `:91` checks Chinese return/browser text.
- `client/src/__tests__/i18n.test.tsx` pins all added English and Chinese keys.

### 9. Documentation — stale LCCI mapping example

Status: fixed.

- `docs/superpowers/plans/2026-09-01-code-thinking-roadmap.md:169-177` now shows `面试题02.07` as an article and explicitly documents that LCCI-labelled nodes remain articles to preserve approved source identity and pinned counts.
- The generated roadmap snapshot was not changed; its pinned structural/count test remains green in the full suite.

## RED evidence

All behavior changes were driven by focused failing tests before their production fixes.

1. `pnpm vitest run server/__tests__/study.service.test.ts`
   - RED: 3 of 5 failed.
   - Old-session mode mutation resolved instead of rejecting.
   - Cross-date matching changed 4 tasks instead of today's 2.
   - Persisted timed-review returned `false` instead of `true`.

2. `pnpm vitest run server/__tests__/study.transaction.test.ts`
   - Initial RED: all 6 initial cases failed because the transaction completion boundary did not exist.
   - Later invariant RED: a two-row transition resolved `already_completed` instead of throwing and rolling back.

3. `pnpm vitest run server/__tests__/study.repository.integration.test.ts`
   - RED: suite failed to load because the required SQLite database-backed repository adapter did not yet exist.

4. `pnpm vitest run client/src/__tests__/pages.today.test.tsx`
   - RED: preview standard/minimum controls were disabled.

5. `pnpm vitest run client/src/__tests__/pages.roadmap.test.tsx`
   - RED: closest preceding reading was absent and completed progress still rendered the no-local message.

6. `pnpm vitest run client/src/__tests__/components.roadmapContextPanel.test.tsx`
   - RED: external-neighbor accessible wording was absent and Chinese still rendered hard-coded English `Back to roadmap`.

7. `pnpm vitest run client/src/__tests__/i18n.test.tsx`
   - RED: both languages returned missing key paths for completed/review/back/browser copy.

## GREEN evidence

Focused GREEN runs:

- `pnpm vitest run server/__tests__/study.transaction.test.ts server/__tests__/study.service.test.ts server/__tests__/study.repository.integration.test.ts`
  - 3 files passed, initial 15 tests passed.
- Final `server/__tests__/study.transaction.test.ts`
  - 8 tests passed after adding the multi-row rollback invariant.
- `pnpm vitest run server/__tests__/schema.study.test.ts server/__tests__/core.desktopSchema.test.ts`
  - 2 files, 3 tests passed.
- Combined changed-surface regression run plus `pnpm check`
  - 11 files, 52 tests passed; TypeScript exited 0.
- Roadmap page final focused run
  - 8 tests passed, including completion-action expansion.

## Fresh final verification

Run after the final source/test changes:

```text
pnpm check
pnpm test
pnpm build
git diff --check
```

Results:

- `pnpm check`: exit 0 (`tsc --noEmit`).
- `pnpm test`: exit 0; 65/65 test files passed, 222/222 tests passed.
- `pnpm build`: exit 0; Vite transformed 6,587 modules and completed the production build; the server bundle completed at approximately 311.7 kB.
- `git diff --check`: exit 0.
- A concise repeat of the full suite after the implementation commits again reported 65/65 files and 222/222 tests passing.
- Electron packaging/installation was intentionally not run, per the fix-wave constraint.

Observed non-failing output was limited to existing environment/dependency warnings: `NO_COLOR` overridden by `FORCE_COLOR`, the development-only empty heartbeat-secret warning in its tests, one third-party missing sourcemap notice, and Vite's existing large-chunk advisory.

## Remaining concerns

No blocking correctness concern remains in the scoped findings.

Verification limitation: a live MySQL server was not used to load-test InnoDB locks or execute the additive migration. The MySQL-specific code is type-checked and explicitly uses `FOR UPDATE` plus driver `affectedRows`; the exact transaction contract is covered through the injected connector, and concurrent outcomes are covered with a real SQLite transaction/state store. The controller's planned scoped re-review and release verification should retain a real installed-database migration/concurrency smoke check before distribution.

The production build still reports its pre-existing large-chunk advisory; this fix wave does not add a new bundle-performance requirement and does not alter that concern.
