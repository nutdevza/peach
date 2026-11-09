/* What this organization covers: catalog selection, long path input, and desktop or mobile layout. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { layout, visit } from './harness.ts';
import { DESKTOP, MOBILE, installDesignBrowser } from './design-fixture.ts';

describe('Organize directory scope', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });

  it('The path sits right of the source on desktop, wraps on phones, and long paths never widen the page', { timeout: 60_000 }, async () => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const opened = await visit(browser, '/data-cleanup/organize', viewport);
      try {
        const page = opened.page;
        await page.route('**/api/organize', (route) => route.fulfill({ json: {
          status: 'idle', locations: [{ location: 'local', roots: ['R:\\media'] }],
          templates: {}, presets: [], placeholders: [], last_batch: '',
        } }));
        await page.route('**/api/pick-folder', (route) => route.fulfill({ json: { path: 'R:\\media\\compilations' } }));
        await page.reload({ waitUntil: 'load' });
        const scope = page.locator('[data-organize-scope]');
        const input = page.getByRole('textbox', { name: 'Organize path', exact: true });
        await input.waitFor();
        await page.getByRole('button', { name: 'Choose the organize path', exact: true }).click();
        await page.waitForFunction(() => document.querySelector<HTMLInputElement>('input[name="organize-path"]')?.value === 'R:\\media\\compilations');
        await input.fill('R:\\media\\' + 'A long folder name'.repeat(40));
        for (const dark of [false, true]) {
          await page.evaluate((isDark) => document.documentElement.classList.toggle('dark', isDark), dark);
          const geometry = await scope.evaluate((element) => {
            const source = element.querySelector('button')!.getBoundingClientRect();
            const input = element.querySelector('input')!;
            const rect = input.getBoundingClientRect();
            return { source: { right: source.right, bottom: source.bottom, top: source.top },
              path: { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width },
              font: Number.parseFloat(getComputedStyle(input).fontSize) };
          });
          assert.ok(geometry.path.width > 100);
          if (viewport.mobile) {
            assert.ok(geometry.path.top >= geometry.source.bottom - 1, JSON.stringify(geometry));
            assert.ok(geometry.font >= 16);
          } else {
            assert.ok(geometry.path.left >= geometry.source.right, JSON.stringify(geometry));
            assert.ok(Math.abs((geometry.path.top + geometry.path.bottom) / 2
              - (geometry.source.top + geometry.source.bottom) / 2) <= 2, JSON.stringify(geometry));
          }
          const measured = await layout(page);
          assert.ok(measured.scrollWidth <= measured.viewportWidth + 1, JSON.stringify(measured));
        }
      } finally { await opened.close(); }
    }
  });
});
