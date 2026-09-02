import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

type PremiumProblem = {
  frontendId: number;
  titleEn: string;
  titleSlug: string;
};

function rangeDirectory(frontendId: number): string {
  const start = Math.floor(frontendId / 100) * 100;
  return `${String(start).padStart(4, '0')}-${String(start + 99).padStart(4, '0')}`;
}

function splitParameterNames(raw: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of raw) {
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
    if ('[({'.includes(ch)) depth += 1;
    else if (']})'.includes(ch)) depth = Math.max(0, depth - 1);
  }
  if (current.trim()) parts.push(current);
  return parts
    .map((part) => part.trim().replace(/^\*+/, '').split(/[:=]/, 1)[0]?.trim() ?? '')
    .filter((name) => name && name !== 'self' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
}

function extractCatalogStub(source: string): string | null {
  const solutionStart = source.indexOf('class Solution');
  if (solutionStart >= 0) {
    const match = source.slice(solutionStart).match(
      /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*?)\)\s*(?:->\s*([^:\n]+))?\s*:/,
    );
    if (!match) return null;
    const names = splitParameterNames(match[2]);
    const returnType = match[3]?.trim() === 'None' ? ' -> None' : '';
    return `class Solution:\n    def ${match[1]}(self${names.length ? `, ${names.join(', ')}` : ''})${returnType}:\n        pass`;
  }

  const classNames = Array.from(source.matchAll(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*:/gm), (match) => match[1])
    .filter((name) => !['ListNode', 'TreeNode', 'Node', 'TrieNode', 'BinaryIndexedTree'].includes(name));
  const className = classNames.at(-1);
  if (!className) return null;
  const classStart = source.lastIndexOf(`class ${className}`);
  const constructor = source.slice(classStart).match(/def\s+__init__\s*\(([\s\S]*?)\)\s*(?:->\s*[^:\n]+)?\s*:/);
  const names = constructor ? splitParameterNames(constructor[1]) : [];
  const rawConstructor = constructor?.[1] ?? '';
  const annotatedNames = names.map((name, index) => {
    if (index === 0 && /\bTreeNode\b/.test(rawConstructor)) return `${name}: TreeNode`;
    if (index === 0 && /\bIterator\b/.test(rawConstructor)) return `${name}: Iterator`;
    return name;
  });
  return `class ${className}:\n    def __init__(self${annotatedNames.length ? `, ${annotatedNames.join(', ')}` : ''}):\n        pass`;
}

async function fetchStub(problem: PremiumProblem): Promise<[string, string] | null> {
  const folder = `${String(problem.frontendId).padStart(4, '0')}.${problem.titleEn}`;
  const url = [
    'https://raw.githubusercontent.com/doocs/leetcode/main/solution',
    rangeDirectory(problem.frontendId),
    encodeURIComponent(folder),
    'Solution.py',
  ].join('/');
  const response = await fetch(url);
  if (!response.ok) return null;
  const stub = extractCatalogStub(await response.text());
  return stub ? [problem.titleSlug, stub] : null;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await connection.query(
    `SELECT frontendId, titleEn, titleSlug
       FROM problems
      WHERE category = 'algorithms' AND paidOnly = 1
      ORDER BY frontendId`,
  );
  await connection.end();

  const problems = rows as PremiumProblem[];
  const entries: Array<[string, string]> = [];
  const missing: string[] = [];
  for (let index = 0; index < problems.length; index += 20) {
    const batch = problems.slice(index, index + 20);
    const results = await Promise.all(batch.map(fetchStub));
    for (let offset = 0; offset < results.length; offset += 1) {
      const result = results[offset];
      if (result) entries.push(result);
      else missing.push(batch[offset].titleSlug);
    }
  }

  entries.sort(([left], [right]) => left.localeCompare(right));
  const lines = entries.map(([slug, stub]) => `  ${JSON.stringify(slug)}: ${JSON.stringify(stub)},`);
  const output = `/**
 * Compact LeetCode-compatible Python signatures used when the official API
 * withholds code snippets for premium problems.
 *
 * Method/class names and parameter names are interface facts. The catalog is
 * generated from the CC BY-SA 4.0 doocs/leetcode solution index; it contains
 * no solution implementations. Source: https://github.com/doocs/leetcode
 */
export const OFFLINE_PYTHON_SIGNATURES: Record<string, string> = {
${lines.join('\n')}
};
`;
  const target = path.resolve('server/judge/offlineSignatureCatalog.ts');
  await writeFile(target, output, 'utf8');
  console.log(`[offline-signatures] wrote ${entries.length} signatures; missing ${missing.length}`);
  if (missing.length) console.log(`[offline-signatures] missing: ${missing.join(', ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
