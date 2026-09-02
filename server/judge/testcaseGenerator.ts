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

import { LLM_NOT_CONFIGURED_ERR } from "@shared/const";
import { invokeLLM } from "../_core/llm";
import { isLlmConfigured } from "../_core/env";
import { jsonrepair } from "jsonrepair";

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
  source: "llm" | "examples-fallback" | "official-examples";
  /** Compare array-shaped answers without relying on their presentation order. */
  comparison?: "exact" | "unordered" | "deep-unordered";
  /** For in-place problems, compare this mutated positional argument instead of the return value. */
  resultFromArg?: number;
  /** LeetCode design problems instantiate this class and replay operation sequences. */
  className?: string;
  /** Converts serialized LeetCode inputs that are not ordinary method arguments. */
  inputAdapter?: "linked-list-cycle" | "binary-tree-node-refs" | "design-binary-tree" | "design-iterator";
  /** Converts a returned structure into LeetCode's expected comparison value. */
  resultAdapter?: "linked-list-node-index" | "tree-node-value";
  /** Problem-specific semantic validation when one literal expected value is insufficient. */
  validator?:
    | "remove-element"
    | "remove-duplicates"
    | "remove-duplicates-ii"
    | "balanced-bst-from-sorted-array"
    | "bst-delete"
    | "bst-insert"
    | "randomized-container";
  notes?: string;
}

interface CodeSnippet {
  lang?: string;
  langSlug?: string;
  code?: string;
}

const DEEP_UNORDERED_PROBLEMS = new Set([
  '3sum',
  '4sum',
  'combination-sum',
  'combination-sum-ii',
  'combination-sum-iii',
  'combinations',
  'group-anagrams',
  'subsets',
  'subsets-ii',
]);

const OUTER_UNORDERED_PROBLEMS = new Set([
  'merge-intervals',
  'palindrome-partitioning',
]);

function pythonSnippet(snippetsJson: unknown): string | null {
  if (!Array.isArray(snippetsJson)) return null;
  const py = (snippetsJson as CodeSnippet[]).find(
    (s) => s?.langSlug === "python3" || s?.langSlug === "python" || s?.lang === "Python3" || s?.lang === "Python",
  );
  return py?.code ?? null;
}

function extractPythonSignature(snippetsJson: unknown): { methodName: string | null; signature: string | null } {
  const code = pythonSnippet(snippetsJson);
  if (!code) return { methodName: null, signature: null };
  // Find the method inside class Solution (skip __init__ and methods from other classes like ListNode/TreeNode)
  const solutionStart = code.indexOf('class Solution');
  if (solutionStart < 0) return { methodName: null, signature: null };
  const solutionCode = code.slice(solutionStart);
  const methodPattern = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(self[^)]*\)(?:\s*->\s*[^:\n]+)?\s*:/g;
  const match = methodPattern.exec(solutionCode);
  if (!match || match[1] === '__init__') {
    // Try next method after __init__
    const allMethods = Array.from(solutionCode.matchAll(methodPattern));
    const nonInit = allMethods.find(m => m[1] !== '__init__');
    if (nonInit) return { methodName: nonInit[1], signature: nonInit[0] };
    return { methodName: null, signature: solutionCode.split(/\r?\n/).slice(0, 5).join("\n") };
  }
  return { methodName: match[1], signature: match[0] };
}

function extractDesignClassName(snippetsJson: unknown): string | null {
  const code = pythonSnippet(snippetsJson);
  if (!code || code.includes('class Solution')) return null;
  const names = Array.from(code.matchAll(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*:/gm), (m) => m[1]);
  return names.find((name) => !['ListNode', 'TreeNode', 'Node'].includes(name)) ?? null;
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

function parameterCount(signature: string | null): number {
  if (!signature) return 0;
  const body = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
  let depth = 0;
  let count = 1;
  for (const ch of body) {
    if ('[({'.includes(ch)) depth += 1;
    else if (']})'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) count += 1;
  }
  // Python instance-method signatures include `self` as their first parameter.
  return Math.max(0, count - 1);
}

function parseLeetCodeLiteral(raw: string): unknown {
  const value = raw.trim().replace(/\u00a0/g, ' ');
  return JSON.parse(value);
}

function firstLeetCodeLiteralLength(raw: string): number {
  const value = raw.trimStart().replace(/\u00a0/g, ' ');
  const first = value[0];
  if (first === '[' || first === '{') {
    const closing = first === '[' ? ']' : '}';
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === first) depth += 1;
      else if (ch === closing && --depth === 0) return i + 1;
    }
    throw new Error('Unterminated output literal');
  }
  if (first === '"') {
    let escaped = false;
    for (let i = 1; i < value.length; i += 1) {
      const ch = value[i];
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') return i + 1;
    }
    throw new Error('Unterminated string output');
  }
  const scalar = value.match(/^(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|true|false|null)\b/i)?.[0];
  if (!scalar) throw new Error('Unsupported output literal');
  return scalar.length;
}

