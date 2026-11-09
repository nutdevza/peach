import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import type { Browser, Page, Route } from 'playwright-core';
import { configurationBody, expectBody, launch, layout, requiredEnv, settle, visit, VIEWPORTS, type Visit } from './harness.ts';

function forwardingState() {
  const active = new Map<Route, { url: string; phase: string }>();
  const errors: string[] = [];
  return { active, errors, snapshot: () => ({ active: [...active.values()], errors }) };
}

async function forwardHttp(page: Page, origin: string, service: string, signal: AbortSignal,
  state = forwardingState()): Promise<void> {
  await page.route(`${origin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pending = { url: url.pathname + url.search, phase: 'fetch' };
    state.active.set(route, pending);
    try {
      const response = await route.fetch({ url: service + url.pathname + url.search, maxRedirects: 0, signal,
        headers: { ...request.headers(), host: new URL(service).host, origin: service } });
      pending.phase = 'fulfill';
      await route.fulfill({ response });
    } catch (error) {
      state.errors.push(`${pending.phase} ${pending.url}: ${String(error)}`);
      if (signal.aborted && error instanceof Error && error.name === 'AbortError' && error.cause === signal.reason) {
        pending.phase = 'abort';
        await route.abort().catch(error => {
          if (!/already handled|disposed|closed/i.test(String(error))) throw error;
        });
        return;
      }
      if (!/already handled|disposed|closed/i.test(String(error))) throw error;
    } finally {
      state.active.delete(route);
    }
  });
}

async function closeHttp(opened: Pick<Visit, 'page' | 'close'>, forwards: AbortController,
  phase: (value: string) => void = () => {}): Promise<void> {
  try {
    phase('Leaving the player page');
    await opened.page.goto('about:blank');
  } finally {
    // 独立转发先取消，再由上下文释放浏览器路由；关闭前等待 Route 会与失效目标形成互等。
    phase('Cancel request forwarding');
    forwards.abort();
    phase('Close the browser context');
    await opened.close();
  }
}

describe('Plain HTTP configuration and playback', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });

  it('Leaving the page cancels unfinished forwarded responses and completes route cleanup', { timeout: 60_000 }, async t => {
    let phase = 'Prepare controlled response';
    t.after(() => { if (t.signal.aborted) t.diagnostic(`HTTP cancel regression timed out at phase: ${phase}`); });
    let notify!: () => void;
    const started = new Promise<void>(resolve => { notify = resolve; });
    let disconnected!: () => void;
    const cancelled = new Promise<void>(resolve => { disconnected = resolve; });
    const server = createServer((request, response) => {
      if (request.url === '/') { response.end('<html><body>HTTP</body></html>'); return; }
      if (request.url !== '/pending') { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.write('pending');
      response.on('close', disconnected);
      notify();
    });
    phase = 'Start the controlled HTTP service';
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    phase = 'Create browser context';
    const context = await browser.newContext();
    t.after(async () => {
      await context.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    });
    phase = 'Create a blank page';
    const page = await context.newPage();
    const origin = 'http://peach-forward.test';
    const forwards = new AbortController();
    phase = 'Mount the request forwarding';
    await forwardHttp(page, origin, `http://127.0.0.1:${address.port}`, forwards.signal);
    phase = 'Open the controlled page';
    await page.goto(origin);
    phase = 'Start an unfinished response';
    await page.evaluate(() => { void fetch('/pending').catch(() => {}); });
    phase = 'Waiting for forwarding to start';
    await started;
    await t.test('Canceling within ten seconds after forwarding starts completes cleanup', { timeout: 10_000 }, async cancellation => {
      cancellation.after(() => {
        if (cancellation.signal.aborted) cancellation.diagnostic(`HTTP cancel regression timed out at phase: ${phase}`);
      });
      await closeHttp({ page, close: () => context.close() }, forwards, value => { phase = value; });
      phase = 'Waiting for the server to drop';
      await cancelled;
    });
  });

  it('The route can still close the owner while waiting for a dependency context to be released', { timeout: 2_000 }, async () => {
    let closed = false;
    let release!: () => void;
    const untilClosed = new Promise<void>(resolve => { release = resolve; });
    const page = { goto: async () => {}, unrouteAll: async () => untilClosed } as unknown as Page;
    const forwards = new AbortController();
    await closeHttp({ page, close: async () => { closed = true; release(); } }, forwards);
    assert.equal(closed, true);
    assert.equal(forwards.signal.aborted, true);
  });

  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: opens configuration from an insecure origin, edits indexers, and mounts the player`, { timeout: 60_000 }, async t => {
      let phase = 'Prepare demo server';
      const forwarding = forwardingState();
      t.after(() => {
        if (t.signal.aborted) t.diagnostic(`HTTP configuration case timed out at stage ${phase}; forwarding state: ${JSON.stringify(forwarding.snapshot())}`);
      });
      const service = requiredEnv('PEACH_E2E_ORIGIN');
      const origin = 'http://peach-http.test';
      const forwards = new AbortController();
      const opened = await visit(browser, '/', viewport, async page => {
        // Only the temporary demo service is mapped to a plain HTTP origin; the browser decides Web Crypto availability on its own.
        // 跳转与关页会取消浏览器请求；独立转发请求由 closeHttp 在释放上下文前取消。
        await forwardHttp(page, origin, service, forwards.signal, forwarding);
      });
      const { page, problems } = opened;
      try {
        const response = await page.request.get(`${service}/api/configuration`);
        assert.equal(response.status(), 200);
        const configuration = await response.json();
        // The route interceptor handles only the first redirected request; the alias contract is read server-side and the page uses the real entry.
        const alias = await page.request.get(`${service}/configuration`, { maxRedirects: 0 });
        assert.equal(alias.status(), 307);
        assert.equal(alias.headers().location, '/settings/library');
        await page.route(`${origin}/api/configuration`, route => route.fulfill({ json: { ...configuration, editable: true } }));
        const writes: { indexers: { key: string; name: string; url: string }[] }[] = [];
        await page.route(`${origin}/api/configuration/indexers`, route => {
          if (route.request().method() === 'GET') return route.fulfill({ json: { indexers: [], max_indexers: 4 } });
          const sent = route.request().postDataJSON();
          writes.push(sent);
          return route.fulfill({ json: { ...sent, max_indexers: 4 } });
        });
        page.on('response', response => {
          if (response.url().startsWith(origin) && response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
        });
        for (const path of ['/settings/library', '/settings/subscriptions']) {
          phase = `Open ${path}`;
          await page.goto(origin + path, { waitUntil: 'load' });
          assert.deepEqual(await page.evaluate(() => ({
            secure: isSecureContext, uuid: typeof crypto.randomUUID, random: typeof crypto.getRandomValues,
          })), { secure: false, uuid: 'undefined', random: 'function' });
          phase = `Waiting for ${path}'s configuration body`;
          await expectBody(page, path, configurationBody(page));
          await page.getByRole('tab', { name: 'Sources and subscriptions', exact: true }).click();
          const section = page.getByRole('form', { name: 'Resource search', exact: true });
          phase = `Edit the ${path} indexer`;
          await section.getByRole('button', { name: 'Add indexer', exact: true }).click();
          await section.getByRole('button', { name: 'Add indexer', exact: true }).click();
          await section.getByRole('textbox', { name: /名称/ }).nth(1).fill('HTTP test');
          await section.getByRole('textbox', { name: /Torznab 地址/ }).nth(1).fill('https://indexer.example/api');
          await section.getByRole('button', { name: 'Remove indexer 1', exact: true }).click();
          phase = `Save the ${path} indexer`;
          const saved = page.waitForResponse(response => response.url() === `${origin}/api/configuration/indexers`
            && response.request().method() === 'POST');
          await section.getByRole('button', { name: 'Save configuration', exact: true }).click();
          assert.equal((await saved).status(), 200);
          assert.equal(writes.at(-1)!.indexers.length, 1);
          assert.equal(writes.at(-1)!.indexers[0]!.name, 'HTTP test');
          phase = `Waiting for ${path} to save before layout`;
          await settle(page, '.ui-configpage');
          const bounds = await layout(page);
          assert.ok(bounds.scrollWidth <= bounds.viewportWidth);
          assert.deepEqual(bounds.offenders, []);
        }
        phase = 'Open the player';
        await page.goto(`${origin}/assets/${requiredEnv('PEACH_E2E_ITEM')}`, { waitUntil: 'load' });
        phase = 'Waiting for the player to mount';
        await page.locator('#stage .video-js video.vjs-tech').waitFor();
        assert.deepEqual(problems, []);
      } finally {
        await closeHttp(opened, forwards, value => { phase = value; });
      }
    });
  }
});
