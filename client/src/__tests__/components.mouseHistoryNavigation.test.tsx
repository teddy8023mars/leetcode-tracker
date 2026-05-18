import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MouseHistoryNavigation } from '@/components/MouseHistoryNavigation';

describe('MouseHistoryNavigation', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('maps the mouse back side button to browser history back', () => {
    window.history.pushState({}, '', '/problems');
    window.history.pushState({}, '', '/problems/two-sum');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(<MouseHistoryNavigation />);
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 3,
    });
    window.dispatchEvent(event);

    expect(back).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('maps the mouse forward side button to browser history forward', () => {
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);

    render(<MouseHistoryNavigation />);
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 4,
      buttons: 16,
    });
    window.dispatchEvent(event);

    expect(forward).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('treats alternate button 4 back events as browser history back', () => {
    window.history.pushState({}, '', '/problems');
    window.history.pushState({}, '', '/problems/two-sum');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(<MouseHistoryNavigation />);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 4 }));

    expect(back).toHaveBeenCalledOnce();
  });

  it('treats alternate button 5 events as browser history forward', () => {
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);

    render(<MouseHistoryNavigation />);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 5 }));

    expect(forward).toHaveBeenCalledOnce();
  });

  it('treats legacy which=4 events as browser history back', () => {
    window.history.pushState({}, '', '/problems');
    window.history.pushState({}, '', '/problems/two-sum');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'which', { value: 4 });

    render(<MouseHistoryNavigation />);
    document.documentElement.dispatchEvent(event);

    expect(back).toHaveBeenCalledOnce();
  });

  it('deduplicates mousedown and auxclick for the same side button gesture', () => {
    window.history.pushState({}, '', '/problems');
    window.history.pushState({}, '', '/problems/two-sum');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(<MouseHistoryNavigation />);
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 3 }));
    window.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 3 }));

    expect(back).toHaveBeenCalledOnce();
  });

  it('maps BrowserBack keyboard events to browser history back', () => {
    window.history.pushState({}, '', '/problems');
    window.history.pushState({}, '', '/problems/two-sum');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'BrowserBack',
    });

    render(<MouseHistoryNavigation />);
    window.dispatchEvent(event);

    expect(back).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('maps browser history keyboard shortcuts to browser history navigation', () => {
    window.history.pushState({}, '', '/problems');
    window.history.pushState({}, '', '/problems/two-sum');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);

    render(<MouseHistoryNavigation />);
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        altKey: true,
        key: 'ArrowLeft',
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        key: ']',
      }),
    );

    expect(back).toHaveBeenCalledOnce();
    expect(forward).toHaveBeenCalledOnce();
  });

  it('does not capture history shortcuts from editable fields', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const input = document.createElement('input');
    document.body.append(input);

    render(<MouseHistoryNavigation />);
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        altKey: true,
        key: 'ArrowLeft',
      }),
    );

    expect(back).not.toHaveBeenCalled();
  });
});
