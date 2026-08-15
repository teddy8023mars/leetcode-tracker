import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  problems,
  problemSolutions,
  problemTestcases,
  submissions,
  type ProblemTestcase,
} from "../../drizzle/schema";

import { runUserCode, type SupportedLanguage } from "../judge/sandboxRunner";
import { judgeSql, isReadQuery } from "../judge/sqlJudge";
import { buildHarness, parseHarnessOutput, type CaseLine } from "../judge/harnessTemplates";
import { generateTestcaseSuite, type GeneratedSuite } from "../judge/testcaseGenerator";

const LanguageSchema = z.enum(["python", "java", "cpp"]);

type Verdict =
  | "accepted"
  | "wrong_answer"
  | "compile_error"
  | "runtime_error"
  | "time_limit_exceeded"
  | "internal_error";

interface JudgeOutcome {
  verdict: Verdict;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  cases: CaseLine[];
  firstFail?: {
    i: number;
    description: string;
    input: unknown;
    expected: unknown;
    actual: unknown;
    error: string | null;
  };
  stderr?: string;
  compileStderr?: string | null;
}

async function loadOrGenerateSuite(problemId: number): Promise<{ suite: GeneratedSuite; cached: boolean }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const cachedRows = (await db
    .select()
    .from(problemTestcases)
    .where(eq(problemTestcases.problemId, problemId))
    .limit(1)) as ProblemTestcase[];
  if (cachedRows[0]) {
    const cached = cachedRows[0].suiteJson as GeneratedSuite;
    // Backwards-compat: older cache rows may use `args` instead of `input`.
    // Normalize so the harness + UI never see the legacy shape.
    const normalized = {
      ...cached,
      cases: (cached.cases || []).map((c) => {
        const co = c as Record<string, unknown>;
        if (Array.isArray((co as { input?: unknown }).input)) return c;
        const fallback =
          Array.isArray(co.args) ? co.args :
          Array.isArray(co.arguments) ? co.arguments :
          Array.isArray(co.params) ? co.params : null;
        return fallback ? { ...c, input: fallback as unknown[] } : c;
      }),
    };
    return { suite: normalized, cached: true };
  }

  const problemRows = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);
  const problem = problemRows[0];
  if (!problem) throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found" });

  const suite = await generateTestcaseSuite({
    titleSlug: problem.titleSlug,
    titleEn: problem.titleEn,
    contentEn: problem.contentEn,
    contentZh: problem.contentZh,
    difficulty: problem.difficulty,
    codeSnippetsJson: problem.codeSnippetsJson,
    exampleTestcases: problem.exampleTestcases,
  });

  // If a reference solution was provided, run it once to recompute canonical
  // `expected` values — LLMs are notoriously bad at arithmetic.
  if (suite.referenceSolution && suite.referenceSolution.trim().length > 0) {
    try {
      const refSource = buildHarness({ language: "python", userCode: suite.referenceSolution });
      const refStdin = JSON.stringify({ methodName: suite.methodName, cases: suite.cases });
      const refRun = await runUserCode({
        language: "python",
        source: refSource,
        stdin: refStdin,
        timeoutMs: 8000,
      });
      if (refRun.ok) {
        const refParsed = parseHarnessOutput(refRun.stdout);
        // For each case where the reference produced an answer (no error), use that
        // as the canonical expected.
        for (const r of refParsed.cases) {
          if (r.error == null && suite.cases[r.i]) {
            suite.cases[r.i] = { ...suite.cases[r.i], expected: r.actual };
          }
        }
      } else {
        console.warn("[judge] reference solution failed to run; falling back to LLM expected. stderr=" + refRun.stderr.slice(0, 300));
      }
    } catch (e) {
      console.warn("[judge] reference solution execution threw; falling back to LLM expected", e);
    }
  }

  // Best-effort cache write; do not fail the run if cache write hits a race.
  try {
    await db.insert(problemTestcases).values({
      problemId,
      suiteJson: suite,
      source: "llm",
    });
  } catch (e) {
    console.warn("[judge] cache write failed (probably race); continuing", e);
  }
  return { suite, cached: false };
}

