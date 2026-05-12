import { describe, it, expect } from 'vitest';
import {
  aiSolutions, aiGenerationLocks, userProgress, attempts, syncLogs,
} from '../../drizzle/schema';
import { getTableConfig } from 'drizzle-orm/mysql-core';

describe('schema/userAndSync', () => {
  it('aiSolutions unique on (problemId,language)', () => {
    const cols = getTableConfig(aiSolutions).uniqueConstraints
      .flatMap(u => u.columns.map(c => c.name)).sort();
    expect(cols).toEqual(['language','problemId']);
  });
  it('aiGenerationLocks unique on (problemId,language)', () => {
    const cols = getTableConfig(aiGenerationLocks).uniqueConstraints
      .flatMap(u => u.columns.map(c => c.name)).sort();
    expect(cols).toEqual(['language','problemId']);
  });
  it('userProgress unique on (userId,problemId)', () => {
    const cols = getTableConfig(userProgress).uniqueConstraints
      .flatMap(u => u.columns.map(c => c.name)).sort();
    expect(cols).toEqual(['problemId','userId']);
  });
  it('attempts has indexed (userId,attemptedAt)', () => {
    const idx = getTableConfig(attempts).indexes
      .flatMap(i => i.config.columns.map(c => (c as any).name));
    expect(idx).toContain('userId');
    expect(idx).toContain('attemptedAt');
  });
  it('syncLogs has indexed (syncType,startedAt)', () => {
    const idx = getTableConfig(syncLogs).indexes
      .flatMap(i => i.config.columns.map(c => (c as any).name));
    expect(idx).toContain('syncType');
    expect(idx).toContain('startedAt');
  });
});
