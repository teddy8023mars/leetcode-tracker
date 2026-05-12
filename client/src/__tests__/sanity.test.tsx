import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('client test infra', () => {
  it('renders a span', () => {
    render(<span data-testid="ok">hello</span>);
    expect(screen.getByTestId('ok').textContent).toBe('hello');
  });
});
