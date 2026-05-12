import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { AppShell } from '@/components/AppShell';

describe('AppShell', () => {
  afterEach(() => cleanup());
  it('renders nav items and children', () => {
    window.localStorage.removeItem('lt.lang');
    render(
      <LangProvider>
        <AppShell>
          <div>child</div>
        </AppShell>
      </LangProvider>,
    );
    expect(screen.getByText('Problems')).toBeInTheDocument();
    expect(screen.getByText('Lists')).toBeInTheDocument();
    expect(screen.getByText('Companies')).toBeInTheDocument();
    expect(screen.getByText('Sync')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
  });
  it('renders the blueprint background', () => {
    const { container } = render(
      <LangProvider>
        <AppShell>
          <div>x</div>
        </AppShell>
      </LangProvider>,
    );
    expect(container.querySelector('.blueprint-grid')).toBeTruthy();
  });
});
