import type { SyncType } from '@shared/problemTypes';
import * as db from '../db';
import type { InsertSyncLog } from '../../drizzle/schema';

export type TaskResult = {
  itemsProcessed: number;
  itemsSucceeded: number;
  itemsFailed: number;
  errorSummary?: string;
  metaJson?: unknown;
};
type Tasks = Partial<Record<SyncType, () => Promise<TaskResult>>>;

type Deps = {
  startSyncLog: (t: SyncType) => Promise<number>;
  finishSyncLog: (id: number, patch: Partial<InsertSyncLog>) => Promise<void>;
  findRunningSyncOfType: (t: SyncType) => Promise<{ id: number } | null>;
  tasks: Tasks;
};

let _deps: Deps = {
  startSyncLog: db.startSyncLog as unknown as Deps['startSyncLog'],
  finishSyncLog: db.finishSyncLog as unknown as Deps['finishSyncLog'],
  findRunningSyncOfType:
    db.findRunningSyncOfType as unknown as Deps['findRunningSyncOfType'],
  tasks: {},
};

export function __setSyncDepsForTest(partial: Partial<Deps>) {
  _deps = { ..._deps, ...partial };
}

export function registerSyncTasks(tasks: Tasks) {
  _deps.tasks = { ..._deps.tasks, ...tasks };
}

export async function runSync(syncType: SyncType): Promise<{ syncLogId: number }> {
  const existing = await _deps.findRunningSyncOfType(syncType);
  if (existing) {
    throw new Error(
      `CONCURRENT_SYNC: another '${syncType}' is already running (id=${existing.id})`,
    );
  }
  const id = await _deps.startSyncLog(syncType);
  const handler = _deps.tasks[syncType];
  if (!handler) {
    await _deps.finishSyncLog(id, {
      status: 'failed',
      errorSummary: `No handler registered for '${syncType}'`,
    });
    return { syncLogId: id };
  }
  try {
    const result = await handler();
    const status: InsertSyncLog['status'] =
      result.itemsFailed === 0
        ? 'success'
        : result.itemsFailed >= result.itemsProcessed
          ? 'failed'
          : 'partial';
    await _deps.finishSyncLog(id, {
      status,
      itemsProcessed: result.itemsProcessed,
      itemsSucceeded: result.itemsSucceeded,
      itemsFailed: result.itemsFailed,
      errorSummary: result.errorSummary,
    });
  } catch (e) {
    await _deps.finishSyncLog(id, {
      status: 'failed',
      errorSummary: (e as Error)?.message ?? String(e),
    });
  }
  return { syncLogId: id };
}
