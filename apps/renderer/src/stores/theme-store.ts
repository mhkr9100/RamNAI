import { create } from 'zustand';

type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const STORAGE_KEY = 'workspace-theme';
const LEGACY_STORAGE_KEY = 'theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
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

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === 'light' || legacy === 'dark') {
      return legacy;
    }
  } catch {
    // localStorage unavailable
  }
  return 'dark';
}

function applyThemeToDOM(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export const useThemeStore = create<ThemeState>((set) => {
  const preference = loadPreference();
  const resolved = resolveTheme(preference);

  // Apply immediately on store creation
  if (typeof window !== 'undefined') {
    applyThemeToDOM(resolved);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      set((state) => {
        if (state.preference !== 'system') return state;
        const next = getSystemTheme();
        applyThemeToDOM(next);
        return { resolved: next };
      });
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }
  }

  return {
    preference,
    resolved,
    setPreference: (preference) => {
      const resolved = resolveTheme(preference);
      applyThemeToDOM(resolved);
      try {
        localStorage.setItem(STORAGE_KEY, preference);
        localStorage.setItem(LEGACY_STORAGE_KEY, resolved);
      } catch {
        // localStorage unavailable
      }
      set({ preference, resolved });
    },
  };
});
