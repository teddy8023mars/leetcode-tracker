import { describe, it, expect, vi } from 'vitest';
import { makeHeartbeatAuth } from '../_core/heartbeatAuth';
import type { Request, Response, NextFunction } from 'express';

describe('_core/heartbeatAuth', () => {
  it('rejects requests without X-Heartbeat-Secret', () => {
    const mw = makeHeartbeatAuth('s3cret');
    const next = vi.fn() as unknown as NextFunction;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    mw({ headers: {} } as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  it('rejects on mismatch', () => {
    const mw = makeHeartbeatAuth('s3cret');
    const next = vi.fn() as unknown as NextFunction;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    mw({ headers: { 'x-heartbeat-secret': 'wrong' } } as unknown as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it('passes on match', () => {
    const mw = makeHeartbeatAuth('s3cret');
    const next = vi.fn() as unknown as NextFunction;
    mw(
      { headers: { 'x-heartbeat-secret': 's3cret' } } as unknown as Request,
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalled();
  });
  it('allows-all when secret is empty (dev mode warning)', () => {
    const mw = makeHeartbeatAuth('');
    const next = vi.fn() as unknown as NextFunction;
    mw({ headers: {} } as Request, {} as Response, next);
    expect(next).toHaveBeenCalled();
  });
});