function parseFirstLeetCodeLiteral(raw: string): unknown {
  const value = raw.trimStart().replace(/\u00a0/g, ' ');
  const length = firstLeetCodeLiteralLength(value);
  const literal = value.slice(0, length);
  return JSON.parse(/^(?:true|false|null)$/i.test(literal) ? literal.toLowerCase() : literal);
}

function extractDesignInputs(text: string): [unknown, unknown] | null {
  const match = text.match(/(?:^|\n)\s*Input:?\s*([\s\S]*?)(?=\n\s*Output:?\s*)/i);
  if (!match) return null;
  try {
    let remaining = match[1].trimStart();
    const firstLength = firstLeetCodeLiteralLength(remaining);
    const first = parseFirstLeetCodeLiteral(remaining);
    remaining = remaining.slice(firstLength).trimStart();
    const second = parseFirstLeetCodeLiteral(remaining);
    return [first, second];
  } catch {
    return null;
  }
}

const UNPARSED_OUTPUT = Symbol('unparsed-output');

function extractOfficialOutputs(text: string): Array<unknown | typeof UNPARSED_OUTPUT> {
  const markers = Array.from(text.matchAll(/(?:^|\n)\s*Output:?\s*/gi));
  const outputs: unknown[] = [];
  for (const marker of markers) {
    try {
      const start = (marker.index ?? 0) + marker[0].length;
      outputs.push(parseFirstLeetCodeLiteral(text.slice(start)));
    } catch {
      // Some problem types use prose or diagrams as output. They need a
      // dedicated adapter and must not become an unreliable testcase.
      outputs.push(UNPARSED_OUTPUT);
    }
  }
  return outputs;
}

