import type { HighlighterCore } from 'shiki/core';

let _highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  if (!_highlighterPromise) {
    _highlighterPromise = (async () => {
      const { createHighlighterCore } = await import('shiki/core');
      const { createOnigurumaEngine } = await import('shiki/engine/oniguruma');
      const [py, java, cpp, githubLight, githubDark] = await Promise.all([
        import('shiki/langs/python.mjs').then((m) => m.default),
        import('shiki/langs/java.mjs').then((m) => m.default),
        import('shiki/langs/cpp.mjs').then((m) => m.default),
        import('shiki/themes/github-light.mjs').then((m) => m.default),
        import('shiki/themes/github-dark.mjs').then((m) => m.default),
      ]);
      return createHighlighterCore({
        themes: [githubLight, githubDark],
        langs: [py, java, cpp],
        engine: createOnigurumaEngine(import('shiki/wasm')),
      });
    })();
  }
  return _highlighterPromise;
}
