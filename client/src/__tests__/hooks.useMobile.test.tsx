import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/useMobile';

let listeners: Array<() => void> = [];
let originalMatchMedia: typeof window.matchMedia;
let originalInnerWidth: number;

beforeEach(() => {
  listeners = [];
  originalMatchMedia = window.matchMedia;
  originalInnerWidth = window.innerWidth;

  window.matchMedia = vi.fn().mockImplementation(() => ({
    addEventListener: (_event: string, cb: () => void) => {
      listeners.push(cb);
    },
    removeEventListener: (_event: string, cb: () => void) => {
      listeners = listeners.filter((l) => l !== cb);
    },
  }));
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, 'innerWidth', {
    value: originalInnerWidth,
    writable: true,
  });
});

describe('useIsMobile', () => {
  it('returns true when window.innerWidth < 768', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when window.innerWidth >= 768', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when media query change event fires', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      listeners.forEach((cb) => cb());
    });

    expect(result.current).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners).toHaveLength(1);

    unmount();

    expect(listeners).toHaveLength(0);
  });
});
