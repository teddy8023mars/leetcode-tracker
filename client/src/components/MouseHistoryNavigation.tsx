import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

const DOM_MOUSE_BACK = 3;
const DOM_MOUSE_FORWARD = 4;
const DUPLICATE_EVENT_MS = 150;

function fallbackBackPath(pathname: string) {
  if (pathname.startsWith('/problems/')) return '/problems';
  if (pathname !== '/review') return '/review';
  return null;
}

export function MouseHistoryNavigation() {
  const [, navigate] = useLocation();
  const lastHandled = useRef<{ button: number; at: number } | null>(null);

  useEffect(() => {
    const goBack = () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      const fallback = fallbackBackPath(window.location.pathname);
      if (fallback) navigate(fallback);
    };

    const goForward = () => window.history.forward();

    const onSideMouse = (event: MouseEvent) => {
      if (event.button !== DOM_MOUSE_BACK && event.button !== DOM_MOUSE_FORWARD) return;

      event.preventDefault();
      event.stopPropagation();

      const now = Date.now();
      if (
        lastHandled.current?.button === event.button &&
        now - lastHandled.current.at < DUPLICATE_EVENT_MS
      ) {
        return;
      }
      lastHandled.current = { button: event.button, at: now };

      if (event.button === DOM_MOUSE_BACK) goBack();
      else goForward();
    };

    window.addEventListener('mousedown', onSideMouse, true);
    window.addEventListener('auxclick', onSideMouse, true);
    return () => {
      window.removeEventListener('mousedown', onSideMouse, true);
      window.removeEventListener('auxclick', onSideMouse, true);
    };
  }, [navigate]);

  return null;
}
