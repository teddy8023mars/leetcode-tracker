ALTER TABLE `studySessions`
  ADD COLUMN `coreIsTimedReview` boolean NOT NULL DEFAULT false AFTER `status`;
