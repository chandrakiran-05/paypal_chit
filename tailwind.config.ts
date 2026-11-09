import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: { ink: '#14231f', muted: '#66756e', mint: '#b6f3da', paper: '#f8f9f5' },
      boxShadow: { card: '0 12px 35px rgba(20,35,31,.06)' }
    }
  },
  plugins: []
} satisfies Config;
