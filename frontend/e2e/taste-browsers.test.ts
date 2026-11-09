import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('Taste browser sources', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });
  for (const viewport of VIEWPORTS) it(`${viewport.name}: add, stop, and resume reading keep imported records`, { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/taste', viewport);
    const { page } = opened;
    const browsers = [{ id: 'aside', name: 'Aside', path: 'C:/Demo/Aside/User Data', enabled: true, available: true, profiles: 1,
      source_keys: ['d'.repeat(64), 'e'.repeat(64)] }];
    const data = () => ({ summary: { history_visits: 25 }, rankings: {},
      sources: [{ source_key: 'c'.repeat(64), browser: 'bookmarks', profile: 'import-bookmarks-sample.html', host: 'demo', bookmarks: 3 },
        ...browsers.some(row => row.id === 'aside') ? [
          { source_key: 'd'.repeat(64), browser: 'aside', profile: 'Default', host: 'demo', visits: 25 },
          { source_key: 'e'.repeat(64), browser: 'aside', profile: 'Default · Bookmarks', host: 'demo', bookmarks: 7 }] : []],
      browsers: [...browsers] });
    const requests: string[] = [];
    try {
      await page.route('**/api/taste?*', route => route.fulfill({ json: data() }));
      await page.route('**/api/taste/refresh', route => route.fulfill({ json: { status: 'idle' } }));
      await page.route('**/api/taste/source', async route => {
        const body = route.request().postDataJSON(); requests.push(body.operation);
        if (body.operation === 'add') browsers.push({ ...browsers[0], id: 'custom', name: body.name, path: body.path, source_keys: [] });
        else if (body.operation === 'delete_browser') browsers.splice(browsers.findIndex(row => row.id === body.id), 1);
        else browsers.find(row => row.id === body.id)!.enabled = body.operation === 'enable';
        await route.fulfill({ json: { dashboard: data() } });
      });
      await page.reload(); await settle(page);
      const sources = page.getByRole('region', { name: 'Data source', exact: true });
      assert.equal(await sources.count(), 1);
      assert.equal(await sources.locator('[data-taste-source]').count(), 2);
      await sources.getByText('import-bookmarks-sample.html', { exact: true }).waitFor();
      await sources.getByText('25 history entries · 7 bookmarks', { exact: true }).waitFor();
      assert.equal(await sources.getByText('Default · Bookmarks', { exact: true }).count(), 0);
      const cards = await sources.locator('[data-taste-source]').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, radius: style.borderRadius, parent: element.parentElement?.className };
      }));
      assert.deepEqual(cards[0], cards[1]);
      await sources.getByRole('button', { name: 'Add browser', exact: true }).click();
      await sources.getByRole('textbox', { name: 'Browser name', exact: true }).fill('Demo browser');
      await sources.getByRole('textbox', { name: 'Profile directory or history files', exact: true }).fill('C:/Demo/Custom/User Data');
      await sources.getByRole('button', { name: 'Add', exact: true }).click();
      await sources.getByText('Demo browser', { exact: true }).waitFor();
      await sources.getByRole('button', { name: 'Stop reading Aside', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Stop reading Aside', exact: true });
      await dialog.getByRole('button', { name: 'Stop reading', exact: true }).click();
      await sources.getByText('Stopped reading', { exact: true }).waitFor();
      await sources.getByRole('button', { name: 'Enable Aside', exact: true }).click();
      await sources.getByRole('button', { name: 'Stop reading Aside', exact: true }).waitFor();
      await sources.getByRole('button', { name: 'Delete Aside', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'Delete Aside', exact: true }).getByRole('button', { name: 'Delete browser source', exact: true }).click();
      await sources.getByRole('button', { name: 'Stop reading Aside', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await sources.getByRole('button', { name: 'Stop reading Aside', exact: true }).count(), 0);
      assert.deepEqual(requests, ['add', 'disable', 'enable', 'delete_browser']);
      const geometry = await layout(page);
      assert.ok(geometry.scrollWidth <= geometry.viewportWidth, JSON.stringify(geometry));
      await page.screenshot({ path: `../build/taste-browsers-${viewport.name}.png` });
      assert.deepEqual(opened.problems, []);
    } finally { await opened.page.context().close(); }
  });
  for (const viewport of VIEWPORTS) it(`${viewport.name}: bookmark import entry, its own count, and source removal`, { timeout: 60_000 }, async () => {
    const { page, problems } = await visit(browser, '/taste', viewport);
    let imported = false;
    const data = () => ({ summary: { history_visits: 0, bookmarks: imported ? 1284 : 0, history_sources: 2,
      range_start: '2026-10-12', range_end: '2026-10-17' }, rankings: {}, browsers: [],
      sources: imported ? [{ source_key: 'b'.repeat(64), browser: 'bookmarks', host: 'desktop',
        profile: 'Creator and video bookmarks from Chrome and Firefox.html', bookmarks: 1284 }] : [] });
    try {
      await page.route('**/api/taste?*', route => route.fulfill({ json: data() }));
      await page.route('**/api/taste/refresh', route => route.fulfill({ json: { status: 'idle' } }));
      await page.route('**/api/taste/import', async route => {
        assert.equal(decodeURIComponent(route.request().headers()['x-peach-filename']), 'bookmarks.html');
        assert.match(route.request().postData() || '', /NETSCAPE-Bookmark-file-1/);
        imported = true;
        await route.fulfill({ json: { dashboard: data() } });
      });
      await page.route('**/api/taste/source', async route => {
        assert.equal(route.request().postDataJSON().operation, 'remove');
        imported = false;
        await route.fulfill({ json: { removed: 1284, dashboard: data() } });
      });
      await page.reload(); await settle(page);
      await page.getByRole('button', { name: 'More ways to obtain browsing data', exact: true }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import a bookmarks file', exact: true }).click();
      await (await chooser).setFiles({ name: 'bookmarks.html', mimeType: 'text/html',
        buffer: Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL></DL>') });
      await page.getByText('Import file · desktop · 1,284 bookmarks', { exact: true }).waitFor();
      const footer = page.getByText('2 data sources · 10/12–10/17', { exact: true });
      const footerStyle = await footer.evaluate(element => ({ height: element.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(element).lineHeight), whitespace: getComputedStyle(element).whiteSpace }));
      assert.equal(footerStyle.whitespace, 'nowrap');
      assert.ok(footerStyle.height <= footerStyle.line + 1);
      const geometry = await layout(page);
      assert.ok(geometry.scrollWidth <= geometry.viewportWidth, JSON.stringify(geometry));
      await page.screenshot({ path: `../build/taste-bookmarks-${viewport.name}.png` });
      await page.getByRole('button', { name: 'Remove creator and video bookmarks from Chrome and Firefox favorites.html', exact: true }).click();
      await page.getByRole('dialog', { name: 'Remove taste data source', exact: true })
        .getByRole('button', { name: 'Remove taste data source', exact: true }).click();
      await page.getByText('No data sources yet', { exact: true }).waitFor();
      assert.deepEqual(problems, []);
    } finally { await page.context().close(); }
  });
});
