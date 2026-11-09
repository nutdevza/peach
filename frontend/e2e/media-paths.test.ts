import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('Non-Windows media folder configuration', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: only the media directories are filled in; existing path mappings are kept on save`, async () => {
      const opened = await visit(browser, '/configuration', viewport);
      const { page } = opened;
      const writes: Array<{ media_sources: Array<{ path: string; root: string }> }> = [];
      try {
        await page.route('**/api/configuration', async route => {
          if (route.request().method() === 'POST') {
            writes.push(route.request().postDataJSON());
            await route.fulfill({ json: { saved: true, url: new URL('/configuration', page.url()).href, revision: 'saved' } });
            return;
          }
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, editable: true, windows: false,
            media_dirs: ['/media/movies'], media_sources: [
              { location: 'local', path: '/media/movies', root: 'R:\\media', library: 'Movies', cost: 'free', online: true },
            ] } });
        });
        await page.reload();
        const form = page.getByRole('form', { name: 'Library and catalog', exact: true });
        const path = form.getByRole('textbox', { name: 'Media directory 1', exact: true });
        await path.waitFor({ state: 'visible' });
        const internal = form.getByRole('textbox', { name: 'Path prefix in the database', exact: true });
        assert.equal(await internal.count(), 0);
        await path.fill('/media/movies');
        await path.blur();
        await page.mouse.move(0, 0);
        await page.getByRole('tooltip').waitFor({ state: 'hidden' });
        await settle(page);
        await form.screenshot({ path: `../build/media-path-default-${viewport.name}.png` });
        if (!viewport.mobile) await page.screenshot({ path: '../build/media-path-page.png', fullPage: true });
        assert.equal(await form.getByText('Advanced path settings', { exact: true }).count(), 0);
        assert.deepEqual((await layout(page)).offenders, []);
        await form.screenshot({ path: `../build/media-path-${viewport.name}.png` });
        assert.equal(await path.inputValue(), '/media/movies');
        await form.getByRole('button', { name: 'Add folders to Movies', exact: true }).click();
        await form.getByRole('textbox', { name: 'Media directory 2', exact: true }).fill('/media/other');
        assert.equal(await internal.count(), 0);
        // Saving restarts Peach: if scanning and collection are running, confirm first; cancel writes nothing.
        await page.route('**/api/library-processing', route => route.fulfill({ json: { status: 'running', trigger: 'cli' } }));
        await form.getByRole('button', { name: 'Save configuration', exact: true }).click();
        const restart = page.getByRole('dialog', { name: 'Scanning and collecting in progress', exact: true });
        await restart.getByText(/由命令行或托盘发起，在独立进程里运行，不受重启影响/).waitFor();
        await restart.getByRole('button', { name: 'Cancel', exact: true }).click();
        await restart.waitFor({ state: 'hidden' });
        assert.equal(writes.length, 0);
        await form.getByRole('button', { name: 'Save configuration', exact: true }).click();
        await restart.getByRole('button', { name: 'Still kept', exact: true }).click();
        await page.getByText('Configuration saved', { exact: true }).waitFor();
        assert.deepEqual(writes.at(-1)?.media_sources.map(({ path, root }) => ({ path, root })), [
          { path: '/media/movies', root: 'R:\\media' }, { path: '/media/other', root: '' },
        ]);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
