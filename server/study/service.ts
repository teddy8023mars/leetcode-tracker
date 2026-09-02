import { TRPCError } from '@trpc/server';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import type { StudyMode, StudyTaskKey, StudyTaskType } from '@shared/studyTypes';
import {
  problems, studyProfiles, studySessions, studyTaskProgress, userProgress,
} from '../../drizzle/schema';
import type { getDb } from '../db';
import { getCurriculumDay, type CurriculumDay } from './curriculum';
import {
  localDateKey, requiredTaskKeys, selectProblemCandidate, shouldGentleRestart, weekBounds,
} from './schedule';

export type StudyProfileRecord = {
  id: number;
  userId: number;
  currentDayIndex: number;
  targetDaysPerWeek: number;
  standardMinutes: number;
  minimumMinutes: number;
  lastCompletedAt: Date | null;
};

export type StudySessionRecord = {
  id: number;
  userId: number;
  localDate: string;
  curriculumDayIndex: number;
  mode: StudyMode;
  status: 'in_progress' | 'completed';
  coreIsTimedReview: boolean;
  startedAt: Date;
  completedAt: Date | null;
};

export type StudyTaskRecord = {
  id: number;
  sessionId: number;
  taskKey: StudyTaskKey;
  taskType: StudyTaskType;
  problemId: number | null;
  status: 'pending' | 'completed';
  completedAt: Date | null;
};

export type StudyProblemSummary = {
  id: number;
  frontendId: number;
  titleSlug: string;
  titleEn: string | null;
  titleZh: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
};

export type NewStudyTask = Pick<StudyTaskRecord, 'taskKey' | 'taskType' | 'problemId'>;

export interface StudyRepository {
  getOrCreateProfile(userId: number): Promise<StudyProfileRecord>;
  findSessionByDate(userId: number, localDate: string): Promise<StudySessionRecord | null>;
  findSessionById(userId: number, sessionId: number): Promise<StudySessionRecord | null>;
  createSessionWithTasks(input: {
    userId: number;
    localDate: string;
    curriculumDayIndex: number;
    mode: StudyMode;
    coreIsTimedReview: boolean;
    tasks: NewStudyTask[];
    now: Date;
  }): Promise<StudySessionRecord>;
  listTasks(sessionId: number): Promise<StudyTaskRecord[]>;
  setSessionMode(
    userId: number, sessionId: number, localDate: string, mode: StudyMode,
  ): Promise<StudySessionRecord | null>;
  completeTask(
    userId: number, sessionId: number, localDate: string, taskKey: StudyTaskKey, now: Date,
  ): Promise<boolean>;
  completeProblemTasks(userId: number, problemId: number, localDate: string, now: Date): Promise<number>;
  completeSessionAndAdvance(
    userId: number, sessionId: number, localDate: string, now: Date,
  ): Promise<StudyCompletionOutcome>;
  countCompletedSessions(userId: number, start: string, end: string): Promise<number>;
  findProblemsBySlugs(slugs: readonly string[]): Promise<StudyProblemSummary[]>;
  findProblemsByIds(ids: readonly number[]): Promise<StudyProblemSummary[]>;
  getProgressBySlugs(userId: number, slugs: readonly string[]): Promise<Record<string, string | undefined>>;
  findDueReview(userId: number, now: Date): Promise<StudyProblemSummary | null>;
  findOldestCompleted(userId: number): Promise<StudyProblemSummary | null>;
}

export type StudyCompletionOutcome =
  | 'completed'
  | 'already_completed'
  | 'missing_tasks'
  | 'stale_session'
  | 'not_found';

export type StudyCompletionInput = {
  userId: number;
  sessionId: number;
  localDate: string;
  now: Date;
};

export interface StudyCompletionTransaction {
  lockSession(userId: number, sessionId: number): Promise<StudySessionRecord | null>;
  lockProfile(userId: number): Promise<StudyProfileRecord | null>;
  listCompletedTaskKeys(sessionId: number): Promise<StudyTaskKey[]>;
  transitionSession(input: StudyCompletionInput): Promise<number>;
  advanceProfile(input: {
    userId: number;
    currentDayIndex: number;
    now: Date;
  }): Promise<number>;
}

export interface StudyCompletionConnector {
  transaction<T>(work: (tx: StudyCompletionTransaction) => Promise<T>): Promise<T>;
}

