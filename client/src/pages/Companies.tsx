import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useT, useLang } from '@/contexts/LangContext';

type CompanyRow = {
  slug: string;
  nameEn: string;
  nameZh?: string | null;
  region?: string | null;
  problemCount?: number;
};

const COMPANY_ZH: Record<string, string> = {
  google: '谷歌', meta: 'Meta（脸书）', amazon: '亚马逊',
  microsoft: '微软', apple: '苹果', netflix: '奈飞',
  uber: '优步', airbnb: '爱彼迎', linkedin: '领英',
  salesforce: 'Salesforce', adobe: 'Adobe', nvidia: '英伟达',
  tesla: '特斯拉', bytedance: '字节跳动', tencent: '腾讯',
  alibaba: '阿里巴巴', baidu: '百度', meituan: '美团',
  xiaohongshu: '小红书', didi: '滴滴', grab: 'Grab',
  shopee: '虾皮', sea: 'Sea', tiktok: 'TikTok', lazada: 'Lazada',
};

const COMPANY_DOMAIN: Record<string, string> = {
  google: 'google.com', meta: 'meta.com', amazon: 'amazon.com',
  microsoft: 'microsoft.com', apple: 'apple.com', netflix: 'netflix.com',
  uber: 'uber.com', airbnb: 'airbnb.com', linkedin: 'linkedin.com',
  salesforce: 'salesforce.com', adobe: 'adobe.com', nvidia: 'nvidia.com',
  tesla: 'tesla.com', bytedance: 'jobs.bytedance.com', tencent: 'tencent.com',
  alibaba: 'alibaba.com', baidu: 'baidu.com', meituan: 'meituan.com',
  xiaohongshu: 'xiaohongshu.com', didi: 'didiglobal.com',
  grab: 'grab.com', shopee: 'shopee.sg', sea: 'sea.com',
  tiktok: 'tiktok.com', lazada: 'lazada.com',
};

export function Companies() {
  const t = useT();
  const { lang } = useLang();
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
            .filter((c) => (c.problemCount ?? 0) > 0)
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
                <div className="flex items-center gap-2 mt-1">
                  <img
                    src={`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${COMPANY_DOMAIN[c.slug] ?? c.slug + '.com'}&size=64`}
                    alt={c.nameEn}
                    className="w-8 h-8 rounded"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div>
                    <div className="text-lg font-bold">{lang === 'zh' ? (COMPANY_ZH[c.slug] ?? c.nameEn) : c.nameEn}</div>
                    {lang === 'zh' && COMPANY_ZH[c.slug] && COMPANY_ZH[c.slug] !== c.nameEn && (
                      <div className="text-[11px] text-ink-soft">{c.nameEn}</div>
                    )}
                  </div>
                </div>
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