/** Build a no-network suite from the examples already shipped in the problem statement. */
export function buildOfficialExampleSuite(p: ProblemPromptInput): GeneratedSuite | null {
  const { methodName, signature } = extractPythonSignature(p.codeSnippetsJson);
  const className = extractDesignClassName(p.codeSnippetsJson);
  const designConstructorTakesTree = /def\s+__init__\s*\([^)]*\bTreeNode\b[^)]*\)/.test(
    pythonSnippet(p.codeSnippetsJson) ?? '',
  );
  const designConstructorTakesIterator = /def\s+__init__\s*\([^)]*\bIterator\b[^)]*\)/.test(
    pythonSnippet(p.codeSnippetsJson) ?? '',
  );
  const text = stripHtml(p.contentEn || p.contentZh, 100_000);
  const outputValues = extractOfficialOutputs(text);
  const rawInputs = p.exampleTestcases?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? [];

  if (
    ['linked-list-cycle', 'linked-list-cycle-ii'].includes(p.titleSlug) &&
    methodName && rawInputs.length >= 2 && rawInputs.length % 2 === 0
  ) {
    try {
      const returnsEntryNode = p.titleSlug === 'linked-list-cycle-ii';
      const cases = Array.from({ length: rawInputs.length / 2 }, (_, i) => {
        const values = parseLeetCodeLiteral(rawInputs[i * 2]);
        const position = parseLeetCodeLiteral(rawInputs[i * 2 + 1]);
        if (!Array.isArray(values) || typeof position !== 'number') throw new Error('Invalid cycle testcase');
        return { input: [values, position], expected: returnsEntryNode ? position : position >= 0 };
      });
      return {
        methodName,
        cases,
        source: 'official-examples',
        comparison: 'exact',
        inputAdapter: 'linked-list-cycle',
        ...(returnsEntryNode ? { resultAdapter: 'linked-list-node-index' as const } : {}),
        notes: returnsEntryNode
          ? 'Constructs the cycle locally and compares the returned node index.'
          : 'Constructs the cycle locally and compares the returned boolean.',
      };
    } catch {
      return null;
    }
  }

  if (!methodName && className && rawInputs.length >= 2 && outputValues.length >= 1) {
    try {
      const makeCase = (operations: unknown, argumentsByOperation: unknown, expected: unknown) => {
        if (
          !Array.isArray(operations) ||
          !Array.isArray(argumentsByOperation) ||
          !Array.isArray(expected) ||
          operations.length !== argumentsByOperation.length ||
          operations.length !== expected.length
        ) return null;
        return { input: [operations, argumentsByOperation], expected };
      };
      const cases = [] as GeneratedSuite['cases'];
      for (let index = 0; index * 2 + 1 < rawInputs.length && index < outputValues.length; index += 1) {
        const candidate = makeCase(
          parseLeetCodeLiteral(rawInputs[index * 2]),
          parseLeetCodeLiteral(rawInputs[index * 2 + 1]),
          outputValues[index],
        );
        if (candidate) cases.push(candidate);
      }
      if (cases.length === 0) {
        const statementInputs = extractDesignInputs(text);
        const candidate = statementInputs
          ? makeCase(statementInputs[0], statementInputs[1], outputValues[0])
          : null;
        if (candidate) cases.push(candidate);
      }
      if (cases.length === 0) return null;
      return {
        methodName: '__operations__',
        className,
        cases,
        source: 'official-examples',
        comparison: 'exact',
        ...(designConstructorTakesTree
          ? { inputAdapter: 'design-binary-tree' as const }
          : designConstructorTakesIterator
            ? { inputAdapter: 'design-iterator' as const }
            : {}),
        ...([
          'insert-delete-getrandom-o1',
          'insert-delete-getrandom-o1-duplicates-allowed',
        ].includes(p.titleSlug) ? { validator: 'randomized-container' as const } : {}),
        notes: 'Runs the official operation sequence entirely offline.',
      };
    } catch {
      return null;
    }
  }

  const paramCount = parameterCount(signature);
  if (!methodName || paramCount === 0 || !p.exampleTestcases) return null;

  const inputs = rawInputs;
  if (inputs.length === 0 || inputs.length % paramCount !== 0) return null;

  const caseCount = inputs.length / paramCount;
  if (outputValues.length !== caseCount || outputValues.some((value) => value === UNPARSED_OUTPUT)) return null;

  try {
    const cases = Array.from({ length: caseCount }, (_, caseIndex) => ({
      input: inputs
        .slice(caseIndex * paramCount, (caseIndex + 1) * paramCount)
        .map(parseLeetCodeLiteral),
      expected: outputValues[caseIndex],
    }));
    return {
      methodName,
      cases,
      source: 'official-examples',
      comparison: DEEP_UNORDERED_PROBLEMS.has(p.titleSlug)
        ? 'deep-unordered'
        : OUTER_UNORDERED_PROBLEMS.has(p.titleSlug) || /\b(?:in|at) any order\b|\bany order\b/i.test(text)
          ? 'unordered'
          : 'exact',
      ...([
        'lowest-common-ancestor-of-a-binary-search-tree',
        'lowest-common-ancestor-of-a-binary-tree',
      ].includes(p.titleSlug)
        ? { inputAdapter: 'binary-tree-node-refs' as const, resultAdapter: 'tree-node-value' as const }
        : {}),
      ...(p.titleSlug === 'remove-element'
        ? { validator: 'remove-element' as const }
        : p.titleSlug === 'remove-duplicates-from-sorted-array'
          ? { validator: 'remove-duplicates' as const }
          : p.titleSlug === 'remove-duplicates-from-sorted-array-ii'
            ? { validator: 'remove-duplicates-ii' as const }
        : p.titleSlug === 'convert-sorted-array-to-binary-search-tree'
          ? { validator: 'balanced-bst-from-sorted-array' as const }
          : p.titleSlug === 'delete-node-in-a-bst'
            ? { validator: 'bst-delete' as const }
            : p.titleSlug === 'insert-into-a-binary-search-tree'
              ? { validator: 'bst-insert' as const }
          : {}),
      ...(signature && /\)\s*->\s*(?:None|NoneType)\b/.test(signature)
        ? { resultFromArg: 0 }
        : {}),
      notes: 'Runs entirely offline using examples bundled with the problem statement.',
    };
  } catch {
    return null;
  }
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
  "cases": [
    { "input": [<arg1>, <arg2>, ...], "expected": <expected return value> },
    ...
  ]
}

