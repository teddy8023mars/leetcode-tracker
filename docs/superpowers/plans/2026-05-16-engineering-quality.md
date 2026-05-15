# Engineering Quality Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, add foreign key constraints to the database schema, sync the test DDL, and fill test coverage gaps for the judge router, scheduled endpoints, and client hooks.

**Architecture:** Three sequential phases — dead code cleanup first (reduces noise), then schema hardening (adds FK constraints + syncs inMemoryDb DDL), then test coverage (written against the final code state).

**Tech Stack:** Drizzle ORM (MySQL), Vitest, @testing-library/react, Express, tRPC, better-sqlite3

---

## Phase 1: Dead Code Cleanup

### Task 1: Delete unused server modules

**Files:**
- Delete: `server/_core/imageGeneration.ts`
- Delete: `server/_core/voiceTranscription.ts`
- Delete: `server/_core/map.ts`
- Delete: `server/_core/dataApi.ts`

- [ ] **Step 1: Verify no imports exist**

Run: `grep -r "imageGeneration\|voiceTranscription\|\/map\|dataApi" server/ --include="*.ts" -l | grep -v node_modules`

Expected: Only the four files themselves appear (no other file imports them).

- [ ] **Step 2: Delete the files**

```bash
rm server/_core/imageGeneration.ts server/_core/voiceTranscription.ts server/_core/map.ts server/_core/dataApi.ts
```

- [ ] **Step 3: Verify build**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove unused server modules (imageGeneration, voiceTranscription, map, dataApi)"
```

### Task 2: Delete unused client components and pages

**Files:**
- Delete: `client/src/components/DashboardLayout.tsx`
- Delete: `client/src/components/DashboardLayoutSkeleton.tsx`
- Delete: `client/src/components/ManusDialog.tsx`
- Delete: `client/src/components/Map.tsx`
- Delete: `client/src/pages/ComponentShowcase.tsx`

- [ ] **Step 1: Verify no imports exist**

Run: `grep -r "DashboardLayout\|DashboardLayoutSkeleton\|ManusDialog\|Map\|ComponentShowcase" client/src/ --include="*.ts" --include="*.tsx" -l | grep -v node_modules`

Expected: Only the files themselves and `DashboardLayoutSkeleton.tsx` imported by `DashboardLayout.tsx` (circular pair). No other files reference them. `ComponentShowcase` is not in `App.tsx`.

- [ ] **Step 2: Delete the files**

```bash
rm client/src/components/DashboardLayout.tsx client/src/components/DashboardLayoutSkeleton.tsx client/src/components/ManusDialog.tsx client/src/components/Map.tsx client/src/pages/ComponentShowcase.tsx
```

- [ ] **Step 3: Verify build and tests**

Run: `pnpm check && pnpm test`

Expected: No type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove unused client components (DashboardLayout, ManusDialog, Map, ComponentShowcase)"
```

---

## Phase 2: Schema Hardening

### Task 3: Add foreign key constraints to Drizzle schema

**Files:**
- Modify: `drizzle/schema.ts`

- [ ] **Step 1: Add FK references to `problemSolutions`**

In `drizzle/schema.ts`, change line 85:

```typescript
// Before
problemId: int("problemId").notNull(),
// After
problemId: int("problemId").notNull().references(() => problems.id),
```

- [ ] **Step 2: Add FK references to `companyTags`**

In `drizzle/schema.ts`, change line 108:

```typescript
// Before
problemId: int("problemId").notNull(),
// After
problemId: int("problemId").notNull().references(() => problems.id),
```

- [ ] **Step 3: Add FK references to `problemListItems`**

In `drizzle/schema.ts`, change lines 148-149:

```typescript
// Before
listId: int("listId").notNull(),
problemId: int("problemId").notNull(),
// After
listId: int("listId").notNull().references(() => problemLists.id),
problemId: int("problemId").notNull().references(() => problems.id),
```

