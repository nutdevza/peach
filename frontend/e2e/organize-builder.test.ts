import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, settle, VIEWPORTS, visit } from './harness.ts';

describe('Organize rule building', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of VIEWPORTS) it(`${viewport.name}: parameter insertion, template distinction, and site icons`, async () => {
    const opened = await visit(browser, '/data-cleanup/organize', viewport, async (page) => {
      await page.route('**/api/organize', route => route.fulfill({ json: {
        status: 'idle', locations: [{ location: 'local', roots: [] }], last_batch: '',
        templates: { local: { file: '{code}', dir: '' } },
        presets: [{ label: 'Organize folders by label', file: '{code}[ {title}]', dir: '{studio}', example: 'Label/ABC-123 title.mp4' }],
        placeholders: Object.entries({ code: 'Code', title: 'Title', studio: 'Labels', series: 'Series', year: 'Release year', actors: 'Cast', cd: 'Segment number', mosaic: 'Censored / uncensored', definition: 'Quality' })
          .map(([key, label]) => ({ key, label })),
      } }));
      await page.route('**/api/links', route => route.fulfill({ json: {
        total: 3, entities: 1, by_kind: {}, top_hosts: [['example.com', 3]], top_host_link_ids: { 'example.com': 7 },
      } }));
      await page.route('**/link-mark?*', route => route.fulfill({ contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64') }));
    });
    try {
      const { page } = opened;
      const organize = page.locator('#organize');
      const file = organize.getByRole('textbox', { name: 'File name template', exact: true });
      const dir = organize.getByRole('textbox', { name: 'Folder template', exact: true });
      await file.waitFor();
      await settle(page);
      assert.equal(await organize.getByRole('group', { name: 'Insert parameters', exact: true }).getByRole('button').count(), 9);
      await file.fill('prefix-suffix');
      await file.evaluate((input: HTMLInputElement) => { input.focus(); input.setSelectionRange(3, 3) });
      await organize.getByRole('button', { name: 'Code {code}', exact: true }).click();
      assert.equal(await file.inputValue(), 'prefix-{code}suffix');
      assert.equal(await file.evaluate(input => document.activeElement === input), true);
      await dir.fill('Label/video');
      await dir.evaluate((input: HTMLInputElement) => { input.focus(); input.setSelectionRange(3, 5) });
      await organize.getByRole('button', { name: 'Title {title}', exact: true }).click();
      assert.equal(await dir.inputValue(), 'Label/{title}');
      await dir.evaluate((input: HTMLInputElement) => { input.focus(); input.setSelectionRange(3, 10) });
      await organize.getByRole('button', { name: 'Title {title}', exact: true }).click();
      assert.equal(await dir.inputValue(), 'Label/{title}');
      assert.equal(await dir.evaluate(input => document.activeElement === input), true);
      assert.equal(await dir.evaluate((input: HTMLInputElement) => input.selectionStart), 10);
      await file.fill('custom_{code}[_{definition}]');
      await dir.fill('{year}/{studio}');
      await page.waitForFunction(() => document.querySelector('[data-organize-example]')?.textContent?.includes('2024/label/custom_ABC-123_1080p.mp4'));
      const faces = await page.evaluate(() => {
        const face = (label: string) => {
          const button = document.querySelector(`#organize [aria-label="${label}"] button`)!;
          const style = getComputedStyle(button);
          return [style.backgroundColor, style.borderTopWidth, style.boxShadow];
        };
        return { preset: face('Apply template'), parameter: face('Insert parameters'), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.notDeepEqual(faces.preset, faces.parameter, 'The template and params use different button styles');
      assert.equal(faces.overflow, false);
      await organize.getByRole('button', { name: 'Organize folders by label', exact: true }).click();
      assert.equal(await file.inputValue(), '{code}[ {title}]');
      assert.equal(await dir.inputValue(), '{studio}');
      await page.waitForFunction(() => document.querySelector('[data-organize-example]')?.textContent?.includes('Label/ABC-123 title.mp4'));
      assert.ok((await organize.textContent())?.includes('Path example: label/ABC-123 Title.mp4'));
      await page.goto(new URL('/data-cleanup/links', page.url()).href);
      const icon = page.locator('#link-manager a[href="https://example.com"] img');
      await icon.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const image = document.querySelector<HTMLImageElement>('#link-manager a img');
        return image?.complete && image.naturalWidth > 0;
      });
      assert.equal(await icon.getAttribute('src'), '/link-mark?id=7');
      const link = page.locator('#link-manager a[href="https://example.com"]');
      assert.equal((await link.textContent())?.trim(), 'example.com');
      assert.equal(await link.locator('svg').count(), 1);
      await link.hover();
      const badge = page.locator('[data-top-host] > span');
      assert.equal(await badge.textContent(), '3');
      const badgeFace = await badge.evaluate(node => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, decoration: style.textDecorationLine };
      });
      assert.notEqual(badgeFace.background, 'rgba(0, 0, 0, 0)');
      assert.equal(badgeFace.decoration, 'none');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });
});
