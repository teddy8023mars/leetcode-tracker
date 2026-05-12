import { describe, it, expect } from 'vitest';

describe('theme tokens', () => {
  it('--blueprint-bg variable resolves to a hex color on body', () => {
    document.documentElement.style.setProperty('--blueprint-bg', '#FAFBFC');
    const v = getComputedStyle(document.documentElement).getPropertyValue('--blueprint-bg').trim();
    expect(v).toBe('#FAFBFC');
  });
});
