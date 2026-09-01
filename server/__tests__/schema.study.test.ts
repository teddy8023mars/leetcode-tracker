import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/mysql-core';

import { studyProfiles, studySessions, studyTaskProgress } from '../../drizzle/schema';
import { createInMemoryDb } from '../testHelpers/inMemoryDb';

describe('study persistence schema', () => {
  it('exposes the uniqueness rules through Drizzle', () => {
    const profileUnique = getTableConfig(studyProfiles).uniqueConstraints
      .flatMap((constraint) => constraint.columns.map((column) => column.name));
    const sessionUnique = getTableConfig(studySessions).uniqueConstraints
      .flatMap((constraint) => constraint.columns.map((column) => column.name)).sort();
    const taskUnique = getTableConfig(studyTaskProgress).uniqueConstraints
      .flatMap((constraint) => constraint.columns.map((column) => column.name)).sort();

    expect(profileUnique).toEqual(['userId']);
    expect(sessionUnique).toEqual(['localDate', 'userId']);
    expect(taskUnique).toEqual(['sessionId', 'taskKey']);
  });

  it('enforces one profile, one local-date session, and one task key in SQLite tests', () => {
    const { sqlite } = createInMemoryDb();
    sqlite.prepare("INSERT INTO users (id, openId) VALUES (1, 'local-dev')").run();
    sqlite.prepare('INSERT INTO studyProfiles (userId) VALUES (1)').run();
    expect(() => sqlite.prepare('INSERT INTO studyProfiles (userId) VALUES (1)').run()).toThrow();

    sqlite.prepare("INSERT INTO studySessions (id,userId,localDate,curriculumDayIndex,mode,status) VALUES (1,1,'2026-09-01',0,'standard','in_progress')").run();
    expect(() => sqlite.prepare("INSERT INTO studySessions (userId,localDate,curriculumDayIndex,mode,status) VALUES (1,'2026-09-01',0,'minimum','in_progress')").run()).toThrow();

    sqlite.prepare("INSERT INTO studyTaskProgress (sessionId,taskKey,taskType,status) VALUES (1,'dsa','dsa_lesson','pending')").run();
    expect(() => sqlite.prepare("INSERT INTO studyTaskProgress (sessionId,taskKey,taskType,status) VALUES (1,'dsa','dsa_lesson','pending')").run()).toThrow();
  });
});
