import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

const DOM_MOUSE_BACK = 3;
const DOM_MOUSE_FORWARD = 4;
const ALT_MOUSE_BACK = 4;
const ALT_MOUSE_FORWARD = 5;
const BUTTONS_BACK = 8;
const BUTTONS_FORWARD = 16;
const WHICH_MOUSE_BACK = 4;
const WHICH_MOUSE_FORWARD = 5;
const DUPLICATE_EVENT_MS = 150;
const SIDE_MOUSE_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick', 'click'] as const;

type HistoryDirection = 'back' | 'forward';
type LastHandledEvent = { key: string; at: number };

function historyDirectionFromMouseEvent(event: MouseEvent): HistoryDirection | null {
  if ((event.buttons & BUTTONS_BACK) === BUTTONS_BACK) return 'back';
  if ((event.buttons & BUTTONS_FORWARD) === BUTTONS_FORWARD) return 'forward';
  if (event.button === DOM_MOUSE_BACK || event.button === ALT_MOUSE_BACK) return 'back';
  if (event.button === DOM_MOUSE_FORWARD || event.button === ALT_MOUSE_FORWARD) return 'forward';
  if (event.which === WHICH_MOUSE_BACK) return 'back';
  if (event.which === WHICH_MOUSE_FORWARD) return 'forward';
  return null;
}

function historyDirectionFromKeyboardEvent(event: KeyboardEvent): HistoryDirection | null {
  if (event.key === 'BrowserBack' || event.code === 'BrowserBack') return 'back';
  if (event.key === 'BrowserForward' || event.code === 'BrowserForward') return 'forward';
  if (event.altKey && event.key === 'ArrowLeft') return 'back';
  if (event.altKey && event.key === 'ArrowRight') return 'forward';
  if (event.metaKey && event.key === '[') return 'back';
  if (event.metaKey && event.key === ']') return 'forward';
  return null;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function fallbackBackPath(pathname: string) {
  if (pathname.startsWith('/problems/')) return '/problems';
  if (pathname !== '/review') return '/review';
  return null;
}

export function MouseHistoryNavigation() {
  const [, navigate] = useLocation();
  const lastHandled = useRef<LastHandledEvent | null>(null);

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

    const alreadyHandled = (key: string) => {
      const now = Date.now();
      if (lastHandled.current?.key === key && now - lastHandled.current.at < DUPLICATE_EVENT_MS) {
        return true;
      }
      lastHandled.current = { key, at: now };
      return false;
    };

    const navigateHistory = (direction: HistoryDirection) => {
      if (direction === 'back') goBack();
      else goForward();
    };

    const onSideMouse = (event: MouseEvent) => {
      const direction = historyDirectionFromMouseEvent(event);
      if (!direction) return;

      event.preventDefault();
      event.stopPropagation();

      const handledKey = `mouse:${direction}:${event.button}:${event.buttons}:${event.which}`;
      if (alreadyHandled(handledKey)) return;

      navigateHistory(direction);
    };

    const onHistoryKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const direction = historyDirectionFromKeyboardEvent(event);
      if (!direction) return;

      event.preventDefault();
      event.stopPropagation();

      const handledKey = `key:${direction}:${event.key}:${event.code}`;
      if (alreadyHandled(handledKey)) return;

      navigateHistory(direction);
    };

    const listener: EventListener = (event) => onSideMouse(event as MouseEvent);
    const keyListener: EventListener = (event) => onHistoryKey(event as KeyboardEvent);

    const targets = [window, document, document.documentElement] as const;

    SIDE_MOUSE_EVENTS.forEach((eventName) => {
      targets.forEach((target) => target.addEventListener(eventName, listener, true));
    });
    targets.forEach((target) => target.addEventListener('keydown', keyListener, true));

    return () => {
      SIDE_MOUSE_EVENTS.forEach((eventName) => {
        targets.forEach((target) => target.removeEventListener(eventName, listener, true));
      });
      targets.forEach((target) => target.removeEventListener('keydown', keyListener, true));
    };
  }, [navigate]);

  return null;
}
