import type Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import {
  completeStudySessionTransaction,
  createDrizzleStudyRepository,
  type StudyCompletionConnector,
  type StudyCompletionTransaction,
  type StudyProfileRecord,
  type StudySessionRecord,
} from '../study/service';
import { createInMemoryDb } from '../testHelpers/inMemoryDb';

const now = new Date(2026, 8, 1, 8);

function session(overrides: Partial<StudySessionRecord> = {}): StudySessionRecord {
  return {
    id: 11,
    userId: 1,
    localDate: '2026-09-01',
    curriculumDayIndex: 0,
    mode: 'standard',
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    coreIsTimedReview: false,
    ...overrides,
  };
}

function profile(overrides: Partial<StudyProfileRecord> = {}): StudyProfileRecord {
  return {
    id: 1,
    userId: 1,
    currentDayIndex: 0,
    targetDaysPerWeek: 5,
    standardMinutes: 90,
    minimumMinutes: 25,
    lastCompletedAt: null,
    ...overrides,
  };
}

function recordingConnector(overrides: Partial<StudyCompletionTransaction> = {}) {
  const tx: StudyCompletionTransaction = {
    lockSession: vi.fn(async () => session()),
    lockProfile: vi.fn(async () => profile()),
    listCompletedTaskKeys: vi.fn(async () => ['review', 'dsa']),
    transitionSession: vi.fn(async () => 1),
    advanceProfile: vi.fn(async () => 1),
    ...overrides,
  };
  const connector: StudyCompletionConnector = {
    transaction: async (work) => work(tx),
  };
  return { connector, tx };
}

describe('completeStudySessionTransaction', () => {
  it('derives requirements from the locked persisted mode', async () => {
    const { connector, tx } = recordingConnector();

    const outcome = await completeStudySessionTransaction(connector, {
      userId: 1, sessionId: 11, localDate: '2026-09-01', now,
    });

    expect(outcome).toBe('missing_tasks');
    expect(tx.lockSession).toHaveBeenCalledWith(1, 11);
    expect(tx.lockProfile).toHaveBeenCalledWith(1);
    expect(tx.transitionSession).not.toHaveBeenCalled();
    expect(tx.advanceProfile).not.toHaveBeenCalled();
  });

  it('never advances when the conditional session transition affects zero rows', async () => {
    const { connector, tx } = recordingConnector({
      listCompletedTaskKeys: vi.fn(async () => ['review', 'dsa', 'problem', 'career']),
      transitionSession: vi.fn(async () => 0),
    });

    const outcome = await completeStudySessionTransaction(connector, {
      userId: 1, sessionId: 11, localDate: '2026-09-01', now,
    });

    expect(outcome).toBe('already_completed');
    expect(tx.advanceProfile).not.toHaveBeenCalled();
  });

  it('rolls back instead of advancing when the session transition violates the one-row invariant', async () => {
    const { connector, tx } = recordingConnector({
      listCompletedTaskKeys: vi.fn(async () => ['review', 'dsa', 'problem', 'career']),
      transitionSession: vi.fn(async () => 2),
    });

    await expect(completeStudySessionTransaction(connector, {
      userId: 1, sessionId: 11, localDate: '2026-09-01', now,
    })).rejects.toThrow('Study session transition invariant failed');
    expect(tx.advanceProfile).not.toHaveBeenCalled();
  });

  it('rejects a locked profile whose curriculum index no longer matches the session', async () => {
    const { connector, tx } = recordingConnector({
      lockProfile: vi.fn(async () => profile({ currentDayIndex: 1 })),
      listCompletedTaskKeys: vi.fn(async () => ['review', 'dsa', 'problem', 'career']),
    });

    const outcome = await completeStudySessionTransaction(connector, {
      userId: 1, sessionId: 11, localDate: '2026-09-01', now,
    });

    expect(outcome).toBe('stale_session');
    expect(tx.transitionSession).not.toHaveBeenCalled();
    expect(tx.advanceProfile).not.toHaveBeenCalled();
  });

  it('rolls back by throwing if the guarded profile advance affects zero rows', async () => {
    const { connector, tx } = recordingConnector({
      listCompletedTaskKeys: vi.fn(async () => ['review', 'dsa', 'problem', 'career']),
      advanceProfile: vi.fn(async () => 0),
    });

    await expect(completeStudySessionTransaction(connector, {
      userId: 1, sessionId: 11, localDate: '2026-09-01', now,
    })).rejects.toThrow('Study profile advance invariant failed');
    expect(tx.transitionSession).toHaveBeenCalledTimes(1);
    expect(tx.advanceProfile).toHaveBeenCalledTimes(1);
  });

  it('routes repository completion through the injected lock-and-affected-row connector', async () => {
    const { connector, tx } = recordingConnector({
      listCompletedTaskKeys: vi.fn(async () => ['review', 'dsa', 'problem', 'career']),
    });
    const repository = createDrizzleStudyRepository({} as never, {
      completionConnector: connector,
    });

    const outcome = await repository.completeSessionAndAdvance(
      1, 11, '2026-09-01', now,
    );

    expect(outcome).toBe('completed');
    expect(tx.lockSession).toHaveBeenCalledWith(1, 11);
    expect(tx.lockProfile).toHaveBeenCalledWith(1);
    expect(tx.transitionSession).toHaveBeenCalledWith({
      userId: 1, sessionId: 11, localDate: '2026-09-01', now,
    });
    expect(tx.advanceProfile).toHaveBeenCalledWith({
      userId: 1, currentDayIndex: 0, now,
    });
  });
});

