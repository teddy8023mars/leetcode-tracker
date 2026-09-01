import Database from 'better-sqlite3';

const SCHEMA_SQL = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openId TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  loginMethod TEXT,
  role TEXT DEFAULT 'user',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  lastSignedIn TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  frontendId INTEGER UNIQUE NOT NULL,
  titleSlug TEXT UNIQUE NOT NULL,
  titleEn TEXT,
  titleZh TEXT,
  category TEXT NOT NULL DEFAULT 'algorithms',
  difficulty TEXT NOT NULL,
  paidOnly INTEGER DEFAULT 0,
  acRate REAL,
  contentEn TEXT,
  contentZh TEXT,
  contentZhSource TEXT,
  hintsJson TEXT,
  exampleTestcases TEXT,
  mysqlSchemasJson TEXT,
  topicTagsJson TEXT,
  sqlTagsJson TEXT,
  sqlJudgeDataJson TEXT,
  similarQuestionsJson TEXT,
  codeSnippetsJson TEXT,
  contentFetchedAt TEXT,
  metaUpdatedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE problemSolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problemId INTEGER NOT NULL REFERENCES problems(id),
  source TEXT NOT NULL,
  language TEXT NOT NULL,
  contentMarkdown TEXT NOT NULL,
  fetchedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(problemId, source, language)
);
CREATE TABLE companyTags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problemId INTEGER NOT NULL REFERENCES problems(id),
  companySlug TEXT NOT NULL,
  companyName TEXT NOT NULL,
  frequency REAL,
  timeframe TEXT NOT NULL,
  source TEXT NOT NULL,
  syncedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(problemId, companySlug, timeframe)
);
CREATE TABLE problemLists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  titleEn TEXT NOT NULL,
  titleZh TEXT NOT NULL,
  source TEXT NOT NULL,
  metaJson TEXT
);
CREATE TABLE problemListItems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listId INTEGER NOT NULL REFERENCES problemLists(id),
  problemId INTEGER NOT NULL REFERENCES problems(id),
  position INTEGER NOT NULL,
  UNIQUE(listId, problemId)
);
CREATE TABLE aiSolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problemId INTEGER NOT NULL REFERENCES problems(id),
  language TEXT NOT NULL,
  approachMarkdown TEXT NOT NULL,
  complexityMarkdown TEXT NOT NULL,
  pythonCode TEXT NOT NULL,
  javaCode TEXT NOT NULL,
  cppCode TEXT NOT NULL,
  pitfallsMarkdown TEXT,
  generatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  modelVersion TEXT,
  UNIQUE(problemId, language)
);
CREATE TABLE aiGenerationLocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problemId INTEGER NOT NULL REFERENCES problems(id),
  language TEXT NOT NULL,
  lockedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  lockedUntil TEXT NOT NULL,
  UNIQUE(problemId, language)
);
CREATE TABLE userProgress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  problemId INTEGER NOT NULL REFERENCES problems(id),
  status TEXT DEFAULT 'todo',
  noteMarkdown TEXT,
  reviewIntervalDays INTEGER DEFAULT 0,
  nextReviewAt TEXT,
  reviewCount INTEGER DEFAULT 0,
  easinessFactor REAL DEFAULT 2.50,
  lastReviewedAt TEXT,
  firstCompletedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, problemId)
);
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  problemId INTEGER NOT NULL REFERENCES problems(id),
  attemptedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE studyProfiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  currentDayIndex INTEGER NOT NULL DEFAULT 0,
  targetDaysPerWeek INTEGER NOT NULL DEFAULT 5,
  standardMinutes INTEGER NOT NULL DEFAULT 90,
  minimumMinutes INTEGER NOT NULL DEFAULT 25,
  lastCompletedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId)
);
CREATE TABLE studySessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  localDate TEXT NOT NULL,
  curriculumDayIndex INTEGER NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  coreIsTimedReview INTEGER NOT NULL DEFAULT 0,
  startedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  completedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, localDate)
);
CREATE INDEX idx_studySessions_user_status ON studySessions(userId, status);
CREATE INDEX idx_studySessions_user_date ON studySessions(userId, localDate);
CREATE TABLE studyTaskProgress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES studySessions(id),
  taskKey TEXT NOT NULL,
  taskType TEXT NOT NULL,
  problemId INTEGER REFERENCES problems(id),
  status TEXT NOT NULL DEFAULT 'pending',
  completedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sessionId, taskKey)
);
CREATE INDEX idx_studyTask_session ON studyTaskProgress(sessionId);
CREATE INDEX idx_studyTask_problem ON studyTaskProgress(problemId);
CREATE TABLE syncLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  syncType TEXT NOT NULL,
  status TEXT NOT NULL,
  startedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  finishedAt TEXT,
  itemsProcessed INTEGER DEFAULT 0,
  itemsSucceeded INTEGER DEFAULT 0,
  itemsFailed INTEGER DEFAULT 0,
  errorSummary TEXT,
  metaJson TEXT
);
CREATE TABLE problemTestcases (
  problemId INTEGER PRIMARY KEY REFERENCES problems(id),
  suiteJson TEXT NOT NULL,
  generatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  source TEXT DEFAULT 'llm'
);
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  problemId INTEGER NOT NULL REFERENCES problems(id),
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  verdict TEXT NOT NULL,
  passedCount INTEGER DEFAULT 0,
  totalCount INTEGER DEFAULT 0,
  firstFailInput TEXT,
  firstFailExpected TEXT,
  firstFailActual TEXT,
  resultJson TEXT,
  aiReviewMarkdown TEXT,
  runtimeMs INTEGER,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

export interface InMemoryDb {
  sqlite: Database.Database;
}

export function createInMemoryDb(): InMemoryDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA_SQL);
  return { sqlite };
}
