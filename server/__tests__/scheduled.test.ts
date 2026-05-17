import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { makeHeartbeatAuth } from '../_core/heartbeatAuth';
import {
  runScheduledEndpoint,
  scheduledEndpointSyncTypes,
  type ScheduledEndpointPath,
} from '../scheduled';

vi.mock('../sync', () => ({
  runSync: vi.fn().mockResolvedValue({ syncLogId: 42 }),
}));

import { runSync } from '../sync';

const mockedRunSync = vi.mocked(runSync);

const ENDPOINTS = Object.keys(scheduledEndpointSyncTypes) as ScheduledEndpointPath[];
const SECRET = 'test-secret';

function callAuth(secret: string, got?: string) {
  const next = vi.fn() as unknown as NextFunction;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const headers = got === undefined ? {} : { 'x-heartbeat-secret': got };
  const req = { headers } as unknown as Request;

  makeHeartbeatAuth(secret)(req, res, next);

  return { next, status, json };
}

describe('scheduled endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRunSync.mockResolvedValue({ syncLogId: 42 });
  });

  describe('auth middleware', () => {
    it('rejects requests without a valid heartbeat secret', () => {
      const missing = callAuth(SECRET);
      expect(missing.status).toHaveBeenCalledWith(401);
      expect(missing.json).toHaveBeenCalledWith({ error: 'invalid heartbeat secret' });
      expect(missing.next).not.toHaveBeenCalled();

      const wrong = callAuth(SECRET, 'wrong-secret');
      expect(wrong.status).toHaveBeenCalledWith(401);
      expect(wrong.json).toHaveBeenCalledWith({ error: 'invalid heartbeat secret' });
      expect(wrong.next).not.toHaveBeenCalled();
    });

    it('accepts requests with the correct heartbeat secret', () => {
      const auth = callAuth(SECRET, SECRET);
      expect(auth.next).toHaveBeenCalledOnce();
      expect(auth.status).not.toHaveBeenCalled();
    });

    it('allows all requests when secret is empty in dev mode', () => {
      const auth = callAuth('');
      expect(auth.next).toHaveBeenCalledOnce();
      expect(auth.status).not.toHaveBeenCalled();
    });
  });

  describe('dispatch helper', () => {
    it.each(ENDPOINTS)('%s returns the sync result', async (endpoint) => {
      await expect(runScheduledEndpoint(endpoint)).resolves.toEqual({ syncLogId: 42 });
    });

    it.each(ENDPOINTS)('%s returns error JSON when sync throws', async (endpoint) => {
      mockedRunSync.mockRejectedValueOnce(new Error('sync boom'));
      await expect(runScheduledEndpoint(endpoint)).resolves.toEqual({ error: 'sync boom' });
    });

    it.each(ENDPOINTS)('%s calls runSync with the configured sync type', async (endpoint) => {
      await runScheduledEndpoint(endpoint);
      expect(mockedRunSync).toHaveBeenCalledWith(scheduledEndpointSyncTypes[endpoint]);
    });
  });
});
