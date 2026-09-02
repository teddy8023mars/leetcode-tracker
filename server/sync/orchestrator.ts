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
/** Mid-run progress a task can publish so the UI does not look hung. */
export type SyncProgress = {
  processed: number;
  succeeded: number;
  failed: number;
  /** Expected total, when the task can estimate it. Drives the UI progress bar. */
  total?: number;
  /** Short label of the current stage, e.g. 'problems' or 'companies'. */
  phase?: string;
};

/** Fire-and-forget: reporting must never block or fail the task. */
export type ProgressReporter = (p: SyncProgress) => void;

type Tasks = Partial<Record<SyncType, (report: ProgressReporter) => Promise<TaskResult>>>;

type Deps = {
  startSyncLog: (t: SyncType) => Promise<number>;
  finishSyncLog: (id: number, patch: Partial<InsertSyncLog>) => Promise<void>;
  findRunningSyncOfType: (t: SyncType) => Promise<{ id: number } | null>;
  updateSyncLogProgress: (id: number, p: SyncProgress) => Promise<void>;
  tasks: Tasks;
};

/** Cap how often a chatty task hits the database with progress updates. */
export const PROGRESS_THROTTLE_MS = 1500;

let _deps: Deps = {
  startSyncLog: db.startSyncLog as unknown as Deps['startSyncLog'],
  finishSyncLog: db.finishSyncLog as unknown as Deps['finishSyncLog'],
  findRunningSyncOfType:
    db.findRunningSyncOfType as unknown as Deps['findRunningSyncOfType'],
  updateSyncLogProgress:
    db.updateSyncLogProgress as unknown as Deps['updateSyncLogProgress'],
  tasks: {},
};

export function __setSyncDepsForTest(partial: Partial<Deps>) {
  _deps = { ..._deps, ...partial };
}

export function registerSyncTasks(tasks: Tasks) {
  _deps.tasks = { ..._deps.tasks, ...tasks };
}

/**
 * Throttled, fire-and-forget reporter: at most one in-flight write and one
 * write per PROGRESS_THROTTLE_MS, so a per-item call site stays cheap.
 */
function makeReporter(syncLogId: number): ProgressReporter {
  let lastAt = 0;
  let inFlight = false;
  return (p) => {
    const now = Date.now();
    if (inFlight || now - lastAt < PROGRESS_THROTTLE_MS) return;
    lastAt = now;
    inFlight = true;
    void _deps
      .updateSyncLogProgress(syncLogId, p)
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  };
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
    const result = await handler(makeReporter(id));
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
