import { describe, it, expect } from 'vitest';
import { sm2 } from '../progress/sm2';

describe('sm2', () => {
  it('first successful review: interval=1, repetition=1', () => {
    const result = sm2({ quality: 4, repetition: 0, interval: 0, easinessFactor: 2.5 });
    expect(result.interval).toBe(1);
    expect(result.repetition).toBe(1);
  });

  it('second successful review: interval=3, repetition=2', () => {
    const result = sm2({ quality: 4, repetition: 1, interval: 1, easinessFactor: 2.5 });
    expect(result.interval).toBe(3);
    expect(result.repetition).toBe(2);
  });

  it('third+ successful review: interval = round(prev * EF)', () => {
    const result = sm2({ quality: 4, repetition: 2, interval: 3, easinessFactor: 2.5 });
    expect(result.interval).toBe(8);
    expect(result.repetition).toBe(3);
  });

  it('quality < 3 resets repetition to 0 and interval to 1', () => {
    const result = sm2({ quality: 2, repetition: 5, interval: 30, easinessFactor: 2.5 });
    expect(result.interval).toBe(1);
    expect(result.repetition).toBe(0);
  });

  it('EF never drops below 1.3', () => {
    const result = sm2({ quality: 0, repetition: 3, interval: 10, easinessFactor: 1.3 });
    expect(result.easinessFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('quality=5 increases EF', () => {
    const result = sm2({ quality: 5, repetition: 2, interval: 3, easinessFactor: 2.5 });
    expect(result.easinessFactor).toBeGreaterThan(2.5);
  });

  it('quality=3 slightly decreases EF', () => {
    const result = sm2({ quality: 3, repetition: 2, interval: 3, easinessFactor: 2.5 });
    expect(result.easinessFactor).toBeLessThan(2.5);
  });
});
