import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, requiredEnv } from './harness.ts';
import { mockJavDetail } from './jav-detail-fixture.ts';

describe('Details rendering for the expanded JAV comments', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of [{ name: 'Desktop', width: 1730, height: 1032, scale: 2 },
    { name: 'Phone', width: 390, height: 844, scale: 1 }]) {
    it(`${viewport.name} comments area waits independently under normal animation`, { timeout: 60000 }, async () => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.scale, reducedMotion: 'no-preference' });
      let release = () => {};
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await mockJavDetail(page);
        let requests = 0;
        const response = new Promise<void>(resolve => { release = resolve });
        await page.route(/\/api\/jav\/reviews\?/, async route => {
          requests++;
          await response;
          await route.fulfill({ json: { ok: true, page: 1, more: false,
            items: Array.from({ length: 10 }, (_, index) => ({ id: String(index), username: 'Example commenter',
              content: 'Comments body and resource sources under normal animation.'.repeat(40), score: 4, created_at: '2026-10-13' })) } });
        });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001');
        const title = page.locator('[data-jav-info] h1');
        await title.waitFor();
        await page.waitForFunction(() => !document.querySelector('#stage[data-stage-reveal]'));
        await page.locator('#stage').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
        const original = await title.elementHandle();
        const side = page.locator('[data-jav-info]');
        assert.equal(requests, 0, 'Comments fetch on expand');
        await page.locator('[data-jav-reviews] summary').click();
        await page.locator('[data-jav-reviews] [data-skeleton="reviews"]').waitFor();
        assert.equal(await side.locator('[data-skeleton]').count(), 1, 'Loading state belongs to the comments section only');
        const shimmer = await page.locator('[data-skeleton="reviews"] .skeleton-sheen').evaluateAll(nodes => nodes.map(node => {
          const host = getComputedStyle(node), sweep = getComputedStyle(node, '::after');
          return { position: host.position, overflow: host.overflow, sweep: sweep.position,
            height: node.getBoundingClientRect().height, sweepHeight: parseFloat(sweep.height), radius: parseFloat(host.borderRadius) };
        }));
        assert.equal(shimmer.length, 15);
        for (const bar of shimmer) {
          assert.equal(bar.position, 'relative', 'The shimmer\'s position belongs to the comments placeholder strip');
          assert.equal(bar.overflow, 'hidden', 'Shimmer clipped inside the placeholder bar');
          assert.equal(bar.sweep, 'absolute');
          assert.ok(bar.radius > 0 && Math.abs(bar.height - bar.sweepHeight) < 1, JSON.stringify(bar));
        }
        assert.equal(await page.locator('[data-jav-review-skeleton]').count(), 3);
        assert.ok((await page.locator('[data-skeleton="reviews"]').boundingBox())!.height >= 240);
        assert.ok(await original!.evaluate(node => node.isConnected), 'The title DOM is kept while waiting');
        assert.ok(await page.locator('[data-jav-actions]').isVisible(), 'Action area retained while loading');
        await page.waitForFunction(() => {
          const placeholder = document.querySelector('[data-skeleton="reviews"]')!;
          const body = placeholder.closest('.ui-fcollapse')!;
          return body.getBoundingClientRect().height >= placeholder.getBoundingClientRect().height;
        });
        await page.screenshot({ path: `../build/comments-${viewport.name}-loading.png` });
        release();
        await page.locator('[data-jav-review]').first().waitFor();
        await page.locator('[data-jav-reviews] [data-skeleton]').waitFor({ state: 'hidden' });
        assert.ok(await original!.evaluate(node => node.isConnected), 'Title DOM retained');
        await page.screenshot({ path: `../build/comments-${viewport.name}-expanded.png` });
        await page.locator('[data-jav-reviews] summary').click();
        await page.locator('[data-jav-reviews] details:not([open])').waitFor();
        await page.locator('[data-jav-reviews] summary').click();
        await page.locator('[data-jav-review]').first().waitFor();
        assert.equal(await side.locator('[data-skeleton="reviews"]').count(), 0, 'Cached comments show immediately');
        assert.equal(requests, 1, 'Expanding from cache keeps already-fetched comments');
        assert.ok(await original!.evaluate(node => node.isConnected), 'Title kept across repeated open and close');
        assert.deepEqual(errors, []);
      } finally { release(); await context.close() }
    });
  }
});
