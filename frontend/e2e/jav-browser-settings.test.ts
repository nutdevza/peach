import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

const SITES = JSON.parse(readFileSync(new URL('../../web/integrations/jav-sites.json', import.meta.url), 'utf8')).sites;
const SCRIPT = readFileSync(new URL('../../web/integrations/peach-jav.user.js', import.meta.url), 'utf8');
const RELEASE = JSON.parse(readFileSync(new URL('../../web/integrations/jav-userscript-release.json', import.meta.url), 'utf8'));
const USERSCRIPT = { version: RELEASE.version, minimum_version: RELEASE.bridge_min_version, install_url: RELEASE.install_url };

describe('Browser adds the JAV settings', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: enable, rotate, and revoke; the token shows only in the issuance response`, async () => {
      const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('Download channels'), viewport);
      const { page } = opened;
      try {
        let enabled = false;
        const posted: Record<string, unknown>[] = [];
        await page.route('**/api/configuration/jav-browser', async route => {
          const request = route.request();
          const state = { enabled, provider: '115', available: true, userscript: USERSCRIPT, sites: SITES, providers: [
            { key: '115', label: '115', configured: true, target: '/115/Movies' },
            { key: 'pikpak', label: 'PikPak', configured: true, target: '/Movies' },
          ] };
          if (request.method() === 'POST') {
            const body = request.postDataJSON();
            posted.push(body);
            enabled = body.action !== 'disable';
            await route.fulfill({ json: { ...state, enabled,
              ...(enabled ? { token: 'test-issued-token-' + posted.length } : {}) } });
          } else await route.fulfill({ json: state });
        });
        await page.reload();
        const region = page.getByRole('region', { name: 'Add JAV via browser', exact: true });
        const install = region.getByRole('link', { name: 'Install the Peach userscript' });
        await install.waitFor();
        const channel = region.locator('button[aria-haspopup="listbox"]');
        const installBox = await region.locator('[data-userscript-status]').boundingBox();
        const channelBox = await channel.boundingBox();
        assert.ok(installBox && channelBox && Math.abs(installBox.x - channelBox.x) <= 1,
          JSON.stringify({ installBox, channelBox }));
        assert.equal(await channel.locator('img').count(), 1);
        const status = region.locator('[data-userscript-status]').getByText('Not enabled', { exact: true }).or(
          region.locator('[data-userscript-status]').getByText('Enabled', { exact: true }));
        assert.equal(await status.innerText(), 'Not enabled');
        const statusColor = () => status.evaluate(node => getComputedStyle(node).color);
        const disabledColor = await statusColor();
        const themeColor = (token: string) => page.evaluate(token => {
          const sample = document.createElement('span');
          sample.style.color = `var(${token})`;
          document.querySelector('.peach-react')!.append(sample);
          const color = getComputedStyle(sample).color;
          sample.remove();
          return color;
        }, token);
        assert.equal(disabledColor, await themeColor('--color-text-secondary'));
        await channel.scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await channel.click();
        const pikpak = page.getByRole('option', { name: 'PikPak', exact: true });
        await pikpak.waitFor();
        const overflow = await page.getByRole('listbox').evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }));
        assert.ok(overflow.scroll <= overflow.width + 1, JSON.stringify(overflow));
        assert.equal(await pikpak.locator('img').count(), 1);
        const cloud115 = page.getByRole('option', { name: '115', exact: true });
        assert.equal(await cloud115.locator('img').count(), 1);
        await cloud115.click();
        await region.getByRole('button', { name: 'Enable and generate a token', exact: true }).click();
        const token = region.getByLabel('Dedicated token for browser adds', { exact: true });
        await token.waitFor();
        assert.equal(await status.innerText(), 'Enabled');
        assert.notEqual(await statusColor(), disabledColor);
        assert.equal(await statusColor(), await themeColor('--color-status-lime-text'));
        const channelLabelBox = await region.getByText('Browser-added download channels', { exact: true }).boundingBox();
        const channelFieldBox = await channel.boundingBox();
        assert.ok(channelLabelBox && channelFieldBox);
        const channelGap = channelFieldBox.y - channelLabelBox.y - channelLabelBox.height;
        const inputGaps = await region.locator('[data-input-size]').evaluateAll(fields => fields.map(field => {
          const label = field.querySelector('label')!;
          const control = label.nextElementSibling!;
          return control.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
        }));
        assert.equal(inputGaps.length, 2);
        assert.ok(inputGaps.every(gap => Math.abs(gap - channelGap) <= 0.5),
          JSON.stringify({ channelGap, inputGaps }));
        assert.equal(await token.inputValue(), 'test-issued-token-1');
        assert.equal(await token.getAttribute('type'), 'password');
        const refreshed = page.waitForResponse(response => response.url().endsWith('/api/configuration/jav-browser')
          && response.request().method() === 'GET');
        await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
        await refreshed;
        assert.equal(await token.inputValue(), 'test-issued-token-1');
        await page.evaluate(() => {
          const copied: string[] = [];
          Object.assign(window, { pairingClipboard: copied });
          Object.defineProperty(navigator, 'clipboard', { configurable: true,
            value: { writeText: async (value: string) => { copied.push(value); } } });
        });
        await region.getByRole('button', { name: 'Copy pairing info', exact: true }).click();
        const copied = await page.evaluate(() => (window as Window & { pairingClipboard: string[] }).pairingClipboard);
        assert.equal(copied.length, 1);
        assert.deepEqual(JSON.parse(copied[0]!), { peach_pairing: 1, base: new URL(page.url()).origin, token: 'test-issued-token-1' });
        assert.equal(await region.getByRole('link', { name: 'Install the Peach userscript' }).getAttribute('href'),
          USERSCRIPT.install_url);
        assert.equal(await region.getByLabel('Peach URL', { exact: true }).inputValue(), new URL(page.url()).origin);
        await region.getByRole('button', { name: 'Update channels and tokens', exact: true }).click();
        await page.waitForFunction(() => document.querySelector<HTMLInputElement>(
          'input[type="password"][value="test-issued-token-2"]') !== null);
        await region.getByRole('button', { name: 'Turn off browser adding', exact: true }).click();
        await token.waitFor({ state: 'detached' });
        assert.equal(await region.getByRole('button', { name: 'Copy pairing info', exact: true }).count(), 0);
        assert.equal(await status.innerText(), 'Not enabled');
        assert.equal(await statusColor(), disabledColor);
        assert.deepEqual(posted.map(body => body.action), ['enable', 'rotate', 'disable']);
        assert.ok(posted.every(body => body.provider === '115'));
        await settle(page);
        assert.ok((await layout(page)).scrollWidth <= viewport.width + 1);
        assert.deepEqual(opened.problems, []);
        await region.screenshot({ path: `../build/jav-browser-settings-${viewport.name}.png` });
      } finally { await opened.close(); }
    });
  }

  it('The bridge page still detects scripts with lazy loading, and unknown-source messages never change the verdict', async () => {
    const opened = await visit(browser, '/settings/library?section=' + encodeURIComponent('Download channels'), VIEWPORTS[0]!);
    const { page } = opened;
    try {
      await page.route('**/api/configuration/jav-browser', route => route.fulfill({ json: {
        enabled: true, provider: '115', available: true, userscript: USERSCRIPT,
        providers: [{ key: '115', label: '115', configured: true, target: '/Movies' }],
      } }));
      let installed = true;
      await page.route('**/integrations/peach-userscript-bridge', async route => {
        if (installed) await new Promise(resolve => setTimeout(resolve, 3500));
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="peach-userscript-bridge" content="1">'
          + (installed ? '<script>window.GM_getValue=(key,fallback)=>({"peach.jav.base":location.origin,"peach.jav.token":"test-only-stored-token"})[key]??fallback;</script><script>'
            + SCRIPT.replaceAll('</script', '<\\/script') + '</script>' : '') });
      });
      await page.reload();
      const region = page.getByRole('region', { name: 'Add JAV via browser', exact: true });
      const connection = region.locator('[data-userscript-status] [data-connection-tone]');
      await connection.getByText('Connected', { exact: true }).waitFor();
      assert.equal(await connection.getAttribute('data-connection-tone'), 'success');
      await region.getByText(`Userscript v${RELEASE.version}`, { exact: true }).waitFor();
      assert.equal(await region.getByRole('link', { name: 'Install the Peach userscript' }).count(), 0);
      assert.equal(await region.getByLabel('Dedicated token for browser adds', { exact: true }).count(), 0);
      installed = false;
      await region.getByRole('button', { name: 'Detect again', exact: true }).click();
      await connection.getByText('Not detected', { exact: true }).waitFor();
      assert.equal(await connection.getAttribute('data-connection-tone'), 'neutral');
      await page.evaluate(() => window.postMessage({ type: 'peach-userscript:ready', protocol: 1,
        version: '9.0.0', paired: true, nonce: crypto.randomUUID() }, location.origin));
      assert.equal(await connection.getByText('Not detected', { exact: true }).count(), 1);
      assert.equal(await region.getByRole('link', { name: 'Install the Peach userscript' }).count(), 1);
      assert.ok((await region.innerText()).includes('Allow user scripts'));
      assert.equal(await region.getByRole('link', { name: 'Tampermonkey permission setup notes' }).getAttribute('href'),
        'https://www.tampermonkey.net/faq.php#Q209');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });
});
