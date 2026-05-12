import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { LangProvider, useT, useLang } from '@/contexts/LangContext';

function Probe() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div>
      <span data-testid="title">{t('nav.problems')}</span>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang('zh')}>switch</button>
    </div>
  );
}

describe('i18n', () => {
  afterEach(() => cleanup());
  it('defaults to en and translates', () => {
    window.localStorage.removeItem('lt.lang');
    render(
      <LangProvider>
        <Probe />
      </LangProvider>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(screen.getByTestId('title').textContent).toBe('Problems');
  });
  it('switches to zh', async () => {
    render(
      <LangProvider>
        <Probe />
      </LangProvider>,
    );
    await act(async () => {
      screen.getByText('switch').click();
    });
    expect(screen.getByTestId('title').textContent).toBe('题目');
  });
});
