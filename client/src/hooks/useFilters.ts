import { useCallback, useState } from 'react';

export type FilterValue = string | boolean | undefined;
export type FilterMap = Record<string, FilterValue>;

export function useFilters(opts: { defaults: FilterMap }) {
  const [filters, setFilters] = useState<FilterMap>(opts.defaults);

  const setFilter = useCallback((key: string, value: FilterValue) => {
    setFilters((prev) => {
      if (prev[key] === value) return prev;
      const next = { ...prev };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const reset = useCallback(() => setFilters(opts.defaults), [opts.defaults]);

  return { filters, setFilter, reset };
}
