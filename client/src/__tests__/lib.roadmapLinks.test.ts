import { describe, expect, it } from 'vitest';

import { roadmapProblemHref, safeExternalRoadmapUrl } from '@/lib/roadmapLinks';

describe('roadmap links', () => {
  it('builds a local problem link with roadmap context', () => {
    expect(roadmapProblemHref('code-thinking', 'array', {
      position: 2,
      localProblem: { titleSlug: 'binary-search' },
    })).toBe('/problems/binary-search?roadmap=code-thinking&section=array&step=2');
  });

  it('accepts only HTTPS URLs from explicitly allowed hosts', () => {
    expect(safeExternalRoadmapUrl('https://programmercarl.com/0704.html', ['programmercarl.com']))
      .toBe('https://programmercarl.com/0704.html');
    expect(safeExternalRoadmapUrl('http://programmercarl.com/0704.html', ['programmercarl.com'])).toBeNull();
    expect(safeExternalRoadmapUrl('https://evil.example/phish', ['programmercarl.com'])).toBeNull();
  });
});
