import { useT } from '@/contexts/LangContext';
import type { Difficulty } from '@shared/problemTypes';

const COLOR: Record<Difficulty, string> = {
  Easy: 'bg-mint/40 text-ink ring-mint-strong',
  Medium: 'bg-pink/40 text-ink ring-pink-strong',
  Hard: 'bg-[var(--blueprint-error)]/20 text-ink ring-[var(--blueprint-error)]',
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
