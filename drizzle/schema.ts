import {
  boolean,
  decimal,
  index,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Problems — LeetCode question metadata + bilingual content.
 * Detail fields (contentEn/contentZh/etc) are nullable; populated lazily on first detail fetch.
 */
export const problems = mysqlTable(
  "problems",
  {
    id: int("id").autoincrement().primaryKey(),
    frontendId: int("frontendId").notNull().unique(),
    titleSlug: varchar("titleSlug", { length: 255 }).notNull().unique(),
    titleEn: varchar("titleEn", { length: 500 }),
    titleZh: varchar("titleZh", { length: 500 }),
    difficulty: mysqlEnum("difficulty", ["Easy", "Medium", "Hard"]).notNull(),
    paidOnly: boolean("paidOnly").default(false).notNull(),
    acRate: decimal("acRate", { precision: 5, scale: 2 }),
    contentEn: longtext("contentEn"),
    contentZh: longtext("contentZh"),
    contentZhSource: mysqlEnum("contentZhSource", ["leetcode-cn", "llm-translated"]),
    hintsJson: json("hintsJson"),
    exampleTestcases: text("exampleTestcases"),
    topicTagsJson: json("topicTagsJson"),
    similarQuestionsJson: json("similarQuestionsJson"),
    codeSnippetsJson: json("codeSnippetsJson"),
    contentFetchedAt: timestamp("contentFetchedAt"),
    metaUpdatedAt: timestamp("metaUpdatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    difficultyIdx: index("idx_problems_difficulty").on(t.difficulty),
    paidOnlyIdx: index("idx_problems_paidOnly").on(t.paidOnly),
  }),
);

export type Problem = typeof problems.$inferSelect;
export type InsertProblem = typeof problems.$inferInsert;

/**
 * Cached official solutions from LeetCode (en or zh).
 * UNIQUE(problemId, source, language) ensures we never duplicate.
 */
export const problemSolutions = mysqlTable(
  "problemSolutions",
  {
    id: int("id").autoincrement().primaryKey(),
    problemId: int("problemId").notNull().references(() => problems.id),
    source: mysqlEnum("source", ["leetcode-cn-official", "leetcode-en-official"]).notNull(),
    language: mysqlEnum("language", ["en", "zh"]).notNull(),
    contentMarkdown: longtext("contentMarkdown").notNull(),
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique("uniq_solution").on(t.problemId, t.source, t.language),
    problemIdx: index("idx_solutions_problemId").on(t.problemId),
  }),
);

export type ProblemSolution = typeof problemSolutions.$inferSelect;
export type InsertProblemSolution = typeof problemSolutions.$inferInsert;

/**
 * Company tags — many-to-many between problems and companies.
 * Sourced from liquidslr/interview-company-wise-problems CSVs (M1) or LeetCode companyTag (future).
 */
export const companyTags = mysqlTable(
  "companyTags",
  {
    id: int("id").autoincrement().primaryKey(),
    problemId: int("problemId").notNull().references(() => problems.id),
    companySlug: varchar("companySlug", { length: 64 }).notNull(),
    companyName: varchar("companyName", { length: 128 }).notNull(),
    frequency: decimal("frequency", { precision: 5, scale: 2 }),
    timeframe: mysqlEnum("timeframe", ["30d", "3m", "6m", "1y", "all"]).notNull(),
    source: mysqlEnum("source", ["liquidslr", "leetcode-companyTag"]).notNull(),
    syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique("uniq_companyTag").on(t.problemId, t.companySlug, t.timeframe),
    companyIdx: index("idx_companyTags_companySlug").on(t.companySlug),
    freqIdx: index("idx_companyTags_freq").on(t.frequency),
  }),
);

export type CompanyTag = typeof companyTags.$inferSelect;
export type InsertCompanyTag = typeof companyTags.$inferInsert;

/**
 * Curated problem lists (Hot 100, Top Interview 150, custom).
 */
export const problemLists = mysqlTable("problemLists", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  titleEn: varchar("titleEn", { length: 255 }).notNull(),
  titleZh: varchar("titleZh", { length: 255 }).notNull(),
  source: mysqlEnum("source", ["leetcode-list", "custom"]).notNull(),
  metaJson: json("metaJson"),
});

export type ProblemList = typeof problemLists.$inferSelect;
export type InsertProblemList = typeof problemLists.$inferInsert;

/**
 * Many-to-many between problemLists and problems, with a stable display position.
 */
export const problemListItems = mysqlTable(
  "problemListItems",
  {
    id: int("id").autoincrement().primaryKey(),
    listId: int("listId").notNull().references(() => problemLists.id),
    problemId: int("problemId").notNull().references(() => problems.id),
    position: int("position").notNull(),
  },
  (t) => ({
    uniq: unique("uniq_listItem").on(t.listId, t.problemId),
    listIdx: index("idx_listItems_listId").on(t.listId),
  }),
);

export type ProblemListItem = typeof problemListItems.$inferSelect;
export type InsertProblemListItem = typeof problemListItems.$inferInsert;

/**
 * AI-generated solutions cached per (problemId, language).
 */
export const aiSolutions = mysqlTable(
  "aiSolutions",
  {
    id: int("id").autoincrement().primaryKey(),
    problemId: int("problemId").notNull().references(() => problems.id),
    language: mysqlEnum("language", ["en", "zh"]).notNull(),
    approachMarkdown: longtext("approachMarkdown").notNull(),
    complexityMarkdown: text("complexityMarkdown").notNull(),
    pythonCode: text("pythonCode").notNull(),
    javaCode: text("javaCode").notNull(),
    cppCode: text("cppCode").notNull(),
    pitfallsMarkdown: text("pitfallsMarkdown"),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
    modelVersion: varchar("modelVersion", { length: 64 }),
  },
  (t) => ({
    uniq: unique("uniq_aiSolution").on(t.problemId, t.language),
    problemIdx: index("idx_aiSolutions_problemId").on(t.problemId),
  }),
);

