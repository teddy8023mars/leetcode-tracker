import express, { type Request, type Response } from 'express';
import { makeHeartbeatAuth } from './_core/heartbeatAuth';
import { runSync } from './sync';
import type { SyncType } from '@shared/problemTypes';

export const scheduledEndpointSyncTypes = {
  '/daily-sync-lists': 'daily-sync-lists',
  '/daily-sync-companies': 'daily-sync-companies',
  '/daily-sync-meta': 'daily-sync-meta',
} as const satisfies Record<string, SyncType>;

export type ScheduledEndpointPath = keyof typeof scheduledEndpointSyncTypes;

export async function runScheduledEndpoint(endpoint: ScheduledEndpointPath) {
  const syncType = scheduledEndpointSyncTypes[endpoint];
  return await runSync(syncType).catch((e) => ({ error: (e as Error)?.message }));
}

export function createScheduledRouter(secret: string) {
  const router = express.Router();
  router.use(makeHeartbeatAuth(secret));
  for (const endpoint of Object.keys(scheduledEndpointSyncTypes) as ScheduledEndpointPath[]) {
    router.post(endpoint, async (_req: Request, res: Response) => {
      res.json(await runScheduledEndpoint(endpoint));
    });
  }
  return router;
}
