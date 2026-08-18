import { describe, it, expect, afterEach } from 'vitest';
import {
  SQL_TOPICS,
  classifySqlProblem,
  __setLlmForTest,
} from '../sync/sqlTopics';

afterEach(() => __setLlmForTest(undefined));

function fakeLlm(content: string) {
  return async () => ({ choices: [{ message: { content } }] });
}

describe('sync/sqlTopics classifySqlProblem', () => {
  it('maps valid slugs from the LLM response to {slug, name} tags', async () => {
    __setLlmForTest(fakeLlm(JSON.stringify({ topics: ['sql-join', 'sql-window'] })));
    const tags = await classifySqlProblem({
      titleEn: 'Trips and Users',
      contentEn: '<p>...</p>',
      referenceSql: 'SELECT ... FROM Trips JOIN Users ...',
    });
    expect(tags).toEqual([
      { slug: 'sql-join', name: SQL_TOPICS.find(t => t.slug === 'sql-join')!.name },
      { slug: 'sql-window', name: SQL_TOPICS.find(t => t.slug === 'sql-window')!.name },
    ]);
  });

  it('drops unknown slugs and dedupes', async () => {
    __setLlmForTest(
      fakeLlm(JSON.stringify({ topics: ['sql-join', 'bogus-topic', 'sql-join'] })),
    );
    const tags = await classifySqlProblem({
      titleEn: 'X',
      contentEn: null,
      referenceSql: null,
    });
    expect(tags).toEqual([
      { slug: 'sql-join', name: SQL_TOPICS.find(t => t.slug === 'sql-join')!.name },
    ]);
  });

  it('returns null when the response is not parseable or has no valid topics', async () => {
    __setLlmForTest(fakeLlm('not json at all'));
    expect(
      await classifySqlProblem({ titleEn: 'X', contentEn: null, referenceSql: null }),
    ).toBeNull();

    __setLlmForTest(fakeLlm(JSON.stringify({ topics: ['nope'] })));
    expect(
      await classifySqlProblem({ titleEn: 'X', contentEn: null, referenceSql: null }),
    ).toBeNull();
  });
});
