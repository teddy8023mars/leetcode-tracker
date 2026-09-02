import type Database from 'better-sqlite3';

import type { StudyMode, StudyTaskKey } from '@shared/studyTypes';
import {
  completeStudySessionTransaction,
  type StudyCompletionConnector,
  type StudyCompletionTransaction,
  type StudyProblemSummary,
  type StudyProfileRecord,
  type StudyRepository,
  type StudySessionRecord,
  type StudyTaskRecord,
} from '../study/service';

type Row = Record<string, unknown>;

function parseDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const text = String(value);
  return new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
}

function profileRecord(row: Row): StudyProfileRecord {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    currentDayIndex: Number(row.currentDayIndex),
    targetDaysPerWeek: Number(row.targetDaysPerWeek),
    standardMinutes: Number(row.standardMinutes),
    minimumMinutes: Number(row.minimumMinutes),
    lastCompletedAt: row.lastCompletedAt ? parseDate(row.lastCompletedAt) : null,
  };
}

function sessionRecord(row: Row): StudySessionRecord {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    localDate: String(row.localDate),
    curriculumDayIndex: Number(row.curriculumDayIndex),
    mode: row.mode as StudyMode,
    status: row.status as StudySessionRecord['status'],
    coreIsTimedReview: Boolean(row.coreIsTimedReview),
    startedAt: parseDate(row.startedAt),
    completedAt: row.completedAt ? parseDate(row.completedAt) : null,
  };
}

function taskRecord(row: Row): StudyTaskRecord {
  return {
    id: Number(row.id),
    sessionId: Number(row.sessionId),
    taskKey: row.taskKey as StudyTaskKey,
    taskType: row.taskType as StudyTaskRecord['taskType'],
    problemId: row.problemId == null ? null : Number(row.problemId),
    status: row.status as StudyTaskRecord['status'],
    completedAt: row.completedAt ? parseDate(row.completedAt) : null,
  };
}