async function judgeOnce(
  language: SupportedLanguage,
  userCode: string,
  suite: GeneratedSuite,
): Promise<JudgeOutcome> {
  const source = buildHarness({ language, userCode });
  const stdin = JSON.stringify({ methodName: suite.methodName, cases: suite.cases });
  const run = await runUserCode({ language, source, stdin, timeoutMs: 5000 });

  if (run.reason === "compile_error") {
    return {
      verdict: "compile_error",
      passedCount: 0,
      totalCount: suite.cases.length,
      runtimeMs: run.timeMs,
      cases: [],
      stderr: run.stderr,
      compileStderr: run.compileStderr ?? run.stderr,
    };
  }

  if (run.reason === "timeout") {
    return {
      verdict: "time_limit_exceeded",
      passedCount: 0,
      totalCount: suite.cases.length,
      runtimeMs: run.timeMs,
      cases: [],
      stderr: run.stderr,
    };
  }

  const parsed = parseHarnessOutput(run.stdout);

  if (parsed.summary?.fatal === true) {
    const firstCase = parsed.cases[0];
    return {
      verdict: "runtime_error",
      passedCount: 0,
      totalCount: suite.cases.length,
      runtimeMs: run.timeMs,
      cases: parsed.cases,
      firstFail: firstCase
        ? {
            i: firstCase.i,
            description: `Case ${firstCase.i + 1}`,
            input: suite.cases[firstCase.i]?.input ?? null,
            expected: suite.cases[firstCase.i]?.expected ?? null,
            actual: firstCase.actual,
            error: firstCase.error,
          }
        : undefined,
      stderr: run.stderr,
    };
  }

  if (!parsed.summary) {
    return {
      verdict: "runtime_error",
      passedCount: 0,
      totalCount: suite.cases.length,
      runtimeMs: run.timeMs,
      cases: parsed.cases,
      stderr:
        (run.stderr || "") +
        (parsed.parseErrors.length
          ? "\nUnparsed lines: " + parsed.parseErrors.slice(0, 3).join(" | ")
          : ""),
    };
  }

  const passed = parsed.summary.passed;
  const total = parsed.summary.total || suite.cases.length;
  if (passed === total && total > 0) {
    return {
      verdict: "accepted",
      passedCount: passed,
      totalCount: total,
      runtimeMs: run.timeMs,
      cases: parsed.cases,
    };
  }

  const failedCase = parsed.cases.find((c) => !c.ok);
  return {
    verdict: failedCase?.error ? "runtime_error" : "wrong_answer",
    passedCount: passed,
    totalCount: total,
    runtimeMs: run.timeMs,
    cases: parsed.cases,
    firstFail: failedCase
      ? {
          i: failedCase.i,
          description: `Case ${failedCase.i + 1}`,
          input: suite.cases[failedCase.i]?.input ?? null,
          expected: suite.cases[failedCase.i]?.expected ?? null,
          actual: failedCase.actual,
          error: failedCase.error,
        }
      : undefined,
    stderr: run.stderr,
  };
}

