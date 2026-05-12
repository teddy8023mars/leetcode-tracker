import { invokeLLM } from '../_core/llm';

type LlmFn = (params: Parameters<typeof invokeLLM>[0]) => Promise<unknown>;
let _llm: LlmFn = invokeLLM as unknown as LlmFn;
export function __setLlmForTest(fn: LlmFn | undefined) {
  _llm = fn ?? (invokeLLM as unknown as LlmFn);
}

const SYSTEM_PROMPT = `You are a technical translator. Translate the LeetCode problem statement below from English to Simplified Chinese. Preserve every HTML tag exactly (<p>, <pre>, <code>, <var>, <strong>, <em>, <ul>, <ol>, <li>, <sup>, <sub>, <img>, <table>, <tr>, <td>, <th>, <br>, <hr>, <span>, <div>). Preserve all code, variable names, numbers, mathematical expressions, and identifiers verbatim — never translate identifiers like nums, target, root, dp[i]. Output ONLY the translated HTML — no preamble, no explanation, no Markdown fences.`;

const MAX_CHARS = 8000;
const CHINESE_RE = /[\u4e00-\u9fa5]/;

function splitAtParagraph(input: string, maxChars: number): string[] {
  if (input.length <= maxChars) return [input];
  const chunks: string[] = [];
  let remaining = input;
  while (remaining.length > maxChars) {
    const slice = remaining.slice(0, maxChars);
    const lastClose = slice.lastIndexOf('</p>');
    const cut = lastClose > 0 ? lastClose + 4 : maxChars;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

export async function translateContentToZh(contentEn: string): Promise<string | null> {
  const chunks = splitAtParagraph(contentEn, MAX_CHARS);
  const out: string[] = [];
  for (const chunk of chunks) {
    const res = (await _llm({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: chunk },
      ],
    } as Parameters<typeof invokeLLM>[0])) as { choices?: { message?: { content?: string } }[] };
    const text = res?.choices?.[0]?.message?.content ?? '';
    if (!CHINESE_RE.test(text)) return null;
    out.push(text);
  }
  return out.join('');
}
