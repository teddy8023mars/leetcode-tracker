import express, { type Request, type Response } from 'express';
import { makeHeartbeatAuth } from './_core/heartbeatAuth';
import { runSync } from './sync';

export function createScheduledRouter(secret: string) {
  const router = express.Router();
  router.use(makeHeartbeatAuth(secret));
  router.post('/daily-sync-lists', async (_req: Request, res: Response) => {
    const r = await runSync('daily-sync-lists').catch((e) => ({ error: (e as Error)?.message }));
    res.json(r);
  });
  router.post('/daily-sync-companies', async (_req: Request, res: Response) => {
    const r = await runSync('daily-sync-companies').catch((e) => ({
      error: (e as Error)?.message,
    }));
    res.json(r);
  });
  router.post('/daily-sync-meta', async (_req: Request, res: Response) => {
    const r = await runSync('daily-sync-meta').catch((e) => ({ error: (e as Error)?.message }));
    res.json(r);
  });
  return router;
}
