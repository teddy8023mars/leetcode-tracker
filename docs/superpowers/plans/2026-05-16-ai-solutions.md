# AI Solutions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-generated problem explanations (approach, complexity, code in 3 languages, pitfalls) that are pre-generated in batch and displayed in the Solution tab.

**Architecture:** A shared generation function (`aiGeneration.ts`) handles locking, LLM calls, and DB writes. The tRPC router exposes `get` and `generate` endpoints. A sync task iterates over problems missing solutions. The client adds an AI section below the official solution in ProblemDetail.

**Tech Stack:** tRPC, Drizzle ORM, invokeLLM (Forge API), React, Streamdown, shadcn/ui Tabs

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `server/sync/aiGeneration.ts` | Create | Shared function: lock, call LLM, upsert aiSolutions, unlock |
| `server/routers/aiSolutions.ts` | Create | tRPC router: `get` (public) and `generate` (admin) |
| `server/sync/aiPregenerate.ts` | Create | Sync task: batch generate missing AI solutions |
| `server/sync/index.ts` | Modify | Register `ai-pregenerate` task |
| `server/routers.ts` | Modify | Add `aiSolutions` sub-router |
| `client/src/pages/ProblemDetail.tsx` | Modify | Add AI solution section to SolutionPanel |
| `client/src/i18n/en.ts` | Modify | Add new i18n keys |
| `client/src/i18n/zh.ts` | Modify | Add new i18n keys |
| `client/src/pages/SyncStatus.tsx` | Modify | Add AI pregenerate button |
| `server/__tests__/routers.aiSolutions.test.ts` | Create | Router unit tests |
| `server/__tests__/sync.aiPregenerate.test.ts` | Create | Sync task unit tests |

---

## Task 1: Shared AI generation function

**Files:**
- Create: `server/sync/aiGeneration.ts`

- [ ] **Step 1: Create the generation function**

Create `server/sync/aiGeneration.ts`:

```typescript
import { eq, and, gt } from 'drizzle-orm';
import { getDb } from '../db';
import { problems, aiSolutions, aiGenerationLocks, type AiSolution } from '../../drizzle/schema';
import { invokeLLM } from '../_core/llm';
import type { Language } from '@shared/problemTypes';

type LlmFn = typeof invokeLLM;
let _llm: LlmFn = invokeLLM;
export function __setLlmForTest(fn: LlmFn | undefined) {
  _llm = fn ?? invokeLLM;
}

const SYSTEM_PROMPT_EN = `You are a senior algorithm tutor. Given a LeetCode problem, produce a clear, concise solution explanation. Write in English. Return valid JSON matching the schema exactly.`;

const SYSTEM_PROMPT_ZH = `You are a senior algorithm tutor. Given a LeetCode problem, produce a clear, concise solution explanation. Write in Simplified Chinese. Return valid JSON matching the schema exactly.`;

const RESPONSE_SCHEMA = {
  name: 'ai_solution',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      approach: { type: 'string', description: 'Markdown explanation of the solution approach' },
      complexity: { type: 'string', description: 'Time and space complexity with brief explanation' },
      pythonCode: { type: 'string', description: 'Complete Python solution class' },
      javaCode: { type: 'string', description: 'Complete Java solution class' },
      cppCode: { type: 'string', description: 'Complete C++ solution class' },
      pitfalls: { type: 'string', description: 'Markdown list of common mistakes' },
    },
    required: ['approach', 'complexity', 'pythonCode', 'javaCode', 'cppCode', 'pitfalls'],
    additionalProperties: false,
  },
};

type AiResponse = {
  approach: string;
  complexity: string;
  pythonCode: string;
  javaCode: string;
  cppCode: string;
  pitfalls: string;
};

const LOCK_TTL_MS = 5 * 60 * 1000;

export async function generateAiSolution(
  problemId: number,
  language: Language,
): Promise<AiSolution> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');

  const existing = await db
    .select()
    .from(aiGenerationLocks)
    .where(
      and(
        eq(aiGenerationLocks.problemId, problemId),
        eq(aiGenerationLocks.language, language),
        gt(aiGenerationLocks.lockedUntil, new Date()),
      ),
    )
    .limit(1);
  if (existing.length > 0) throw new Error('Generation already in progress');

  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
  await db.insert(aiGenerationLocks).values({ problemId, language, lockedUntil }).onDuplicateKeyUpdate({
    set: { lockedAt: new Date(), lockedUntil },
  });

  try {
    const problemRows = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);
    const problem = problemRows[0];
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const content = language === 'zh'
      ? (problem.contentZh || problem.contentEn || '')
      : (problem.contentEn || '');
    if (!content) throw new Error(`Problem ${problemId} has no content`);

    const snippets = problem.codeSnippetsJson
      ? JSON.stringify(problem.codeSnippetsJson)
      : '';

    const systemPrompt = language === 'zh' ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
    const userMessage = [
      `Problem: ${problem.titleEn ?? problem.titleSlug}`,
      `Difficulty: ${problem.difficulty}`,
      '',
      content,
      snippets ? `\nCode snippets:\n${snippets}` : '',
    ].join('\n');

    const result = await _llm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      responseFormat: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
    });

    const raw = result.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') throw new Error('LLM returned no content');
    const parsed: AiResponse = JSON.parse(raw);

    await db.insert(aiSolutions).values({
      problemId,
      language,
      approachMarkdown: parsed.approach,
      complexityMarkdown: parsed.complexity,
      pythonCode: parsed.pythonCode,
      javaCode: parsed.javaCode,
      cppCode: parsed.cppCode,
      pitfallsMarkdown: parsed.pitfalls || null,
      modelVersion: result.model ?? 'unknown',
    }).onDuplicateKeyUpdate({
      set: {
        approachMarkdown: parsed.approach,
        complexityMarkdown: parsed.complexity,
        pythonCode: parsed.pythonCode,
        javaCode: parsed.javaCode,
        cppCode: parsed.cppCode,
        pitfallsMarkdown: parsed.pitfalls || null,
        generatedAt: new Date(),
        modelVersion: result.model ?? 'unknown',
      },
    });

    const rows = await db
      .select()
      .from(aiSolutions)
      .where(and(eq(aiSolutions.problemId, problemId), eq(aiSolutions.language, language)))
      .limit(1);
    return rows[0]!;
  } finally {
    await db
      .delete(aiGenerationLocks)
      .where(
        and(
          eq(aiGenerationLocks.problemId, problemId),
          eq(aiGenerationLocks.language, language),
        ),
      )
      .catch(() => {});
  }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add server/sync/aiGeneration.ts && git commit -m "feat: add shared AI solution generation function with locking"
```

