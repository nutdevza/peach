import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, VIEWPORTS } from './harness.ts';
import { openItemPage } from './item-fixture.ts';
import { openFollowFeed } from './follow-fixture.ts';

describe('Page scroll positioning', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    for (const reduced of [false, true]) {
      it(`${viewport.name}: on the first visit to the follows page the short skeleton does not clamp the scroll-to-top, reduced motion=${reduced}`, { timeout: 60_000 }, async () => {
        const opened = await openFollowFeed(browser, '/', viewport, { ready: '#catalogFilter [data-filter-frame]' });
        const { page } = opened;
        let release!: () => void;
        const waiting = new Promise<void>(resolve => { release = resolve });
        try {
          await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
          await page.route(url => url.pathname === '/api/follow', async route => {
            await waiting;
            await route.fallback();
          });
          const { previousHeight, animates, floor } = await page.evaluate(async () => {
            // The length lives only inside the leaving list; when navigation clears the list, it is removed too.
            const tail = document.createElement('div');
            tail.style.height = '3000px';
            document.getElementById('grid')!.append(tail);
            // On Windows with system animations off (e.g., managed runners), Chrome jumps programmatically-triggered smooth scrolling straight to the end; first probe whether there are intermediate frames.
            window.scrollTo({ top: 0, behavior: 'instant' });
            window.scrollTo({ top: 1000, behavior: 'smooth' });
            let animates = false;
            for (let frame = 0; frame < 5 && !animates; frame++) {
              await new Promise(resolve => requestAnimationFrame(resolve));
              animates = scrollY > 0 && scrollY < 1000;
            }
            window.scrollTo({ top: 500, behavior: 'instant' });
            const frames: { y: number; height: number }[] = [];
            const tracking = { frames, running: true };
            Object.assign(window, { coldFollowScroll: tracking });
            const record = () => {
              frames.push({ y: scrollY, height: document.documentElement.scrollHeight });
              if (tracking.running) requestAnimationFrame(record);
            };
            requestAnimationFrame(record);
            return { previousHeight: document.documentElement.style.minHeight, animates, floor: 500 + innerHeight - 1 };
          });
          if (viewport.mobile) await page.locator('header button[aria-label="Expand the sidebar"]').click();
          await page.locator('#drawer [data-nav="follow"]').click();
          await page.waitForURL('**/follow');
          await page.waitForFunction(() => scrollY === 0);
          const frames = await page.evaluate(() => {
            const tracking = (window as unknown as {
              coldFollowScroll: { frames: { y: number; height: number }[]; running: boolean } }).coldFollowScroll;
            tracking.running = false;
            return tracking.frames;
          });
          const trace = frames.map(({ y, height }) => `${y}/${height}`).join(',');
          assert.ok(frames.every(({ height }) => height >= floor),
            `Before the scroll-to-top finishes, the page height must not drop below the reading position left behind, or the short skeleton clamps it to the top; per-frame position/height: ${trace}`);
          if (!reduced && animates) assert.ok(frames.some(({ y }) => y > 2 && y < 490),
            `The first toggle must pass through the middle position; per-frame position/height: ${trace}`);
          release();
          await page.locator('[data-follow-list] > [data-follow-item]').first().waitFor();
          await page.waitForFunction(height => document.documentElement.style.minHeight === height
            && !document.documentElement.hasAttribute('data-page-navigation-pending'), previousHeight);
          assert.equal(await page.evaluate(() => scrollY), 0);
          assert.deepEqual(opened.problems, []);
        } finally { release(); await opened.close() }
      });
      it(`${viewport.name}: positions once content is ready, reduced motion=${reduced}`, { timeout: 60_000 }, async () => {
        const opened = await openItemPage(browser, '/', viewport, { ready: '#grid [data-media-card]' });
        const { page } = opened;
        let release!: () => void;
        const waiting = new Promise<void>(resolve => { release = resolve });
        try {
          await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
          await page.route('**/api/library-processing', async route => {
            await waiting;
            await route.fulfill({ json: { status: 'idle' } });
          });
          await page.route('**/api/sources', route => route.fulfill({ json: { sources: [{
            location: 'local', online: true, roots: ['D:\\Media'], label: 'Local',
          }] } }));
          await page.route('**/api/resource-sync/scan', route => route.fulfill({ json: { status: 'idle' } }));
          await page.route('**/api/resource-sync/apply', route => route.fulfill({ json: { status: 'idle' } }));
          await page.reload({ waitUntil: 'load' });
          await page.locator('#grid [data-media-card]').first().waitFor();
          await page.evaluate(() => {
            const scroll = Element.prototype.scrollIntoView;
            const calls: { id: string; behavior: string | undefined }[] = [];
            Object.assign(window, { anchorScrolls: calls });
            Element.prototype.scrollIntoView = function(options) {
              calls.push({ id: this.id, behavior: typeof options === 'object' ? options.behavior : undefined });
              return scroll.call(this, options);
            };
            const link = document.createElement('a');
            link.href = '/data-cleanup#libraryProcessing'; link.textContent = 'Open scan and capture';
            document.querySelector('#main')!.prepend(link);
          });
          const navigations: string[] = [];
          page.on('request', request => { if (request.isNavigationRequest()) navigations.push(request.url()) });
          await page.getByRole('link', { name: 'Open scan and capture', exact: true }).click();
          await page.waitForURL('**/data-cleanup#libraryProcessing');
          assert.deepEqual(navigations, [], 'Cross-page anchors reuse in-site navigation');
          await page.waitForTimeout(150);
          assert.ok(await page.locator('#libraryProcessing [data-skeleton-action]').count() > 0, 'Keeps the scan skeleton until the dependent content is ready');
          assert.equal(await page.evaluate(() => (window as unknown as {
            anchorScrolls: { id: string }[];
          }).anchorScrolls.some(call => call.id === 'libraryProcessing')), false, 'Never positions against the skeleton before content is ready');
          release();
          await page.locator('#libraryProcessing [data-skeleton-action]').first().waitFor({ state: 'detached' });
          await page.locator('#libraryProcessing section[aria-label="Scan and collect"]').waitFor();
          await page.waitForFunction(expected => {
            const calls = (window as unknown as { anchorScrolls: { id: string; behavior: string }[] }).anchorScrolls;
            return calls.some(call => call.id === 'libraryProcessing' && call.behavior === expected);
          }, reduced ? 'instant' : 'smooth');
          await page.waitForFunction(() => {
            const target = document.getElementById('libraryProcessing')!;
            const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
            const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            const desired = Math.min(target.getBoundingClientRect().top + scrollY - margin - padding,
              document.documentElement.scrollHeight - innerHeight);
            return Math.abs(scrollY - desired) < 2;
          });
          const before = await page.locator('#libraryProcessing').evaluate(node => node.getBoundingClientRect().top);
          await page.waitForTimeout(200);
          assert.ok(Math.abs(await page.locator('#libraryProcessing').evaluate(node => node.getBoundingClientRect().top) - before) < 2);
          await page.evaluate(() => {
            Object.assign(window, { cleanupNode: document.getElementById('libraryProcessing') });
            const link = document.createElement('a');
            link.href = '#cleanup-maintenance'; link.textContent = 'Locating maintenance tools';
            document.getElementById('libraryProcessing')!.prepend(link);
          });
          await page.getByRole('link', { name: 'Locating maintenance tools', exact: true }).click();
          await page.waitForFunction(expected => {
            const state = window as unknown as { anchorScrolls: { id: string; behavior: string }[]; cleanupNode: Element };
            return state.anchorScrolls.some(call => call.id === 'cleanup-maintenance' && call.behavior === expected)
              && state.cleanupNode === document.getElementById('libraryProcessing');
          }, reduced ? 'instant' : 'smooth');
          await page.evaluate(() => {
            const link = document.createElement('a');
            link.href = '/data-cleanup?scope=local#resource-sync'; link.textContent = 'Opens the old resource-sync address';
            document.getElementById('libraryProcessing')!.prepend(link);
          });
          await page.getByRole('link', { name: 'Opens the old resource-sync address', exact: true }).click();
          await page.waitForURL('**/data-cleanup/resource-sync?scope=local');
          await page.locator('#resource-sync').waitFor();
          assert.equal(await page.evaluate(() => Array.isArray((window as unknown as { anchorScrolls: unknown }).anchorScrolls)), true);
          assert.deepEqual(navigations, []);
          await page.goto(new URL('/data-cleanup?scope=local#resource-sync', page.url()).href, { waitUntil: 'load' });
          await page.waitForURL('**/data-cleanup/resource-sync?scope=local');
          await page.locator('#resource-sync').waitFor();
          assert.equal(navigations.length, 1, 'A cold start from an old anchor loads the document exactly once');
          assert.deepEqual(opened.problems, []);
        } finally { release(); await opened.close() }
      });
      it(`${viewport.name}: section positions travel smoothly both ways, double-clicking navigation returns to the top, reduced motion=${reduced}`, { timeout: 60_000 }, async () => {
        const opened = await openItemPage(browser, '/', viewport, { ready: '#grid [data-media-card]' });
        const { page } = opened;
        try {
          await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
          await page.evaluate(() => {
            document.getElementById('main')!.style.minHeight = '6000px';
            const scroll = window.scrollTo.bind(window);
            const calls: ScrollToOptions[] = [];
            Object.assign(window, { pageScrolls: calls });
            window.scrollTo = (options: ScrollToOptions | number, y?: number) => {
              if (typeof options === 'number') scroll(options, y ?? 0);
              else { calls.push(options); scroll(options) }
            };
          });
          const move = async (name: string, path: string, top: number, double = false) => {
            await page.evaluate(() => { (window as unknown as { pageScrolls: ScrollToOptions[] }).pageScrolls.length = 0 });
            if (viewport.mobile) await page.locator('header button[aria-label="Expand the sidebar"]').click();
            const nav = page.locator('#drawer [data-nav]').getByText(name, { exact: true });
            if (double) await nav.dblclick(); else await nav.click();
            await page.waitForURL(url => url.pathname + url.search === path);
            await page.waitForFunction(({ behavior, top }) => {
              const calls = (window as unknown as { pageScrolls: ScrollToOptions[] }).pageScrolls;
              return calls.some(call => call.top === top && call.behavior === behavior) && scrollY === top;
            }, { top, behavior: reduced ? 'instant' : 'smooth' });
          };
          await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
          await move('JAV', '/?jav=1', 0);
          await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }));
          await move('Home', '/', 700);
          await move('Home', '/', 0, true);
          await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
          await move('JAV', '/?jav=1', 1000);
          await move('Home', '/', 700);
          await move('Artists', '/performers', 0);
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close() }
      });
    }
  }
});
