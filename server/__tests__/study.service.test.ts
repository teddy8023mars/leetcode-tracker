import { describe, expect, it } from 'vitest';

import { StudyService, type StudyRepository } from '../study/service';

type Profile = Awaited<ReturnType<StudyRepository['getOrCreateProfile']>>;
type Session = NonNullable<Awaited<ReturnType<StudyRepository['findSessionByDate']>>>;
type Task = Awaited<ReturnType<StudyRepository['listTasks']>>[number];

function createMemoryRepository(options: {
  progressBySlug?: Record<string, string | undefined>;
} = {}) {
  let profile: Profile | null = null;
  const sessions: Session[] = [];
  const tasks: Task[] = [];
  let nextSessionId = 1;
  const problems = [
    { id: 1, frontendId: 1, titleSlug: 'two-sum', titleEn: 'Two Sum', titleZh: '两数之和', difficulty: 'Easy' as const },
    { id: 2, frontendId: 217, titleSlug: 'contains-duplicate', titleEn: 'Contains Duplicate', titleZh: '存在重复元素', difficulty: 'Easy' as const },
    { id: 3, frontendId: 242, titleSlug: 'valid-anagram', titleEn: 'Valid Anagram', titleZh: '有效的字母异位词', difficulty: 'Easy' as const },
  ];

  const repository: StudyRepository = {
    async getOrCreateProfile(userId) {
      profile ??= { id: 1, userId, currentDayIndex: 0, targetDaysPerWeek: 5, standardMinutes: 90, minimumMinutes: 25, lastCompletedAt: null };
      return profile;
    },
    async findSessionByDate(userId, localDate) {
      return sessions.find((session) => session.userId === userId && session.localDate === localDate) ?? null;
    },
    async findSessionById(userId, sessionId) {
      return sessions.find((session) => session.userId === userId && session.id === sessionId) ?? null;
    },
    async createSessionWithTasks(input) {
      const existing = sessions.find((session) => session.userId === input.userId && session.localDate === input.localDate);
      if (existing) return existing;
      const session: Session = {
        id: nextSessionId++, userId: input.userId, localDate: input.localDate,
        curriculumDayIndex: input.curriculumDayIndex, mode: input.mode,
        coreIsTimedReview: input.coreIsTimedReview,
        status: 'in_progress', startedAt: input.now, completedAt: null,
      };
      sessions.push(session);
      input.tasks.forEach((task, index) => tasks.push({
        id: tasks.length + index + 1, sessionId: session.id, taskKey: task.taskKey,
        taskType: task.taskType, problemId: task.problemId, status: 'pending', completedAt: null,
      }));
      return session;
    },
    async listTasks(sessionId) { return tasks.filter((task) => task.sessionId === sessionId); },
    async setSessionMode(userId, sessionId, localDate, mode) {
      const session = sessions.find((item) => item.userId === userId && item.id === sessionId
        && item.localDate === localDate && item.status === 'in_progress');
      if (!session) return null;
      session.mode = mode;
      return session;
    },
    async completeTask(userId, sessionId, localDate, taskKey, now) {
      const session = sessions.find((item) => item.userId === userId && item.id === sessionId
        && item.localDate === localDate && item.status === 'in_progress');
      const task = session && tasks.find((item) => item.sessionId === sessionId && item.taskKey === taskKey);
      if (!task) return false;
      task.status = 'completed'; task.completedAt = now;
      return true;
    },
    async completeProblemTasks(userId, problemId, localDate, now) {
      const activeIds = new Set(sessions.filter((session) => session.userId === userId
        && session.localDate === localDate && session.status === 'in_progress').map((session) => session.id));
      let changed = 0;
      for (const task of tasks) {
        if (activeIds.has(task.sessionId) && task.problemId === problemId && (task.taskType === 'review' || task.taskType === 'problem') && task.status === 'pending') {
          task.status = 'completed'; task.completedAt = now; changed += 1;
        }
      }
      return changed;
    },
    async completeSessionAndAdvance(userId, sessionId, localDate, now) {
      const session = sessions.find((item) => item.userId === userId && item.id === sessionId);
      if (!session) return 'not_found';
      if (session.status === 'completed') return 'already_completed';
      if (session.localDate !== localDate || profile?.currentDayIndex !== session.curriculumDayIndex) {
        return 'stale_session';
      }
      const completeKeys = new Set(tasks.filter((task) => task.sessionId === sessionId && task.status === 'completed').map((task) => task.taskKey));
      const requiredKeys = session.mode === 'minimum'
        ? ['review'] as const
        : ['review', 'problem', 'career'] as const;
      if (requiredKeys.some((key) => !completeKeys.has(key))) return 'missing_tasks';
      session.status = 'completed'; session.completedAt = now;
      profile!.currentDayIndex += 1; profile!.lastCompletedAt = now;
      return 'completed';
    },
    async countCompletedSessions(userId, start, end) {
      return sessions.filter((session) => session.userId === userId && session.status === 'completed' && session.localDate >= start && session.localDate <= end).length;
    },
    async findProblemsBySlugs(slugs) { return problems.filter((problem) => slugs.includes(problem.titleSlug)); },
    async findProblemsByIds(ids) { return problems.filter((problem) => ids.includes(problem.id)); },
    async getProgressBySlugs() { return options.progressBySlug ?? {}; },
    async findDueReview() { return null; },
    async findOldestCompleted() { return null; },
  };
  return {
    repository,
    getProfile: () => profile,
    getSessions: () => sessions,
    getTasks: () => tasks,
  };
}

