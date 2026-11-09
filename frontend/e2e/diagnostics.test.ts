import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { installDesignBrowser } from './design-fixture.ts';
import { layout, settle, visit, VIEWPORTS } from './harness.ts';
import { verifyColumnContentWidth } from './table-preferences-fixture.ts';

describe('System diagnostics in configuration', () => {
  let browser: Browser;
  installDesignBrowser(next => { browser = next; });
  for (const viewport of VIEWPORTS) {
    it(`Square site badges, status tags, and a legible video table (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/diagnostics', viewport, async page => {
        await page.route('**/api/diagnostics', async route => {
          const report = await (await route.fetch()).json();
          report.checks.media_mounts = { label: 'Media mounts', status: 'warning', reason: 'The media folder does not exist',
            action: 'Check media directories', target: '/settings/library', details: {} };
          report.library.groups.cover = { label: 'Missing cover', status: 'ok', count: 31, truncated: false,
            items: Array.from({ length: 31 }, (_, index) => ({ id: index + 1, code: null,
              title: `Demo entry ${index + 1}`, name: `Demo file ${index + 1}.mp4`,
              path: `R:\\Media\\Demo file ${index + 1}.mp4`, location: 'local', duration: 123, size: 1048576 })) };
          await route.fulfill({ json: report });
        });
      });
      try {
        const { page } = opened;
        const icon = page.locator('[data-diagnostic-source="minnano-av"] img');
        await icon.waitFor();
        assert.equal(await icon.evaluate(node => getComputedStyle(node).borderRadius), '0px');
        const badge = page.locator('[data-diagnostic-check="media_mounts"] [data-diagnostic-status="warning"]');
        await badge.waitFor();
        assert.notEqual(await badge.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
        await page.locator('summary').filter({ hasText: 'Missing covers · 31 items' }).click();
        const table = page.getByRole('grid', { name: 'Missing cover', exact: true });
        await table.waitFor();
        assert.equal(await table.getByRole('row').count(), 21);
        assert.ok((await table.innerText()).includes('Demo file 1.mp4'));
        assert.ok((await table.innerText()).includes('R:\\Media\\Demo file 1.mp4'));
        await verifyColumnContentWidth(table, 'path', '[data-middle-truncate]');
        const pagination = page.getByRole('navigation', { name: 'Missing-cover pagination' });
        await pagination.getByRole('button', { name: 'Next page', exact: true }).click();
        assert.equal(await table.getByRole('row').count(), 12);
        assert.ok((await table.innerText()).includes('Demo entry 21'));
        assert.ok((await layout(page)).scrollWidth <= viewport.width);
        assert.deepEqual(opened.problems, []);
        await page.goto(new URL('/sources', page.url()).href);
        const settingsIcon = page.locator('form[aria-label="MGStage"] img');
        await settingsIcon.waitFor();
        assert.equal(await settingsIcon.evaluate(node => getComputedStyle(node).borderRadius), '0px');
      } finally { await opened.close(); }
    });
    it(`The configuration nav sits below the search bar; section switching keeps the body visible (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/diagnostics', viewport);
      try {
        const { page } = opened;
        await page.locator('article[data-diagnostic-source]').first().waitFor();
        await settle(page);
        await page.evaluate(() => window.scrollTo(0, 650));
        const nav = page.getByRole('tablist', { name: 'Configuration section' });
        const pinned = await nav.evaluate(element => ({ nav: element.getBoundingClientRect().top,
          search: document.querySelector('.top')!.getBoundingClientRect().bottom }));
        assert.ok(pinned.nav >= pinned.search + 7, JSON.stringify(pinned));
        assert.ok(pinned.nav <= pinned.search + 9, JSON.stringify(pinned));
        await nav.getByRole('tab', { name: 'Network & access', exact: true }).click();
        await settle(page);
        const visible = await page.locator('.ui-board-group-active').evaluate(element => ({ panel: element.getBoundingClientRect().top,
          nav: document.querySelector('.ui-board-local-nav')!.getBoundingClientRect().bottom,
          search: document.querySelector('.top')!.getBoundingClientRect().bottom }));
        assert.ok(visible.panel >= (viewport.mobile ? visible.nav : visible.search), JSON.stringify(visible));
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
    it(`Sections and body layout hold while a diagnostics deep link waits (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/library', viewport);
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      try {
        const { page } = opened;
        await page.route('**/api/diagnostics', async route => { await gate; await route.continue(); });
        await page.goto(new URL('/settings/diagnostics', page.url()).href);
        const panel = page.locator('.ui-board-group-active');
        const skeleton = panel.locator('[data-skeleton="diagnostics"]');
        await skeleton.waitFor();
        await page.getByRole('tab', { name: 'System diagnostics', selected: true }).waitFor();
        assert.equal(await panel.locator('section[aria-label="Media library and catalog"]').count(), 0);
        assert.equal(await skeleton.getAttribute('aria-busy'), 'true');
        assert.equal(await panel.locator('article[data-diagnostic-source]').count(), 0);
        const pending = await panel.evaluate(element => {
          const body = element.getBoundingClientRect();
          return { x: body.x, width: body.width, height: body.height };
        });
        assert.ok(pending.width > 0 && pending.height > 0, `Diagnostics section waiting states invisible: ${JSON.stringify(pending)}`);
        release();
        await page.getByRole('tab', { name: 'System diagnostics', selected: true }).waitFor();
        await page.locator('article[data-diagnostic-source]').first().waitFor();
        await settle(page);
        await skeleton.waitFor({ state: 'detached' });
        const ready = await panel.boundingBox();
        assert.ok(Math.abs(ready!.x - pending.x) <= 1, JSON.stringify({ pending, ready }));
        assert.ok(Math.abs(ready!.width - pending.width) <= 1, JSON.stringify({ pending, ready }));
        assert.deepEqual(opened.problems, []);
      } finally { release(); await opened.close(); }
    });
    it(`Entry, error hierarchy, and source cards (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/library', viewport);
      try {
        const { page } = opened;
        await page.route('**/api/diagnostics', async route => {
          const report = await (await route.fetch()).json();
          report.checks.media_mounts = { label: 'Media mounts', status: 'warning', reason: 'Local disk: folder does not exist',
            action: 'Check media folders and mount state', target: '/settings/library', details: {} };
          await route.fulfill({ json: report });
        });
        await page.getByRole('tab', { name: 'System diagnostics', exact: true }).click();
        await page.locator('section[aria-label="Source sessions"]').waitFor();
        await settle(page);
        assert.equal(new URL(page.url()).pathname, '/settings/diagnostics');
        const source = page.locator('article[data-diagnostic-source]').first();
        assert.ok(await page.locator('article[data-diagnostic-source]').count() > 1);
        assert.ok(await source.locator('img').getAttribute('src'));
        const shape = await source.evaluate(element => {
          const next = element.nextElementSibling!;
          return { gap: next.getBoundingClientRect().top - element.getBoundingClientRect().bottom,
            background: getComputedStyle(element.firstElementChild!).backgroundColor };
        });
        assert.ok(shape.gap >= 12);
        assert.notEqual(shape.background, 'rgba(0, 0, 0, 0)');
        const row = page.locator('[data-diagnostic-check="media_mounts"]');
        if (await row.count()) {
          const shown = await row.evaluate(element => {
            const title = element.querySelector('h3')!;
            const reason = element.querySelector('[data-check-reason]')!;
            const button = element.querySelector('a[href]')!;
            const box = element.getBoundingClientRect();
            const action = button.getBoundingClientRect();
            return { titleWeight: getComputedStyle(title).fontWeight, reasonWeight: getComputedStyle(reason).fontWeight,
              titleSize: getComputedStyle(title).fontSize, reasonSize: getComputedStyle(reason).fontSize,
              middle: Math.abs((box.top + box.bottom - action.top - action.bottom) / 2),
              right: box.right - action.right };
          });
          assert.ok(shown.titleWeight !== shown.reasonWeight || shown.titleSize !== shown.reasonSize);
          if (!viewport.mobile) {
            assert.ok(shown.middle <= 2, JSON.stringify(shown));
            assert.ok(shown.right <= 24, JSON.stringify(shown));
          }
        }
        assert.ok((await layout(page)).scrollWidth <= viewport.width);
        await page.locator('summary').filter({ hasText: /其他检查 ·/ }).click();
        const groups = page.locator('[data-diagnostic-group]');
        assert.ok(await groups.count() > 1);
        const grouping = await groups.first().evaluate(element => {
          const heading = element.querySelector('h3')!;
          const card = heading.nextElementSibling!;
          const item = card.querySelector('h4')!;
          return { title: parseFloat(getComputedStyle(heading).fontSize), item: parseFloat(getComputedStyle(item).fontSize),
            background: getComputedStyle(card).backgroundColor, gap: element.nextElementSibling!.getBoundingClientRect().top - element.getBoundingClientRect().bottom };
        });
        assert.ok(grouping.title > grouping.item);
        assert.notEqual(grouping.background, 'rgba(0, 0, 0, 0)');
        assert.ok(grouping.gap >= 20);
        assert.deepEqual(opened.problems, []);
        await page.reload();
        await page.getByRole('tab', { name: 'System diagnostics', selected: true }).waitFor();
        await page.locator('section[aria-label="Source sessions"]').waitFor();
      } finally { await opened.close(); }
    });
  }
});
