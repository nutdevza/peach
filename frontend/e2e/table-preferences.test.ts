import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import type { Browser, Locator, Page } from 'playwright-core';
import { followSource, openFollowManage } from './design-fixture.ts';
import { launch, layout, VIEWPORTS } from './harness.ts';
import { verifyTablePreferences } from './table-preferences-fixture.ts';

async function visibleSelectAll(table: Locator) {
  const label = table.locator('thead label');
  const box = (await label.boundingBox())!;
  assert.ok(box.width >= 16 && box.height >= 16, JSON.stringify(box));
  await label.click();
  await table.locator('tbody input:checked:not([role="switch"])').first().waitFor({ state: 'attached' });
  assert.ok(await table.locator('tbody input:checked:not([role="switch"])').count() > 0);
  await label.click();
  await table.locator('tbody input:checked:not([role="switch"])').first().waitFor({ state: 'detached', timeout: 5000 });
  assert.equal(await table.locator('tbody input:checked:not([role="switch"])').count(), 0);
}

async function noPageOverflow(page: Page) {
  const measured = await layout(page);
  assert.ok(measured.scrollWidth <= measured.viewportWidth + 1, JSON.stringify(measured));
}

describe('All data tables share one column settings', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); mkdirSync('../build/agent-verification/all-tables', { recursive: true }) });
  after(async () => { await browser.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: follow sources support select all, column adjust, and drag; the right side of the name is left for row selection`, { timeout: 60000 }, async () => {
      const opened = await openFollowManage(browser, viewport);
      const { page } = opened;
      try {
        await page.getByRole('button', { name: 'Table view', exact: true }).click();
        const table = page.getByRole('grid', { name: 'Follow sources', exact: true });
        await visibleSelectAll(table);
        await verifyTablePreferences(page, table, 'Follow sources', 'source', { id: 'provider', label: 'Site' },
          () => page.getByRole('button', { name: 'Table view', exact: true }).click());
        const row = table.locator('tbody tr').first(), cell = row.locator('td').nth(2), link = cell.locator('a');
        await link.scrollIntoViewIfNeeded();
        const hit = await cell.evaluate(node => {
          const cell = node.getBoundingClientRect(), anchor = node.querySelector('a')!.getBoundingClientRect();
          return { cell: cell.width, link: anchor.width, gap: cell.right - anchor.right };
        });
        assert.ok(hit.gap > 40 && hit.link < hit.cell - 40, JSON.stringify(hit));
        await cell.click({ position: { x: Math.min(hit.cell - 8, hit.link + 28), y: 6 } });
        assert.equal(await row.getByRole('checkbox').isChecked(), true);
        await noPageOverflow(page);
        await page.screenshot({ path: `../build/agent-verification/all-tables/follow-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}: JAV subscriptions share column settings, visible select all, and site icons`, { timeout: 60000 }, async () => {
      const opened = await openFollowManage(browser, viewport);
      const { page } = opened;
      try {
        await page.route('**/api/feeds', route => route.fulfill({ json: { unread: 0, sources: [{
          id: 1, kind: 'javdb-actor', kind_label: 'JAV subscriptions', name: 'Example subscription', url: 'https://javdb.com/actors/example',
          entity_id: null, enabled: true, interval_minutes: 360, last_fetched_at: null, last_new_count: 0,
        }] } }));
        await page.reload({ waitUntil: 'load' });
        await page.getByRole('tab', { name: 'Follows list', exact: true }).waitFor();
        const table = page.getByRole('grid', { name: 'JAV follow sources', exact: true });
        await visibleSelectAll(table);
        assert.equal(await table.locator('tbody img[src="/site-mark?source=javdb"]').count(), 1);
        await verifyTablePreferences(page, table, 'JAV follow sources', 'name', { id: 'interval', label: 'Frequency' });
        await noPageOverflow(page);
        await page.screenshot({ path: `../build/agent-verification/all-tables/feeds-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}: the two alias tables have independent column settings; blank selection and the rename button do not conflict`, { timeout: 60000 }, async () => {
      const opened = await openFollowManage(browser, viewport);
      const { page } = opened;
      try {
        const name = 'Suzutaru 3D (鈴太郎3D)'; let renamed = false;
        await page.route('**/api/follow?summary=1', route => route.fulfill({ json: {
          sources: [followSource(1, name, 'Kemono', name)], counts: {}, suggestions: [],
          author_aliases: [{ canonical_key: renamed ? '鈴太郎3d' : 'suzutaru3d(鈴太郎3d)', canonical_name: renamed ? '鈴太郎3D' : name,
            aliases: [{ key: 'platform', name: renamed ? name : '鈴太郎3D' }] }],
          alias_suggestions: [{ canonical: 'Author B', alias: 'Platform alias B', evidence: 'Source confirmation' }],
        } }));
        await page.goto(new URL('/subscriptions?tab=add', page.url()).href, { waitUntil: 'load' });
        const pending = page.getByRole('grid', { name: 'Creator aliases pending merge', exact: true });
        const saved = page.getByRole('grid', { name: 'Saved creator aliases', exact: true });
        await verifyTablePreferences(page, pending, 'Creator aliases pending merge', 'canonical', { id: 'evidence', label: 'Basis' });
        await verifyTablePreferences(page, saved, 'Saved creator aliases', 'canonical', { id: 'aliases', label: 'Platform alias' });
        const identity = saved.locator('tbody td').nth(1);
        const inset = await identity.evaluate(node => node.querySelector('span')!.getBoundingClientRect().left - node.getBoundingClientRect().left);
        assert.ok(inset <= 16, `Avatar left gap ${inset}`);
        await identity.click({ position: { x: 260, y: 4 } });
        assert.equal(await saved.locator('tbody input').isChecked(), true);
        await identity.click({ position: { x: 260, y: 4 } });
        await saved.getByRole('button', { name: `Edit ${name}'s canonical name`, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Edit the unified name', exact: true });
        await dialog.getByRole('button', { name: '鈴太郎3D', exact: true }).click();
        await page.route('**/api/follow/author-alias', route => {
          assert.equal(route.request().postDataJSON().action, 'rename'); renamed = true;
          return route.fulfill({ json: { ok: true } });
        });
        await dialog.getByRole('button', { name: 'Edit the unified name', exact: true }).click();
        await saved.getByText('鈴太郎3D', { exact: true }).waitFor();
        await noPageOverflow(page);
        await page.screenshot({ path: `../build/agent-verification/all-tables/aliases-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
