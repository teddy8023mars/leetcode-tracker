CREATE TABLE IF NOT EXISTS `studyProfiles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `currentDayIndex` int NOT NULL DEFAULT 0,
  `targetDaysPerWeek` int NOT NULL DEFAULT 5,
  `standardMinutes` int NOT NULL DEFAULT 90,
  `minimumMinutes` int NOT NULL DEFAULT 25,
  `lastCompletedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `studyProfiles_id` PRIMARY KEY(`id`),
  CONSTRAINT `uniq_studyProfile_user` UNIQUE(`userId`),
  CONSTRAINT `studyProfiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `studySessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `localDate` varchar(10) NOT NULL,
  `curriculumDayIndex` int NOT NULL,
  `mode` enum('standard','minimum') NOT NULL,
  `status` enum('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `studySessions_id` PRIMARY KEY(`id`),
  CONSTRAINT `uniq_studySession_user_date` UNIQUE(`userId`,`localDate`),
  CONSTRAINT `studySessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  INDEX `idx_studySessions_user_status` (`userId`,`status`),
  INDEX `idx_studySessions_user_date` (`userId`,`localDate`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `studyTaskProgress` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` int NOT NULL,
  `taskKey` varchar(32) NOT NULL,
  `taskType` enum('review','dsa_lesson','problem','gcp','system_design','behavioral') NOT NULL,
  `problemId` int NULL,
  `status` enum('pending','completed') NOT NULL DEFAULT 'pending',
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `studyTaskProgress_id` PRIMARY KEY(`id`),
  CONSTRAINT `uniq_studyTask_session_key` UNIQUE(`sessionId`,`taskKey`),
  CONSTRAINT `studyTaskProgress_sessionId_studySessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `studySessions`(`id`),
  CONSTRAINT `studyTaskProgress_problemId_problems_id_fk` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`),
  INDEX `idx_studyTask_session` (`sessionId`),
  INDEX `idx_studyTask_problem` (`problemId`)
);
