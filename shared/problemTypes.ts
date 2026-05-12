import { z } from 'zod';

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export const DifficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const SYNC_TYPES = [
  'initial-bootstrap',
  'daily-sync-lists',
  'daily-sync-meta',
  'daily-sync-companies',
  'manual',
  'detail-fetch',
  'ai-pregenerate',
  'ai-on-demand',
  'db-backup',
  'probe-leetcode-cn',
] as const;
export const SyncTypeSchema = z.enum(SYNC_TYPES);
export type SyncType = z.infer<typeof SyncTypeSchema>;

export const SYNC_STATUSES = ['running', 'success', 'failed', 'partial'] as const;
export const SyncStatusSchema = z.enum(SYNC_STATUSES);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const PROGRESS_STATUSES = ['todo', 'reviewing', 'done'] as const;
export const ProgressStatusSchema = z.enum(PROGRESS_STATUSES);
export type ProgressStatus = z.infer<typeof ProgressStatusSchema>;

export const LANGUAGES = ['en', 'zh'] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;
