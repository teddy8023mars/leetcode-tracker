import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import {
  InsertUser,
  users,
  problems,
  problemSolutions,
  companyTags,
  problemLists,
  problemListItems,
  syncLogs,
  userProgress,
  type InsertProblem,
  type Problem,
  type InsertProblemSolution,
  type InsertCompanyTag,
  type InsertProblemList,
  type InsertProblemListItem,
  type InsertSyncLog,
  type SyncLog,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Drizzle reads and writes MySQL timestamps as UTC, but server-side
      // defaults (DEFAULT CURRENT_TIMESTAMP, NOW()) use the session timezone —
      // on a machine outside UTC that skews every db-generated timestamp by the
      // offset. Pin the session to UTC so both sides agree.
      const pool = mysql.createPool({ uri: process.env.DATABASE_URL, timezone: "Z" });
      pool.on("connection", (conn) => {
        conn.query("SET time_zone = '+00:00'");
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ---------------------------------------------------------------------------
// Problem list query (M1)
// ---------------------------------------------------------------------------

import type { Category, Difficulty, ProgressStatus } from '../shared/problemTypes';

export type ListFilters = {
  category?: Category;
  difficulty?: Difficulty;
  listSlug?: string;
  companySlug?: string;
  search?: string;
  paidOnly?: boolean;
  status?: ProgressStatus;
};

export type ListArgs = {
  filters: ListFilters;
  limit: number;
  cursor?: number;
  userId?: number;
};

export function buildListSql(args: ListArgs): { sql: string; params: (string | number | boolean)[] } {
  const { filters, limit, cursor, userId } = args;
  const joins: string[] = [];
  const wheres: string[] = [];
  const params: (string | number | boolean)[] = [];

  if (filters.status && userId) {
    joins.push('LEFT JOIN userProgress ON userProgress.problemId = problems.id AND userProgress.userId = ?');
    params.push(userId);
  }
  if (filters.companySlug) {
    joins.push('LEFT JOIN companyTags ON companyTags.problemId = problems.id');
    wheres.push('companyTags.companySlug = ?');
    params.push(filters.companySlug);
  }
  if (filters.listSlug) {
    joins.push('LEFT JOIN problemListItems ON problemListItems.problemId = problems.id');
    joins.push('LEFT JOIN problemLists ON problemLists.id = problemListItems.listId');
    wheres.push('problemLists.slug = ?');
    params.push(filters.listSlug);
  }
  if (filters.category) {
    wheres.push('problems.category = ?');
    params.push(filters.category);
  }
  if (filters.difficulty) {
    wheres.push('problems.difficulty = ?');
    params.push(filters.difficulty);
  }
  if (filters.paidOnly === false) {
    wheres.push('problems.paidOnly = ?');
    params.push(false);
  }
  if (filters.search) {
    wheres.push('(problems.titleEn LIKE ? OR problems.titleZh LIKE ?)');
    const like = `%${filters.search}%`;
    params.push(like, like);
  }
  if (filters.status && userId) {
    wheres.push('userProgress.status = ?');
    params.push(filters.status);
  }
  if (cursor) {
    wheres.push('problems.id > ?');
    params.push(cursor);
  }

  const joinClause = joins.join(' ');
  const whereClause = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const sql = `SELECT DISTINCT problems.* FROM problems ${joinClause} ${whereClause} ORDER BY problems.id ASC LIMIT ${limit + 1}`
    .replace(/\s+/g, ' ')
    .trim();
  return { sql, params };
}

// ---------------------------------------------------------------------------
// Per-table helpers (M1)
// ---------------------------------------------------------------------------

export async function getProblemBySlug(slug: string): Promise<Problem | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(problems).where(eq(problems.titleSlug, slug)).limit(1);
  return rows[0] ?? null;
}

export type ProblemNeighbor = { frontendId: number; titleSlug: string };

/** Prev/next problem by frontendId within the same category as the given problem. */
export async function getProblemNeighbors(
  titleSlug: string,
): Promise<{ prev: ProblemNeighbor | null; next: ProblemNeighbor | null }> {
  const db = await getDb();
  if (!db) return { prev: null, next: null };
  const cur = await getProblemBySlug(titleSlug);
  if (!cur) return { prev: null, next: null };
  const fields = { frontendId: problems.frontendId, titleSlug: problems.titleSlug };
  const [prevRows, nextRows] = await Promise.all([
    db
      .select(fields)
      .from(problems)
      .where(and(eq(problems.category, cur.category), lt(problems.frontendId, cur.frontendId)))
      .orderBy(desc(problems.frontendId))
      .limit(1),
    db
      .select(fields)
      .from(problems)
      .where(and(eq(problems.category, cur.category), gt(problems.frontendId, cur.frontendId)))
      .orderBy(asc(problems.frontendId))
      .limit(1),
  ]);
  return { prev: prevRows[0] ?? null, next: nextRows[0] ?? null };
}

export async function upsertProblem(p: InsertProblem): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(problems).values(p).onDuplicateKeyUpdate({
    set: {
      titleEn: p.titleEn,
      titleZh: p.titleZh,
      difficulty: p.difficulty,
      paidOnly: p.paidOnly,
      acRate: p.acRate,
      ...(p.category !== undefined ? { category: p.category } : {}),
      ...(p.contentEn !== undefined ? { contentEn: p.contentEn } : {}),
      ...(p.contentZh !== undefined ? { contentZh: p.contentZh } : {}),
      ...(p.contentZhSource !== undefined ? { contentZhSource: p.contentZhSource } : {}),
      ...(p.hintsJson !== undefined ? { hintsJson: p.hintsJson } : {}),
      ...(p.exampleTestcases !== undefined ? { exampleTestcases: p.exampleTestcases } : {}),
      ...(p.topicTagsJson !== undefined ? { topicTagsJson: p.topicTagsJson } : {}),
      ...(p.sqlTagsJson !== undefined ? { sqlTagsJson: p.sqlTagsJson } : {}),
      ...(p.similarQuestionsJson !== undefined ? { similarQuestionsJson: p.similarQuestionsJson } : {}),
      ...(p.codeSnippetsJson !== undefined ? { codeSnippetsJson: p.codeSnippetsJson } : {}),
      ...(p.contentFetchedAt !== undefined ? { contentFetchedAt: p.contentFetchedAt } : {}),
      metaUpdatedAt: new Date(),
    },
  });
}

export async function startSyncLog(syncType: InsertSyncLog['syncType']): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = (await db.insert(syncLogs).values({ syncType, status: 'running' })) as unknown as
    | { insertId?: number }
    | Array<{ insertId?: number }>;
  if (Array.isArray(result)) return Number(result[0]?.insertId ?? 0);
  return Number(result?.insertId ?? 0);
}

