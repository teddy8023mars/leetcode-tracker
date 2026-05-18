import { describe, it, expect, afterEach } from 'vitest';
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
});
