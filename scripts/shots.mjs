// Capture the dashboard from its local preview server. Use a disposable
// demo backend when passing --run-demo, which creates one call and booking.
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = new URL(process.env.RECEPTION_SCREENSHOT_URL || 'http://localhost:4173')
const out = path.resolve(process.env.RECEPTION_SCREENSHOT_DIR || 'work/reception-screenshots')
const chromePath = process.env.CHROME_PATH || 'chromium'
const runDemo = process.argv.includes('--run-demo')

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }
  async call(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const done = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return done;
  }
  async eval(expression) {
    const r = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  }
  async waitForEvent(method, timeoutMs = 30000) {
    const start = Date.now();
    for (;;) {
      const i = this.events.findIndex((e) => e.method === method);
      if (i >= 0) return this.events.splice(i, 1)[0];
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${method}`);
      await delay(100);
    }
  }
  async shot(name, beyondViewport = true) {
    const { data } = await this.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: beyondViewport });
    fs.writeFileSync(path.join(out, name), Buffer.from(data, 'base64'));
    console.log('wrote', name);
  }
  async waitFor(fnText, timeoutMs = 20000) {
    const start = Date.now();
    for (;;) {
      if (await this.eval(`Boolean(${fnText})`)) return;
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${fnText}`);
      await delay(250);
    }
  }
}

async function main() {
  fs.mkdirSync(out, { recursive: true })
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'reception-shots-'))
  const portFile = path.join(profile, 'DevToolsActivePort')
  const args = [
    '--headless', '--disable-dev-shm-usage', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
  ]
  if (process.env.CHROME_NO_SANDBOX === '1') args.push('--no-sandbox')
  const chrome = spawn(chromePath, [...args, 'about:blank'], { stdio: 'ignore' })
  let launchError
  chrome.on('error', (error) => { launchError = error })
  let cdp
  try {
    let page
    for (let attempt = 0; attempt < 60 && !page; attempt++) {
      if (launchError) throw launchError
      if (fs.existsSync(portFile)) {
        const [port] = fs.readFileSync(portFile, 'utf8').split('\n')
        const response = await fetch(`http://127.0.0.1:${port}/json/list`)
        page = (await response.json()).find((target) => target.type === 'page')
      }
      if (!page) await delay(100)
    }
    if (!page) throw new Error('Chromium DevTools did not start')
    cdp = new Cdp(page.webSocketDebuggerUrl)
    await cdp.call('Page.enable')
    await cdp.call('Runtime.enable')
    await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })

    const go = async (route, width = 1280, height = 900) => {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 390 })
      await cdp.call('Page.navigate', { url: new URL(route, url).href })
      await cdp.waitForEvent('Page.loadEventFired')
      await cdp.waitFor("document.querySelector('main h1') && !document.querySelector('.loading-rows')")
      await cdp.eval('document.fonts.ready.then(() => true)')
      if (await cdp.eval("!!document.querySelector('.load-error')")) throw new Error(`Data could not load at ${route}`)
    }

    const click = (text) => cdp.eval(`
      [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === ${JSON.stringify(text)})?.click()
    `)

    await go('/')
    await cdp.shot('overview-light.png')
    await cdp.eval("localStorage.setItem('vr-theme', 'dark')")
    await go('/')
    await cdp.shot('overview-dark.png')
    await cdp.eval("localStorage.setItem('vr-theme', 'light')")
    await go('/', 390, 844)
    await cdp.shot('overview-mobile.png', false)

    await go('/calls')
    await cdp.shot('calls-light.png')
    await go('/appointments')
    await cdp.shot('appointments-light.png')
    await click('Calendar')
    await cdp.waitFor("document.querySelector('button[aria-pressed=true]')?.textContent.trim() === 'Calendar'")
    await cdp.shot('appointments-calendar.png')
    await click('List')
    await cdp.waitFor("document.getElementById('appointment-status')")
    await cdp.eval(`
      const status = document.getElementById('appointment-status')
      status.value = 'cancelled'
      status.dispatchEvent(new Event('change', { bubbles: true }))
    `)
    await cdp.shot('appointments-filter-cancelled.png')
    await go('/settings')
    await cdp.shot('settings-light.png')
    await go('/live')
    await cdp.shot('live-call-light.png')

    if (runDemo) {
      await cdp.waitFor("document.querySelector('.desk-rail-foot')?.textContent.includes('Demo mode')")
      await click('Run scenario')
      await cdp.waitFor("document.querySelector('.result-section')", 30000)
      await cdp.eval("document.querySelector('button[aria-label=\"Dismiss notification\"]')?.click()")
      await cdp.shot('live-call-run.png')
      await cdp.eval("document.querySelector('.result-section').scrollIntoView({ block: 'start' })")
      await cdp.shot('live-call-summary.png', false)
    }
  } finally {
    cdp?.ws.close()
    if (chrome.pid && chrome.exitCode === null) {
      const stopped = new Promise((resolve) => chrome.once('exit', resolve))
      chrome.kill('SIGTERM')
      await stopped
    }
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
