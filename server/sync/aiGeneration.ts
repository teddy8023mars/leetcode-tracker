import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
import { getDb } from '../db';
import {
  aiGenerationLocks,
  aiSolutions,
  problems,
  type AiSolution,
} from '../../drizzle/schema';
import { invokeLLM } from '../_core/llm';
import type { Language } from '@shared/problemTypes';

// ---------------------------------------------------------------------------
// Dependency injection for tests (same pattern as translation.ts)
// ---------------------------------------------------------------------------

type LlmFn = (params: Parameters<typeof invokeLLM>[0]) => Promise<unknown>;
let _llm: LlmFn = invokeLLM as unknown as LlmFn;

export function __setLlmForTest(fn: LlmFn | undefined): void {
  _llm = fn ?? (invokeLLM as unknown as LlmFn);
}

// ---------------------------------------------------------------------------
// JSON schema for the LLM response
// ---------------------------------------------------------------------------

const RESPONSE_SCHEMA = {
  name: 'ai_solution',
  schema: {
    type: 'object',
    properties: {
      approach: { type: 'string', description: 'Explanation of the solution approach in Markdown' },
      complexity: { type: 'string', description: 'Time and space complexity analysis in Markdown' },
      pythonCode: { type: 'string', description: 'Complete Python solution' },
      javaCode: { type: 'string', description: 'Complete Java solution' },
      cppCode: { type: 'string', description: 'Complete C++ solution' },
      pitfalls: { type: 'string', description: 'Common pitfalls and edge cases in Markdown (optional)' },
    },
    required: ['approach', 'complexity', 'pythonCode', 'javaCode', 'cppCode'],
    additionalProperties: false,
  },
  strict: true,
};

// ---------------------------------------------------------------------------
// Zod schema for validating LLM response
// ---------------------------------------------------------------------------

const AiResponseSchema = z.object({
  approach: z.string().min(1),
  complexity: z.string().min(1),
  pythonCode: z.string().min(1),
  javaCode: z.string().min(1),
  cppCode: z.string().min(1),
  pitfalls: z.string().default(''),
});

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_EN = `You are an expert algorithm tutor. Given a LeetCode problem, produce a high-quality solution guide that teaches the reader HOW TO THINK about the problem, not just the answer.

Requirements for each JSON field:

- approach: In Markdown, present 2-3 solutions from brute force to optimal. For each solution:
  ## Solution 1: [Name] (e.g. Brute Force)
  **Intuition:** Why would someone think of this approach? What's the key observation?
  **Algorithm:** Step-by-step explanation.
  **Time:** O(...) | **Space:** O(...)

  ## Solution 2: [Name] (e.g. Hash Map)
  **Intuition:** What's the limitation of the previous approach? How does this solve it?
  **Algorithm:** Step-by-step explanation.
  **Time:** O(...) | **Space:** O(...)

  Mark the recommended solution with ⭐.

- complexity: Summary table of all solutions' time/space complexity in Markdown.
- pythonCode: The OPTIMAL solution only. Complete, runnable Python 3 class Solution.
- javaCode: The OPTIMAL solution only. Complete, runnable Java class Solution.
- cppCode: The OPTIMAL solution only. Complete, runnable C++ class Solution.
- pitfalls: Common mistakes specific to this problem. Be concrete (e.g. "off-by-one when..." not "be careful with edge cases").

Respond ONLY with valid JSON matching the provided schema.`;

const SYSTEM_PROMPT_ZH = `你是一位算法导师。给定一道 LeetCode 题目，请提供高质量的解题教程，重点是教读者如何思考，而不是直接给答案。

各字段要求：

- approach: 用 Markdown 格式，展示 2-3 种解法，从暴力到最优。每种解法：
  ## 解法一：[名称]（如暴力枚举）
  **直觉：** 为什么会想到这种方法？关键观察是什么？
  **算法：** 分步讲解。
  **时间：** O(...) | **空间：** O(...)

  ## 解法二：[名称]（如哈希表）
  **直觉：** 上一种方法的瓶颈是什么？这种方法如何解决？
  **算法：** 分步讲解。
  **时间：** O(...) | **空间：** O(...)

  用 ⭐ 标记推荐的解法。

- complexity: 用 Markdown 表格总结所有解法的时空复杂度。
- pythonCode: 仅最优解法。完整可运行的 Python 3 class Solution。
- javaCode: 仅最优解法。完整可运行的 Java class Solution。
- cppCode: 仅最优解法。完整可运行的 C++ class Solution。
- pitfalls: 针对这道题的具体易错点。要具体（如"当数组全为负数时..."），不要笼统（如"注意边界情况"）。

仅返回符合所提供 schema 的有效 JSON，不要在 JSON 之外包含任何说明。`;

// ---------------------------------------------------------------------------
// Core generation function
// ---------------------------------------------------------------------------

/**
 * Generate (or regenerate) an AI solution for a given problem and language.
 * Uses an `aiGenerationLocks` row to prevent concurrent generation.
 */
const LOCK_TTL_MS = 5 * 60 * 1000;

