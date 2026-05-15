# AI Solutions — Design Spec

Generate and display AI-powered problem explanations (approach, complexity, code, pitfalls) for every LeetCode problem in both English and Chinese.

## Existing Infrastructure

- **`aiSolutions` table** — stores generated content per (problemId, language). Fields: approachMarkdown, complexityMarkdown, pythonCode, javaCode, cppCode, pitfallsMarkdown, generatedAt, modelVersion.
- **`aiGenerationLocks` table** — distributed lock per (problemId, language) with TTL.
- **`invokeLLM()`** — Forge-hosted OpenAI-compatible API (gemini-2.5-flash), supports JSON schema response format.
- **Sync orchestrator** — pluggable task system with `registerSyncTasks`, audit logging, concurrency guards.
- **i18n keys** — `problem.aiSolution` already defined ("AI Solution" / "AI 解析").

## Server

### New router: `server/routers/aiSolutions.ts`

Two endpoints:

**`get`** (publicProcedure)
- Input: `{ problemId: number, language: "en" | "zh" }`
- Query: `SELECT * FROM aiSolutions WHERE problemId = ? AND language = ? LIMIT 1`
- Returns the full row or `null`

**`generate`** (adminProcedure)
- Input: `{ problemId: number, language: "en" | "zh" }`
- Acquires a lock in `aiGenerationLocks` (insert with `lockedUntil = NOW + 5 min`; skip if an unexpired lock exists)
- Fetches the problem content from `problems` table
- Calls `invokeLLM` with the prompt (see below)
- Parses the JSON response and upserts into `aiSolutions`
- Releases the lock (delete the row)
- Returns the upserted record

### New sync task: `server/sync/aiPregenerate.ts`

Registered as `ai-pregenerate` sync task in the orchestrator.

Logic:
1. Query all problems that lack an `aiSolutions` row for a given language
2. For each missing (problemId, language) pair, call the `generate` logic (same as the router's generate endpoint, extracted into a shared function)
3. Process both `en` and `zh` for each problem
4. Skip problems without `contentEn` (not yet detail-fetched)
5. Report progress via sync log (itemsProcessed, itemsSucceeded, itemsFailed)

Rate limiting: 1-second delay between LLM calls to avoid quota issues.

### Shared generation function: `server/sync/aiGeneration.ts`

Extracted so both the router endpoint and the batch sync task can call it:

```
generateAiSolution(problemId, language) → AiSolution
```

Steps:
1. Check `aiGenerationLocks` — if unexpired lock exists, throw "generation in progress"
2. Insert lock row (lockedUntil = NOW + 5 min)
3. Load problem from DB (need contentEn or contentZh, codeSnippetsJson)
4. Build LLM prompt
5. Call `invokeLLM` with JSON schema response format
6. Parse response, validate fields
7. Upsert into `aiSolutions`
8. Delete lock row
9. Return the record

On error: delete the lock row in a finally block, rethrow.

### LLM Prompt

System message instructs the model to act as a senior algorithm tutor. User message includes:

- Problem title and content (in the target language)
- Code snippets (from codeSnippetsJson)
- Target output language (English or Chinese)

Response format enforced via `response_format: { type: "json_schema" }`:

```json
{
  "approach": "Markdown explanation of the solution approach",
  "complexity": "Time: O(...), Space: O(...) with brief explanation",
  "pythonCode": "class Solution:\n    ...",
  "javaCode": "class Solution {\n    ...\n}",
  "cppCode": "class Solution {\npublic:\n    ...\n};",
  "pitfalls": "Markdown list of common mistakes"
}
```

### Router registration

Add `aiSolutions: aiSolutionsRouter` to `server/routers.ts`.

## Client

### Solution tab integration

Modify `ProblemDetail.tsx` — inside the existing Solution panel area, add an AI solution section below the official solution:

1. Query `trpc.aiSolutions.get({ problemId, language })` where `language` comes from the current i18n context
2. If loading: show skeleton
3. If no data: show nothing (no empty state clutter)
4. If data exists, render flat layout:
   - Separator + "AI 解析" / "AI Solution" heading
   - **Approach** — Streamdown markdown
   - **Complexity** — Streamdown markdown
   - **Code** — Tabs component with Python / Java / C++ tabs, each using CodeBlock
   - **Pitfalls** — Streamdown markdown (only if non-empty)

### Sync page button

Modify `SyncStatus.tsx` — add an "AI Pregenerate" button next to the existing manual sync button. Admin-only, triggers `sync.triggerManual({ syncType: 'ai-pregenerate' })`.

## Testing

### `server/__tests__/routers.aiSolutions.test.ts`

- `get` returns null when no solution exists
- `get` returns the solution when it exists
- `generate` rejects unauthenticated/non-admin calls

### AI pregenerate sync task

- Mock `invokeLLM` to return a valid JSON response
- Verify it skips problems that already have solutions
- Verify it skips problems without contentEn
- Verify it writes to aiSolutions table
