import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '@/hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update before delay elapses but updates after', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('initial');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('updated');
  });

  it('rapid updates only emit the final value', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'first' },
    });

    rerender({ value: 'second' });
    act(() => vi.advanceTimersByTime(100));

    rerender({ value: 'third' });
    act(() => vi.advanceTimersByTime(100));

    rerender({ value: 'final' });
    act(() => vi.advanceTimersByTime(100));

    // 300ms has passed total but the last update was only 100ms ago
    expect(result.current).toBe('first');

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('final');
  });

  it('uses 300ms as the default delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('initial');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('updated');
  });
});
