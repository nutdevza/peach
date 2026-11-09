import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { it } from 'node:test';
import type { Browser } from 'playwright-core';
import { installDesignBrowser } from './design-fixture.ts';
import { requiredEnv, visit, VIEWPORTS } from './harness.ts';

let browser: Browser;
installDesignBrowser((value) => { browser = value });

const cases = [
  { name: 'short', html: 'Configuration saved', label: '' },
  { name: 'action', html: 'Checked 105 sources: 2933 updates', label: 'View' },
  { name: 'long', html: 'Checked 105 sources: 2933 items updated; 281 skipped, no resources; 20 oversized compilations excluded; 862 historical items skipped as out of first-pass scope; 241 rechecked; 11 sources had no updates', label: 'View' },
  { name: 'undo', html: 'Moved 12 items to trash', label: 'Undo' },
  { name: 'error', html: 'Check failed: the source cannot be reached right now; please retry later.', label: '' },
];

for (const viewport of [...VIEWPORTS, { name: 'narrow', width: 320, height: 844, mobile: true }]) {
  it(`${viewport.name} short receipts, long content, and action buttons all stay in the viewport`, { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/follow', viewport);
    try {
      await opened.page.locator('#toasts').waitFor({ state: 'attached' });
      await mkdir(resolve('../build/toast-preview'), { recursive: true });
      for (const scenario of cases) {
        await opened.page.evaluate(async (scenario) => {
          const entry = '/dist/peach-app.js';
          const ui = await import(entry);
          ui.showToast(document.getElementById('toasts'), {
            success: '<svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 6"/></svg>',
            error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/></svg>',
          }, 'layout-preview', { html: scenario.html, alert: scenario.name === 'error', timeout: Infinity,
            action: scenario.label ? { label: scenario.label, run: () => {} } : null });
        }, scenario);
        const toast = opened.page.locator('[data-sonner-toast]').filter({ hasText: scenario.html });
        await toast.waitFor();
        await opened.page.waitForFunction((text) => [...document.querySelectorAll('[data-sonner-toast]')]
          .some((node) => node.textContent?.includes(text) && node.getAttribute('data-mounted') === 'true'
            && node.getAnimations().length === 0), scenario.html);
        const box = await toast.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const title = node.querySelector('[data-title]')!.getBoundingClientRect();
          const icon = node.querySelector('[data-icon]')!.getBoundingClientRect();
          const button = node.querySelector('[data-button]')?.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width,
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
            titleLeft: title.left, iconRight: icon.right,
            titleRight: title.right, titleBottom: title.bottom,
            buttonLeft: button?.left, buttonTop: button?.top };
        });
        assert.ok(box.left >= 0 && box.right <= viewport.width, JSON.stringify(box));
        assert.ok(box.scrollWidth <= box.clientWidth, JSON.stringify(box));
        assert.ok(box.titleLeft >= box.iconRight, JSON.stringify(box));
        if (scenario.name === 'long' && !viewport.mobile) {
          assert.ok(box.width > 400 && box.width <= 560, JSON.stringify(box));
        }
        if (scenario.label) {
          assert.ok(box.buttonLeft! >= box.titleRight || box.buttonTop! >= box.titleBottom, JSON.stringify(box));
          const inline = scenario.name === 'undo' || (scenario.name === 'action' && viewport.width >= 390);
          if (inline) assert.ok(box.buttonLeft! >= box.titleRight && box.buttonTop! < box.titleBottom, JSON.stringify(box));
          else assert.ok(box.buttonTop! >= box.titleBottom, JSON.stringify(box));
        }
        const rect = (await toast.boundingBox())!;
        await opened.page.screenshot({ path: resolve(`../build/toast-preview/${viewport.name}-${scenario.name}.png`),
          clip: { x: rect.x - 14, y: rect.y - 14, width: rect.width + 28, height: rect.height + 28 } });
      }
    } finally {
      await opened.close();
    }
  });
}

for (const viewport of VIEWPORTS) {
  it(`${viewport.name}'s failure receipt has its own red border and sits above the bottom-right mini window without covering it`, { timeout: 60_000 }, async () => {
    // The mini window is hung in the stage: it only exists once a detail has been entered.
    const opened = await visit(browser, `/assets/${requiredEnv('PEACH_E2E_ITEM')}`, viewport);
    try {
      const mini = opened.page.locator('#miniplayer');
      await mini.waitFor({ state: 'attached' });
      await mini.evaluate((node) => { (node as HTMLElement).hidden = false });
      await opened.page.evaluate(async () => {
        const entry = '/dist/peach-app.js';
        const ui = await import(entry);
        ui.showToast(document.getElementById('toasts'), { success: '<svg/>', error: '<svg/>' },
          'stack-preview', { html: 'Check failed: the source cannot be reached right now; please retry later.', alert: true, timeout: Infinity, action: null });
      });
      const toast = opened.page.locator('[data-sonner-toast][data-type=error]');
      await toast.waitFor();
      await opened.page.waitForFunction(() => [...document.querySelectorAll('[data-sonner-toast]')]
        .every((node) => node.getAttribute('data-mounted') === 'true' && node.getAnimations().length === 0));
      const [toastBox, miniBox] = [(await toast.boundingBox())!, (await mini.boundingBox())!];
      assert.ok(toastBox.y + toastBox.height <= miniBox.y, JSON.stringify({ toastBox, miniBox }));
      const colors = await toast.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-border-error-default)';
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { border: getComputedStyle(node).borderTopColor, expected };
      });
      assert.equal(colors.border, colors.expected);
    } finally {
      await opened.close();
    }
  });
}