- [ ] **Step 4: Add FK references to `aiSolutions`**

In `drizzle/schema.ts`, change line 168:

```typescript
// Before
problemId: int("problemId").notNull(),
// After
problemId: int("problemId").notNull().references(() => problems.id),
```

- [ ] **Step 5: Add FK references to `aiGenerationLocks`**

In `drizzle/schema.ts`, change line 195:

```typescript
// Before
problemId: int("problemId").notNull(),
// After
problemId: int("problemId").notNull().references(() => problems.id),
```

- [ ] **Step 6: Add FK references to `userProgress`**

In `drizzle/schema.ts`, change lines 215-216:

```typescript
// Before
userId: int("userId").notNull(),
problemId: int("problemId").notNull(),
// After
userId: int("userId").notNull().references(() => users.id),
problemId: int("problemId").notNull().references(() => problems.id),
```

- [ ] **Step 7: Add FK references to `attempts`**

In `drizzle/schema.ts`, change lines 243-244:

```typescript
// Before
userId: int("userId").notNull(),
problemId: int("problemId").notNull(),
// After
userId: int("userId").notNull().references(() => users.id),
problemId: int("problemId").notNull().references(() => problems.id),
```

- [ ] **Step 8: Add FK references to `problemTestcases`**

In `drizzle/schema.ts`, change line 290:

```typescript
// Before
problemId: int("problemId").primaryKey(),
// After
problemId: int("problemId").primaryKey().references(() => problems.id),
```

- [ ] **Step 9: Add FK references to `submissions`**

In `drizzle/schema.ts`, change lines 305-306:

```typescript
// Before
userId: int("userId").notNull(),
problemId: int("problemId").notNull(),
// After
userId: int("userId").notNull().references(() => users.id),
problemId: int("problemId").notNull().references(() => problems.id),
```

- [ ] **Step 10: Verify build**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 11: Commit**

```bash
git add drizzle/schema.ts && git commit -m "feat: add foreign key constraints to all child tables"
```

### Task 4: Sync inMemoryDb DDL with schema

**Files:**
- Modify: `server/testHelpers/inMemoryDb.ts`

- [ ] **Step 1: Add REFERENCES clauses and missing tables**

Replace the entire `SCHEMA_SQL` constant in `server/testHelpers/inMemoryDb.ts` with:

