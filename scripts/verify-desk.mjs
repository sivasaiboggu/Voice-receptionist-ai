// Run against a built dashboard and a disposable, seeded clinic database.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(path.resolve(process.env.RECEPTION_AUDIT_TOOLS || 'work/reception-audit', 'package.json'))
const { chromium } = require('playwright-core')
const axe = require.resolve('axe-core/axe.min.js')
const base = process.env.RECEPTION_SCREENSHOT_URL || 'http://127.0.0.1:4173'
const output = path.resolve(process.env.RECEPTION_SCREENSHOT_DIR || 'work/reception-screenshots')
const routes = [
  ['overview', '/', 'Front desk'],
  ['calls', '/calls', 'Calls'],
  ['appointments', '/appointments', 'Appointments'],
  ['live', '/live', 'Live call'],
  ['settings', '/settings', 'Settings'],
]
const mobile = 390
const desktop = 1440

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
await mkdir(output, { recursive: true })

async function newPage(width, theme) {
  const context = await browser.newContext({
    viewport: { width, height: width >= 768 ? 1000 : 844 },
    reducedMotion: 'reduce',
  })
  await context.addInitScript((mode) => localStorage.setItem('vr-theme', mode), theme)
  return context.newPage()
}

async function open(page, route, title) {
  await page.goto(new URL(route, base).href)
  await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor()
  await page.locator('.loading-rows').waitFor({ state: 'hidden' })
  await page.getByText('API connected', { exact: true }).first().waitFor({ state: 'attached' })
  assert.equal(await page.locator('.load-error').count(), 0, `API error at ${route}`)
  await page.evaluate(() => document.fonts.ready)
}

async function capture(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage, animations: 'disabled' })
}

const results = []
async function audit(page, name) {
  await page.addScriptTag({ path: axe })
  const result = await page.evaluate(async () => {
    const width = document.documentElement.clientWidth
    const overflow = [document.documentElement, document.body, ...document.querySelectorAll('main, dialog[open], .live-transcript, .desk-nav a')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({ element: element.tagName, scrollWidth: element.scrollWidth }))
    const { violations } = await axe.run()
    return {
      width, overflow,
      violations: violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })),
    }
  })
  results.push({ name, ...result })
}

async function screenshots() {
  const page = await newPage(desktop, 'light')
  for (const [name, route, title] of routes) {
    await open(page, route, title)
    await capture(page, name, true)
    if (name === 'appointments') {
      await page.getByRole('button', { name: 'Calendar', exact: true }).click()
      await capture(page, 'calendar')
      const book = page.getByRole('button', { name: 'Book appointment', exact: true })
      if (await book.isVisible()) {
        await book.click()
        const dialog = page.getByRole('dialog', { name: 'Book an appointment' })
        await dialog.getByLabel('Service').selectOption('Teeth cleaning')
        await dialog.getByLabel('Day').selectOption({ index: 1 })
        await dialog.getByRole('radio').first().waitFor()
        await capture(page, 'booking')
        await dialog.getByRole('button', { name: 'Close booking' }).click()
      }
    }
  }
  await open(page, '/live', 'Live call')
  await page.getByRole('button', { name: 'Run scenario' }).click()
  await page.getByRole('heading', { name: 'Call summary' }).waitFor()
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' }).first()
  if (await dismiss.isVisible()) await dismiss.click()
  await capture(page, 'live-complete', true)
  await page.context().close()

  for (const [width, theme] of [[mobile, 'light'], [desktop, 'dark']]) {
    const preview = await newPage(width, theme)
    for (const [name, route, title] of routes.filter(([name]) => name === 'overview' || name === 'live')) {
      await open(preview, route, title)
      await capture(preview, `${name}-${width === mobile ? 'mobile' : 'dark'}`)
    }
    await preview.context().close()
  }
}

async function auditRoutes() {
  for (const width of [320, 390, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      const page = await newPage(width, theme)
      for (const [name, route, title] of routes) {
        await open(page, route, title)
        await audit(page, `${name}/${width}/${theme}`)
      }
      await open(page, '/appointments', 'Appointments')
      await page.getByRole('button', { name: 'Calendar', exact: true }).click()
      await audit(page, `calendar/${width}/${theme}`)
      await page.getByRole('button', { name: 'Book appointment', exact: true }).click()
      const booking = page.getByRole('dialog', { name: 'Book an appointment' })
      await booking.getByLabel('Service').selectOption('Teeth cleaning')
      await booking.getByLabel('Day').selectOption({ index: 1 })
      await booking.getByRole('radio').first().waitFor()
      await audit(page, `booking/${width}/${theme}`)
      await booking.getByRole('button', { name: 'Close booking' }).click()
      await open(page, '/calls', 'Calls')
      await page.locator('.call-list-row').first().click()
      await page.getByRole('region', { name: 'Call transcript' }).getByRole('heading', { name: 'Transcript' }).waitFor()
      await audit(page, `call-detail/${width}/${theme}`)
      await page.context().close()
    }
  }
}

