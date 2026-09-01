import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setFetchForTest, fetchQuestionCatalogEntry } from '../sync/leetcode';

describe('sync/leetcode/fetchQuestionCatalogEntry', () => {
  beforeEach(() => __setFetchForTest(undefined));

  it('maps a complete catalog entry from the LeetCode question response', async () => {
    __setFetchForTest(
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              question: {
                questionFrontendId: '376',
                titleSlug: 'wiggle-subsequence',
                title: 'Wiggle Subsequence',
                translatedTitle: '摆动序列',
                difficulty: 'MEDIUM',
                isPaidOnly: false,
                content: '<p>...</p>',
                translatedContent: '<p>……</p>',
                hints: ['Track direction changes.'],
                exampleTestcases: '1,7,4,9,2,5',
                topicTags: [{ slug: 'dynamic-programming', name: 'Dynamic Programming' }],
                similarQuestions: '[{"title":"Longest"}]',
                codeSnippets: [{ lang: 'TypeScript', langSlug: 'typescript', code: 'function wiggleMaxLength() {}' }],
              },
            },
          }),
      })) as unknown as typeof globalThis.fetch,
    );

    expect(await fetchQuestionCatalogEntry('wiggle-subsequence')).toEqual(
      expect.objectContaining({
        frontendId: 376,
        titleSlug: 'wiggle-subsequence',
        titleEn: 'Wiggle Subsequence',
        titleZh: '摆动序列',
        difficulty: 'Medium',
        paidOnly: false,
        contentEn: '<p>...</p>',
        codeSnippetsJson: expect.any(Array),
      }),
    );
  });

  it('returns null when LeetCode does not expose the requested question', async () => {
    __setFetchForTest(
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { question: null } }),
      })) as unknown as typeof globalThis.fetch,
    );

    await expect(fetchQuestionCatalogEntry('private-problem')).resolves.toBeNull();
  });
});