```typescript
const SCHEMA_SQL = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openId TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  loginMethod TEXT,
  role TEXT DEFAULT 'user',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  lastSignedIn TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  frontendId INTEGER UNIQUE NOT NULL,
  titleSlug TEXT UNIQUE NOT NULL,
  titleEn TEXT,
  titleZh TEXT,
  difficulty TEXT NOT NULL,
  paidOnly INTEGER DEFAULT 0,
  acRate REAL,
  contentEn TEXT,
  contentZh TEXT,
  contentZhSource TEXT,
  hintsJson TEXT,
  exampleTestcases TEXT,
  topicTagsJson TEXT,
  similarQuestionsJson TEXT,
  codeSnippetsJson TEXT,
  contentFetchedAt TEXT,
  metaUpdatedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE problemSolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problemId INTEGER NOT NULL REFERENCES problems(id),
  source TEXT NOT NULL,
  language TEXT NOT NULL,
  contentMarkdown TEXT NOT NULL,
  fetchedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(problemId, source, language)
);
CREATE TABLE companyTags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problemId INTEGER NOT NULL REFERENCES problems(id),
  companySlug TEXT NOT NULL,
  companyName TEXT NOT NULL,
  frequency REAL,
  timeframe TEXT NOT NULL,
  source TEXT NOT NULL,
  syncedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(problemId, companySlug, timeframe)
);
CREATE TABLE problemLists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  titleEn TEXT NOT NULL,
  titleZh TEXT NOT NULL,
  source TEXT NOT NULL,
  metaJson TEXT
);
CREATE TABLE problemListItems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listId INTEGER NOT NULL REFERENCES problemLists(id),
  problemId INTEGER NOT NULL REFERENCES problems(id),
  position INTEGER NOT NULL,
  UNIQUE(listId, problemId)
);
CREATE TABLE aiSolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problemId INTEGER NOT NULL REFERENCES problems(id),
  language TEXT NOT NULL,
  approachMarkdown TEXT NOT NULL,
  complexityMarkdown TEXT NOT NULL,
  pythonCode TEXT NOT NULL,
  javaCode TEXT NOT NULL,
  cppCode TEXT NOT NULL,
  pitfallsMarkdown TEXT,
  generatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  modelVersion TEXT,
  UNIQUE(problemId, language)
);
CREATE TABLE aiGenerationLocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problemId INTEGER NOT NULL REFERENCES problems(id),
  language TEXT NOT NULL,
  lockedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  lockedUntil TEXT NOT NULL,
  UNIQUE(problemId, language)
);
CREATE TABLE userProgress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  problemId INTEGER NOT NULL REFERENCES problems(id),
  status TEXT DEFAULT 'todo',
  noteMarkdown TEXT,
  reviewIntervalDays INTEGER DEFAULT 0,
  nextReviewAt TEXT,
  reviewCount INTEGER DEFAULT 0,
  lastReviewedAt TEXT,
  firstCompletedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, problemId)
);
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  problemId INTEGER NOT NULL REFERENCES problems(id),
  attemptedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE syncLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  syncType TEXT NOT NULL,
  status TEXT NOT NULL,
  startedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  finishedAt TEXT,
  itemsProcessed INTEGER DEFAULT 0,
  itemsSucceeded INTEGER DEFAULT 0,
  itemsFailed INTEGER DEFAULT 0,
  errorSummary TEXT,
  metaJson TEXT
);
CREATE TABLE problemTestcases (
  problemId INTEGER PRIMARY KEY REFERENCES problems(id),
  suiteJson TEXT NOT NULL,
  generatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  source TEXT DEFAULT 'llm'
);
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  problemId INTEGER NOT NULL REFERENCES problems(id),
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  verdict TEXT NOT NULL,
  passedCount INTEGER DEFAULT 0,
  totalCount INTEGER DEFAULT 0,
  firstFailInput TEXT,
  firstFailExpected TEXT,
  firstFailActual TEXT,
  resultJson TEXT,
  aiReviewMarkdown TEXT,
  runtimeMs INTEGER,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`;
```

- [ ] **Step 2: Run existing tests to verify DDL changes are compatible**

Run: `pnpm test`

Expected: All existing tests pass (SQLite does not enforce FK by default, so REFERENCES clauses are documentation-only).

- [ ] **Step 3: Commit**

```bash
git add server/testHelpers/inMemoryDb.ts && git commit -m "chore: sync inMemoryDb DDL with schema (add FKs, submissions, problemTestcases)"
```

### Task 5: Add .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create the file**

Create `.env.example` in the project root:

```bash
# Database
DATABASE_URL=mysql://user:password@localhost:3306/leetcode_tracker

# Auth
JWT_SECRET=
OWNER_OPEN_ID=
OAUTH_SERVER_URL=

# App
VITE_APP_ID=

# Scheduled sync
HEARTBEAT_SECRET=

# LLM / Forge API
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example && git commit -m "docs: add .env.example with all expected environment variables"
```

---

## Phase 3: Test Coverage

### Task 6: Add judge router to assembly test

**Files:**
- Modify: `server/__tests__/routers.assembly.test.ts`

- [ ] **Step 1: Add judge to the existing assembly test**

In `server/__tests__/routers.assembly.test.ts`, add `judge` to the assertion list:

```typescript
import { describe, it, expect } from 'vitest';
import { appRouter } from '../routers';
import type { Request, Response } from 'express';

