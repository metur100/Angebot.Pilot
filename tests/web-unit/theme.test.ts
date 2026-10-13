import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getResolvedTheme, getThemePreference, initTheme, setThemePreference, THEME_KEY } from '@/lib/theme';

/** Controllable prefers-color-scheme media query (jsdom has no matchMedia). */
function fakeColorScheme(initiallyDark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initiallyDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: () => query });
  return {
    setDark(dark: boolean) {
      query.matches = dark;
      for (const listener of listeners) listener();
    },
  };
}

const original = window.matchMedia;
let meta: HTMLMetaElement;

beforeEach(() => {
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.appendChild(meta);
});

afterEach(() => {
  meta.remove();
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: original });
});

describe('theme', () => {
  it('follows the operating system by default, also when it changes later', () => {
    const os = fakeColorScheme(true);
    initTheme();
    expect(getThemePreference()).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(meta.content).toBe('#171B23');

    os.setDark(false);
    expect(getResolvedTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta.content).toBe('#2F45D8');
  });

  it('applies and remembers an explicit choice, ignoring the system setting', () => {
    const os = fakeColorScheme(false);
    initTheme();
    setThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    os.setDark(false);
    expect(document.documentElement.dataset.theme).toBe('dark');

    setThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('restores the stored choice on start and forgets it when switching back to system', () => {
    fakeColorScheme(false);
    localStorage.setItem(THEME_KEY, 'dark');
    initTheme();
    expect(getThemePreference()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    setThemePreference('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignores invalid stored values', () => {
    fakeColorScheme(false);
    localStorage.setItem(THEME_KEY, 'neon');
    initTheme();
    expect(getThemePreference()).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
