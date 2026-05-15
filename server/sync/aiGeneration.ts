import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
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

const SYSTEM_PROMPT_EN = `You are an expert algorithm engineer. Given a LeetCode problem, produce a high-quality solution with the following sections:
- approach: A clear, concise explanation of the solution strategy in Markdown.
- complexity: Time and space complexity analysis in Markdown.
- pythonCode: A complete, runnable Python 3 solution.
- javaCode: A complete, runnable Java solution.
- cppCode: A complete, runnable C++ solution.
- pitfalls: (Optional) Common mistakes or tricky edge cases in Markdown.

Respond ONLY with valid JSON matching the provided schema. Do not include any explanation outside the JSON.`;

const SYSTEM_PROMPT_ZH = `你是一位算法专家。给定一道 LeetCode 题目，请提供高质量解题方案，包含以下字段：
- approach: 用 Markdown 格式清晰简洁地描述解题思路（中文）。
- complexity: 用 Markdown 格式描述时间复杂度和空间复杂度（中文）。
- pythonCode: 完整可运行的 Python 3 解法。
- javaCode: 完整可运行的 Java 解法。
- cppCode: 完整可运行的 C++ 解法。
- pitfalls: （可选）常见误区或边界情况，Markdown 格式（中文）。

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
    try {
      parsed = AiResponseSchema.parse(JSON.parse(rawContent));
    } catch {
      throw new Error(`Failed to parse LLM JSON response: ${rawContent.slice(0, 200)}`);
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
