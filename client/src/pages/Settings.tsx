import { useT, useLang } from '@/contexts/LangContext';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

export function Settings() {
  const t = useT();
  const { lang, setLang } = useLang();
  const llmQ = trpc.system.llmStatus.useQuery(undefined, { staleTime: 60_000 });
  const llmConfigured = llmQ.data?.configured ?? false;
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('nav.settings')}</h1>

      <section className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border border-border rounded-lg p-6">
        <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest mb-4">
          {t('settings.language')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant={lang === 'en' ? 'default' : 'outline'}
            onClick={() => setLang('en')}
          >
            English
          </Button>
          <Button
            variant={lang === 'zh' ? 'default' : 'outline'}
            onClick={() => setLang('zh')}
          >
            中文
          </Button>
        </div>
      </section>

      <section className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border border-border rounded-lg p-6">
        <h2 className="font-mono text-xs uppercase text-ink-soft tracking-widest mb-4">
          {t('settings.llm')}
        </h2>
        {llmQ.isLoading ? (
          <p className="text-sm text-ink-soft">{t('loading')}</p>
        ) : llmConfigured ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            {t('settings.llmConfigured')}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">{t('settings.llmMissing')}</p>
            <p className="text-sm text-ink-soft">{t('settings.llmHowTo')}</p>
            <pre className="text-xs font-mono bg-secondary rounded p-3 overflow-x-auto">
{`// ${t('settings.llmConfigPath')}
{
  "BUILT_IN_FORGE_API_URL": "https://api.openai.com",
  "BUILT_IN_FORGE_API_KEY": "sk-..."
}`}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
