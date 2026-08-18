import { describe, it, expect, afterEach } from 'vitest';
import { parseDatasetsResponse, __setLlmForTest } from '../judge/sqlDataGenerator';
import { nonInsertStatements, judgeSqlCases, type SqlJudgeOutcome } from '../judge/sqlJudge';

afterEach(() => __setLlmForTest(undefined));

describe('judge/sqlDataGenerator parseDatasetsResponse', () => {
  it('accepts datasets of INSERT statements', () => {
    const out = parseDatasetsResponse(
      JSON.stringify({
        datasets: [
          ["insert into T (id) values ('1')", "insert into T (id) values ('2')"],
          ["insert into T (id) values ('9')"],
        ],
      }),
    );
    expect(out).toHaveLength(2);
    expect(out![0]).toHaveLength(2);
  });

  it('drops statements that are not INSERTs and datasets that end up empty', () => {
    const out = parseDatasetsResponse(
      JSON.stringify({
        datasets: [
          ['drop table T', "insert into T (id) values ('1')"],
          ['delete from T'],
        ],
      }),
    );
    expect(out).toEqual([["insert into T (id) values ('1')"]]);
  });

  it('returns null for garbage or empty payloads', () => {
    expect(parseDatasetsResponse('not json')).toBeNull();
    expect(parseDatasetsResponse(JSON.stringify({ datasets: [] }))).toBeNull();
    expect(parseDatasetsResponse(JSON.stringify({ datasets: [['drop x']] }))).toBeNull();
  });
});

describe('judge/sqlJudge nonInsertStatements', () => {
  it('keeps CREATE and TRUNCATE, drops INSERTs', () => {
    expect(
      nonInsertStatements([
        'Create table If Not Exists T (id int)',
        'Truncate table T',
        "insert into T (id) values ('1')",
      ]),
    ).toEqual(['Create table If Not Exists T (id int)', 'Truncate table T']);
  });
});

describe('judge/sqlJudge judgeSqlCases', () => {
  const accepted: SqlJudgeOutcome = {
    verdict: 'accepted', runtimeMs: 5, columns: ['a'], expected: [['1']], actual: [['1']], stderr: '',
  };
  const wrong: SqlJudgeOutcome = {
    verdict: 'wrong_answer', runtimeMs: 5, columns: ['a'], expected: [['2']], actual: [['3']], stderr: '',
  };

  it('passes when every case matches, reporting the first case output', async () => {
    const r = await judgeSqlCases({
      cases: [['c1'], ['c2'], ['c3']],
      referenceSql: 'ref', userSql: 'user',
      judge: async () => accepted,
    });
    expect(r.verdict).toBe('accepted');
    expect(r.passedCount).toBe(3);
    expect(r.totalCount).toBe(3);
    expect(r.failedCaseIndex).toBeNull();
    expect(r.outcome.actual).toEqual([['1']]);
  });

  it('stops at the first failing case and reports its index and schemas', async () => {
    const seen: string[][] = [];
    const r = await judgeSqlCases({
      cases: [['c1'], ['c2'], ['c3']],
      referenceSql: 'ref', userSql: 'user',
      judge: async (args) => {
        seen.push(args.schemas);
        return args.schemas[0] === 'c2' ? wrong : accepted;
      },
    });
    expect(r.verdict).toBe('wrong_answer');
    expect(r.passedCount).toBe(1);
    expect(r.totalCount).toBe(3);
    expect(r.failedCaseIndex).toBe(1);
    expect(r.failedCaseSchemas).toEqual(['c2']);
    expect(r.outcome.expected).toEqual([['2']]);
    expect(seen).toHaveLength(2);
  });
});
