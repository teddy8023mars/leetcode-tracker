import { z } from 'zod';

export const StudyModeSchema = z.enum(['standard', 'minimum']);
export const StudySessionStatusSchema = z.enum(['in_progress', 'completed']);
export const StudyTaskStatusSchema = z.enum(['pending', 'completed']);
export const StudyTaskTypeSchema = z.enum([
  'review',
  'dsa_lesson',
  'problem',
  'gcp',
  'system_design',
  'behavioral',
]);

export type StudyMode = z.infer<typeof StudyModeSchema>;
export type StudySessionStatus = z.infer<typeof StudySessionStatusSchema>;
export type StudyTaskStatus = z.infer<typeof StudyTaskStatusSchema>;
export type StudyTaskType = z.infer<typeof StudyTaskTypeSchema>;
export type StudyTaskKey = 'review' | 'dsa' | 'problem' | 'career';