export async function completeStudySessionTransaction(
  connector: StudyCompletionConnector,
  input: StudyCompletionInput,
): Promise<StudyCompletionOutcome> {
  return connector.transaction(async (tx) => {
    const session = await tx.lockSession(input.userId, input.sessionId);
    if (!session) return 'not_found';

    const profile = await tx.lockProfile(input.userId);
    if (!profile) return 'not_found';
    if (session.status === 'completed') return 'already_completed';
    if (session.localDate !== input.localDate
      || profile.currentDayIndex !== session.curriculumDayIndex) return 'stale_session';

    const completedKeys = new Set(await tx.listCompletedTaskKeys(session.id));
    if (requiredTaskKeys(session.mode).some((key) => !completedKeys.has(key))) {
      return 'missing_tasks';
    }

    const transitioned = await tx.transitionSession(input);
    if (transitioned === 0) return 'already_completed';
    if (transitioned !== 1) throw new Error('Study session transition invariant failed');

    const advanced = await tx.advanceProfile({
      userId: input.userId,
      currentDayIndex: session.curriculumDayIndex,
      now: input.now,
    });
    if (advanced !== 1) throw new Error('Study profile advance invariant failed');
    return 'completed';
  });
}

export type TodayStudy = {
  profile: StudyProfileRecord;
  session: StudySessionRecord | null;
  tasks: StudyTaskRecord[];
  curriculumDay: CurriculumDay;
  reviewProblem: StudyProblemSummary | null;
  coreProblem: StudyProblemSummary | null;
  coreIsTimedReview: boolean;
  requiredTaskKeys: StudyTaskKey[];
  weeklyCompleted: number;
  gentleRestart: boolean;
  recommendedMode: StudyMode;
};

function careerTaskType(day: CurriculumDay): StudyTaskType {
  return day.career.type;
}

