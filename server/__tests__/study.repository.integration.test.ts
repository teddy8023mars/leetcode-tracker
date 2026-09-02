import { describe, expect, it } from 'vitest';

import { StudyService } from '../study/service';
import { createInMemoryDb } from '../testHelpers/inMemoryDb';
import { createSqliteStudyRepository } from '../testHelpers/sqliteStudyRepository';

function setupStudyDb() {
  const { sqlite } = createInMemoryDb();
  sqlite.prepare("INSERT INTO users (id, openId) VALUES (1, 'local-dev')").run();
  const insertProblem = sqlite.prepare(
    `INSERT INTO problems (id, frontendId, titleSlug, titleEn, titleZh, difficulty)
     VALUES (?, ?, ?, ?, ?, 'Easy')`,
  );
  insertProblem.run(1, 1, 'two-sum', 'Two Sum', '两数之和');
  insertProblem.run(2, 217, 'contains-duplicate', 'Contains Duplicate', '存在重复元素');
  insertProblem.run(3, 242, 'valid-anagram', 'Valid Anagram', '有效的字母异位词');
  insertProblem.run(99, 9999, 'unrelated-problem', 'Unrelated', '无关题目');
  return { sqlite, repository: createSqliteStudyRepository(sqlite) };
}

function taskStatuses(sqlite: ReturnType<typeof setupStudyDb>['sqlite'], sessionId: number) {
  return sqlite.prepare(
    'SELECT taskKey, status FROM studyTaskProgress WHERE sessionId = ? ORDER BY taskKey',
  ).all(sessionId);
}

describe('SQLite-backed StudyRepository integration', () => {
  it('creates no backlog and rejects every prior-date mutation while matching only today', async () => {
    const { sqlite, repository } = setupStudyDb();
    let now = new Date(2026, 8, 1, 8);
    const service = new StudyService(repository, () => now);
    const old = await service.startToday(1, 'standard');

    now = new Date(2026, 8, 2, 8);
    const current = await service.startToday(1, 'standard');
    expect(current.session?.curriculumDayIndex).toBe(0);
    expect(current.session?.id).not.toBe(old.session?.id);

    await expect(service.setMode(1, old.session!.id, 'minimum')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.completeTask(1, old.session!.id, 'career')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await service.completeMatchingStudyProblemTasks(1, 99)).toBe(0);
    expect(await service.completeMatchingStudyProblemTasks(1, current.coreProblem!.id)).toBe(2);
    expect(taskStatuses(sqlite, old.session!.id)).toEqual([
      { taskKey: 'career', status: 'pending' },
      { taskKey: 'problem', status: 'pending' },
      { taskKey: 'review', status: 'pending' },
    ]);
    expect(taskStatuses(sqlite, current.session!.id)).toEqual([
      { taskKey: 'career', status: 'pending' },
      { taskKey: 'problem', status: 'completed' },
      { taskKey: 'review', status: 'completed' },
    ]);

    sqlite.prepare(
      "UPDATE studyTaskProgress SET status = 'completed' WHERE sessionId = ?",
    ).run(old.session!.id);
    await expect(service.completeSession(1, old.session!.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(sqlite.prepare('SELECT currentDayIndex FROM studyProfiles WHERE userId = 1').get())
      .toEqual({ currentDayIndex: 0 });
  });

  it('selects persisted due, completed, and curriculum-easy warm-up fallbacks', async () => {
    const dueSetup = setupStudyDb();
    dueSetup.sqlite.prepare(
      `INSERT INTO userProgress
        (userId, problemId, status, nextReviewAt, lastReviewedAt, firstCompletedAt)
       VALUES (1, 2, 'done', '2026-08-31T08:00:00.000Z', '2026-08-01T08:00:00.000Z', '2026-08-01T08:00:00.000Z')`,
    ).run();
    const due = await new StudyService(
      dueSetup.repository, () => new Date(2026, 8, 1, 8),
    ).today(1);
    expect(due.reviewProblem?.titleSlug).toBe('contains-duplicate');

    const completedSetup = setupStudyDb();
    completedSetup.sqlite.prepare(
      `INSERT INTO userProgress
        (userId, problemId, status, nextReviewAt, lastReviewedAt, firstCompletedAt)
       VALUES (1, 2, 'done', '2026-09-30T08:00:00.000Z', '2026-08-01T08:00:00.000Z', '2026-08-01T08:00:00.000Z')`,
    ).run();
    const completed = await new StudyService(
      completedSetup.repository, () => new Date(2026, 8, 1, 8),
    ).today(1);
    expect(completed.reviewProblem?.titleSlug).toBe('contains-duplicate');

    const easySetup = setupStudyDb();
    const easy = await new StudyService(
      easySetup.repository, () => new Date(2026, 8, 1, 8),
    ).today(1);
    expect(easy.reviewProblem?.titleSlug).toBe('two-sum');
  });

  it('uses the first unfinished core fallback and durably labels an all-completed timed review', async () => {
    const fallbackSetup = setupStudyDb();
    fallbackSetup.sqlite.prepare(
      `INSERT INTO userProgress (userId, problemId, status, firstCompletedAt)
       VALUES (1, 1, 'done', '2026-08-01T08:00:00.000Z')`,
    ).run();
    const fallback = await new StudyService(
      fallbackSetup.repository, () => new Date(2026, 8, 1, 8),
    ).today(1);
    expect(fallback.coreProblem?.titleSlug).toBe('contains-duplicate');
    expect(fallback.coreIsTimedReview).toBe(false);

    const timedSetup = setupStudyDb();
    for (const problemId of [1, 2, 3]) {
      timedSetup.sqlite.prepare(
        `INSERT INTO userProgress (userId, problemId, status, firstCompletedAt)
         VALUES (1, ?, 'done', '2026-08-01T08:00:00.000Z')`,
      ).run(problemId);
    }
    const timedService = new StudyService(
      timedSetup.repository, () => new Date(2026, 8, 1, 8),
    );
    const started = await timedService.startToday(1, 'standard');
    const resumed = await timedService.today(1);

    expect(started.coreProblem?.titleSlug).toBe('two-sum');
    expect(started.coreIsTimedReview).toBe(true);
    expect(resumed.coreIsTimedReview).toBe(true);
    expect(timedSetup.sqlite.prepare(
      'SELECT coreIsTimedReview FROM studySessions WHERE id = ?',
    ).get(started.session!.id)).toEqual({ coreIsTimedReview: 1 });
  });

  it('counts completed local dates only inside the current Monday-Sunday week', async () => {
    const { sqlite, repository } = setupStudyDb();
    sqlite.prepare('INSERT INTO studyProfiles (userId) VALUES (1)').run();
    const insert = sqlite.prepare(
      `INSERT INTO studySessions (userId, localDate, curriculumDayIndex, mode, status)
       VALUES (1, ?, 0, 'minimum', ?)`,
    );
    insert.run('2026-08-30', 'completed');
    insert.run('2026-08-31', 'completed');
    insert.run('2026-09-03', 'in_progress');
    insert.run('2026-09-06', 'completed');
    insert.run('2026-09-07', 'completed');

    const today = await new StudyService(
      repository, () => new Date(2026, 8, 2, 8),
    ).today(1);

    expect(today.weeklyCompleted).toBe(2);
  });
});
