import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_core/llm', () => ({ invokeLLM: vi.fn() }));

import { invokeLLM } from '../_core/llm';
import { generateTestcaseSuite } from '../judge/testcaseGenerator';

describe('generateTestcaseSuite provider compatibility', () => {
  beforeEach(() => {
    vi.mocked(invokeLLM).mockReset();
  });

  it('requests the portable JSON object response format', async () => {
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          methodName: 'twoSum',
          cases: [{ input: [[2, 7, 11, 15], 9], expected: [0, 1] }],
        }) } }],
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]' } }],
      } as never);

    await generateTestcaseSuite({
      titleSlug: 'two-sum',
      titleEn: 'Two Sum',
      contentEn: '<p>Return two indices.</p>',
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass',
      }],
      exampleTestcases: '[2,7,11,15]\n9',
    });

    expect(vi.mocked(invokeLLM).mock.calls[0]?.[0].responseFormat).toEqual({
      type: 'json_object',
    });
  });
});
