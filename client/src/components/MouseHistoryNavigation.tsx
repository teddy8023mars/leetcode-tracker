import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

const DOM_MOUSE_BACK = 3;
const DOM_MOUSE_FORWARD = 4;
const ALT_MOUSE_BACK = 4;
const ALT_MOUSE_FORWARD = 5;
const BUTTONS_BACK = 8;
const BUTTONS_FORWARD = 16;
const DUPLICATE_EVENT_MS = 150;
const SIDE_MOUSE_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'auxclick'] as const;

type HistoryDirection = 'back' | 'forward';

function historyDirectionFromEvent(event: MouseEvent): HistoryDirection | null {
  if ((event.buttons & BUTTONS_BACK) === BUTTONS_BACK) return 'back';
  if ((event.buttons & BUTTONS_FORWARD) === BUTTONS_FORWARD) return 'forward';
  if (event.button === DOM_MOUSE_BACK || event.button === ALT_MOUSE_BACK) return 'back';
  if (event.button === DOM_MOUSE_FORWARD || event.button === ALT_MOUSE_FORWARD) return 'forward';
  return null;
}

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
      const direction = historyDirectionFromEvent(event);
      if (!direction) return;

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

      if (direction === 'back') goBack();
      else goForward();
    };

    SIDE_MOUSE_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onSideMouse, true);
    });
    return () => {
      SIDE_MOUSE_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onSideMouse, true);
      });
    };
  }, [navigate]);

  return null;
}