export class StudyService {
  constructor(
    private readonly repository: StudyRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async today(userId: number): Promise<TodayStudy> {
    const now = this.now();
    const profile = await this.repository.getOrCreateProfile(userId);
    const session = await this.repository.findSessionByDate(userId, localDateKey(now));
    return this.buildToday(userId, profile, session, now);
  }

  async startToday(userId: number, mode: StudyMode): Promise<TodayStudy> {
    const now = this.now();
    const profile = await this.repository.getOrCreateProfile(userId);
    const date = localDateKey(now);
    const existing = await this.repository.findSessionByDate(userId, date);
    if (existing) return this.buildToday(userId, profile, existing, now);

    const curriculumDay = getCurriculumDay(profile.currentDayIndex);
    const selection = await this.selectProblems(userId, curriculumDay, now);
    const session = await this.repository.createSessionWithTasks({
      userId,
      localDate: date,
      curriculumDayIndex: profile.currentDayIndex,
      mode,
      coreIsTimedReview: selection.coreIsTimedReview,
      now,
      tasks: [
        { taskKey: 'review', taskType: 'review', problemId: selection.reviewProblem?.id ?? null },
        { taskKey: 'problem', taskType: 'problem', problemId: selection.coreProblem?.id ?? null },
        { taskKey: 'career', taskType: careerTaskType(curriculumDay), problemId: null },
      ],
    });
    return this.buildToday(userId, profile, session, now);
  }

  async setMode(userId: number, sessionId: number, mode: StudyMode): Promise<TodayStudy> {
    const now = this.now();
    const updated = await this.repository.setSessionMode(userId, sessionId, localDateKey(now), mode);
    if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Active study session not found' });
    const profile = await this.repository.getOrCreateProfile(userId);
    return this.buildToday(userId, profile, updated, now);
  }

  async completeTask(userId: number, sessionId: number, taskKey: StudyTaskKey): Promise<TodayStudy> {
    if (taskKey === 'review' || taskKey === 'problem') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Problem tasks complete through problem progress' });
    }
    const now = this.now();
    const changed = await this.repository.completeTask(
      userId, sessionId, localDateKey(now), taskKey, now,
    );
    if (!changed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Active study task not found' });
    return this.today(userId);
  }

  async completeMatchingStudyProblemTasks(userId: number, problemId: number): Promise<number> {
    const now = this.now();
    return this.repository.completeProblemTasks(userId, problemId, localDateKey(now), now);
  }

  async completeSession(userId: number, sessionId: number): Promise<TodayStudy> {
    const now = this.now();
    const outcome = await this.repository.completeSessionAndAdvance(
      userId, sessionId, localDateKey(now), now,
    );
    if (outcome === 'missing_tasks') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Complete the required tasks first' });
    }
    if (outcome === 'stale_session') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This study session is no longer active today' });
    }
    if (outcome === 'not_found') throw new TRPCError({ code: 'NOT_FOUND', message: 'Study session not found' });
    return this.today(userId);
  }

  private async buildToday(
    userId: number, profile: StudyProfileRecord, session: StudySessionRecord | null, now: Date,
  ): Promise<TodayStudy> {
    const curriculumDay = getCurriculumDay(session?.curriculumDayIndex ?? profile.currentDayIndex);
    const tasks = session ? await this.repository.listTasks(session.id) : [];
    let selection: Pick<TodayStudy, 'reviewProblem' | 'coreProblem' | 'coreIsTimedReview'>;
    if (session) {
      const ids = tasks.flatMap((task) => task.problemId == null ? [] : [task.problemId]);
      const selected = await this.repository.findProblemsByIds(ids);
      const byId = new Map(selected.map((problem) => [problem.id, problem]));
      const reviewId = tasks.find((task) => task.taskKey === 'review')?.problemId;
      const coreId = tasks.find((task) => task.taskKey === 'problem')?.problemId;
      selection = {
        reviewProblem: reviewId ? byId.get(reviewId) ?? null : null,
        coreProblem: coreId ? byId.get(coreId) ?? null : null,
        coreIsTimedReview: session.coreIsTimedReview,
      };
    } else {
      selection = await this.selectProblems(userId, curriculumDay, now);
    }
    const bounds = weekBounds(now);
    const weeklyCompleted = await this.repository.countCompletedSessions(userId, bounds.start, bounds.end);
    const gentleRestart = shouldGentleRestart(profile.lastCompletedAt, now);
    const mode = session?.mode ?? (gentleRestart ? 'minimum' : 'standard');
    return {
      profile: { ...profile, standardMinutes: 70, minimumMinutes: 10 },
      session,
      tasks,
      curriculumDay,
      ...selection,
      requiredTaskKeys: requiredTaskKeys(mode),
      weeklyCompleted,
      gentleRestart,
      recommendedMode: gentleRestart ? 'minimum' : 'standard',
    };
  }

  private async selectProblems(userId: number, day: CurriculumDay, now: Date) {
    const candidates = [day.primarySlug, ...day.fallbackSlugs];
    const [available, progress, due, completed] = await Promise.all([
      this.repository.findProblemsBySlugs(candidates),
      this.repository.getProgressBySlugs(userId, candidates),
      this.repository.findDueReview(userId, now),
      this.repository.findOldestCompleted(userId),
    ]);
    const bySlug = new Map(available.map((problem) => [problem.titleSlug, problem]));
    const orderedAvailable = candidates.filter((slug) => bySlug.has(slug));
    const coreChoice = orderedAvailable.length > 0
      ? selectProblemCandidate(orderedAvailable, progress)
      : null;
    const fallbackWarmup = (await this.repository.findProblemsBySlugs([day.warmupSlug]))[0] ?? null;
    return {
      reviewProblem: due ?? completed ?? fallbackWarmup,
      coreProblem: coreChoice ? bySlug.get(coreChoice.slug) ?? null : null,
      coreIsTimedReview: coreChoice?.isTimedReview ?? false,
    };
  }
}

type DrizzleDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { insertId?: number } | undefined)?.insertId ?? 0);
}

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

const problemFields = {
  id: problems.id,
  frontendId: problems.frontendId,
  titleSlug: problems.titleSlug,
  titleEn: problems.titleEn,
  titleZh: problems.titleZh,
  difficulty: problems.difficulty,
};