async function flows() {
  const page = await newPage(mobile, 'light')
  await open(page, '/live', 'Live call')
  // Let the API store the call, then lose the reply. The same end request
  // must recover the saved record without logging another call.
  await page.route('**/simulation/*/end', async (route) => {
    await route.fetch()
    await route.abort()
  }, { times: 1 })
  await page.getByRole('button', { name: 'Talk to the agent' }).click()
  const input = page.getByLabel('Caller message')
  await input.fill('I would like to book a teeth cleaning appointment')
  await input.press('Enter')
  const slots = page.getByRole('group', { name: 'Offered times' })
  await slots.getByRole('button').first().click()
  await input.fill('My name is Browser Patient')
  await input.press('Enter')
  await page.getByRole('log').getByText(/Booked: Teeth cleaning for Browser Patient/).waitFor()
  await audit(page, 'interactive-live/390/light')
  await page.getByRole('button', { name: 'End call' }).click()
  await page.getByRole('button', { name: 'Retry call log' }).click()
  await page.getByRole('heading', { name: 'Call summary' }).waitFor()
  await audit(page, 'completed-live/390/light')
  await page.getByRole('link', { name: 'Open in call log' }).click()
  await page.getByRole('region', { name: 'Call transcript' }).getByText(/Booked: Teeth cleaning for Browser Patient/, { exact: false }).last().waitFor()

  await open(page, '/appointments', 'Appointments')
  await page.getByRole('button', { name: 'Book appointment' }).click()
  const booking = page.getByRole('dialog', { name: 'Book an appointment' })
  await booking.getByLabel('Service').selectOption('Root canal treatment')
  const day = booking.getByLabel('Day')
  await day.selectOption({ index: 1 })
  const first = booking.getByRole('radio').first()
  await first.waitFor()
  await booking.getByRole('button', { name: 'Confirm booking' }).click()
  await booking.getByText('Enter the patient’s name.').waitFor()
  await booking.getByLabel('Patient name').fill('Calendar Patient')
  await booking.getByLabel('Phone number').fill('+12025550102')
  await first.check()
  const slot = `${await day.inputValue()} ${await first.locator('..').innerText()}`.trim()
  const create = process.env.RECEPTION_TEST_API
  if (create) {
    const response = await page.request.post(new URL('/appointments', create).href, {
      data: { patient_name: 'Concurrent Patient', phone: '+12025550103', service: 'Root canal treatment', slot },
    })
    assert.equal(response.ok(), true, await response.text())
    await booking.getByRole('button', { name: 'Confirm booking' }).click()
    await booking.getByRole('alert').filter({ hasText: /overlap|already booked/ }).waitFor()
    assert.equal(await booking.getByLabel('Patient name').inputValue(), 'Calendar Patient')
    await booking.getByRole('radio').first().check()
  }
  await booking.getByRole('button', { name: 'Confirm booking' }).click()
  await page.getByText('Appointment booked', { exact: true }).waitFor()
  const appointment = page.locator('.selected-day li').filter({ hasText: 'Calendar Patient' })
  await appointment.getByRole('button', { name: 'Cancel appointment' }).click()
  await appointment.getByRole('button', { name: 'Yes, cancel' }).click()
  await appointment.getByText('Cancelled', { exact: true }).waitFor()
  await page.context().close()
  console.log('Browser flows passed: interactive booking, end retry, call log, desk booking, slot conflict, cancellation.')
}

try {
  if (process.argv.includes('--screenshots')) await screenshots()
  if (process.argv.includes('--audit')) await auditRoutes()
  if (process.argv.includes('--flows')) await flows()
  if (results.length) {
    const findings = results.filter(({ overflow, violations }) => overflow.length || violations.length)
    await writeFile(path.join(output, 'axe-and-overflow.json'), JSON.stringify(results, null, 2) + '\n')
    console.log(`${results.length} states, ${findings.length} states with a finding`)
    if (findings.length) {
      console.error(JSON.stringify(findings.slice(0, 3), null, 2))
      process.exitCode = 1
    }
  }
} finally {
  await browser.close()
}
