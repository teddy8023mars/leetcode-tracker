import { describe, it, expect } from 'vitest';
import { splitSqlDump } from '../_core/seedImport';

describe('_core/seedImport splitSqlDump', () => {
  it('splits single-line statements and multi-line CREATE TABLE blocks', () => {
    const dump = [
      '-- MySQL dump 10.13',
      '',
      'DROP TABLE IF EXISTS `problems`;',
      'CREATE TABLE `problems` (',
      '  `id` int NOT NULL,',
      '  `titleSlug` varchar(255)',
      ');',
      "INSERT INTO `problems` VALUES (1,'two-sum'),(2,'add-two;numbers');",
    ].join('\n');
    const stmts = splitSqlDump(dump);
    expect(stmts).toHaveLength(3);
    expect(stmts[0]).toBe('DROP TABLE IF EXISTS `problems`;');
    expect(stmts[1]).toContain('CREATE TABLE `problems`');
    expect(stmts[1]).toContain('varchar(255)');
    expect(stmts[2]).toContain("add-two;numbers");
  });

  it('keeps conditional /*! ... */ statements and drops comment/blank lines', () => {
    const dump = [
      '/*!40101 SET NAMES utf8mb4 */;',
      '-- comment',
      '',
      'LOCK TABLES `t` WRITE;',
      'UNLOCK TABLES;',
    ].join('\n');
    const stmts = splitSqlDump(dump);
    expect(stmts).toEqual([
      '/*!40101 SET NAMES utf8mb4 */;',
      'LOCK TABLES `t` WRITE;',
      'UNLOCK TABLES;',
    ]);
  });

  it('returns [] for empty input', () => {
    expect(splitSqlDump('')).toEqual([]);
    expect(splitSqlDump('-- only comments\n')).toEqual([]);
  });
});
