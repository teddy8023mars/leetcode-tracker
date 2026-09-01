import { Link, useLocation } from 'wouter';
import { useT, useLang } from '@/contexts/LangContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BlueprintBackground } from './BlueprintBackground';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/today', key: 'nav.today' },
  { href: '/review', key: 'nav.review' },
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
      <div className="h-screen flex">
        <aside className="w-64 shrink-0 border-r border-border bg-white/80 dark:bg-slate-900/90 backdrop-blur px-5 py-6 sticky top-0 h-screen flex flex-col">
          <h1 className="font-sans text-lg font-extrabold tracking-tight leading-tight mb-4">
            🐻 刷题宝典
          </h1>
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
              className="relative w-16 h-8 rounded-full bg-secondary dark:bg-slate-700 border border-border transition-colors cursor-pointer"
              title={lang === 'en' ? 'Switch to Chinese' : '切换为英文'}
            >
              <span className={`absolute top-0.5 w-7 h-7 rounded-full bg-white dark:bg-slate-500 shadow-md flex items-center justify-center text-xs font-bold transition-all duration-200 ${lang === 'zh' ? 'left-[calc(100%-1.875rem)]' : 'left-0.5'}`}>
                {lang === 'en' ? 'EN' : '中'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTheme(resolved === 'light' ? 'dark' : 'light')}
              className={`relative w-16 h-8 rounded-full border border-border transition-colors duration-200 cursor-pointer ${resolved === 'dark' ? 'bg-indigo-900' : 'bg-amber-100'}`}
              title={resolved === 'light' ? 'Dark mode' : 'Light mode'}
            >
              <span className={`absolute top-0.5 w-7 h-7 rounded-full shadow-md flex items-center justify-center text-sm transition-all duration-300 ${resolved === 'dark' ? 'left-[calc(100%-1.875rem)] bg-indigo-700' : 'left-0.5 bg-white'}`}>
                {resolved === 'dark' ? '🌙' : '☀️'}
              </span>
            </button>
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