export const judgeRouter = router({
  /**
   * Submit user code, run against (cached or freshly generated) testcases,
   * persist a Submission row, return the verdict.
   */
  run: protectedProcedure
    .input(
      z.object({
        problemId: z.number().int().positive(),
        language: LanguageSchema,
        code: z.string().min(1).max(50_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      let outcome: JudgeOutcome;
      try {
        const { suite } = await loadOrGenerateSuite(input.problemId);
        outcome = await judgeOnce(input.language, input.code, suite);
      } catch (e) {
        console.error("[judge.run] internal error", e);
        outcome = {
          verdict: "internal_error",
          passedCount: 0,
          totalCount: 0,
          runtimeMs: 0,
          cases: [],
          stderr: e instanceof Error ? e.message : String(e),
        };
      }

      const insertRes = await db.insert(submissions).values({
        userId,
        problemId: input.problemId,
        language: input.language,
        code: input.code,
        verdict: outcome.verdict,
        passedCount: outcome.passedCount,
        totalCount: outcome.totalCount,
        firstFailInput:
          outcome.firstFail !== undefined
            ? JSON.stringify(outcome.firstFail.input).slice(0, 4000)
            : null,
        firstFailExpected:
          outcome.firstFail !== undefined
            ? JSON.stringify(outcome.firstFail.expected).slice(0, 4000)
            : null,
        firstFailActual:
          outcome.firstFail !== undefined
            ? JSON.stringify(outcome.firstFail.actual).slice(0, 4000)
            : null,
        resultJson: {
          cases: outcome.cases,
          firstFail: outcome.firstFail ?? null,
          stderr: (outcome.stderr || "").slice(0, 4000),
          compileStderr: outcome.compileStderr ?? null,
        },
        runtimeMs: outcome.runtimeMs,
      });
      const submissionId =
        Array.isArray(insertRes) && (insertRes[0] as { insertId?: number })?.insertId
          ? (insertRes[0] as { insertId: number }).insertId
          : 0;

      return {
        submissionId,
        verdict: outcome.verdict,
        passedCount: outcome.passedCount,
        totalCount: outcome.totalCount,
        runtimeMs: outcome.runtimeMs,
        firstFail: outcome.firstFail ?? null,
        cases: outcome.cases,
        stderr: (outcome.stderr || "").slice(0, 4000),
        compileStderr: outcome.compileStderr ?? null,
      };
    }),

  /**
   * Judge a SQL query locally: replay the problem's example schema into a
   * scratch database and compare the user's result set against the one
   * produced by the imported reference solution.
   */
  runSql: protectedProcedure
    .input(
      z.object({
        problemId: z.number().int().positive(),
        code: z.string().min(1).max(20_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const problemRows = await db
        .select()
        .from(problems)
        .where(eq(problems.id, input.problemId))
        .limit(1);
      const problem = problemRows[0];
      if (!problem) throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found" });

      const schemas = (problem.mysqlSchemasJson ?? []) as string[];

      const sols = await db
        .select()
        .from(problemSolutions)
        .where(
          and(
            eq(problemSolutions.problemId, input.problemId),
            eq(problemSolutions.source, "community"),
          ),
        );
      const solMd =
        sols.find((s) => s.language === "zh")?.contentMarkdown ??
        sols[0]?.contentMarkdown ??
        "";
      const referenceSql = solMd.match(/```sql\s*\n([\s\S]*?)```/i)?.[1]?.trim() ?? null;

      if (schemas.length === 0 || !referenceSql || !isReadQuery(referenceSql)) {
        // Premium problems have no example schema; a few solutions are
        // pandas-only or data-modifying — those can't be judged locally.
        return { supported: false as const };
      }

      const outcome = await judgeSql({
        schemas,
        referenceSql,
        userSql: input.code,
      });

      await db.insert(submissions).values({
        userId: ctx.user.id,
        problemId: input.problemId,
        language: "mysql",
        code: input.code,
        verdict: outcome.verdict,
        passedCount: outcome.verdict === "accepted" ? 1 : 0,
        totalCount: 1,
        resultJson: {
          columns: outcome.columns,
          expected: outcome.expected,
          actual: outcome.actual,
          stderr: outcome.stderr.slice(0, 4000),
        },
        runtimeMs: outcome.runtimeMs,
      });

      return {
        supported: true as const,
        verdict: outcome.verdict,
        runtimeMs: outcome.runtimeMs,
        columns: outcome.columns,
        expected: outcome.expected,
        actual: outcome.actual,
        stderr: outcome.stderr.slice(0, 4000),
      };
    }),

  /** Recent submissions for the current user on a given problem. */
  listSubmissions: protectedProcedure
    .input(
      z.object({
        problemId: z.number().int().positive(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: submissions.id,
          language: submissions.language,
          verdict: submissions.verdict,
          passedCount: submissions.passedCount,
          totalCount: submissions.totalCount,
          runtimeMs: submissions.runtimeMs,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .where(and(eq(submissions.userId, ctx.user.id), eq(submissions.problemId, input.problemId)))
        .orderBy(desc(submissions.createdAt))
        .limit(input.limit);
      return rows;
    }),

  /** Full detail of one submission, owner-only. */
  getSubmission: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.id, input.id), eq(submissions.userId, ctx.user.id)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
      return row;
    }),
});
