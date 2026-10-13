/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fdc: {
          green: '#00973D',
          'green-light': '#009846',
          'green-lighter': '#00A65B',
          'green-dark': '#00612D',
          gold: '#FFBF00',
          'gold-light': '#FFDB26',
          'gold-dark': '#EFAE0E',
          orange: '#F36D06',
          red: '#D91701',
          blue: '#2E7CE4',
          ink: '#161616',
          slate: '#343434',
          grey: '#707070',
          light: '#CECECE',
          offwhite: '#F6F6F6',
          'offwhite-2': '#F2F2F2',
          'row-odd': '#E7EEEA',
          'row-even': '#F5F5F5',
        },
      },
      fontFamily: {
        sans: ['Rubik', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22,22,22,0.04), 0 4px 16px rgba(22,22,22,0.06)',
        'card-hover': '0 2px 4px rgba(22,22,22,0.06), 0 12px 32px rgba(22,22,22,0.10)',
        pop: '0 8px 28px rgba(22,22,22,0.16)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
