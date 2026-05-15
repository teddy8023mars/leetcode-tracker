# User Progress Tracking + SM-2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add problem-solving status tracking (todo/reviewing/done) with SM-2 spaced repetition scheduling, visible on both ProblemDetail and ProblemList pages.

**Architecture:** Pure SM-2 function → tRPC router with get/update/listDue → ProblemDetail status buttons with inline rating → ProblemList status column with due-for-review indicators. All endpoints use publicProcedure with hardcoded userId=1 (local-dev).

**Tech Stack:** tRPC, Drizzle ORM, SM-2 algorithm, React, shadcn/ui

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `drizzle/schema.ts` | Modify | Add `easinessFactor` column to `userProgress` |
| `server/testHelpers/inMemoryDb.ts` | Modify | Add `easinessFactor` column to DDL |
| `server/progress/sm2.ts` | Create | Pure SM-2 algorithm function |
| `server/routers/progress.ts` | Create | tRPC router: get, update, listDue |
| `server/routers.ts` | Modify | Register progress router |
| `client/src/i18n/en.ts` | Modify | Add progress i18n keys |
| `client/src/i18n/zh.ts` | Modify | Add progress i18n keys |
| `client/src/pages/ProblemDetail.tsx` | Modify | Status buttons + rating UI + next review date |
| `client/src/pages/ProblemList.tsx` | Modify | Status column + due indicator + status filter |
| `server/__tests__/progress.sm2.test.ts` | Create | SM-2 algorithm tests |
| `server/__tests__/routers.progress.test.ts` | Create | Router unit tests |

---

## Task 1: Schema change + inMemoryDb sync

**Files:**
- Modify: `drizzle/schema.ts`
- Modify: `server/testHelpers/inMemoryDb.ts`

- [ ] **Step 1: Add `easinessFactor` to userProgress table in schema**

In `drizzle/schema.ts`, add after the `reviewCount` line (line 221):

```typescript
    easinessFactor: decimal("easinessFactor", { precision: 3, scale: 2 }).default("2.50").notNull(),
```

- [ ] **Step 2: Add `easinessFactor` to inMemoryDb DDL**

In `server/testHelpers/inMemoryDb.ts`, inside the `userProgress` CREATE TABLE, add after `reviewCount INTEGER DEFAULT 0,`:

```sql
  easinessFactor REAL DEFAULT 2.50,
```

- [ ] **Step 3: Verify**

Run: `pnpm check && pnpm test`

- [ ] **Step 4: Commit**

```bash
git add drizzle/schema.ts server/testHelpers/inMemoryDb.ts && git commit -m "feat: add easinessFactor column to userProgress for SM-2 algorithm"
```

---

## Task 2: SM-2 algorithm (TDD)

**Files:**
- Create: `server/progress/sm2.ts`
- Create: `server/__tests__/progress.sm2.test.ts`

- [ ] **Step 1: Write the tests**

Create `server/__tests__/progress.sm2.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sm2 } from '../progress/sm2';

describe('sm2', () => {
  it('first successful review: interval=1, repetition=1', () => {
    const result = sm2({ quality: 4, repetition: 0, interval: 0, easinessFactor: 2.5 });
    expect(result.interval).toBe(1);
    expect(result.repetition).toBe(1);
  });

  it('second successful review: interval=3, repetition=2', () => {
    const result = sm2({ quality: 4, repetition: 1, interval: 1, easinessFactor: 2.5 });
    expect(result.interval).toBe(3);
    expect(result.repetition).toBe(2);
  });

  it('third+ successful review: interval = round(prev * EF)', () => {
    const result = sm2({ quality: 4, repetition: 2, interval: 3, easinessFactor: 2.5 });
    expect(result.interval).toBe(8);
    expect(result.repetition).toBe(3);
  });

  it('quality < 3 resets repetition to 0 and interval to 1', () => {
    const result = sm2({ quality: 2, repetition: 5, interval: 30, easinessFactor: 2.5 });
    expect(result.interval).toBe(1);
    expect(result.repetition).toBe(0);
  });

  it('EF never drops below 1.3', () => {
    const result = sm2({ quality: 0, repetition: 3, interval: 10, easinessFactor: 1.3 });
    expect(result.easinessFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('quality=5 increases EF', () => {
    const result = sm2({ quality: 5, repetition: 2, interval: 3, easinessFactor: 2.5 });
    expect(result.easinessFactor).toBeGreaterThan(2.5);
  });

  it('quality=3 slightly decreases EF', () => {
    const result = sm2({ quality: 3, repetition: 2, interval: 3, easinessFactor: 2.5 });
    expect(result.easinessFactor).toBeLessThan(2.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/progress.sm2.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SM-2**

Create `server/progress/sm2.ts`:

```typescript
export type SM2Input = {
  quality: number;
  repetition: number;
  interval: number;
  easinessFactor: number;
};

