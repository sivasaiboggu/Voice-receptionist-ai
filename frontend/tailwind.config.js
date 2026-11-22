/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--background)',
        sheet: 'var(--surface)',
        ink: 'var(--foreground)',
        secondary: 'var(--secondary)',
        muted: 'var(--muted)',
        rule: 'var(--border)',
        control: 'var(--control)',
        forest: 'var(--primary)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        neutral: Object.fromEntries([0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [step, `var(--neutral-${step})`])),
      },
      borderRadius: { control: 'var(--radius)' },
      boxShadow: { sheet: 'var(--depth-sheet)', notice: 'var(--depth-notice)' },
      fontFamily: {
        sans: ['Source Sans 3 Variable', 'system-ui', 'sans-serif'],
        display: ['Fraunces Variable', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
}
