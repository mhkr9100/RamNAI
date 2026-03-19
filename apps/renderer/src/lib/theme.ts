export const colors = {
  brand: {
    primary: '#7c5cfc',
    primaryHover: '#6d4de8',
    primaryMuted: 'rgba(124, 92, 252, 0.15)',
    primarySubtle: 'rgba(124, 92, 252, 0.08)',
    secondary: '#38bdf8',
    secondaryMuted: 'rgba(56, 189, 248, 0.15)',
    accent: '#a78bfa',
    accentSubtle: '#c4b5fd',
  },

  surface: {
    depth0: '#06070a',
    depth1: '#0a0c10',
    depth2: '#0e1117',
    depth3: '#141720',
    depth4: '#1a1e28',
    elevated: '#1e2330',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },

  border: {
    subtle: 'rgba(255, 255, 255, 0.06)',
    default: 'rgba(255, 255, 255, 0.10)',
    strong: 'rgba(255, 255, 255, 0.16)',
    focus: 'rgba(124, 92, 252, 0.5)',
    brandSubtle: 'rgba(124, 92, 252, 0.20)',
  },

  text: {
    primary: 'rgba(255, 255, 255, 0.92)',
    secondary: 'rgba(255, 255, 255, 0.65)',
    tertiary: 'rgba(255, 255, 255, 0.42)',
    muted: 'rgba(255, 255, 255, 0.28)',
    inverse: '#06070a',
    brand: '#a78bfa',
    link: '#7c5cfc',
  },

  status: {
    success: '#34d399',
    successMuted: 'rgba(52, 211, 153, 0.15)',
    warning: '#fbbf24',
    warningMuted: 'rgba(251, 191, 36, 0.15)',
    error: '#f87171',
    errorMuted: 'rgba(248, 113, 113, 0.12)',
    info: '#38bdf8',
    infoMuted: 'rgba(56, 189, 248, 0.12)',
  },

  live: '#34d399',
  offline: 'rgba(255, 255, 255, 0.28)',
} as const;

export const typography = {
  family: {
    sans: "'Inter', system-ui, -apple-system, sans-serif",
    display: "'Outfit', 'Inter', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
  },

  size: {
    '2xs': '0.625rem',   // 10px
    xs: '0.6875rem',     // 11px
    sm: '0.8125rem',     // 13px
    base: '0.875rem',    // 14px
    md: '1rem',          // 16px
    lg: '1.125rem',      // 18px
    xl: '1.25rem',       // 20px
    '2xl': '1.5rem',     // 24px
    '3xl': '1.875rem',   // 30px
  },

  weight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    black: '900',
  },

  leading: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },

  label: {
    fontSize: '0.6875rem',
    fontWeight: '600',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },

  caption: {
    fontSize: '0.625rem',
    fontWeight: '700',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
  },
} as const;

export const spacing = {
  px: '1px',
  0.5: '0.125rem',
  1: '0.25rem',
  1.5: '0.375rem',
  2: '0.5rem',
  2.5: '0.625rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
} as const;

export const radius = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.25rem',
  '3xl': '1.5rem',
  full: '9999px',
  pill: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
  xl: '0 12px 40px rgba(0, 0, 0, 0.6)',
  glow: '0 0 20px rgba(124, 92, 252, 0.15)',
  glowStrong: '0 0 30px rgba(124, 92, 252, 0.25)',
  inner: 'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
} as const;

export const animation = {
  duration: {
    instant: '50ms',
    fast: '150ms',
    normal: '250ms',
    slow: '400ms',
    slower: '600ms',
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
  framer: {
    fadeIn: { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } },
    fadeInUp: {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
    },
    fadeInDown: {
      initial: { opacity: 0, y: -8 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
    },
    slideInLeft: {
      initial: { opacity: 0, x: -12 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
    },
    slideInRight: {
      initial: { opacity: 0, x: 12 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
    },
    scaleIn: {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: 0.2, ease: [0.34, 1.56, 0.64, 1] },
    },
    stagger: (index: number, base = 0.05) => ({
      transition: { delay: index * base },
    }),
  },
} as const;

export const layout = {
  sidebar: {
    collapsed: '68px',
    expanded: '220px',
  },
  header: {
    height: '52px',
  },
  content: {
    maxWidth: '1360px',
  },
  chat: {
    maxWidth: '46rem',
  },
} as const;

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  popover: 50,
  toast: 60,
  tooltip: 70,
  commandPalette: 80,
} as const;
