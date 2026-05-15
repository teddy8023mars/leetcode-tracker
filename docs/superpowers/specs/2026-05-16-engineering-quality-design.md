# Engineering Quality Hardening

Three-phase cleanup to strengthen the codebase before adding new features.

## Phase 1: Dead Code Cleanup

Remove unused modules that add cognitive overhead and maintenance burden.

### Server files to delete

| File | Reason |
|------|--------|
| `server/_core/imageGeneration.ts` | No router or code references |
| `server/_core/voiceTranscription.ts` | No references |
| `server/_core/map.ts` | No references |
| `server/_core/dataApi.ts` | No references |

### Client files to delete

| File | Reason |
|------|--------|
| `client/src/components/DashboardLayout.tsx` | Not used by any page |
| `client/src/components/DashboardLayoutSkeleton.tsx` | Only imported by DashboardLayout |
| `client/src/components/ManusDialog.tsx` | No references |
| `client/src/components/Map.tsx` | No references |
| `client/src/pages/ComponentShowcase.tsx` | Dev-only showcase, remove route from `App.tsx` |

### Files to keep

- `client/src/pages/Home.tsx` — will become Dashboard in a future phase
- `client/src/components/BlueprintBackground.tsx` — actively used by AppShell.tsx

### Cleanup checklist

- Remove all import statements referencing deleted files
- Remove the `/components` route from `App.tsx`
- Run `pnpm check` to verify no broken imports
- Run `pnpm test` to verify no test regressions

## Phase 2: Schema Hardening

### Foreign key constraints

Add `.references()` declarations in `drizzle/schema.ts` for all cross-table relationships:

| Table.Column | References |
|--------------|-----------|
| `problemSolutions.problemId` | `problems.id` |
| `companyTags.problemId` | `problems.id` |
| `problemListItems.listId` | `problemLists.id` |
| `problemListItems.problemId` | `problems.id` |
| `aiSolutions.problemId` | `problems.id` |
| `aiGenerationLocks.problemId` | `problems.id` |
| `userProgress.userId` | `users.id` |
| `userProgress.problemId` | `problems.id` |
| `attempts.userId` | `users.id` |
| `attempts.problemId` | `problems.id` |
| `submissions.userId` | `users.id` |
| `submissions.problemId` | `problems.id` |
| `problemTestcases.problemId` | `problems.id` |

The existing sync pipeline already inserts parent records (problems, users) before child records, so FK constraints will not break insertion order.

### Sync inMemoryDb DDL

Update `server/testHelpers/inMemoryDb.ts`:

- Add `REFERENCES` clauses matching the new FK declarations (SQLite does not enforce FK by default, but the DDL should mirror the schema for documentation consistency)
- Add any tables missing from the DDL (`submissions`, `problemTestcases`) that exist in `drizzle/schema.ts`

### Add `.env.example`

Create a `.env.example` documenting all expected environment variables:

```
DATABASE_URL=mysql://user:password@localhost:3306/leetcode_tracker
JWT_SECRET=
OWNER_OPEN_ID=
HEARTBEAT_SECRET=
OAUTH_SERVER_URL=
VITE_APP_ID=
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
```

### Verification

- Run `pnpm db:push` to generate migration (requires DATABASE_URL)
- Run `pnpm test` to verify inMemoryDb changes don't break existing tests

## Phase 3: Test Coverage

### New test files

#### `server/__tests__/routers.judge.test.ts`

- Verify judge router is mounted on appRouter (consistent with existing `routers.assembly.test.ts` pattern)
- Test `judge.run` mutation: mock sandboxRunner and testcaseGenerator, verify submission is persisted
- Test `judge.listSubmissions`: verify pagination and owner-only filtering
- Test `judge.getSubmission`: verify owner-only access control
- Use inMemoryDb for database state; mock external dependencies (sandbox, LLM)

#### `server/__tests__/scheduled.test.ts`

- Test heartbeat auth rejection (missing/wrong secret)
- Test heartbeat auth pass-through (correct secret)
- Test each scheduled endpoint (`/daily-sync-lists`, `/daily-sync-companies`, `/daily-sync-meta`) returns sync result
- Mock `runSync` to avoid hitting real LeetCode APIs

#### `client/src/__tests__/hooks.useDebounce.test.ts`

- Test that value updates are delayed by the specified interval
- Test that rapid updates only emit the final value
- Use `vi.useFakeTimers()` for deterministic timing

#### `client/src/__tests__/hooks.useMobile.test.ts`

- Test that hook returns true/false based on window width relative to 768px breakpoint
- Test resize event handling

### Testing patterns to follow

- Server tests: use `inMemoryDb` + dependency injection mocks, matching `server/__tests__/routers.*.test.ts` conventions
- Client tests: use `@testing-library/react` + `renderHook`, matching `client/src/__tests__/hooks.*.test.tsx` conventions
- Tag regression tests with bug IDs where applicable

### Verification

- Run `pnpm test` — all new and existing tests must pass
- Run `pnpm check` — no type errors
