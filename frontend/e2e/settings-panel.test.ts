/* Settings panel (the `settings-panel` island, ADR-0031): open/close and focus, and every settings category taking effect immediately on change and landing where it belongs.
 * Write API stubs in `settings-fixture.ts`; the panel's layout and pixels are measured by `design-settings.test.ts`; only behavior is written here. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, BrowserContext, Page } from 'playwright-core';

import { launch, layout, requiredEnv, settle, visit, VIEWPORTS } from './harness.ts';
import { openHome, openPanel, ORDER, PANEL, stubServer, type Server } from './settings-fixture.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const MOBILE = VIEWPORTS.find((viewport) => viewport.mobile)!;

/** Wait until the condition holds, at most five seconds. */
async function until(page: Page, condition: () => boolean, message: string): Promise<void> {
  for (let tries = 0; tries < 100 && !condition(); tries += 1) await page.waitForTimeout(50);
  assert.ok(condition(), message);
}

/** Waits until `path` receives a write carrying `key`, then returns that request body. */
async function posted(page: Page, server: Server, path: string, key: string): Promise<Record<string, unknown>> {
  const find = () => server.posts.find((post) => post.path === path && key in post.body);
  await until(page, () => !!find(), `${path} received no write for ${key}`);
  return find()!.body;
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('peach.settings.v1') || '{}'));

async function pick(page: Page, field: string, value: string): Promise<void> {
  await page.locator(`${field} [data-select-trigger]`).click();
  await page.locator(`${field} [data-select-option="${value}"]`).click();
}

/** Builds its own context: the initial settings are written once, only when missing locally, and survive a refresh. */
async function persistentContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height }, reducedMotion: 'reduce', colorScheme: 'light',
  });
  await context.addInitScript(() => {
    if (!localStorage.getItem('peach.settings.v1')) {
      localStorage.setItem('peach.settings.v1', JSON.stringify({ detailAutoplay: false }));
    }
  });
  return context;
}

