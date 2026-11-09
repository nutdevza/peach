import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('Config form and row spacing', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: an empty cloud download check report takes no divider space`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('Download channels'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, downloads: { ...data.downloads, media_sources: ['guangya'], token_set: true,
            config: { ...data.downloads.config, clouddrive_address: 'http://127.0.0.1:19798' } } } });
        });
        await page.route('**/api/configuration/downloads/check', route => route.fulfill({ json: {
          ok: true, address: 'http://127.0.0.1:19798', permissions: [], missing: [], root: '/', folder: null,
          quota: null, suggested_target: null, suggested_pikpak_root: '', problems: [],
        } }));
        await page.reload();
        const form = page.getByRole('form', { name: 'Cloud download', exact: true });
        await form.getByRole('button', { name: 'Check connection', exact: true }).click();
        await settle(page);
        assert.equal(await form.locator('dl').count(), 0);
        assert.equal(await form.locator('.border-t').count(), 1);
        const empty = await form.locator('div').evaluateAll(nodes => nodes.filter(node =>
          !node.childNodes.length && node.getBoundingClientRect().height > 0).map(node => node.className));
        assert.deepEqual(empty, []);
        assert.ok((await layout(page)).scrollWidth <= viewport.width + 1);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}: source marks are served locally and the help link follows the text directly`, async () => {
      const opened = await visit(browser, '/settings/subscriptions', viewport);
      const { page } = opened;
      try {
        const section = page.getByRole('form', { name: 'Resource search', exact: true });
        await section.getByText('Indexer connection help', { exact: true }).click();
        const link = section.getByRole('link', { name: 'Detailed configuration guide', exact: true });
        await link.waitFor({ state: 'visible' });
        assert.equal(await link.evaluate(node => node.parentElement?.tagName), 'P');
        const head = page.locator('b').filter({ hasText: /^F95zone$/ }).locator('..');
        const icon = head.locator('img');
        await icon.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('img[src*="provider=f95zone"]')].some(image => image.complete && image.naturalWidth > 0));
        assert.equal(await icon.getAttribute('src'), '/source-icon?provider=f95zone');
        await icon.evaluate(image => image.dispatchEvent(new Event('error')));
        await head.locator('svg').waitFor();
        assert.equal(await head.locator('img').count(), 0);
        await section.screenshot({ path: `../build/indexer-help-${viewport.name}.png` });
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}: the app update package note and size stay inside the viewport`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('App and maintenance'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, updates: { ...data.updates, installation: 'Standalone test package',
            state: 'available', latest_version: '1.0.0', message: 'A new version is available for download.', package_kind: 'update',
            asset_size: 12 * 1048576, release_url: 'https://github.com/peach-mitao/peach/releases/tag/v1.0.0' },
            update_job: { state: 'idle', progress: 0 } } });
        });
        await page.reload();
        const region = page.getByRole('region', { name: 'Check for updates', exact: true });
        await region.getByText('App update package · 12.0 MB', { exact: true }).waitFor();
        assert.ok((await region.innerText()).includes('Missing, damaged, or version-changed tools download separately'));
        assert.equal(await region.getByRole('link', { name: 'Full installer', exact: true }).count(), 0);
        await settle(page);
        assert.ok((await layout(page)).scrollWidth <= viewport.width + 1);
        await region.screenshot({ path: `../build/update-download-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}: the mounted directory proxy guard toggles and stays within the viewport`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('This computer'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration/cloud-proxies', route => route.fulfill({ json: { accounts: [] } }));
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, editable: true, windows: true, media_sources: [
            { location: 'onedrive', root: 'O:\\Movies', path: 'O:\\Movies', cost: 'metered' },
            { location: 'mounted', root: 'M:\\Movies', path: 'M:\\Movies', cost: 'free' },
            { location: 'guangya', root: 'G:\\Movies', path: 'G:\\Movies', cost: 'free' },
            { location: '115', root: 'B:\\Movies', path: 'B:\\Movies', cost: 'free' },
            { location: 'pikpak', root: 'A:\\Movies', path: 'A:\\Movies', cost: 'metered' },
          ] } });
        });
        await page.reload();
        const form = page.getByRole('form', { name: 'Library and catalog', exact: true });
        const protectedFolder = form.locator('[data-media-read-policy="0"] [aria-haspopup="listbox"]');
        await protectedFolder.waitFor();
        // For the four libraries with brand images, the title row's icon, the folder row's source and its owning library each show a site logo.
        await page.waitForFunction(() => {
          const marks = [...document.querySelectorAll<HTMLImageElement>('[data-library-block] img')];
          return marks.length === 12 &&marks.every(image => image.complete && image.naturalWidth > 0);
        });
        const marks = await form.locator('[data-library-block] img').evaluateAll(images => images.map(image => {
          // Site icons are inline glyphs, and the frame takes `--icon-inline` (1.2x the surrounding text's font size).
          const box = image.getBoundingClientRect();
          const glyph = parseFloat(getComputedStyle(image).fontSize) * 1.2;
          return { inline: image.getAttribute('src')?.startsWith('data:image/png;base64,'),
            sized: Math.abs(box.width - glyph) < 0.5 && Math.abs(box.height - glyph) < 0.5 };
        }));
        assert.deepEqual(marks, Array.from({ length: 12 }, () => ({ inline: true, sized: true })));
        assert.ok(!(await form.innerText()).includes('(read-only)'));
        assert.ok((await protectedFolder.textContent())?.includes('Proxy protection'));
        assert.ok((await form.locator('[data-media-read-policy="1"]').textContent())?.includes('Normal read'));
        if (!viewport.mobile) {
          const spread = (boxes: { y: number; height: number }[]) => {
            const centers = boxes.map(box => box.y + box.height / 2);
            return Math.max(...centers) - Math.min(...centers);
          };
          for (let index = 0; index < 5; index++) {
            const block = form.locator('[data-library-block]').nth(index);
            const head = block.locator('[data-library-head]');
            const icon = await head.getByRole('button').first().boundingBox();
            const name = await head.getByRole('textbox').boundingBox();
            const preset = await head.locator('[aria-haspopup="listbox"]').last().boundingBox();
            const row = block.locator('[data-folder-row]');
            const source = await row.locator('[aria-haspopup="listbox"]').first().boundingBox();
            const policy = await row.locator('[data-media-read-policy] [aria-haspopup="listbox"]').boundingBox();
            const library = await row.getByRole('button', { name: new RegExp(`Media library owning directory ${index + 1}`) }).boundingBox();
            assert.ok(icon && name && preset && source && policy && library);
            // A library's icon, name, and handling mode sit in one row in the card header; a folder row keeps source, read strategy, and owning library in one row, with controls sharing that row center-aligned.
            assert.ok(spread([icon, name, preset]) <= 3, JSON.stringify({ index, icon, name, preset }));
            assert.ok(spread([source, policy, library]) <= 3, JSON.stringify({ index, source, policy, library }));
            assert.ok(source.y >= name.y + name.height, JSON.stringify({ index, name, source }));
            assert.ok(policy.x > source.x && library.x > policy.x);
            assert.ok(policy.width <= 132);
          }
        }
        await form.locator('[data-library-head]').first().getByRole('button').first().click();
        const icons = page.getByRole('radiogroup', { name: 'Available icons', exact: true });
        await icons.waitFor();
        const inputBounds = await icons.locator('input[type="radio"]').evaluateAll(inputs => inputs.map(input => {
          const native = input.getBoundingClientRect();
          const label = input.closest('label')!.getBoundingClientRect();
          return native.top >= label.top - 1 && native.bottom <= label.bottom + 1
            && native.left >= label.left - 1 && native.right <= label.right + 1;
        }));
        assert.ok(inputBounds.length > 7 && inputBounds.every(Boolean), 'The icon grid\'s hidden radio input leaves its own cell');
        await icons.getByRole('radio', { name: 'Disk', exact: true }).focus();
        const iconScroll = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('ArrowRight');
        assert.equal(await icons.getByRole('radio', { name: 'Profile library', exact: true }).isChecked(), true);
        assert.equal(await page.evaluate(() => window.scrollY), iconScroll, 'Selecting an icon moved the page');
        await page.getByRole('dialog').filter({ has: icons }).getByRole('button', { name: 'Cancel', exact: true }).click();
        await protectedFolder.click();
        await page.getByRole('option', { name: 'Normal read', exact: true }).click();
        await settle(page);
        assert.ok((await protectedFolder.textContent())?.includes('Normal read'));
        assert.deepEqual((await layout(page)).offenders, []);
        await form.screenshot({ path: `../build/cloud-source-icons-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });

    it(`${viewport.name}: the PikPak form shows directly with the login button on the same row`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('Download channels'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          const body = data.downloads;
          await route.fulfill({ json: { ...data, downloads: { ...body, available: true, media_sources: ['pikpak'],
            pikpak: { ...body.pikpak, logged_in: false },
            pikpak_browser: { available: true, state: 'idle', message: '' } } } });
        });
        await page.reload();
        const form = page.getByRole('form', { name: 'PikPak account', exact: true });
        await form.getByLabel('Account', { exact: true }).waitFor();
        assert.equal(await form.locator('details').count(), 0);
        const password = await form.getByRole('button', { name: 'Log in', exact: true }).boundingBox();
        const browserLogin = await form.getByRole('button', { name: 'Sign in with the browser', exact: true }).boundingBox();
        assert.ok(password && browserLogin && Math.abs(password.y - browserLogin.y) <= 1);
        assert.ok((await layout(page)).scrollWidth <= viewport.width + 1);
        await form.screenshot({ path: `../build/pikpak-form-${viewport.name}.png` });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}: the full uninstall row aligns with the settings card body`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('App and maintenance'), viewport);
      const { page } = opened;
      try {
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, uninstall: { ...data.uninstall, available: false } } });
        });
        await page.reload();
        const region = page.getByRole('region', { name: 'Uninstall Peach', exact: true });
        await region.getByText('Full uninstall', { exact: true }).waitFor();
        await settle(page);
        const geometry = await region.evaluate(node => {
          const card = node.lastElementChild!.getBoundingClientRect();
          const label = [...node.querySelectorAll('p')].find(item => item.textContent === 'Full uninstall')!.getBoundingClientRect();
          return { top: label.top - card.top, left: label.left - card.left };
        });
        assert.ok(geometry.top <= 12 && geometry.top >= 9, JSON.stringify(geometry));
        assert.ok(Math.abs(geometry.left - 12) <= 1, JSON.stringify(geometry));
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