export function createDrizzleStudyCompletionConnector(db: DrizzleDb): StudyCompletionConnector {
  return {
    transaction: (work) => db.transaction(async (tx) => work({
      async lockSession(userId, sessionId) {
        const rows = await tx.select().from(studySessions).where(and(
          eq(studySessions.id, sessionId), eq(studySessions.userId, userId),
        )).limit(1).for('update');
        return (rows[0] as StudySessionRecord | undefined) ?? null;
      },
      async lockProfile(userId) {
        const rows = await tx.select().from(studyProfiles)
          .where(eq(studyProfiles.userId, userId)).limit(1).for('update');
        return (rows[0] as StudyProfileRecord | undefined) ?? null;
      },
      async listCompletedTaskKeys(sessionId) {
        const rows = await tx.select({ key: studyTaskProgress.taskKey }).from(studyTaskProgress).where(and(
          eq(studyTaskProgress.sessionId, sessionId), eq(studyTaskProgress.status, 'completed'),
        ));
        return rows.map((row) => row.key as StudyTaskKey);
      },
      async transitionSession(input) {
        const result = await tx.update(studySessions).set({
          status: 'completed', completedAt: input.now,
        }).where(and(
          eq(studySessions.id, input.sessionId),
          eq(studySessions.userId, input.userId),
          eq(studySessions.localDate, input.localDate),
          eq(studySessions.status, 'in_progress'),
        ));
        return affectedRows(result);
      },
      async advanceProfile(input) {
        const result = await tx.update(studyProfiles).set({
          currentDayIndex: sql`${studyProfiles.currentDayIndex} + 1`,
          lastCompletedAt: input.now,
        }).where(and(
          eq(studyProfiles.userId, input.userId),
          eq(studyProfiles.currentDayIndex, input.currentDayIndex),
        ));
        return affectedRows(result);
      },
    })),
  };
}

