import { invokeLLM } from '../_core/llm';

type LlmFn = (params: Parameters<typeof invokeLLM>[0]) => Promise<unknown>;
let _llm: LlmFn = invokeLLM as unknown as LlmFn;
export function __setLlmForTest(fn: LlmFn | undefined) {
  _llm = fn ?? (invokeLLM as unknown as LlmFn);
}

const SYSTEM_PROMPT = `You generate additional judge datasets for a LeetCode SQL problem.

You are given the problem statement, the CREATE TABLE statements, the official example INSERT statements, and a correct reference solution. Produce 3 alternative datasets that stress solutions which overfit the example, e.g.:
- a dataset where the correct answer is empty or minimal
- boundary values (exact thresholds from the statement, duplicates where allowed, NULLs where the schema allows)
- adversarial shapes: different group sizes, gaps/islands of different lengths, streaks at the start/end, ties

Hard rules:
- Every statement MUST be a single-row or multi-row INSERT INTO for the given tables, matching the example INSERT style and column lists.
- Respect ALL constraints stated in the problem (primary keys / unique columns must stay unique, foreign keys must reference existing rows, enum-like columns only use values seen in the statement or examples, date formats identical to the examples).
- Keep every table under 30 rows.
- Do NOT include CREATE, TRUNCATE, UPDATE, DELETE, or comments.

Respond with JSON only: {"datasets": [["INSERT ...", ...], ["INSERT ...", ...], ["INSERT ...", ...]]}`;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/** Parse + sanitize the LLM response: only INSERT statements survive. */
export function parseDatasetsResponse(text: string): string[][] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const datasets = (parsed as { datasets?: unknown })?.datasets;
  if (!Array.isArray(datasets)) return null;
  const out: string[][] = [];
  for (const ds of datasets) {
    if (!Array.isArray(ds)) continue;
    const stmts = ds
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => /^insert\s+into\s/i.test(s) && !s.includes(';'));
    if (stmts.length > 0) out.push(stmts);
  }
  return out.length > 0 ? out : null;
}

export async function generateSqlJudgeDatasets(args: {
  titleEn: string | null;
  contentEn: string | null;
  schemas: string[];
  referenceSql: string;
}): Promise<string[][] | null> {
  const creates = args.schemas.filter((s) => !/^\s*insert\s/i.test(s));
  const exampleInserts = args.schemas.filter((s) => /^\s*insert\s/i.test(s));
  const user = [
    `Problem: ${args.titleEn ?? '(unknown)'}`,
    args.contentEn ? `Statement (HTML):\n${truncate(args.contentEn, 5000)}` : '',
    `Tables:\n${creates.join('\n')}`,
    `Example inserts:\n${exampleInserts.join('\n')}`,
    `Reference solution:\n${truncate(args.referenceSql, 3000)}`,
  ].filter(Boolean).join('\n\n');

  const res = (await _llm({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    responseFormat: { type: 'json_object' },
  } as Parameters<typeof invokeLLM>[0])) as { choices?: { message?: { content?: string } }[] };

  const text = res?.choices?.[0]?.message?.content ?? '';
  return parseDatasetsResponse(text);
}
