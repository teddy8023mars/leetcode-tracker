import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createScheduledRouter } from '../scheduled';

describe('HEARTBEAT_SECRET env wiring', () => {
  it('is non-empty in dev', () => {
    expect((process.env.HEARTBEAT_SECRET ?? '').length).toBeGreaterThan(0);
  });

  it('rejects /api/scheduled/* without the secret header', async () => {
    const app = express();
    app.use('/api/scheduled', createScheduledRouter(process.env.HEARTBEAT_SECRET ?? ''));
    const res = await request(app).post('/api/scheduled/daily-sync-meta').send({});
    expect(res.status).toBe(401);
  });

  it('accepts /api/scheduled/* with the matching secret header', async () => {
    const app = express();
    app.use('/api/scheduled', createScheduledRouter(process.env.HEARTBEAT_SECRET ?? ''));
    const res = await request(app)
      .post('/api/scheduled/daily-sync-meta')
      .set('x-heartbeat-secret', process.env.HEARTBEAT_SECRET ?? '')
      .send({});
    // even if the underlying task is a stub, the auth middleware must let it through
    expect(res.status).not.toBe(401);
  });
});
