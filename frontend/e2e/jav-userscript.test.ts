import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { launch, requiredEnv, VIEWPORTS } from './harness.ts';

interface Site {
  id: string; label: string; kind: string; domains: string[]; mode: 'automatic' | 'selection';
  detail_pattern?: string; selectors?: string[]; query_keys?: string[];
}
const MANIFEST: { version: number; sites: Site[] } = JSON.parse(readFileSync(
  new URL('../../web/integrations/jav-sites.json', import.meta.url), 'utf8'));
const SCRIPT = readFileSync(new URL('../../web/integrations/peach-jav.user.js', import.meta.url), 'utf8');
const VERSION: string = JSON.parse(readFileSync(
  new URL('../../web/integrations/jav-userscript-release.json', import.meta.url), 'utf8')).version;
const RELEASE_META = 'https://update.sleazyfork.org/scripts/600821/Peach%20%C2%B7%20JAV%20%E5%85%A5%E5%BA%93.meta.js';
const TOKEN = 'test-only-peach-jav-secret-8b4d';
const BASE = 'https://peach.example.invalid';
const ROOT = '#peach-jav-action';
type State = 'idle' | 'queued' | 'searching' | 'submitted' | 'ingested' | 'owned' | 'failed' | 'no_match';
type Body = { ok: boolean; code: string; state: State; message: string };
type Call = { method: string; url: string; headers: Record<string, string>; anonymous: boolean; data?: string };
type MockRequest = Call & { onload(value: unknown): void; ontimeout(): void; onerror(): void; onabort?(): void };
type Mock = {
  calls: Call[];
  reports: MockRequest[];
  updates: Call[];
  pending: MockRequest[];
  values: Record<string, string>;
  menu?: () => void;
  menus: Record<string, () => void>;
  automatic: boolean;
  reply(index: number, body: unknown, status?: number): void;
};
declare global { interface Window { javMock: Mock } }

function body(state: State, code = 'SSIS-057'): Body {
  return { ok: true, code, state, message: state };
}

