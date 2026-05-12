import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import type { Difficulty } from '@shared/problemTypes';

type ListMeta = {
  slug: string;
  titleEn: string;
  titleZh?: string | null;
  problemCount?: number;
};
type ProblemRow = {
  id: number;
  frontendId: number;
  titleSlug: string;
  titleEn: string;
  titleZh?: string | null;
  difficulty: Difficulty;
};

export function ListDetail({ slug }: { slug: string }) {
  const t = useT();
  const { lang } = useLang();
  const meta = trpc.lists.getBySlug.useQuery({ slug }, { staleTime: 60_000 });
  const items = trpc.problems.list.useQuery(
    { filters: { listSlug: slug }, limit: 200 },
    { staleTime: 60_000 },
  );

  if (meta.isLoading) return <p className="text-ink-soft">{t('loading')}</p>;
  if (!meta.data) return <p className="text-ink-soft">{t('empty')}</p>;
  const list = meta.data as ListMeta;
  const probs = (items.data?.items ?? []) as ProblemRow[];
  const title = lang === 'zh' ? list.titleZh || list.titleEn : list.titleEn;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col gap-2">
        <Link
          href="/lists"
          className="text-sm font-mono text-ink-soft hover:text-ink w-fit"
        >
          {t('list.backToLists')}
        </Link>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <span className="text-sm text-ink-soft font-mono">
            {t('list.problemCount', { count: list.problemCount ?? probs.length })}
          </span>
        </div>
      </div>

      {items.isLoading ? (
        <p className="text-ink-soft">{t('loading')}</p>
      ) : probs.length === 0 ? (
        <p className="text-ink-soft">{t('empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-ink-soft border-b border-border">
            <tr>
              <th className="py-2 pr-3 w-16 font-mono">{t('problemList.no')}</th>
              <th className="py-2 pr-3 font-mono">{t('problemList.name')}</th>
              <th className="py-2 pr-3 w-24 font-mono">{t('problemList.diff')}</th>
            </tr>
          </thead>
          <tbody>
            {probs.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-secondary/40">
                <td className="py-2 pr-3 font-mono text-ink-soft">{p.frontendId}</td>
                <td className="pr-3 py-2">
                  <Link href={`/problems/${p.titleSlug}`} className="hover:underline">
                    {lang === 'zh' ? p.titleZh || p.titleEn : p.titleEn}
                  </Link>
                </td>
                <td className="pr-3 py-2">
                  <DifficultyBadge difficulty={p.difficulty} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
