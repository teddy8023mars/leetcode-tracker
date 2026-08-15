import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SolutionTabs } from '@/components/SolutionTabs';
import { LangProvider } from '@/contexts/LangContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

afterEach(cleanup);

function wrap(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <LangProvider>{ui}</LangProvider>
    </ThemeProvider>,
  );
}

describe('SolutionTabs', () => {
  it('exposes one tab per language and only the active tab is selected (regression: BUG-10)', async () => {
    wrap(
      <SolutionTabs
        codeSnippets={[
          { lang: 'Python', langSlug: 'python3', code: 'PY_CODE' },
          { lang: 'Java', langSlug: 'java', code: 'JAVA_CODE' },
          { lang: 'C++', langSlug: 'cpp', code: 'CPP_CODE' },
        ]}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    // Default = first tab (Python) active
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('aria-selected')).toBe('false');

    // Click Java
    const user = userEvent.setup();
    await user.click(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
  });

  it('shows empty state when no snippets provided', () => {
    wrap(<SolutionTabs codeSnippets={[]} />);
    const empties = screen.queryAllByText(/no data|暂无数据/i);
    expect(empties.length).toBeGreaterThan(0);
  });
});
