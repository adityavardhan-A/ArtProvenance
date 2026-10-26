/** @type {import('tailwindcss').Config} */
// Palette borrowed from security printing — the inks and papers used on
// banknotes and certificates of authenticity, which exist to defeat forgery.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#EEF0EA', // cool security paper
          deep: '#E1E6DE',    // recessed surfaces
          mat: '#F8F9F6',     // picture mat
        },
        ink: {
          DEFAULT: '#182A4A', // Prussian intaglio blue — all primary text
          soft: '#56637A',    // secondary text
          faint: '#8E98A8',   // hints, disabled
          line: '#C9D0C6',    // hairlines on paper
        },
        note: {
          DEFAULT: '#2E6B5F', // banknote green — on-chain / verified
          light: '#DCE9E3',
        },
        seal: {
          DEFAULT: '#9A2B3A', // oxblood — forgery, errors
          light: '#F2DEDF',
        },
        ochre: {
          DEFAULT: '#A86B12', // pending, warnings
          light: '#F3E7CF',
        },
      },
      fontFamily: {
        display: ['"Bodoni Moda"', 'Didot', 'Georgia', 'serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        draw: { to: { strokeDashoffset: '0' } },
        rake: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(120%)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        stamp: {
          '0%': { opacity: '0', transform: 'scale(1.35) rotate(-14deg)' },
          '60%': { opacity: '1', transform: 'scale(0.96) rotate(-8deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(-8deg)' },
        },
      },
      animation: {
        rake: 'rake 1.6s ease-in-out infinite',
        rise: 'rise 220ms ease-out both',
        stamp: 'stamp 420ms cubic-bezier(.2,.8,.3,1) both',
      },
    },
  },
  plugins: [],
};