describe('appRouter assembly', () => {
  it('exposes problems/lists/companies/sync/judge sub-routers', () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as Request,
      res: {} as Response,
    });
    expect(caller.problems).toBeDefined();
    expect(caller.lists).toBeDefined();
    expect(caller.companies).toBeDefined();
    expect(caller.sync).toBeDefined();
    expect(caller.auth).toBeDefined();
    expect(caller.judge).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run server/__tests__/routers.assembly.test.ts`

Expected: PASS — judge is already wired into appRouter.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/routers.assembly.test.ts && git commit -m "test: add judge router to assembly test"
```

### Task 7: Add judge router unit tests

**Files:**
- Create: `server/__tests__/routers.judge.test.ts`

- [ ] **Step 1: Write the test file**

Create `server/__tests__/routers.judge.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { judgeRouter } from '../routers/judge';
import * as db from '../db';
import type { Request, Response } from 'express';
import type { User } from '../../drizzle/schema';

vi.mock('../judge/sandboxRunner', () => ({
  runUserCode: vi.fn().mockResolvedValue({
    ok: true,
    reason: 'ok',
    stdout: '{"i":0,"ok":true,"actual":[0,1],"error":null}\n__SUMMARY__{"passed":1,"total":1}',
    stderr: '',
    timeMs: 42,
    exitCode: 0,
    signal: null,
  }),
}));

vi.mock('../judge/testcaseGenerator', () => ({
  generateTestcaseSuite: vi.fn().mockResolvedValue({
    methodName: 'twoSum',
    cases: [{ input: [[2, 7, 11, 15], 9], expected: [0, 1] }],
    referenceSolution: '',
  }),
}));

const mockUser: User = {
  id: 1,
  openId: 'test-user',
  name: 'Test',
  email: null,
  loginMethod: null,
  role: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function makeCaller(user: User | null = mockUser) {
  return judgeRouter.createCaller({
    user,
    req: {} as Request,
    res: {} as Response,
  });
}

describe('routers/judge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('run rejects unauthenticated calls', async () => {
    const caller = makeCaller(null);
    await expect(
      caller.run({ problemId: 1, language: 'python', code: 'pass' }),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('listSubmissions rejects unauthenticated calls', async () => {
    const caller = makeCaller(null);
    await expect(caller.listSubmissions({ problemId: 1 })).rejects.toThrow(
      /UNAUTHORIZED/,
    );
  });

  it('getSubmission rejects unauthenticated calls', async () => {
    const caller = makeCaller(null);
    await expect(caller.getSubmission({ id: 1 })).rejects.toThrow(
      /UNAUTHORIZED/,
    );
  });

  it('listSubmissions returns empty when db unavailable', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const caller = makeCaller();
    const result = await caller.listSubmissions({ problemId: 1 });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify tests pass**

Run: `npx vitest run server/__tests__/routers.judge.test.ts`

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/routers.judge.test.ts && git commit -m "test: add judge router unit tests (auth checks, empty-db fallback)"
```

### Task 8: Add scheduled endpoints test

**Files:**
- Create: `server/__tests__/scheduled.test.ts`

- [ ] **Step 1: Write the test file**

Create `server/__tests__/scheduled.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createScheduledRouter } from '../scheduled';

vi.mock('../sync', () => ({
  runSync: vi.fn().mockResolvedValue({ syncLogId: 42 }),
}));

function buildApp(secret: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/scheduled', createScheduledRouter(secret));
  return app;
}

describe('scheduled endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects requests without valid heartbeat secret', async () => {
    const app = buildApp('my-secret');
    const res = await request(app)
      .post('/api/scheduled/daily-sync-lists')
      .set('x-heartbeat-secret', 'wrong');
    expect(res.status).toBe(401);
  });

  it('accepts requests with correct heartbeat secret', async () => {
    const app = buildApp('my-secret');
    const res = await request(app)
      .post('/api/scheduled/daily-sync-lists')
      .set('x-heartbeat-secret', 'my-secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ syncLogId: 42 });
  });

  it('allows all when secret is empty (dev mode)', async () => {
    const app = buildApp('');
    const res = await request(app).post('/api/scheduled/daily-sync-meta');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ syncLogId: 42 });
  });

  it('returns error JSON when sync throws', async () => {
    const { runSync } = await import('../sync');
    (runSync as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('CONCURRENT_SYNC: already running'),
    );
    const app = buildApp('');
    const res = await request(app).post('/api/scheduled/daily-sync-companies');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ error: 'CONCURRENT_SYNC: already running' });
  });

  for (const endpoint of ['daily-sync-lists', 'daily-sync-companies', 'daily-sync-meta']) {
    it(`POST /api/scheduled/${endpoint} exists and returns sync result`, async () => {
      const app = buildApp('');
      const res = await request(app).post(`/api/scheduled/${endpoint}`);
      expect(res.status).toBe(200);
      expect(res.body.syncLogId).toBeDefined();
    });
  }
});
```

- [ ] **Step 2: Run to verify tests pass**

Run: `npx vitest run server/__tests__/scheduled.test.ts`

Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/scheduled.test.ts && git commit -m "test: add scheduled endpoints tests (auth, sync delegation, error handling)"
```

### Task 9: Add useDebounce hook test

**Files:**
- Create: `client/src/__tests__/hooks.useDebounce.test.tsx`

- [ ] **Step 1: Write the test file**

Create `client/src/__tests__/hooks.useDebounce.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '@/hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update until the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('b');
  });

  it('only emits the final value on rapid updates', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: 'c' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: 'd' });

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('d');
  });

  it('uses 300ms as default delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 1 } },
    );
    rerender({ value: 2 });

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify tests pass**

