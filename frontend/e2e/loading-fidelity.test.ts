import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, requiredEnv, VIEWPORTS } from './harness.ts';

describe('Structure of the page loading state', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name} new release cover fetching shows progress and swaps to the image when done`, { timeout: 60_000 }, async () => {
      const context = await browser.newContext({ viewport });
      try {
        const page = await context.newPage();
        let completed = false;
        await page.route('**/api/entity/shapes', route => route.fulfill({ json: { ok: true, entities: [], home: { feed: true } } }));
        await page.route(/\/api\/feeds\/discoveries\?/, route => route.fulfill({ json: { ok: true, items: [
          { id: 1, code: 'EXM-001', title: 'Example new release', has_cover: completed, cover_state: completed ? null : 'fetching' },
        ] } }));
        await page.route(/\/cover\?code=EXM-001/, route => route.fulfill({ contentType: 'image/svg+xml', body:
          '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#ddd"/></svg>' }));
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/', { waitUntil: 'load' });
        const pending = page.locator('#feedNew [data-feed-cover-state="fetching"]');
        await pending.waitFor();
        assert.equal(await pending.innerText(), 'Fetching');
        const color = await pending.evaluate(node => getComputedStyle(node.closest('.pic')!).backgroundColor);
        assert.notEqual(color, 'rgb(0, 0, 0)', 'Cover stays black while fetching');
        completed = true;
        await page.locator('#feedNew img.cover').waitFor({ timeout: 10_000 });
        assert.equal(await pending.count(), 0);
      } finally { await context.close() }
    });

    it(`${viewport.name} home filter controls show immediately; overlays keep the final material`, { timeout: 60_000 }, async () => {
      const context = await browser.newContext({ viewport });
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve });
      try {
        await context.addInitScript(() => localStorage.setItem('peach.settings.v1', JSON.stringify({ detailAutoplay: false })));
        const page = await context.newPage();
        await page.route(/\/api\/(?:items|facets)\?/, async route => { await held; await route.continue() });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/', { waitUntil: 'load' });
        const frame = page.locator('[data-catalog-frame]');
        await frame.waitFor();
        assert.ok(await frame.locator('[data-entity-layout]').count(), 'Layout key not shown immediately');
        assert.ok(await frame.locator('[data-entity-sort]').count(), 'Sort key not shown immediately');
        const styles = await frame.evaluate(node => ({ filter: getComputedStyle(node).backdropFilter,
          background: getComputedStyle(node).backgroundColor }));
        assert.notEqual(styles.filter, 'none', 'The filter box loses its glass material while waiting');
        assert.notEqual(styles.background, 'rgba(0, 0, 0, 0)');
      } finally { release(); await context.close() }
    });

    for (const jav of [false, true]) it(`${viewport.name} ${jav ? 'JAV' : 'regular'} performer waiting state follows the video context`, { timeout: 60_000 }, async () => {
      const context = await browser.newContext({ viewport });
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve });
      try {
        const page = await context.newPage();
        await page.route('**/performers/90001', async route => {
          const response = await route.fetch({ url: requiredEnv('PEACH_E2E_ORIGIN') + '/' });
          await route.fulfill({ response });
        });
        await page.route('**/api/entity/shapes', route => route.fulfill({ json: { ok: true, entities: [
          { id: 90001, kind: 'performer', names: ['Demo artist'], parts: ['costars', 'facts', ...(jav ? ['jav'] : [])] },
        ] } }));
        await page.route(/\/api\/entity\?/, async route => { await held; await route.fulfill({ json: { error: 'Not fetched' } }) });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/performers/90001', { waitUntil: 'load' });
        const root = page.locator('[data-skeleton="entity/performer"]');
        await root.waitFor();
        assert.ok(await root.locator('[data-entity-foot]').count(), 'The numeric address omits related artists');
        assert.ok(await root.locator('[data-entity-facts]').count(), 'Numeric URL missing the profile table');
        assert.ok(await root.locator('[data-entity-state]').count(), 'Watch states painted as placeholders');
        assert.ok(await root.locator('[data-entity-sort]').count(), 'Sort controls painted as placeholders');
        assert.equal(await root.locator('[aria-label="JAV card layout"]').count() > 0, jav, 'The card layout toggle wrongly uses the performer type');
        const ratio = await root.locator('[style*="--skeleton-card-ratio"]').first().evaluate(node =>
          Number((node as HTMLElement).style.getPropertyValue('--skeleton-card-ratio')));
        assert.equal(ratio, jav ? .75 : 16 / 9, 'The waiting state\'s cover ratio disagrees with the video context');
      } finally { release(); await context.close() }
    });
  }

  /* 形状名单在后台任务频繁写账本时要算好几秒：只有目录页在本机没记过新作结论时才等它，
     其余页面和记过结论的目录页都不该被它挡住开页。 */
  it('形状名单迟迟不回时各页照常开页取数', { timeout: 90_000 }, async () => {
    const pages: [string, string, string | null][] = [
      ['/tasks', '/api/tasks', null], ['/performers', '/api/index', null], ['/', '/api/items', '0'],
    ];
    for (const [path, content, recalled] of pages) {
      const context = await browser.newContext({ viewport: VIEWPORTS[0] });
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve });
      try {
        if (recalled !== null) await context.addInitScript(value => localStorage.setItem('peach.home-feed.v1', value), recalled);
        const page = await context.newPage();
        await page.route('**/api/entity/shapes', async route => { await held; await route.continue() });
        const requested = page.waitForRequest(request => new URL(request.url()).pathname === content, { timeout: 8_000 });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + path, { waitUntil: 'load' });
        await requested.catch(() => assert.fail(`${path} 在形状名单返回前没有开始读取 ${content}`));
      } finally { release(); await context.close() }
    }
  });
});
