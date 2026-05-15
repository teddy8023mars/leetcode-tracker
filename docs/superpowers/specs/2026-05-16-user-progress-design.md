# User Progress Tracking + SM-2 Spaced Repetition — Design Spec

Track problem-solving status (todo/reviewing/done) with SM-2 spaced repetition for review scheduling. No notes, no login required.

## Existing Infrastructure

- **`userProgress` table** — status (todo/reviewing/done), reviewIntervalDays, nextReviewAt, reviewCount, lastReviewedAt, firstCompletedAt. FK to users and problems.
- **`attempts` table** — time-series of attempts per user+problem.
- **`StatusBadge` component** — already renders todo/reviewing/done badges with color coding.
- **`useFilters` hook** — existing filter state management.
- **Local dev user** — `local-dev` user (id=1) auto-assigned when no OAuth configured.

## Schema Change

Add `easinessFactor` column to `userProgress` table:

```
easinessFactor: decimal(3, 2), default 2.50, NOT NULL
```

SM-2 requires this per-problem factor to adjust intervals. Default 2.5 per the original algorithm.

Update `inMemoryDb.ts` DDL to match.

## Server

### SM-2 algorithm: `server/progress/sm2.ts`

Pure function, no DB dependency:

```
sm2(params: { quality: number; repetition: number; interval: number; easinessFactor: number })
  → { interval: number; repetition: number; easinessFactor: number }
```

- `quality` (0-5): user self-assessment. 0 = complete blackout, 5 = perfect recall.
- If quality < 3: reset repetition to 0, interval to 1 (failed recall — start over).
- If quality >= 3:
  - repetition 0 → interval = 1
  - repetition 1 → interval = 3  
  - repetition 2+ → interval = round(previous interval × EF)
  - Increment repetition.
- EF adjustment: `EF' = EF + (0.1 - (5 - quality) × (0.08 + (5 - quality) × 0.02))`. Clamp to minimum 1.3.
- `nextReviewAt` = now + interval days (computed by caller, not the pure function).

### Progress router: `server/routers/progress.ts`

Three endpoints, all `publicProcedure`:

**`get`**
- Input: `{ problemId: number }`
- Uses hardcoded userId=1 (local-dev) since no login required
- Query: `SELECT * FROM userProgress WHERE userId = 1 AND problemId = ? LIMIT 1`
- Returns the row or null

**`update`**
- Input: `{ problemId: number, status: "todo" | "reviewing" | "done", quality?: number }`
- `quality` required when status = "done" (1-5 scale)
- When status = "done":
  - Load existing progress (or defaults: repetition=0, interval=0, EF=2.5)
  - Run SM-2 with the quality score
  - Upsert with new interval, nextReviewAt, easinessFactor, reviewCount+1, lastReviewedAt=now
  - Set firstCompletedAt if not already set
- When status = "todo" or "reviewing":
  - Upsert with just the status change, no SM-2 computation
- Returns the updated row

**`listDue`**
- Input: none
- Query: `SELECT problemId FROM userProgress WHERE userId = 1 AND status = 'done' AND nextReviewAt <= NOW()`
- Returns array of problemIds that are due for review

### Router registration

Add `progress: progressRouter` to `server/routers.ts`.

## Client

### ProblemDetail page

Add a progress section below the tab bar (visible on all tabs):

- Three status buttons in a row: `Todo` / `Reviewing` / `Done`
- Active status button highlighted (matching StatusBadge colors)
- Clicking `Done` opens a small inline rating UI (not a modal — keep it lightweight):
  - 5 buttons in a row: "1 Again" / "2 Hard" / "3 OK" / "4 Good" / "5 Easy"
  - Clicking a rating submits the update and closes the rating row
- If nextReviewAt exists, show "Next review: Jan 15" below the buttons

### ProblemList page

- Add a `Status` column to the table showing StatusBadge for each problem
- Problems due for review get an orange dot indicator next to the status badge
- Add status filter to existing filter bar (All / Todo / Reviewing / Done / Due for Review)

### Data flow

- ProblemDetail fetches `progress.get({ problemId })` on mount
- ProblemList fetches `progress.listDue()` once, and each problem's status via a batch query
- After any status update, invalidate both queries

### New i18n keys

```
progress.todo: "Todo" / "待做"
progress.reviewing: "Reviewing" / "复习中"  
progress.done: "Done" / "已完成"
progress.nextReview: "Next review: {date}" / "下次复习: {date}"
progress.rateTitle: "How well did you recall?" / "回忆得怎么样？"
progress.rate1: "Again" / "重来"
progress.rate2: "Hard" / "困难"
progress.rate3: "OK" / "一般"
progress.rate4: "Good" / "良好"
progress.rate5: "Easy" / "轻松"
progress.dueForReview: "Due for review" / "待复习"
```

## Testing

### `server/__tests__/progress.sm2.test.ts`
- quality >= 3 increases interval and repetition
- quality < 3 resets interval to 1 and repetition to 0
- EF never drops below 1.3
- First completion: interval = 1, second: interval = 3

### `server/__tests__/routers.progress.test.ts`
- `get` returns null for unknown problem
- `update` with status "done" requires quality
- `update` with quality triggers SM-2 and sets nextReviewAt
- `listDue` returns problems with nextReviewAt in the past
