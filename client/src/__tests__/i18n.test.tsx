import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { LangProvider, useT, useLang } from '@/contexts/LangContext';

function Probe() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div>
      <span data-testid="title">{t('nav.problems')}</span>
      <span data-testid="roadmap-nav">{t('nav.roadmap')}</span>
      <span data-testid="roadmap-title">{t('roadmap.title')}</span>
      <span data-testid="roadmap-completed">{t('roadmap.completed')}</span>
      <span data-testid="roadmap-review-first">{t('roadmap.reviewFirstChapter')}</span>
      <span data-testid="roadmap-back">{t('roadmap.back')}</span>
      <span data-testid="roadmap-external-notice">{t('roadmap.opensInBrowser')}</span>
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
    expect(screen.getByTestId('roadmap-nav').textContent).toBe('Roadmap');
    expect(screen.getByTestId('roadmap-title').textContent).toBe('Code Thinking Roadmap');
    expect(screen.getByTestId('roadmap-completed').textContent)
      .toBe('Roadmap complete. Review any chapter at your own pace.');
    expect(screen.getByTestId('roadmap-review-first').textContent).toBe('Review first chapter');
    expect(screen.getByTestId('roadmap-back').textContent).toBe('Back to roadmap');
    expect(screen.getByTestId('roadmap-external-notice').textContent).toBe('opens in system browser');
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
    expect(screen.getByTestId('roadmap-nav').textContent).toBe('学习路线');
    expect(screen.getByTestId('roadmap-completed').textContent)
      .toBe('学习路线已完成，可以按自己的节奏复习任意章节。');
    expect(screen.getByTestId('roadmap-review-first').textContent).toBe('复习第一章');
    expect(screen.getByTestId('roadmap-back').textContent).toBe('返回学习路线');
    expect(screen.getByTestId('roadmap-external-notice').textContent).toBe('将在系统浏览器中打开');
  });
});
