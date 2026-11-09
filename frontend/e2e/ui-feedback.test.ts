import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, VIEWPORTS, visit } from './harness.ts';

/* Each section picks a card that does not come and go with local configuration: the skeleton draws the final structure. Cards that vary with configuration (the download channels' "Cloud download"
   follows whether the library has a cloud drive) draw by the structure last recorded on this machine; a fresh browser has no record and draws the minimal structure. */
const sections = [
  ['library', 'Library and imports', 'Library and catalog'], ['subscriptions', 'Sources and subscriptions', 'Video profile sites'],
  ['downloads', 'Download channels', 'Add JAV via browser'], ['network', 'Network & access', 'Peach proxy'],
  ['maintenance', 'App and maintenance', 'Start at sign-in'], ['diagnostics', 'System diagnostics', 'Library health'],
] as const;

describe('Waiting feedback and folder mode', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    for (const [key, name, title] of sections) it(`${viewport.name} ${name} first-screen skeleton keeps sections and boundaries`, async () => {
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve });
      const opened = await visit(browser, `/settings/${key}`, viewport, async page => {
        await page.route('**/api/configuration', async route => { await held; await route.continue() });
      });
      try {
        const { page } = opened;
        const root = page.locator(`[data-skeleton="board/settings/${key}"]`);
        await root.waitFor();
        assert.equal((await root.locator('.ui-board-local-nav [aria-selected="true"]').innerText()).trim(), name);
        assert.ok(await root.locator(`[aria-label="${title}"]`).count());
        if (key !== 'library') assert.equal(await root.locator('[aria-label="Media library and catalog"]').count(), 0);
        if (key === 'library') assert.equal(await root.locator('[data-folder-row]').count(), 1);
        const geometry = await layout(page);
        assert.ok(geometry.scrollWidth <= geometry.viewportWidth, JSON.stringify(geometry));
        assert.deepEqual(geometry.offenders, []);
        release();
        await root.waitFor({ state: 'detached' });
        await settle(page);
        assert.deepEqual(opened.problems, []);
      } finally { release(); await opened.close() }
    });

    it(`${viewport.name} folder waiting states shimmer only inside their own placeholders`, async () => {
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve });
      const opened = await visit(browser, '/?browse=folders', viewport, async page => {
        await page.route('**/api/folders?*', async route => { await held; await route.continue() });
      });
      try {
        const { page } = opened;
        await page.locator('#catalogFolderHeader [data-skeleton]').waitFor();
        if (!viewport.mobile) {
          const tree = page.locator('#catalogFoldersTree [aria-label="Loading catalog tree"]');
          await tree.waitFor();
          assert.equal(await tree.locator(':scope > div').count(), 8);
          const bounds = await tree.boundingBox();
          assert.ok(bounds && bounds.width <= 224 && bounds.height < 350);
        }
        const spans = await page.locator('#catalogFolderHeader .skeleton-sheen').evaluateAll(nodes => nodes.map(node => {
          const css = getComputedStyle(node), pseudo = getComputedStyle(node, '::after');
          return { position: css.position, overflow: css.overflow, pseudo: pseudo.position, width: node.getBoundingClientRect().width };
        }));
        assert.equal(spans.length, 6);
        assert.ok(spans.every(row => row.position === 'relative' && row.overflow === 'hidden' && row.pseudo === 'absolute' && row.width > 0));
        release();
        await settle(page);
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { release(); await opened.close() }
    });

    it(`${viewport.name} multiple subfolders can expand and collapse`, async () => {
      const opened = await visit(browser, '/?browse=folders', viewport, async page => {
        await page.route('**/api/folders?*', route => route.fulfill({ json: {
          roots: [], selected: null, ancestors: [], matches: [], conflicts: [], rule: null, rules: [], rules_revision: 1,
          children: Array.from({ length: 40 }, (_, i) => ({ id: `folder-${i}`, name: `Folder ${i}`, parent: null,
            path: `R:\\demo\\${i}`, location: 'local', root: 'root', has_children: false, files: 1, videos: 1 })),
        } }));
      });
      try {
        const { page } = opened;
        const group = page.locator('#catalogFolderHeader [aria-label="Subfolders"]');
        await group.waitFor();
        assert.equal(await group.getByRole('button').count(), 12);
        await page.getByRole('button', { name: 'Expand all 40 folders' }).click();
        assert.equal(await group.getByRole('button').count(), 40);
        const collapse = page.getByRole('button', { name: 'Collapse folders' });
        assert.equal(await collapse.getAttribute('aria-expanded'), 'true');
        await collapse.click();
        assert.equal(await group.getByRole('button').count(), 12);
        await settle(page);
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });

    it(`${viewport.name} folder scrollbar is inset and every scroll position stays inside the panel`, async () => {
      const opened = await visit(browser, '/?browse=folders', viewport, async page => {
        const roots = Array.from({ length: 50 }, (_, i) => ({ id: `root-${i}`, name: `Media directory ${i}`,
          parent: null, path: `R:\\demo\\${i}`, location: 'local', root: `root-${i}`,
          has_children: false, files: 1, videos: 1 }));
        await page.route('**/api/folders?*', route => route.fulfill({ json: {
          roots, children: [], selected: null, ancestors: [], matches: [], conflicts: [], rule: null, rules: [], rules_revision: 1,
        } }));
      });
      try {
        const { page } = opened;
        if (viewport.mobile) await page.getByRole('button', { name: 'Open the folder view' }).click();
        const scroller = page.locator('[aria-label="Folder navigation"]:visible .folder-tree-scroller');
        await scroller.waitFor();
        await scroller.locator('..').locator('.ovtrack.ov-y').waitFor();
        for (const height of [160, 32]) {
          await scroller.evaluate((node, value) => { node.style.maxHeight = `${value}px` }, height);
          for (const fraction of [0, .5, 1]) {
            await scroller.evaluate((node, value) => { node.scrollTop = (node.scrollHeight - node.clientHeight) * value }, fraction);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const bounds = await scroller.evaluate(node => {
              const box = node.getBoundingClientRect();
              const thumb = node.parentElement!.querySelector('.ovtrack.ov-y .ovthumb')!.getBoundingClientRect();
              return { right: box.right - thumb.right, top: thumb.top - box.top, bottom: box.bottom - thumb.bottom };
            });
            assert.ok(bounds.right >= 7, `The scrollbar hugs the right edge: ${JSON.stringify(bounds)}`);
            assert.ok(bounds.top >= 7 && bounds.bottom >= 7, `Scrollbar exceeds the top and bottom padding: ${JSON.stringify(bounds)}`);
          }
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });

    it(`${viewport.name} profile page folder filter keeps people scope`, async () => {
      let filtered = false;
      const opened = await visit(browser, '/performers/demo-performer?browse=folders', viewport, async page => {
        await page.route('**/api/entity?*', route => route.fulfill({ json: {
          id: 90001, kind: 'performer', canonical_name: 'Demo artist', asset_count: 1, tags: [], links: [],
          related_performers: [], aliases: [], metadata: {}, entry_links: [], has_image: false,
        } }));
        await page.route('**/api/folders?*', route => route.fulfill({ json: {
          roots: [], selected: null, ancestors: [], matches: [], conflicts: [], rule: null, rules: [], rules_revision: 1,
          children: [{ id: 'folder-1', name: 'Example folder', parent: null, path: 'R:\\demo', location: 'local', root: 'root', has_children: false, files: 1, videos: 1 }],
        } }));
        await page.route(/\/api\/items\?/, async route => {
          const query = new URL(route.request().url()).searchParams;
          if (query.has('folder')) filtered = query.get('folder') === 'folder-1' && query.get('performer') === 'Demo artist';
          await route.fulfill({ json: { total: 1, items: [{ id: 1, name: 'Example video', medium: 'video', location: 'local', has_thumb: false }], has_more: false } });
        });
      });
      try {
        const { page } = opened;
        const toggle = page.getByRole('button', { name: 'Folder mode', exact: true });
        await toggle.waitFor();
        assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
        await page.locator('[data-folder-header-host]').getByRole('button', { name: 'Example folder' }).click();
        await page.waitForFunction(() => new URLSearchParams(location.search).get('folder') === 'folder-1');
        await settle(page);
        assert.equal(filtered, true);
        await toggle.click();
        await settle(page);
        assert.equal(await page.locator('[data-folder-workspace]').getAttribute('data-folder-browse'), null);
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
