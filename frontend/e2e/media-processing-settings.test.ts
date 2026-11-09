import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

/** This machine's media processing preferences: values the page writes stay in this copy, and a reload reads back exactly it. */
function mediaProcessing() {
  const state = { disabled: false, timeline: 'coarse', previewAcceleration: 'auto', playbackAcceleration: 'auto' };
  const writes: unknown[] = [];
  const route = async (page: Page) => {
    await page.route('**/api/media-processing', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        writes.push(body);
        if ('metadata_only' in body) {
          state.disabled = body.metadata_only;
          if (state.disabled) state.timeline = 'off';
        }
        if ('preview_acceleration' in body) state.previewAcceleration = body.preview_acceleration;
        if ('playback_acceleration' in body) state.playbackAcceleration = body.playback_acceleration;
      }
      await route.fulfill({ json: { metadata_only: state.disabled,
        preview_acceleration: state.previewAcceleration, playback_acceleration: state.playbackAcceleration } });
    });
    await page.route('**/api/thumbnail-jobs', route => route.fulfill({ json: { mode: state.timeline, status: 'idle' } }));
  };
  return { state, writes, route };
}

describe('Video preview settings', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: the master switch persists and controls the timeline setting, and after re-enabling the timeline follows the user choice`, async () => {
      const { state, writes, route } = mediaProcessing();
      const opened = await visit(browser, '/settings/library', viewport, route);
      const { page } = opened;
      try {
        const toggle = page.getByRole('switch', { name: 'Generate video previews', exact: true });
        const interval = page.locator('#videoThumbnailSetting button');
        await toggle.waitFor();
        await settle(page);
        assert.equal(await toggle.isChecked(), true);
        assert.equal(await interval.isDisabled(), false);
        await page.locator('label').filter({ has: toggle }).click();
        await page.getByText('Video preview generation disabled', { exact: true }).waitFor();
        assert.equal(await toggle.isChecked(), false);
        assert.equal(await interval.isDisabled(), true);
        await page.reload();
        await toggle.waitFor();
        await settle(page);
        assert.equal(await toggle.isChecked(), false);
        assert.equal(await interval.isDisabled(), true);
        assert.match(await interval.innerText(), /关闭/);
        await toggle.focus();
        await page.keyboard.press('Space');
        await page.getByText('Video preview generation enabled', { exact: true }).waitFor();
        assert.equal(await interval.isDisabled(), false);
        assert.match(await interval.innerText(), /关闭/);
        assert.deepEqual(writes, [{ metadata_only: true }, { metadata_only: false }]);
        const preview = page.locator('#previewAccelerationSetting button');
        await preview.click();
        await page.getByRole('option', { name: 'Software decode', exact: true }).click();
        await page.getByText('Frame extraction decoder saved', { exact: true }).waitFor();
        assert.equal(state.previewAcceleration, 'software');
        assert.equal(state.playbackAcceleration, 'auto');
        assert.deepEqual(writes.slice(-1), [{ preview_acceleration: 'software' }]);
        // Playback transcoding lives in "Apps and maintenance → Video playback"; this tab holds only the frame extraction decoder option.
        assert.equal(await page.locator('.ui-board-group-active #playbackAccelerationSetting').count(), 0);
        await page.reload();
        await preview.waitFor();
        await settle(page);
        assert.match(await preview.innerText(), /软件解码/);
        const measured = await layout(page);
        assert.ok(measured.scrollWidth <= measured.viewportWidth, JSON.stringify(measured));
        assert.deepEqual(measured.offenders, []);
        const artifacts = path.resolve('..', 'build', 'agent-verification', 'media-processing');
        await mkdir(artifacts, { recursive: true });
        await page.screenshot({ path: path.join(artifacts, `${viewport.name}.png`), fullPage: true });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });

    it(`${viewport.name}: changing the transcode method under "App and maintenance -> Video playback" writes only that item and reads back on reload`, async () => {
      const { state, writes, route } = mediaProcessing();
      const opened = await visit(browser, '/settings/maintenance', viewport, route);
      const { page } = opened;
      try {
        const section = page.getByRole('region', { name: 'Video playback', exact: true });
        const trigger = section.locator('#playbackAccelerationSetting button');
        await trigger.waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.querySelector('#playbackAccelerationSetting button')?.hasAttribute('disabled') === false);
        await settle(page);
        assert.match(await trigger.innerText(), /自动/);
        /* This card sits below the first screen. Scroll into place first and wait two frames for the scroll events to finish dispatching: if the page containing the trigger box
           scrolls after the select opens, React Aria closes it. */
        await trigger.scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await trigger.click();
        await page.getByRole('option', { name: 'Software codecs', exact: true }).click();
        await page.getByText('Transcode method saved', { exact: true }).waitFor();
        assert.equal(state.playbackAcceleration, 'software');
        assert.equal(state.previewAcceleration, 'auto');
        assert.deepEqual(writes, [{ playback_acceleration: 'software' }]);
        // "Video playback" sorts after "launch at startup" and before "storage" (environments without those two cards only compare relative order).
        const order = await page.locator('.ui-board-group-active').evaluate((group) =>
          [...group.querySelectorAll('section[aria-label], form[aria-label]')].map((node) => node.getAttribute('aria-label')));
        const at = order.indexOf('Video playback');
        assert.ok(at >= 0 && order.slice(0, at).every((name) => ['Check for updates', 'Auto repair', 'Auto-update', 'Start at sign-in'].includes(name ?? '')), JSON.stringify(order));
        await page.reload();
        await trigger.waitFor({ state: 'visible' });
        await page.waitForFunction(() => /软件编解码/.test(document.querySelector('#playbackAccelerationSetting button')?.textContent || ''));
        const measured = await layout(page);
        assert.ok(measured.scrollWidth <= measured.viewportWidth, JSON.stringify(measured));
        assert.deepEqual(measured.offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
