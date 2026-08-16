import express from 'express';
import { createServer } from 'http';
import net from 'net';
import path from 'path';
import fs from 'fs';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { registerOAuthRoutes } from '../server/_core/oauth';
import { registerStorageProxy } from '../server/_core/storageProxy';
import { appRouter } from '../server/routers';
import { createContext } from '../server/_core/context';
import { createScheduledRouter } from '../server/scheduled';

/**
 * Production-only server entry for the desktop app. Mirrors
 * server/_core/index.ts minus the Vite dev-middleware import, so the whole
 * server (dependencies included) can be bundled into one self-contained file.
 */

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(port, () => probe.close(() => resolve(true)));
    probe.on('error', () => resolve(false));
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function startServer(opts: {
  staticDir: string;
  preferredPort: number;
}): Promise<number> {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use('/api/scheduled', createScheduledRouter(process.env.HEARTBEAT_SECRET ?? ''));
  app.use(
    '/api/trpc',
    createExpressMiddleware({ router: appRouter, createContext }),
  );

  if (!fs.existsSync(opts.staticDir)) {
    throw new Error(`Static assets not found at ${opts.staticDir}`);
  }
  app.use(express.static(opts.staticDir));
  app.use('*', (_req, res) => {
    res.sendFile(path.resolve(opts.staticDir, 'index.html'));
  });

  const port = await findAvailablePort(opts.preferredPort);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`[desktop] server running on http://localhost:${port}/`);
  return port;
}