async function open(browser: Browser, options: {
  url?: string; title?: string; html?: string; configured?: boolean; viewport?: typeof VIEWPORTS[number]; initial?: State; script?: string; resolved?: string;
} = {}) {
  const viewport = options.viewport || VIEWPORTS[0]!;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(error.message));
  // All pages are in-memory fixtures; no source site or Peach service is ever touched.
  await context.route('**/*', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><title>${options.title || 'SSIS-057 video details'}</title></head><body>${options.html ?? '<h1>SSIS-057 video details</h1>'}</body></html>`,
  }));
  await page.addInitScript(({ configured, token, base, initial, resolved, version, releaseMeta }) => {
    const mock: Mock = {
      calls: [], reports: [], updates: [], pending: [], automatic: true, menus: {},
      values: configured ? { 'peach.jav.base': base, 'peach.jav.token': token } : {},
      reply(index, value, status = 200) {
        mock.pending[index]!.onload({ status, responseText: JSON.stringify(value) });
      },
    };
    window.javMock = mock;
    Object.assign(window, {
      GM_getValue: (key: string, fallback: string) => mock.values[key] ?? fallback,
      GM_setValue: (key: string, value: string) => { mock.values[key] = value; },
      GM_info: { script: { version } },
      GM_registerMenuCommand: (label: string, callback: () => void) => { mock.menu = callback; mock.menus[label] = callback; },
      GM_xmlhttpRequest: (request: MockRequest) => {
        if (new URL(request.url).pathname === '/api/jav-browser/people') {
          setTimeout(() => request.onload({ status: 200, responseText: JSON.stringify({
            ok: true, source: 'local-cache', items: Object.fromEntries(
              new URL(request.url).searchParams.get('codes')!.split(',').map(code => [code, []])),
          }) }), 0);
          return { abort: () => request.onabort?.() };
        }
        // The shared-progress task list follows the Peach response that doesn't provide that interface; the script falls back to page-by-page queries, not consuming the video query and submit numbers.
        if (new URL(request.url).pathname === '/api/jav-browser/active') {
          const timer = setTimeout(() => request.onload({ status: 404, responseText: '{}' }), 0);
          return { abort: () => { clearTimeout(timer); request.onabort?.(); } };
        }
        if (request.url.endsWith('/api/jav-browser/errors')) { mock.reports.push(request); return; }
        const call = { method: request.method, url: request.url, headers: request.headers,
          anonymous: request.anonymous, ...(request.data ? { data: request.data } : {}) };
        // The update read uses its own response contract and does not consume the video query and submission numbers.
        if (request.url === releaseMeta || request.url.endsWith('/api/jav-browser/updates')) {
          mock.updates.push(call);
          const timer = setTimeout(() => request.onload({ status: 200, finalUrl: request.url,
            responseText: request.url === releaseMeta
              ? `// ==UserScript==\n// @name Peach Userscript\n// @namespace https://github.com/peach-mitao/peach-userscript\n// @version ${version}\n// ==/UserScript==`
              : JSON.stringify({ runtime: { version: '1.0.0', build_id: 'fixture' }, release: { state: 'current' },
                userscript: { version, minimum_version: '0.5.1', install_url: '/integrations/peach-jav.user.js' } }) }), 0);
          return { abort: () => { clearTimeout(timer); request.onabort?.(); } };
        }
        mock.calls.push(call);
        mock.pending.push(request);
        if (mock.automatic) setTimeout(() => {
          const code = new URL(request.url).searchParams.get('code') || resolved || 'SSIS-057';
          request.onload({ status: 200, responseText: JSON.stringify({ ok: true, code, state: initial, message: initial }) });
        }, 0);
      },
    });
  }, { configured: options.configured !== false, token: TOKEN, base: BASE, initial: options.initial || 'idle', resolved: options.resolved,
    version: VERSION, releaseMeta: RELEASE_META });
  await page.goto(options.url || 'https://missav.ws/en/ssis-057?private=value#player');
  await page.clock.install();
  await page.addScriptTag({ content: options.script ?? SCRIPT });
  return { page, problems, close: async () => {
    try {
      const { updates, values } = await page.evaluate(() => ({ updates: window.javMock.updates, values: window.javMock.values }));
      for (const call of updates) {
        assert.equal(call.method, 'GET');
        assert.equal(call.anonymous, true);
        assert.equal(call.data, undefined);
        if (call.url === RELEASE_META) {
          assert.deepEqual(call.headers, { Accept: 'text/plain' });
        } else {
          assert.equal(call.url, `${values['peach.jav.base']}/api/jav-browser/updates`);
          assert.deepEqual(call.headers, { Accept: 'application/json', Authorization: `Bearer ${values['peach.jav.token']}` });
        }
        assert.equal(call.url.includes(TOKEN), false);
      }
    } finally { await context.close(); }
  } };
}

const button = (page: Page) => page.locator(ROOT).locator('[data-action="add"]');
const settingsDialog = (page: Page) => page.locator('#peach-jav-settings').getByRole('dialog');
async function unpairedStorage(page: Page) {
  const values = await page.evaluate(() => window.javMock.values);
  const {
    'peach.jav.installed-version': installed,
    'peach.jav.update-attempted-at': attempted,
    'peach.jav.updates': updates,
    ...pairing
  } = values;
  assert.equal(installed, VERSION);
  if (attempted !== undefined) assert.match(attempted, /^\d+$/);
  if (updates !== undefined) assert.deepEqual(JSON.parse(updates), { script: { version: VERSION } });
  return pairing;
}
async function fillSettings(page: Page, base: string, token: string) {
  const dialog = settingsDialog(page);
  await dialog.getByLabel('Peach URL', { exact: true }).fill(base);
  await dialog.getByLabel('Dedicated token', { exact: true }).fill(token);
  await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
}
async function ready(page: Page, name = 'Add to the Peach library') {
  await page.waitForFunction(({ root, label }) => {
    const button = document.querySelector(root)?.shadowRoot?.querySelector('[data-action="add"]');
    return button?.textContent === label && button.getAttribute('aria-busy') === 'false';
  }, { root: ROOT, label: name }, { timeout: 15_000 }).catch(async error => {
    const panel = await page.locator(ROOT).evaluate(root => ({ button: root.shadowRoot?.querySelector('[data-action="add"]')?.textContent,
      status: root.shadowRoot?.querySelector('p')?.textContent,
      fields: [...document.querySelectorAll('dt, dd')].map(field => ({ name: field.tagName, text: field.textContent })) })).catch(() => 'Not fetched');
    throw new Error(`${(error as Error).message}\n${JSON.stringify(panel)}`);
  });
}
async function pending(page: Page, count: number) {
  await page.waitForFunction(value => window.javMock.calls.length === value, count);
}
async function reply(page: Page, index: number, value: Body) {
  await page.evaluate(({ index, value }) => window.javMock.reply(index, value), { index, value });
}

