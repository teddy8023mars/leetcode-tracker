import { useT } from '@/contexts/LangContext';
import type { ProgressStatus } from '@shared/problemTypes';

const COLOR: Record<ProgressStatus, string> = {
  todo: 'bg-secondary text-ink-soft',
  reviewing: 'bg-pink/40 text-ink',
  done: 'bg-mint/60 text-ink',
};

export function StatusBadge({ status }: { status: ProgressStatus }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono ${COLOR[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
