/* Fullscreen image fitting does not depend on the details store; verify it directly with the production styles and the browser fullscreen API. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch } from './harness.ts';

for (const stylesheet of ['../src/player/player.css', '../../web/dist/peach-app.css']) {
describe(`Fullscreen frame ratio: ${stylesheet}`, () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    it(`${viewport.width}×${viewport.height}: both fullscreen and exit fullscreen display completely`, { timeout: 30_000 }, async () => {
      const page = await browser.newPage({ viewport });
      try {
        const css = readFileSync(new URL(stylesheet, import.meta.url), 'utf8');
        await page.setContent(`<style>${css}</style><div data-stage-media>
          <div class="video-js"><video-player><media-container>
            <video class="vjs-tech" width="1920" height="1080"></video>
            <button style="position:relative;z-index:1">Fullscreen</button>
          </media-container></video-player></div></div>`);
        await page.locator('button').evaluate(button => {
          button.addEventListener('click', () => button.parentElement!.requestFullscreen());
        });
        const video = page.locator('video');
        assert.equal(await video.evaluate(node => getComputedStyle(node).objectFit), 'contain');
        await page.locator('button').click();
        await page.waitForFunction(() => !!document.fullscreenElement);
        const frame = await video.evaluate(node => {
          const rect = node.getBoundingClientRect();
          return { fit: getComputedStyle(node).objectFit,
            box: [rect.x, rect.y, rect.width, rect.height], viewport: [innerWidth, innerHeight] };
        });
        assert.equal(frame.fit, 'contain', 'With mismatched ratios the full picture and black bars stay');
        assert.deepEqual(frame.box, [0, 0, ...frame.viewport]);
        await page.evaluate(() => document.exitFullscreen());
        for (const state of ['class', 'attribute', 'full-window']) {
          await page.locator('.video-js').evaluate((root, state) => {
            root.classList.toggle('vjs-fullscreen', state === 'class');
            root.toggleAttribute('data-peach-fullscreen', state === 'attribute');
            document.body.classList.toggle('vjs-full-window', state === 'full-window');
          }, state);
          assert.equal(await video.evaluate(node => getComputedStyle(node).objectFit), 'contain', state);
        }
        await page.locator('.video-js').evaluate(root => {
          root.classList.remove('vjs-fullscreen');
          root.removeAttribute('data-peach-fullscreen');
          document.body.classList.remove('vjs-full-window');
        });
        assert.equal(await video.evaluate(node => getComputedStyle(node).objectFit), 'contain');
      } finally { await page.close() }
    });
  }
});
}