---

## Task 2: AI solutions tRPC router

**Files:**
- Create: `server/routers/aiSolutions.ts`
- Modify: `server/routers.ts`

- [ ] **Step 1: Create the router**

Create `server/routers/aiSolutions.ts`:

```typescript
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, publicProcedure, adminProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { aiSolutions } from '../../drizzle/schema';
import { LanguageSchema } from '@shared/problemTypes';
import { generateAiSolution } from '../sync/aiGeneration';

export const aiSolutionsRouter = router({
  get: publicProcedure
    .input(z.object({
      problemId: z.number().int().positive(),
      language: LanguageSchema,
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(aiSolutions)
        .where(and(
          eq(aiSolutions.problemId, input.problemId),
          eq(aiSolutions.language, input.language),
        ))
        .limit(1);
      return rows[0] ?? null;
    }),

  generate: adminProcedure
    .input(z.object({
      problemId: z.number().int().positive(),
      language: LanguageSchema,
    }))
    .mutation(async ({ input }) => {
      return await generateAiSolution(input.problemId, input.language);
    }),
});
```

- [ ] **Step 2: Register the router in routers.ts**

In `server/routers.ts`, add the import and registration:

```typescript
import { aiSolutionsRouter } from "./routers/aiSolutions";
```

Add to the appRouter object:

```typescript
aiSolutions: aiSolutionsRouter,
```

- [ ] **Step 3: Verify build**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add server/routers/aiSolutions.ts server/routers.ts && git commit -m "feat: add aiSolutions tRPC router (get + generate endpoints)"
```

---

## Task 3: AI solutions router tests

**Files:**
- Create: `server/__tests__/routers.aiSolutions.test.ts`

- [ ] **Step 1: Write the test file**

Create `server/__tests__/routers.aiSolutions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiSolutionsRouter } from '../routers/aiSolutions';
import * as db from '../db';
import type { Request, Response } from 'express';
import type { User } from '../../drizzle/schema';

