import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilters } from '@/hooks/useFilters';

describe('useFilters', () => {
  it('initializes from defaults', () => {
    const { result } = renderHook(() => useFilters({ defaults: { difficulty: 'Easy' } }));
    expect(result.current.filters.difficulty).toBe('Easy');
  });
  it('setFilter updates state and same-value calls keep identity', () => {
    const { result } = renderHook(() => useFilters({ defaults: {} }));
    act(() => result.current.setFilter('difficulty', 'Medium'));
    expect(result.current.filters.difficulty).toBe('Medium');
    const a = result.current.filters;
    act(() => result.current.setFilter('difficulty', 'Medium'));
    const b = result.current.filters;
    expect(a).toBe(b);
  });
  it('reset restores defaults', () => {
    const { result } = renderHook(() => useFilters({ defaults: { difficulty: 'Easy' } }));
    act(() => result.current.setFilter('difficulty', 'Hard'));
    act(() => result.current.reset());
    expect(result.current.filters.difficulty).toBe('Easy');
  });
});
