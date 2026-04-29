/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      colors: {
        // Gold accent scale — unchanged; works on both the old dark theme
        // and the new ivory/ink luxury SaaS theme.
        brand: {
          50: '#fdf8f0',
          100: '#f7edd8',
          200: '#edcf9f',
          300: '#e2b066',
          400: '#d4903a',
          500: '#c17820',
          600: '#a3621a',
          700: '#7d4a14',
          800: '#5a340e',
          900: '#3a2009',
        },
        // `obsidian` is semantically "page/surface" in this codebase. We've
        // flipped its *values* from near-black → warm off-white so every
        // existing `bg-obsidian*` utility picks up the luxury-SaaS light
        // theme. The page sits on a deeper warm sand so pure-white cards
        // have something visible to pop off of.
        // Page vs card separation is the key to "premium SaaS" feel here —
        // deeper warm sand page + pure-white elevated cards gives real
        // stacking, not the washed-out feel of ivory-on-ivory.
        obsidian: {
          DEFAULT: '#eadfc5', // warm sand page bg
          50: '#ffffff',       // elevated (dropdowns, modals)
          100: '#fbf5e5',      // card / panel
          200: '#d4c6a3',      // deeper inset (inputs, scroll troughs)
        },
        // `cream` = primary text. Pure black ensures `text-cream/40` and
        // `text-cream/50` captions stay readable on the warm sand bg.
        cream: {
          DEFAULT: '#000000',  // primary ink (pure black, max contrast)
          light: '#0a0706',    // emphasis
          dark: '#4a3f2f',     // muted taupe body
        },
        // Preserved dark color for text that must stay dark regardless of
        // theme (e.g. text on gold buttons, which would lose contrast if it
        // became ivory). Use `text-ink` / `bg-ink` for those cases.
        ink: {
          DEFAULT: '#0a0908',
          soft: '#1c1510',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '3rem',
      },
      boxShadow: {
        luxury: '0 25px 80px rgba(193,120,32,0.15)',
        glow: '0 0 40px rgba(193,120,32,0.3)',
      },
    },
  },
  plugins: [],
}
