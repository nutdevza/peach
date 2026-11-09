/* Uses the demo library's two-second synthetic video, with entries and write endpoints all caught by stubs. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { DETAIL, openFollowFeed } from './follow-fixture.ts';
import { launch, VIEWPORTS } from './harness.ts';
import { ITEM, openItemPage } from './item-fixture.ts';

const VIDEO = '#stage video.vjs-tech';

async function metadata(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('#stage video');
    return video && video.readyState >= 1 && !video.seeking;
  }, undefined, { timeout: 15_000 });
}

describe('Video resumes on exit', () => {
  let browser: Browser;
  let clip: string;

  before(async () => {
    browser = await launch();
    const origin = process.env.PEACH_E2E_ORIGIN!;
    const result = await (await fetch(new URL('/api/items?medium=video&limit=1', origin))).json();
    clip = new URL(`/stream?id=${result.items[0].id}`, origin).toString();
  });
  after(async () => { await browser.close() });

  for (const viewport of VIEWPORTS) for (const kind of ['item', 'follow'] as const) {
    it(`${viewport.name} ${kind}: closing, reopening and refreshing restore the position, and time deep links win`, { timeout: 90_000 }, async () => {
      const path = kind === 'item' ? `/assets/${ITEM.plain}` : `/posts/${DETAIL.collection}`;
      const opened = kind === 'item' ? await openItemPage(browser, path, viewport)
        : await openFollowFeed(browser, path, viewport, { ready: '#stage [data-follow-detail-side]' });
      try {
        const page = opened.page;
        // Refreshes and navigations in the tests cancel stream requests still being forwarded; that miss does not count as failure, and other errors throw as usual.
        const settled = (error: unknown) => {
          if (!/already handled|disposed|closed/i.test(String(error))) throw error;
        };
        await page.route((url) => ['/stream', '/follow-stream'].includes(url.pathname),
          async (route) => {
            try { await route.fulfill({ response: await route.fetch({ url: clip }) }) } catch (error) { settled(error) }
          });
        await page.route((url) => ['/api/activity', '/api/follow/activity', '/api/follow/play'].includes(url.pathname),
          (route) => route.fulfill({ json: { ok: true } }));
        const key = kind === 'item' ? `item:${ITEM.plain}` : `follow:${DETAIL.collection}:main`;
        await page.evaluate((key) => localStorage.setItem(`peach.playback-position.v1:${key}`, '0'), key);
        await page.reload({ waitUntil: 'load' });
        await metadata(page);
        await page.locator(VIDEO).evaluate((video: HTMLVideoElement) => new Promise<void>((resolve) => {
          video.addEventListener('seeked', () => resolve(), { once: true });
          video.currentTime = .7;
        }));
        await metadata(page);
        const saved = () => page.evaluate((key) => localStorage.getItem(`peach.playback-position.v1:${key}`), key);
        const diagnostic = () => page.evaluate(() => ({ storage: Object.entries(localStorage),
          time: document.querySelector<HTMLVideoElement>('#stage video')?.currentTime,
          ready: document.querySelector<HTMLVideoElement>('#stage video')?.readyState }));
        assert.ok(Math.abs(Number(await saved()) - .7) < .1, `Not saved after locating: ${JSON.stringify(await diagnostic())}`);
        await page.locator('#closeStage').click();
        await page.locator('#stage[open]').waitFor({ state: 'detached' });
        assert.ok(Math.abs(Number(await saved()) - .7) < .1, `Position wrong after closing: ${await saved()}`);
        await page.goto(new URL(path, page.url()).toString(), { waitUntil: 'load' });
        await metadata(page);
        const current = () => page.locator(VIDEO).evaluate((video: HTMLVideoElement) => video.currentTime);
        assert.ok(Math.abs(await current() - .7) < .1, `On re-entry the position is ${await current()} sec and the stored value is ${await saved()}`);
        await page.reload({ waitUntil: 'load' });
        await metadata(page);
        assert.ok(Math.abs(await current() - .7) < .1, 'Refresh did not restore the seconds');
        await page.goto(new URL(`${path}?t=1`, page.url()).toString(), { waitUntil: 'load' });
        await metadata(page);
        assert.ok(await current() >= .9, 'A time deep link never overwrites the saved position');
        assert.deepEqual(opened.problems.filter((line) => !line.includes('VIDEOJS')), []);
      } finally {
        if (await opened.page.locator('#stage[open]').count()) await opened.page.locator('#closeStage').click();
        await opened.close();
      }
    });
  }
});
