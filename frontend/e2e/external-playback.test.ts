import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, VIEWPORTS } from './harness.ts';
import { ITEM, openItemPage } from './item-fixture.ts';

describe('External player', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of [VIEWPORTS.find((one) => !one.mobile)!, VIEWPORTS.find((one) => one.mobile)!]) {
    it(`${viewport.mobile ? 'Mobile' : 'Desktop'} details share the player selection and open button`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, viewport);
      try {
        const page = opened.page;
        await page.route('**/api/local-players', route => route.fulfill({ json: { players: [
          { id: 'default', label: 'The system default player' }, { id: 'potplayer', label: 'PotPlayer' },
        ] } }));
        let selected = '';
        let failOpen = false;
        await page.route('**/api/local-playback?*', route => {
          selected = new URL(route.request().url()).searchParams.get('player') || '';
          if (failOpen) return route.fulfill({ status: 503, json: { detail: 'The player could not open' } });
          return route.fulfill({ json: { opened: true } });
        });
        await page.reload();
        const chooser = page.getByRole('button', { name: 'External player', exact: true });
        await chooser.waitFor();
        assert.equal(await page.locator('#stage details[open]').count(), 0);
        assert.equal(await page.getByText('External player / VR', { exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Open with external player', exact: true }).count(), 1);
        await chooser.click();
        await page.getByRole('option', { name: 'PotPlayer', exact: true }).click();
        await page.getByRole('button', { name: 'Open with external player', exact: true }).click();
        await page.waitForFunction(() => document.body.textContent?.includes('Requested to open the local player'));
        assert.equal(selected, 'potplayer');
        failOpen = true;
        await page.getByRole('button', { name: 'Open with external player', exact: true }).click();
        await page.locator('[data-local-playback] [role="alert"]').waitFor();
        const geometry = await page.locator('[data-local-playback]').evaluate(host => {
          const row = host.querySelector('[data-local-playback-row]')!.getBoundingClientRect();
          const error = host.querySelector('[role="alert"]')!.getBoundingClientRect();
          const select = host.querySelector('[aria-label="External player"]')!.getBoundingClientRect();
          const button = host.querySelector('[aria-label="Open with external player"]')!.getBoundingClientRect();
          return { gap: error.top - row.bottom, left: error.left - row.left,
            sameTop: Math.abs(select.top - button.top), sameHeight: Math.abs(select.height - button.height) };
        });
        assert.equal(geometry.gap, 8);
        assert.equal(geometry.left, 0);
        assert.equal(geometry.sameTop, 0);
        assert.equal(geometry.sameHeight, 0);
        assert.deepEqual((await layout(page)).offenders, []);
      } finally { await opened.close() }
    });

    it(`${viewport.mobile ? 'Mobile' : 'Desktop'} generates a copyable network address on demand`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, viewport, { ready: '#stage[open] [data-item-side]' });
      try {
        const page = opened.page;
        let requested = 0;
        await page.route('**/api/external-playback?*', route => {
          requested++;
          return route.fulfill({ json: { url: `/external-stream/${ITEM.plain}?ticket=${'a'.repeat(90)}`,
            playlist: `/external-playlist/${ITEM.plain}.m3u?ticket=${'a'.repeat(90)}` } });
        });
        await page.getByRole('button', { name: 'External player', exact: true }).click();
        await page.getByRole('option', { name: 'Network play address / VR', exact: true }).click();
        assert.equal(requested, 0);
        await page.getByRole('button', { name: 'Open with external player', exact: true }).click();
        await page.getByRole('textbox', { name: 'Network playback URL' }).waitFor();
        assert.equal(requested, 1);
        assert.match(await page.getByRole('textbox', { name: 'Network playback URL' }).inputValue(), /\/external-stream\/11\?ticket=/);
        assert.deepEqual((await layout(page)).offenders, []);
      } finally { await opened.close() }
    });
  }
});