vi.mock('../sync/aiGeneration', () => ({
  generateAiSolution: vi.fn().mockResolvedValue({
    id: 1,
    problemId: 1,
    language: 'en',
    approachMarkdown: '# Approach',
    complexityMarkdown: 'O(n)',
    pythonCode: 'class Solution: pass',
    javaCode: 'class Solution {}',
    cppCode: 'class Solution {};',
    pitfallsMarkdown: null,
    generatedAt: new Date(),
    modelVersion: 'test',
  }),
}));

function makeCaller(user: User | null = null) {
  return aiSolutionsRouter.createCaller({
    user,
    req: {} as Request,
    res: {} as Response,
  });
}

const adminUser: User = {
  id: 1,
  openId: 'admin',
  name: 'Admin',
  email: null,
  loginMethod: null,
  role: 'admin',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const regularUser: User = {
  ...adminUser,
  id: 2,
  openId: 'user',
  role: 'user',
};

describe('routers/aiSolutions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('get returns null when no solution exists', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const caller = makeCaller();
    const result = await caller.get({ problemId: 1, language: 'en' });
    expect(result).toBeNull();
  });

  it('generate rejects unauthenticated calls', async () => {
    const caller = makeCaller(null);
    await expect(
      caller.generate({ problemId: 1, language: 'en' }),
    ).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
  });

  it('generate rejects non-admin users', async () => {
    const caller = makeCaller(regularUser);
    await expect(
      caller.generate({ problemId: 1, language: 'en' }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('generate succeeds for admin users', async () => {
    const caller = makeCaller(adminUser);
    const result = await caller.generate({ problemId: 1, language: 'en' });
    expect(result.approachMarkdown).toBe('# Approach');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run server/__tests__/routers.aiSolutions.test.ts`

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/routers.aiSolutions.test.ts && git commit -m "test: add aiSolutions router tests (get, auth, generate)"
```

---

## Task 4: AI pregenerate sync task

**Files:**
- Create: `server/sync/aiPregenerate.ts`
- Modify: `server/sync/index.ts`

- [ ] **Step 1: Create the sync task**

Create `server/sync/aiPregenerate.ts`:

```typescript
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { problems, aiSolutions } from '../../drizzle/schema';
import { generateAiSolution } from './aiGeneration';
import type { TaskResult } from './orchestrator';
import type { Language } from '@shared/problemTypes';

const LANGUAGES: Language[] = ['en', 'zh'];
const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function taskAiPregenerate(): Promise<TaskResult> {
  const db = await getDb();
  if (!db) return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, errorSummary: 'DB unavailable' };

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const language of LANGUAGES) {
    const missing = await db.execute(
      sql`SELECT p.id FROM problems p
          WHERE p.contentEn IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM aiSolutions a
            WHERE a.problemId = p.id AND a.language = ${language}
          )
          ORDER BY p.frontendId ASC`,
    );
    const rows = (Array.isArray(missing) && Array.isArray((missing as unknown[])[0])
      ? (missing as unknown[])[0]
      : missing) as Array<{ id: number }>;

    for (const row of rows) {
      processed++;
      try {
        await generateAiSolution(row.id, language);
        succeeded++;
      } catch (e) {
        failed++;
        const msg = `problem=${row.id} lang=${language}: ${(e as Error).message}`;
        if (errors.length < 10) errors.push(msg);
      }
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }

  return {
    itemsProcessed: processed,
    itemsSucceeded: succeeded,
    itemsFailed: failed,
    errorSummary: errors.length > 0 ? errors.join('; ') : undefined,
  };
}
```

- [ ] **Step 2: Register the task in sync/index.ts**

In `server/sync/index.ts`, add the import near the top:

```typescript
import { taskAiPregenerate } from './aiPregenerate';
```

Add `'ai-pregenerate': taskAiPregenerate,` to the `registerSyncTasks` call:

```typescript
registerSyncTasks({
  'initial-bootstrap': taskInitialBootstrap,
  'daily-sync-lists': taskDailySyncLists,
  'daily-sync-companies': taskDailySyncCompanies,
  'daily-sync-meta': taskDailySyncMeta,
  manual: taskManual,
  'probe-leetcode-cn': taskProbe,
  'ai-pregenerate': taskAiPregenerate,
});
```

- [ ] **Step 3: Verify build**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add server/sync/aiPregenerate.ts server/sync/index.ts && git commit -m "feat: add ai-pregenerate sync task for batch AI solution generation"
```

---

## Task 5: AI pregenerate sync task tests

**Files:**
- Create: `server/__tests__/sync.aiPregenerate.test.ts`

- [ ] **Step 1: Write the test file**

Create `server/__tests__/sync.aiPregenerate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../sync/aiGeneration', () => ({
  generateAiSolution: vi.fn().mockResolvedValue({
    id: 1, problemId: 1, language: 'en',
    approachMarkdown: '#', complexityMarkdown: 'O(1)',
    pythonCode: '', javaCode: '', cppCode: '',
    pitfallsMarkdown: null, generatedAt: new Date(), modelVersion: 'test',
  }),
}));

import { taskAiPregenerate } from '../sync/aiPregenerate';
import * as db from '../db';
import { generateAiSolution } from '../sync/aiGeneration';

describe('sync/aiPregenerate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns zero counts when DB is unavailable', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const result = await taskAiPregenerate();
    expect(result.itemsProcessed).toBe(0);
    expect(result.errorSummary).toBe('DB unavailable');
  });

  it('calls generateAiSolution for missing problems', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    };
    vi.spyOn(db, 'getDb').mockResolvedValue(mockDb as never);

    const result = await taskAiPregenerate();
    expect(generateAiSolution).toHaveBeenCalled();
    expect(result.itemsSucceeded).toBeGreaterThan(0);
  });

  it('counts failures without throwing', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ id: 99 }]),
    };
    vi.spyOn(db, 'getDb').mockResolvedValue(mockDb as never);
    (generateAiSolution as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM failed'));

    const result = await taskAiPregenerate();
    expect(result.itemsFailed).toBeGreaterThan(0);
    expect(result.errorSummary).toContain('LLM failed');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run server/__tests__/sync.aiPregenerate.test.ts`

Expected: All 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/sync.aiPregenerate.test.ts && git commit -m "test: add AI pregenerate sync task tests"
```

---

## Task 6: Add i18n keys

**Files:**
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/zh.ts`

- [ ] **Step 1: Add keys to en.ts**

In `client/src/i18n/en.ts`, add these keys inside the `problem` object, after the existing `aiSolution` key:

```typescript
aiApproach: 'Approach',
aiComplexity: 'Complexity',
aiPitfalls: 'Common Pitfalls',
```

Add a new key inside the `sync` object:

```typescript
runAiPregenerate: 'Generate AI solutions',
```

- [ ] **Step 2: Add keys to zh.ts**

In `client/src/i18n/zh.ts`, add the matching keys inside the `problem` object:

```typescript
aiApproach: '解题思路',
aiComplexity: '复杂度分析',
aiPitfalls: '易错点',
```

Add inside the `sync` object:

```typescript
runAiPregenerate: 'AI 预生成题解',
```

- [ ] **Step 3: Verify build**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/i18n/en.ts client/src/i18n/zh.ts && git commit -m "feat: add i18n keys for AI solution sections and sync button"
```

---

## Task 7: Display AI solutions in ProblemDetail

**Files:**
- Modify: `client/src/pages/ProblemDetail.tsx`

- [ ] **Step 1: Add AI solution section to SolutionPanel**

In `client/src/pages/ProblemDetail.tsx`, modify the `SolutionPanel` component. Add the AI query and rendering after the official solution section.

Replace the entire `SolutionPanel` function (lines 124-146) with:

```typescript
function SolutionPanel({ problemId }: { problemId: number }) {
  const t = useT();
  const { lang } = useLang();
  const q = trpc.problems.solutions.useQuery({ problemId }, { staleTime: 60_000 });
  const aiQ = trpc.aiSolutions.get.useQuery(
    { problemId, language: lang },
    { staleTime: 5 * 60_000 },
  );

  const officialLoading = q.isLoading;
  const solutions = q.data ?? [];
  const preferred = lang === 'zh' ? 'zh' : 'en';
  const sol = solutions.find(s => s.language === preferred) ?? solutions[0];

  return (
    <div className="space-y-6">
      {officialLoading && <p className="text-ink-soft">{t('loading')}</p>}
      {!officialLoading && sol && (
        <section className="bg-white/70 backdrop-blur border border-border rounded-lg p-6">
          <div className="prose prose-sm max-w-none">
            <Streamdown>{cleanSolutionMarkdown(sol.contentMarkdown)}</Streamdown>
          </div>
        </section>
      )}
      {!officialLoading && !sol && (
        <p className="text-ink-soft text-sm">{t('problem.noSolution')}</p>
      )}

      {aiQ.isLoading && (
        <div className="h-24 rounded-lg bg-secondary/50 animate-pulse" />
      )}
      {aiQ.data && <AiSolutionSection data={aiQ.data} />}
    </div>
  );
}
```

- [ ] **Step 2: Add the AiSolutionSection component**

Add this new component at the bottom of `ProblemDetail.tsx` (before the closing of the file, after `TabButton`):

```typescript
function AiSolutionSection({ data }: { data: {
  approachMarkdown: string;
  complexityMarkdown: string;
  pythonCode: string;
  javaCode: string;
  cppCode: string;
  pitfallsMarkdown?: string | null;
} }) {
  const t = useT();
  const [codeLang, setCodeLang] = useState<'python' | 'java' | 'cpp'>('python');

  const codeMap = {
    python: data.pythonCode,
    java: data.javaCode,
    cpp: data.cppCode,
  };

  return (
    <section className="bg-white/70 backdrop-blur border border-border rounded-lg p-6 space-y-5">
      <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest border-b border-border pb-2">
        {t('problem.aiSolution')}
      </h2>

      <div>
        <h3 className="text-sm font-semibold mb-2">{t('problem.aiApproach')}</h3>
        <div className="prose prose-sm max-w-none">
          <Streamdown>{data.approachMarkdown}</Streamdown>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">{t('problem.aiComplexity')}</h3>
        <div className="prose prose-sm max-w-none">
          <Streamdown>{data.complexityMarkdown}</Streamdown>
        </div>
      </div>

      <div>
        <div className="flex gap-1 mb-3">
          {(['python', 'java', 'cpp'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setCodeLang(l)}
              className={
                'px-3 py-1 text-xs font-mono rounded transition-colors ' +
                (codeLang === l
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-secondary text-ink-soft hover:text-ink')
              }
            >
              {t(`problem.code.${l}`)}
            </button>
          ))}
        </div>
        <CodeBlock language={codeLang === 'cpp' ? 'cpp' : codeLang} code={codeMap[codeLang]} />
      </div>

      {data.pitfallsMarkdown && (
        <div>
          <h3 className="text-sm font-semibold mb-2">{t('problem.aiPitfalls')}</h3>
          <div className="prose prose-sm max-w-none">
            <Streamdown>{data.pitfallsMarkdown}</Streamdown>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Add the CodeBlock import**

Add `CodeBlock` to the imports at the top of `ProblemDetail.tsx`:

```typescript
import { CodeBlock } from '@/components/CodeBlock';
```

- [ ] **Step 4: Verify build**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ProblemDetail.tsx && git commit -m "feat: display AI solutions in Solution tab (approach, complexity, code, pitfalls)"
```

---

## Task 8: Add AI pregenerate button to SyncStatus

**Files:**
- Modify: `client/src/pages/SyncStatus.tsx`

- [ ] **Step 1: Add the AI pregenerate button**

In `client/src/pages/SyncStatus.tsx`, add a second `Button` inside the button area (the `{user ? (` block). Place it right after the existing manual sync button:

```typescript
{user ? (
  <div className="flex gap-2">
    <Button
      onClick={() => trigger.mutate({ syncType: 'manual' })}
      disabled={trigger.isPending}
    >
      {trigger.isPending ? t('loading') : t('sync.runManual')}
    </Button>
    <Button
      variant="outline"
      onClick={() => trigger.mutate({ syncType: 'ai-pregenerate' })}
      disabled={trigger.isPending}
    >
      {trigger.isPending ? t('loading') : t('sync.runAiPregenerate')}
    </Button>
  </div>
) : (
  <span className="text-xs text-ink-soft font-mono">{t('sync.loginFirst')}</span>
)}
```

- [ ] **Step 2: Verify build**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/SyncStatus.tsx && git commit -m "feat: add AI pregenerate button to Sync page"
```

---

## Task 9: Update assembly test and final verification

**Files:**
- Modify: `server/__tests__/routers.assembly.test.ts`

- [ ] **Step 1: Add aiSolutions to assembly test**

In `server/__tests__/routers.assembly.test.ts`, add:

```typescript
expect(caller.aiSolutions).toBeDefined();
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`

Expected: All existing + new tests pass.

- [ ] **Step 3: Run type check**

Run: `pnpm check`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/routers.assembly.test.ts && git commit -m "test: add aiSolutions to router assembly test"
```

- [ ] **Step 5: Format**

Run: `pnpm format`

Commit any formatting changes:

```bash
git add -A && git commit -m "style: format after AI solutions feature"
```
