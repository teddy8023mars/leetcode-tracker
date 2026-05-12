import { describe, it, expect } from 'vitest';
import { createInMemoryDb } from '../testHelpers/inMemoryDb';

describe('testHelpers/inMemoryDb', () => {
  it('creates an isolated db with all sync tables', () => {
    const { sqlite } = createInMemoryDb();
    sqlite.exec(`INSERT INTO syncLogs (syncType, status) VALUES ('manual','success');`);
    const rows = sqlite.prepare(`SELECT syncType FROM syncLogs`).all() as Array<{ syncType: string }>;
    expect(rows[0].syncType).toBe('manual');
    sqlite.close();
  });
});
