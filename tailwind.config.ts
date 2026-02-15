import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        serif: ['Crimson Text', 'Georgia', 'serif'],
        script: ['Dancing Script', 'cursive'],
      },
      colors: {
        ald: {
          background: '#FFFFFF',
          offwhite: '#F5F5F5',
          'text-primary': '#000000',
          'text-secondary': '#4A4A4A',
          navy: '#001F3F',
          green: '#8A9A5B',
          burgundy: '#722F37',
          border: '#E0E0E0',
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
} satisfies Config;
