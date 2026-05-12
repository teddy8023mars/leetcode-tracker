import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';

type ListRow = {
  id: number;
  slug: string;
  titleEn: string;
  titleZh?: string | null;
  problemCount?: number;
};

export function Lists() {
  const t = useT();
  const { lang } = useLang();
  const q = trpc.lists.all.useQuery(undefined, { staleTime: 60_000 });

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('nav.lists')}</h1>
      {q.isLoading ? (
        <p className="text-ink-soft">{t('loading')}</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <p className="text-ink-soft">{t('empty')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {((q.data ?? []) as ListRow[]).map((l) => (
            <Link
              key={l.slug}
              href={`/lists/${l.slug}`}
              className="block bg-white/70 backdrop-blur border border-border rounded-lg p-6 hover:ring-1 hover:ring-mint-strong transition"
            >
              <div className="font-mono text-xs text-ink-soft mb-2">/{l.slug}</div>
              <div className="text-xl font-bold mb-1">
                {lang === 'zh' ? l.titleZh || l.titleEn : l.titleEn}
              </div>
              <div className="text-sm text-ink-soft font-mono">
                {t('list.problemCount', { count: l.problemCount ?? 0 })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