export function createDrizzleStudyRepository(
  db: DrizzleDb,
  options: { completionConnector?: StudyCompletionConnector } = {},
): StudyRepository {
  const completionConnector = options.completionConnector ?? createDrizzleStudyCompletionConnector(db);
  return {
    async getOrCreateProfile(userId) {
      await db.insert(studyProfiles).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
      const rows = await db.select().from(studyProfiles).where(eq(studyProfiles.userId, userId)).limit(1);
      return rows[0] as StudyProfileRecord;
    },
    async findSessionByDate(userId, localDate) {
      const rows = await db.select().from(studySessions)
        .where(and(eq(studySessions.userId, userId), eq(studySessions.localDate, localDate))).limit(1);
      return (rows[0] as StudySessionRecord | undefined) ?? null;
    },
    async findSessionById(userId, sessionId) {
      const rows = await db.select().from(studySessions)
        .where(and(eq(studySessions.userId, userId), eq(studySessions.id, sessionId))).limit(1);
      return (rows[0] as StudySessionRecord | undefined) ?? null;
    },
    async createSessionWithTasks(input) {
      return db.transaction(async (tx) => {
        const result = await tx.insert(studySessions).values({
          userId: input.userId, localDate: input.localDate,
          curriculumDayIndex: input.curriculumDayIndex, mode: input.mode,
          coreIsTimedReview: input.coreIsTimedReview, startedAt: input.now,
        }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
        let id = insertId(result);
        if (!id) {
          const existing = await tx.select().from(studySessions)
            .where(and(eq(studySessions.userId, input.userId), eq(studySessions.localDate, input.localDate))).limit(1);
          id = existing[0]?.id ?? 0;
        }
        if (!id) throw new Error('Unable to create study session');
        for (const task of input.tasks) {
          await tx.insert(studyTaskProgress).values({ sessionId: id, ...task })
            .onDuplicateKeyUpdate({ set: { taskKey: task.taskKey } });
        }
        const rows = await tx.select().from(studySessions).where(eq(studySessions.id, id)).limit(1);
        return rows[0] as StudySessionRecord;
      });
    },
    async listTasks(sessionId) {
      return await db.select().from(studyTaskProgress)
        .where(eq(studyTaskProgress.sessionId, sessionId)) as StudyTaskRecord[];
    },
    async setSessionMode(userId, sessionId, localDate, mode) {
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(studySessions).where(and(
          eq(studySessions.id, sessionId), eq(studySessions.userId, userId),
          eq(studySessions.localDate, localDate), eq(studySessions.status, 'in_progress'),
        )).limit(1).for('update');
        const session = rows[0] as StudySessionRecord | undefined;
        if (!session) return null;
        await tx.update(studySessions).set({ mode }).where(and(
          eq(studySessions.id, sessionId), eq(studySessions.userId, userId),
          eq(studySessions.localDate, localDate), eq(studySessions.status, 'in_progress'),
        ));
        return { ...session, mode };
      });
    },
    async completeTask(userId, sessionId, localDate, taskKey, now) {
      return db.transaction(async (tx) => {
        const sessions = await tx.select({ id: studySessions.id }).from(studySessions).where(and(
          eq(studySessions.id, sessionId), eq(studySessions.userId, userId),
          eq(studySessions.localDate, localDate), eq(studySessions.status, 'in_progress'),
        )).limit(1).for('update');
        if (!sessions[0]) return false;
        await tx.update(studyTaskProgress).set({ status: 'completed', completedAt: now }).where(and(
          eq(studyTaskProgress.sessionId, sessionId), eq(studyTaskProgress.taskKey, taskKey),
        ));
        const rows = await tx.select({ id: studyTaskProgress.id }).from(studyTaskProgress).where(and(
          eq(studyTaskProgress.sessionId, sessionId), eq(studyTaskProgress.taskKey, taskKey),
        )).limit(1);
        return !!rows[0];
      });
    },
    async completeProblemTasks(userId, problemId, localDate, now) {
      return db.transaction(async (tx) => {
        const active = await tx.select({ id: studySessions.id }).from(studySessions).where(and(
          eq(studySessions.userId, userId), eq(studySessions.localDate, localDate),
          eq(studySessions.status, 'in_progress'),
        )).for('update');
        if (active.length === 0) return 0;
        const activeIds = active.map((row) => row.id);
        const matching = await tx.select({ id: studyTaskProgress.id }).from(studyTaskProgress).where(and(
          inArray(studyTaskProgress.sessionId, activeIds), eq(studyTaskProgress.problemId, problemId),
          inArray(studyTaskProgress.taskType, ['review', 'problem']), eq(studyTaskProgress.status, 'pending'),
        ));
        if (matching.length === 0) return 0;
        const result = await tx.update(studyTaskProgress).set({ status: 'completed', completedAt: now })
          .where(and(
            inArray(studyTaskProgress.id, matching.map((row) => row.id)),
            eq(studyTaskProgress.status, 'pending'),
          ));
        return affectedRows(result);
      });
    },
    async completeSessionAndAdvance(userId, sessionId, localDate, now) {
      return completeStudySessionTransaction(completionConnector, { userId, sessionId, localDate, now });
    },
    async countCompletedSessions(userId, start, end) {
      const rows = await db.select({ id: studySessions.id }).from(studySessions).where(and(
        eq(studySessions.userId, userId), eq(studySessions.status, 'completed'),
        gte(studySessions.localDate, start), lte(studySessions.localDate, end),
      ));
      return rows.length;
    },
    async findProblemsBySlugs(slugs) {
      if (slugs.length === 0) return [];
      return await db.select(problemFields).from(problems)
        .where(inArray(problems.titleSlug, [...slugs])) as StudyProblemSummary[];
    },
    async findProblemsByIds(ids) {
      if (ids.length === 0) return [];
      return await db.select(problemFields).from(problems)
        .where(inArray(problems.id, [...ids])) as StudyProblemSummary[];
    },
    async getProgressBySlugs(userId, slugs) {
      if (slugs.length === 0) return {};
      const rows = await db.select({ slug: problems.titleSlug, status: userProgress.status })
        .from(problems).leftJoin(userProgress, and(
          eq(userProgress.problemId, problems.id), eq(userProgress.userId, userId),
        )).where(inArray(problems.titleSlug, [...slugs]));
      return Object.fromEntries(rows.map((row) => [row.slug, row.status ?? undefined]));
    },
    async findDueReview(userId, now) {
      const rows = await db.select(problemFields).from(userProgress)
        .innerJoin(problems, eq(userProgress.problemId, problems.id)).where(and(
          eq(userProgress.userId, userId), eq(userProgress.status, 'done'), lte(userProgress.nextReviewAt, now),
        )).orderBy(asc(userProgress.nextReviewAt)).limit(1);
      return (rows[0] as StudyProblemSummary | undefined) ?? null;
    },
    async findOldestCompleted(userId) {
      const rows = await db.select(problemFields).from(userProgress)
        .innerJoin(problems, eq(userProgress.problemId, problems.id)).where(and(
          eq(userProgress.userId, userId), eq(userProgress.status, 'done'),
        )).orderBy(asc(userProgress.lastReviewedAt)).limit(1);
      return (rows[0] as StudyProblemSummary | undefined) ?? null;
    },
  };
}

export async function completeMatchingStudyProblemTasks(
  db: DrizzleDb,
  userId: number,
  problemId: number,
  now: Date = new Date(),
): Promise<number> {
  return createDrizzleStudyRepository(db).completeProblemTasks(
    userId, problemId, localDateKey(now), now,
  );
}
