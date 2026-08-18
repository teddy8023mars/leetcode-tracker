import { describe, it, expect } from 'vitest';
import { parseSqlSchemas } from '@/lib/sqlSchema';

describe('lib/sqlSchema parseSqlSchemas', () => {
  it('turns create + insert statements into named tables with rows', () => {
    const tables = parseSqlSchemas([
      'Create table If Not Exists Employee (id int, salary int)',
      'Truncate table Employee',
      "insert into Employee (id, salary) values ('1', '100')",
      "insert into Employee (id, salary) values ('2', '200')",
    ]);
    expect(tables).toEqual([
      {
        name: 'Employee',
        columns: ['id', 'salary'],
        rows: [
          ['1', '100'],
          ['2', '200'],
        ],
      },
    ]);
  });

  it('handles multiple tables, multi-row values, and parenthesised types', () => {
    const tables = parseSqlSchemas([
      'Create table If Not Exists Trips (id int, fare decimal(5,2))',
      'Create table If Not Exists Users (users_id int, banned varchar(30))',
      "insert into Trips (id, fare) values ('1', '10.50'), ('2', '7.00')",
      "insert into Users (users_id, banned) values ('10', 'No')",
    ]);
    expect(tables.map(t => t.name)).toEqual(['Trips', 'Users']);
    expect(tables[0].columns).toEqual(['id', 'fare']);
    expect(tables[0].rows).toEqual([
      ['1', '10.50'],
      ['2', '7.00'],
    ]);
    expect(tables[1].rows).toEqual([['10', 'No']]);
  });

  it('keeps commas inside quoted values and shows NULL as null', () => {
    const tables = parseSqlSchemas([
      'Create table If Not Exists T (a varchar(50), b int)',
      "insert into T (a, b) values ('x, y', NULL)",
    ]);
    expect(tables[0].rows).toEqual([['x, y', 'null']]);
  });

  it('returns [] when nothing is parseable', () => {
    expect(parseSqlSchemas(['garbage statement'])).toEqual([]);
    expect(parseSqlSchemas([])).toEqual([]);
  });
});
