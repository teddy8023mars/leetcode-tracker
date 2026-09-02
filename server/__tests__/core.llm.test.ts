import { afterEach, describe, expect, it, vi } from 'vitest';

describe('invokeLLM provider configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses the configured OpenAI-compatible model', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_URL', 'https://api.deepseek.com');
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', 'test-key');
    vi.stubEnv('BUILT_IN_FORGE_MODEL', 'deepseek-v4-flash');

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'response-1',
        created: 1,
        model: 'deepseek-v4-flash',
        choices: [],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { invokeLLM } = await import('../_core/llm');
    await invokeLLM({ messages: [{ role: 'user', content: 'hello' }] });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(JSON.parse(String(options.body))).toMatchObject({
      model: 'deepseek-v4-flash',
    });
  });
});