export type SM2Output = {
  interval: number;
  repetition: number;
  easinessFactor: number;
};

export function sm2(input: SM2Input): SM2Output {
  const { quality, repetition, interval, easinessFactor } = input;

  let newEF = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  if (quality < 3) {
    return { interval: 1, repetition: 0, easinessFactor: newEF };
  }

  let newInterval: number;
  if (repetition === 0) {
    newInterval = 1;
  } else if (repetition === 1) {
    newInterval = 3;
  } else {
    newInterval = Math.round(interval * easinessFactor);
  }

  return {
    interval: newInterval,
    repetition: repetition + 1,
    easinessFactor: newEF,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/progress.sm2.test.ts`

Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/progress/sm2.ts server/__tests__/progress.sm2.test.ts && git commit -m "feat: add SM-2 spaced repetition algorithm with tests"
```

---

## Task 3: Progress tRPC router

**Files:**
- Create: `server/routers/progress.ts`
- Modify: `server/routers.ts`

- [ ] **Step 1: Create the router**

Create `server/routers/progress.ts`:

```typescript
import { z } from 'zod';
import { eq, and, lte } from 'drizzle-orm';
import { router, publicProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { userProgress } from '../../drizzle/schema';
import { ProgressStatusSchema } from '@shared/problemTypes';
import { sm2 } from '../progress/sm2';

const LOCAL_USER_ID = 1;

export const progressRouter = router({
  get: publicProcedure
    .input(z.object({ problemId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(userProgress)
        .where(and(eq(userProgress.userId, LOCAL_USER_ID), eq(userProgress.problemId, input.problemId)))
        .limit(1);
      return rows[0] ?? null;
    }),

  update: publicProcedure
    .input(z.object({
      problemId: z.number().int().positive(),
      status: ProgressStatusSchema,
      quality: z.number().int().min(1).max(5).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

      if (input.status === 'done' && input.quality == null) {
        throw new Error('quality is required when marking as done');
      }

      const existing = await db
        .select()
        .from(userProgress)
        .where(and(eq(userProgress.userId, LOCAL_USER_ID), eq(userProgress.problemId, input.problemId)))
        .limit(1);
      const prev = existing[0];

      if (input.status === 'done' && input.quality != null) {
        const prevRepetition = prev?.reviewCount ?? 0;
        const prevInterval = prev?.reviewIntervalDays ?? 0;
        const prevEF = prev ? Number(prev.easinessFactor) : 2.5;

        const result = sm2({
          quality: input.quality,
          repetition: prevRepetition,
          interval: prevInterval,
          easinessFactor: prevEF,
        });

        const nextReviewAt = new Date(Date.now() + result.interval * 24 * 60 * 60 * 1000);
        const now = new Date();

        const values = {
          userId: LOCAL_USER_ID,
          problemId: input.problemId,
          status: input.status as 'todo' | 'reviewing' | 'done',
          reviewIntervalDays: result.interval,
          nextReviewAt,
          reviewCount: result.repetition,
          easinessFactor: String(result.easinessFactor),
          lastReviewedAt: now,
          firstCompletedAt: prev?.firstCompletedAt ?? now,
        };

        await db.insert(userProgress).values(values).onDuplicateKeyUpdate({
          set: {
            status: values.status,
            reviewIntervalDays: values.reviewIntervalDays,
            nextReviewAt: values.nextReviewAt,
            reviewCount: values.reviewCount,
            easinessFactor: values.easinessFactor,
            lastReviewedAt: values.lastReviewedAt,
            firstCompletedAt: prev?.firstCompletedAt ?? now,
          },
        });
      } else {
        await db.insert(userProgress).values({
          userId: LOCAL_USER_ID,
          problemId: input.problemId,
          status: input.status as 'todo' | 'reviewing' | 'done',
        }).onDuplicateKeyUpdate({
          set: { status: input.status as 'todo' | 'reviewing' | 'done' },
        });
      }

      const updated = await db
        .select()
        .from(userProgress)
        .where(and(eq(userProgress.userId, LOCAL_USER_ID), eq(userProgress.problemId, input.problemId)))
        .limit(1);
      return updated[0] ?? null;
    }),

  listDue: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ problemId: userProgress.problemId })
      .from(userProgress)
      .where(and(
        eq(userProgress.userId, LOCAL_USER_ID),
        eq(userProgress.status, 'done'),
        lte(userProgress.nextReviewAt, new Date()),
      ));
    return rows.map(r => r.problemId);
  }),

  listAll: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return await db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, LOCAL_USER_ID));
  }),
});
```

- [ ] **Step 2: Register in routers.ts**

In `server/routers.ts`, add import:

```typescript
import { progressRouter } from "./routers/progress";
```

Add to appRouter object after `aiSolutions: aiSolutionsRouter,`:

```typescript
  progress: progressRouter,
```

- [ ] **Step 3: Verify**

Run: `pnpm check`

- [ ] **Step 4: Commit**

```bash
git add server/routers/progress.ts server/routers.ts && git commit -m "feat: add progress tRPC router (get, update with SM-2, listDue, listAll)"
```

---

## Task 4: Progress router tests

**Files:**
- Create: `server/__tests__/routers.progress.test.ts`

- [ ] **Step 1: Write the tests**

Create `server/__tests__/routers.progress.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { progressRouter } from '../routers/progress';
import * as db from '../db';
import type { Request, Response } from 'express';

function makeCaller() {
  return progressRouter.createCaller({
    user: null,
    req: {} as Request,
    res: {} as Response,
  });
}

describe('routers/progress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('get returns null when DB unavailable', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const caller = makeCaller();
    const result = await caller.get({ problemId: 1 });
    expect(result).toBeNull();
  });

  it('update throws when status=done without quality', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue({} as never);
    const caller = makeCaller();
    await expect(
      caller.update({ problemId: 1, status: 'done' }),
    ).rejects.toThrow(/quality/);
  });

  it('listDue returns empty when DB unavailable', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const caller = makeCaller();
    const result = await caller.listDue();
    expect(result).toEqual([]);
  });

  it('listAll returns empty when DB unavailable', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const caller = makeCaller();
    const result = await caller.listAll();
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run server/__tests__/routers.progress.test.ts`

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/routers.progress.test.ts && git commit -m "test: add progress router tests (get, update validation, listDue, listAll)"
```

---

## Task 5: i18n keys

**Files:**
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/zh.ts`

- [ ] **Step 1: Add keys to en.ts**

Add a new `progress` object after `settings`:

```typescript
  progress: {
    todo: 'Todo',
    reviewing: 'Reviewing',
    done: 'Done',
    nextReview: 'Next review: {date}',
    rateTitle: 'How well did you recall?',
    rate1: 'Again',
    rate2: 'Hard',
    rate3: 'OK',
    rate4: 'Good',
    rate5: 'Easy',
    dueForReview: 'Due for review',
  },
```

- [ ] **Step 2: Add keys to zh.ts**

Add matching `progress` object:

```typescript
  progress: {
    todo: '待做',
    reviewing: '复习中',
    done: '已完成',
    nextReview: '下次复习: {date}',
    rateTitle: '回忆得怎么样？',
    rate1: '重来',
    rate2: '困难',
    rate3: '一般',
    rate4: '良好',
    rate5: '轻松',
    dueForReview: '待复习',
  },
```

- [ ] **Step 3: Verify**

Run: `pnpm check`

- [ ] **Step 4: Commit**

```bash
git add client/src/i18n/en.ts client/src/i18n/zh.ts && git commit -m "feat: add i18n keys for progress tracking and SM-2 rating"
```

---

## Task 6: ProblemDetail — status buttons + rating UI

**Files:**
- Modify: `client/src/pages/ProblemDetail.tsx`

- [ ] **Step 1: Add ProgressBar component to ProblemDetail**

In `client/src/pages/ProblemDetail.tsx`, add a new `ProgressSection` component at the bottom of the file (before the `TabButton` component). This component:

- Fetches progress via `trpc.progress.get.useQuery({ problemId })`
- Shows three status buttons: Todo / Reviewing / Done
- Active button uses matching StatusBadge colors (todo: `bg-secondary`, reviewing: `bg-pink-100 text-pink-800`, done: `bg-emerald-100 text-emerald-800`)
- Clicking Done opens inline rating row with 5 buttons (1 Again → 5 Easy)
- After rating, calls `trpc.progress.update.useMutation` and invalidates the query
- Shows next review date if set

```typescript
function ProgressSection({ problemId }: { problemId: number }) {
  const t = useT();
  const utils = trpc.useUtils();
  const q = trpc.progress.get.useQuery({ problemId }, { staleTime: 30_000 });
  const mutation = trpc.progress.update.useMutation({
    onSuccess: () => {
      utils.progress.get.invalidate({ problemId });
      utils.progress.listDue.invalidate();
      utils.progress.listAll.invalidate();
    },
  });
  const [showRating, setShowRating] = useState(false);

  const currentStatus = (q.data?.status as 'todo' | 'reviewing' | 'done' | undefined) ?? undefined;
  const nextReview = q.data?.nextReviewAt ? new Date(q.data.nextReviewAt) : null;

  const statusButtons: { status: 'todo' | 'reviewing' | 'done'; label: string; activeClass: string }[] = [
    { status: 'todo', label: t('progress.todo'), activeClass: 'bg-secondary text-ink' },
    { status: 'reviewing', label: t('progress.reviewing'), activeClass: 'bg-pink-100 text-pink-800' },
    { status: 'done', label: t('progress.done'), activeClass: 'bg-emerald-100 text-emerald-800' },
  ];

  const handleStatus = (status: 'todo' | 'reviewing' | 'done') => {
    if (status === 'done') {
      setShowRating(true);
    } else {
      setShowRating(false);
      mutation.mutate({ problemId, status });
    }
  };

  const handleRate = (quality: number) => {
    mutation.mutate({ problemId, status: 'done', quality });
    setShowRating(false);
  };

  const ratings = [
    { quality: 1, label: t('progress.rate1'), color: 'bg-red-100 text-red-700' },
    { quality: 2, label: t('progress.rate2'), color: 'bg-orange-100 text-orange-700' },
    { quality: 3, label: t('progress.rate3'), color: 'bg-yellow-100 text-yellow-700' },
    { quality: 4, label: t('progress.rate4'), color: 'bg-blue-100 text-blue-700' },
    { quality: 5, label: t('progress.rate5'), color: 'bg-emerald-100 text-emerald-700' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {statusButtons.map((btn) => (
          <button
            key={btn.status}
            type="button"
            onClick={() => handleStatus(btn.status)}
            disabled={mutation.isPending}
            className={
              'px-3 py-1 text-xs font-mono rounded transition-colors ' +
              (currentStatus === btn.status
                ? btn.activeClass
                : 'bg-secondary/50 text-ink-soft hover:text-ink')
            }
          >
            {btn.label}
          </button>
        ))}
        {nextReview && currentStatus === 'done' && (
          <span className="text-[11px] text-ink-soft font-mono">
            {t('progress.nextReview', { date: nextReview.toLocaleDateString() })}
          </span>
        )}
      </div>
      {showRating && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-ink-soft">{t('progress.rateTitle')}</span>
          {ratings.map((r) => (
            <button
              key={r.quality}
              type="button"
              onClick={() => handleRate(r.quality)}
              disabled={mutation.isPending}
              className={`px-2 py-0.5 text-[11px] font-mono rounded ${r.color} hover:opacity-80`}
            >
              {r.quality} {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire ProgressSection into the page**

In the `ProblemDetail` component's return, add `<ProgressSection>` between the header and the tab bar. Insert after the closing `</header>` tag and before the `<div role="tablist">`:

```typescript
      <ProgressSection problemId={p.id} />
```

- [ ] **Step 3: Verify**

Run: `pnpm check`

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ProblemDetail.tsx && git commit -m "feat: add progress status buttons and SM-2 rating UI to ProblemDetail"
```

---

## Task 7: ProblemList — status column + due indicator + filter

**Files:**
- Modify: `client/src/pages/ProblemList.tsx`

- [ ] **Step 1: Add status imports and queries**

In `client/src/pages/ProblemList.tsx`, add import:

```typescript
import { StatusBadge } from '@/components/StatusBadge';
```

Inside the `ProblemList` component, add two queries after the existing `query`:

```typescript
  const progressQ = trpc.progress.listAll.useQuery(undefined, { staleTime: 30_000 });
  const dueQ = trpc.progress.listDue.useQuery(undefined, { staleTime: 30_000 });

  const progressMap = new Map<number, string>();
  for (const p of (progressQ.data ?? []) as Array<{ problemId: number; status: string }>) {
    progressMap.set(p.problemId, p.status);
  }
  const dueSet = new Set(dueQ.data ?? []);
```

- [ ] **Step 2: Add Status column header**

In the table `<thead>`, add a new `<th>` after the Difficulty column:

```typescript
<th className="pr-3 w-28">{t('filter.status')}</th>
```

- [ ] **Step 3: Add Status cell to each row**

In the table `<tbody>`, add a new `<td>` after the difficulty cell for each problem row:

```typescript
<td className="pr-3 py-2">
  <div className="flex items-center gap-1">
    {progressMap.has(p.id) && (
      <StatusBadge status={progressMap.get(p.id) as 'todo' | 'reviewing' | 'done'} />
    )}
    {dueSet.has(p.id) && (
      <span className="w-2 h-2 rounded-full bg-orange-400" title={t('progress.dueForReview')} />
    )}
  </div>
</td>
```

- [ ] **Step 4: Add status filter**

In the filter `<aside>`, add a new filter block after the difficulty filter:

```typescript
          <div>
            <label className="font-mono text-xs text-ink-soft block mb-1">
              {t('filter.status')}
            </label>
            <Select
              value={(filters.status as string) ?? 'all'}
              onValueChange={(v) => {
                setFilter('status', v === 'all' ? undefined : v);
                setLimit(PAGE);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter.all')}</SelectItem>
                <SelectItem value="todo">{t('status.todo')}</SelectItem>
                <SelectItem value="reviewing">{t('status.reviewing')}</SelectItem>
                <SelectItem value="done">{t('status.done')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
```

Also pass `status` to the problems query filters:

```typescript
    {
      filters: {
        difficulty: filters.difficulty as Difficulty | undefined,
        search,
        paidOnly:
          typeof filters.paidOnly === 'boolean' ? (filters.paidOnly as boolean) : undefined,
        status: filters.status as 'todo' | 'reviewing' | 'done' | undefined,
      },
      limit,
    },
```

- [ ] **Step 5: Verify**

Run: `pnpm check`

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ProblemList.tsx && git commit -m "feat: add status column, due-for-review indicator, and status filter to ProblemList"
```

---

## Task 8: Assembly test + final verification

**Files:**
- Modify: `server/__tests__/routers.assembly.test.ts`

- [ ] **Step 1: Add progress to assembly test**

Add `expect(caller.progress).toBeDefined();` to the assembly test.

- [ ] **Step 2: Run full suite**

Run: `pnpm test && pnpm check`

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/routers.assembly.test.ts && git commit -m "test: add progress to router assembly test"
```

- [ ] **Step 4: Format**

Run: `pnpm format`

Commit if needed:

```bash
git add -A && git commit -m "style: format after user progress feature"
```
