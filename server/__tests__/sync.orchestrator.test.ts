import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSync, __setSyncDepsForTest } from '../sync/orchestrator';
import type { SyncType } from '@shared/problemTypes';

describe('sync/orchestrator/runSync', () => {
  let logs: Array<Record<string, unknown>> = [];
  let runningOfType: string | null = null;

  beforeEach(() => {
    logs = [];
    runningOfType = null;
    __setSyncDepsForTest({
      startSyncLog: vi.fn(async (t: SyncType) => {
        logs.push({ syncType: t, status: 'running' });
        return logs.length;
      }),
      finishSyncLog: vi.fn(async (id: number, patch: Record<string, unknown>) => {
        logs[id - 1] = { ...logs[id - 1], ...patch };
      }),
      findRunningSyncOfType: vi.fn(async (t: SyncType) =>
        runningOfType === t ? { id: 999 } : null,
      ),
      tasks: {
        manual: async () => ({ itemsProcessed: 1, itemsSucceeded: 1, itemsFailed: 0 }),
        'daily-sync-lists': async () => ({ itemsProcessed: 100, itemsSucceeded: 100, itemsFailed: 0 }),
        boom: async () => {
          throw new Error('boom');
        },
      } as never,
    });
  });

  it('writes a running log then a success log', async () => {
    const res = await runSync('manual');
    expect(res.syncLogId).toBe(1);
    expect(logs[0].status).toBe('success');
    expect(logs[0].itemsSucceeded).toBe(1);
  });

  it('rejects when concurrent sync of same type is running', async () => {
    runningOfType = 'manual';
    await expect(runSync('manual')).rejects.toThrow(/CONCURRENT_SYNC/);
  });

  it('marks failed and surfaces error message on task throw', async () => {
    const res = await runSync('boom' as SyncType);
    expect(res.syncLogId).toBe(1);
    expect(logs[0].status).toBe('failed');
    expect(logs[0].errorSummary).toContain('boom');
  });
});
