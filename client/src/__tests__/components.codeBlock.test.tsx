import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CodeBlock } from '@/components/CodeBlock';

describe('CodeBlock', () => {
  afterEach(() => cleanup());
  it('renders fallback <pre> immediately while shiki loads', () => {
    render(<CodeBlock language="python" code="print('hi')" />);
    expect(screen.getByText("print('hi')")).toBeInTheDocument();
  });
});
