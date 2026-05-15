import { Link, useLocation } from 'wouter';
import { useT, useLang } from '@/contexts/LangContext';
import { BlueprintBackground } from './BlueprintBackground';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/problems', key: 'nav.problems' },
  { href: '/companies', key: 'nav.companies' },
  { href: '/sync', key: 'nav.sync' },
  { href: '/settings', key: 'nav.settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const [loc] = useLocation();
  return (
    <>
      <BlueprintBackground />
      <div className="min-h-screen flex">
        <aside className="w-64 shrink-0 border-r border-border bg-white/80 backdrop-blur px-5 py-6 sticky top-0 h-screen flex flex-col">
          <h1 className="font-sans text-lg font-extrabold tracking-tight leading-tight mb-4">
            LeetCode<br />Tracker
          </h1>
          <div className="mb-6 flex gap-2">
            <Button
              size="sm"
              variant={lang === 'en' ? 'default' : 'outline'}
              onClick={() => setLang('en')}
            >
              EN
            </Button>
            <Button
              size="sm"
              variant={lang === 'zh' ? 'default' : 'outline'}
              onClick={() => setLang('zh')}
            >
              中
            </Button>
          </div>
          <nav className="flex flex-col gap-1 flex-1">
            {NAV.map((item) => {
              const active = loc === item.href || loc.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-md font-mono text-sm ${
                    active
                      ? 'bg-ink text-primary-foreground'
                      : 'text-ink-soft hover:bg-secondary'
                  }`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </>
  );
}
