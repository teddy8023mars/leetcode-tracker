export type AppSection = 'today' | 'roadmap' | 'review' | 'problems' | 'sync' | 'settings';

export type NavigationOrigin = {
  section: AppSection;
  href: string;
};

const ORIGIN_KEY = 'appNavigationOrigin';
const APP_BASE = 'http://leetcode-tracker.local';

export function navigationOriginFromHref(href: string): NavigationOrigin | null {
  if (!href.startsWith('/') || href.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(href, APP_BASE);
  } catch {
    return null;
  }
  if (url.origin !== APP_BASE) return null;

  const section = sectionFromPathname(url.pathname);
  if (!section) return null;
  return { section, href: `${url.pathname}${url.search}${url.hash}` };
}

export function readNavigationOrigin(state: unknown): NavigationOrigin | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const candidate = (state as Record<string, unknown>)[ORIGIN_KEY];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const { href, section } = candidate as Record<string, unknown>;
  if (typeof href !== 'string' || typeof section !== 'string') return null;
  const parsed = navigationOriginFromHref(href);
  return parsed?.section === section ? parsed : null;
}

export function problemNavigationState(currentHref: string, state: unknown): Record<string, unknown> {
  const base = state && typeof state === 'object' && !Array.isArray(state)
    ? { ...(state as Record<string, unknown>) }
    : {};
  const origin = readNavigationOrigin(state) ?? navigationOriginFromHref(currentHref);
  return origin ? { ...base, [ORIGIN_KEY]: origin } : base;
}

export function navigationStateWithOrigin(origin: NavigationOrigin, state: unknown): Record<string, unknown> {
  const base = state && typeof state === 'object' && !Array.isArray(state)
    ? { ...(state as Record<string, unknown>) }
    : {};
  return { ...base, [ORIGIN_KEY]: origin };
}

export function currentAppHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function sectionFromPathname(pathname: string): AppSection | null {
  if (pathname === '/today') return 'today';
  if (pathname === '/review') return 'review';
  if (pathname === '/problems') return 'problems';
  if (/^\/roadmap\/[^/]+$/.test(pathname)) return 'roadmap';
  if (pathname === '/sync') return 'sync';
  if (pathname === '/settings') return 'settings';
  return null;
}
