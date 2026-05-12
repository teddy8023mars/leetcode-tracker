import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateContentToZh, __setLlmForTest } from '../sync/translation';

describe('sync/translation', () => {
  beforeEach(() => __setLlmForTest(undefined));

  it('returns translated HTML when LLM produces Chinese', async () => {
    __setLlmForTest(
      vi.fn(async () => ({
        choices: [{ message: { content: '<p>给定整数数组 nums。</p>' } }],
      })) as never,
    );
    const out = await translateContentToZh('<p>Given integer array nums.</p>');
    expect(out).toBe('<p>给定整数数组 nums。</p>');
  });

  it('returns null when LLM result has no Chinese chars', async () => {
    __setLlmForTest(
      vi.fn(async () => ({
        choices: [{ message: { content: 'Sorry I cannot translate.' } }],
      })) as never,
    );
    expect(await translateContentToZh('<p>x</p>')).toBeNull();
  });

  it('chunks input larger than 8000 chars at </p> boundary', async () => {
    const big = '<p>' + 'a'.repeat(7990) + '</p>' + '<p>tail</p>';
    const llm = vi.fn(async (req: { messages: { content: string }[] }) => ({
      choices: [
        {
          message: {
            content: req.messages[1].content.includes('tail') ? '<p>尾部</p>' : '<p>头部</p>',
          },
        },
      ],
    }));
    __setLlmForTest(llm as never);
    const out = await translateContentToZh(big);
    expect(out).toBe('<p>头部</p><p>尾部</p>');
    expect(llm).toHaveBeenCalledTimes(2);
  });
});
