// Print the WCAG 2.2 contrast matrix for the rendered OKLCH values.
import { readFile } from 'node:fs/promises'

const tokens = JSON.parse(await readFile(new URL('../frontend/src/tokens.json', import.meta.url), 'utf8'))
const pairs = [
  ['Body text on canvas', 'foreground', 'background', 4.5],
  ['Body text on panel', 'foreground', 'surface', 4.5],
  ['Body text on selected panel', 'foreground', 'primary-soft', 4.5],
  ['Secondary text on canvas', 'secondary', 'background', 4.5],
  ['Secondary text on panel', 'secondary', 'surface', 4.5],
  ['Secondary text on muted fill', 'secondary', 'muted', 4.5],
  ['Secondary text on selected panel', 'secondary', 'primary-soft', 4.5],
  ['Primary link on panel', 'primary', 'surface', 4.5],
  ['Primary link on selected panel', 'primary', 'primary-soft', 4.5],
  ['Primary button label', 'primary-ink', 'primary', 4.5],
  ['Hovered primary button label', 'primary-ink', 'primary-hover', 4.5],
  ['Control boundary on canvas', 'control', 'background', 3],
  ['Control boundary on panel', 'control', 'surface', 3],
  ['Focus ring on canvas', 'primary', 'background', 3],
  ['Schedule timezone accent', 'accent', 'background', 4.5],
  ['Positive status', 'success', 'success-bg', 4.5],
  ['Caution status', 'warning', 'warning-bg', 4.5],
  ['Urgent status', 'danger', 'danger-bg', 4.5],
  ['Inline error on panel', 'danger', 'surface', 4.5],
  ['Destructive button label', 'danger-ink', 'danger-action', 4.5],
  ['Chart bar on track', 'chart', 'muted', 3],
  ['Rail label', 'desk-ink', 'desk', 4.5],
  ['Rail secondary label', 'desk-secondary', 'desk', 4.5],
  ['Selected rail icon', 'desk-accent', 'desk-hover', 3],
  ['Call console and counter text', 'desk-ink', 'plate', 4.5],
  ['Call console secondary text', 'desk-secondary', 'plate', 4.5],
  ['Call console signal', 'desk-accent', 'plate', 3],
]

function luminance(color) {
  const [lightness, chroma, degrees] = color.slice(6, -1).split(' ').map(Number)
  const radians = degrees * Math.PI / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + .3963377774 * a + .2158037573 * b) ** 3
  const m = (lightness - .1055613458 * a - .0638541728 * b) ** 3
  const s = (lightness - .0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)))
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]
}

function contrast(theme, foreground, background) {
  const a = luminance(tokens[theme][foreground].oklch)
  const b = luminance(tokens[theme][background].oklch)
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
}

console.log('| Use | Light | Dark | AA minimum |\n| --- | ---: | ---: | ---: |')
for (const [use, ink, surface, minimum] of pairs) {
  const light = contrast('light', ink, surface)
  const dark = contrast('dark', ink, surface)
  console.log(`| ${use} | ${light.toFixed(2)}:1 | ${dark.toFixed(2)}:1 | ${minimum}:1 |`)
  if (Math.min(light, dark) < minimum) process.exitCode = 1
}
