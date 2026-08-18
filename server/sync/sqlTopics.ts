import { invokeLLM } from '../_core/llm';

type LlmFn = (params: Parameters<typeof invokeLLM>[0]) => Promise<unknown>;
let _llm: LlmFn = invokeLLM as unknown as LlmFn;
export function __setLlmForTest(fn: LlmFn | undefined) {
  _llm = fn ?? (invokeLLM as unknown as LlmFn);
}

/** Fixed taxonomy for SQL problems. `name` mirrors LeetCode tag shape (English). */
export const SQL_TOPICS = [
  { slug: 'sql-select', name: 'Basic Select' },
  { slug: 'sql-join', name: 'Joins' },
  { slug: 'sql-aggregate', name: 'Aggregate & Group By' },
  { slug: 'sql-subquery', name: 'Subquery & CTE' },
  { slug: 'sql-window', name: 'Window Functions' },
  { slug: 'sql-string', name: 'String Functions' },
  { slug: 'sql-date', name: 'Date Functions' },
  { slug: 'sql-modify', name: 'Data Modification' },
  { slug: 'sql-function', name: 'Functions & Procedures' },
] as const;

export type SqlTopicTag = { slug: string; name: string };

const SLUG_TO_NAME = new Map<string, string>(SQL_TOPICS.map(t => [t.slug, t.name]));

const SYSTEM_PROMPT = `You classify LeetCode SQL (database) problems into topic categories.

Categories (use the slug):
- sql-select: basic SELECT / WHERE / ORDER BY filtering, no other technique dominates
- sql-join: any JOIN between tables (inner/left/self/cross)
- sql-aggregate: aggregate functions (COUNT/SUM/AVG/MIN/MAX) and/or GROUP BY / HAVING
- sql-subquery: subqueries or CTEs (WITH ...) as a core part of the solution
- sql-window: window functions (OVER, RANK, DENSE_RANK, ROW_NUMBER, LAG, LEAD, running totals)
- sql-string: string manipulation (CONCAT, SUBSTRING, UPPER/LOWER, REGEXP, LIKE-heavy logic)
- sql-date: date/time arithmetic (DATEDIFF, DATE_ADD, interval logic between rows by date)
- sql-modify: data modification (INSERT / UPDATE / DELETE)
- sql-function: CREATE FUNCTION or stored procedures

Pick 1 to 3 slugs that best describe the core techniques required. Respond with JSON only: {"topics": ["slug", ...]} — most important first.`;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

export async function classifySqlProblem(args: {
  titleEn: string | null;
  contentEn: string | null;
  referenceSql: string | null;
}): Promise<SqlTopicTag[] | null> {
  const parts = [`Title: ${args.titleEn ?? '(unknown)'}`];
  if (args.contentEn) parts.push(`Problem statement (HTML):\n${truncate(args.contentEn, 6000)}`);
  if (args.referenceSql) parts.push(`Reference solution SQL:\n${truncate(args.referenceSql, 4000)}`);

  const res = (await _llm({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: parts.join('\n\n') },
    ],
    responseFormat: { type: 'json_object' },
  } as Parameters<typeof invokeLLM>[0])) as { choices?: { message?: { content?: string } }[] };

  const text = res?.choices?.[0]?.message?.content ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const topics = (parsed as { topics?: unknown })?.topics;
  if (!Array.isArray(topics)) return null;

  const tags: SqlTopicTag[] = [];
  for (const slug of topics) {
    if (typeof slug !== 'string') continue;
    const name = SLUG_TO_NAME.get(slug);
    if (!name) continue;
    if (tags.some(t => t.slug === slug)) continue;
    tags.push({ slug, name });
  }
  return tags.length > 0 ? tags.slice(0, 3) : null;
}