type CompletionHarness = {
  connector: StudyCompletionConnector;
  setMode(mode: 'standard' | 'minimum'): Promise<void>;
};

function sqliteCompletionHarness(
  sqlite: Database.Database,
  afterSessionLock?: () => Promise<void>,
): CompletionHarness {
  let tail = Promise.resolve();
  const exclusive = async <T>(work: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  };

  const connector: StudyCompletionConnector = {
    transaction: (work) => exclusive(async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      const tx: StudyCompletionTransaction = {
        async lockSession(userId, sessionId) {
          const row = sqlite.prepare(
            'SELECT * FROM studySessions WHERE userId = ? AND id = ?',
          ).get(userId, sessionId) as Record<string, unknown> | undefined;
          if (afterSessionLock) await afterSessionLock();
          return row ? sqliteSession(row) : null;
        },
        async lockProfile(userId) {
          const row = sqlite.prepare(
            'SELECT * FROM studyProfiles WHERE userId = ?',
          ).get(userId) as Record<string, unknown> | undefined;
          return row ? sqliteProfile(row) : null;
        },
        async listCompletedTaskKeys(sessionId) {
          return (sqlite.prepare(
            "SELECT taskKey FROM studyTaskProgress WHERE sessionId = ? AND status = 'completed'",
          ).all(sessionId) as Array<{ taskKey: string }>).map((row) => row.taskKey as never);
        },
        async transitionSession(input) {
          return sqlite.prepare(
            `UPDATE studySessions SET status = 'completed', completedAt = ?
             WHERE id = ? AND userId = ? AND localDate = ? AND status = 'in_progress'`,
          ).run(input.now.toISOString(), input.sessionId, input.userId, input.localDate).changes;
        },
        async advanceProfile(input) {
          return sqlite.prepare(
            `UPDATE studyProfiles
             SET currentDayIndex = currentDayIndex + 1, lastCompletedAt = ?
             WHERE userId = ? AND currentDayIndex = ?`,
          ).run(input.now.toISOString(), input.userId, input.currentDayIndex).changes;
        },
      };
      try {
        const result = await work(tx);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }),
  };

  return {
    connector,
    setMode: (mode) => exclusive(async () => {
      sqlite.prepare(
        "UPDATE studySessions SET mode = ? WHERE id = 11 AND status = 'in_progress'",
      ).run(mode);
    }),
  };
}

