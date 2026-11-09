import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { launch, requiredEnv, settle, visit, VIEWPORTS } from './harness.ts';

/** Vertical placement and size of the search field, magnifier and layout switch in the title row, rounded to pixels; icons are compared together with their stroke widths. */
const headControls = (page: Page, selectors: { search: string; icon: string; layout: string }) =>
  page.evaluate((selectors) => {
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const { y, width, height } = node.getBoundingClientRect();
      return { y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    };
    const icon = document.querySelector(selectors.icon);
    const search = box(selectors.search);
    return {
      search: search && { y: search.y, height: search.height },
      icon: icon && { ...box(selectors.icon)!, stroke: getComputedStyle(icon).strokeWidth },
      layout: box(selectors.layout),
    };
  }, selectors);

describe('Local and online performers share the roster layout', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const path of ['/tags', '/tags?scope=online', '/performers', '/performers?scope=online', '/creators', '/studios', '/agencies', '/series']) {
    it(`Index title and actions share a row, and the search box shrinks with available space (${path})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, path, VIEWPORTS[0]);
      try {
        const page = opened.page;
        await settle(page);
        if (await page.locator('#drawer.open').count()) await page.locator('#filterBtn').click();
        for (const width of [1280, 761, 760, 640, 390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          await settle(page);
          const read = () => page.locator('[data-index-head]').evaluate(head => {
            const title = head.querySelector('h2')!.getBoundingClientRect();
            const search = head.querySelector('[data-index-search]')!.getBoundingClientRect();
            const controls = [...head.querySelectorAll('[data-shortcuts-trigger],[data-tag-mode],[data-index-layout]')];
            return {
              searchWidth: search.width,
              centers: [search, ...controls.map(node => node.getBoundingClientRect())].map(box => (box.top + box.bottom - title.top - title.bottom) / 2),
              contained: controls.every(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth }),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
          for (const managing of path.startsWith('/tags') ? [false, true] : [false]) {
            if (managing) await page.locator('[data-tag-mode]').click();
            await settle(page);
            const shown = await read();
            assert.ok(shown.centers.every(delta => Math.abs(delta) < 1), `The ${width}px action or search box is not on the same row as the title: ${JSON.stringify(shown)}`);
            assert.ok(shown.searchWidth >= 64 && shown.searchWidth <= 320, `The ${width}px search box did not keep a usable input width: ${shown.searchWidth}`);
            assert.equal(shown.contained, true);assert.equal(shown.overflow, false);
            if (managing) await page.locator('[data-tag-mode]').click();
          }
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
  for (const viewport of VIEWPORTS) {
    it(`The subscription mark is visible in both roster layouts (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/performers', viewport);
      try {
        const page = opened.page;
        let following = true;
        await page.route('**/api/index?**', route => route.fulfill({ json: {
          items: [
            { k: 'Followed people', n: 3, entity_id: 901, following, has_image: true },
            { k: 'Disable subscribed people', n: 2, entity_id: 902, following: false },
            { k: 'No subscribed people', n: 1, entity_id: 903 },
          ], has_more: false,
        } }));
        await page.route('**/entity-image?**', route => route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="190"><rect width="180" height="190" fill="#888"/></svg>',
        }));
        await page.reload({ waitUntil: 'load' });
        for (const label of ['Compact · Round avatar', 'Large · Portrait avatar']) {
          await page.getByRole('radio', { name: label, exact: true }).press('Space');
          const marker = page.locator('#index [data-k="Followed people"]').getByRole('img', { name: 'Subscribed new releases', exact: true });
          await marker.waitFor({ timeout: 5_000 });
          await page.waitForFunction(() => {
            const image = document.querySelector<HTMLImageElement>('#index [data-k="Followed people"] img');
            return image?.complete && image.naturalWidth > 0;
          });
          assert.equal(await page.locator('#index [data-index-feed]').count(), 1);
          for (const dark of [false, true]) {
            await page.evaluate(dark => {
              document.documentElement.dataset.theme = dark ? 'dark' : 'light';
              document.documentElement.classList.toggle('dark', dark);
            }, dark);
            const tone = await marker.evaluate(node => {
              const badge = node.firstElementChild!;
              const probe = document.createElement('span');
              probe.style.color = 'var(--feed-mark)'; node.append(probe);
              const orange = getComputedStyle(probe).color; probe.remove();
              return { foreground: getComputedStyle(badge).color, orange, background: getComputedStyle(badge).backgroundColor };
            });
            assert.equal(tone.foreground, tone.orange);
            assert.notEqual(tone.background, 'rgba(0, 0, 0, 0)');
          }
          assert.equal(await marker.evaluate(node => {
            const a = node.getBoundingClientRect(), b = node.closest('[data-index-cell]')!.getBoundingClientRect();
            return a.width >= 16 && a.height >= 16 && a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
          }), true);
          assert.equal(await marker.evaluate(node => {
            const box = node.getBoundingClientRect();
            return [box.top + 3, (box.top + box.bottom) / 2, box.bottom - 3].every(y => {
              const hit = document.elementFromPoint((box.left + box.right) / 2, y);
              return hit === node || (hit !== null && node.contains(hit));
            });
          }), true, 'The RSS mark should display fully above the avatar');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.locator('#index [data-index-grid]').screenshot({
            path: `../build/continuation-rss/rss-${viewport.name}-${label.startsWith('Compact') ? 'compact' : 'big'}.png`,
          });
        }
        following = false;
        await page.reload({ waitUntil: 'load' });
        await page.locator('#index [data-k="Followed people"]').waitFor({ timeout: 15_000 });
        assert.equal(await page.locator('#index [data-index-feed]').count(), 0);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
  for (const viewport of VIEWPORTS) {
    for (const [path, selected] of [['/performers', 'Artists'], ['/creators', 'Sellers'],
      ['/performers?scope=online', 'Online']] as const) {
      it(`The loading placeholder page uses the sibling roster entry (${selected} · ${viewport.name})`, { timeout: 60_000 }, async () => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile,
        });
        const page = await context.newPage();
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve });
        await page.route(url => url.pathname === '/api/index' || url.pathname === '/api/follow/authors', async route => {
          await gate;
          await route.continue();
        });
        try {
          // The main module lays the index skeleton first and defers first-screen data; the title row and roster entry are fully visible while waiting.
          await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + path, { waitUntil: 'commit' });
          await page.locator('#index [data-skeleton]').first().waitFor();
          assert.equal(await page.locator('#index [role="tablist"]').count(), 1);
          assert.deepEqual(await page.locator('#index [role="tab"]').allTextContents(), ['Artists', 'Sellers', 'Online']);
          assert.deepEqual(await page.locator('#index [role="tab"][aria-selected="true"]').allTextContents(), [selected]);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          const waiting = await headControls(page, {
            search: '#index [data-index-search] [data-rac]', icon: '#index [data-index-search] svg', layout: '#index .ihead .iconswitch' });
          release();
          await page.locator('#index [data-index-page]').waitFor();
          assert.deepEqual(await page.locator('#index [role="tab"]').allTextContents(), ['Artists', 'Sellers', 'Online']);
          const ready = await headControls(page, {
            search: '#index [data-index-search] [role="presentation"]', icon: '#index [data-index-search] svg',
            layout: '#index [data-index-layout]' });
          // The title row's search box and layout toggle hand over in place: box height, vertical alignment, icon and toggle width never jump.
          // The horizontal position follows the width of the count text; the skeleton placeholder bar has no real number to measure, so it is not compared.
          assert.deepEqual(waiting, ready, 'The skeleton and post-takeover title row control geometry differ');
        } finally { release(); await context.close() }
      });
    }
    it(`Both layouts use the same card size, and long names stay inside the card (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/performers', viewport);
      try {
        const page = opened.page;
        const names = ['Jul3D', 'LazyProcrastinator', 'Suzutaru 3D (鈴太郎3D)', 'A very long artist name'.repeat(6)];
        await page.route('**/api/index?**', route => route.fulfill({ json: {
          items: names.map(k => ({ k, n: 3 })), has_more: false,
        } }));
        await page.route('**/api/follow/authors?**', route => route.fulfill({ json: {
          items: names.map(k => ({ k, key: k, n: 3, avatar: '', avatar_fallback: '', providers: [] })), has_more: false,
        } }));
        await page.reload({ waitUntil: 'load' });
        const cell = page.locator('#index [data-index-cell]').first();
        await cell.waitFor({ timeout: 15_000 });
        const measure = () => page.locator('#index [data-index-cell]').evaluateAll(elements => elements.map(element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const name = element.querySelector('[data-index-name]')!.getBoundingClientRect();
          return { width: rect.width, padding: style.padding, radius: style.borderRadius,
            whiteSpace: style.whiteSpace, font: style.font, gap: style.gap,
            contained: name.left >= rect.left && name.right <= rect.right,
          };
        }));
        for (const label of ['Compact · Round avatar', 'Large · Portrait avatar']) {
          await page.getByRole('tab', { name: 'Artists', exact: true }).click();
          await page.getByRole('radio', { name: label, exact: true }).press('Space');
          const layout = label.startsWith('Compact') ? 'compact' : 'big';
          await page.locator(`#index [data-index-grid][data-layout="${layout}"]`).waitFor();
          await settle(page);
          const local = await measure();
          await page.getByRole('tab', { name: 'Online', exact: true }).click();
          await page.locator('#index [data-follow-author][data-index-cell]').first().waitFor();
          await settle(page);
          const online = await measure();
          assert.deepEqual(online, local, 'Online and local card layouts differ');
          assert.ok(online.every(item => item.width >= 150 && item.contained && item.whiteSpace === 'normal'));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.equal(await page.locator('#index [role="tablist"]').count(), 1);
          assert.deepEqual(await page.locator('#index [role="tab"]').allTextContents(), ['Artists', 'Sellers', 'Online']);
          await page.getByRole('tab', { name: 'Sellers', exact: true }).click();
          await page.locator('#index [data-index-cell]').first().waitFor();
          await settle(page);
          assert.equal(await page.locator('#index [role="tablist"]').count(), 1);
          assert.equal(await page.locator('#index [aria-label="Identity groups"]').count(), 0);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
  it('Old seller-animation author links land in the artist category in place, keeping a single address, title, and history entry', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/performers', VIEWPORTS[0]);
    try {
      const page = opened.page;
      await page.locator('#index [data-index-page]').waitFor({ timeout: 15_000 });
      const before = await page.evaluate(() => history.length);
      const requests: string[] = [];
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname === '/api/index') requests.push(url.search);
      });
      await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/creators?category=animation', { waitUntil: 'load' });
      await page.waitForURL(url => url.pathname === '/performers', { timeout: 15_000 });
      await page.locator('#index [data-index-page]').waitFor({ timeout: 15_000 });
      await settle(page);
      assert.equal(new URL(page.url()).searchParams.get('category'), 'animation');
      assert.equal(await page.evaluate(() => history.length), before + 1, 'Normalization must never push an extra history entry');
      assert.equal(await page.evaluate(() => document.body.dataset.surface), '/performers');
      assert.match(await page.title(), /^艺人/);
      assert.deepEqual(await page.locator('#index [role="tab"][aria-selected="true"]').allTextContents(), ['Artists']);
      assert.equal(requests.length, 1, `The roster is fetched only once: ${requests.join(' | ')}`);
      assert.match(requests[0], /kind=performers/);
      assert.match(requests[0], /category=animation/);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });
  it('The roster filter\'s mobile soft keyboard labels Enter as "Search"', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/performers', VIEWPORTS[1]);
    let release = () => {};
    try {
      const pending = new Promise<void>(resolve => { release = resolve });
      await opened.page.route('**/api/index?**', async route => { await pending; await route.fallback() });
      await opened.page.reload({ waitUntil: 'commit' });
      const input = opened.page.locator('#index [data-index-search] input');
      await opened.page.locator('#index [data-index-search] input[readonly]').waitFor({ timeout: 15_000 });
      assert.equal(await input.getAttribute('enterkeyhint'), 'search');
      release();
      await opened.page.locator('#index [data-index-search] input:not([readonly])').waitFor({ timeout: 15_000 });
      assert.equal(await input.getAttribute('enterkeyhint'), 'search');
      assert.deepEqual(opened.problems, []);
    } finally { release(); await opened.close() }
  });
});
