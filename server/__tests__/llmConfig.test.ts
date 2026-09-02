import { describe, it, expect, afterEach } from 'vitest';
import { LLM_NOT_CONFIGURED_ERR } from '@shared/const';
import { isLlmConfigured } from '../_core/env';
import { invokeLLM } from '../_core/llm';
import { generateTestcaseSuite } from '../judge/testcaseGenerator';

const ORIGINAL_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const ORIGINAL_DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
  else process.env.BUILT_IN_FORGE_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_DEEPSEEK_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = ORIGINAL_DEEPSEEK_KEY;
});

describe('isLlmConfigured', () => {
  it('is false with no key', () => {
    delete process.env.BUILT_IN_FORGE_API_KEY;
    expect(isLlmConfigured()).toBe(false);
  });

  it('is false for the placeholder key shipped in desktop builds up to 1.2.3', () => {
    process.env.BUILT_IN_FORGE_API_KEY = 'unused';
    expect(isLlmConfigured()).toBe(false);
  });

  it('is false for whitespace', () => {
    process.env.BUILT_IN_FORGE_API_KEY = '   ';
    expect(isLlmConfigured()).toBe(false);
  });

  it('is true for a real key', () => {
    process.env.BUILT_IN_FORGE_API_KEY = 'sk-abc123';
    expect(isLlmConfigured()).toBe(true);
  });

  it('is true for the legacy DeepSeek key name', () => {
    delete process.env.BUILT_IN_FORGE_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    expect(isLlmConfigured()).toBe(true);
  });
});

describe('LLM calls without a key', () => {
  it('invokeLLM refuses instead of sending a request', async () => {
    process.env.BUILT_IN_FORGE_API_KEY = 'unused';
    await expect(
      invokeLLM({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(LLM_NOT_CONFIGURED_ERR);
  });

  it('testcase generation reports the missing key rather than inventing cases', async () => {
    delete process.env.BUILT_IN_FORGE_API_KEY;
    await expect(
      generateTestcaseSuite({
        titleSlug: 'two-sum',
        titleEn: 'Two Sum',
        contentEn: '<p>Given an array…</p>',
        contentZh: null,
        difficulty: 'easy',
        codeSnippetsJson: [
          {
            langSlug: 'python3',
            code: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:',
          },
        ],
        exampleTestcases: '[2,7,11,15]\n9',
      }),
    ).rejects.toThrow(LLM_NOT_CONFIGURED_ERR);
  });
});
