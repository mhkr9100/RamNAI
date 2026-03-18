module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif']
      },
      colors: {
        shell: {
          50: '#f8f9fa',
          100: '#eef2f5',
          900: '#0f1113',
          950: '#08090a'
        }
      }
    }
  },
  plugins: []
};
