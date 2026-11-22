/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'oklch(var(--border) / <alpha-value>)',
        background: 'oklch(var(--background) / <alpha-value>)',
        foreground: 'oklch(var(--foreground) / <alpha-value>)',
        card: { DEFAULT: 'oklch(var(--card) / <alpha-value>)', foreground: 'oklch(var(--card-foreground) / <alpha-value>)' },
        primary: { DEFAULT: 'oklch(var(--primary) / <alpha-value>)', foreground: 'oklch(var(--primary-foreground) / <alpha-value>)' },
        secondary: { DEFAULT: 'oklch(var(--secondary) / <alpha-value>)', foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)' },
        muted: { DEFAULT: 'oklch(var(--muted) / <alpha-value>)', foreground: 'oklch(var(--muted-foreground) / <alpha-value>)' },
        accent: { DEFAULT: 'oklch(var(--accent) / <alpha-value>)', foreground: 'oklch(var(--accent-foreground) / <alpha-value>)' },
        destructive: { DEFAULT: 'oklch(var(--destructive) / <alpha-value>)', foreground: 'oklch(var(--destructive-foreground) / <alpha-value>)' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px -6px rgb(0 0 0 / 0.08)',
        lift: '0 2px 4px rgb(0 0 0 / 0.05), 0 12px 28px -10px rgb(0 0 0 / 0.18)',
      },
      fontFamily: {
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Mono is the system stack, used only for times and phone
        // numbers (the "day book" time gutter) — no new font download.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
