-- Migration 0001: online judge tables (problemTestcases, submissions).
-- Tables and indexes were created out-of-band before this migration was
-- registered (see history). Statements are guarded with IF NOT EXISTS so
-- repeated apply on a fresh DB is still safe.
CREATE TABLE IF NOT EXISTS `problemTestcases` (
	`problemId` int NOT NULL,
	`suiteJson` json NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`source` enum('llm','manual') NOT NULL DEFAULT 'llm',
	CONSTRAINT `problemTestcases_problemId` PRIMARY KEY(`problemId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`problemId` int NOT NULL,
	`language` enum('python','java','cpp') NOT NULL,
	`code` longtext NOT NULL,
	`verdict` enum('accepted','wrong_answer','compile_error','runtime_error','time_limit_exceeded','internal_error') NOT NULL,
	`passedCount` int NOT NULL DEFAULT 0,
	`totalCount` int NOT NULL DEFAULT 0,
	`firstFailInput` text,
	`firstFailExpected` text,
	`firstFailActual` text,
	`resultJson` json,
	`aiReviewMarkdown` longtext,
	`runtimeMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`)
);
