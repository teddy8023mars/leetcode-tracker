import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AppShell } from '@/components/AppShell';

describe('AppShell', () => {
  afterEach(() => cleanup());
  it('renders nav items and children', () => {
    window.localStorage.removeItem('lt.lang');
    render(
      <ThemeProvider>
        <LangProvider>
          <AppShell>
            <div>child</div>
          </AppShell>
        </LangProvider>
      </ThemeProvider>,
    );
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Problems')).toBeInTheDocument();
    expect(screen.getByText('Sync')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();

    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'Today', 'Roadmap', 'Review', 'Problems', 'Sync', 'Settings',
    ]);
  });
  it('renders the blueprint background', () => {
    const { container } = render(
      <ThemeProvider>
        <LangProvider>
          <AppShell>
            <div>x</div>
          </AppShell>
        </LangProvider>
      </ThemeProvider>,
    );
    expect(container.querySelector('.blueprint-grid')).toBeTruthy();
  });

  it.each([
    [3, 'back'],
    [4, 'forward'],
  ] as const)('uses mouse side button %s for browser %s navigation', (button, direction) => {
    const historySpy = vi.spyOn(window.history, direction).mockImplementation(() => undefined);
    render(
      <ThemeProvider>
        <LangProvider>
          <AppShell><div>x</div></AppShell>
        </LangProvider>
      </ThemeProvider>,
    );

    const event = new MouseEvent('mousedown', { button, bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(historySpy).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    historySpy.mockRestore();
  });
});
