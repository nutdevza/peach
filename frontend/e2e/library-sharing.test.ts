import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright-core';

import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('Library and taste sharing', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: connection dots and text use matching semantic colors, legible in light and dark`, async () => {
      const opened = await visit(browser, '/settings/library', viewport, async page => {
        await page.route('**/api/configuration', async route => {
          const response = await route.fetch();
          await route.fulfill({ json: { ...await response.json(), editable: false,
            media_sources: [
              { location: 'local', root: 'R:\\Media', path: 'R:\\Media', online: false },
              { location: '115', root: 'B:\\', path: 'B:\\', online: true },
              { location: 'pikpak', root: 'A:\\', path: 'A:\\' },
            ] } });
        });
      });
      try {
        const status = opened.page.locator('[data-mount="offline"]').first();
        await status.waitFor();
        for (const theme of ['light', 'dark']) {
          await opened.page.evaluate(value => {
            document.documentElement.dataset.theme = value;
            document.documentElement.classList.toggle('dark', value === 'dark');
          }, theme);
          for (const [state, textToken, dotToken] of [
            ['offline', '--color-status-yellow-text', '--color-yellow-500'],
            ['online', theme === 'dark' ? '--color-green-400' : '--color-green-700', '--color-green-500'],
            ['unknown', '--color-text-secondary', '--color-text-tertiary'],
          ]) {
            const colors = await opened.page.locator(`[data-mount="${state}"]`).first().evaluate((element, tokens) => {
            const halo = element.firstElementChild!;
            const dot = halo.firstElementChild!;
            const probe = document.createElement('span');
            element.append(probe);
            probe.style.color = `var(${tokens[0]})`;
            const expectedText = getComputedStyle(probe).color;
            probe.style.color = `var(${tokens[1]})`;
            const expectedDot = getComputedStyle(probe).color;
            probe.remove();
            return { text: getComputedStyle(element).color, dot: getComputedStyle(dot).backgroundColor,
              halo: getComputedStyle(halo).backgroundColor, expectedText, expectedDot };
          }, [textToken, dotToken]);
            assert.equal(colors.dot, colors.expectedDot, JSON.stringify(colors));
            assert.equal(colors.text, colors.expectedText, JSON.stringify(colors));
            assert.notEqual(colors.halo, 'rgba(0, 0, 0, 0)');
          }
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name}: preview description and standalone toggle are accessible`, async () => {
      const posts: Record<string, unknown>[] = [];
      const state = { enabled: false, available: true, schema: 4,
        fields: ['Video code, tags, people, rating, and every preference dimension'],
        notice: 'Uploads library and preference details after anonymization.' };
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('App and maintenance'), viewport,
        async page => {
          await page.route('**/api/configuration', async route => {
            const response = await route.fetch();
            await route.fulfill({ json: { ...await response.json(), library_sharing: state } });
          });
          await page.route('**/api/configuration/library-sharing/preview', route => route.fulfill({ json: {
            token: 'preview-token', schema: 4, bytes: 128,
            data: { schema: 4, period: '2026-W42', library: [{ code: 'EXM-001', manual_tags: ['Long tag'.repeat(500)] }],
              preferences: { performer: [] }, coverage: { uncoded_items: 0 } },
          } }));
          await page.route('**/api/configuration/library-sharing', route => {
            const body = route.request().postDataJSON();
            posts.push(body);
            return route.fulfill({ json: { ...state, enabled: body.enabled } });
          });
        });
      const { page } = opened;
      try {
        const region = page.getByRole('region', { name: 'Data upload', exact: true });
        await region.waitFor();
        assert.equal(await region.getByRole('switch').count(), 2, 'Both upload toggles belong to one section');
        const initialToggle = region.getByRole('switch', { name: 'Upload library and taste details', exact: true });
        assert.equal(await initialToggle.count(), 1, 'The upload toggle should also render when off');
        const fields = region.getByText(state.fields[0], { exact: true });
        assert.equal(await fields.isVisible(), false, 'The field description is collapsed by default');
        const rules = region.getByText('Library statistics fields and sending rules', { exact: true });
        await rules.click();
        assert.equal(await fields.isVisible(), true, 'Expandable to view the fields');
        await rules.click();
        await fields.waitFor({ state: 'hidden' });
        await region.getByRole('button', { name: 'Preview upload contents', exact: true }).click();
        const preview = region.getByLabel('Library and taste upload preview', { exact: true });
        await preview.waitFor();
        assert.equal(posts.length, 0);
        assert.equal(await fields.isVisible(), false);
        assert.equal(await region.getByText('The random ID deduplicates instances. State goes out once a day; after turning it off only one closing state is sent.', { exact: true }).isVisible(), true);
        assert.match(await preview.innerText(), /EXM-001/);
        assert.match(await preview.innerText(), /performer/);
        assert.equal(await region.locator('[data-code-block]').count(), 1);
        assert.equal(await region.getByRole('button', { name: 'Copy code', exact: true }).count(), 1);
        await preview.focus();
        assert.ok(await preview.evaluate(element => element.scrollWidth > element.clientWidth), 'Long code scrolls horizontally inside the code block');
        await settle(page);
        const measured = await layout(page);
        assert.ok(measured.scrollWidth <= measured.viewportWidth + 1, JSON.stringify(measured));
        assert.deepEqual(measured.offenders, []);
        await page.screenshot({ path: fileURLToPath(new URL(`../../build/library-sharing-${viewport.name}.png`, import.meta.url)) });
        const toggle = initialToggle;
        await toggle.locator('xpath=ancestor::label').click();
        await settle(page);
        assert.equal(posts.length, 0);
        await region.getByRole('checkbox').focus();
        await region.getByRole('checkbox').press('Space');
        await region.getByRole('button', { name: 'Consent and enable uploads', exact: true }).click();
        await preview.waitFor({ state: 'hidden' });
        await settle(page);
        assert.deepEqual(posts[0], { enabled: true, schema: 4, consent: true, preview_token: 'preview-token' });
        assert.equal(await preview.count(), 0, 'Collapse data preview after consent');
        assert.equal(await region.getByRole('checkbox').count(), 0, 'Collapse the consent box after agreeing');
        assert.equal(await fields.isVisible(), false, 'After agreeing the field description stays collapsed');
        assert.equal(await toggle.isChecked(), true);
        await region.getByRole('button', { name: 'Preview upload contents', exact: true }).click();
        await preview.waitFor();
        assert.equal(posts.length, 1, 'Viewing the preview never saves consent twice');
        assert.equal(await region.getByRole('checkbox').count(), 0, 'Once enabled, viewing the preview never asks for consent again');
        await toggle.focus();
        const disabled = page.waitForResponse(response => response.url().endsWith('/api/configuration/library-sharing')
          && response.request().method() === 'POST');
        await toggle.press('Space');
        await disabled;
        await toggle.and(page.locator(':not(:checked)')).waitFor({ state: 'attached' });
        await settle(page);
        assert.equal(posts[1]?.enabled, false);
        assert.equal(await toggle.isChecked(), false);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
