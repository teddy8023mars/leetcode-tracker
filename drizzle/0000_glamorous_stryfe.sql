CREATE TABLE `aiGenerationLocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`problemId` int NOT NULL,
	`language` enum('en','zh') NOT NULL,
	`lockedAt` timestamp NOT NULL DEFAULT (now()),
	`lockedUntil` timestamp NOT NULL,
	CONSTRAINT `aiGenerationLocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_aiLock` UNIQUE(`problemId`,`language`)
);
--> statement-breakpoint
CREATE TABLE `aiSolutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`problemId` int NOT NULL,
	`language` enum('en','zh') NOT NULL,
	`approachMarkdown` longtext NOT NULL,
	`complexityMarkdown` text NOT NULL,
	`pythonCode` text NOT NULL,
	`javaCode` text NOT NULL,
	`cppCode` text NOT NULL,
	`pitfallsMarkdown` text,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`modelVersion` varchar(64),
	CONSTRAINT `aiSolutions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_aiSolution` UNIQUE(`problemId`,`language`)
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`problemId` int NOT NULL,
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companyTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`problemId` int NOT NULL,
	`companySlug` varchar(64) NOT NULL,
	`companyName` varchar(128) NOT NULL,
	`frequency` decimal(5,2),
	`timeframe` enum('30d','3m','6m','1y','all') NOT NULL,
	`source` enum('liquidslr','leetcode-companyTag') NOT NULL,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companyTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_companyTag` UNIQUE(`problemId`,`companySlug`,`timeframe`)
);
--> statement-breakpoint
CREATE TABLE `problemListItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`problemId` int NOT NULL,
	`position` int NOT NULL,
	CONSTRAINT `problemListItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_listItem` UNIQUE(`listId`,`problemId`)
);
--> statement-breakpoint
CREATE TABLE `problemLists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`titleEn` varchar(255) NOT NULL,
	`titleZh` varchar(255) NOT NULL,
	`source` enum('leetcode-list','custom') NOT NULL,
	`metaJson` json,
	CONSTRAINT `problemLists_id` PRIMARY KEY(`id`),
	CONSTRAINT `problemLists_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `problemSolutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`problemId` int NOT NULL,
	`source` enum('leetcode-cn-official','leetcode-en-official') NOT NULL,
	`language` enum('en','zh') NOT NULL,
	`contentMarkdown` longtext NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `problemSolutions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_solution` UNIQUE(`problemId`,`source`,`language`)
);
--> statement-breakpoint
CREATE TABLE `problems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`frontendId` int NOT NULL,
	`titleSlug` varchar(255) NOT NULL,
	`titleEn` varchar(500),
	`titleZh` varchar(500),
	`difficulty` enum('Easy','Medium','Hard') NOT NULL,
	`paidOnly` boolean NOT NULL DEFAULT false,
	`acRate` decimal(5,2),
	`contentEn` longtext,
	`contentZh` longtext,
	`contentZhSource` enum('leetcode-cn','llm-translated'),
	`hintsJson` json,
	`exampleTestcases` text,
	`topicTagsJson` json,
	`similarQuestionsJson` json,
	`codeSnippetsJson` json,
	`contentFetchedAt` timestamp,
	`metaUpdatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `problems_id` PRIMARY KEY(`id`),
	CONSTRAINT `problems_frontendId_unique` UNIQUE(`frontendId`),
	CONSTRAINT `problems_titleSlug_unique` UNIQUE(`titleSlug`)
);
--> statement-breakpoint
CREATE TABLE `syncLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncType` enum('initial-bootstrap','daily-sync-lists','daily-sync-meta','daily-sync-companies','manual','detail-fetch','ai-pregenerate','ai-on-demand','db-backup','probe-leetcode-cn') NOT NULL,
	`status` enum('running','success','failed','partial') NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`itemsProcessed` int NOT NULL DEFAULT 0,
	`itemsSucceeded` int NOT NULL DEFAULT 0,
	`itemsFailed` int NOT NULL DEFAULT 0,
	`errorSummary` text,
	`metaJson` json,
	CONSTRAINT `syncLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`problemId` int NOT NULL,
	`status` enum('todo','reviewing','done') NOT NULL DEFAULT 'todo',
	`noteMarkdown` longtext,
	`reviewIntervalDays` int NOT NULL DEFAULT 0,
	`nextReviewAt` timestamp,
	`reviewCount` int NOT NULL DEFAULT 0,
	`lastReviewedAt` timestamp,
	`firstCompletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_userProblem` UNIQUE(`userId`,`problemId`)
);
--> statement-breakpoint
--> statement-breakpoint
CREATE INDEX `idx_aiSolutions_problemId` ON `aiSolutions` (`problemId`);--> statement-breakpoint
CREATE INDEX `idx_attempts_user_date` ON `attempts` (`userId`,`attemptedAt`);--> statement-breakpoint
CREATE INDEX `idx_companyTags_companySlug` ON `companyTags` (`companySlug`);--> statement-breakpoint
CREATE INDEX `idx_companyTags_freq` ON `companyTags` (`frequency`);--> statement-breakpoint
CREATE INDEX `idx_listItems_listId` ON `problemListItems` (`listId`);--> statement-breakpoint
CREATE INDEX `idx_solutions_problemId` ON `problemSolutions` (`problemId`);--> statement-breakpoint
CREATE INDEX `idx_problems_difficulty` ON `problems` (`difficulty`);--> statement-breakpoint
CREATE INDEX `idx_problems_paidOnly` ON `problems` (`paidOnly`);--> statement-breakpoint
CREATE INDEX `idx_syncLogs_type_started` ON `syncLogs` (`syncType`,`startedAt`);--> statement-breakpoint
CREATE INDEX `idx_userProgress_user_status` ON `userProgress` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_userProgress_user_nextReview` ON `userProgress` (`userId`,`nextReviewAt`);