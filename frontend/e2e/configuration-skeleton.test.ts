import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { configurationBody, expectBody, launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

const measure = (page: Page, names = ['Library and catalog']) => page.locator('.ui-configpage').evaluate((root, names) => {
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const sections = names.map(name => root.querySelector(`[aria-label="${name}"]`)!);
  return {
    nav: rect(root.querySelector('.ui-board-local-nav')!),
    selected: root.querySelector('.ui-board-local-nav [aria-selected="true"]')?.textContent,
    sections: sections.map(section => ({
      label: rect(section.firstElementChild!),
      card: rect(section.lastElementChild!),
      // The save key sits in the card footer, taken as the section's last button: the Select trigger is a button too.
      save: rect([...section.querySelectorAll('button')].at(-1)!),
    })),
  };
}, names);

async function openEditableConfiguration(browser: Browser, viewport: (typeof VIEWPORTS)[number]) {
  const opened = await visit(browser, '/', viewport);
  try {
    // Each case reads a real config snapshot before navigating; page waits and takeover are controlled by a response latch.
    const response = await opened.page.request.get(new URL('/api/configuration', opened.page.url()).href);
    assert.equal(response.status(), 200);
    const configuration = await response.json();
    await opened.page.route('**/api/configuration', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: { ...configuration, editable: true } });
    });
    await opened.page.goto(new URL('/settings/library', opened.page.url()).href, { waitUntil: 'load' });
    return { ...opened, configuration };
  } catch (error) {
    await opened.close();
    throw error;
  }
}

