import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

import { buildHarness, parseHarnessOutput } from '../server/judge/harnessTemplates';
import { runUserCode } from '../server/judge/sandboxRunner';
import { buildOfficialExampleSuite, type ProblemPromptInput } from '../server/judge/testcaseGenerator';

type PremiumProblem = ProblemPromptInput & {
  frontendId: number;
  paidOnly: boolean;
};

function rangeDirectory(frontendId: number): string {
  const start = Math.floor(frontendId / 100) * 100;
  return `${String(start).padStart(4, '0')}-${String(start + 99).padStart(4, '0')}`;
}

function solutionUrl(problem: PremiumProblem): string {
  const folder = `${String(problem.frontendId).padStart(4, '0')}.${problem.titleEn}`;
  return [
    'https://raw.githubusercontent.com/doocs/leetcode/main/solution',
    rangeDirectory(problem.frontendId),
    encodeURIComponent(folder),
    'Solution.py',
  ].join('/');
}

async function auditProblem(problem: PremiumProblem): Promise<{ slug: string; result: string }> {
  const suite = buildOfficialExampleSuite(problem, { allowUnverifiedSignatures: true });
  if (!suite) return { slug: problem.titleSlug, result: 'no-suite' };
  const response = await fetch(solutionUrl(problem));
  if (!response.ok) return { slug: problem.titleSlug, result: `no-reference:${response.status}` };
  const userCode = await response.text();
  const stdin = JSON.stringify({
    methodName: suite.methodName,
    cases: suite.cases,
    comparison: suite.comparison,
    resultFromArg: suite.resultFromArg,
    className: suite.className,
    inputAdapter: suite.inputAdapter,
    resultAdapter: suite.resultAdapter,
    validator: suite.validator,
  });
  const run = await runUserCode({
    language: 'python',
    source: buildHarness({ language: 'python', userCode }),
    stdin,
    timeoutMs: 8000,
  });
  if (!run.ok) return { slug: problem.titleSlug, result: run.reason ?? 'runner-failed' };
  const parsed = parseHarnessOutput(run.stdout);
  if (!parsed.summary) return { slug: problem.titleSlug, result: 'no-summary' };
  if (parsed.summary.total !== suite.cases.length) return { slug: problem.titleSlug, result: 'wrong-total' };
  if (parsed.summary.passed !== parsed.summary.total) {
    const firstFailure = parsed.cases.find((item) => !item.ok);
    return {
      slug: problem.titleSlug,
      result: firstFailure?.error ? `failed:${firstFailure.error.split('\n', 1)[0]}` : 'wrong-answer',
    };
  }
  return { slug: problem.titleSlug, result: 'verified' };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await connection.query(
    `SELECT frontendId, titleSlug, titleEn, contentEn, contentZh, difficulty,
            codeSnippetsJson, exampleTestcases, paidOnly
       FROM problems
      WHERE category = 'algorithms' AND paidOnly = 1
      ORDER BY frontendId`,
  );
  await connection.end();

  const results: Array<{ slug: string; result: string }> = [];
  const problems = (rows as PremiumProblem[]).map((problem) => ({
    ...problem,
    codeSnippetsJson: typeof problem.codeSnippetsJson === 'string'
      ? JSON.parse(problem.codeSnippetsJson)
      : problem.codeSnippetsJson,
  }));
  for (let index = 0; index < problems.length; index += 8) {
    results.push(...await Promise.all(problems.slice(index, index + 8).map(auditProblem)));
  }
  const counts = results.reduce<Record<string, number>>((acc, item) => {
    const category = item.result.split(':', 1)[0];
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});
  if (process.argv.includes('--write-verified')) {
    const verified = results
      .filter((item) => item.result === 'verified')
      .map((item) => item.slug)
      .sort();
    const output = `/** Premium problem slugs whose generated example suites passed a public reference solution. */\nexport const OFFLINE_REFERENCE_VERIFIED_PROBLEMS = new Set<string>([\n${verified.map((slug) => `  ${JSON.stringify(slug)},`).join('\n')}\n]);\n`;
    await writeFile(path.resolve('server/judge/offlineVerifiedCatalog.ts'), output, 'utf8');
  }
  console.log(JSON.stringify({ counts, failures: results.filter((item) => item.result !== 'verified') }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
