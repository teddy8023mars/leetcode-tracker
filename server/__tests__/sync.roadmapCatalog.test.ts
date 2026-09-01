import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRoadmapTitleFallback } from '../roadmaps/catalog';
import { __setFetchForTest, fetchQuestionCatalogEntry } from '../sync/leetcode';

describe('sync/leetcode/fetchQuestionCatalogEntry', () => {
  beforeEach(() => __setFetchForTest(undefined));

  it('keeps a null source translation and uses the approved roadmap title as a catalog fallback', async () => {
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
                translatedTitle: null,
                difficulty: 'MEDIUM',
                isPaidOnly: false,
                content: '<p>...</p>',
                translatedContent: null,
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

    const entry = await fetchQuestionCatalogEntry('wiggle-subsequence');
    expect(entry).toEqual(
      expect.objectContaining({
        frontendId: 376,
        titleSlug: 'wiggle-subsequence',
        titleEn: 'Wiggle Subsequence',
        titleZh: null,
        difficulty: 'Medium',
        paidOnly: false,
        contentEn: '<p>...</p>',
        codeSnippetsJson: expect.any(Array),
      }),
    );
    expect(applyRoadmapTitleFallback(entry!, { titleZh: '贪心算法：376.摆动序列' })).toEqual(
      expect.objectContaining({ titleZh: '摆动序列' }),
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