describe('Settings panel', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });

  it('The persistent annotation switch never auto-loads tools, and explicit enabling applies only to the current page', { timeout: 60_000 }, async () => {
    let loads = 0;
    const opened = await visit(browser, '/', DESKTOP, async (page) => {
      await page.addInitScript(() => localStorage.setItem('peach.agentation', 'on'));
      await page.route('**/dev/agentation.js', (route) => {
        loads += 1;
        return route.fulfill({ contentType: 'application/javascript', body: 'document.body.dataset.annotationTool = "ready";' });
      });
    });
    const { page } = opened;
    try {
      await page.waitForFunction(() => localStorage.getItem('peach.agentation') === null);
      assert.equal(loads, 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('peach.agentation')), null);
      await page.goto(`${requiredEnv('PEACH_E2E_ORIGIN')}/?agentation=on`);
      await page.waitForFunction(() => document.body.dataset.annotationTool === 'ready');
      assert.equal(loads, 1);
      assert.equal(new URL(page.url()).searchParams.has('agentation'), false);
      await page.reload();
      await page.locator('#settingsBtn').waitFor({ state: 'attached' });
      await settle(page);
      assert.equal(loads, 1);
      assert.equal(await page.evaluate(() => document.body.dataset.annotationTool), undefined);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('The five preference sections each show their own settings, and Peach configuration links straight to the configuration page', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page } = opened;
    try {
      await openPanel(page);
      assert.deepEqual(await page.locator(PANEL).getByRole('tab').allTextContents(),
        ['Appearance & navigation', 'Browsing & playback', 'JAV & new releases', 'Search & recommendations', 'Content display']);
      for (const [name, field] of [
        ['Appearance & navigation', '#themeSetting'], ['Browsing & playback', '#detailAutoplaySetting'],
        ['JAV & new releases', '#javImageSetting'], ['Search & recommendations', '#relatedLimitSetting'], ['Content display', '#censorSetting'],
      ]) {
        await page.locator(PANEL).getByRole('tab', { name, exact: true }).click();
        await page.locator(field!).waitFor({ state: 'visible' });
        assert.deepEqual((await layout(page)).offenders, []);
      }
      assert.equal(await page.locator(`${PANEL} #videoThumbnailSetting, ${PANEL} #followScheduleSetting`).count(), 0);
      const configuration = page.locator(PANEL).getByRole('button', { name: 'Peach configuration', exact: true });
      await configuration.click();
      await page.waitForURL((url) => url.pathname === '/settings/library');
      await page.locator(PANEL).waitFor({ state: 'hidden' });
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('The gear opens it, and the close button and Escape close it; focus lands on the close button, Tab cycles within the panel, and closing returns focus to the gear', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page } = opened;
    try {
      await page.locator('#settingsBtn').click();
      await page.locator(`${PANEL}:not([hidden])`).waitFor({ timeout: 10_000 });
      await page.waitForFunction(() => document.activeElement?.id === 'settingsClose');
      assert.equal(await page.locator(PANEL).getAttribute('aria-modal'), 'true');
      assert.equal(await page.evaluate(() => document.body.classList.contains('settings-open')), true);

      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate((panel) => !!document.activeElement?.closest(panel), PANEL), true,
        'Tabbing back from the first one left the panel');
      assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'settingsClose', 'Tabbing back never landed on the last one');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'settingsClose', 'Tabbing forward from the last one never returned to the first');

      await page.locator('#settingsClose').click();
      await page.locator(PANEL).waitFor({ state: 'hidden', timeout: 5_000 });
      await page.waitForFunction(() => document.activeElement?.id === 'settingsBtn');
      assert.equal(await page.evaluate(() => document.body.classList.contains('settings-open')), false);

      await page.locator('#settingsBtn').click();
      await page.locator(`${PANEL}:not([hidden])`).waitFor({ timeout: 10_000 });
      await page.keyboard.press('Escape');
      await page.locator(PANEL).waitFor({ state: 'hidden', timeout: 5_000 });
      await page.waitForFunction(() => document.activeElement?.id === 'settingsBtn');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Choosing dark theme applies on the spot and stays dark after refresh', { timeout: 60_000 }, async () => {
    const context = await persistentContext(browser);
    try {
      const page = await context.newPage();
      await stubServer(page);
      await page.goto(`${requiredEnv('PEACH_E2E_ORIGIN')}/`, { waitUntil: 'load' });
      await settle(page);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false);
      await openPanel(page);
      await page.locator('#themeSetting label:has(input[value="dark"])').click();
      await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
      assert.equal((await stored(page)).theme, 'dark');

      await page.reload({ waitUntil: 'load' });
      await settle(page);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'Theme not kept after refresh');
      await openPanel(page);
      assert.equal(await page.locator('#themeSetting input[value="dark"]').isChecked(), true, 'After refresh the panel selection is not the dark one');
    } finally {
      await context.close();
    }
  });

  it('The changed SFW shortcut works by physical key; the original Shift+S no longer toggles', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const page = opened.page;
      const censored = () => page.evaluate(() => document.body.classList.contains('censor'));
      await page.evaluate(() => localStorage.setItem('peach.sfw-shortcut', 'Alt+KeyH'));
      await page.reload({ waitUntil: 'load' });
      await settle(page);
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await page.keyboard.press('Shift+S');
      assert.equal(await censored(), false);
      await page.keyboard.press('Alt+KeyH');
      assert.equal(await censored(), true);
      await openPanel(page);
      await page.locator(PANEL).getByRole('tab', { name: 'Content display', exact: true }).click();
      assert.equal(await page.locator(`${PANEL} [data-shortcut-keys]`).innerText(), 'Alt+H');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('Shift+S toggles SFW on the page and remembers it; it does not toggle inside the input box', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const page = opened.page;
      const censored = () => page.evaluate(() => document.body.classList.contains('censor'));
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await page.keyboard.press('Shift+S');
      assert.equal(await censored(), true);
      assert.equal(await page.evaluate(() => localStorage.getItem('peach-censor')), '1');
      await page.keyboard.press('Shift+S');
      assert.equal(await censored(), false);
      await page.locator('#q').focus();
      await page.keyboard.press('Shift+S');
      assert.equal(await censored(), false, 'Typing a capital S in the search box should not toggle SFW');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('With UI sounds off, taps go silent; turning them on brings the sound back', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    try {
      /* Every sound builds a fresh oscillator or noise source; counting them tells whether it sounded. */
      await page.context().addInitScript(() => {
        const counted = window as unknown as { __uiTones: number };
        counted.__uiTones = 0;
        for (const method of ['createOscillator', 'createBufferSource'] as const) {
          const native = AudioContext.prototype[method];
          AudioContext.prototype[method] = function (this: AudioContext) {
            counted.__uiTones += 1;
            return native.call(this);
          } as never;
        }
      });
      await stubServer(page);
      await page.reload({ waitUntil: 'load' });
      await settle(page);
      await openPanel(page);
      const tones = () => page.evaluate(() => (window as unknown as { __uiTones: number }).__uiTones);
      const box = page.locator('#uiSoundsSetting');
      assert.equal(await box.isChecked(), true, 'Interface sounds default to off');
      await box.click();
      assert.equal(await box.isChecked(), false);
      assert.equal((await stored(page)).uiSounds, false);
      const silent = await tones();
      await page.locator(PANEL).getByRole('tab', { name: 'Browsing & playback', exact: true }).click();
      await page.locator(PANEL).getByRole('tab', { name: 'Appearance & navigation', exact: true }).click();
      assert.equal(await tones(), silent, 'After turning interface sounds off, clicking sections still beeps');
      await box.click();
      assert.equal((await stored(page)).uiSounds, true);
      await page.locator(PANEL).getByRole('tab', { name: 'Browsing & playback', exact: true }).click();
      assert.ok(await tones() > silent, 'After turning interface sounds on, clicking sections stays silent');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Glow presets swap on one click; arrow keys nudge slider params and persist them', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page } = opened;
    try {
      await openPanel(page);
      const grid = page.locator('#homeGlowControls [data-glow-grid]');
      await grid.waitFor({ state: 'visible', timeout: 10_000 });
      const target = grid.locator('[data-glow-preset][aria-pressed="false"]').first();
      const key = await target.getAttribute('data-glow-preset');
      const label = await target.getAttribute('aria-label');
      await target.click();
      await page.waitForFunction((preset) => document.querySelector(
        `#homeGlowControls [data-glow-preset="${preset}"]`)?.getAttribute('aria-pressed') === 'true', key);
      assert.equal(await page.locator('#homeGlowControls [data-glow-preset-name]').textContent(), label);
      assert.equal((await stored(page)).homeGlow.preset, key);

      /* The 'Glass original' preset hides the intensity control; pick a preset with three glows, then adjust intensity. */
      if (await page.locator('[data-glow-field="strength"]').isHidden()) {
        await grid.locator('[data-glow-preset="ash"]').click();
      }
      const dial = page.locator('[data-glow-dial="strength"] [role="slider"]');
      const before = Number(await dial.getAttribute('aria-valuenow'));
      await dial.focus();
      await page.keyboard.press(before > 0 ? 'ArrowLeft' : 'ArrowRight');
      const expected = before > 0 ? before - 1 : before + 1;
      await page.waitForFunction((value) => document.querySelector(
        '[data-glow-dial="strength"] [role="slider"]')?.getAttribute('aria-valuenow') === String(value), expected);
      assert.equal((await stored(page)).homeGlow.strength, expected, 'The slider\'s intensity change never persisted');

      await page.locator('#homeGlowSetting').click();
      await page.locator('#homeGlowControls').waitFor({ state: 'hidden', timeout: 5_000 });
      assert.equal((await stored(page)).homeGlow.on, false);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('JAV default cover and default sort direction persist after change; the direction control collapses under random sort', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page } = opened;
    try {
      await openPanel(page, 'JAV & new releases');
      await page.locator('#javImageSetting label:has(input[value="thumbnail"])').click();
      assert.equal((await stored(page)).javImage, 'thumbnail');
      assert.equal(await page.locator('#javImageSetting input[value="thumbnail"]').isChecked(), true);

      await page.locator(PANEL).getByRole('tab', { name: 'Browsing & playback', exact: true }).click();
      await pick(page, '#defaultSortSetting', 'seed');
      await page.locator('#defaultSortDirectionSetting').waitFor({ state: 'hidden', timeout: 5_000 });

      await pick(page, '#defaultSortSetting', 'rating');
      await page.locator('#defaultSortDirectionSetting').waitFor({ state: 'visible', timeout: 5_000 });
      await pick(page, '#defaultSortDirectionSetting', 'asc');
      await page.waitForFunction(() =>
        document.querySelector('#defaultSortDirectionSetting [data-sort-direction-label]')?.textContent === 'Ascending');
      const saved = await stored(page);
      assert.equal(saved.defaultSort, 'rating');
      assert.equal(saved.defaultSortDirection, 'asc');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Dragging a row in sidebar order: the sidebar reorders on the spot, then writes to the database', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page, server } = opened;
    try {
      await openPanel(page);
      const list = page.locator('#sidebarOrderSetting');
      await list.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      const rows = list.locator('[data-sidebar-row]');
      const keys = () => rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-sidebar-row')));
      const initial = await keys();
      assert.deepEqual(initial, ORDER, 'The panel\'s order is not the database\'s copy');
      const from = (await rows.nth(1).boundingBox())!, to = (await rows.nth(3).boundingBox())!;
      await page.mouse.move(from.x + 30, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 34, from.y + from.height / 2 + 6, { steps: 4 });
      await page.mouse.move(to.x + 40, to.y + to.height * 0.75, { steps: 8 });
      assert.equal(await rows.nth(1).getAttribute('data-dragging'), '', 'The row being dragged is not marked');
      await page.mouse.up();
      const moved = [initial[0], initial[2], initial[3], initial[1], ...initial.slice(4)];
      await page.waitForFunction((want) => JSON.stringify([...document.querySelectorAll(
        '#sidebarOrderSetting [data-sidebar-row]')].map((node) => node.getAttribute('data-sidebar-row'))) === want,
      JSON.stringify(moved));
      const nav = await page.locator('#drawer [data-sidebar-nav] [data-nav]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-nav')));
      assert.deepEqual(nav, moved, 'The sidebar never reordered to the panel\'s new order');
      assert.deepEqual((await posted(page, server, '/api/settings', 'sidebarOrder')).sidebarOrder, moved);
      assert.deepEqual((await stored(page)).sidebarOrder, moved);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it(`Mobile at ${MOBILE.width} wide: the panel fills without horizontal overflow, and sections lay out in a row and switch`, { timeout: 60_000 }, async () => {
    const opened = await openHome(browser, MOBILE);
    const { page } = opened;
    try {
      await openPanel(page);
      const geometry = await layout(page);
      assert.ok(geometry.scrollWidth <= geometry.viewportWidth, `The page overflows horizontally: ${geometry.scrollWidth}px`);
      assert.deepEqual(geometry.offenders, []);
      const card = (await page.locator(`${PANEL} [data-settings-card]`).boundingBox())!;
      assert.ok(card.x >= 0 && card.x + card.width <= MOBILE.width, 'Settings card overflows the viewport');
      const tops = await page.locator(PANEL).getByRole('tab').evaluateAll((nodes) =>
        nodes.slice(0, 3).map((node) => Math.round(node.getBoundingClientRect().top)));
      assert.equal(new Set(tops).size, 1, 'Sections not laid out in a row on narrow screens');
      await page.locator(PANEL).getByRole('tab', { name: 'JAV & new releases', exact: true }).click();
      await page.locator('#javImageSetting').waitFor({ state: 'visible', timeout: 5_000 });
      assert.deepEqual((await layout(page)).offenders, []);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });
});