describe('StudyService', () => {
  it('starts idempotently and advances by one curriculum day after a long gap', async () => {
    const memory = createMemoryRepository();
    let now = new Date(2026, 8, 1, 8);
    const service = new StudyService(memory.repository, () => now);

    const first = await service.startToday(1, 'standard');
    const again = await service.startToday(1, 'minimum');
    expect(again.session?.id).toBe(first.session?.id);
    expect(again.session?.mode).toBe('standard');
    expect(first.tasks.map((task) => task.taskKey)).toEqual(['review', 'problem', 'career']);
    expect(first.profile).toMatchObject({ standardMinutes: 70, minimumMinutes: 10 });

    await service.completeMatchingStudyProblemTasks(1, first.reviewProblem!.id);
    await service.completeMatchingStudyProblemTasks(1, first.coreProblem!.id);
    await service.completeTask(1, first.session!.id, 'career');
    await service.completeSession(1, first.session!.id);

    now = new Date(2026, 8, 9, 8);
    const later = await service.startToday(1, 'standard');
    expect(later.session?.curriculumDayIndex).toBe(1);
    expect(later.gentleRestart).toBe(true);
  });

  it('blocks an incomplete standard session, then permits minimum completion exactly once', async () => {
    const memory = createMemoryRepository();
    const service = new StudyService(memory.repository, () => new Date(2026, 8, 1, 8));
    const today = await service.startToday(1, 'standard');
    await service.completeMatchingStudyProblemTasks(1, today.reviewProblem!.id);

    await expect(service.completeSession(1, today.session!.id)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await service.setMode(1, today.session!.id, 'minimum');
    await service.completeSession(1, today.session!.id);
    await service.completeSession(1, today.session!.id);

    expect(memory.getProfile()?.currentDayIndex).toBe(1);
  });

  it('rejects every mutation against an unfinished prior-date session', async () => {
    const memory = createMemoryRepository();
    let now = new Date(2026, 8, 1, 8);
    const service = new StudyService(memory.repository, () => now);
    const old = await service.startToday(1, 'standard');

    await service.completeMatchingStudyProblemTasks(1, old.reviewProblem!.id);
    now = new Date(2026, 8, 2, 8);
    const current = await service.startToday(1, 'standard');

    await expect(service.setMode(1, old.session!.id, 'minimum')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.completeTask(1, old.session!.id, 'career')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.completeSession(1, old.session!.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(memory.getProfile()?.currentDayIndex).toBe(0);
    expect(current.session?.curriculumDayIndex).toBe(0);
  });

  it('matches problem progress only to today\'s unfinished session', async () => {
    const memory = createMemoryRepository();
    let now = new Date(2026, 8, 1, 8);
    const service = new StudyService(memory.repository, () => now);
    const old = await service.startToday(1, 'standard');

    now = new Date(2026, 8, 2, 8);
    const current = await service.startToday(1, 'standard');
    const changed = await service.completeMatchingStudyProblemTasks(1, current.coreProblem!.id);

    expect(changed).toBe(2);
    const oldProblemTasks = memory.getTasks().filter((task) => (
      task.sessionId === old.session!.id && (task.taskKey === 'review' || task.taskKey === 'problem')
    ));
    expect(oldProblemTasks.every((task) => task.status === 'pending')).toBe(true);
    const currentProblemTasks = memory.getTasks().filter((task) => (
      task.sessionId === current.session!.id && (task.taskKey === 'review' || task.taskKey === 'problem')
    ));
    expect(currentProblemTasks.every((task) => task.status === 'completed')).toBe(true);
  });

  it('preserves the timed-review label after an all-completed session is persisted', async () => {
    const memory = createMemoryRepository({
      progressBySlug: {
        'two-sum': 'done',
        'contains-duplicate': 'done',
        'valid-anagram': 'done',
      },
    });
    const service = new StudyService(memory.repository, () => new Date(2026, 8, 1, 8));

    const started = await service.startToday(1, 'standard');
    const resumed = await service.today(1);

    expect(started.coreProblem?.titleSlug).toBe('two-sum');
    expect(started.coreIsTimedReview).toBe(true);
    expect(resumed.coreIsTimedReview).toBe(true);
  });
});