async function selectCode(page: Page) {
  await page.locator('#selected-code').evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    window.javMock.menus['On']!();
  });
}

const AUTOMATIC: Record<string, { path: string; title: string; html: string; source?: string; code?: string }> = {
  dmm: { path: '/av/content/?id=ssis00519&private=secret#player', source: '/av/content/?id=ssis00519', code: 'SSIS-519', title: 'Video details', html: '<h1>Video details</h1>' },
  mgs: { path: '/product/product_detail/300MIUM-1239/', code: '300MIUM-1239', title: 'Video details', html: '<h1>Video details</h1>' },
  'fc2-market': { path: '/article/4900901/', code: 'FC2-PPV-4900901', title: 'Video details', html: '<h1>Video details</h1>' },
  missav: { path: '/en/ssis-057', title: 'SSIS-057', html: '<h1>SSIS-057 video</h1>' },
  jable: { path: '/videos/ssis-057/', title: 'Jable', html: '<div class="video-info"><h4>SSIS-057 video</h4></div>' },
  'jav-guru': { path: '/12345/ssis-057-detail/', title: 'JAV.guru', html: '<h1 class="entry-title">[SSIS-057] video</h1>' },
  njav: { path: '/en/v/ssis-057', title: 'NJAV / 123AV', html: '<h1>SSIS-057 video</h1><dl><dt>Code</dt><dd>SSIS-057</dd></dl>' },
  javtiful: { path: '/video/12345/ssis-057', title: 'JAVtiful', html: '<h1>SSIS-057 video</h1>' },
  '7mmtv': { path: '/ja/censored_content/12345/SSIS-057.html', title: '7mmtv', html: '<h1>SSIS-057 video</h1>' },
  javdb: { path: '/v/ABP123', title: 'JavDB', html: '<h2 class="title">Video details</h2><div class="panel-block"><strong>Code:</strong><span class="value">SSIS-057</span></div>' },
  javbus: { path: '/SSIS-057', title: 'JavBus', html: '<h3>Video details</h3><div class="info"><p><span class="header">ID:</span> SSIS-057</p></div>' },
  javlibrary: { path: '/cn/?v=opaque_123&private=secret#player', source: '/cn/?v=opaque_123', title: 'JavLibrary',
    html: '<div id="video_id"><span class="text">SSIS-057</span></div><div id="video_title">Video details</div>' },
  jav321: { path: '/video/opaque123', title: 'Jav321', html: '<h3>Video details</h3><div class="panel-body"><b>Code:</b> SSIS-057<br><b>Recommended:</b> ABW-123</div>' },
  avbase: { path: '/works/test-maker:SSIS-057', title: 'AVBase',
    html: '<h1>Video details</h1><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"work":{"work_id":"SSIS-057","recommendations":[{"work_id":"ABW-123"}]}}}}</script>' },
  javdatabase: { path: '/movies/ssis-057/', title: 'JAVDatabase', html: '<h1>SSIS-057 video</h1>' },
};