export type SyncProgressPatch = {
  processed: number;
  succeeded: number;
  failed: number;
  /** Expected total, when the task can estimate it. Drives the UI progress bar. */
  total?: number;
  /** Short label of the current stage, e.g. 'problems' or 'companies'. */
  phase?: string;
};

/** Write mid-run counters so a long sync shows progress instead of looking hung. */
export async function updateSyncLogProgress(id: number, p: SyncProgressPatch): Promise<void> {
  const db = await getDb();
  if (!db || !id) return;
  await db.update(syncLogs).set({
    itemsProcessed: p.processed,
    itemsSucceeded: p.succeeded,
    itemsFailed: p.failed,
    metaJson: { total: p.total ?? null, phase: p.phase ?? null },
  }).where(eq(syncLogs.id, id));
}

export async function finishSyncLog(id: number, patch: Partial<InsertSyncLog>): Promise<void> {
  const db = await getDb();
  if (!db || !id) return;
  await db.update(syncLogs).set({ ...patch, finishedAt: new Date() }).where(eq(syncLogs.id, id));
}

/**
 * A sync that was in flight when the process died stays 'running' forever and
 * then blocks every later run of that type. Clear those on boot.
 */
export async function failStaleRunningSyncs(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const stale = await db.select().from(syncLogs).where(eq(syncLogs.status, 'running'));
  if (stale.length === 0) return 0;
  await db.update(syncLogs).set({
    status: 'failed',
    finishedAt: new Date(),
    errorSummary: 'Interrupted by app restart',
  }).where(eq(syncLogs.status, 'running'));
  console.log(`[Database] marked ${stale.length} interrupted sync log(s) as failed`);
  return stale.length;
}

export async function findRunningSyncOfType(syncType: InsertSyncLog['syncType']): Promise<SyncLog | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(syncLogs).where(eq(syncLogs.syncType, syncType));
  return rows.find((r) => r.status === 'running') ?? null;
}

export async function upsertProblemSolution(s: InsertProblemSolution): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(problemSolutions).values(s).onDuplicateKeyUpdate({
    set: { contentMarkdown: s.contentMarkdown, fetchedAt: new Date() },
  });
}

