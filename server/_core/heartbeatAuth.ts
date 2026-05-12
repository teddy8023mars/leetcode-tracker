import type { Request, Response, NextFunction } from 'express';

export function makeHeartbeatAuth(secret: string) {
  return function heartbeatAuth(req: Request, res: Response, next: NextFunction) {
    if (!secret) {
      console.warn('[heartbeatAuth] HEARTBEAT_SECRET is empty — allowing all (dev mode only)');
      return next();
    }
    const got = req.headers['x-heartbeat-secret'];
    if (typeof got === 'string' && got === secret) return next();
    res.status(401).json({ error: 'invalid heartbeat secret' });
  };
}
