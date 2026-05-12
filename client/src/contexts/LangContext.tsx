import { createContext, useContext, useState, type ReactNode } from 'react';
import { en, zh, type Dict } from '@/i18n';

export type Lang = 'en' | 'zh';
const DICT: Record<Lang, Dict> = { en, zh };

type Ctx = { lang: Lang; setLang: (l: Lang) => void; dict: Dict };
const LangCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = 'lt.lang';

function readInitial(): Lang {
  if (typeof window === 'undefined') return 'en';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'zh' ? 'zh' : 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial());
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, l);
  };
  return (
    <LangCtx.Provider value={{ lang, setLang, dict: DICT[lang] }}>{children}</LangCtx.Provider>
  );
}

export function useLang() {
  const v = useContext(LangCtx);
  if (!v) throw new Error('useLang must be used within LangProvider');
  return v;
}

export function useT() {
  const { dict } = useLang();
  return function t(path: string, vars?: Record<string, string | number>): string {
    const segs = path.split('.');
    let cur: unknown = dict;
    for (const s of segs) {
      if (cur && typeof cur === 'object' && s in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[s];
      } else {
        return path;
      }
    }
    let str = typeof cur === 'string' ? cur : path;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, String(v));
      }
    }
    return str;
  };
}