export async function upsertCompanyTag(c: InsertCompanyTag): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(companyTags).values(c).onDuplicateKeyUpdate({
    set: { companyName: c.companyName, frequency: c.frequency, source: c.source, syncedAt: new Date() },
  });
}

/** Newest syncedAt across one company's tags, or null when it has none. */
export async function getCompanyTagsLastSyncedAt(companySlug: string): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ syncedAt: companyTags.syncedAt })
    .from(companyTags)
    .where(eq(companyTags.companySlug, companySlug))
    .orderBy(desc(companyTags.syncedAt))
    .limit(1);
  return rows[0]?.syncedAt ?? null;
}

export async function upsertProblemList(l: InsertProblemList): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  await db.insert(problemLists).values(l).onDuplicateKeyUpdate({
    set: { titleEn: l.titleEn, titleZh: l.titleZh, source: l.source, metaJson: l.metaJson },
  });
  const rows = await db.select().from(problemLists).where(eq(problemLists.slug, l.slug)).limit(1);
  return rows[0]?.id ?? 0;
}

export async function upsertProblemListItem(i: InsertProblemListItem): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(problemListItems).values(i).onDuplicateKeyUpdate({
    set: { position: i.position },
  });
}

export async function recordSyncLog(entry: InsertSyncLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(syncLogs).values(entry);
}

export async function listProblemsQuery(args: ListArgs) {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: undefined as number | undefined };
  const { filters, limit, cursor, userId } = args;

  // Build the query using drizzle's `sql` tagged template so parameters are
  // properly bound (drizzle-orm 0.44 does not accept positional params via
  // db.execute(sql, params)).
  const joins = [sql.empty()];
  const wheres = [sql`1=1`];

  if (filters.status && userId) {
    joins.push(
      sql` LEFT JOIN userProgress ON userProgress.problemId = problems.id AND userProgress.userId = ${userId}`,
    );
    wheres.push(sql` AND userProgress.status = ${filters.status}`);
  }
  if (filters.companySlug) {
    joins.push(sql` LEFT JOIN companyTags ON companyTags.problemId = problems.id`);
    wheres.push(sql` AND companyTags.companySlug = ${filters.companySlug}`);
  }
  if (filters.listSlug) {
    joins.push(
      sql` LEFT JOIN problemListItems ON problemListItems.problemId = problems.id LEFT JOIN problemLists ON problemLists.id = problemListItems.listId`,
    );
    wheres.push(sql` AND problemLists.slug = ${filters.listSlug}`);
  }
  if (filters.category) {
    wheres.push(sql` AND problems.category = ${filters.category}`);
  }
  if (filters.difficulty) {
    wheres.push(sql` AND problems.difficulty = ${filters.difficulty}`);
  }
  if (filters.paidOnly === false) {
    wheres.push(sql` AND problems.paidOnly = ${false}`);
  }
  if (filters.search) {
    const like = `%${filters.search}%`;
    wheres.push(sql` AND (problems.titleEn LIKE ${like} OR problems.titleZh LIKE ${like})`);
  }
  if (cursor) {
    wheres.push(sql` AND problems.id > ${cursor}`);
  }

  // When filtering by listSlug, problemListItems is 1:1 with problems within
  // a list, so DISTINCT is unnecessary and breaks ORDER BY position.
  // For company filter, the same problemId may appear in multiple companyTags
  // rows, so DISTINCT is required and we order by frontendId only.
  const distinctClause = filters.listSlug ? sql.empty() : sql` DISTINCT`;
  const orderClause = filters.listSlug
    ? sql` ORDER BY problemListItems.position ASC`
    : sql` ORDER BY problems.frontendId ASC`;

  const query = sql`SELECT${distinctClause} problems.* FROM problems${sql.join(joins)} WHERE ${sql.join(wheres)}${orderClause} LIMIT ${limit + 1}`;

  const rows = (await db.execute(query)) as unknown as Array<{ id: number }>;
  // mysql2 may return [rows, fields]; normalize
  const list = (Array.isArray(rows) && Array.isArray((rows as unknown[])[0])
    ? ((rows as unknown[])[0] as Array<{ id: number }>)
    : (rows as Array<{ id: number }>)) ?? [];
  const hasMore = list.length > limit;
  const items = hasMore ? list.slice(0, limit) : list;
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

  // total count under same filters (without LIMIT/cursor)
  const countCol = filters.listSlug ? sql`*` : sql`DISTINCT problems.id`;
  const countQuery = sql`SELECT COUNT(${countCol}) as cnt FROM problems${sql.join(joins)} WHERE ${sql.join(
    // exclude cursor predicate from count
    wheres.filter((w) => {
      const s = (w as unknown as { queryChunks?: unknown[] }).queryChunks;
      const txt = Array.isArray(s) ? s.map((c) => (typeof c === 'string' ? c : '')).join('') : '';
      return !txt.includes('problems.id >');
    }),
  )}`;
  let total = items.length;
  try {
    const cntRows = (await db.execute(countQuery)) as unknown;
    const cntList = (Array.isArray(cntRows) && Array.isArray((cntRows as unknown[])[0])
      ? ((cntRows as unknown[])[0] as Array<{ cnt: number | string }>)
      : (cntRows as Array<{ cnt: number | string }>)) ?? [];
    if (cntList[0]) total = Number(cntList[0].cnt);
  } catch {
    // fall back to items.length
  }
  return { items, nextCursor, total };
}

