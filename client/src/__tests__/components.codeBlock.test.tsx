import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CodeBlock } from '@/components/CodeBlock';
import { ThemeProvider } from '@/contexts/ThemeContext';

describe('CodeBlock', () => {
  afterEach(() => cleanup());
  it('renders fallback <pre> immediately while shiki loads', () => {
    render(
      <ThemeProvider>
        <CodeBlock language="python" code="print('hi')" />
      </ThemeProvider>,
    );
    expect(screen.getByText("print('hi')")).toBeInTheDocument();
  });
});
