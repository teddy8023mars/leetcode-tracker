import { describe, it, expect } from 'vitest';
import {
  COMPANIES,
  COMPANY_SLUG_MAP,
  LEETCODE_US_GRAPHQL,
  LEETCODE_CN_GRAPHQL,
  LIQUIDSLR_REPO_RAW,
} from '../sync/constants';

describe('sync/constants', () => {
  it('has 25 companies', () => {
    expect(COMPANIES).toHaveLength(25);
    expect(COMPANIES.find((c) => c.slug === 'google')?.name).toBe('Google');
  });
  it('maps liquidslr directory names to canonical slug', () => {
    expect(COMPANY_SLUG_MAP['Google']).toBe('google');
    expect(COMPANY_SLUG_MAP['ByteDance']).toBe('bytedance');
    expect(COMPANY_SLUG_MAP['Microsoft']).toBe('microsoft');
  });
  it('exposes the 3 base URLs', () => {
    expect(LEETCODE_US_GRAPHQL).toBe('https://leetcode.com/graphql');
    expect(LEETCODE_CN_GRAPHQL).toBe('https://leetcode.cn/graphql');
    expect(LIQUIDSLR_REPO_RAW).toContain('raw.githubusercontent.com/liquidslr/');
  });
});
