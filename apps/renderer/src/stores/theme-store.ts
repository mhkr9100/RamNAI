import { create } from 'zustand';

type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const STORAGE_KEY = 'supreme-raman-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

function loadPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return 'dark';
}

function applyThemeToDOM(theme: ResolvedTheme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export const useThemeStore = create<ThemeState>((set) => {
  const preference = loadPreference();
  const resolved = resolveTheme(preference);

  // Apply immediately on store creation
  if (typeof window !== 'undefined') {
    applyThemeToDOM(resolved);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      set((state) => {
        if (state.preference !== 'system') return state;
        const next = getSystemTheme();
        applyThemeToDOM(next);
        return { resolved: next };
      });
    });
  }

  return {
    preference,
    resolved,
    setPreference: (preference) => {
      const resolved = resolveTheme(preference);
      applyThemeToDOM(resolved);
      try {
        localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        // localStorage unavailable
      }
      set({ preference, resolved });
    },
  };
});
