import { Link, useLocation } from 'wouter';
import { useT, useLang } from '@/contexts/LangContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BlueprintBackground } from './BlueprintBackground';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/problems', key: 'nav.problems' },
  { href: '/sync', key: 'nav.sync' },
  { href: '/settings', key: 'nav.settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const { theme, setTheme, resolved } = useTheme();
  const [loc] = useLocation();
  return (
    <>
      <BlueprintBackground />
      <div className="min-h-screen flex">
        <aside className="w-64 shrink-0 border-r border-border bg-white/80 dark:bg-slate-900/90 backdrop-blur px-5 py-6 sticky top-0 h-screen flex flex-col">
          <h1 className="font-sans text-lg font-extrabold tracking-tight leading-tight mb-4">
            🐻 刷题宝典
          </h1>
          <div className="mb-6 flex items-center gap-3">
            <div className="relative flex bg-secondary dark:bg-slate-800 rounded-full p-0.5 border border-border">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`relative z-10 px-2.5 py-1 text-xs font-mono rounded-full transition-all ${lang === 'en' ? 'bg-white dark:bg-slate-600 text-ink shadow-sm font-bold' : 'text-ink-soft'}`}
              >EN</button>
              <button
                type="button"
                onClick={() => setLang('zh')}
                className={`relative z-10 px-2.5 py-1 text-xs font-mono rounded-full transition-all ${lang === 'zh' ? 'bg-white dark:bg-slate-600 text-ink shadow-sm font-bold' : 'text-ink-soft'}`}
              >中</button>
            </div>
            <div className="relative flex bg-secondary dark:bg-slate-800 rounded-full p-0.5 border border-border">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`relative z-10 px-2 py-1 text-xs rounded-full transition-all ${resolved === 'light' ? 'bg-white shadow-sm' : 'opacity-50'}`}
              >☀️</button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`relative z-10 px-2 py-1 text-xs rounded-full transition-all ${resolved === 'dark' ? 'bg-slate-600 shadow-sm' : ''}`}
              >🌙</button>
            </div>
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
                      ? 'bg-ink text-primary-foreground dark:bg-slate-700 dark:text-white'
                      : 'text-ink-soft hover:bg-secondary'
                  }`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 p-8 overflow-auto dark:text-slate-200">{children}</main>
      </div>
    </>
  );
}