describe('JAV userscript', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  it('The script the real install endpoint generates reads the inline manifest on the JavDB page and completes the add', async () => {
    const response = await fetch(requiredEnv('PEACH_E2E_ORIGIN') + '/integrations/peach-jav.user.js');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /javascript/);
    const fixture = AUTOMATIC.javdb!;
    const opened = await open(browser, { url: `https://javdb.com${fixture.path}`, title: fixture.title,
      html: fixture.html, script: await response.text() });
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      const submitted = await page.evaluate(() => JSON.parse(window.javMock.calls[1]!.data!));
      assert.deepEqual(submitted, { code: 'SSIS-057', source_url: 'https://javdb.com/v/ABP123' });
      await reply(page, 1, body('owned'));
      await ready(page, 'This video is already in the library');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const site of MANIFEST.sites.filter(site => site.mode === 'automatic')) {
    for (const domain of site.domains) {
      it(`${site.label} auto-detects an explicit video identity on ${domain}`, async () => {
        const fixture = AUTOMATIC[site.id];
        assert.ok(fixture, `${site.id} requires a video details fixture`);
        const code = fixture.code || 'SSIS-057';
        const opened = await open(browser, { url: `https://${domain}${fixture.path}`,
          title: fixture.title, resolved: code, html: fixture.html + '<aside><h2>Recommended ABW-123</h2><a href="/ABW-123">ABW-123</a></aside>' });
        const { page } = opened;
        try {
          await ready(page);
          const lookup = await page.evaluate(() => window.javMock.calls[0]!);
          if (fixture.code) {
            assert.equal(new URL(lookup.url).pathname, '/api/jav-browser/identify');
            assert.equal(new URL(lookup.url).searchParams.get('source_url'), `https://${domain}${fixture.source || fixture.path}`);
          } else assert.equal(new URL(lookup.url).searchParams.get('code'), code);
          await page.evaluate(() => { window.javMock.automatic = false; });
          await button(page).click();
          await pending(page, 2);
          const submitted = await page.evaluate(() => JSON.parse(window.javMock.calls[1]!.data!));
          assert.deepEqual(submitted, { code, source_url: `https://${domain}${fixture.source || fixture.path}` });
          await reply(page, 1, body('owned', code));
          await ready(page, 'This video is already in the library');
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close(); }
      });
    }
  }

  for (const site of MANIFEST.sites.filter(site => site.mode === 'selection')) {
    for (const domain of site.domains) {
      it(`${site.label} shows the add button on ${domain} only for the actively selected code`, async () => {
        const path = site.id === 'dmm' ? '/av/content/?id=opaque_cid&token=private#player' : '/products/opaque?token=private#player';
        const opened = await open(browser, { url: `https://${domain}${path}`, title: 'SSIS-057 product details',
          html: '<h1>Product ID: ssis00057</h1><span id="selected-code">SSIS-057</span><aside>Recommended: ABW-123</aside>' });
        const { page } = opened;
        try {
          await page.clock.fastForward(1000);
          assert.equal(await page.locator(ROOT).count(), 0);
          assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
          await selectCode(page);
          await ready(page);
          assert.deepEqual(await page.evaluate(() => window.javMock.calls.map(call => call.method)), ['GET']);
          await page.evaluate(() => { window.javMock.automatic = false; });
          await button(page).click();
          await pending(page, 2);
          const submitted = await page.evaluate(() => JSON.parse(window.javMock.calls[1]!.data!));
          assert.deepEqual(submitted, { code: 'SSIS-057', source_url: site.id === 'dmm'
            ? `https://${domain}/av/content/?id=opaque_cid` : `https://${domain}/products/opaque` });
          await reply(page, 1, body('owned'));
          await ready(page, 'This video is already in the library');
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close(); }
      });
    }
  }

  it('The selection menu rejects full titles, multiple codes, codecs, and overlong content', async () => {
    const opened = await open(browser, { url: 'https://duga.jp/products/ssis00057',
      title: 'Product details', html: '<span id="selected-code"></span>' });
    const { page } = opened;
    let alerts = 0;
    page.on('dialog', dialog => { alerts++; void dialog.dismiss(); });
    try {
      await selectCode(page);
      await page.locator('#peach-jav-batch').getByRole('button', { name: 'Back to the Peach home screen', exact: true }).click();
      await page.locator('#peach-jav-batch').waitFor({ state: 'detached' });
      for (const value of ['SSIS-057 video title', 'SSIS-057 ABW-123', 'H264', 'X1234', 'SSIS-057'.repeat(30)]) {
        await page.locator('#selected-code').evaluate((element, value) => { element.textContent = value; }, value);
        await selectCode(page);
      }
      assert.equal(alerts, 0);
      assert.match(await page.locator('#peach-jav-notice').getByRole('status').innerText(), /只选中一个完整/);
      assert.equal(await page.locator(ROOT).count(), 0);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
    } finally { await opened.close(); }
  });

  for (const raw of ['N1234', 'k1234']) {
    it(`Tokyo-Hot selects code ${raw} and accepts the lowercased normalized response`, async () => {
      const opened = await open(browser, { url: 'https://www.tokyo-hot.com/product/opaque/', title: 'Product details',
        html: `<span id="selected-code">${raw}</span>` });
      const { page } = opened;
      try {
        await selectCode(page);
        await ready(page);
        assert.equal(new URL(await page.evaluate(() => window.javMock.calls[0]!.url)).searchParams.get('code'), raw.toLowerCase());
        await page.evaluate(() => { window.javMock.automatic = false; });
        await button(page).click();
        await pending(page, 2);
        assert.equal(JSON.parse(await page.evaluate(() => window.javMock.calls[1]!.data!)).code, raw.toLowerCase());
        await reply(page, 1, body('owned', raw.toLowerCase()));
        await ready(page, 'This video is already in the library');
      } finally { await opened.close(); }
    });
  }

  it('When JavDB title and an explicit code field conflict, nothing queries or submits', async () => {
    const opened = await open(browser, { url: 'https://javdb.com/v/opaque123', title: 'JavDB',
      html: '<h2 class="title">SSIS-057 video</h2><div class="panel-block"><strong>Code:</strong><span class="value">ABW-123</span></div>' });
    try {
      await ready(opened.page, 'Code conflict exists');
      assert.equal(await button(opened.page).isDisabled(), true);
      assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
    } finally { await opened.close(); }
  });

  it('A user-chosen code takes over automatic conflicts, and page switches after submit isolate stale responses', async () => {
    const opened = await open(browser, { url: 'https://javdb.com/v/opaque123', title: 'JavDB',
      html: '<h2 class="title">SSIS-057 video</h2><div class="panel-block"><strong>Code:</strong><span class="value">ABW-123</span></div><span id="selected-code">SSIS-057</span>' });
    const { page } = opened;
    try {
      await ready(page, 'Code conflict exists');
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
      await selectCode(page);
      await ready(page);
      assert.deepEqual(await page.evaluate(() => window.javMock.calls.map(call => call.method)), ['GET']);
      assert.equal(await page.locator(ROOT).locator('header strong').innerText(), 'SSIS-057');
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      assert.equal(JSON.parse(await page.evaluate(() => window.javMock.calls[1]!.data!)).code, 'SSIS-057');
      await page.evaluate(() => {
        history.pushState({}, '', '/v/otherOpaque');
        document.querySelector('h2.title')!.textContent = 'ABW-123 video';
      });
      await pending(page, 3);
      await reply(page, 1, body('owned'));
      await reply(page, 2, body('idle', 'ABW-123'));
      await ready(page);
      assert.equal(await page.locator(ROOT).locator('header strong').innerText(), 'ABW-123');
      assert.equal(await button(page).isDisabled(), false);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const url of [
    'https://javdb.com/search?q=SSIS-057', 'https://javlibrary.com/cn/?q=SSIS-057',
    'https://javlibrary.com/cn/?v=one&v=two', 'https://jav321.com/search/SSIS-057',
    'https://javlibrary.com/cn/?v=opaque.with.dot', 'https://javlibrary.com/cn/?v=opaque~tilde',
    'https://jav.guru/category/SSIS-057/', 'https://njav.tv/en/search/SSIS-057',
    'https://javtiful.com/actress/SSIS-057', 'https://avbase.net/works?q=SSIS-057',
    'https://javdatabase.com/idols/SSIS-057/',
  ]) {
    it(`Details adaptation does not scan the list ${url}`, async () => {
      const opened = await open(browser, { url, html: '<h1>SSIS-057</h1><h2 class="title">SSIS-057</h2>' });
      try {
        await opened.page.clock.fastForward(1000);
        assert.equal(await opened.page.locator(ROOT).count(), 0);
        assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await opened.close(); }
    });
  }

  for (const domain of ['fc2.com', 'contents.fc2.com', 'other.fc2.com', 'javstore.net', 'r18.com', 'sodprime.com', 'javdb.com.evil.invalid']) {
    it(`The domain ${domain} is not in the list and rejects selected additions`, async () => {
      const opened = await open(browser, { url: `https://${domain}/products/SSIS-057`,
        html: '<h1>SSIS-057</h1><span id="selected-code">SSIS-057</span>' });
      try {
        await selectCode(opened.page);
        await opened.page.clock.fastForward(1000);
        assert.equal(await opened.page.locator(ROOT).count(), 0);
        assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await opened.close(); }
    });
  }

  it('Configuration is stored in GM; the submission carries only the code and a source URL without query parameters, and repeated clicks create a single task', async () => {
    const opened = await open(browser, { configured: false });
    const { page } = opened;
    try {
      await ready(page, 'Configure Peach');
      await button(page).click();
      await fillSettings(page, BASE, TOKEN);
      await ready(page);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 1);
      await page.locator(ROOT).getByRole('button', { name: 'Expand the Peach panel', exact: true }).click();
      await ready(page);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 2);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await page.locator(ROOT).evaluate(root => {
        root.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add"]')!.click();
        root.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add"]')!.click();
      });
      await pending(page, 3);
      const calls = await page.evaluate(() => window.javMock.calls);
      assert.equal(calls[0]!.method, 'GET');
      assert.equal(calls[1]!.method, 'GET');
      assert.equal(calls[2]!.method, 'POST');
      assert.deepEqual(JSON.parse(calls[2]!.data!), { code: 'SSIS-057', source_url: 'https://missav.ws/en/ssis-057' });
      for (const call of calls) {
        assert.equal(new URL(call.url).origin, BASE);
        assert.equal(call.anonymous, true);
        assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
        assert.equal('Cookie' in call.headers, false);
        assert.equal(call.url.includes(TOKEN), false);
        assert.equal(call.data?.includes(TOKEN) || false, false);
      }
      const surface = await page.evaluate(() => ({
        html: document.documentElement.outerHTML,
        panel: document.querySelector('#peach-jav-action')!.shadowRoot!.innerHTML,
        storage: JSON.stringify(localStorage), cookies: document.cookie, url: location.href,
      }));
      assert.equal(JSON.stringify(surface).includes(TOKEN), false);
      await reply(page, 2, body('queued'));
      await page.clock.fastForward(2100);
      await pending(page, 4);
      await reply(page, 3, body('searching'));
      await page.clock.fastForward(2100);
      await pending(page, 5);
      await reply(page, 4, body('submitted'));
      await page.clock.fastForward(2100);
      await pending(page, 6);
      await reply(page, 5, body('ingested'));
      await ready(page, 'This video is already in the library');
      assert.equal(await button(page).isDisabled(), true);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const example of [
    { url: 'https://jable.tv/videos/fc2-ppv-1234567/', title: 'FC2 PPV 1234567 video', code: 'FC2-PPV-1234567' },
    { url: 'https://missav.ai/ja/ssni001', title: 'SSNI-001 video', code: 'SSNI-001' },
    { url: 'https://missav.com/cn/abw-123-uncensored', title: 'ABW-123 video', code: 'ABW-123' },
  ]) {
    it(`Recognize details page ${example.code}`, async () => {
      const opened = await open(browser, { url: example.url, title: example.title, html: `<h1>${example.title}</h1>` });
      try {
        await ready(opened.page);
        const calls = await opened.page.evaluate(() => window.javMock.calls);
        assert.equal(new URL(calls[0]!.url).searchParams.get('code'), example.code);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  for (const example of [
    { slug: 'abp-7', title: 'ABP-0007 video', extracted: 'ABP-7', canonical: 'ABP-007' },
    { slug: '300mium-0123', title: '300MIUM-123 video', extracted: '300MIUM-0123', canonical: '300MIUM-123' },
    { slug: '092415_001', title: '092415_001 video', extracted: '092415_001', canonical: '092415_001' },
    { slug: '092415-001', title: '092415-001 video', extracted: '092415-001', canonical: '092415-001' },
  ]) {
    it(`Accepts the server-normalized code ${example.canonical}`, async () => {
      const opened = await open(browser, { url: `https://jable.tv/videos/${example.slug}/`,
        title: example.title, html: `<h1>${example.title}</h1>` });
      const { page } = opened;
      try {
        await ready(page);
        await page.evaluate(() => { window.javMock.automatic = false; });
        await button(page).click();
        await pending(page, 2);
        const submitted = await page.evaluate(() => JSON.parse(window.javMock.calls[1]!.data!));
        assert.equal(submitted.code, example.extracted);
        await reply(page, 1, body('owned', example.canonical));
        await ready(page, 'This video is already in the library');
        assert.equal(await button(page).isDisabled(), true);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  for (const example of [
    { url: 'https://jable.tv/videos/092415_001/', title: '092415-001' },
    { url: 'https://jable.tv/videos/fc2-ppv-0123456/', title: 'FC2-PPV-123456' },
  ]) {
    it(`Keeps code identity boundaries ${example.title}`, async () => {
      const opened = await open(browser, { url: example.url, title: example.title, html: `<h1>${example.title}</h1>` });
      try {
        await ready(opened.page, 'Code conflict exists');
        assert.equal(await button(opened.page).isDisabled(), true);
        assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await opened.close(); }
    });
  }

  for (const invalid of [
    { base: 'http://peach.example.invalid', token: TOKEN },
    { base: `${BASE}/abc`, token: TOKEN },
    { base: `${BASE}/?query=1`, token: TOKEN },
    { base: `${BASE}/#fragment`, token: TOKEN },
    { base: 'https://user:password@peach.example.invalid', token: TOKEN },
    { base: BASE, token: 't'.repeat(257) },
    { base: BASE, token: '' },
  ]) {
    it(`Refusing to save an invalid configuration ${invalid.base} / token length ${invalid.token.length}`, async () => {
      const opened = await open(browser, { configured: false });
      const { page } = opened;
      try {
        await ready(page, 'Configure Peach');
        await button(page).click();
        await fillSettings(page, invalid.base, invalid.token);
        await ready(page, 'Configure Peach');
        assert.deepEqual(await unpairedStorage(page), {});
        assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
        assert.match(await settingsDialog(page).getByRole('alert').innerText(), /请输入/);
      } finally { await opened.close(); }
    });
  }

  for (const base of ['http://localhost:8099', 'http://127.0.0.1:8099', 'http://[::1]:8099']) {
    it(`Accept HTTP loopback configuration ${base}`, async () => {
      const opened = await open(browser, { configured: false });
      const { page } = opened;
      try {
        await ready(page, 'Configure Peach');
        await button(page).click();
        await fillSettings(page, base, TOKEN);
        await ready(page);
        const stored = await page.evaluate(() => window.javMock.values);
        assert.equal(stored['peach.jav.base'], base);
        assert.equal(await page.evaluate(() => window.javMock.calls[0]!.url), `${base}/api/jav-browser?code=SSIS-057`);
      } finally { await opened.close(); }
    });
  }

  for (const url of [
    'https://missav.ws/en', 'https://missav.ws/search/ssis-057',
    'https://jable.tv/categories/ssis-057/', 'https://jable.tv/videos/',
    'https://unrelated.example.invalid/videos/ssis-057/',
  ]) {
    it(`Excluded on list pages and unsupported pages ${new URL(url).pathname}`, async () => {
      const opened = await open(browser, { url, html: '<h1>SSIS-057</h1><article>ABW-123 recommended video</article>' });
      try {
        await opened.page.clock.fastForward(1000);
        assert.equal(await opened.page.locator(ROOT).count(), 0);
        assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await opened.close(); }
    });
  }

  it('Conflicting identity fields disable, and recommendation areas plus query params never join identity', async () => {
    const opened = await open(browser, { title: 'SSIS-057', html: '<h1>SSIS-057</h1><dl><dt>Code:</dt><dd>ABW-123</dd></dl>' });
    try {
      await ready(opened.page, 'Code conflict exists');
      assert.equal(await button(opened.page).isDisabled(), true);
      assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
    } finally { await opened.close(); }
    const detail = await open(browser, { html: '<h1>SSIS-057</h1><article><h2>Recommended ABW-123</h2></article>',
      url: 'https://missav.ws/en/ssis-057?related=ABW-123' });
    try { await ready(detail.page); } finally { await detail.close(); }
  });

  it('A submission timeout offers query only; a failed query can be retried, and after a definite failure you can rejoin manually', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await page.evaluate(() => window.javMock.pending[1]!.ontimeout());
      await ready(page, 'Query Peach status');
      await page.clock.fastForward(30_000);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 2);
      assert.equal(await page.evaluate(() => window.javMock.reports.length), 1);
      await button(page).click();
      await pending(page, 3);
      await page.evaluate(() => window.javMock.pending[2]!.onerror());
      await ready(page, 'Query Peach status');
      await button(page).click();
      await pending(page, 4);
      await reply(page, 3, body('failed'));
      await ready(page, 'Retry adding to the Peach library');
      await button(page).click();
      await pending(page, 5);
      assert.deepEqual(await page.evaluate(() => window.javMock.calls.map(call => call.method)), ['GET', 'POST', 'GET', 'GET', 'POST']);
      await reply(page, 4, body('no_match'));
      await ready(page, 'Retry adding to the Peach library');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('Keep the lookup entry when the status response identity mismatches or the token is invalid', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await reply(page, 1, body('owned', 'ABW-123'));
      await ready(page, 'Query Peach status');
      assert.match(await page.locator(ROOT).getByRole('status', { name: 'Peach task state', exact: true }).innerText(), /状态无效/);
      await button(page).click();
      await pending(page, 3);
      await page.evaluate(() => window.javMock.reply(2, {}, 401));
      await ready(page, 'Query Peach status');
      assert.match(await page.locator(ROOT).getByRole('status', { name: 'Peach task state', exact: true }).innerText(), /令牌无效/);
    } finally { await opened.close(); }
  });

  it('SPA navigation isolates stale responses, the list page removes its button, and repeated runs inject only one copy', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await page.evaluate(() => {
        history.pushState({}, '', '/en/abw-123');
        document.title = 'ABW-123';
        document.querySelector('h1')!.textContent = 'ABW-123';
      });
      await pending(page, 3);
      await reply(page, 1, body('owned'));
      await reply(page, 2, body('idle', 'ABW-123'));
      await ready(page);
      assert.equal(await page.locator(ROOT).locator('header strong').innerText(), 'ABW-123');
      await page.addScriptTag({ content: SCRIPT });
      await page.clock.fastForward(1000);
      assert.equal(await page.locator(ROOT).count(), 1);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 3);
      await button(page).click();
      await pending(page, 4);
      await page.evaluate(() => {
        history.pushState({}, '', '/en/ssis-057');
        history.pushState({}, '', '/en/abw-123');
      });
      await page.clock.fastForward(1000);
      await pending(page, 5);
      await reply(page, 3, body('owned', 'ABW-123'));
      await reply(page, 4, body('idle', 'ABW-123'));
      await ready(page);
      await page.evaluate(() => { history.pushState({}, '', '/search/ABW-123'); });
      await page.clock.fastForward(1000);
      assert.equal(await page.locator(ROOT).count(), 0);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('Background status polling runs at 2 seconds then 15, stops after an hour, creates no POST, and cannot be added when the library already has it', async () => {
    const opened = await open(browser, { initial: 'queued' });
    try {
      await pending(opened.page, 1);
      for (let index = 0; index < 30; index++) {
        await opened.page.waitForFunction(() => document.querySelector('#peach-jav-action')?.shadowRoot?.querySelector('p')?.textContent?.includes('Queued'));
        await opened.page.clock.fastForward(2100);
        await pending(opened.page, index + 2);
      }
      // After the first 30 rounds it slows to once per 15 seconds: no request at the 2-second mark, the next one only when 15 seconds are up.
      await opened.page.clock.fastForward(2100);
      await opened.page.waitForTimeout(300);
      assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 31);
      await opened.page.clock.fastForward(13_000);
      await pending(opened.page, 32);
      // Skips past the one-hour deadline: when the wait that reaches the deadline ends, check once more, then stop and allow manual queries.
      await opened.page.clock.fastForward(60 * 60_000);
      await pending(opened.page, 33);
      await ready(opened.page, 'Query Peach status');
      const calls = await opened.page.evaluate(() => window.javMock.calls);
      assert.ok(calls.every(call => call.method === 'GET'));
      await opened.page.clock.fastForward(60_000);
      assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 33);
    } finally { await opened.close(); }
    const owned = await open(browser, { initial: 'owned' });
    try {
      await ready(owned.page, 'This video is already in the library');
      assert.equal(await button(owned.page).isDisabled(), true);
    } finally { await owned.close(); }
  });

  for (const viewport of VIEWPORTS) {
    it(`${viewport.name} buttons stay focusable and within the viewport`, async () => {
      const opened = await open(browser, { viewport });
      try {
        await ready(opened.page);
        await button(opened.page).focus();
        const state = await button(opened.page).evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: innerWidth,
            focused: element.getRootNode() instanceof ShadowRoot && (element.getRootNode() as ShadowRoot).activeElement === element,
            outline: getComputedStyle(element).outlineStyle };
        });
        assert.equal(state.focused, true);
        assert.notEqual(state.outline, 'none');
        assert.ok(state.left >= 0 && state.right <= state.width);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }
});
