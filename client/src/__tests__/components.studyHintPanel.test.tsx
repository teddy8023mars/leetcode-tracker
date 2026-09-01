import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LangProvider } from '@/contexts/LangContext';
import { StudyHintPanel } from '@/components/StudyHintPanel';

describe('StudyHintPanel', () => {
  afterEach(() => cleanup());

  it('reveals exactly one additional hint at a time', async () => {
    window.localStorage.removeItem('lt.lang');
    render(
      <LangProvider>
        <StudyHintPanel hints={['Name the invariant.', 'Store complements.', 'Check before insert.']} completed={false} />
      </LangProvider>,
    );

    expect(screen.queryByText('Name the invariant.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reveal hint 1' }));
    expect(screen.getByText('Name the invariant.')).toBeInTheDocument();
    expect(screen.queryByText('Store complements.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reveal hint 2' }));
    expect(screen.getByText('Store complements.')).toBeInTheDocument();
    expect(screen.queryByText('Check before insert.')).not.toBeInTheDocument();
  });

  it('offers a return to Today after the study problem is complete', () => {
    render(
      <LangProvider>
        <StudyHintPanel hints={['One', 'Two', 'Three']} completed />
      </LangProvider>,
    );
    expect(screen.getByRole('link', { name: 'Return to Today' })).toHaveAttribute('href', '/today');
  });
});