function sqliteSession(row: Record<string, unknown>): StudySessionRecord {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    localDate: String(row.localDate),
    curriculumDayIndex: Number(row.curriculumDayIndex),
    mode: row.mode as 'standard' | 'minimum',
    status: row.status as 'in_progress' | 'completed',
    startedAt: new Date(String(row.startedAt)),
    completedAt: row.completedAt ? new Date(String(row.completedAt)) : null,
    coreIsTimedReview: Boolean(row.coreIsTimedReview),
  };
}

function sqliteProfile(row: Record<string, unknown>): StudyProfileRecord {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    currentDayIndex: Number(row.currentDayIndex),
    targetDaysPerWeek: Number(row.targetDaysPerWeek),
    standardMinutes: Number(row.standardMinutes),
    minimumMinutes: Number(row.minimumMinutes),
    lastCompletedAt: row.lastCompletedAt ? new Date(String(row.lastCompletedAt)) : null,
  };
}

function seedCompletableSession(sqlite: Database.Database, completedTaskKeys: string[]) {
  sqlite.prepare("INSERT INTO users (id, openId) VALUES (1, 'local-dev')").run();
  sqlite.prepare('INSERT INTO studyProfiles (userId, currentDayIndex) VALUES (1, 0)').run();
  sqlite.prepare(
    `INSERT INTO studySessions
      (id, userId, localDate, curriculumDayIndex, mode, status, startedAt)
     VALUES (11, 1, '2026-09-01', 0, 'standard', 'in_progress', ?)`,
  ).run(now.toISOString());
  for (const [index, taskKey] of ['review', 'dsa', 'problem', 'career'].entries()) {
    sqlite.prepare(
      `INSERT INTO studyTaskProgress
        (id, sessionId, taskKey, taskType, status)
       VALUES (?, 11, ?, ?, ?)`,
    ).run(
      index + 1,
      taskKey,
      taskKey === 'dsa' ? 'dsa_lesson' : taskKey === 'career' ? 'gcp' : taskKey,
      completedTaskKeys.includes(taskKey) ? 'completed' : 'pending',
    );
  }
}

describe('transaction-faithful completion races', () => {
  it('advances exactly once under concurrent duplicate completion', async () => {
    const { sqlite } = createInMemoryDb();
    seedCompletableSession(sqlite, ['review', 'problem', 'career']);
    const { connector } = sqliteCompletionHarness(sqlite);
    const input = { userId: 1, sessionId: 11, localDate: '2026-09-01', now };

    const outcomes = await Promise.all([
      completeStudySessionTransaction(connector, input),
      completeStudySessionTransaction(connector, input),
    ]);

    expect(outcomes.sort()).toEqual(['already_completed', 'completed']);
    expect(sqlite.prepare('SELECT currentDayIndex FROM studyProfiles WHERE userId = 1').get())
      .toEqual({ currentDayIndex: 1 });
    expect(sqlite.prepare('SELECT status FROM studySessions WHERE id = 11').get())
      .toEqual({ status: 'completed' });
  });

  it('serializes a mode race and validates the mode held by the session lock', async () => {
    const { sqlite } = createInMemoryDb();
    seedCompletableSession(sqlite, ['review']);
    let announceLock!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => { announceLock = resolve; });
    const released = new Promise<void>((resolve) => { releaseLock = resolve; });
    const harness = sqliteCompletionHarness(sqlite, async () => {
      announceLock();
      await released;
    });

    const completion = completeStudySessionTransaction(harness.connector, {
      userId: 1, sessionId: 11, localDate: '2026-09-01', now,
    });
    await locked;
    const modeChange = harness.setMode('minimum');
    releaseLock();

    await expect(completion).resolves.toBe('missing_tasks');
    await modeChange;
    expect(sqlite.prepare('SELECT mode, status FROM studySessions WHERE id = 11').get())
      .toEqual({ mode: 'minimum', status: 'in_progress' });
    expect(sqlite.prepare('SELECT currentDayIndex FROM studyProfiles WHERE userId = 1').get())
      .toEqual({ currentDayIndex: 0 });
  });
});
