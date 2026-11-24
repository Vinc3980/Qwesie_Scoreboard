export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'qwesie-theme';
const THEME_EVENT = 'qwesie-theme-change';

// Variant A default: dark
export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark') return v;
  return 'dark';
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  // Notify any mounted theme consumers (shell toggle, settings select, etc.)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: theme }));
  }
}

/**
 * Subscribe to theme changes so every control (header toggle, settings select)
 * stays in sync regardless of which one changed the theme.
 */
export function subscribeTheme(listener: (theme: ThemeMode) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ThemeMode>).detail;
    listener(detail === 'light' || detail === 'dark' ? detail : getStoredTheme());
  };
  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}

export function setTheme(theme: ThemeMode) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getStoredTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