Run: `npx vitest run client/src/__tests__/hooks.useDebounce.test.tsx`

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add client/src/__tests__/hooks.useDebounce.test.tsx && git commit -m "test: add useDebounce hook tests"
```

### Task 10: Add useIsMobile hook test

**Files:**
- Create: `client/src/__tests__/hooks.useMobile.test.tsx`

- [ ] **Step 1: Write the test file**

Create `client/src/__tests__/hooks.useMobile.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/useMobile';

describe('useIsMobile', () => {
  let listeners: Array<() => void>;
  let originalMatchMedia: typeof window.matchMedia;
  let originalInnerWidth: number;

  beforeEach(() => {
    listeners = [];
    originalMatchMedia = window.matchMedia;
    originalInnerWidth = window.innerWidth;

    window.matchMedia = vi.fn().mockImplementation(() => ({
      addEventListener: (_event: string, cb: () => void) => {
        listeners.push(cb);
      },
      removeEventListener: (_event: string, cb: () => void) => {
        listeners = listeners.filter((l) => l !== cb);
      },
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
    });
  });

  function setWidth(w: number) {
    Object.defineProperty(window, 'innerWidth', {
      value: w,
      writable: true,
    });
  }

  it('returns true when width < 768', () => {
    setWidth(375);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when width >= 768', () => {
    setWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates on media query change', () => {
    setWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    setWidth(500);
    act(() => {
      listeners.forEach((cb) => cb());
    });
    expect(result.current).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    setWidth(1024);
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners.length).toBe(1);
    unmount();
    expect(listeners.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify tests pass**

Run: `npx vitest run client/src/__tests__/hooks.useMobile.test.tsx`

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add client/src/__tests__/hooks.useMobile.test.tsx && git commit -m "test: add useIsMobile hook tests"
```

---

## Final Verification

### Task 11: Full test suite and type check

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: All tests pass (existing + new).

- [ ] **Step 2: Run type check**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 3: Final commit (if any formatting changes needed)**

Run: `pnpm format`

Then commit any formatting changes:

```bash
git add -A && git commit -m "style: format after engineering quality hardening"
```
