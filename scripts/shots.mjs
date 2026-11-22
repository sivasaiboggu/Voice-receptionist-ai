// Real Chrome renders for review: desktop 1280px + phone 390px.
// Run: node scripts/shots.mjs   (backend must be up on :8001, and the
// frontend built with VITE_API_URL=http://localhost:8001)
// Writes docs/visual-proof-0.3.7/*.png. Modelled on the kirana recipe
// for this VM: Hatch Chrome needs a WebGL domain-policy file just to
// start, and it blocks navigation to http://127.0.0.1, so pages load
// over file:// with --allow-file-access-from-files. The production
// build calls the API at localhost:8001, and a file:// page has no
// Origin header so CORS fails — --disable-web-security is a
// TEST-HARNESS flag here only, never a product change.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const OUT = path.join(ROOT, 'docs', 'visual-proof-0.3.7');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = '/opt/meta-chromium/chrome';
const DEBUG_PORT = 9233; // not 9227: the AI SDR agent's Chrome holds that port on this VM
const DIST = `file://${ROOT}/frontend/dist/index.html`;

function chromeArgs(firstUrl) {
  const policy = 'hatch-webgl-allowed-domains-v1\nexample.com\n';
  const file = path.join(os.tmpdir(), 'vr-webgl-policy.txt');
  fs.writeFileSync(file, policy);
  const sha = createHash('sha256').update(policy).digest('hex');
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--disable-web-security', // test harness only: file:// -> localhost:8001 fetch
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'vr-chrome-'))}`,
    `--hatch-webgl-allowed-domains-file=${file}`,
    `--hatch-webgl-allowed-domains-sha256=${sha}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,900',
    firstUrl,
  ];
}

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
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
    console.log('wrote', name);
  }
  async waitFor(fnText, timeoutMs = 20000) {
    const start = Date.now();
    for (;;) {
      if (await this.eval(fnText)) return;
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${fnText}`);
      await delay(250);
    }
  }
}

async function main() {
  const chrome = spawn(CHROME, chromeArgs(DIST));
  try {
    let wsUrl = null;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page');
        if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
      } catch { /* not up yet */ }
      await delay(200);
    }
    if (!wsUrl) throw new Error('Chrome DevTools did not come up');
    const cdp = new Cdp(wsUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');

    const go = async (href, width = 1280) => {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width, height: 900, deviceScaleFactor: 1, mobile: width < 600,
      });
      await cdp.call('Page.navigate', { url: DIST });
      await cdp.waitForEvent('Page.loadEventFired');
      await cdp.waitFor(`!document.querySelector('.skeleton-pulse') && !!document.querySelector('main')`);
      // file:// + BrowserRouter: the initial path is the file path, so
      // no route matches and the app shows "Page not found". Clicking a
      // nav link drives the router's own navigate() (pushState, no
      // reload), which renders the real page.
      await cdp.eval(`[...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '${href}')?.click(); true`);
      await delay(1200);
      await cdp.waitFor(`!document.querySelector('.skeleton-pulse')`);
      await delay(800); // let framer-motion entrances settle
    };
    const setTheme = async (theme) => {
      await cdp.eval(`localStorage.setItem('vr-theme', '${theme}')`);
      await cdp.call('Page.navigate', { url: DIST });
      await cdp.waitForEvent('Page.loadEventFired');
      await cdp.waitFor(`!document.querySelector('.skeleton-pulse') && !!document.querySelector('main')`);
      await cdp.eval(`[...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/')?.click(); true`);
      await delay(1200);
      await cdp.waitFor(`!document.querySelector('.skeleton-pulse')`);
    };

    // Overview, light + dark + mobile.
    await go('/');
    await cdp.waitFor(`document.body.innerText.toLowerCase().includes('calls answered')`);
    await cdp.shot('overview-light.png');
    await setTheme('dark');
    await cdp.waitFor(`document.body.innerText.toLowerCase().includes('calls answered')`);
    await cdp.shot('overview-dark.png');
    await setTheme('light');
    await go('/', 390);
    // Mobile full-page: captureBeyondViewport re-measures Recharts
    // mid-capture and the charts come out compressed (verified: the
    // same page renders correctly in a viewport capture, and the DOM
    // measures a correct 308px chart before the shot). Set the
    // viewport to the full content height first and capture the
    // viewport instead — the fixed bottom nav then sits at the very
    // bottom of the image instead of covering content mid-page.
    const mobileH = await cdp.eval(`document.documentElement.scrollHeight`);
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: mobileH, deviceScaleFactor: 1, mobile: true });
    await delay(1200);
    await cdp.waitFor(`!document.querySelector('.skeleton-pulse')`);
    await cdp.shot('overview-mobile.png', false);

    // Calls, first card expanded to show the transcript. (The filter
    // bar's "Escalated only" label is also .cursor-pointer, so pick the
    // card by its content — clicking the label would toggle the filter.)
    await go('/calls');
    await cdp.waitFor(`document.body.innerText.includes('Showing')`);
    await cdp.eval(`[...document.querySelectorAll('main .cursor-pointer')].find(el => el.textContent.includes('Caller asked'))?.click(); true`);
    await delay(600);
    await cdp.shot('calls-light.png');

    // Appointments: list, then calendar, then the Cancelled filter.
    await go('/appointments');
    await cdp.waitFor(`document.body.innerText.includes('Appointments')`);
    await cdp.shot('appointments-light.png');
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Calendar')?.click()`);
    await delay(600);
    await cdp.shot('appointments-calendar.png');
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'List')?.click()`);
    await delay(400);
    await cdp.eval(`
      (() => {
        const sel = document.querySelector('select[aria-label="Filter by status"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, 'cancelled');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
    await delay(600);
    await cdp.shot('appointments-filter-cancelled.png');

    // Live call: run the scripted Booking scenario, wait for the summary.
    await go('/live');
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Answer & run scenario'))?.click()`);
    try {
      await cdp.waitFor(`document.body.innerText.includes('Call summary')`, 30000);
    } catch (e) {
      console.log('live run did not reach a summary; page text:',
        JSON.stringify(await cdp.eval(`document.body.innerText.slice(0, 600)`)));
      throw e;
    }
    await delay(7000); // let the "Call ended" toast auto-dismiss (6s) so it covers nothing
    await delay(800);
    await cdp.shot('live-call-run.png');
    await cdp.eval(`[...document.querySelectorAll('h2,div')].find(e => e.textContent.trim() === 'Call summary')?.scrollIntoView({ block: 'start' })`);
    await delay(500);
    await cdp.shot('live-call-summary.png', false);

    cdp.ws.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
