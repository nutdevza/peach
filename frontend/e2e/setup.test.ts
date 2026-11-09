/* The first-run page's whole flow: load, fill wrong, write back in place, correct it, completion state.
 *
 * Runs on `peach serve --setup`, not the configured server the routing smoke tests use: the service and temporary Peach data
 * directory are prepared by `SetupE2ETests` in `tests/test_web_e2e.py` and passed in via PEACH_E2E_SETUP_ORIGIN,
 * PEACH_E2E_SETUP_DATA (the temporary Peach data directory) and PEACH_E2E_SETUP_MEDIA (a pre-created empty media directory).
 * This file is run by the first-run-only entry; run standalone without those variables, the whole group skips. */
import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, layout, VIEWPORTS } from './harness.ts';

const origin = process.env.PEACH_E2E_SETUP_ORIGIN ?? '';
const media = process.env.PEACH_E2E_SETUP_MEDIA ?? '';
const dataRoot = process.env.PEACH_E2E_SETUP_DATA ?? '';

/** The 400 from the wrong-fill round is expected: Chrome records it as both a console error and a 4xx response. */
const expectedRejection = (problem: string) =>
  problem === '400 /api/setup' || problem === '400 /api/setup/restore'
  || problem.startsWith('console Failed to load resource: the server responded with a status of 400');

