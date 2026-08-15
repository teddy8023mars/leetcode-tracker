import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchListProblems, __setFetchForTest } from '../sync/leetcode';

describe('sync/leetcode/fetchListProblems', () => {
  beforeEach(() => __setFetchForTest(undefined));

  it('returns parsed list problems for hot-100', async () => {
    __setFetchForTest(
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: {
            studyPlanV2Detail: {
              name: 'Hot 100',
              slug: 'top-100-liked',
              planSubGroups: [
                {
                  questions: [
                    {
                      titleSlug: 'two-sum',
                      questionFrontendId: '1',
                      title: 'Two Sum',
                      difficulty: 'EASY',
                      paidOnly: false,
                    },
                    {
                      titleSlug: 'add-two-numbers',
                      questionFrontendId: '2',
                      title: 'Add Two Numbers',
                      difficulty: 'MEDIUM',
                      paidOnly: false,
                    },
                  ],
                },
              ],
            },
          },
        }),
      })) as unknown as typeof globalThis.fetch,
    );
    const result = await fetchListProblems('top-100-liked-questions');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ titleSlug: 'two-sum', frontendId: 1, difficulty: 'Easy' });
    expect(result[1].difficulty).toBe('Medium');
  });

  it('retries on 5xx then throws after 3 attempts', async () => {
    const calls = vi.fn(async () => ({ ok: false, status: 503 }));
    __setFetchForTest(calls as unknown as typeof globalThis.fetch);
    await expect(fetchListProblems('top-100-liked-questions')).rejects.toThrow(/RetryExhausted|503/);
    expect(calls).toHaveBeenCalledTimes(3);
  }, 15000);
});