export async function generateAiSolution(
  problemId: number,
  language: Language,
): Promise<AiSolution> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');

  // Load problem first (before lock) to fail fast on NOT_FOUND
  const problemRows = await db
    .select()
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);
  const problem = problemRows[0];
  if (!problem) throw new Error(`Problem ${problemId} not found`);

  // Acquire lock: delete any expired lock, then try to insert.
  // If insert fails (duplicate key), another process holds a valid lock.
  await db
    .delete(aiGenerationLocks)
    .where(
      and(
        eq(aiGenerationLocks.problemId, problemId),
        eq(aiGenerationLocks.language, language),
        sql`${aiGenerationLocks.lockedUntil} < NOW()`,
      ),
    );

  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
  try {
    await db.insert(aiGenerationLocks).values({ problemId, language, lockedUntil });
  } catch {
    throw new Error(
      `AI solution generation is already in progress for problem ${problemId} (${language})`,
    );
  }

  try {
    // Build user message content
    const title = language === 'zh' ? (problem.titleZh ?? problem.titleEn ?? '') : (problem.titleEn ?? '');
    const content = language === 'zh'
      ? (problem.contentZh ?? problem.contentEn ?? '')
      : (problem.contentEn ?? '');

    // Extract code snippets (Python, Java, C++)
    type CodeSnippet = { lang: string; langSlug: string; code: string };
    const snippets: CodeSnippet[] = Array.isArray(problem.codeSnippetsJson)
      ? (problem.codeSnippetsJson as CodeSnippet[])
      : [];
    const findSnippet = (slug: string) =>
      snippets.find((s) => s.langSlug === slug)?.code ?? '';

    const pythonSnippet = findSnippet('python3') || findSnippet('python');
    const javaSnippet = findSnippet('java');
    const cppSnippet = findSnippet('cpp');

    const snippetSection = [
      pythonSnippet ? `Python:\n\`\`\`python\n${pythonSnippet}\n\`\`\`` : '',
      javaSnippet ? `Java:\n\`\`\`java\n${javaSnippet}\n\`\`\`` : '',
      cppSnippet ? `C++:\n\`\`\`cpp\n${cppSnippet}\n\`\`\`` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const userMessage = [
      `Title: ${title}`,
      `Difficulty: ${problem.difficulty}`,
      '',
      'Problem Statement:',
      content,
      '',
      snippetSection ? `Starter Code:\n${snippetSection}` : '',
    ]
      .filter((line) => line !== undefined)
      .join('\n')
      .trim();

    const systemPrompt = language === 'zh' ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;

    // Call LLM
    const result = (await _llm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      responseFormat: {
        type: 'json_schema',
        json_schema: RESPONSE_SCHEMA,
      },
    } as Parameters<typeof invokeLLM>[0])) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    const rawContent = result?.choices?.[0]?.message?.content ?? '';
    const modelVersion = result?.model ?? null;

    // Parse and validate JSON response
    let parsed: z.infer<typeof AiResponseSchema>;
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    const cleaned = jsonMatch ? jsonMatch[0] : rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    try {
      parsed = AiResponseSchema.parse(JSON.parse(cleaned));
    } catch {
      try {
        parsed = AiResponseSchema.parse(JSON.parse(jsonrepair(cleaned)));
      } catch {
        throw new Error(`Failed to parse LLM JSON response: ${rawContent.slice(0, 200)}`);
      }
    }

    // Upsert into aiSolutions table
    await db
      .insert(aiSolutions)
      .values({
        problemId,
        language,
        approachMarkdown: parsed.approach,
        complexityMarkdown: parsed.complexity,
        pythonCode: parsed.pythonCode,
        javaCode: parsed.javaCode,
        cppCode: parsed.cppCode,
        pitfallsMarkdown: parsed.pitfalls || null,
        generatedAt: new Date(),
        modelVersion,
      })
      .onDuplicateKeyUpdate({
        set: {
          approachMarkdown: parsed.approach,
          complexityMarkdown: parsed.complexity,
          pythonCode: parsed.pythonCode,
          javaCode: parsed.javaCode,
          cppCode: parsed.cppCode,
          pitfallsMarkdown: parsed.pitfalls || null,
          generatedAt: new Date(),
          modelVersion,
        },
      });

    // Fetch and return the persisted row
    const rows = await db
      .select()
      .from(aiSolutions)
      .where(
        and(
          eq(aiSolutions.problemId, problemId),
          eq(aiSolutions.language, language),
        ),
      )
      .limit(1);

    const saved = rows[0];
    if (!saved) throw new Error('Failed to retrieve saved AI solution after upsert');
    return saved;
  } finally {
    // Only release our own lock (matched by our specific lockedUntil timestamp)
    await db
      .delete(aiGenerationLocks)
      .where(
        and(
          eq(aiGenerationLocks.problemId, problemId),
          eq(aiGenerationLocks.language, language),
          eq(aiGenerationLocks.lockedUntil, lockedUntil),
        ),
      )
      .catch(() => {});
  }
}
