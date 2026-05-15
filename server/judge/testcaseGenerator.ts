/**
 * Generate a deterministic testcase suite for a LeetCode-style problem using LLM.
 *
 * Strategy:
 *   - Send the problem statement + LeetCode codeSnippets (so the model sees the
 *     exact method signature) to the LLM.
 *   - Force JSON-mode output via response_format: { type: "json_object" } and
 *     instruct it to produce {methodName, cases:[{input, expected}, ...]}.
 *   - Validate shape; throw on malformed output (caller may retry once or fall
 *     back to example-only suite extracted from `exampleTestcases`).
 */

import { invokeLLM } from "../_core/llm";

export interface ProblemPromptInput {
  titleSlug: string;
  titleEn: string | null;
  contentEn: string | null;
  contentZh: string | null;
  difficulty: string;
  codeSnippetsJson: unknown;
  exampleTestcases: string | null;
}

export interface GeneratedSuite {
  /** Method name on the Solution class, e.g. "twoSum" */
  methodName: string;
  /** Cases the harness will run. `input` = positional args, `expected` = expected return value. */
  cases: Array<{ input: unknown[]; expected: unknown }>;
  /** Optional reference Python implementation (class Solution); when present, used
   *  to recompute canonical `expected` values, sidestepping LLM arithmetic errors. */
  referenceSolution?: string;
  /** Bookkeeping for debugging. */
  source: "llm" | "examples-fallback";
  notes?: string;
}

interface CodeSnippet {
  lang?: string;
  langSlug?: string;
  code?: string;
}

function extractPythonSignature(snippetsJson: unknown): { methodName: string | null; signature: string | null } {
  if (!Array.isArray(snippetsJson)) return { methodName: null, signature: null };
  const py = (snippetsJson as CodeSnippet[]).find(
    (s) => s?.langSlug === "python3" || s?.langSlug === "python" || s?.lang === "Python3" || s?.lang === "Python",
  );
  if (!py?.code) return { methodName: null, signature: null };
  const match = py.code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(self[^)]*\)/);
  if (!match) return { methodName: null, signature: py.code.split(/\r?\n/).slice(0, 5).join("\n") };
  return { methodName: match[1], signature: match[0] };
}

function stripHtml(html: string | null, maxLen = 4000): string {
  if (!html) return "";
  const text = html
    .replace(/<sup>([^<]+)<\/sup>/g, "^$1")
    .replace(/<sub>([^<]+)<\/sub>/g, "_$1")
    .replace(/<br\s*\/?>(\s*)/g, "\n")
    .replace(/<\/p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "…[truncated]" : text;
}

const SYSTEM_PROMPT = `You generate edge-case test suites for LeetCode-style coding problems.

You will receive:
- The problem statement
- The Python method signature the user will implement (a class Solution with one method)
- A few example test cases (LeetCode "Examples" section)

You must output a JSON object describing a test suite that covers correctness AND edge cases:
- All examples from the prompt
- Smallest valid input (min size)
- Largest reasonable input (don't go absurd — keep ≤ ~50 elements)
- At least one tricky case (duplicates, negatives, all-equal, palindrome, sorted/reverse-sorted, etc. as relevant)
- Boundary values from the constraints (min, max)

Output schema (REQUIRED — no extra fields, no commentary):
{
  "methodName": "<exact method name on class Solution>",
  "referenceSolution": "<a complete, correct Python implementation of class Solution that solves the problem. Use only Python stdlib. Must work for all the cases below. We will execute it to compute canonical expected values.>",
  "cases": [
    { "input": [<arg1>, <arg2>, ...], "expected": <expected return value, your best guess; will be recomputed via referenceSolution> },
    ...
  ]
}

Rules:
- The KEY for arguments MUST be exactly "input" — NOT "args", NOT "arguments", NOT "params".
- "input" MUST be an array of positional arguments matching the method signature, in order.
- "expected" MUST be the canonical expected return value (use lists not tuples; use null for None).
- Keep total cases between 8 and 14.
- For problems whose answer order is irrelevant (e.g. "any valid pair" answers), still pick ONE canonical answer that the reference solution would return; do not include alternates.
- DO NOT include explanations, markdown, or anything outside the JSON object.`;

export async function generateTestcaseSuite(p: ProblemPromptInput): Promise<GeneratedSuite> {
  const { methodName: detectedMethod, signature } = extractPythonSignature(p.codeSnippetsJson);
  const description = stripHtml(p.contentEn || p.contentZh, 5000);

  const userMsg = [
    `# Problem: ${p.titleEn || p.titleSlug} (${p.difficulty})`,
    "",
    "## Method signature (Python):",
    "```python",
    signature || "class Solution:\n  def solve(self, *args): ...",
    "```",
    detectedMethod ? `Method name: \`${detectedMethod}\`` : "",
    "",
    "## Description:",
    description,
    "",
    p.exampleTestcases
      ? "## Example raw testcases (LeetCode format, may be ambiguous):\n```\n" +
        p.exampleTestcases.slice(0, 1500) +
        "\n```"
      : "",
    "",
    "Now produce the JSON test suite.",
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "test_suite",
        schema: {
          type: "object",
          properties: {
            methodName: { type: "string" },
            referenceSolution: { type: "string" },
            cases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  input: { type: "array" },
                  expected: {},
                },
                required: ["input", "expected"],
              },
            },
          },
          required: ["methodName", "referenceSolution", "cases"],
        },
      },
    },
  });

  const content = (resp as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("LLM returned empty content for testcase generation");
  }
  let parsed: GeneratedSuite;
  const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try {
    parsed = JSON.parse(cleaned) as GeneratedSuite;
  } catch (e) {
    console.error(
      "[testcaseGenerator] JSON.parse failed. len=" +
        content.length +
        " head=" +
        content.slice(0, 300) +
        " tail=" +
        content.slice(-300),
    );
    throw new Error(
      "LLM returned invalid JSON for testcase generation: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }

  if (!parsed.methodName || typeof parsed.methodName !== "string") {
    if (detectedMethod) parsed.methodName = detectedMethod;
    else throw new Error("Generated suite missing methodName");
  }
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error("Generated suite has no cases");
  }
  // Normalize: GPT often emits `args` instead of `input` despite the prompt.
  // Accept either, but persist canonical `input` so downstream code (and the cache)
  // is consistent.
  for (const c of parsed.cases as Array<Record<string, unknown>>) {
    if (!Array.isArray((c as { input?: unknown }).input)) {
      const alt = (c as { args?: unknown; arguments?: unknown; params?: unknown });
      const fallback =
        Array.isArray(alt.args) ? alt.args :
        Array.isArray(alt.arguments) ? alt.arguments :
        Array.isArray(alt.params) ? alt.params : null;
      if (fallback) {
        (c as { input: unknown[] }).input = fallback as unknown[];
      } else {
        throw new Error("Generated suite case missing input array: " + JSON.stringify(c).slice(0, 200));
      }
    }
    if (!("expected" in c)) {
      throw new Error("Generated suite case missing expected: " + JSON.stringify(c).slice(0, 200));
    }
  }

  parsed.source = "llm";
  return parsed;
}
