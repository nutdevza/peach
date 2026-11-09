/* Semantic styles for config and settings entries: icons, status alignment, primary versus secondary actions, and single-line entries. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { configurationBody, expectBody, layout, settle, visit, VIEWPORTS } from './harness.ts';
import { followCredential, installDesignBrowser, openActivity, openFollowManage, settledRun } from './design-fixture.ts';
import { openHome, openPanel, PANEL } from './settings-fixture.ts';

describe('Design decision: config controls', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });

  for (const viewport of VIEWPORTS) {
    it(`The source menu adapts to long options and is constrained by viewport width (${viewport.name})`, async () => {
      const opened = await openFollowManage(browser, viewport);
      try {
        const { page } = opened;
        for (const name of ['Rule34 Paheal / SubscribeStar.adult',
          'https://www.subscribestar.adult/creators/a-long-creator-display-name-without-spaces']) {
          await page.route('**/api/follow/credentials', route => route.fulfill({ json: {
            root: '', providers: [followCredential(name, 'none', false, [])],
          } }));
          await page.goto(new URL('/subscriptions?tab=add', page.url()).href, { waitUntil: 'load' });
          await page.getByRole('button', { name: 'All sources', exact: true }).click();
          const menu = page.getByRole('dialog', { name: 'Source filter', exact: true });
          assert.equal(await menu.getByRole('checkbox', { name, exact: true }).count(), 1);
          const fit = await menu.evaluate(element => {
            const label = element.querySelector('label')!;
            const box = element.getBoundingClientRect();
            return { right: box.right, left: box.left, width: box.width, viewport: innerWidth,
              scroll: label.scrollWidth, client: label.clientWidth, content: element.scrollWidth, frame: element.clientWidth };
          });
          assert.ok(fit.left >= 0 && fit.right <= fit.viewport, JSON.stringify(fit));
          assert.ok(fit.scroll <= fit.client + 1 && fit.content <= fit.frame + 1, JSON.stringify(fit));
          if (viewport.width > 1000) assert.ok(fit.width > 203, 'Long options should widen the menu');
          await page.keyboard.press('Escape');
        }
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`Source filter quick actions sit adjacent, with options near the trigger (${viewport.name})`, async () => {
      const opened = await openFollowManage(browser, viewport);
      try {
        const { page } = opened;
        await page.getByRole('tab', { name: 'Add follow', exact: true }).click();
        await page.getByRole('button', { name: 'All sources', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Source filter', exact: true });
        const geometry = await dialog.evaluate(element => {
          const actions = element.querySelector('[data-selection-actions]')!;
          const buttons = [...actions.querySelectorAll('button,a')].map(node => {
            const box = node.getBoundingClientRect();
            return { top: box.top, bottom: box.bottom, center: box.top + box.height / 2, left: box.left, right: box.right, width: box.width,
              scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
          });
          const options = element.querySelector('[data-selection-options]')!.getBoundingClientRect();
          const optionWidths = [...element.querySelectorAll('label')].map(label =>
            label.lastElementChild!.getBoundingClientRect().right - label.getBoundingClientRect().left);
          const actionWidth = buttons.reduce((sum, button) => sum + button.width, 0)
            + Math.max(0, buttons.length - 1) * parseFloat(getComputedStyle(actions).columnGap);
          return { actions: buttons, width: actions.getBoundingClientRect().width,
            contentWidth: element.getBoundingClientRect().width, naturalWidth: Math.max(actionWidth, ...optionWidths),
            placement: element.getAttribute('data-selection-placement'), optionTop: options.top, optionBottom: options.bottom,
            right: element.getBoundingClientRect().right, viewport: innerWidth };
        });
        assert.equal(geometry.actions.length, 3);
        assert.ok(Math.abs(geometry.contentWidth - geometry.naturalWidth) <= 1, 'The menu follows the wider of the options and action rows');
        assert.ok(geometry.actions.every(action => Math.abs(action.center - geometry.actions[0]!.center) <= 1));
        assert.ok(geometry.actions.every(action => (geometry.placement === 'top'
          ? action.bottom <= geometry.optionTop : action.top >= geometry.optionBottom) && action.width < geometry.width));
        assert.ok(geometry.actions[2]!.left - geometry.actions[1]!.right <= 9, 'Credentials link sits right next to Select none');
        assert.ok(geometry.actions.every(action => action.scrollWidth <= action.clientWidth + 1));
        assert.ok(geometry.right <= geometry.viewport);
        assert.equal(await dialog.getByRole('link', { name: 'Credential setup', exact: true }).count(), 1);
        assert.equal(await dialog.getByRole('link', { name: 'Credential setup', exact: true }).getAttribute('href'), '/settings/subscriptions');
        assert.equal(await dialog.getByRole('link', { name: 'Credential setup', exact: true }).locator('svg').count(), 1);
        await dialog.getByRole('button', { name: 'Deselect all', exact: true }).click();
        assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 0);
        await dialog.getByRole('button', { name: 'Select all', exact: true }).click();
        assert.equal(await dialog.getByRole('checkbox', { checked: false }).count(), 0);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`Multiselect menu flips with viewport space; keyboard order matches option position (${viewport.name})`, async () => {
      const opened = await openFollowManage(browser, viewport);
      try {
        const { page } = opened;
        await page.setViewportSize({ width: viewport.width, height: 1200 });
        await page.getByRole('tab', { name: 'Add follow', exact: true }).click();
        const trigger = page.getByRole('button', { name: 'All sources', exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Source filter', exact: true });
        await page.waitForFunction(() => document.querySelector('[data-selection-placement]')?.getAttribute('data-selection-placement') === 'bottom');
        assert.equal(await dialog.locator('button,a,input').first().getAttribute('type'), 'checkbox');
        await page.setViewportSize({ width: viewport.width, height: 480 });
        await page.waitForFunction(() => document.querySelector('[data-selection-placement]')?.getAttribute('data-selection-placement') === 'top');
        assert.equal(await dialog.locator('button,a,input').first().innerText(), 'Select all');
        const ordered = await dialog.evaluate(element => {
          const actions = element.querySelector('[data-selection-actions]')!.getBoundingClientRect();
          const options = element.querySelector('[data-selection-options]')!.getBoundingClientRect();
          return actions.bottom <= options.top;
        });
        assert.ok(ordered);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`Follow management collections and cross-page management navigation keep the sliding layer and reduced motion (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openFollowManage(browser, viewport);
      try {
        const { page } = opened;
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const tabs = page.getByRole('tablist', { name: 'Follows management area' });
        const surface = tabs.locator(':scope > [data-pill-thumb]');
        await surface.waitFor();
        const original = await surface.elementHandle();
        assert.ok(original);
        await tabs.getByRole('tab', { name: 'Add follow', exact: true }).click();
        await page.waitForFunction(() => {
          const host = document.querySelector('[role="tablist"][aria-label="Follows management area"]')!;
          const selected = host.querySelector('[data-pill-selected]')!.getBoundingClientRect();
          const pane = host.querySelector('[data-pill-thumb]')!.getBoundingClientRect();
          return Math.abs(selected.left - pane.left) < 1 && Math.abs(selected.width - pane.width) < 1;
        });
        assert.equal(await original.evaluate((node) => node.isConnected), true);
        assert.match(await surface.evaluate((node) => getComputedStyle(node).transitionDuration), /0.3s/);
        await tabs.getByRole('tab', { name: 'Add follow', exact: true }).press('ArrowRight');
        await tabs.getByRole('tab', { name: 'Manage tags', selected: true }).waitFor();
        await tabs.getByRole('tab', { name: 'Manage tags', exact: true }).press('ArrowRight');
        await tabs.getByRole('tab', { name: 'Follows list', selected: true }).waitFor();
        assert.equal(await tabs.getByRole('tab').count(), 3);
        assert.equal(await surface.count(), 1);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await surface.evaluate((node) => getComputedStyle(node).transitionDuration), '0s');
        const navigation = page.getByRole('navigation', { name: 'Manage', exact: true });
        const managementSurface = navigation.locator('[data-pill-thumb]');
        const managementOriginal = await managementSurface.elementHandle();
        assert.ok(managementOriginal);
        await navigation.getByRole('button', { name: 'Task center', exact: true }).click();
        await page.waitForURL((url) => url.pathname === '/tasks');
        await page.getByRole('heading', { name: 'Task center', exact: true }).waitFor();
        assert.equal(await managementOriginal.evaluate((node) => node.isConnected), true);
        assert.equal(await navigation.locator('[data-pill-selected]').textContent(), 'Task center');
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`Page tabs reuse the PillTabList selected layer and keep arrow key navigation (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/studios', viewport);
      try {
        const page = opened.page;
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const tabs = page.getByRole('tablist', { name: 'Detail kinds' });
        const surface = tabs.locator(':scope > span[aria-hidden="true"]');
        await surface.waitFor();
        const original = await surface.elementHandle();
        assert.ok(original);
        const style = await surface.evaluate((node) => ({ duration: getComputedStyle(node).transitionDuration,
          properties: getComputedStyle(node).transitionProperty }));
        assert.match(style.properties, /transform/);
        assert.ok(style.duration.split(',').every((value) => value.trim() === '0.3s'));
        await tabs.getByRole('tab', { name: 'Agency', exact: true }).click();
        await page.waitForURL((url) => url.pathname === '/agencies');
        await tabs.getByRole('tab', { name: 'Agency', selected: true }).waitFor();
        // What is awaited is the selection layer fetched at the start sliding into place and stopping: read its own parent element rather than hunting another row by tag name.
        await page.waitForFunction((thumb) => {
          const selected = thumb.parentElement!.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
          const pane = thumb.getBoundingClientRect();
          return thumb.getAnimations().length === 0
            && Math.abs(selected.left - pane.left) <= 1 && Math.abs(selected.width - pane.width) <= 1;
        }, original);
        assert.equal(await original.evaluate((node) => node.isConnected), true);
        const selected = await tabs.getByRole('tab', { selected: true }).boundingBox();
        const pane = await surface.boundingBox();
        assert.ok(selected && pane && Math.abs(selected.x - pane.x) <= 1 && Math.abs(selected.width - pane.width) <= 1);
        await tabs.getByRole('tab', { selected: true }).press('ArrowLeft');
        await page.waitForURL((url) => url.pathname === '/series');
        await tabs.getByRole('tab', { name: 'Series', selected: true }).press('ArrowLeft');
        await page.waitForURL((url) => url.pathname === '/studios');
        await tabs.getByRole('tab', { name: 'Labels', selected: true }).waitFor();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await surface.evaluate((node) => getComputedStyle(node).transitionDuration), '0s');
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`Setting dividers are inset on the left and full-bleed on the right, with one line between standalone row groups (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/library', viewport);
      try {
        const page = opened.page;
        const section = page.getByRole('region', { name: 'Video previews', exact: true });
        await section.getByRole('switch', { name: 'Generate video previews' }).waitFor();
        await settle(page);
        const measured = await section.evaluate((element) => {
          const card = element.lastElementChild!;
          const box = card.getBoundingClientRect();
          const groups = [...card.querySelectorAll(':scope > .ui-settings-rows')];
          return groups.map((group) => ({
            top: parseFloat(getComputedStyle(group).borderTopWidth),
            rows: [...group.children].map((row) => ({
              left: row.getBoundingClientRect().left - box.left,
              right: box.right - row.getBoundingClientRect().right,
              bottom: parseFloat(getComputedStyle(row).borderBottomWidth),
            })),
          }));
        });
        // The master toggle, the timeline tier and the frame-extraction decode method each occupy one row group; groups are separated by the next group's top border.
        assert.equal(measured.length, 3);
        assert.deepEqual(measured.map((group) => group.rows.length), [1, 1, 1]);
        assert.deepEqual(measured.map((group) => group.top), [0, 1, 1]);
        assert.deepEqual(measured.flatMap((group) => group.rows.map((row) => row.bottom)), [0, 0, 0]);
        for (const row of measured.flatMap((group) => group.rows)) {
          assert.ok(Math.abs(row.left - 12) <= .5 && Math.abs(row.right) <= .5, JSON.stringify(row));
        }
        const footer = await page.getByRole('form', { name: 'Auto-discover new files', exact: true })
          .getByRole('button', { name: 'Save configuration', exact: true }).evaluate((button) => {
            const bar = button.parentElement!;
            const card = bar.parentElement!.getBoundingClientRect();
            const box = bar.getBoundingClientRect();
            return { left: box.left - card.left, right: card.right - box.right, top: getComputedStyle(bar).borderTopWidth };
          });
        assert.ok(Math.abs(footer.left) <= .5 && Math.abs(footer.right) <= .5, JSON.stringify(footer));
        assert.equal(footer.top, '1px');
        await openPanel(page);
        const rows = await page.locator(`${PANEL} [data-setting-group]:visible [data-setting-row]`).evaluateAll((elements) =>
          elements.map((row) => {
            const group = row.parentElement!.getBoundingClientRect();
            const box = row.getBoundingClientRect();
            return { left: box.left - group.left, right: group.right - box.right };
          }));
        assert.ok(rows.length > 1);
        for (const row of rows) assert.ok(Math.abs(row.left - 12) <= .5 && Math.abs(row.right) <= .5, JSON.stringify(row));
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`Settings nav glyph is visible; the taste entry renders as a button and opens its page (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openHome(browser, viewport);
      try {
        const page = opened.page;
        await openPanel(page);
        const marks = await page.locator(`${PANEL} [data-settings-nav] button svg`).evaluateAll((icons) => icons.map((icon) => {
          const shape = (icon as SVGSVGElement).getBBox();
          const symbol = document.querySelector(icon.querySelector('use')!.getAttribute('href')!);
          return { width: shape.width, height: shape.height, text: symbol?.textContent, name: icon.closest('button')!.textContent };
        }));
        for (const mark of marks) assert.ok(mark.width > 0 && mark.height > 0, `${mark.name} glyph is empty`);
        assert.ok(marks.find((mark) => mark.name === 'JAV & new releases')?.text?.includes('番'));
        await page.locator(PANEL).getByRole('tab', { name: 'Search & recommendations' }).click();
        const link = page.locator(PANEL).getByRole('link', { name: 'Open taste & history' });
        const style = await link.evaluate((node) => ({ display: getComputedStyle(node).display,
          height: node.getBoundingClientRect().height, decoration: getComputedStyle(node).textDecorationLine }));
        assert.ok(['flex', 'inline-flex'].includes(style.display));
        assert.ok(style.height >= 32);
        assert.equal(style.decoration, 'none');
        await link.click();
        await page.waitForURL((url) => url.pathname === '/taste');
        await page.locator(PANEL).waitFor({ state: 'hidden' });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`Media status is centered, secondary actions and save are layered, and the guided-tour entry stays visible (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/settings/library', viewport);
      try {
        const page = opened.page;
        await page.route('**/api/configuration', async (route) => {
          const data = await (await route.fetch()).json();
          const paths = ['R:\\media', 'B:\\', 'A:\\'];
          await route.fulfill({ json: { ...data, editable: true, windows: true, media_dirs: paths, media_sources: paths.map((path, index) => ({
            path, location: ['local', '115', 'pikpak'][index], online: index > 0, library: ['media', '115', 'PikPak'][index],
          })) } });
        });
        await page.reload({ waitUntil: 'load' });
        await expectBody(page, '/settings/library', configurationBody(page));
        await settle(page);
        await page.locator('[data-mount]').first().waitFor();
        const centers = await page.locator('[data-folder-row]').evaluateAll((rows) => rows.map((row) => {
          const input = row.querySelector('input')!.getBoundingClientRect();
          const status = row.querySelector('[data-mount]')!.getBoundingClientRect();
          return Math.abs(input.top + input.height / 2 - status.top - status.height / 2);
        }));
        assert.equal(centers.length, 3);
        for (const delta of centers) assert.ok(delta <= 1, `The status is ${delta}px off the input centerline`);
        const media = page.getByRole('form', { name: 'Library and catalog', exact: true });
        assert.notEqual(await media.getByRole('button', { name: 'Add library', exact: true }).evaluate((node) => getComputedStyle(node).backgroundImage),
          await media.getByRole('button', { name: 'Save configuration', exact: true }).evaluate((node) => getComputedStyle(node).backgroundImage));
        await page.getByRole('tab', { name: 'App and maintenance', exact: true }).click();
        const tutorial = page.getByRole('region', { name: 'Guided tour', exact: true });
        await tutorial.waitFor();
        const aligned = await tutorial.evaluate((node) => {
          const label = [...node.querySelectorAll('p')].find((item) => item.textContent === 'Guided tour')!.parentElement!.getBoundingClientRect();
          const button = node.querySelector('button')!.getBoundingClientRect();
          return { delta: Math.abs(label.top + label.height / 2 - button.top - button.height / 2), gap: button.left - label.right };
        });
        assert.ok(aligned.delta <= 1 && aligned.gap > 0, JSON.stringify(aligned));
        await page.screenshot({ path: `../build/agent-verification/browser/configuration-${viewport.name}.png`, fullPage: true });
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  for (const viewport of VIEWPORTS) for (const path of ['/settings/library', '/review']) {
    it(`The category catalog sits on the left on desktop and on top on phones, with the selected state distinct from hover (${path} · ${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, path, viewport);
      try {
        const page = opened.page;
        const nav = page.locator('#stats [data-section-nav]:not([data-skeleton] *)');
        const selected = nav.getByRole('tab', { selected: true });
        await selected.waitFor();
        await settle(page);
        const content = page.getByRole('tabpanel').filter({ visible: true }).first();
        const a = (await nav.boundingBox())!;
        const b = (await content.boundingBox())!;
        assert.ok(viewport.name === 'desktop' ? a.x + a.width <= b.x + 1 : a.y + a.height <= b.y + 1,
          JSON.stringify({ nav: a, content: b }));
        const surface = nav.locator('[data-pill-thumb]');
        const fill = await surface.evaluate((node) => getComputedStyle(node).backgroundColor);
        assert.notEqual(fill, 'rgba(0, 0, 0, 0)');
        const selectedBox = await selected.boundingBox();
        const surfaceBox = await surface.boundingBox();
        assert.ok(selectedBox && surfaceBox && Math.abs(selectedBox.x - surfaceBox.x) <= 1
          && Math.abs(selectedBox.y - surfaceBox.y) <= 1 && Math.abs(selectedBox.width - surfaceBox.width) <= 1
          && Math.abs(selectedBox.height - surfaceBox.height) <= 1);
        const unselected = nav.getByRole('tab', { selected: false }).first();
        await unselected.hover();
        await settle(page);
        assert.notEqual(await unselected.evaluate((node) => getComputedStyle(node).backgroundColor), fill);
        assert.equal(await unselected.evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.deepEqual((await layout(page)).offenders, []);
        await page.screenshot({ path: `../build/agent-verification/browser/${path.slice(1)}-navigation-${viewport.name}.png`, fullPage: true });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  it('Many completed successors can expand and collapse by keyboard', { timeout: 60_000 }, async () => {
    const parent = settledRun(1000, 'succeeded', 'Follow source fetching');
    const children = Array.from({ length: 20 }, (_, index) => ({ ...settledRun(index + 1, 'succeeded', 'Fill in detail images'),
      parent_run_id: parent.id, root_run_id: parent.id, followup_key: `entity-avatar:${index}`, followup_depth: 1 }));
    const opened = await openActivity(browser, [parent, ...children]);
    try {
      const page = opened.page;
      const summary = page.locator('summary').filter({ hasText: 'Task details · 20 items' });
      assert.equal(await page.locator('[data-followup-key]:visible').count(), 0);
      await summary.focus();
      await page.keyboard.press('Enter');
      await settle(page);
      assert.equal(await page.locator('[data-followup-key]:visible').count(), 20);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => ![...document.querySelectorAll('details')].find((node) => node.textContent?.includes('Task details · 20 items'))?.open);
      assert.equal(await page.locator('[data-followup-key]:visible').count(), 0);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });
});
