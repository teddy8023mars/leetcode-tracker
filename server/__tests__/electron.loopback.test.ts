import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const listen = vi.hoisted(() => vi.fn());

vi.mock('http', () => ({
  createServer: vi.fn(() => ({
    listen: (...args: unknown[]) => {
      listen(...args);
      const callback = args.find((arg) => typeof arg === 'function') as (() => void) | undefined;
      callback?.();
    },
  })),
}));

import { startServer } from '../../electron/server-entry';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  listen.mockClear();
});

describe('desktop server network boundary', () => {
  it('listens only on the loopback interface', async () => {
    const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leetcode-tracker-static-'));
    temporaryDirectories.push(staticDir);
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html>');

    await startServer({ staticDir, preferredPort: 43127 });

    expect(listen).toHaveBeenCalledWith(43127, '127.0.0.1', expect.any(Function));
  });
});
