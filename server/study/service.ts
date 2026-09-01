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
    tasks: NewStudyTask[];
    now: Date;
  }): Promise<StudySessionRecord>;
  listTasks(sessionId: number): Promise<StudyTaskRecord[]>;
  setSessionMode(userId: number, sessionId: number, mode: StudyMode): Promise<StudySessionRecord | null>;
  completeTask(userId: number, sessionId: number, taskKey: StudyTaskKey, now: Date): Promise<boolean>;
  completeProblemTasks(userId: number, problemId: number, now: Date): Promise<number>;
  completeSessionAndAdvance(
    userId: number, sessionId: number, requiredKeys: StudyTaskKey[], now: Date,
  ): Promise<'completed' | 'already_completed' | 'missing_tasks' | 'not_found'>;
  countCompletedSessions(userId: number, start: string, end: string): Promise<number>;
  findProblemsBySlugs(slugs: readonly string[]): Promise<StudyProblemSummary[]>;
  findProblemsByIds(ids: readonly number[]): Promise<StudyProblemSummary[]>;
  getProgressBySlugs(userId: number, slugs: readonly string[]): Promise<Record<string, string | undefined>>;
  findDueReview(userId: number, now: Date): Promise<StudyProblemSummary | null>;
  findOldestCompleted(userId: number): Promise<StudyProblemSummary | null>;
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
      now,
      tasks: [
        { taskKey: 'review', taskType: 'review', problemId: selection.reviewProblem?.id ?? null },
        { taskKey: 'dsa', taskType: 'dsa_lesson', problemId: null },
        { taskKey: 'problem', taskType: 'problem', problemId: selection.coreProblem?.id ?? null },
        { taskKey: 'career', taskType: careerTaskType(curriculumDay), problemId: null },
      ],
    });
    return this.buildToday(userId, profile, session, now);
  }

  async setMode(userId: number, sessionId: number, mode: StudyMode): Promise<TodayStudy> {
    const updated = await this.repository.setSessionMode(userId, sessionId, mode);
    if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Active study session not found' });
    const profile = await this.repository.getOrCreateProfile(userId);
    return this.buildToday(userId, profile, updated, this.now());
  }

  async completeTask(userId: number, sessionId: number, taskKey: StudyTaskKey): Promise<TodayStudy> {
    if (taskKey === 'review' || taskKey === 'problem') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Problem tasks complete through problem progress' });
    }
    const changed = await this.repository.completeTask(userId, sessionId, taskKey, this.now());
    if (!changed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Active study task not found' });
    return this.today(userId);
  }

  async completeMatchingStudyProblemTasks(userId: number, problemId: number): Promise<number> {
    return this.repository.completeProblemTasks(userId, problemId, this.now());
  }

  async completeSession(userId: number, sessionId: number): Promise<TodayStudy> {
    const session = await this.repository.findSessionById(userId, sessionId);
    if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Study session not found' });
    const outcome = await this.repository.completeSessionAndAdvance(
      userId, sessionId, requiredTaskKeys(session.mode), this.now(),
    );
    if (outcome === 'missing_tasks') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Complete the required tasks first' });
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
        coreIsTimedReview: false,
      };
    } else {
      selection = await this.selectProblems(userId, curriculumDay, now);
    }
    const bounds = weekBounds(now);
    const weeklyCompleted = await this.repository.countCompletedSessions(userId, bounds.start, bounds.end);
    const gentleRestart = shouldGentleRestart(profile.lastCompletedAt, now);
    const mode = session?.mode ?? (gentleRestart ? 'minimum' : 'standard');
    return {
      profile,
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

const problemFields = {
  id: problems.id,
  frontendId: problems.frontendId,
  titleSlug: problems.titleSlug,
  titleEn: problems.titleEn,
  titleZh: problems.titleZh,
  difficulty: problems.difficulty,
};

export function createDrizzleStudyRepository(db: DrizzleDb): StudyRepository {
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
          curriculumDayIndex: input.curriculumDayIndex, mode: input.mode, startedAt: input.now,
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
    async setSessionMode(userId, sessionId, mode) {
      await db.update(studySessions).set({ mode }).where(and(
        eq(studySessions.id, sessionId), eq(studySessions.userId, userId), eq(studySessions.status, 'in_progress'),
      ));
      const rows = await db.select().from(studySessions).where(and(
        eq(studySessions.id, sessionId), eq(studySessions.userId, userId), eq(studySessions.status, 'in_progress'),
      )).limit(1);
      return (rows[0] as StudySessionRecord | undefined) ?? null;
    },
    async completeTask(userId, sessionId, taskKey, now) {
      const sessions = await db.select({ id: studySessions.id }).from(studySessions).where(and(
        eq(studySessions.id, sessionId), eq(studySessions.userId, userId), eq(studySessions.status, 'in_progress'),
      )).limit(1);
      if (!sessions[0]) return false;
      await db.update(studyTaskProgress).set({ status: 'completed', completedAt: now }).where(and(
        eq(studyTaskProgress.sessionId, sessionId), eq(studyTaskProgress.taskKey, taskKey),
      ));
      const rows = await db.select({ id: studyTaskProgress.id }).from(studyTaskProgress).where(and(
        eq(studyTaskProgress.sessionId, sessionId), eq(studyTaskProgress.taskKey, taskKey),
      )).limit(1);
      return !!rows[0];
    },
    async completeProblemTasks(userId, problemId, now) {
      const active = await db.select({ id: studySessions.id }).from(studySessions).where(and(
        eq(studySessions.userId, userId), eq(studySessions.status, 'in_progress'),
      ));
      if (active.length === 0) return 0;
      const activeIds = active.map((row) => row.id);
      const matching = await db.select({ id: studyTaskProgress.id }).from(studyTaskProgress).where(and(
        inArray(studyTaskProgress.sessionId, activeIds), eq(studyTaskProgress.problemId, problemId),
        inArray(studyTaskProgress.taskType, ['review', 'problem']), eq(studyTaskProgress.status, 'pending'),
      ));
      if (matching.length === 0) return 0;
      await db.update(studyTaskProgress).set({ status: 'completed', completedAt: now })
        .where(inArray(studyTaskProgress.id, matching.map((row) => row.id)));
      return matching.length;
    },
    async completeSessionAndAdvance(userId, sessionId, requiredKeys, now) {
      return db.transaction(async (tx) => {
        const sessions = await tx.select().from(studySessions).where(and(
          eq(studySessions.id, sessionId), eq(studySessions.userId, userId),
        )).limit(1);
        const session = sessions[0];
        if (!session) return 'not_found' as const;
        if (session.status === 'completed') return 'already_completed' as const;
        const completed = await tx.select({ key: studyTaskProgress.taskKey }).from(studyTaskProgress).where(and(
          eq(studyTaskProgress.sessionId, sessionId), eq(studyTaskProgress.status, 'completed'),
        ));
        const completeKeys = new Set(completed.map((row) => row.key));
        if (requiredKeys.some((key) => !completeKeys.has(key))) return 'missing_tasks' as const;
        await tx.update(studySessions).set({ status: 'completed', completedAt: now }).where(and(
          eq(studySessions.id, sessionId), eq(studySessions.status, 'in_progress'),
        ));
        await tx.update(studyProfiles).set({
          currentDayIndex: sql`${studyProfiles.currentDayIndex} + 1`, lastCompletedAt: now,
        }).where(eq(studyProfiles.userId, userId));
        return 'completed' as const;
      });
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
  return createDrizzleStudyRepository(db).completeProblemTasks(userId, problemId, now);
}