export type AiSolution = typeof aiSolutions.$inferSelect;
export type InsertAiSolution = typeof aiSolutions.$inferInsert;

/**
 * Distributed locks to prevent concurrent AI generation for the same (problemId, language).
 */
export const aiGenerationLocks = mysqlTable(
  "aiGenerationLocks",
  {
    id: int("id").autoincrement().primaryKey(),
    problemId: int("problemId").notNull().references(() => problems.id),
    language: mysqlEnum("language", ["en", "zh"]).notNull(),
    lockedAt: timestamp("lockedAt").defaultNow().notNull(),
    lockedUntil: timestamp("lockedUntil").notNull(),
  },
  (t) => ({
    uniq: unique("uniq_aiLock").on(t.problemId, t.language),
  }),
);

export type AiGenerationLock = typeof aiGenerationLocks.$inferSelect;
export type InsertAiGenerationLock = typeof aiGenerationLocks.$inferInsert;

/**
 * User-level progress: status, notes, spaced repetition fields.
 */
export const userProgress = mysqlTable(
  "userProgress",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    problemId: int("problemId").notNull().references(() => problems.id),
    status: mysqlEnum("status", ["todo", "reviewing", "done"]).default("todo").notNull(),
    noteMarkdown: longtext("noteMarkdown"),
    reviewIntervalDays: int("reviewIntervalDays").default(0).notNull(),
    nextReviewAt: timestamp("nextReviewAt"),
    reviewCount: int("reviewCount").default(0).notNull(),
    easinessFactor: decimal("easinessFactor", { precision: 3, scale: 2 }).default("2.50").notNull(),
    lastReviewedAt: timestamp("lastReviewedAt"),
    firstCompletedAt: timestamp("firstCompletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniq: unique("uniq_userProblem").on(t.userId, t.problemId),
    statusIdx: index("idx_userProgress_user_status").on(t.userId, t.status),
    reviewIdx: index("idx_userProgress_user_nextReview").on(t.userId, t.nextReviewAt),
  }),
);

export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = typeof userProgress.$inferInsert;

/**
 * Time-series of attempts; powers the daily-trend chart.
 */
export const attempts = mysqlTable(
  "attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    problemId: int("problemId").notNull().references(() => problems.id),
    attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
  },
  (t) => ({
    userDateIdx: index("idx_attempts_user_date").on(t.userId, t.attemptedAt),
  }),
);

export type Attempt = typeof attempts.$inferSelect;
export type InsertAttempt = typeof attempts.$inferInsert;

/**
 * Sync task audit log.
 */
export const syncLogs = mysqlTable(
  "syncLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    syncType: mysqlEnum("syncType", [
      "initial-bootstrap", "daily-sync-lists", "daily-sync-meta", "daily-sync-companies",
      "manual", "detail-fetch", "ai-pregenerate", "ai-on-demand", "db-backup", "probe-leetcode-cn",
    ]).notNull(),
    status: mysqlEnum("status", ["running", "success", "failed", "partial"]).notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    finishedAt: timestamp("finishedAt"),
    itemsProcessed: int("itemsProcessed").default(0).notNull(),
    itemsSucceeded: int("itemsSucceeded").default(0).notNull(),
    itemsFailed: int("itemsFailed").default(0).notNull(),
    errorSummary: text("errorSummary"),
    metaJson: json("metaJson"),
  },
  (t) => ({
    typeStartedIdx: index("idx_syncLogs_type_started").on(t.syncType, t.startedAt),
  }),
);

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;


/**
 * Online Judge — generated test suite cached per problem.
 * Pre-generated by LLM on first submission, then reused.
 */
export const problemTestcases = mysqlTable("problemTestcases", {
  problemId: int("problemId").primaryKey().references(() => problems.id),
  suiteJson: json("suiteJson").notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  source: mysqlEnum("source", ["llm", "manual"]).default("llm").notNull(),
});
export type ProblemTestcase = typeof problemTestcases.$inferSelect;
export type InsertProblemTestcase = typeof problemTestcases.$inferInsert;

/**
 * Online Judge — every user submission with full verdict + first-fail context.
 */
export const submissions = mysqlTable(
  "submissions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    problemId: int("problemId").notNull().references(() => problems.id),
    language: mysqlEnum("language", ["python", "java", "cpp"]).notNull(),
    code: longtext("code").notNull(),
    verdict: mysqlEnum("verdict", [
      "accepted",
      "wrong_answer",
      "compile_error",
      "runtime_error",
      "time_limit_exceeded",
      "internal_error",
    ]).notNull(),
    passedCount: int("passedCount").default(0).notNull(),
    totalCount: int("totalCount").default(0).notNull(),
    firstFailInput: text("firstFailInput"),
    firstFailExpected: text("firstFailExpected"),
    firstFailActual: text("firstFailActual"),
    resultJson: json("resultJson"),
    aiReviewMarkdown: longtext("aiReviewMarkdown"),
    runtimeMs: int("runtimeMs"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userProblemIdx: index("idx_submissions_user_problem").on(t.userId, t.problemId),
    problemCreatedIdx: index("idx_submissions_problem_created").on(t.problemId, t.createdAt),
  }),
);
export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = typeof submissions.$inferInsert;