// ---------------------------------------------------------------------------
// Lists / companies query helpers (M1)
// ---------------------------------------------------------------------------

export async function getAllProblemLists() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(problemLists);
}

export async function getProblemListBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(problemLists).where(eq(problemLists.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getCompanyTagsForProblem(problemId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(companyTags).where(eq(companyTags.problemId, problemId));
}

import { desc as drizzleDesc } from 'drizzle-orm';

export async function countListItems(): Promise<Array<{ listId: number; count: number }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = (await db.execute(
    sql`SELECT listId, COUNT(*) as count FROM problemListItems GROUP BY listId`,
  )) as unknown as Array<{ listId: number; count: number | string }>;
  const list = (Array.isArray(rows) && Array.isArray((rows as unknown[])[0])
    ? ((rows as unknown[])[0] as Array<{ listId: number; count: number | string }>)
    : (rows as Array<{ listId: number; count: number | string }>)) ?? [];
  return list.map((r) => ({ listId: Number(r.listId), count: Number(r.count) }));
}

export async function countCompanyTags(): Promise<Array<{ companySlug: string; count: number }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = (await db.execute(
    sql`SELECT companySlug, COUNT(DISTINCT problemId) as count FROM companyTags GROUP BY companySlug`,
  )) as unknown as Array<{ companySlug: string; count: number | string }>;
  const list = (Array.isArray(rows) && Array.isArray((rows as unknown[])[0])
    ? ((rows as unknown[])[0] as Array<{ companySlug: string; count: number | string }>)
    : (rows as Array<{ companySlug: string; count: number | string }>)) ?? [];
  return list.map((r) => ({ companySlug: r.companySlug, count: Number(r.count) }));
}

export async function getRecentSyncLogs(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(syncLogs)
    .orderBy(drizzleDesc(syncLogs.startedAt))
    .limit(limit);
}

import { and as drizzleAnd } from 'drizzle-orm';
import { sm2 } from './progress/sm2';

/**
 * Mark a problem solved after an accepted judge submission. Runs SM-2 with a
 * default quality only on first completion; an already-done problem's review
 * schedule is left to the explicit review flow.
 */
export async function markProblemSolved(userId: number, problemId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select()
    .from(userProgress)
    .where(drizzleAnd(eq(userProgress.userId, userId), eq(userProgress.problemId, problemId)))
    .limit(1);
  const prev = existing[0];
  if (prev?.status === 'done') return;

  const result = sm2({
    quality: 4,
    repetition: prev?.reviewCount ?? 0,
    interval: prev?.reviewIntervalDays ?? 0,
    easinessFactor: prev ? parseFloat(prev.easinessFactor) : 2.5,
  });
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + result.interval * 24 * 60 * 60 * 1000);

  await db
    .insert(userProgress)
    .values({
      userId,
      problemId,
      status: 'done',
      reviewIntervalDays: result.interval,
      nextReviewAt,
      reviewCount: result.repetition,
      easinessFactor: String(result.easinessFactor),
      lastReviewedAt: now,
      firstCompletedAt: prev?.firstCompletedAt ?? now,
    })
    .onDuplicateKeyUpdate({
      set: {
        status: 'done',
        reviewIntervalDays: result.interval,
        nextReviewAt,
        reviewCount: result.repetition,
        easinessFactor: String(result.easinessFactor),
        lastReviewedAt: now,
        firstCompletedAt: prev?.firstCompletedAt ?? now,
      },
    });
}
