/* Design decisions: settings, taste, statistics and the filter glass. Reads `getComputedStyle` to assert the appearance the user set; shared stubs and browser lifecycle live in `design-fixture.ts`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { openFollowFeed } from './follow-fixture.ts';
import { requiredEnv, settle, visit, VIEWPORTS } from './harness.ts';
import { openHome, openPanel, ORDER, PANEL, stubServer } from './settings-fixture.ts';
import {
  DESKTOP, MOBILE, tokenColor, settledRun, openActivity, TASTE_CATEGORIES, TASTE_FACE, openTaste, openIndexPage,
  farthestShadow, holdApi, openLightbox, installDesignBrowser,
} from './design-fixture.ts';

describe('Design decisions: settings, taste, stats, and filter glass', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });

  it('Storage draws the used segment at true capacity by byte magnitude, one row per volume, without leaving the card', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/stats', DESKTOP);
    try {
      const page = opened.page;
      const TB = 1024 ** 4;
      const volumes = [
        { kind: 'system', label: 'System drive', root: 'C:\\', online: true, total: 2 * TB, used: 1.8 * TB, free: .2 * TB },
        { kind: 'media', label: 'Data drive', root: 'R:\\media', online: false, total: null, used: null, free: null },
        { kind: 'media', label: 'PikPak cloud drive', root: 'A:\\', online: true, total: 10240 * TB, used: 0, free: 10240 * TB },
      ];
      await page.route(/\/api\/stats(?:\?|$)/, async (route) => {
        const json = await (await route.fetch()).json();
        await route.fulfill({ json: { ...json, storage_volumes: volumes, storage_summary: {
          volumes: 3, online: 2, measured: 2, free: 10240.2 * TB, used: 1.8 * TB, total: 10242 * TB,
        } } });
      });
      await page.reload({ waitUntil: 'load' });
      await page.getByRole('tab', { name: /使用空间/ }).click();
      const panel = page.locator('[role="tabpanel"]').first();
      await panel.locator('[role="meter"]').first().waitFor({ state: 'visible', timeout: 15_000 });
      await settle(page);
      const shown = await panel.evaluate((element) => {
        const card = element.firstElementChild!;
        const cardBox = card.getBoundingClientRect();
        const detail = card.lastElementChild!.getBoundingClientRect();
        return {
          filled: [...element.querySelectorAll('[role="meter"]')].map((bar) =>
            Math.round(bar.querySelectorAll('rect')[1]!.getBoundingClientRect().width / bar.getBoundingClientRect().width * 100)),
          rows: [...element.querySelectorAll('article')].map((row) => getComputedStyle(row).borderBottomWidth),
          overflow: detail.right - (cardBox.right - parseFloat(getComputedStyle(card).paddingRight)),
          text: element.textContent ?? '',
        };
      });
      assert.deepEqual(shown.filled, [90, 0], 'The progress bar\'s painted used ratio is wrong');
      assert.deepEqual(shown.rows, ['1px', '1px', '0px'], 'No coverage-style divider sits between volumes');
      assert.ok(shown.overflow <= .5, `The storage detail exceeds the card padding by ${shown.overflow}px`);
      assert.ok(shown.text.includes('10.00 PB'), 'Drive capacity never renders in PB');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of VIEWPORTS) {
    it(`The taste ranking matches the radar column's height on wide screens and sizes by row count on narrow ones, and the bars never thicken when the chart grows (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openTaste(browser, viewport);
      try {
        const page = opened.page;
        const bars = page.locator('section[aria-label="Taste dimension ranking"]');
        await bars.locator('.recharts-bar-rectangle').first().waitFor({ state: 'visible', timeout: 15_000 });
        await settle(page);
        const shown = await page.locator('section[aria-label="Browser profile"]').evaluate((section) => {
          const radar = section.firstElementChild!.getBoundingClientRect();
          const ranked = section.querySelector('section[aria-label="Taste dimension ranking"]')!.getBoundingClientRect();
          return {
            radar: radar.height,
            ranked: ranked.height,
            thickness: [...section.querySelectorAll('.recharts-bar-rectangle')]
              .map((bar) => bar.getBoundingClientRect().height),
          };
        });
        assert.equal(shown.thickness.length, TASTE_CATEGORIES.length);
        if (viewport.mobile) {
          assert.ok(shown.ranked >= 32 * TASTE_CATEGORIES.length,
            `On narrow screens the ranking bar is only ${shown.ranked}px, too tight for ${TASTE_CATEGORIES.length} rows`);
        } else {
          assert.ok(Math.abs(shown.ranked - shown.radar) < 2,
            `The ranking bar is ${shown.ranked}px and the radar column ${shown.radar}px, so the two columns differ in height`);
        }
        // 26 is the thickness a 32px cell reserves by default; extra height from a taller chart widens the bar gaps, not the bars themselves.
        assert.ok(shown.thickness.every((height) => height <= 26.5), `Bar thickness is ${shown.thickness.join(', ')}px`);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  it('Taste ranking performer and creator avatars scale by face box: the image keeps its ratio, fills the circle, and never shows the initial underneath', { timeout: 60_000 }, async () => {
    const opened = await openTaste(browser, DESKTOP);
    try {
      const page = opened.page;
      await page.getByRole('tablist', { name: 'Data sources for taste analysis' }).getByRole('tab', { name: 'Peach watch and rating' }).click();
      for (const name of ['Performers', 'Creators']) {
        await page.getByRole('tablist', { name: 'Peach taste dimensions' }).getByRole('tab', { name }).click();
        const img = page.getByRole('tabpanel', { name }).locator('img[data-facebox]').first();
        await img.scrollIntoViewIfNeeded();
        // The zoom is written into inline style by `avatarFrame` after the image loads; measure only once that step has landed.
        await page.waitForFunction((element) => element instanceof HTMLImageElement
          && element.complete && element.naturalWidth > 0 && element.style.width !== '',
        await img.elementHandle(), { timeout: 15_000 });
        const frame = await img.evaluate((element) => {
          const ring = element.parentElement!.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return {
            maxWidth: getComputedStyle(element).maxWidth, ring: ring.width,
            width: box.width, aspect: box.width / box.height,
            gaps: [box.left - ring.left, ring.right - box.right, box.top - ring.top, ring.bottom - box.bottom],
          };
        });
        assert.equal(frame.maxWidth, 'none', `${name} avatar image is clamped by the preflight max-width`);
        assert.ok(frame.width > frame.ring, `${name}'s avatar is not zoomed to the face box: image width ${frame.width}px, ring ${frame.ring}px`);
        assert.ok(Math.abs(frame.aspect - TASTE_FACE.imgW / TASTE_FACE.imgH) < .02,
          `${name} avatar image aspect ratio is ${frame.aspect}, squashed`);
        assert.ok(frame.gaps.every((gap) => gap <= .5), `${name} avatar image does not fill the circle: ${frame.gaps.join(', ')}`);
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('An interrupted round carries only its finish reason, leaving no blank line under the card body', { timeout: 60_000 }, async () => {
    const opened = await openActivity(browser, [
      { ...settledRun(1, 'interrupted', 'Update check'), error: 'The service restarted and this round never finished' },
    ]);
    try {
      const body = await opened.page.locator('li[data-status="interrupted"] > div').first()
        .evaluate((element) => ({
          trailing: element.getBoundingClientRect().bottom - element.lastElementChild!.getBoundingClientRect().bottom,
          padding: parseFloat(getComputedStyle(element).paddingBottom),
        }));
      assert.ok(Math.abs(body.trailing - body.padding) <= .5,
        `${body.trailing}px sit empty under the body's last line while the bottom padding is only ${body.padding}px`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  /* The home "new releases not in the library" row scrolls horizontally by itself, firing one scroll event per frame. On the
     phone the sidebar is a drawer and the two popovers run right into it; the demo library has no subscriptions, so this row
     is rendered by the intercepted `/api/feeds/discoveries` (fields per `src/peach/web_feeds.py`). The fixture turns motion
     off, so auto-scroll never starts, and this scrolls it by hand, emitting the same kind of scroll. */
  it('At 390px the sidebar\'s two popovers do not collapse on another row\'s horizontal scroll, only on page scroll', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', MOBILE);
    try {
      const items = Array.from({ length: 12 }, (_, index) => ({
        id: index + 1, code: `DEMO-${String(index + 1).padStart(3, '0')}`, title: `Demo new release ${index + 1}`,
        studio: 'Demo label', release_date: '2026-09-01', has_cover: false, cover_url: '', link: '', read: false,
      }));
      await opened.page.route((url) => url.pathname === '/api/feeds/discoveries', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ items }),
      }));
      await opened.page.reload({ waitUntil: 'load' });
      const row = opened.page.locator('#feedNew .feednewrow');
      await row.waitFor({ state: 'visible', timeout: 15_000 });
      await settle(opened.page);
      assert.ok(await row.evaluate((element) => element.scrollWidth > element.clientWidth + 120),
        'At 390px the new releases row has no horizontal slack, so this test has nothing to measure');
      await opened.page.locator('#filterBtn').tap();
      await opened.page.waitForFunction(() => document.querySelector('#drawer')?.classList.contains('open'));
      for (const [trigger, menuId] of [['#brandHome', 'boardLibraryMenu'], ['#boardGlowBtn', 'boardGlowMenu']] as const) {
        const menu = opened.page.locator(`#${menuId}`);
        await opened.page.locator(trigger).tap();
        await menu.waitFor({ state: 'visible', timeout: 5_000 });
        for (let step = 0; step < 4; step += 1) {
          await row.evaluate((element) => { element.scrollLeft += 30; });
          await opened.page.waitForTimeout(100);
        }
        assert.ok(await menu.isVisible(), `The popover opened by ${trigger} collapsed with the new releases row's horizontal scroll`);
        // A menu too tall for the screen scrolls internally anyway; a capture-phase scroll listener catches even its own scrolling.
        await menu.evaluate((element) => element.dispatchEvent(new Event('scroll')));
        await opened.page.waitForTimeout(100);
        assert.ok(await menu.isVisible(), `The popover opened by ${trigger} collapsed on its own internal scroll`);
        assert.equal(await opened.page.locator(trigger).getAttribute('aria-expanded'), 'true');
        await opened.page.evaluate(() => document.dispatchEvent(new Event('scroll')));
        await menu.waitFor({ state: 'hidden', timeout: 5_000 });
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The glow palette in settings and the sidebar palette card are the same preset swatches, and keyboard selection changes both at once', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    try {
      await settle(opened.page);
      await opened.page.locator('#settingsBtn').click();
      const grid = opened.page.locator('#homeGlowControls [data-glow-grid]');
      await grid.waitFor({ state: 'visible', timeout: 10_000 });
      const chips = (root: string) => opened.page.locator(`${root} [data-glow-preset]`).evaluateAll((nodes) =>
        nodes.map((node) => ({
          key: (node as HTMLElement).dataset.glowPreset,
          label: node.getAttribute('aria-label'),
          pressed: node.getAttribute('aria-pressed'),
          ball: getComputedStyle(node.querySelector('[data-glow-ball]')!).backgroundImage,
        })));
      const inSettings = await chips('#homeGlowControls');
      assert.ok(inSettings.length >= 2, 'No preset color swatches in settings');
      assert.deepEqual(inSettings, await chips('#boardGlowMenu'), 'The settings preset swatches and the sidebar palette card are not the same set');
      const size = await grid.locator('[data-glow-ball]').first().evaluate((node) => node.getBoundingClientRect().width);
      assert.equal(size, 28, 'The settings swatch and the sidebar one are not the same size');
      /* The settings row spans the full settings block: column count follows available width, each cell is one orb packed side by side before wrapping,
         with the same spacing as the sidebar's `[data-glow-grid]`; the sidebar card keeps its six columns. */
      const gridStyle = (root: string) => opened.page.locator(`${root} [data-glow-grid]`).evaluate((node) => {
        const style = getComputedStyle(node);
        return { tracks: style.gridTemplateColumns, gap: style.columnGap, inline: style.paddingLeft };
      });
      const swatchLayout = () => grid.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const chips = [...node.querySelectorAll('[data-glow-preset]')].map((chip) => chip.getBoundingClientRect());
        const firstTop = chips[0]!.top;
        return {
          count: chips.length,
          firstRow: chips.filter((chip) => chip.top === firstTop).length,
          rows: new Set(chips.map((chip) => chip.top)).size,
          steps: chips.slice(1).filter((chip) => chip.top === firstTop).map((chip, index) => chip.left - chips[index]!.left),
          startsAt: chips[0]!.left - box.left,
          overflow: node.scrollWidth > node.clientWidth || chips.some((chip) => chip.right > box.right + 0.5),
          viewportOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      const settingsGrid = await gridStyle('#homeGlowControls');
      const sidebarGrid = await gridStyle('#boardGlowMenu');
      assert.ok(settingsGrid.tracks.split(' ').every((track) => track === '28px'), 'The settings swatches are not one ball\'s width per cell');
      assert.equal(settingsGrid.gap, sidebarGrid.gap, 'The settings swatch spacing differs from the sidebar palette card');
      assert.equal(settingsGrid.inline, '0px', 'The settings swatch does not start from the row content\'s left edge');
      // The sidebar palette card is collapsed at this moment, so the computed value is still the declarative `repeat(6, 1fr)`; expanded it becomes six resolved widths.
      assert.ok(sidebarGrid.tracks === 'repeat(6, 1fr)' || sidebarGrid.tracks.split(' ').length === 6,
        `The sidebar palette card is no longer six per row: ${sidebarGrid.tracks}`);
      const wide = await swatchLayout();
      assert.ok(wide.firstRow > 6, `At desktop width the first row laid out only ${wide.firstRow} chips; the space on the right went unused`);
      assert.ok(wide.steps.every((step) => step === 34), `The swatches in settings are not laid out flush: step ${wide.steps.join('/')}`);
      assert.equal(wide.startsAt, 0, 'The first swatch in settings does not start at the row content\'s left edge');
      assert.equal(wide.overflow, false, 'At desktop width the color block overflows this row');
      assert.equal(await grid.getAttribute('role'), 'group');
      assert.ok(await grid.getAttribute('aria-label'), 'The preset swatch group has no accessible name');

      const target = inSettings.find((chip) => chip.pressed === 'false')!;
      const chip = grid.locator(`[data-glow-preset="${target.key}"]`);
      await chip.focus();
      await opened.page.keyboard.press('Space');
      await opened.page.waitForFunction((key) => document.querySelector(
        `#homeGlowControls [data-glow-preset="${key}"]`)?.getAttribute('aria-pressed') === 'true', target.key);
      assert.equal(await grid.locator('[aria-pressed="true"]').count(), 1);
      assert.equal(await opened.page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.glowPreset
        && document.activeElement!.closest('#homeGlowControls [data-glow-grid]') ? (document.activeElement as HTMLElement).dataset.glowPreset : null),
        target.key, 'After choosing, focus left the swatch just selected');
      assert.equal(await opened.page.locator(`#boardGlowMenu [data-glow-preset="${target.key}"]`)
        .getAttribute('aria-pressed'), 'true', 'The sidebar palette card did not follow to the same tier');
      assert.equal(await opened.page.locator('#homeGlowControls [data-glow-preset-name]').textContent(), target.label);
      assert.equal(await opened.page.evaluate(() => JSON.parse(localStorage.getItem('peach.settings.v1')!).homeGlow.preset),
        target.key, 'The selected tier is not written to settings');

      await opened.page.setViewportSize({ width: MOBILE.width, height: MOBILE.height });
      await grid.waitFor({ state: 'visible', timeout: 10_000 });
      const narrow = await swatchLayout();
      assert.ok(narrow.firstRow < narrow.count && narrow.rows > 1, `At ${MOBILE.width}px the swatches did not wrap`);
      assert.ok(narrow.steps.every((step) => step === 34), `At ${MOBILE.width}px the swatches are not flush together`);
      assert.equal(narrow.startsAt, 0, `At ${MOBILE.width}px the first swatch does not start from the content's left edge`);
      assert.equal(narrow.overflow, false, `At ${MOBILE.width}px a swatch leaves the row`);
      assert.equal(narrow.viewportOverflow, false, `At ${MOBILE.width}px the page overflows horizontally`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  /* ADR-0050: the settings popover holds only one value per row, effective on change; forms with a "Save configuration" button live on the configuration page,
     long tasks needing confirmation or progress live on the data management page, and feeds live on the follows management page. */
  /* The settings panel: the full-page popover shares the video details overlay's scrim tier and enter/exit animations; the scrim has no blur and takes its value only from `--scrim`.
     Animation keyframe names are readable only while animations actually run, so this case builds its own context without reduced motion. */
  it('The settings panel scrim uses --scrim, no blur, and sits on the topmost layer; the card enters and exits with the popover keyframes', { timeout: 60_000 }, async () => {
    const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height } });
    await context.addInitScript(() => localStorage.setItem('peach.settings.v1', JSON.stringify({ detailAutoplay: false })));
    try {
      const page = await context.newPage();
      await stubServer(page);
      await page.goto(`${requiredEnv('PEACH_E2E_ORIGIN')}/`, { waitUntil: 'load' });
      await settle(page);
      await openPanel(page);
      const scrim = await tokenColor(page, 'body', '--scrim');
      const shown = await page.locator(PANEL).evaluate((panel) => {
        const style = getComputedStyle(panel);
        const card = getComputedStyle(panel.querySelector('[data-settings-card]')!);
        return {
          position: style.position, z: style.zIndex, inset: [style.top, style.right, style.bottom, style.left],
          layer: getComputedStyle(document.documentElement).getPropertyValue('--layer-dialog').trim(),
          face: style.backgroundColor, blur: [style.backdropFilter, card.backdropFilter],
          backdrop: [style.animationName, style.animationFillMode], card: [card.animationName, card.animationFillMode],
          padding: [style.paddingTop, style.paddingBottom],
        };
      });
      assert.equal(shown.position, 'fixed');
      assert.equal(shown.z, shown.layer, 'The settings scrim is not on the --layer-dialog layer');
      assert.deepEqual(shown.inset, ['0px', '0px', '0px', '0px'], 'The settings scrim never fills the viewport');
      assert.equal(shown.face, scrim, 'The settings scrim color is not --scrim');
      assert.deepEqual(shown.blur, ['none', 'none'], 'The settings scrim or card carries blur');
      assert.deepEqual(shown.backdrop, ['settings-backdrop-in', 'both']);
      // Fill `backwards` on entry: the filter left by the final frame would start another backdrop root, and the left pane's glass would sample only the card itself.
      assert.deepEqual(shown.card, ['board-dialog-in', 'backwards']);
      /* Safe-area padding clears the notch and the Home indicator; desktop has no safe areas, so both ends get an 18px base. */
      assert.deepEqual(shown.padding, ['18px', '18px']);

      const leaving = await page.locator(PANEL).evaluate((panel) => {
        (panel.querySelector('#settingsClose') as HTMLButtonElement).click();
        const card = getComputedStyle(panel.querySelector('[data-settings-card]')!);
        return { backdrop: getComputedStyle(panel).animationName, card: [card.animationName, card.animationFillMode] };
      });
      assert.equal(leaving.backdrop, 'settings-backdrop-out');
      // The exit needs `both`: the end state (transparent) is not the element's natural state.
      assert.deepEqual(leaving.card, ['board-dialog-out', 'both']);
      await page.locator(PANEL).waitFor({ state: 'hidden', timeout: 5_000 });
    } finally {
      await context.close();
    }
  });

  it('The settings panel header fills the right column and sits above the scroll area, casting the left column\'s glass shadow only after scrolling past that whitespace', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page } = opened;
    try {
      await openPanel(page);
      const shadow = await page.locator(`${PANEL} [data-settings-card]`).evaluate((card) => {
        const probe = document.createElement('div');
        probe.style.boxShadow = 'var(--glass-shadow)';
        card.append(probe);
        const value = getComputedStyle(probe).boxShadow;
        probe.remove();
        return value;
      });
      const read = () => page.locator(PANEL).evaluate((panel) => {
        const head = panel.querySelector('[data-settings-head]')!, scroll = panel.querySelector('[data-settings-scroll]')!;
        const top = head.getBoundingClientRect(), body = scroll.getBoundingClientRect(), style = getComputedStyle(scroll);
        return {
          head: [top.left, top.width, top.bottom], body: [body.left, body.width, body.top],
          z: getComputedStyle(head).zIndex, shadow: getComputedStyle(head).boxShadow, clip: getComputedStyle(head).clipPath,
          overflow: style.overflowY, overscroll: style.overscrollBehaviorY, gap: style.paddingTop,
          navigationClip: getComputedStyle(panel.querySelector('[data-settings-nav]')!).clipPath,
        };
      });
      const resting = await read();
      assert.deepEqual(resting.head.slice(0, 2), resting.body.slice(0, 2), 'The title bar and scroll area are not the same column and width');
      assert.ok(resting.head[2]! <= resting.body[2]! + 0.5, 'The title bar does not layer above the scroll area');
      assert.equal(resting.z, '2');
      assert.equal(resting.overflow, 'auto');
      assert.equal(resting.overscroll, 'contain', 'After scrolling to the end, scroll leaks through to the page behind');
      assert.equal(resting.shadow, 'none', 'The title bar cast its shadow before any scrolling');
      assert.equal(resting.navigationClip, 'inset(0px)', 'The glass nav\'s outer shadow crosses the column boundary');
      // The shadow only needs the downward half: upward it smears onto the title itself, leftward onto the left column.
      assert.equal(resting.clip, 'inset(0px 0px -96px)');

      await page.locator(`${PANEL} [data-settings-scroll]`).evaluate((scroll) => { scroll.scrollTop = 4 });
      await page.waitForTimeout(100);
      assert.equal((await read()).shadow, 'none', `The title bar casts its shadow before the scroll passes the ${resting.gap} padding`);
      await page.locator(`${PANEL} [data-settings-scroll]`).evaluate((scroll) => { scroll.scrollTop = 80 });
      await page.waitForFunction((want) => getComputedStyle(
        document.querySelector('#settingsPanel [data-settings-head]')!).boxShadow === want, shadow);
      await page.locator(`${PANEL} [data-settings-scroll]`).evaluate((scroll) => { scroll.scrollTop = 0 });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#settingsPanel [data-settings-head]')!).boxShadow === 'none');
      await page.locator(`${PANEL} [data-settings-scroll]`).evaluate((scroll) => { scroll.scrollTop = 80 });
      await page.locator(PANEL).getByRole('tab', { name: 'Browsing & playback', exact: true }).click();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#settingsPanel [data-settings-head]')!).boxShadow === 'none');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The settings nav\'s current item paints no background of its own; the glass follows the pointer and falls back to the current item when the pointer leaves', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page } = opened;
    try {
      await openPanel(page);
      const nav = page.locator(`${PANEL} [data-settings-nav]`);
      const glide = () => nav.locator('[data-settings-glide]').evaluate((node) => Math.round(node.getBoundingClientRect().top));
      const top = (name: string) => nav.getByRole('tab', { name, exact: true })
        .evaluate((node) => Math.round(node.getBoundingClientRect().top));
      const selected = await nav.getByRole('tab', { name: 'Appearance & navigation', exact: true }).evaluate((node) => {
        const style = getComputedStyle(node), icon = getComputedStyle(node.querySelector('svg')!);
        // Icons inline with text take `--icon-inline` (1.2em), computing their edge length from the surrounding text's font size.
        const side = (value: string) => `${Math.round(parseFloat(value) * 10) / 10}px`;
        return { face: style.backgroundColor, ring: style.boxShadow, inline: side(String(parseFloat(style.fontSize) * 1.2)),
          icon: [side(icon.width), side(icon.height), icon.fill === style.color, icon.stroke] };
      });
      assert.equal(selected.face, 'rgba(0, 0, 0, 0)', 'The current item paints its own background, covering the sliding glass');
      assert.equal(selected.ring, 'none');
      // Remix icons draw their outline with `fill`; the site-wide default `stroke:currentColor;fill:none` would make the whole glyph vanish.
      assert.deepEqual(selected.icon, [selected.inline, selected.inline, true, 'none']);
      assert.equal(await glide(), await top('Appearance & navigation'), 'The glass never lands on the current item');

      await nav.getByRole('tab', { name: 'Browsing & playback', exact: true }).hover();
      const target = await top('Browsing & playback');
      await page.waitForFunction(([want]) => Math.round(document.querySelector(
        '#settingsPanel [data-settings-glide]')!.getBoundingClientRect().top) === want, [target]);
      assert.equal(await nav.getByRole('tab', { name: 'Appearance & navigation', exact: true }).getAttribute('aria-selected'), 'true',
        'Merely hovering switched the section');
      await page.locator(`${PANEL} [data-settings-scroll]`).hover();
      const home = await top('Appearance & navigation');
      await page.waitForFunction(([want]) => Math.round(document.querySelector(
        '#settingsPanel [data-settings-glide]')!.getBoundingClientRect().top) === want, [home]);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The settings panel groups are --ground rounded surfaces; the toggle, theme segments and close button each have their own size, and on narrow screens the toggle does not wrap', { timeout: 60_000 }, async () => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const opened = await openHome(browser, viewport);
      const { page } = opened;
      try {
        await openPanel(page);
        const ground = await tokenColor(page, PANEL, '--ground');
        const shown = await page.locator(PANEL).evaluate((panel) => {
          const box = (node: Element) => {
            const rect = node.getBoundingClientRect();
            return [Math.round(rect.width), Math.round(rect.height)];
          };
          const group = getComputedStyle(panel.querySelector('[data-setting-group]:not([hidden]) [data-setting-card]')!);
          const toggles = [...panel.querySelectorAll('[data-setting-group]:not([hidden]) [data-toggle]')];
          const on = panel.querySelector('#uiSoundsSetting')!, row = on.closest('[data-setting-row]')!;
          const title = row.querySelector('b')!.getBoundingClientRect(), knob = on.getBoundingClientRect();
          const close = panel.querySelector('#settingsClose')!;
          return {
            group: [group.backgroundColor, group.borderTopLeftRadius],
            toggles: [...new Set(toggles.map((node) => box(node).join('×')))],
            toggleOnRow: knob.top < title.bottom && knob.left > title.right,
            theme: [...panel.querySelectorAll('#themeSetting label')].map((node) => box(node).join('×')),
            themeIcon: box(panel.querySelector('#themeSetting svg')!).join('×'),
            close: [box(close).join('×'), getComputedStyle(close).borderTopLeftRadius, getComputedStyle(close).paddingLeft],
          };
        });
        assert.deepEqual(shown.group, [ground, '16px'], `${viewport.name}: the group is not a 16px rounded surface of --ground`);
        assert.deepEqual(shown.toggles, ['42×24'], `${viewport.name}: the toggles are not the same pair of 42×24`);
        // The toggle is only 42px and fits the title's row with room to spare; wrapping it below would just waste a line's height.
        assert.equal(shown.toggleOnRow, true, `${viewport.name}: the toggle did not stay on the title row`);
        assert.deepEqual(shown.theme, ['32×32', '32×32', '32×32'], `${viewport.name}: the three theme tiers are not 32px circles`);
        assert.equal(shown.themeIcon, '16×16');
        assert.deepEqual(shown.close, ['24×24', '50%', '0px'], `${viewport.name}: the close key is not a 24px round button`);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    }
  });

  it('Preference rows keep title and control on one line by real widths, wrapping completely when space runs out', { timeout: 60_000 }, async () => {
    for (const width of [320, 375, 390, 428, DESKTOP.width]) {
      const opened = await openHome(browser, { ...(width > 760 ? DESKTOP : MOBILE), width });
      try {
        await openPanel(opened.page);
        for (const section of ['Appearance & navigation', 'Browsing & playback', 'JAV & new releases', 'Search & recommendations', 'Content display']) {
          await opened.page.locator(PANEL).getByRole('tab', { name: section, exact: true }).click();
          const subheadings = ({ '浏览与播放': ['Video list', 'Play'], 'JAV 与新作': ['Video display', 'New releases'] } as
            Record<string, string[] | undefined>)[section];
          if (subheadings) {
            const headings = await opened.page.locator(`${PANEL} [data-setting-group]:not([hidden]) [data-settings-subheading]`)
              .evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, padding: getComputedStyle(node).padding,
                left: node.getBoundingClientRect().left - node.parentElement!.getBoundingClientRect().left })));
            assert.deepEqual(headings, subheadings.map((text) => ({ text, padding: '16px 0px 6px', left: 12 })));
          }
          const rows = await opened.page.locator(`${PANEL} [data-setting-group]:not([hidden]) [data-setting-row]`)
          .evaluateAll((nodes) => nodes.map((row) => {
            const title = row.querySelector('b')!;
            const control = row.lastElementChild!.getBoundingClientRect();
            const bounds = row.getBoundingClientRect();
            const style = getComputedStyle(row);
            const range = document.createRange();
            range.selectNodeContents(title);
            const text = range.getBoundingClientRect();
            return {
              title: title.textContent,
              textLines: range.getClientRects().length,
              sameLine: text.top < control.bottom && control.top < text.bottom,
              fits: text.width + control.width + 12 <= bounds.width - parseFloat(style.paddingRight),
              gap: control.left - text.right,
              contained: control.left >= bounds.left - 1 && control.right <= bounds.right + 1,
              rightGap: bounds.right - control.right - parseFloat(style.paddingRight),
            };
          }));
          assert.ok(rows.length > 0);
          for (const row of rows) {
            assert.equal(row.textLines, 1, `${width}px: ${row.title} title wraps`);
            assert.equal(row.contained, true, `${width}px: ${row.title} control overflows the settings row`);
            assert.ok(Math.abs(row.rightGap) <= 1, `${width}px: ${row.title} control is not right-aligned`);
            if (row.fits || (section === 'Search & recommendations' && width >= 375)) {
              assert.equal(row.sameLine, true, `${width}px: the ${row.title} control is not on the title's line`);
              assert.ok(row.gap >= 11, `${width}px: spacing is missing between ${row.title} and the control`);
            }
          }
        }
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    }
  });

  it('The sidebar order add row: the trigger and "Add" share the --control-h height, "Add" is a primary button, and the trigger shows a not-allowed cursor when candidates run out', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    try {
      const server = await stubServer(page);
      await page.reload({ waitUntil: 'load' });
      await settle(page);
      await openPanel(page);
      const row = page.locator(`${PANEL} [data-sidebar-add-row]`);
      await row.scrollIntoViewIfNeeded();
      const shown = await row.evaluate((node) => {
        const probe = document.createElement('div');
        probe.style.height = 'var(--control-h)';
        node.append(probe);
        const height = getComputedStyle(probe).height;
        probe.remove();
        const primary = document.createElement('button');
        primary.className = 'geist-button primary';
        document.body.append(primary);
        const want = getComputedStyle(primary);
        const expected = [want.backgroundColor, want.backgroundImage, want.color];
        primary.remove();
        const trigger = node.querySelector('[data-sidebar-add-trigger]')!, add = node.querySelector('[data-sidebar-add]')!;
        const face = getComputedStyle(add);
        return {
          height, trigger: getComputedStyle(trigger).height, add: face.height,
          face: [face.backgroundColor, face.backgroundImage, face.color], expected,
          cursor: getComputedStyle(trigger).cursor,
        };
      });
      assert.equal(shown.trigger, shown.height, 'The add row\'s trigger does not reference --control-h');
      assert.equal(shown.add, shown.height, '"Add" does not reference --control-h');
      assert.deepEqual(shown.face, shown.expected, 'The "Add" button does not use the primary button style');
      assert.equal(shown.cursor, 'pointer');

      /* Add them back one by one, until no addable entry remains in the list. */
      const add = row.locator('[data-sidebar-add]'), trigger = row.locator('[data-sidebar-add-trigger]');
      for (let left = 30; left > 0 && await add.isEnabled(); left -= 1) await add.click();
      assert.equal(await trigger.isDisabled(), true, 'After every entry is added back to the sidebar the trigger stays clickable');
      assert.ok((server.settings.sidebarOrder as string[]).length > ORDER.length, 'The re-added entry is not written to the database');
      assert.equal(await trigger.evaluate((node) => getComputedStyle(node).cursor), 'not-allowed',
        'With nothing addable the trigger keeps the default cursor');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Disabled auto-check toggles in sources and subscriptions lower track opacity and use a not-allowed cursor', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    try {
      const server = await stubServer(page);
      server.schedule.available = false;
      await page.goto(new URL('/settings/library', page.url()).href, { waitUntil: 'load' });
      await settle(page);
      const source = () => page.getByRole('tablist', { name: 'Configuration section' }).getByRole('tab', { name: 'Sources and subscriptions', exact: true });
      await source().click();
      const toggle = page.getByRole('switch', { name: 'Automatically check for updates', exact: true });
      await toggle.and(page.locator(':disabled:checked')).waitFor({ state: 'attached', timeout: 10_000 });
      const face = (node: Element) => {
        const label = node.closest('label')!;
        const track = getComputedStyle(label.querySelector(':scope > span[aria-hidden]')!);
        return { opacity: Number(track.opacity), gradient: track.backgroundImage, cursor: getComputedStyle(label).cursor };
      };
      const blocked = await toggle.evaluate(face);
      assert.equal(blocked.opacity, 0.5);
      assert.equal(blocked.cursor, 'not-allowed');
      server.schedule.available = true;
      await page.reload({ waitUntil: 'load' });
      await settle(page);
      await source().click();
      await toggle.and(page.locator(':enabled:checked')).waitFor({ state: 'attached', timeout: 10_000 });
      const live = await toggle.evaluate(face);
      assert.equal(live.opacity, 1);
      assert.equal(live.cursor, 'pointer');
      assert.notEqual(live.gradient, 'none');
      assert.equal(blocked.gradient, live.gradient, 'Both states should compare the same enabled switch');
      assert.ok(blocked.opacity < live.opacity, 'The disabled track does not look visually weaker');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The two navigation-order cards give their content the same padding on all four sides of the card', { timeout: 60_000 }, async () => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const opened = await openHome(browser, viewport);
      const { page } = opened;
      try {
        await openPanel(page);
        const block = page.locator(`${PANEL} [data-setting-block]:has(#sidebarOrderTitle)`);
        await block.waitFor({ state: 'visible', timeout: 10_000 });
        // 量的是卡片里实际内容的外包框，不是包裹层：包裹层自己的内边距算在框里，量出来就是 0。
        const insets = await block.evaluate((node) => [...node.querySelectorAll('[data-setting-card]')].map((card) => {
          const content = document.createRange();
          content.selectNodeContents(card.firstElementChild!);
          const outer = card.getBoundingClientRect(), inner = content.getBoundingClientRect();
          return [inner.top - outer.top, outer.right - inner.right, outer.bottom - inner.bottom, inner.left - outer.left]
            .map(Math.round);
        }));
        assert.equal(insets.length, 2);
        assert.deepEqual(insets[1], insets[0], `${viewport.name}: the two cards have inconsistent padding`);
        for (const side of insets[1]) assert.ok(side >= 8, `${viewport.name}: content flush against the card edge ${JSON.stringify(insets)}`);
      } finally {
        await opened.close();
      }
    }
  });

  it('Glow palettes and custom colors use separate cards; "Glass base color" keeps only the drift speed', { timeout: 60_000 }, async () => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const opened = await openHome(browser, viewport);
      const { page } = opened;
      try {
        await openPanel(page);
        const block = page.locator(`${PANEL} [data-glow-setting]`);
        await block.waitFor({ state: 'visible', timeout: 10_000 });
        const shown = await block.evaluate((node) => {
          const group = node.closest('[data-setting-group]')!.getBoundingClientRect(), rect = node.getBoundingClientRect();
          const cards = [...node.querySelectorAll('[data-setting-card]')];
          return {
            right: Math.round(group.right - rect.right), left: rect.left >= group.left,
            overflow: node.scrollWidth > node.clientWidth,
            cards: cards.map((card) => ({ radius: getComputedStyle(card).borderTopLeftRadius,
              left: card.getBoundingClientRect().left - group.left, right: group.right - card.getBoundingClientRect().right })),
            headings: [...node.querySelectorAll('h4')].map((heading) => heading.textContent),
          };
        });
        assert.equal(shown.right, 0);
        assert.ok(shown.left);
        assert.equal(shown.overflow, false, `${viewport.name}: the parameter block was widened by content`);
        assert.deepEqual(shown.headings, ['Glow palette', 'Custom color']);
        assert.equal(shown.cards.length, 2);
        for (const card of shown.cards) {
          assert.equal(card.radius, '16px');
          assert.ok(Math.abs(card.left) <= .5 && Math.abs(card.right) <= .5, JSON.stringify(card));
        }

        const colorRow = block.locator('[data-glow-stop="spot1"] [data-glow-stop-toggle]');
        await colorRow.hover();
        assert.equal(await colorRow.evaluate((node) => getComputedStyle(node).backgroundColor),
          await tokenColor(page, PANEL, '--control-hover'));
        assert.equal(await colorRow.evaluate((node) => getComputedStyle(node).borderRadius), '0px');
        const hoverEdges = await colorRow.evaluate((node) => {
          const card = node.closest('[data-glow-colour-card]')!.getBoundingClientRect();
          const button = node.getBoundingClientRect();
          const stop = node.closest('[data-glow-stop]')!.getBoundingClientRect();
          const dot = node.querySelector('[data-glow-stop-dot]')!.getBoundingClientRect();
          return { left: button.left - card.left, right: card.right - button.right,
            contentLeft: dot.left - card.left, separatorLeft: stop.left - card.left };
        });
        assert.ok(Math.abs(hoverEdges.left) <= .5 && Math.abs(hoverEdges.right) <= .5, JSON.stringify(hoverEdges));
        assert.equal(hoverEdges.contentLeft, 12);
        assert.equal(hoverEdges.separatorLeft, 12);
        const middleRow = block.locator('[data-glow-stop="spot2"] [data-glow-stop-toggle]');
        await middleRow.hover();
        const seam = await middleRow.evaluate((node) => {
          const style = getComputedStyle(node), row = node.closest('[data-glow-stop]')!;
          const button = node.getBoundingClientRect(), bounds = row.getBoundingClientRect();
          return { shadow: style.boxShadow, zIndex: style.zIndex,
            above: getComputedStyle(row.previousElementSibling!).borderBottomWidth,
            below: getComputedStyle(row).borderBottomWidth, gap: bounds.bottom - button.bottom };
        });
        assert.match(seam.shadow, /0px -1px 0px 0px/);
        assert.match(seam.shadow, /0px 1px 0px 0px/);
        assert.equal(seam.zIndex, '1');
        assert.equal(seam.above, '1px');
        assert.equal(seam.below, '1px');
        assert.equal(seam.gap, 1);
        await colorRow.click();
        const palette = block.locator('[data-glow-stop="spot1"] [data-glow-palette]');
        await palette.waitFor({ state: 'visible' });
        const scrolling = await palette.evaluate((node) => ({
          native: getComputedStyle(node).scrollbarWidth, overlay: node.getAttribute('data-overlay-scrollbar'),
          tracks: node.parentElement!.querySelectorAll('[data-overlay-track]').length,
          popupWidth: node.closest('[data-glow-stop-pop]')!.getBoundingClientRect().width,
          rowWidth: node.closest('[data-glow-stop]')!.querySelector('[data-glow-stop-toggle]')!.getBoundingClientRect().width,
        }));
        assert.equal(scrolling.native, 'none');
        assert.equal(scrolling.overlay, 'true');
        assert.equal(scrolling.tracks, 2);
        assert.ok(Math.abs(scrolling.popupWidth - scrolling.rowWidth) <= 1, JSON.stringify(scrolling));
        await colorRow.click();

        await block.locator('[data-glow-preset="native"]').click();
        await block.locator('[data-glow-native-note]').waitFor({ state: 'visible', timeout: 5_000 });
        const fields = await block.locator('[data-glow-field]').evaluateAll((nodes) => nodes
          .filter((node) => node.getClientRects().length > 0).map((node) => (node as HTMLElement).dataset.glowField));
        assert.deepEqual(fields, ['speed'], `${viewport.name}: under "glass original" there is still a slider that controls nothing`);
        assert.equal(await block.locator('[data-glow-colours]').isVisible(), false);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    }
  });

  it('Stats page selected stat card: a 2px outline layered above the footnote band, corners following the card, contact shadow removed', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/stats', DESKTOP);
    try {
      const page = opened.page;
      const tab = page.locator('#stats [role="tab"][data-selected]').first();
      await tab.waitFor({ timeout: 15_000 });
      await settle(page);
      const ring = await tokenColor(page, '.peach-react', '--color-border-focus-ring');
      const shown = await tab.evaluate((element) => {
        const card = getComputedStyle(element);
        const after = getComputedStyle(element, '::after');
        const footer = element.querySelector('small')!;
        const other = document.querySelector('#stats [role="tab"]:not([data-selected])')!;
        // `shadow-none` is five transparent 0px layers, not a literal none: check whether any layer carries color.
        const shadowVisible = [...card.boxShadow.matchAll(/rgba?\([^)]*\)/g)]
          .some((match) => !/, 0\)$/.test(match[0]));
        return {
          shadowVisible, position: card.position, radius: card.borderRadius,
          after: {
            content: after.content, position: after.position, width: after.borderTopWidth,
            color: after.borderTopColor, radius: after.borderRadius, z: after.zIndex,
            inset: [after.top, after.right, after.bottom, after.left],
          },
          footerFace: getComputedStyle(footer).backgroundColor,
          otherAfter: getComputedStyle(other, '::after').content,
        };
      });
      assert.equal(shown.shadowVisible, false, 'The selected card still carries its contact shadow');
      assert.equal(shown.position, 'relative');
      assert.equal(shown.after.content, '""', 'The selected card never painted its overlay');
      assert.equal(shown.after.position, 'absolute');
      assert.deepEqual(shown.after.inset, ['0px', '0px', '0px', '0px'], 'The overlay never fills the whole card');
      assert.deepEqual([shown.after.width, shown.after.color], ['2px', ring], 'The outline is not the 2px focus ring color');
      assert.equal(shown.after.radius, shown.radius, 'The overlay\'s radius disagrees with the card\'s');
      assert.ok(Number(shown.after.z) >= 1, `Overlay z-index ${shown.after.z} would be covered by the footnote band`);
      assert.notEqual(shown.footerFace, 'rgba(0, 0, 0, 0)', 'The footnote strip has no background; this case guards the ring drawing on top of it');
      assert.equal(shown.otherAfter, 'none', 'Unselected cards painted the overlay too');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The index page container does not clip horizontally: the filter glass shadow spreads on both sides and the page does not overflow', { timeout: 60_000 }, async () => {
    const opened = await openIndexPage(browser, '/tags');
    try {
      const page = opened.page;
      const clip = await page.evaluate(() => {
        const index = document.querySelector('#index')!;
        return {
          overflow: getComputedStyle(index).overflowX,
          spill: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      assert.equal(clip.overflow, 'visible', '#index clips horizontally, cutting the glass shadow into straight edges on both sides');
      assert.equal(clip.spill, 0, 'Without clipping the page gains a horizontal scrollbar');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The tag page skeleton already lays that filter glass; when React lands, the glass and the first group of content stay in place', { timeout: 60_000 }, async () => {
    /* Measure the skeleton and the real page separately: the glass's position and size, and the top edge of the leading group's content. Pill, count, and first letter wait for data
       and are placeholders in the skeleton; the view toggle is already at its final setting at this moment. */
    const opened = await visit(browser, '/tags', DESKTOP);
    try {
      const page = opened.page;
      await page.route('**/api/index?**', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ items: [{ k: 'Nympho', n: 4, cat: 'role' }, { k: 'Secretary OL', n: 2, cat: 'scene' },
          { k: 'BDSM', n: 3, cat: 'role' }], has_more: false, categories: { role: 2, scene: 1 } }),
      }));
      const release = await holdApi(page);
      await page.reload({ waitUntil: 'load' });
      await page.locator('#index [data-skeleton^="tags/"]').waitFor({ timeout: 15_000 });
      const measure = (glass: string, group: string, view: string) => page.evaluate(([glassSelector, groupSelector, viewSelector]) => {
        const rect = (selector: string) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null;
        };
        const [first, second] = [...document.querySelectorAll(groupSelector)].map((node) => node.getBoundingClientRect());
        return { glass: rect(glassSelector), group: rect(groupSelector),
          gap: first && second ? second.top - first.bottom : null,
          pills: document.querySelectorAll(`${glassSelector} [data-filter-row="top"] > *`).length,
          view: rect(`${glassSelector} [data-filter-row="bottom"] ${viewSelector}`) };
      }, [glass, group, view] as const);
      const skeleton = await measure('#index [data-filter-glass]', '#index [data-skeleton] section', '.iconswitch');
      release();
      await page.locator('#index [data-alphabet]').waitFor({ timeout: 15_000 });
      await settle(page);
      const live = await measure('#index [data-filter-glass]', '#index [data-alpha-group]', '[aria-label="Tag view"]');
      assert.ok(skeleton.glass && skeleton.group && skeleton.view, 'The tab skeleton is missing the filter glass, the leading group, or the view switch');
      assert.ok(skeleton.pills > 0, 'The skeleton glass\'s top row lays no pill placeholders');
      assert.ok(live.glass && live.group && live.view, 'After takeover, the filter glass, leading group, or view switch cannot be found');
      for (const key of ['top', 'left', 'width', 'height'] as const) {
        assert.ok(Math.abs(skeleton.glass![key] - live.glass![key]) <= 1,
          `The filter glass's ${key} jumped at takeover: skeleton ${skeleton.glass![key]}, after takeover ${live.glass![key]}`);
      }
      assert.ok(Math.abs(skeleton.group!.top - live.group!.top) <= 1,
        `The top edge of the leading group's content jumped at takeover: skeleton ${skeleton.group!.top}, after takeover ${live.group!.top}`);
      assert.ok(skeleton.gap !== null && live.gap !== null && Math.abs(skeleton.gap - live.gap) <= 1,
        `The alphabetical groups' spacing differs between skeleton and takeover: skeleton ${skeleton.gap}, after takeover ${live.gap}`);
      assert.ok(Math.abs(skeleton.view!.top - live.view!.top) <= 1 && Math.abs(skeleton.view!.left - live.view!.left) <= 1,
        `View switch moved between skeleton and takeover: skeleton (${skeleton.view!.left}, ${skeleton.view!.top}), after takeover (${live.view!.left}, ${live.view!.top})`);
    } finally {
      await opened.close();
    }
  });

  it('The performer page skeleton already lays the identity category row; when React lands, the category row and roster grid stay in place', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/performers', DESKTOP);
    try {
      const page = opened.page;
      await page.route('**/api/index?**', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ items: [{ k: '七海ひな', n: 4 }, { k: 'Mira', n: 2 }], has_more: false,
          categories: { japanese_av: 1, western: 1 } }),
      }));
      const release = await holdApi(page);
      await page.reload({ waitUntil: 'load' });
      await page.locator('#index [data-skeleton^="index/performers/"]').waitFor({ timeout: 15_000 });
      const measure = (cell: string) => page.evaluate((cellSelector) => {
        const row = document.querySelector('#index [aria-label="Identity groups"]');
        const box = row?.getBoundingClientRect();
        const first = row?.querySelector('[aria-pressed="true"]')?.getBoundingClientRect();
        return { row: box ? { top: box.top, left: box.left, height: box.height } : null,
          pressed: first ? { width: first.width, height: first.height } : null,
          cell: document.querySelector(cellSelector)?.getBoundingClientRect().top ?? null };
      }, cell);
      const skeleton = await measure('#index [data-skeleton] .icell');
      release();
      await page.locator('#index [data-index-cell]').first().waitFor({ timeout: 15_000 });
      await settle(page);
      const live = await measure('#index [data-index-cell]');
      assert.ok(skeleton.row && skeleton.pressed && skeleton.cell !== null, `The talent page skeleton is missing the identity category row or roster cells: ${JSON.stringify(skeleton)}`);
      assert.ok(live.row && live.pressed && live.cell !== null, `Identity category row or roster cell not found after takeover: ${JSON.stringify(live)}`);
      for (const key of ['top', 'left', 'height'] as const) {
        assert.ok(Math.abs(skeleton.row![key] - live.row![key]) <= 1,
          `The identity classification row's ${key} jumped at takeover: skeleton ${skeleton.row![key]}, after takeover ${live.row![key]}`);
      }
      assert.deepEqual(skeleton.pressed, live.pressed, 'The selected category key changed size at takeover');
      assert.ok(Math.abs(skeleton.cell! - live.cell!) <= 1, `The roster's first cell jumps at takeover: skeleton ${skeleton.cell}, after takeover ${live.cell}`);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of VIEWPORTS) {
    it(`The home sticky filter bar's top edge stays transparent in dark and light themes (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openHome(browser, viewport);
      try {
        const page = opened.page;
        await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div style="height:200vh"></div>'));
        await page.evaluate(() => window.scrollTo(0, 600));
        await page.waitForFunction(() => document.querySelector('[data-filter-glass]')?.hasAttribute('data-stuck'));
        for (const theme of ['light', 'dark']) {
          const style = await page.evaluate(value => {
            document.documentElement.dataset.theme = value;
            const filter = document.querySelector('[data-filter-glass]')!;
            return { content: getComputedStyle(filter, '::before').content, shadow: getComputedStyle(filter).boxShadow };
          }, theme);
          assert.equal(style.content, 'none');
          assert.match(style.shadow, /inset/);
          await page.locator('[data-filter-glass]').screenshot({ path: `../build/sticky-${viewport.name}-${theme}.png` });
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  it('The stuck filter glass uses a lifted shadow, keeping a transparent gap at its top edge in both themes', { timeout: 60_000 }, async () => {
    const opened = await openIndexPage(browser, '/tags');
    try {
      const page = opened.page;
      const read = () => page.evaluate(() => {
        const glass = document.querySelector('[data-filter-glass]')!;
        const root = getComputedStyle(document.documentElement);
        return {
          stuck: glass.hasAttribute('data-stuck'),
          shadow: getComputedStyle(glass).boxShadow,
          strip: getComputedStyle(glass, '::before'),
          lift: root.getPropertyValue('--glass-lift'),
          rest: root.getPropertyValue('--glass-shadow'),
        };
      });
      const readStrip = () => page.evaluate(() => {
        const strip = getComputedStyle(document.querySelector('[data-filter-glass]')!, '::before');
        return { content: strip.content, top: strip.top, height: strip.height, z: strip.zIndex, mask: strip.maskImage };
      });
      const resting = await read();
      assert.equal(resting.stuck, false, 'Marked stuck before any scrolling');
      assert.equal(farthestShadow(resting.shadow), farthestShadow(resting.rest), 'The resting shadow is not --glass-shadow');
      assert.equal((await readStrip()).content, 'none', 'Scrim band drawn in the idle state');
      // The stub data has only two tags, so the page is too short to scroll: pad some height, then scroll.
      await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div style="height:200vh"></div>'));
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForFunction(() => document.querySelector('[data-filter-glass]')!.hasAttribute('data-stuck'),
        undefined, { timeout: 5_000 });
      const stuck = await read();
      const strip = await readStrip();
      assert.equal(farthestShadow(stuck.shadow), farthestShadow(stuck.lift), 'The shadow after sticking to the top is not --glass-lift');
      assert.ok(farthestShadow(stuck.shadow) > farthestShadow(resting.shadow), 'Shadow not raised once stuck to top');
      assert.match(stuck.shadow, /inset/, 'After sticking, the four inset rim lines vanished');
      assert.equal(strip.content, 'none');
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme);
        assert.equal((await readStrip()).content, 'none', `The ${theme} theme has a masking band at the sticky top edge`);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => !document.querySelector('[data-filter-glass]')!.hasAttribute('data-stuck'),
        undefined, { timeout: 5_000 });
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Image lightbox: portrait images fit fully by height, yielding room above and below for the toolbar and thumbnail strip, and left and right for the pager keys', { timeout: 60_000 }, async () => {
    const opened = await openLightbox(browser, { count: 3, width: 1200, height: 4000 });
    try {
      const read = await opened.page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON() as DOMRect;
        return { img: rect('[data-photo-main] .swiper-slide-active img'), bar: rect('[data-photo-bar]'),
          strip: rect('[data-photo-strip]'), back: rect('[data-photo-nav="back"]'), viewport: innerHeight };
      });
      const { img } = read;
      assert.ok(img.top >= 24 - .5 && img.bottom <= read.viewport - 148 + .5, `The large image exceeds the vertical safe area: ${img.top}-${img.bottom}`);
      assert.ok(Math.abs(img.width / img.height - 1200 / 4000) < .01, `The portrait image is stretched: ${img.width}x${img.height}`);
      assert.ok(Math.abs(img.left + img.width / 2 - DESKTOP.width / 2) <= 1, 'Large image not horizontally centered');
      assert.ok(read.bar.bottom <= read.strip.top, 'The toolbar covers the thumbnail strip');
      assert.equal(Math.round(read.viewport - read.strip.bottom), 14);
      assert.ok(read.back.right <= 72, 'The page keys reach into the image row');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('With a single image the lightbox draws no thumbnail strip, page dots, or arrows, giving the bottom space back to the image', { timeout: 60_000 }, async () => {
    const opened = await openLightbox(browser, { count: 1, width: 4000, height: 3000 });
    try {
      const read = await opened.page.evaluate(() => {
        const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
        return {
          strip: style('[data-photo-strip]').display,
          nav: [...document.querySelectorAll('[data-photo-nav]')].map((button) => getComputedStyle(button).display),
          pagination: document.querySelectorAll('[data-photo-pagination]').length,
          padding: style('[data-photo-main] .swiper-zoom-container').paddingBottom,
          count: document.querySelector('[data-photo-count]')!.textContent,
        };
      });
      assert.deepEqual(read, { strip: 'none', nav: ['none', 'none'], pagination: 0, padding: '76px', count: '1 / 1' });
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Lightbox round buttons: the icon sits on the circle center with round line caps and no fill; the forward button is the same arrow rotated half a turn, and the one at the end steps aside', { timeout: 60_000 }, async () => {
    const opened = await openLightbox(browser, { count: 3, width: 4000, height: 3000 });
    try {
      const read = await opened.page.evaluate(() => [
        '[data-photo-close]', '[data-photo-nav="back"]', '[data-photo-nav="fwd"]', '[data-photo-detail-toggle]',
      ].map((selector) => {
        const button = document.querySelector(selector)!, svg = button.querySelector('svg')!;
        const outer = button.getBoundingClientRect(), inner = svg.getBoundingClientRect(), style = getComputedStyle(svg);
        return {
          selector, glyph: svg.querySelector('use')?.getAttribute('href'),
          off: Math.max(Math.abs(outer.left + outer.width / 2 - inner.left - inner.width / 2),
            Math.abs(outer.top + outer.height / 2 - inner.top - inner.height / 2)),
          fill: style.fill, cap: style.strokeLinecap, turn: style.transform,
          visibility: getComputedStyle(button).visibility,
        };
      }));
      for (const icon of read) {
        assert.ok(icon.off <= .5, `${icon.selector} icon is off the circle center by ${icon.off}px`);
        assert.equal(icon.fill, 'none', `${icon.selector}'s outlined icon got filled in`);
        // Lucide's info dot is a .01-length short line that shrinks into an invisible dash without round caps.
        assert.equal(icon.cap, 'round', `${icon.selector}'s line caps are not round`);
      }
      const [close, back, fwd, info] = read;
      assert.equal(close.glyph, '#i-x');
      assert.equal(info.glyph, '#i-info');
      assert.deepEqual([back.glyph, fwd.glyph], ['#i-chevron-left', '#i-chevron-left']);
      assert.equal(back.turn, 'none');
      assert.match(fwd.turn, /^matrix\(-1, /, 'The forward key\'s arrow never rotated half a turn');
      assert.deepEqual([back.visibility, fwd.visibility], ['hidden', 'visible'], 'The back button should yield when stopped on the first slide');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Follows page: title 24px, 20px on narrow screens; pill spacing matches home at 7px; counts use monospace', { timeout: 90_000 }, async () => {
    const read = (page: Page) => page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      return {
        title: style('[data-follow-title]').fontSize,
        gaps: ['[data-follow-filter-glass] [data-entity-states]', '[data-follow-filter-glass] [data-entity-tags]']
          .map((selector) => style(selector).columnGap),
        readout: style('[data-follow-readout]').fontFamily,
      };
    });
    const wide = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const shown = await read(wide.page);
      assert.equal(shown.title, '32px');
      assert.deepEqual(shown.gaps, ['7px', '7px'], 'The follows page\'s pill spacing differs from home\'s');
      assert.match(shown.readout, /Cascadia Mono|Consolas|monospace/, `The reading is not monospaced: ${shown.readout}`);
      assert.deepEqual(wide.problems, []);
    } finally {
      await wide.close();
    }
    const narrow = await openFollowFeed(browser, '/follow', MOBILE);
    try {
      assert.equal((await read(narrow.page)).title, '24px', 'Narrow-screen titles use the unified page title size');
      assert.deepEqual(narrow.problems, []);
    } finally {
      await narrow.close();
    }
  });
});
