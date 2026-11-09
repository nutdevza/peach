import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, visit, VIEWPORTS } from './harness.ts';

describe('The shared frame of notifications and task cards', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) for (const theme of ['light', 'dark']) {
    it(`${viewport.name} ${theme}: consistent outer frame, stable body layout`, async () => {
      const opened = await visit(browser, '/data-cleanup', viewport, page => page.route('**/api/library-processing',
        route => route.fulfill({ json: { status: 'paused', job_id: 'shell-preview', checked: 38, total: 100,
          stage: 'Scrape missing profiles', current_asset_name: 'Sample video.mp4', speed_mode: 'standard' } })));
      const { page } = opened;
      const artifacts = path.resolve('..', 'build', 'agent-verification', 'processing-controls');
      await mkdir(artifacts, { recursive: true });
      try {
        const task = page.locator('#toasts [data-processing-dock]');
        await task.waitFor();
        await page.evaluate(async theme => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.classList.toggle('dark', theme === 'dark');
          const entry = '/dist/peach-app.js', ui = await import(entry);
          ui.showToast(document.getElementById('toasts'), { success: '', error: '' }, 'shell-receipt',
            { html: 'Configuration saved', alert: false, timeout: Infinity, action: null });
        }, theme);
        const receipt = page.locator('#toasts [data-sonner-toast][data-styled="true"]').filter({ hasText: 'Configuration saved' });
        await receipt.waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('#toasts [data-sonner-toast]')]
          .every(node => node.getAttribute('data-mounted') === 'true' && node.getAnimations().length === 0));
        const measure = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
          '#toasts [data-sonner-toast][data-styled="true"],#toasts [data-processing-dock]')].map(node => {
          const css = getComputedStyle(node), box = node.getBoundingClientRect();
          return { kind: node.hasAttribute('data-processing-dock') ? 'task' : 'receipt',
            visibility: css.visibility, radius: css.borderRadius, shadow: css.boxShadow, border: css.border,
            x: box.x, y: box.y, width: box.width, height: box.height, padding: css.padding };
        }));
        const aligned = await measure();
        assert.equal(aligned.length, 2);
        assert.equal(aligned[0]!.radius, '16px');
        assert.equal(aligned[0]!.radius, aligned[1]!.radius);
        assert.equal(aligned[0]!.shadow, aligned[1]!.shadow);
        assert.equal(aligned[0]!.border, aligned[1]!.border);
        // Appearance and coordinates come from one measurement; dimensions must come from the visible layout box.
        for (const item of aligned) assert.ok(item.visibility === 'visible' && item.width > 0 && item.height > 0, JSON.stringify(item));
        const box = aligned.find(item => item.kind === 'task')!, top = aligned.find(item => item.kind === 'receipt')!.y;
        const clip = { x: Math.max(0, viewport.width - 600), y: Math.max(0, top - 20),
          width: Math.min(viewport.width, 600), height: viewport.height - Math.max(0, top - 20) };
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width);
        await page.screenshot({ path: path.join(artifacts, `${viewport.name}-${theme}-shell-after.png`), clip });
        // Replay the outer frame baseline parameters under the same task and layout.
        await page.evaluate(() => document.querySelectorAll<HTMLElement>('#toasts [data-sonner-toaster]')
          .forEach(node => node.style.removeProperty('--floating-radius')));
        const baseline = await page.addStyleTag({ content:
          '#toasts :is([data-sonner-toast][data-styled=true],[data-processing-dock]){box-shadow:var(--elevation-dropdown)!important}' });
        const original = await measure();
        for (let at = 0; at < aligned.length; at++) {
          assert.equal(aligned[at]!.width, original[at]!.width);
          assert.equal(aligned[at]!.height, original[at]!.height);
          assert.equal(aligned[at]!.padding, original[at]!.padding);
        }
        await page.screenshot({ path: path.join(artifacts, `${viewport.name}-${theme}-shell-before.png`), clip });
        await baseline.evaluate(node => node.remove());
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
