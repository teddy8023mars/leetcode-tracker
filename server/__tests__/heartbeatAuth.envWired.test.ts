import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { makeHeartbeatAuth } from '../_core/heartbeatAuth';
import { scheduledEndpointSyncTypes } from '../scheduled';

const TEST_HEARTBEAT_SECRET = 'test-heartbeat-secret';

function callAuth(got?: string) {
  const next = vi.fn() as unknown as NextFunction;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const headers = got === undefined ? {} : { 'x-heartbeat-secret': got };
  const req = { headers } as unknown as Request;

  makeHeartbeatAuth(TEST_HEARTBEAT_SECRET)(req, res, next);

  return { next, status };
}

describe('HEARTBEAT_SECRET wiring assumptions', () => {
  it('uses a non-empty test heartbeat secret', () => {
    expect(TEST_HEARTBEAT_SECRET.length).toBeGreaterThan(0);
  });

  it('has scheduled endpoints wired to heartbeat-protected sync types', () => {
    expect(scheduledEndpointSyncTypes).toEqual({
      '/daily-sync-lists': 'daily-sync-lists',
      '/daily-sync-companies': 'daily-sync-companies',
      '/daily-sync-meta': 'daily-sync-meta',
    });
  });

  it('rejects scheduled requests without the secret header', () => {
    const auth = callAuth();
    expect(auth.status).toHaveBeenCalledWith(401);
    expect(auth.next).not.toHaveBeenCalled();
  });

  it('accepts scheduled requests with the matching secret header', () => {
    const auth = callAuth(TEST_HEARTBEAT_SECRET);
    expect(auth.next).toHaveBeenCalledOnce();
    expect(auth.status).not.toHaveBeenCalled();
  });
});