Rules:
- The KEY for arguments MUST be exactly "input" — NOT "args", NOT "arguments", NOT "params".
- "input" MUST be an array of positional arguments matching the method signature, in order.
- For linked list parameters (ListNode), represent them as plain arrays (e.g. [1,2,4] instead of a ListNode).
- For tree parameters (TreeNode), represent them as level-order arrays (e.g. [1,2,3,null,null,4,5]).
- Return values that are ListNode/TreeNode should also be represented as arrays.
- "expected" MUST be the correct expected return value (use lists not tuples; use null for None).
- Keep total cases between 8 and 14.
- For problems whose answer order is irrelevant, still pick ONE canonical answer; do not include alternates.
- DO NOT include explanations, markdown, referenceSolution, or anything outside the JSON object.`;

const MAX_RETRIES = 2;

export async function generateTestcaseSuite(p: ProblemPromptInput): Promise<GeneratedSuite> {
  const officialSuite = buildOfficialExampleSuite(p);
  if (officialSuite) return officialSuite;

  // Without a model we cannot invent expected values, and the example-testcase
  // fallback below only recovers *inputs* — judging against made-up expectations
  // would be worse than saying so. Problems with a cached suite still run.
  if (!isLlmConfigured()) {
    throw new Error(
      `${LLM_NOT_CONFIGURED_ERR}: this problem has no stored test cases, and generating them needs a model API key.`,
    );
  }
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await _generateOnce(p);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[testcaseGenerator] Attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }
  throw lastError!;
}

async function _generateOnce(p: ProblemPromptInput): Promise<GeneratedSuite> {
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
    responseFormat: { type: "json_object" },
  });

  const content = (resp as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("LLM returned empty content for testcase generation");
  }
  let parsed: GeneratedSuite;
  // Extract JSON object from response — LLM may wrap it in text or markdown
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const cleaned = jsonMatch ? jsonMatch[0] : content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try {
    parsed = JSON.parse(cleaned) as GeneratedSuite;
  } catch {
    try {
      const repaired = jsonrepair(cleaned);
      const obj = JSON.parse(repaired);
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        throw new Error("Repaired JSON is not an object");
      }
      parsed = obj as GeneratedSuite;
      console.warn("[testcaseGenerator] Parsed after jsonrepair");
    } catch (e2) {
      console.error("[testcaseGenerator] JSON parse failed. head=" + content.slice(0, 300));
      throw new Error(
        "LLM returned invalid JSON for testcase generation: " +
          (e2 instanceof Error ? e2.message : String(e2)),
      );
    }
  }

  if (!parsed.methodName || typeof parsed.methodName !== "string") {
    if (detectedMethod) parsed.methodName = detectedMethod;
    else throw new Error("Generated suite missing methodName");
  }
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    // Fallback: build cases from LeetCode example testcases if available
    if (p.exampleTestcases) {
      const lines = p.exampleTestcases.split('\n').filter(l => l.trim());
      const sig = extractPythonSignature(p.codeSnippetsJson);
      const paramCount = sig.signature ? (sig.signature.match(/,/g) || []).length : 1;
      const cases: Array<{ input: unknown[]; expected: unknown }> = [];
      for (let i = 0; i + paramCount < lines.length; i += paramCount + 1) {
        const args: unknown[] = [];
        for (let j = 0; j < paramCount; j++) {
          try { args.push(JSON.parse(lines[i + j])); } catch { args.push(lines[i + j]); }
        }
        let expected: unknown;
        try { expected = JSON.parse(lines[i + paramCount]); } catch { expected = lines[i + paramCount]; }
        cases.push({ input: args, expected });
      }
      if (cases.length > 0) {
        parsed.cases = cases;
        parsed.source = "examples-fallback";
      }
    }
    if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
      throw new Error("Generated suite has no cases");
    }
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

  // Second LLM call: get a reference solution as plain text (no JSON escaping issues)
  try {
    const refResp = await invokeLLM({
      messages: [
        { role: "system", content: "You write correct Python solutions for LeetCode problems. Output ONLY the Python code for class Solution, nothing else. No markdown fences, no explanation." },
        { role: "user", content: `Write a correct Python solution for: ${p.titleEn || p.titleSlug}\n\n${signature || ""}\n\n${description.slice(0, 2000)}` },
      ],
    });
    const refContent = (refResp as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
    const refCode = refContent.replace(/^```(?:python)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    if (refCode.includes("class Solution") && refCode.includes("def ")) {
      parsed.referenceSolution = refCode;
    }
  } catch (e) {
    console.warn("[testcaseGenerator] Failed to get reference solution:", e);
  }

  return parsed;
}
