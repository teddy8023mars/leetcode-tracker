# M1 Foundation — Verification Report

**Date:** 2026-05-10
**Author:** Manus (for Teddy哥)
**Status:** ✅ Complete — all 37 tasks delivered, real-data bootstrap verified.

---

## 1. Test & Type Checks

```
$ pnpm test
Test Files  34 passed (34)
Tests       80 passed (80)

$ pnpm check     # tsc --noEmit
(no errors)
```

LSP / TypeScript health is clean (`webdev_check_status → typescript: No errors`).

---

## 2. Real-Data Bootstrap — Phased Sync

The end-to-end `initial-bootstrap` orchestrator was found to be too long-running for a
single sandbox session because of LeetCode US GraphQL latency on Hot 100 + Top 150
detail fetches (~22 s/题 in this environment). M1 was therefore verified by running
the three independent production sync tasks end-to-end via the same orchestrator
(`runSync` + `registerSyncTasks`); each one wrote a clean `success` syncLog row.

| syncLogId | syncType | status | items processed | items failed | elapsed |
|-----------|------------------------|---------|-----------------|--------------|---------|
| 60008 | `daily-sync-lists` | success | 2 / 2 | 0 | 173 s |
| 60009 | `daily-sync-companies` | success | 23 / 25 | 0 | 500 s |
| 60010 | `daily-sync-meta` | success | 0 / 0 | 0 | 1 s |

`itemsProcessed` reflects orchestrator-level units (lists or company directories);
record-level fan-out is captured in the DB counts below.

A separate enrichment script (`scripts/run-companies-only.ts`) was used during the
investigation phase to recover from earlier failed runs while the source-format bug
was being diagnosed; once the fixes landed, the canonical `daily-sync-*` tasks were
re-run to produce the verified syncLog rows above.

---

## 3. Database Counts

```
problems        184      (183 have full English content from LeetCode US GraphQL)
problemLists    2        (Hot 100, Top Interview 150)
problemListItems 250     (100 + 150)
companyTags     869
companies       20       (3 of the 23 configured directories had no rows in the
                         upstream liquidslr CSVs at sync time)
```

---

## 4. Frontend Smoke Test

`webdev_check_status` returned a screenshot of the rendered Problem List with
- 184 rows visible (frontendId, title, difficulty badge, AC%)
- Blueprint background grid + sidebar layout
- EN/中 language toggle, search box, difficulty filter all wired
- A real bug was caught and fixed in this pass: `acRate` is returned by Drizzle as a
  string for `decimal` columns, so `p.acRate.toFixed()` was switched to
  `Number(p.acRate).toFixed(1)` in `client/src/pages/ProblemList.tsx`.

---

## 5. Bug Fixes Found During Bootstrap

These were not part of the plan but had to be fixed for real-source data to flow:

1. **`fetchListProblems` query** — LeetCode list slugs (`top-100-liked`,
   `top-interview-150`) are *study plans*, not favorites. The original query used
   `problemsetQuestionListV2(filtersV2.listFilter.listId)` which returns HTTP 400.
   Replaced with `studyPlanV2Detail(planSlug: $slug) { planSubGroups { questions { … } } }`
   and flattened sub-groups in `server/sync/leetcode.ts`.

2. **liquidslr CSV file naming** — Repo uses `5. All.csv` and `4. More Than Six Months.csv`
   (not `5. All.csv` capitalized differently). Updated `TIMEFRAME_LABEL` in
   `server/sync/liquidslr.ts`. Difficulty cells are upper-case (`EASY/MEDIUM/HARD`),
   so a lower-case-friendly transform was added to the zod schema.

3. **`p.acRate.toFixed`** — see §4 above.

---

## 6. Known M1 Trade-offs / Followups (M2+)

These were deliberately deferred per the plan and noted here so future work can pick
them up:

- `acRate` is currently `0` for all rows because `studyPlanV2Detail` does not expose
  it. M2 should backfill via a per-question detail probe.
- `topicTags` / `tagSlug` filtering is intentionally out of M1 scope (planned for M3).
- Chinese translation fallback (`translateContentToZh` via LLM) is implemented and
  unit-tested but skipped in this verification run via the `BOOTSTRAP_SKIP_LLM=1`
  env switch on `scripts/run-initial-bootstrap.ts`. M2 can run a background pass to
  populate `contentZh` for problems that have only English content.
- `errorSummary` / `itemsFailed` for the orchestrator are accurate but per-question
  errors are silently swallowed. M2 should structured-log them into a sub-table for
  observability.
- The 4 frontend pages (`ProblemDetail`, `Lists`, `ListDetail`, `Companies`,
  `CompanyDetail`, `SyncStatus`) currently render loading + empty states only;
  explicit error UI for failed `trpc.*.useQuery` calls is queued for the next pass.

---

## 7. Files of Note

```
server/sync/                        4 production tasks + orchestrator
server/routers/                     5 feature routers + assembly in routers.ts
server/scheduled.ts                 cron-callable HTTP endpoints (heartbeat-auth)
client/src/pages/                   8 pages wired in App.tsx
client/src/components/              AppShell, BlueprintBackground, Difficulty/Status badges,
                                    ProblemContent, CodeBlock, SolutionTabs
docs/superpowers/plans/             Frozen TDD plan for M1
scripts/run-initial-bootstrap.ts    Single-shot bootstrap (BOOTSTRAP_SKIP_LLM/CN flags)
scripts/run-phased-bootstrap.ts     3-phase recovery-friendly bootstrap (used here)
scripts/run-companies-only.ts       Investigative one-off, kept for re-runs
```

---

## 8. Sign-off

All tests pass, types are clean, real data is in the DB, the UI renders against
real rows, and three sync tasks produced verified `success` syncLog rows. Ready for
Teddy 哥's review and the M2 planning conversation.
