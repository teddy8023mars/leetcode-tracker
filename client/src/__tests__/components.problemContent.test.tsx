import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ProblemContent } from '@/components/ProblemContent';

describe('ProblemContent', () => {
  afterEach(() => cleanup());
  it('strips script tags', () => {
    const { container } = render(
      <ProblemContent html='<p>hi</p><script>alert(1)</script>' />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('hi');
  });
  it('renders <p> and <pre>', () => {
    const { container } = render(<ProblemContent html='<p>x</p><pre>code</pre>' />);
    expect(container.querySelector('p')).toBeTruthy();
    expect(container.querySelector('pre')).toBeTruthy();
  });
});
