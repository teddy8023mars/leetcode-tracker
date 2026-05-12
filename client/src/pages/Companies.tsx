import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useT } from '@/contexts/LangContext';

type CompanyRow = {
  slug: string;
  nameEn: string;
  nameZh?: string | null;
  region?: string | null;
  problemCount?: number;
};

export function Companies() {
  const t = useT();
  const q = trpc.companies.all.useQuery(undefined, { staleTime: 5 * 60_000 });

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('nav.companies')}</h1>
      {q.isLoading ? (
        <p className="text-ink-soft">{t('loading')}</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <p className="text-ink-soft">{t('empty')}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {((q.data ?? []) as CompanyRow[])
            .slice()
            .sort((a, b) => (b.problemCount ?? 0) - (a.problemCount ?? 0))
            .map((c) => (
              <Link
                key={c.slug}
                href={`/companies/${c.slug}`}
                className="block bg-white/70 backdrop-blur border border-border rounded-lg p-5 hover:ring-1 hover:ring-mint-strong transition"
              >
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
                  {c.region}
                </div>
                <div className="text-lg font-bold mt-1">{c.nameEn}</div>
                <div className="text-xs text-ink-soft font-mono mt-2">
                  {t('list.problemCount', { count: c.problemCount ?? 0 })}
                </div>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