function problemRecord(row: Row): StudyProblemSummary {
  return {
    id: Number(row.id),
    frontendId: Number(row.frontendId),
    titleSlug: String(row.titleSlug),
    titleEn: row.titleEn == null ? null : String(row.titleEn),
    titleZh: row.titleZh == null ? null : String(row.titleZh),
    difficulty: row.difficulty as StudyProblemSummary['difficulty'],
  };
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

function createSqliteCompletionConnector(sqlite: Database.Database): StudyCompletionConnector {
  let tail = Promise.resolve();
  return {
    async transaction(work) {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      sqlite.exec('BEGIN IMMEDIATE');
      const tx: StudyCompletionTransaction = {
        async lockSession(userId, sessionId) {
          const row = sqlite.prepare(
            'SELECT * FROM studySessions WHERE userId = ? AND id = ?',
          ).get(userId, sessionId) as Row | undefined;
          return row ? sessionRecord(row) : null;
        },
        async lockProfile(userId) {
          const row = sqlite.prepare(
            'SELECT * FROM studyProfiles WHERE userId = ?',
          ).get(userId) as Row | undefined;
          return row ? profileRecord(row) : null;
        },
        async listCompletedTaskKeys(sessionId) {
          return (sqlite.prepare(
            "SELECT taskKey FROM studyTaskProgress WHERE sessionId = ? AND status = 'completed'",
          ).all(sessionId) as Array<{ taskKey: StudyTaskKey }>).map((row) => row.taskKey);
        },
        async transitionSession(input) {
          return sqlite.prepare(
            `UPDATE studySessions SET status = 'completed', completedAt = ?
             WHERE id = ? AND userId = ? AND localDate = ? AND status = 'in_progress'`,
          ).run(input.now.toISOString(), input.sessionId, input.userId, input.localDate).changes;
        },
        async advanceProfile(input) {
          return sqlite.prepare(
            `UPDATE studyProfiles SET currentDayIndex = currentDayIndex + 1, lastCompletedAt = ?
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
      } finally {
        release();
      }
    },
  };
}

export function createSqliteStudyRepository(sqlite: Database.Database): StudyRepository {
  const completionConnector = createSqliteCompletionConnector(sqlite);
  return {
    async getOrCreateProfile(userId) {
      sqlite.prepare('INSERT OR IGNORE INTO studyProfiles (userId) VALUES (?)').run(userId);
      return profileRecord(sqlite.prepare(
        'SELECT * FROM studyProfiles WHERE userId = ?',
      ).get(userId) as Row);
    },
    async findSessionByDate(userId, localDate) {
      const row = sqlite.prepare(
        'SELECT * FROM studySessions WHERE userId = ? AND localDate = ?',
      ).get(userId, localDate) as Row | undefined;
      return row ? sessionRecord(row) : null;
    },
    async findSessionById(userId, sessionId) {
      const row = sqlite.prepare(
        'SELECT * FROM studySessions WHERE userId = ? AND id = ?',
      ).get(userId, sessionId) as Row | undefined;
      return row ? sessionRecord(row) : null;
    },
    async createSessionWithTasks(input) {
      sqlite.transaction(() => {
        sqlite.prepare(
          `INSERT OR IGNORE INTO studySessions
            (userId, localDate, curriculumDayIndex, mode, coreIsTimedReview, startedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          input.userId,
          input.localDate,
          input.curriculumDayIndex,
          input.mode,
          input.coreIsTimedReview ? 1 : 0,
          input.now.toISOString(),
        );
        const row = sqlite.prepare(
          'SELECT id FROM studySessions WHERE userId = ? AND localDate = ?',
        ).get(input.userId, input.localDate) as { id: number };
        const insertTask = sqlite.prepare(
          `INSERT OR IGNORE INTO studyTaskProgress
            (sessionId, taskKey, taskType, problemId)
           VALUES (?, ?, ?, ?)`,
        );
        for (const task of input.tasks) {
          insertTask.run(row.id, task.taskKey, task.taskType, task.problemId);
        }
      })();
      const row = sqlite.prepare(
        'SELECT * FROM studySessions WHERE userId = ? AND localDate = ?',
      ).get(input.userId, input.localDate) as Row;
      return sessionRecord(row);
    },
    async listTasks(sessionId) {
      return (sqlite.prepare(
        'SELECT * FROM studyTaskProgress WHERE sessionId = ? ORDER BY id',
      ).all(sessionId) as Row[]).map(taskRecord);
    },
    async setSessionMode(userId, sessionId, localDate, mode) {
      const result = sqlite.prepare(
        `UPDATE studySessions SET mode = ?
         WHERE id = ? AND userId = ? AND localDate = ? AND status = 'in_progress'`,
      ).run(mode, sessionId, userId, localDate);
      if (result.changes === 0) return null;
      return sessionRecord(sqlite.prepare(
        'SELECT * FROM studySessions WHERE id = ?',
      ).get(sessionId) as Row);
    },
    async completeTask(userId, sessionId, localDate, taskKey, now) {
      const active = sqlite.prepare(
        `SELECT id FROM studySessions
         WHERE id = ? AND userId = ? AND localDate = ? AND status = 'in_progress'`,
      ).get(sessionId, userId, localDate);
      if (!active) return false;
      const task = sqlite.prepare(
        'SELECT id FROM studyTaskProgress WHERE sessionId = ? AND taskKey = ?',
      ).get(sessionId, taskKey);
      if (!task) return false;
      sqlite.prepare(
        `UPDATE studyTaskProgress SET status = 'completed', completedAt = ?
         WHERE sessionId = ? AND taskKey = ?`,
      ).run(now.toISOString(), sessionId, taskKey);
      return true;
    },
    async completeProblemTasks(userId, problemId, localDate, now) {
      return sqlite.transaction(() => {
        const activeIds = (sqlite.prepare(
          `SELECT id FROM studySessions
           WHERE userId = ? AND localDate = ? AND status = 'in_progress'`,
        ).all(userId, localDate) as Array<{ id: number }>).map((row) => row.id);
        if (activeIds.length === 0) return 0;
        return sqlite.prepare(
          `UPDATE studyTaskProgress SET status = 'completed', completedAt = ?
           WHERE sessionId IN (${placeholders(activeIds)})
             AND problemId = ?
             AND taskType IN ('review', 'problem')
             AND status = 'pending'`,
        ).run(now.toISOString(), ...activeIds, problemId).changes;
      })();
    },
    async completeSessionAndAdvance(userId, sessionId, localDate, now) {
      return completeStudySessionTransaction(completionConnector, {
        userId, sessionId, localDate, now,
      });
    },
    async countCompletedSessions(userId, start, end) {
      const row = sqlite.prepare(
        `SELECT COUNT(*) AS count FROM studySessions
         WHERE userId = ? AND status = 'completed' AND localDate >= ? AND localDate <= ?`,
      ).get(userId, start, end) as { count: number };
      return Number(row.count);
    },
    async findProblemsBySlugs(slugs) {
      if (slugs.length === 0) return [];
      return (sqlite.prepare(
        `SELECT id, frontendId, titleSlug, titleEn, titleZh, difficulty
         FROM problems WHERE titleSlug IN (${placeholders(slugs)})`,
      ).all(...slugs) as Row[]).map(problemRecord);
    },
    async findProblemsByIds(ids) {
      if (ids.length === 0) return [];
      return (sqlite.prepare(
        `SELECT id, frontendId, titleSlug, titleEn, titleZh, difficulty
         FROM problems WHERE id IN (${placeholders(ids)})`,
      ).all(...ids) as Row[]).map(problemRecord);
    },
    async getProgressBySlugs(userId, slugs) {
      if (slugs.length === 0) return {};
      const rows = sqlite.prepare(
        `SELECT problems.titleSlug AS slug, userProgress.status AS status
         FROM problems
         LEFT JOIN userProgress
           ON userProgress.problemId = problems.id AND userProgress.userId = ?
         WHERE problems.titleSlug IN (${placeholders(slugs)})`,
      ).all(userId, ...slugs) as Array<{ slug: string; status: string | null }>;
      return Object.fromEntries(rows.map((row) => [row.slug, row.status ?? undefined]));
    },
    async findDueReview(userId, now) {
      const row = sqlite.prepare(
        `SELECT problems.id, problems.frontendId, problems.titleSlug,
                problems.titleEn, problems.titleZh, problems.difficulty
         FROM userProgress
         INNER JOIN problems ON problems.id = userProgress.problemId
         WHERE userProgress.userId = ?
           AND userProgress.status = 'done'
           AND userProgress.nextReviewAt <= ?
         ORDER BY userProgress.nextReviewAt ASC
         LIMIT 1`,
      ).get(userId, now.toISOString()) as Row | undefined;
      return row ? problemRecord(row) : null;
    },
    async findOldestCompleted(userId) {
      const row = sqlite.prepare(
        `SELECT problems.id, problems.frontendId, problems.titleSlug,
                problems.titleEn, problems.titleZh, problems.difficulty
         FROM userProgress
         INNER JOIN problems ON problems.id = userProgress.problemId
         WHERE userProgress.userId = ? AND userProgress.status = 'done'
         ORDER BY userProgress.lastReviewedAt ASC
         LIMIT 1`,
      ).get(userId) as Row | undefined;
      return row ? problemRecord(row) : null;
    },
  };
}
