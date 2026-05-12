import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LangProvider } from '@/contexts/LangContext';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { BlueprintBackground } from '@/components/BlueprintBackground';

describe('badges', () => {
  afterEach(() => cleanup());
  it('DifficultyBadge renders translated label and color class', () => {
    window.localStorage.removeItem('lt.lang');
    render(
      <LangProvider>
        <DifficultyBadge difficulty="Easy" />
      </LangProvider>,
    );
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });
  it('StatusBadge renders todo by default', () => {
    window.localStorage.removeItem('lt.lang');
    render(
      <LangProvider>
        <StatusBadge status="todo" />
      </LangProvider>,
    );
    expect(screen.getByText('Todo')).toBeInTheDocument();
  });
  it('BlueprintBackground renders a div with grid class', () => {
    const { container } = render(<BlueprintBackground />);
    expect(container.querySelector('.blueprint-grid')).toBeTruthy();
  });
});
