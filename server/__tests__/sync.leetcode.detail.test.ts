import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchQuestionDetailEn,
  fetchQuestionDetailZh,
  fetchOfficialSolutionZh,
  __setFetchForTest,
} from '../sync/leetcode';

describe('sync/leetcode/detail', () => {
  beforeEach(() => __setFetchForTest(undefined));

  it('fetchQuestionDetailEn parses content fields', async () => {
    __setFetchForTest(
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: {
            question: {
              content: '<p>Sample</p>',
              hints: ['Hint A'],
              exampleTestcases: '1\n2',
              topicTags: [{ slug: 'array', name: 'Array' }],
              similarQuestions: '[]',
              codeSnippets: [{ lang: 'Python3', langSlug: 'python3', code: 'def x():\n  pass' }],
            },
          },
        }),
      })) as unknown as typeof globalThis.fetch,
    );
    const detail = await fetchQuestionDetailEn('two-sum');
    expect(detail?.contentEn).toBe('<p>Sample</p>');
    expect(detail?.hintsJson).toEqual(['Hint A']);
    expect(detail?.codeSnippetsJson?.[0]?.langSlug).toBe('python3');
  });

  it('fetchQuestionDetailEn returns null when LeetCode returns null question', async () => {
    __setFetchForTest(
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { question: null } }),
      })) as unknown as typeof globalThis.fetch,
    );
    expect(await fetchQuestionDetailEn('private-problem')).toBeNull();
  });

  it('fetchQuestionDetailZh hits leetcode.cn and returns translated fields', async () => {
    const calls: string[] = [];
    __setFetchForTest(
      vi.fn(async (url: unknown) => {
        calls.push(String(url));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            data: { question: { translatedTitle: '两数之和', translatedContent: '<p>样例</p>' } },
          }),
        };
      }) as unknown as typeof globalThis.fetch,
    );
    const r = await fetchQuestionDetailZh('two-sum');
    expect(calls[0]).toContain('leetcode.cn');
    expect(r?.titleZh).toBe('两数之和');
    expect(r?.contentZh).toBe('<p>样例</p>');
  });

  it('fetchOfficialSolutionZh returns markdown when present', async () => {
    __setFetchForTest(
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { solutionArticle: { content: '官方题解正文' } } }),
      })) as unknown as typeof globalThis.fetch,
    );
    const md = await fetchOfficialSolutionZh('two-sum');
    expect(md).toBe('官方题解正文');
  });
});
