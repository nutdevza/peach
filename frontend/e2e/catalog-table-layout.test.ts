import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, layout, VIEWPORTS, visit } from './harness.ts';

async function showTable(page: Page) {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: 98000 + index, name: `Sample video ${index + 1}.mp4`,
    medium: 'video', location: 'local', duration: 60, size: 1000000, width: 1920, height: 1080, rating: 80 }));
  await page.route('**/api/items?*', route => route.fulfill({ json: { items, total: items.length } }));
  await page.getByRole('radiogroup', { name: 'Library display mode' }).locator('label')
    .filter({ has: page.getByRole('radio', { name: 'Lists', exact: true }) }).click();
  await page.locator('[data-catalog-row][data-id="98000"]').waitFor();
}

describe('Library table wide layout and selection actions', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  it('Inline rating save, cancel, retry, and undo all keep normal browsing state', { timeout: 60000 }, async () => {
    const opened = await visit(browser, '/', VIEWPORTS[0]!);
    const { page } = opened;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve });
    try {
      await showTable(page);
      const writes: number[] = [];
      let failed = false;
      await page.route('**/api/feedback', async route => {
        const body = route.request().postDataJSON();
        assert.equal(body.id, 98000); assert.equal(body.kind, 'rate');
        writes.push(body.value);
        if (writes.length === 1) await pending;
        if (body.value === 40 && !failed) {
          failed = true;
          return route.fulfill({ status: 500, json: { error: 'Sample rating failed' } });
        }
        return route.fulfill({ json: { rating: body.value || null } });
      });
      const row = page.locator('[data-catalog-row]').first();
      const five = row.getByRole('button', { name: 'Rate 5 stars', exact: true });
      await five.dblclick();
      await page.waitForFunction(() => document.querySelector('[data-catalog-rating] button[aria-busy="true"]'));
      assert.deepEqual(writes, [100]);
      release();
      await row.getByRole('group', { name: 'Rating 5 / 5', exact: true }).waitFor();
      await row.getByRole('button', { name: 'Clear rating (currently 5 stars)', exact: true }).click();
      await row.getByRole('group', { name: 'Unrated', exact: true }).waitFor();
      await row.getByRole('button', { name: 'Rate 2 stars', exact: true }).click();
      await row.getByText('Sample rating failed', { exact: true }).waitFor();
      await row.getByRole('button', { name: 'Retry rating now', exact: true }).click();
      await row.getByRole('group', { name: 'Rating 2 / 5', exact: true }).waitFor();
      await page.locator('[data-sonner-toast]').filter({ hasText: 'Rated 2 stars' }).getByRole('button', { name: 'Undo', exact: true }).click();
      await row.getByRole('group', { name: 'Unrated', exact: true }).waitFor();
      assert.deepEqual(writes, [100, 0, 40, 40, 0]);
      assert.equal(await page.locator('#selectMode').getAttribute('aria-pressed'), 'false');
      assert.equal(new URL(page.url()).pathname, '/');
      assert.deepEqual(opened.problems.filter(line => !line.includes('VIDEOJS') && !line.includes('/api/feedback') && !line.includes('500 (Internal Server Error)')), []);
    } finally { release(); await opened.close() }
  });
  for (const folders of [false, true]) it(`Wide-screen ${folders ? 'folder' : 'regular'} list fills the outer frame with equal-height controls`, { timeout: 60000 }, async () => {
    const opened = await visit(browser, folders ? '/?browse=folders' : '/', { name: 'wide', width: 2560, height: 1440, mobile: false });
    const { page } = opened;
    try {
      await showTable(page);
      const geometry = await page.locator('[data-catalog-table]').evaluate(node => {
        const scroll = node.querySelector<HTMLElement>('.overflow-x-auto')!;
        const table = node.querySelector('table')!.getBoundingClientRect();
        const row = node.querySelector('[data-catalog-row]')!.getBoundingClientRect();
        const header = node.querySelector('thead')!.getBoundingClientRect();
        const heights = [...node.querySelectorAll('[role="toolbar"] button')].map(button => button.getBoundingClientRect().height);
        const others = [...node.querySelectorAll('thead th:not([data-key="name"])')]
          .reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0);
        return { available: scroll.clientWidth, table: table.width, row: row.width, header: header.width,
          name: node.querySelector('th[data-key="name"]')!.getBoundingClientRect().width, others, heights };
      });
      assert.ok(Math.abs(geometry.table - geometry.available) <= 1, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.row - geometry.available) <= 1, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.header - geometry.available) <= 1, JSON.stringify(geometry));
      assert.ok(geometry.name > 400, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.name + geometry.others - geometry.available) <= 2, JSON.stringify(geometry));
      assert.ok(Math.max(...geometry.heights) - Math.min(...geometry.heights) <= 1, JSON.stringify(geometry));
      const stars = await page.locator('[data-catalog-row]').first().locator('[data-catalog-rating]').evaluate(node => {
        const icon = node.querySelector('svg')!;
        const marker = document.createElement('span'); marker.style.color = 'var(--rating)'; node.append(marker);
        const expected = getComputedStyle(marker).color; marker.remove();
        return { width: icon.getBoundingClientRect().width, color: getComputedStyle(icon).color, expected };
      });
      assert.equal(stars.width, 19);
      assert.equal(stars.color, stars.expected);
      const screenshots = join('..', 'build', 'agent-verification', 'library-table-layout');
      mkdirSync(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, folders ? 'wide-folders.png' : 'wide.png') });
      assert.deepEqual(opened.problems.filter(line => !line.includes('VIDEOJS')), []);
    } finally { await opened.close() }
  });
  for (const viewport of VIEWPORTS) it(`${viewport.name}: normal browsing, dragging, and manual multi-select never interfere`, { timeout: 60000 }, async () => {
    const opened = await visit(browser, '/', viewport);
    const { page } = opened;
    try {
      await showTable(page);
      const scope = page.locator('[data-catalog-table]');
      const row = scope.locator('[data-catalog-row]').first();
      assert.equal(await scope.getByRole('checkbox').count(), 0);
      const duration = row.locator('td').filter({ hasText: /^1:00$/ });
      await duration.scrollIntoViewIfNeeded();
      await duration.click();
      assert.equal(await page.locator('#selectMode').getAttribute('aria-pressed'), 'false');
      const scroll = scope.locator('.overflow-x-auto');
      const range = await scroll.evaluate(node => node.scrollWidth - node.clientWidth);
      await scroll.evaluate(node => { node.scrollLeft = 0 });
      const box = await scroll.boundingBox(); assert.ok(box);
      const startX = box.x + box.width - 40;
      const y = (await row.boundingBox())!.y + (await row.boundingBox())!.height - 8;
      await page.mouse.move(startX, y); await page.mouse.down();
      await page.mouse.move(startX - 100, y, { steps: 10 }); await page.mouse.up();
      assert.ok(await scroll.evaluate(node => node.scrollLeft) >= Math.min(100, range) - 2);
      assert.equal(await page.locator('#selectMode').getAttribute('aria-pressed'), 'false');
      assert.equal(await scope.locator('[data-board-selected]').count(), 0);
      // Releasing outside the table produces no click inside the container, so later checks must still respond to the first click.
      await scroll.evaluate(node => { node.scrollLeft = 0 });
      await page.mouse.move(startX, y); await page.mouse.down();
      await page.mouse.move(box.x - 20, y, { steps: 10 }); await page.mouse.up();
      await page.locator('#selectMode').click();
      await row.locator('label').waitFor();
      await row.locator('label').click();
      await page.locator('[data-batch-group="clear"]').click();
      await page.waitForFunction(() => !document.body.classList.contains('select-mode'));
      assert.equal(await scope.getByRole('checkbox').count(), 0);
      assert.equal(await scope.locator('[data-board-selected]').count(), 0);
      const measured = await layout(page);
      assert.ok(measured.scrollWidth <= measured.viewportWidth + 1, JSON.stringify(measured));
      assert.deepEqual(opened.problems.filter(line => !line.includes('VIDEOJS')), []);
    } finally { await opened.close() }
  });
});