describe('Configuration page pending state', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name} category navigation adapts to direction and keeps unsaved input`, { timeout: 60_000 }, async () => {
      const opened = await openEditableConfiguration(browser, viewport);
      try {
        const { page } = opened;
        await expectBody(page, '/settings/library', configurationBody(page));
        await settle(page);
        const nav = page.getByRole('tablist', { name: 'Configuration section' });
        assert.equal(await nav.getAttribute('aria-orientation'), viewport.mobile ? 'horizontal' : 'vertical');
        const geometry = await measure(page);
        assert.ok(viewport.mobile
          ? geometry.nav.y + geometry.nav.height <= geometry.sections[0].label.y
          : geometry.nav.x + geometry.nav.width <= geometry.sections[0].label.x);
        await nav.getByRole('tab', { name: 'Sources and subscriptions', exact: true }).click();
        // After switching to another tab, the panel holding this field is hidden but the value stays in place.
        const input = page.getByRole('textbox', { name: 'JavDB URL', exact: true, includeHidden: true });
        await input.fill('example.invalid');
        const general = nav.getByRole('tab', { name: 'Library and imports', exact: true });
        await general.click();
        await page.keyboard.press('ArrowRight');
        assert.equal(await nav.getByRole('tab', { name: 'Sources and subscriptions', exact: true }).getAttribute('aria-selected'), 'true');
        await page.keyboard.press('End');
        assert.equal(await nav.getByRole('tab', { name: 'System diagnostics' }).getAttribute('aria-selected'), 'true');
        await page.keyboard.press('Home');
        assert.equal(await input.inputValue(), 'example.invalid');
        const bounds = await layout(page);
        assert.ok(bounds.scrollWidth <= bounds.viewportWidth);
        assert.deepEqual(bounds.offenders, []);
        await page.setViewportSize({ width: viewport.mobile ? 1280 : 390, height: 844 });
        await page.waitForFunction(expected => document.querySelector('[role="tablist"][aria-label="Configuration sections"]')?.getAttribute('aria-orientation') === expected,
          viewport.mobile ? 'vertical' : 'horizontal');
        assert.equal(await general.getAttribute('aria-selected'), 'true');
        assert.equal(await input.inputValue(), 'example.invalid');
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
    it(`${viewport.name} category nav and media titles keep their position at takeover`, { timeout: 60_000 }, async () => {
      const opened = await openEditableConfiguration(browser, viewport);
      let release = () => {};
      try {
        await expectBody(opened.page, '/settings/library', configurationBody(opened.page));
        await settle(opened.page);
        const pending = new Promise<void>(resolve => { release = resolve });
        await opened.page.route('**/api/configuration', async route => {
          if (route.request().method() !== 'GET') return route.continue();
          await pending;
          await route.fulfill({ json: { ...opened.configuration, editable: true, startup: {
            available: true, enabled: true, silent: true, desktop: true, desktop_message: '', message: '',
          }, automatic_updates: { mode: 'check', interval_hours: 24, available: true, download_available: false } } });
        });
        await opened.page.reload({ waitUntil: 'load' });
        await opened.page.locator('[data-skeleton="board/settings/library"]').waitFor();
        const skeleton = await measure(opened.page);
        const waitingLayout = await layout(opened.page);
        release();
        await expectBody(opened.page, '/settings/library', configurationBody(opened.page));
        await settle(opened.page);
        const live = await measure(opened.page);
        assert.equal(skeleton.selected, live.selected);
        const pairs = [[skeleton.nav, live.nav], ...skeleton.sections.map((section, i) =>
          [section.label, live.sections[i].label])];
        for (const [a, b] of pairs) for (const key of ['x', 'y', 'width', 'height'] as const) {
          assert.ok(Math.abs(a[key] - b[key]) <= 1, `${key}: skeleton=${a[key]}, content=${b[key]}`);
        }
        assert.ok(waitingLayout.scrollWidth <= waitingLayout.viewportWidth);
        assert.deepEqual(waitingLayout.offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally {
        release();
        await opened.close();
      }
    });
  }
  /* Sources and subscriptions have four sections that fetch data separately: the whole-page skeleton, section skeletons, and the post-read final states draw the same structure, and the source credentials' site rows come from static registration, with row counts matching the final state. Small position and height deviations are allowed, but displacement over one row (40px) is not.
     Both cases are tested: no local record (cold start) and a normal reopen; config-dependent parts draw at minimal structure on cold start. */
  for (const cold of [true, false]) it(`The sources and subscriptions full-page skeleton and section skeleton match the read-back section structure within one row of offset (${cold ? 'no local record' : 'reopened'})`, { timeout: 90_000 }, async () => {
    const opened = await visit(browser, '/settings/subscriptions', VIEWPORTS[0]);
    let release = () => {};
    let mount = () => {};
    try {
      const { page } = opened;
      const names = ['Source credentials', 'Follows scrape', 'Resource search', 'Video profile sites'];
      /* While the skeleton fades out, an old and a new `.ui-configpage` can coexist: take the one mounted last. */
      const sections = () => page.locator('.ui-configpage').last().evaluate((root, names) => names.map((name) => {
        const section = root.querySelector(`[aria-label="${name}"]`);
        if (!section) return null;
        const r = section.getBoundingClientRect();
        return { name, y: r.y, height: r.height, sites: section.querySelectorAll('b').length };
      }), names);
      const done = () => page.waitForFunction(() => document.querySelector('.ui-configpage section[aria-label="Source credentials"]')
        && !document.querySelector('.ui-configpage [data-skeleton]'), null, { timeout: 30_000 });
      await done();
      await settle(page);
      if (cold) await page.evaluate(() => localStorage.removeItem('peach.configuration.shape.v1'));
      /* Two gates: a full-page skeleton before the config is read back, then a section skeleton while the config is through but the section's own data is still pending. */
      const configuration = new Promise<void>((resolve) => { mount = resolve });
      const held = new Promise<void>((resolve) => { release = resolve });
      await page.route('**/api/configuration', async (route) => { await configuration; await route.continue() });
      for (const url of ['**/api/follow/credentials', '**/api/configuration/indexers', '**/api/follow/schedule', '**/api/feeds/schedule']) {
        await page.route(url, async (route) => { await held; await route.continue() });
      }
      await page.reload({ waitUntil: 'commit' });
      await page.locator('[data-skeleton="board/settings/subscriptions"]').waitFor();
      const pageSkeleton = await sections();
      mount();
      await page.getByLabel('Reading source credentials', { exact: true }).waitFor();
      const sectionSkeleton = await sections();
      release();
      await done();
      await settle(page);
      const live = await sections();
      for (const [phase, shape] of [['Full-page skeleton', pageSkeleton], ['Section skeleton', sectionSkeleton]] as const) {
        shape.forEach((section, i) => {
          const end = live[i]!;
          assert.ok(section && Math.abs(section.y - end.y) <= 40 && Math.abs(section.height - end.height) <= 40,
            `${phase} "${names[i]}" ${JSON.stringify(section)}, after read-back ${JSON.stringify(end)}`);
        });
        assert.equal(shape[0]!.sites, live[0]!.sites, `${phase} source credential site rows`);
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      mount();
      release();
      await opened.close();
    }
  });
  for (const path of ['/settings/library', '/review']) {
    it(`The ${path} light/dark theme uses a transparent container and gray Pills selected background`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, path, VIEWPORTS[0]);
      try {
        const { page } = opened;
        const nav = page.locator('#stats [data-section-nav]:not([data-skeleton] *)');
        await nav.locator('[aria-selected=true]').waitFor();
        await settle(page);
        if (path === '/review') {
          assert.equal(await nav.getByRole('heading', { name: 'Review classification' }).count(), 1);
          assert.equal(await nav.getByRole('tablist').getAttribute('aria-orientation'), 'vertical');
        }
        for (const dark of [false, true]) {
          await page.evaluate(dark => {
            document.documentElement.dataset.theme = dark ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', dark);
          }, dark);
          const colors = await nav.evaluate(node => {
            const selected = getComputedStyle(node.querySelector('[aria-selected=true]')!);
            const selection = getComputedStyle(node.querySelector('[data-pill-thumb]')!);
            const inactive = getComputedStyle(node.querySelector('[aria-selected=false]')!);
            return {
              surface: getComputedStyle(node).backgroundColor,
              selected: selection.backgroundColor,
              border: selected.borderWidth,
              radius: selection.borderRadius,
              text: selected.color,
              inactive: inactive.color,
              inactiveBackground: inactive.backgroundColor,
            };
          });
          assert.equal(colors.surface, 'rgba(0, 0, 0, 0)');
          assert.notEqual(colors.selected, 'rgba(0, 0, 0, 0)');
          assert.equal(colors.border, '0px');
          assert.notEqual(colors.radius, '0px');
          assert.notEqual(colors.text, colors.inactive);
          assert.equal(colors.inactiveBackground, 'rgba(0, 0, 0, 0)');
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
