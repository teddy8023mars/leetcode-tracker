import { useT } from '@/contexts/LangContext';
import type { Difficulty } from '@shared/problemTypes';

const COLOR: Record<Difficulty, string> = {
  Easy: 'bg-emerald-100 text-emerald-700 ring-emerald-300',
  Medium: 'bg-amber-100 text-amber-700 ring-amber-300',
  Hard: 'bg-rose-100 text-rose-700 ring-rose-300',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono ring-1 ring-inset ${COLOR[difficulty]}`}
    >
      {t(`difficulty.${difficulty}`)}
    </span>
  );
}
