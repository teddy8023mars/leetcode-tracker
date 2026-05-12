import { useT, useLang } from '@/contexts/LangContext';
import { Button } from '@/components/ui/button';

export function Settings() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('nav.settings')}</h1>

      <section className="bg-white/70 backdrop-blur border border-border rounded-lg p-6">
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
    </div>
  );
}
