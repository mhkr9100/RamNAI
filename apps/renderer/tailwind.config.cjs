module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#7c5cfc',
          hover: '#6d4de8',
          muted: 'rgba(124, 92, 252, 0.15)',
          subtle: 'rgba(124, 92, 252, 0.08)',
          light: '#a78bfa',
          lighter: '#c4b5fd',
        },
        surface: {
          0: '#06070a',
          1: '#0a0c10',
          2: '#0e1117',
          3: '#141720',
          4: '#1a1e28',
          elevated: '#1e2330',
        },
        shell: {
          50: '#f8f9fa',
          100: '#eef2f5',
          900: '#0f1113',
          950: '#08090a',
        },
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        glow: '0 0 20px rgba(124, 92, 252, 0.15)',
        'glow-strong': '0 0 30px rgba(124, 92, 252, 0.25)',
        card: '0 4px 12px rgba(0, 0, 0, 0.4)',
        elevated: '0 8px 24px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'fade-in-up': 'fadeInUp 0.25s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
