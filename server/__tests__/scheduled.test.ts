import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createScheduledRouter } from '../scheduled';

vi.mock('../sync', () => ({
  runSync: vi.fn().mockResolvedValue({ syncLogId: 42 }),
}));

import { runSync } from '../sync';

const mockedRunSync = vi.mocked(runSync);

function buildApp(secret: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/scheduled', createScheduledRouter(secret));
  return app;
}

const ENDPOINTS = ['/daily-sync-lists', '/daily-sync-companies', '/daily-sync-meta'] as const;
const SECRET = 'test-secret';

describe('scheduled endpoints', () => {
  beforeEach(() => {
    mockedRunSync.mockResolvedValue({ syncLogId: 42 });
  });

  describe('auth: rejects requests without valid heartbeat secret', () => {
    it.each(ENDPOINTS)('POST %s returns 401 when no secret header', async (endpoint) => {
      const app = buildApp(SECRET);
      const res = await request(app).post(`/api/scheduled${endpoint}`);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: 'invalid heartbeat secret' });
    });

    it.each(ENDPOINTS)('POST %s returns 401 when secret header is wrong', async (endpoint) => {
      const app = buildApp(SECRET);
      const res = await request(app)
        .post(`/api/scheduled${endpoint}`)
        .set('x-heartbeat-secret', 'wrong-secret');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: 'invalid heartbeat secret' });
    });
  });

  describe('auth: accepts requests with correct heartbeat secret', () => {
    it.each(ENDPOINTS)('POST %s returns 200 with sync result', async (endpoint) => {
      const app = buildApp(SECRET);
      const res = await request(app)
        .post(`/api/scheduled${endpoint}`)
        .set('x-heartbeat-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ syncLogId: 42 });
    });
  });

  describe('dev mode: allows all when secret is empty', () => {
    it.each(ENDPOINTS)('POST %s returns 200 without any secret header', async (endpoint) => {
      const app = buildApp('');
      const res = await request(app).post(`/api/scheduled${endpoint}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ syncLogId: 42 });
    });
  });

  describe('error handling: returns error JSON when sync throws', () => {
    it.each(ENDPOINTS)('POST %s returns error JSON on sync failure', async (endpoint) => {
      mockedRunSync.mockRejectedValueOnce(new Error('sync boom'));
      const app = buildApp(SECRET);
      const res = await request(app)
        .post(`/api/scheduled${endpoint}`)
        .set('x-heartbeat-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ error: 'sync boom' });
    });
  });

  describe('endpoint delegation: each endpoint calls runSync with the correct sync type', () => {
    it('POST /daily-sync-lists calls runSync with "daily-sync-lists"', async () => {
      const app = buildApp(SECRET);
      await request(app)
        .post('/api/scheduled/daily-sync-lists')
        .set('x-heartbeat-secret', SECRET);
      expect(mockedRunSync).toHaveBeenCalledWith('daily-sync-lists');
    });

    it('POST /daily-sync-companies calls runSync with "daily-sync-companies"', async () => {
      const app = buildApp(SECRET);
      await request(app)
        .post('/api/scheduled/daily-sync-companies')
        .set('x-heartbeat-secret', SECRET);
      expect(mockedRunSync).toHaveBeenCalledWith('daily-sync-companies');
    });

    it('POST /daily-sync-meta calls runSync with "daily-sync-meta"', async () => {
      const app = buildApp(SECRET);
      await request(app)
        .post('/api/scheduled/daily-sync-meta')
        .set('x-heartbeat-secret', SECRET);
      expect(mockedRunSync).toHaveBeenCalledWith('daily-sync-meta');
    });
  });
});
