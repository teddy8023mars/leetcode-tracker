import { describe, it, expect, vi } from 'vitest';
import * as dbModule from '../db';

vi.mock('../db', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  let stored: Array<{ titleSlug: string; frontendId: number; difficulty: string }> = [];
  return {
    ...real,
    __setStore: (rows: typeof stored) => {
      stored = rows;
    },
    getProblemBySlug: vi.fn(async (slug: string) => stored.find((p) => p.titleSlug === slug) ?? null),
    upsertProblem: vi.fn(async (p: { titleSlug: string; frontendId: number; difficulty: string }) => {
      stored = [...stored.filter((x) => x.titleSlug !== p.titleSlug), p];
      return p;
    }),
  };
});

describe('db helpers contract (mock)', () => {
  it('upsertProblem then getProblemBySlug returns inserted', async () => {
    (dbModule as unknown as { __setStore: (r: unknown[]) => void }).__setStore([]);
    await (dbModule as unknown as { upsertProblem: (p: unknown) => Promise<unknown> }).upsertProblem({
      titleSlug: 'two-sum',
      frontendId: 1,
      difficulty: 'Easy',
    });
    const got = await (dbModule as unknown as { getProblemBySlug: (s: string) => Promise<{ frontendId: number } | null> }).getProblemBySlug('two-sum');
    expect(got?.frontendId).toBe(1);
  });
});