describe('First-run page', { skip: origin && media && dataRoot ? false : 'Runs only against the first-boot service started by SetupE2ETests' }, () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  it('Invalid input writes back in place, and correcting it enters the done state', { timeout: 120_000 }, async () => {
    const viewport = VIEWPORTS.find((candidate) => candidate.name === 'desktop')!;
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const problems: string[] = [];
    try {
      const page: Page = await context.newPage();
      page.on('pageerror', (error) => problems.push(`pageerror ${error.message}`));
      page.on('console', (message) => { if (message.type() === 'error') problems.push(`console ${message.text()}`); });
      page.on('response', (response) => {
        if (response.url().startsWith(origin) && response.status() >= 400) {
          problems.push(`${response.status()} ${response.url().slice(origin.length)}`);
        }
      });
      await page.goto(`${origin}/?edit`, { waitUntil: 'load' });
      const editor = page.getByRole('group', { name: 'Copy editing' });
      await editor.waitFor({ state: 'visible' });
      for (const size of VIEWPORTS.filter(candidate => ['desktop', 'mobile'].includes(candidate.name))) {
        await page.setViewportSize({ width: size.width, height: size.height });
        assert.equal(await editor.evaluate(element => getComputedStyle(element).position), 'fixed');
        assert.equal(await editor.getByRole('button', { name: 'Pause editing' }).evaluate(element => getComputedStyle(element).height), '36px');
        const bounds = await editor.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= size.width && bounds.y + bounds.height <= size.height);
      }
      await page.getByRole('button', { name: 'Exit editing' }).click();
      await page.waitForURL(`${origin}/`);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Loading: the form appears once all fields arrive, the waiting state ends, and the page does not overflow horizontally.
      const heading = page.getByRole('heading', { name: 'Welcome to Peach' });
      await heading.waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByRole('button', { name: 'Start setup', exact: true }).click();
      const folder = page.getByRole('textbox', { name: 'Media directory 1' });
      await folder.waitFor({ state: 'visible', timeout: 15_000 });
      assert.equal(await folder.inputValue(), '', 'Media directory filled in by the user');
      await page.getByRole('button', { name: 'My media library, source color: none', exact: true }).click();
      const paints = await page.locator('[data-library-colors] [data-accent-ball]').evaluateAll(elements =>
        elements.map(element => getComputedStyle(element).backgroundImage));
      assert.equal(new Set(paints).size, 12, 'The source palette shows twelve distinct colors');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('textbox', { name: 'Path prefix in the database' }).count(), 0,
        'Ordinary first-time setup never requires the internal path');
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 15_000 });
      const host = page.getByRole('radiogroup');
      assert.equal(await host.count(), 0, 'Access scope is presented in a later step');
      assert.equal(await page.getByRole('checkbox', { name: 'Next, import browser history' }).count(), 0);
      // The data directory decides which disk gets used; it shows on the first screen with a button to pick a folder.
      // Where files land follows the service process's PEACH_DATA_ROOT; anything that is not the temporary Peach data directory is not committed further.
      assert.equal(await page.locator('#f-data_root').inputValue(), dataRoot);
      await page.getByRole('button', { name: 'Choose the data directory' }).waitFor({ state: 'visible' });
      assert.deepEqual((await layout(page)).offenders, []);

      await folder.fill(join(media, 'missing'));
      const selectedData = join(dataRoot, 'custom-data');
      await page.locator('#f-data_root').fill(selectedData);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const proxyMode = page.locator('[aria-labelledby="setup-proxy-title"] button[aria-haspopup="listbox"]');
      await proxyMode.scrollIntoViewIfNeeded();
      await proxyMode.focus();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await proxyMode.click();
      await page.getByRole('option', { name: 'Custom', exact: true }).waitFor();
      await page.getByRole('option', { name: 'Custom', exact: true }).click();
      await page.locator('[data-trigger="Select"]').waitFor({ state: 'detached' });
      const proxy = page.getByLabel('Proxy address', { exact: true });
      await proxy.fill('http://proxy.invalid');
      const mobileForm = VIEWPORTS.find((candidate) => candidate.name === 'mobile')!;
      await page.setViewportSize({ width: mobileForm.width, height: mobileForm.height });
      assert.deepEqual((await layout(page)).offenders, []);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // React Aria's native input is visually hidden and clicks land on the drawn switch outside it, so the value is set from state.

      // Bad input: directory does not exist, port out of range.
      const missing = join(media, 'missing');
      await page.getByRole('switch', { name: 'Access password' }).setChecked(false, { force: true });
      await page.getByText('Advanced settings', { exact: true }).click();
      const port = page.locator('#f-port');
      await port.waitFor({ state: 'visible' });
      const defaultPort = await port.inputValue();
      await port.fill('70000');
      // The collapse starts closed and opens by itself when validation fails.
      await page.getByText('Advanced settings', { exact: true }).click();
      await port.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('checkbox', { name: /^完成设置后扫描/ }).setChecked(false, { force: true });

      const rejected = page.waitForResponse((response) => response.url().endsWith('/api/setup')
        && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Finish setup' }).click();
      assert.equal((await rejected).status(), 400);

      // Write-back: the directory row and the port each flagged separately, advanced settings expanded, entered values intact, focus on the first error.
      await page.waitForFunction(() => document.querySelectorAll('input[aria-invalid="true"]').length >= 2);
      assert.equal(await folder.getAttribute('aria-invalid'), 'true');
      assert.equal(await folder.inputValue(), missing);
      await page.getByText(/目录不存在/).first().waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Media directory 1');
      await folder.fill(media);
      await page.locator('#f-data_root').fill(selectedData);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await port.waitFor({ state: 'visible' });
      assert.equal(await port.getAttribute('aria-invalid'), 'true');
      assert.equal(await port.inputValue(), '70000');
      assert.equal(await proxy.getAttribute('aria-invalid'), 'true');
      assert.equal(await proxy.inputValue(), 'http://proxy.invalid');
      await page.getByText('Enter an HTTP or SOCKS proxy address with a port', { exact: true }).waitFor({ state: 'visible' });
      await page.getByText('The port must be an integer between 1 and 65535').waitFor({ state: 'visible' });

      // Edited correctly: existing directory, default port, no scanning.
      await port.fill(defaultPort);
      await proxy.fill('socks5h://user:private-proxy@127.0.0.1:17890');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const accepted = page.waitForResponse((response) => response.url().endsWith('/api/setup')
        && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Finish setup' }).click();
      const acceptedResponse = await accepted;
      assert.equal(acceptedResponse.status(), 200, await acceptedResponse.text());
      assert.deepEqual(JSON.parse(await readFile(join(selectedData, 'secrets/follow/peach-proxy.json'), 'utf8')), {
        mode: 'proxy', proxy: 'socks5h://user:private-proxy@127.0.0.1:17890',
      });

      // Completed state: the entry link has focus, no scan is queued, run info is collapsed, and the passcode is not on the page.
      await page.getByRole('heading', { name: 'You are ready to go' }).waitFor({ state: 'visible' });
      assert.equal((await page.content()).includes('private-proxy'), false);
      const entry = page.getByRole('link', { name: 'Enter Peach' });
      await entry.waitFor({ state: 'visible' });
      assert.ok(await entry.evaluate((element) => element === document.activeElement), 'The entry link receives focus');
      assert.match((await entry.getAttribute('href')) ?? '', /^https?:\/\//);
      await page.getByText('Start scanning the library later from the configuration page.').waitFor({ state: 'visible' });
      assert.equal(await page.title(), 'Peach · Setup complete');
      assert.deepEqual((await layout(page)).offenders, []);
      await page.getByText('Runtime info', { exact: true }).click();
      await page.getByText(selectedData, { exact: true }).waitFor({ state: 'visible' });
      const mobile = VIEWPORTS.find((candidate) => candidate.name === 'mobile')!;
      await page.setViewportSize({ width: mobile.width, height: mobile.height });
      assert.deepEqual((await layout(page)).offenders, []);

      // The existing-data-directory entry stays usable on the first-run page; when the config cannot be found, the path is kept and the reason explained.
      const originalConfig = await readFile(join(selectedData, 'config.toml'));
      await unlink(join(dataRoot, 'state', 'data-root.txt'));
      await page.reload({ waitUntil: 'load' });
      await page.getByRole('button', { name: 'Use existing data', exact: true }).click();
      const existing = page.getByRole('textbox', { name: 'Existing data directory' });
      await existing.fill(join(dataRoot, 'missing'));
      const restoreRejected = page.waitForResponse((response) => response.url().endsWith('/api/setup/restore'));
      await page.getByRole('button', { name: 'Use this folder', exact: true }).click();
      assert.equal((await restoreRejected).status(), 400);
      await page.getByRole('alert').filter({ hasText: 'config.toml' }).waitFor({ state: 'visible' });
      assert.deepEqual((await layout(page)).offenders, []);
      await existing.fill(selectedData);
      const restoreAccepted = page.waitForResponse((response) => response.url().endsWith('/api/setup/restore'));
      await page.getByRole('button', { name: 'Use this folder', exact: true }).click();
      assert.equal((await restoreAccepted).status(), 200);
      await page.getByText('Connected to the existing data directory.', { exact: true }).waitFor({ state: 'visible' });
      assert.equal(await readFile(join(dataRoot, 'state', 'data-root.txt'), 'utf8'), selectedData);
      assert.deepEqual(await readFile(join(selectedData, 'config.toml')), originalConfig);
      assert.deepEqual((await layout(page)).offenders, []);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      assert.deepEqual((await layout(page)).offenders, []);

      assert.deepEqual(problems.filter((problem) => !expectedRejection(problem)), []);
    } finally {
      await context.close();
    }
  });
});
