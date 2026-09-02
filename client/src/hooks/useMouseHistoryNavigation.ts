import { useEffect } from 'react';

export function useMouseHistoryNavigation() {
  useEffect(() => {
    const navigateWithSideButton = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      if (event.button === 3) window.history.back();
      else window.history.forward();
    };

    window.addEventListener('mousedown', navigateWithSideButton, true);
    return () => window.removeEventListener('mousedown', navigateWithSideButton, true);
  }, []);
}
