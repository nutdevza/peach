import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('CloudDrive proxy settings', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: read, save, focus sync, and conflict handling`, async () => {
      let account = { id: 'one', name: 'Example cloud drive', cloud: '115open', path: '/drive1', revision: '1', writable: true,
        libraries: [{ name: 'My library', root: 'A:\\Movies', location: '115' }],
        api: { mode: 'direct', host: '', port: 0, username: '', password_set: false },
        data: { mode: 'http', host: 'localhost', port: 7890, username: '', password_set: true } };
      const posts: Record<string, unknown>[] = [];
      let reads = 0;
      const opened = await visit(browser, '/settings/library', viewport, async page => {
        await page.route('**/api/configuration', async route => {
          const data = await (await route.fetch()).json();
          await route.fulfill({ json: { ...data, media_sources: [{ location: '115', root: 'A:\\Movies', path: 'A:\\Movies', cost: 'metered' }] } });
        });
        await page.route('**/api/configuration/cloud-proxies', async route => {
          if (route.request().method() === 'GET') {
            reads++;
            return route.fulfill({ json: { accounts: [account] } });
          }
          const body = route.request().postDataJSON();
          posts.push(body);
          if (body.revision !== account.revision) return route.fulfill({ status: 409, json: { detail: 'The CloudDrive2 configuration changed; re-read it before saving' } });
          account = { ...account, ...body, revision: String(Number(account.revision) + 1) };
          return route.fulfill({ json: account });
        });
      });
      const { page } = opened;
      try {
        const section = page.getByRole('region', { name: 'CloudDrive proxy', exact: true });
        const form = section.getByRole('form', { name: 'My library proxy', exact: true });
        const dataSelect = () => form.locator('button[aria-haspopup="listbox"]').first();
        await form.getByRole('textbox', { name: 'Data proxy port', exact: true }).fill('7891');
        await form.getByRole('button', { name: 'Save configuration', exact: true }).click();
        await page.waitForFunction(() => [...document.querySelectorAll('form[aria-label="My library proxy"] button')].some(button => button.textContent === 'Save configuration' && (button as HTMLButtonElement).disabled));
        assert.equal(posts.length, 1);
        assert.equal((posts[0].data as { port: number }).port, 7891);
        assert.equal('api' in posts[0], false);
        assert.equal('password' in (posts[0].data as object), false);
        account = { ...account, revision: '3', data: { ...account.data, mode: 'system' } };
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.waitForFunction(() => document.querySelector('[aria-label="Data proxy"]')?.textContent?.includes('Follow system'));
        await dataSelect().click();
        await page.getByRole('option', { name: 'Direct', exact: true }).click();
        const before = reads;
        account = { ...account, revision: '4', data: { ...account.data, mode: 'socks5' } };
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.waitForTimeout(150);
        assert.equal(reads, before);
        assert.ok((await dataSelect().innerText()).includes('Direct'));
        await form.getByRole('button', { name: 'Save configuration', exact: true }).click();
        await form.getByText('The CloudDrive2 configuration changed; re-read it before saving', { exact: true }).waitFor();
        await section.getByRole('button', { name: 'Reload', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[aria-label="Data proxy"]')?.textContent?.includes('SOCKS5'));
        await settle(page);
        assert.deepEqual((await layout(page)).offenders, []);
        await section.screenshot({ path: `../build/cloud-proxy-${viewport.name}.png` });
        assert.deepEqual(opened.problems.filter(message => !message.includes('409')), []);
      } finally { await opened.close() }
    });
  }
  it('Without a CloudDrive2 address filled in, a settings entry shows and no error is raised', async () => {
    const opened = await visit(browser, '/settings/library', VIEWPORTS[0], async page => {
      await page.route('**/api/configuration', async route => {
        const data = await (await route.fetch()).json();
        await route.fulfill({ json: { ...data, media_sources: [{ location: '115', root: 'B:/', path: '', cost: 'metered' }] } });
      });
      await page.route('**/api/configuration/cloud-proxies', route =>
        route.fulfill({ json: { accounts: [], unlinked: [], configured: false } }));
    });
    const { page } = opened;
    try {
      const section = page.getByRole('region', { name: 'CloudDrive proxy', exact: true });
      await section.getByText('After filling in the CloudDrive2 address and API token, set a proxy for each cloud drive account here.').waitFor();
      assert.equal(await section.getByRole('link', { name: 'Download settings', exact: true }).getAttribute('href'), '/settings/downloads');
      assert.equal(await section.getByText('Configuration not read').count(), 0);
      assert.equal(await section.getByText('No media library uses CloudDrive yet.').count(), 0);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });
});
