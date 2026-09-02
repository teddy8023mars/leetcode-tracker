import type { StudyMode, StudyTaskKey } from '@shared/studyTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

function localMidnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysBetweenLocalDates(from: Date, to: Date): number {
  return Math.round((localMidnight(to) - localMidnight(from)) / DAY_MS);
}

export function shouldGentleRestart(lastCompletedAt: Date | null, now: Date): boolean {
  if (!lastCompletedAt) return false;
  return daysBetweenLocalDates(lastCompletedAt, now) >= 3;
}

export function requiredTaskKeys(mode: StudyMode): StudyTaskKey[] {
  return mode === 'minimum'
    ? ['review']
    : ['review', 'problem', 'career'];
}

export function selectProblemCandidate(
  candidates: readonly string[],
  progressBySlug: Readonly<Record<string, string | undefined>>,
): { slug: string; isTimedReview: boolean } {
  if (candidates.length === 0) throw new Error('At least one problem candidate is required');
  const unfinished = candidates.find((slug) => progressBySlug[slug] !== 'done');
  return unfinished
    ? { slug: unfinished, isTimedReview: false }
    : { slug: candidates[0], isTimedReview: true };
}

export function weekBounds(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = start.getDay();
  start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localDateKey(start), end: localDateKey(end) };
}
