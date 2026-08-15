import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeLeetcodeCn, __setProbeFetchForTest } from '../sync/index';

describe('sync/probeLeetcodeCn', () => {
  beforeEach(() => __setProbeFetchForTest(undefined));

  it('returns available=true when 2 of 3 succeed', async () => {
    let i = 0;
    __setProbeFetchForTest(
      vi.fn(async () => {
        i++;
        return i === 1
          ? ({ ok: false, status: 503 } as unknown as Response)
          : ({
              ok: true,
              status: 200,
              text: async () => JSON.stringify({ data: { question: { translatedTitle: 'x' } } }),
            } as unknown as Response);
      }) as unknown as typeof globalThis.fetch,
    );
    const r = await probeLeetcodeCn();
    expect(r.available).toBe(true);
  });

  it('returns available=false when 2 of 3 fail', async () => {
    let i = 0;
    __setProbeFetchForTest(
      vi.fn(async () => {
        i++;
        return i === 3
          ? ({
              ok: true,
              status: 200,
              text: async () => JSON.stringify({ data: { question: { translatedTitle: 'x' } } }),
            } as unknown as Response)
          : ({ ok: false, status: 503 } as unknown as Response);
      }) as unknown as typeof globalThis.fetch,
    );
    const r = await probeLeetcodeCn();
    expect(r.available).toBe(false);
  });
});
