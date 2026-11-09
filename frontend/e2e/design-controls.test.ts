/* Design decisions: controls, states and the home page top. Reads `getComputedStyle` to assert the appearance the user set; shared stubs and browser lifecycle live in `design-fixture.ts`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { expectBody, settle } from './harness.ts';
import { ITEM, openItemPage } from './item-fixture.ts';
import {
  DESKTOP, MOBILE, tokenColor, openAccess, settledRun, openActivity, qualityGoal, openQualityGoals,
  openScraping, openProcessing, openCatalog, openCatalogBars, openCatalogFixture, RUNNING_JOB, FAILED_JOB,
  installDesignBrowser, openReview,
} from './design-fixture.ts';

describe('Design decisions: controls, states, and the home top', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });

  it('Review state reuses the home glass control sizes; empty categories keep the selected glass and the state entry', { timeout: 60_000 }, async () => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const home = await openCatalogBars(browser, viewport);
      let reference;
      try {
        reference = await home.page.locator('[data-catalog-view]').first().evaluate(element => {
          const style = getComputedStyle(element);
          return { height: element.getBoundingClientRect().height, fontSize: style.fontSize,
            padding: style.padding, background: style.backgroundColor };
        });
      } finally {
        await home.close();
      }
      const opened = await openReview(browser, undefined, viewport);
      try {
        const filter = opened.page.locator('[data-review-filter]');
        const state = filter.locator('[data-entity-state]').first();
        const style = await state.evaluate(element => {
          const computed = getComputedStyle(element);
          return { height: element.getBoundingClientRect().height, fontSize: computed.fontSize,
            padding: computed.padding, background: computed.backgroundColor };
        });
        assert.deepEqual(style, reference);
        const sameRow = await filter.evaluate(element => {
          const top = element.querySelector('[data-filter-row="top"]')!.getBoundingClientRect();
          const bottom = element.querySelector('[data-filter-row="bottom"]')!.getBoundingClientRect();
          return Math.abs(top.top - bottom.top) < 1;
        });
        assert.equal(sameRow, !viewport.mobile, 'Full width in one row, wraps on narrow screens');
        const divider = await filter.locator('[data-entity-sep]').evaluate(element => getComputedStyle(element).visibility);
        assert.equal(divider, viewport.mobile ? 'hidden' : 'visible');
        await filter.getByRole('button', { name: /^已忽略/ }).click();
        await settle(opened.page);
        const geometry = await filter.evaluate(element => {
          const button = element.querySelector('[data-entity-state][aria-pressed="true"]')!;
          const pane = element.querySelector<HTMLElement>('[data-view-glide]')!;
          const active = button.getBoundingClientRect(), glass = pane.getBoundingClientRect();
          return { visible: !pane.hidden, delta: Math.abs(active.left - glass.left),
            widthDelta: Math.abs(active.width - glass.width),
            overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(geometry.visible, true);
        assert.ok(geometry.delta < 1 && geometry.widthDelta < 1, JSON.stringify(geometry));
        assert.equal(geometry.overflow, false);
        assert.equal(await filter.getByRole('button', { name: /^待处理/ }).count(), 1);
      } finally {
        await opened.close();
      }
    }
  });

  it('Focusing a React input draws only the BoardUI outline; the legacy stylesheet focus ring stays out', { timeout: 60_000 }, async () => {
    const opened = await openAccess(browser);
    try {
      const input = opened.form.locator('#access-password');
      await input.focus();
      const style = await input.evaluate((element) => ({
        outline: getComputedStyle(element).outlineStyle,
        // TextField sets the outer field's role to presentation through GroupContext.
        ring: getComputedStyle(element.closest('[role="presentation"]')!).boxShadow,
      }));
      assert.equal(style.outline, 'none', 'The input drew its own outline: the old global :focus-visible rule leaked into the React subtree');
      assert.notEqual(style.ring, 'none', 'Outer frame missing the focus outline');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Details stage focus: during the skeleton it stays on the popover itself with no focus ring, and moves to the close button once content arrives', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, '/', DESKTOP, { ready: `#grid [data-media-card][data-id="${ITEM.plain}"]` });
    try {
      const page = opened.page;
      let release = () => {};
      const held = new Promise<void>((resolve) => { release = resolve });
      await page.route((url) => url.pathname === '/api/item', async (route) => { await held; await route.fallback() });
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"] [data-media-title]`).first().press('Enter');
      await page.locator('#stage[open] [data-skeleton="detail"]').waitFor();
      /* Same when the keyboard is open: the skeleton has nothing operable, and a focus ring on the floating window's outer edge is just noise. */
      const waiting = await page.evaluate(() => {
        const focused = document.activeElement as HTMLElement;
        return { id: focused?.id, outline: getComputedStyle(focused).outlineStyle, visible: focused.matches(':focus-visible') };
      });
      assert.equal(waiting.id, 'stage', 'Focus is not on the popover during the skeleton');
      assert.equal(waiting.outline, 'none', `The popover painted a focus ring during the skeleton phase (:focus-visible=${waiting.visible})`);
      release();
      await page.locator('#stage[open] [data-item-side]').waitFor();
      await page.waitForFunction(() => document.activeElement?.id === 'closeStage', null, { timeout: 5_000 });
      assert.deepEqual(opened.problems.filter((line) => !line.includes('VIDEOJS')), []);
    } finally {
      await opened.close();
    }
  });

  it('Semantic colors are identical inside and outside the React subtree: every --color-* on the board.css root paints the same pixel on both sides', { timeout: 60_000 }, async () => {
    const opened = await openAccess(browser);
    try {
      const shell = await opened.form.locator('#access-password').evaluate(
        (element) => getComputedStyle(element.closest('[role="presentation"]')!).backgroundColor);
      // BoardUI theme.css changed light neutral-200 to #ebebeb, not Tailwind's default #e5e5e5.
      assert.equal(shell, 'rgb(235, 235, 235)');
      // Skeletons outside the island read the root value and components after takeover read the island value; the same surface must be the same color across frames. Inside the island it is written as oklch,
      // board.css writes hex or references; the literals differ, so paint to pixels before comparing.
      const drift = await opened.form.evaluate((island) => {
        const sheet = [...document.styleSheets].find((candidate) => candidate.href?.includes('/board.css'))!;
        const names = new Set<string>();
        const walk = (rules: CSSRuleList) => {
          for (const rule of rules) {
            if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
            if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(':root')) continue;
            for (const name of rule.style) if (name.startsWith('--color-') && !name.startsWith('--color-accent-')) names.add(name);
          }
        };
        walk(sheet.cssRules);
        const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        const pixel = (host: Element, name: string) => {
          const probe = host.appendChild(document.createElement('i'));
          probe.style.color = `var(${name})`;
          paint.clearRect(0, 0, 1, 1);
          paint.fillStyle = getComputedStyle(probe).color;
          paint.fillRect(0, 0, 1, 1);
          probe.remove();
          return [...paint.getImageData(0, 0, 1, 1).data].join(',');
        };
        const root = document.documentElement;
        const before = { theme: root.dataset.theme, dark: root.classList.contains('dark') };
        const drift: string[] = [];
        for (const theme of ['light', 'dark']) {
          root.dataset.theme = theme;
          root.classList.toggle('dark', theme === 'dark');
          for (const name of names) {
            const page = pixel(document.body, name), inside = pixel(island, name);
            if (page !== inside) drift.push(`${theme} ${name}: outside the island ${page}, inside the island ${inside}`);
          }
        }
        if (before.theme === undefined) delete root.dataset.theme;
        else root.dataset.theme = before.theme;
        root.classList.toggle('dark', before.dark);
        return { count: names.size, drift };
      });
      assert.ok(drift.count >= 15, `Read only ${drift.count} semantic colors from the board.css root`);
      assert.deepEqual(drift.drift, []);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The persistent warning is a status color block, not sharing the gray small print with field descriptions', { timeout: 60_000 }, async () => {
    const opened = await openAccess(browser);
    try {
      await opened.form.getByRole('checkbox', { name: 'Disable access password', exact: true }).locator('xpath=ancestor::label[1]').click({ timeout: 5_000 });
      const note = opened.form.locator('[role="note"]');
      await note.waitFor({ timeout: 5_000 });
      const surface = await note.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.notEqual(surface, 'rgba(0, 0, 0, 0)', 'Warning has no background');
      assert.equal(surface, await tokenColor(opened.page, '.peach-react', '--color-status-yellow-background'));
      const ink = await note.evaluate((element) => getComputedStyle(element).color);
      assert.equal(await opened.form.locator('input[type="password"]').count(), 0);
      const hint = await tokenColor(opened.page, '.peach-react', '--color-text-secondary');
      assert.notEqual(ink, hint, 'Warning text and field description share a color');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('A failed run turns the whole card\'s border danger-colored while the finish reason stays body-colored', { timeout: 60_000 }, async () => {
    const opened = await openActivity(browser, [
      settledRun(1, 'failed', 'Scan and scrape'), settledRun(2, 'succeeded', 'Update check'),
    ]);
    try {
      const danger = await tokenColor(opened.page, '.peach-react', '--color-border-error-default');
      // The border is drawn as an outline that doesn't occupy the box: comparing only color would let through a 'colored but zero-width, never actually drawn' line, so compare width too.
      const frame = (status: string) => opened.page.locator(`li[data-status="${status}"]`)
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return style.outlineStyle === 'none' ? '' : `${style.outlineWidth} ${style.outlineColor}`;
        });
      assert.equal(await frame('failed'), `1px ${danger}`, 'The failed card\'s border is not danger colored');
      assert.notEqual(await frame('succeeded'), `1px ${danger}`, 'Cards that did not fail also use danger borders');
      // Reading red text line by line across a dozen rows is slower than glancing at which card's frame is red: the reason line keeps body text color.
      const reason = await opened.page.locator('li[data-status="failed"] [data-task-error]')
        .evaluate((element) => getComputedStyle(element).color);
      assert.notEqual(reason, danger, 'The end reason line is painted in the danger color');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Task results: green for success, red for failure and cancellation, yellow for interruption, neutral for queued', { timeout: 60_000 }, async () => {
    const opened = await openActivity(browser, [
      settledRun(1, 'succeeded', 'Update check'), settledRun(2, 'failed', 'Scan and scrape'),
      settledRun(3, 'cancelled', 'Bulk actions'), settledRun(4, 'pending', 'Command-line batch processing'),
      settledRun(5, 'interrupted', 'Detail scraping'),
    ]);
    try {
      const badge = (status: string) => opened.page.locator(`li[data-status="${status}"] span`).first()
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      const token = (name: string) => tokenColor(opened.page, '.peach-react', name);
      assert.equal(await badge('succeeded'), await token('--color-status-lime-background'));
      assert.equal(await badge('failed'), await token('--color-status-rose-background'));
      assert.equal(await badge('interrupted'), await token('--color-status-yellow-background'));
      assert.equal(await badge('cancelled'), await token('--color-status-rose-background'));
      assert.equal(await badge('pending'), await token('--color-background-tertiary-default'));
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The HD card cover is a 150px-wide 16/10 block; long titles show from the start, two lines at most', { timeout: 60_000 }, async () => {
    const long = 'This is a file name so long it must be truncated to fit, used to watch that the title shows from the start and the code is not cut off.mp4';
    const opened = await openQualityGoals(browser, [
      qualityGoal(1, long), qualityGoal(2, 'short.mp4'),
    ]);
    try {
      const cover = opened.page.locator('li[data-goal-id="1"] button').first();
      const box = await cover.evaluate((element) => ({
        width: getComputedStyle(element).width,
        ratio: getComputedStyle(element).aspectRatio,
      }));
      assert.equal(box.width, '150px');
      assert.equal(box.ratio.replaceAll(' ', ''), '16/10');
      const title = opened.page.locator('li[data-goal-id="1"] h3 button');
      await title.waitFor({ timeout: 5_000 });
      const shown = await title.evaluate((element) => ({
        clamp: getComputedStyle(element).webkitLineClamp,
        middle: element.classList.contains('middle-truncated') || element.hasAttribute('data-middle-truncate'),
        text: element.textContent,
        hint: element.getAttribute('title'),
      }));
      assert.equal(shown.clamp, '2');
      assert.equal(shown.middle, false, 'Title still truncated in the middle');
      assert.equal(shown.text, long);
      assert.equal(shown.hint, long);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Under a source card only the write key is primary and the rest are secondary', { timeout: 60_000 }, async () => {
    const opened = await openScraping(browser);
    try {
      const card = opened.page.locator('form[aria-label="Demo source Alpha"]');
      const fill = (name: string) => card.getByRole('button', { name, exact: true })
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      // For a source that takes cookies and has one saved, three keys below: undo, check, save; only save writes.
      assert.equal(await fill('Save'), await tokenColor(opened.page, '.peach-react', '--color-button-primary'));
      const secondary = await tokenColor(opened.page, '.peach-react', '--color-background-primary-default');
      assert.equal(await fill('Check connection'), secondary, 'Check connection renders as a primary button');
      assert.equal(await fill('Revoke cookies'), secondary, 'The undo cookie rendered as a primary button');
      // A source with no saved Cookie has nothing to revoke, so that button is not drawn.
      const plain = opened.page.locator('form[aria-label="Demo source Beta"]');
      assert.equal(await plain.getByRole('button', { name: 'Revoke cookies', exact: true }).count(), 0);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The persistent task surface uses a neutral color while running, status red on failure, and survives across pages', { timeout: 60_000 }, async () => {
    const running = await openProcessing(browser, '/', RUNNING_JOB);
    try {
      const banner = running.page.locator('#toasts [data-processing-dock][role="status"]');
      await banner.waitFor({ state: 'visible', timeout: 15_000 });
      assert.match(await banner.innerText(), /采集缺失资料 · 38 \/ 100/);
      // The circle length is pinned to 100, so the drawn arc is the percentage itself.
      assert.equal(await banner.locator('[role="progressbar"]').getAttribute('aria-valuenow'), '38');
      // The criterion is "not a tone color", not pinned to one specific fill: the running item uses a neutral fill, and yellow and red stay for when something goes wrong.
      const tint = await banner.evaluate((element) => getComputedStyle(element).backgroundColor);
      for (const tone of ['--color-background-tertiary-error', '--color-status-yellow-background']) {
        assert.notEqual(tint, await tokenColor(running.page, '.peach-react', tone),
          'A running task is something happening now; with a status background it carries the same weight as "something went wrong"');
      }
    } finally {
      await running.close();
    }

    const failed = await openProcessing(browser, '/', { status: 'failed', error: 'Sources offline' });
    try {
      const banner = failed.page.locator('#toasts [data-processing-dock][role="alert"]');
      await banner.waitFor({ state: 'visible', timeout: 15_000 });
      /* Computed values are now `oklab()`/`oklch()`; the two notations cannot be compared as strings directly, so always read RGBA back
         on a canvas and compare that. */
      const readSurface = () => banner.evaluate((element) => {
        const style = getComputedStyle(element);
        const context = document.createElement('canvas').getContext('2d')!;
        const paint = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data];
        };
        return { base: paint(style.backgroundColor), tint: style.backgroundImage,
          line: paint(style.borderTopColor), ink: paint(style.color),
          button: getComputedStyle(element.querySelector('button[aria-expanded]')!).backgroundColor,
          link: getComputedStyle(element.querySelector('a')!).color };
      });
      for (const theme of ['light', 'dark']) {
        await failed.page.evaluate(value => {
          document.documentElement.dataset.theme = value;
          document.documentElement.classList.toggle('dark', value === 'dark');
        }, theme);
        const surface = await readSurface();
        const errorTint = await tokenColor(failed.page, '.peach-react', '--color-background-tertiary-error');
        assert.equal(surface.base[3], 255, 'Task card base is opaque');
        assert.equal(surface.tint, `linear-gradient(${errorTint}, ${errorTint})`);
        assert.equal(surface.button, await tokenColor(failed.page, '.peach-react', '--color-background-primary-default'));
        assert.equal(surface.link, await tokenColor(failed.page, '.peach-react', '--color-text-secondary'));
        for (const at of [0, 1, 2]) {
          assert.ok(Math.abs(surface.line[at]! - surface.ink[at]!) <= 2,
            `The banner's border does not follow its tone: border ${surface.line} and text ${surface.ink} are not the same color`);
        }
        assert.ok(surface.line[3]! < surface.ink[3]!, 'State dividers run lighter than body text');
      }
      // The data management subpage keeps the same run's unhandled failure notice.
      await failed.page.goto(new URL('/junk-files', failed.page.url()).href, { waitUntil: 'load' });
      await failed.page.locator('[data-junk-filters]').waitFor({ state: 'visible', timeout: 15_000 });
      const retainedFailure = failed.page.locator('#toasts [data-processing-dock][role="alert"]');
      await retainedFailure.waitFor({ state: 'visible', timeout: 15_000 });
      assert.equal(await retainedFailure.count(), 1,
        'Unhandled failures remain findable after paging away');
    } finally {
      await failed.close();
    }
  });

  it('The scan card\'s progress bar uses the focus-ring color, the base slot is the third-level background, and while a task is running the sync key is marked unavailable but still focusable', { timeout: 60_000 }, async () => {
    const opened = await openProcessing(browser, '/data-cleanup', RUNNING_JOB);
    try {
      const card = opened.page.locator('section[aria-label="Scan and scrape"]');
      await card.waitFor({ state: 'visible', timeout: 15_000 });
      const bar = card.locator('[role="progressbar"]');
      assert.equal(await bar.getAttribute('aria-valuenow'), '38');
      assert.equal(await bar.getAttribute('aria-valuemax'), '100');
      const fill = (at: number) =>
        bar.locator('rect').nth(at).evaluate((element) => getComputedStyle(element).fill);
      assert.equal(await fill(0),
        await tokenColor(opened.page, '.peach-react', '--color-background-tertiary-default'));
      assert.equal(await fill(1),
        await tokenColor(opened.page, '.peach-react', '--color-border-focus-ring'));
      // When a task is already running, only mark aria-disabled, don't change disabled: the control stays focusable, and clicking is explained by the card for why it didn't start.
      const scan = card.getByRole('button', { name: 'Sync new files', exact: true });
      assert.equal(await scan.getAttribute('aria-disabled'), 'true');
      assert.equal(await scan.getAttribute('aria-busy'), null);
      assert.equal(await scan.evaluate((element) => (element as HTMLButtonElement).disabled), false,
        'Guarding with native disabled would keep the button from receiving focus at all');
      const split = card.locator('[data-split-button]');
      const parts = split.locator(':scope > button');
      assert.equal(await parts.count(), 2, 'The split button did not keep its primary action and menu regions separate');
      const boxes = await parts.evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, height: rect.height };
      }));
      assert.ok(Math.abs(boxes[0]!.right - boxes[1]!.left) < 0.5,
        'The split button leaves a gap between its halves');
      assert.equal(boxes[0]!.height, boxes[1]!.height, 'The split button halves differ in height');
      const divider = await parts.nth(1).evaluate((element) => {
        const style = getComputedStyle(element, '::after');
        return { width: style.width, color: style.backgroundColor };
      });
      assert.equal(divider.width, '1px', 'The split button divider width is wrong');
      assert.notEqual(divider.color, 'rgba(0, 0, 0, 0)', 'The split button divider has no color');
    } finally {
      await opened.close();
    }
  });

  it('The two halves of a split button raise fill independently: hovering one half changes only that half, and the center seam line stays', { timeout: 60_000 }, async () => {
    // Measured from Geist (`vercel-geist-split-button.md`, "Hover"): each half is its own button with its own background,
    // Hovering lifts only the one under the pointer; the separator is the trigger tier's `::before`, `left:-1px` laid over the last column of the primary action,
    // Full height, and the color does not change on hover.
    const opened = await openProcessing(browser, '/data-cleanup', { status: 'idle' });
    try {
      // The skeleton card shares the name and structure; measurement waits until React takes over and neither half carries skeleton markers.
      const split = opened.page.locator('section[aria-label="Scan and collect"] [data-split-button]:not(:has(> [data-skeleton-action]))');
      await split.waitFor({ state: 'visible', timeout: 15_000 });
      await settle(opened.page);
      const parts = split.locator(':scope > button');
      const faces = () => parts.evaluateAll((buttons) => buttons.map((button) => {
        const style = getComputedStyle(button), lift = getComputedStyle(button, '::before');
        return { fill: style.backgroundImage, lift: lift.opacity, ink: style.color };
      }));
      const seam = () => parts.nth(1).evaluate((element) => {
        const line = getComputedStyle(element, '::after');
        return { color: line.backgroundColor, width: line.width, left: line.left,
          height: line.height, full: `${element.getBoundingClientRect().height}px`,
          clip: getComputedStyle(element).overflowX };
      });
      assert.equal(await split.evaluate((element) => getComputedStyle(element).backgroundImage), 'none',
        'With the background painted on the whole group the two halves cannot each lift their fill');
      await opened.page.mouse.move(0, 0);
      const rest = await faces();
      assert.match(rest[0]!.fill, /gradient/, 'The primary action\'s half has no blue fill of its own');
      assert.equal(rest[1]!.fill, rest[0]!.fill, 'The two halves at rest use different fill tiers');
      assert.deepEqual(rest.map((face) => face.lift), ['0', '0'], 'Fill raised without hover');
      const line = await seam();
      assert.equal(line.width, '1px');
      assert.equal(line.left, '-1px', 'The divider should cover the primary action\'s last column without taking the trigger tier\'s width');
      assert.equal(line.height, line.full, 'Divider does not span full height');
      assert.equal(line.clip, 'visible', 'The trigger tier clips the divider that reaches toward its left neighbor, so it is invisible on screen');
      assert.notEqual(line.color, 'rgba(0, 0, 0, 0)');
      for (const [at, other] of [[0, 1], [1, 0]] as const) {
        await parts.nth(at).hover();
        // The hover layer fades over 150ms, so reading immediately lands mid-fade; compare after it reaches its end state.
        await opened.page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
        const hovered = await faces();
        assert.equal(hovered[at]!.lift, '1', `Hovering half ${at + 1} does not lift the fill`);
        assert.equal(hovered[other]!.lift, '0', `Hovering half ${at + 1} also changed the other half`);
        assert.deepEqual(hovered.map((face) => face.ink), rest.map((face) => face.ink), 'Hover changes text color');
        assert.deepEqual(await seam(), line, 'Divider changes on hover');
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('In the failure note the retry key sits right, the issue list fills the note, and an overlay scrollbar scrolls it', { timeout: 60_000 }, async () => {
    const opened = await openProcessing(browser, '/data-cleanup', FAILED_JOB);
    try {
      const alert = opened.page.locator('#libraryProcessing [role="alert"]');
      await expectBody(opened.page, '/data-cleanup processing failure notice', [alert], opened.problems);
      await alert.locator('summary').click();
      const list = alert.locator('ul');
      await list.waitFor({ state: 'visible', timeout: 5_000 });
      const geometry = await alert.evaluate((element) => {
        const note = element.getBoundingClientRect();
        const button = element.querySelector('[data-note-action]')!.getBoundingClientRect();
        const items = element.querySelector('ul')!;
        return {
          padding: parseFloat(getComputedStyle(element).paddingRight),
          noteRight: note.right, buttonRight: button.right,
          listRight: items.getBoundingClientRect().right,
          client: items.clientWidth, offset: items.offsetWidth,
          track: !!element.querySelector('.ovtrack'),
        };
      });
      assert.ok(geometry.noteRight - geometry.buttonRight - geometry.padding < 1,
        'Retry and archive are not hugging the notice\'s right padding, so they do not read as this notice\'s actions');
      assert.ok(geometry.noteRight - geometry.listRight - geometry.padding < 1,
        'The issue list never fills the note\'s width');
      assert.equal(geometry.client, geometry.offset, 'The native scrollbar still occupies a column at the list\'s right');
      assert.ok(geometry.track, 'The list never picked up the site-wide overlay scrollbar');
      /* Three sections stack on the same red base: verdict, list, full record. The boundary between entries must be visible, and the full record
         falls back to gray text; it is not what this alert is saying, it is what you dig through after the fact. */
      const layering = await alert.evaluate((element) => {
        const context = document.createElement('canvas').getContext('2d')!;
        const paint = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data];
        };
        // `divide-y` draws the line on each row's bottom edge (except the last), so measure the first row's bottom.
        const first = element.querySelectorAll('li')[0]!;
        const log = element.querySelector('[aria-label="Show in File Explorer"]')!.closest('.text-text-secondary')!.querySelector('p')!;
        return {
          divider: parseFloat(getComputedStyle(first).borderBottomWidth),
          dividerInk: paint(getComputedStyle(first).borderBottomColor),
          logInk: paint(getComputedStyle(log).color),
          bodyInk: paint(getComputedStyle(element).color),
        };
      });
      assert.ok(layering.divider > 0, 'No boundary sits between two details, with dozens running together');
      assert.ok(layering.dividerInk[3]! < layering.bodyInk[3]!, 'Row dividers are as solid as body text');
      assert.ok([0, 1, 2].some((at) => Math.abs(layering.logInk[at]! - layering.bodyInk[at]!) > 8),
        'The full record still follows the red note, reading like yet another problem');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The issues of a run are grouped into a single prompt; “Don\'t ask for 7 days”, the full record, and export all follow it', { timeout: 60_000 }, async () => {
    const notes = { fetching_cover: 84, querying_metadata: 18 };
    const button = '[aria-label="Show in File Explorer"]';
    const reveal = `#libraryProcessing ${button}`;
    const failed = await openProcessing(browser, '/data-cleanup', { ...FAILED_JOB, notes });
    try {
      const alert = failed.page.locator('#libraryProcessing [role="alert"]');
      await expectBody(failed.page, '/data-cleanup failure note and do-not-ask note', [alert], failed.problems);
      assert.ok((await alert.textContent())!.includes('Not asked again for 7 days'), '“Do not ask again for 7 days” was not merged into the failure notice');
      assert.equal(await failed.page.locator('#libraryProcessing [role="note"]').count(), 0,
        'A similar notice is hung next to the failure notice');
      assert.equal(await failed.page.locator(reveal).count(), 1, 'Full record printed in more than one place');
      assert.equal(await alert.locator(button).count(), 1, 'The full record should follow the problem notice');
      assert.equal(await alert.getByRole('button', { name: 'Export the full issue list' }).count(), 1, 'Export did not follow the full record');
      assert.deepEqual(failed.problems, []);
    } finally {
      await failed.close();
    }
    /* A finished run with no failure notice has this prompt as its only log entry point; spacing and padding above and below the divider match. */
    const complete = await openProcessing(browser, '/data-cleanup', {
      status: 'complete', job_id: 'two', issue_count: 3, issues_log: FAILED_JOB.issues_log, notes,
    });
    try {
      const note = complete.page.locator('#libraryProcessing [role="note"]', { hasText: 'Not asked again for 7 days' });
      await expectBody(complete.page, '/data-cleanup do-not-ask note', [note], complete.problems);
      assert.equal(await complete.page.locator(reveal).count(), 1, 'A finished round lost its full record');
      const rhythm = await note.evaluate((element, selector) => {
        const bar = element.querySelector(selector)!.closest('.border-t')!;
        const note = getComputedStyle(element);
        const style = getComputedStyle(bar);
        return { padding: note.paddingTop, gap: note.rowGap, above: style.marginTop, below: style.paddingTop };
      }, button);
      assert.equal(rhythm.above, rhythm.padding, 'The space above the divider differs from the note padding');
      assert.equal(rhythm.below, rhythm.padding, 'The space below the divider differs from the note padding');
      assert.ok(rhythm.gap === 'normal' || rhythm.gap === '0px', 'Extra padding sits between the body and the divider');
      assert.deepEqual(complete.problems, []);
    } finally {
      await complete.close();
    }
  });

  it('Source addresses opened in a new window set both rel values: no session and no referrer', { timeout: 60_000 }, async () => {
    const opened = await openScraping(browser);
    try {
      const link = opened.page.locator('form[aria-label="Demo source A"] a[target="_blank"]');
      assert.equal(await link.getAttribute('href'), 'https://demoa.example/login');
      assert.equal((await link.getAttribute('rel'))!.split(/\s+/).sort().join(' '), 'noopener noreferrer');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The top bar\'s layout key keeps both glyphs and swaps state in place', { timeout: 60_000 }, async () => {
    const opened = await openCatalog(browser);
    try {
      await opened.page.emulateMedia({ reducedMotion: 'no-preference' });
      const button = opened.page.locator('#density');
      const swap = button.locator('[data-icon-swap]');
      await swap.waitFor({ timeout: 5_000 });
      assert.equal(await swap.locator('[data-icon]').count(), 2);
      const before = await swap.getAttribute('data-icon-state');
      await swap.evaluate((element) => { element.setAttribute('data-test-identity', 'density-swap'); });
      await button.click();
      assert.notEqual(await swap.getAttribute('data-icon-state'), before,
        'After pressing it stays on the same glyph');
      assert.equal(await swap.locator('[data-icon]').count(), 2,
        'Switching state must not destroy either glyph');
      await button.click();
      assert.equal(await swap.getAttribute('data-icon-state'), before, 'The second press does not restore the original glyph');
      assert.equal(await button.locator('[data-icon-swap][data-test-identity="density-swap"]').count(), 1,
        'The glyph container rebuilt between two state changes');
    } finally {
      await opened.close();
    }
  });

  it('Numbers start static and pop in on change; filter readings cross-fade in place while keeping their controls', { timeout: 60_000 }, async () => {
    const opened = await openCatalogFixture(browser, (payload, url) => {
      payload.total = url.searchParams.has('q') ? 34 : 12;
    });
    try {
      await opened.page.emulateMedia({ reducedMotion: 'no-preference' });
      const result = await opened.page.evaluate(async () => {
        const { popCount } = await import('/dist/peach-app.js');
        const host = document.createElement('span');
        document.body.append(host);
        popCount(host, '12');
        const firstWasStatic = !host.firstElementChild?.classList.contains('popping');
        popCount(host, '34');
        const digit = host.querySelector<HTMLElement>('.digits.popping > span');
        const style = digit && getComputedStyle(digit);
        const answer = {
          firstWasStatic,
          animationName: style?.animationName || '',
          duration: style?.animationDuration || '',
        };
        host.remove();
        return answer;
      });
      assert.equal(result.firstWasStatic, true, 'First write should not bounce');
      assert.equal(result.animationName, 'digit-pop-in');
      assert.equal(result.duration, '0.25s');

      const page = opened.page;
      const input = page.locator('#q');
      const readout = page.locator('[data-catalog-readout] [data-async-text]');
      const before = await readout.boundingBox();
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve });
      await page.route('**/api/items?**', async route => { await held; await route.fallback() });
      await page.evaluate(() => { Object.assign(window, { countFrame: document.querySelector('[data-catalog-frame]') }) });
      try {
        await input.fill('Count changes');
        await input.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-catalog-readout] [data-async-text]')?.getAttribute('aria-busy') === 'true');
        const fading = await readout.evaluate(node => {
          const value = node.querySelector('[data-async-text-value]')!;
          const skeleton = node.querySelector('[data-async-text-skeleton]')!;
          return { hidden: value.getAttribute('aria-hidden'), transition: getComputedStyle(value).transitionProperty,
            duration: parseFloat(getComputedStyle(value).transitionDuration), width: skeleton.getBoundingClientRect().width,
            same: (window as unknown as { countFrame: Element }).countFrame === document.querySelector('[data-catalog-frame]') };
        });
        assert.equal(fading.hidden, 'true');
        assert.ok(fading.transition.includes('opacity') && fading.duration > 0, 'The reading is missing its cross-fade');
        assert.ok(before && Math.abs(fading.width - before.width) <= 1, 'The waiting skeleton did not keep the reading\'s width');
        assert.equal(fading.same, true, 'The loading reading replaced the filter controls');
      } finally { release() }
      await page.waitForFunction(() => document.querySelector('[data-catalog-readout]')?.textContent?.includes('34 matches'));
      assert.equal(await readout.getAttribute('aria-busy'), null);
      assert.equal(await readout.locator('[data-async-text-value]').getAttribute('aria-hidden'), null);
    } finally {
      await opened.close();
    }
  });

  it('Five stacked avatars fan out over the text while the left edge and title column stay put', { timeout: 60_000 }, async () => {
    const names = Array.from({ length: 7 }, (_, index) => `Demo performer ${index + 1}`);
    const opened = await openCatalogFixture(browser, (payload) => {
      const item = payload.items[0];
      if (!item) throw new Error('The demo catalog has no swappable cards');
      item.creator = '';
      item.performers = names;
      item.performer_total = names.length;
      item.performer_entities = names.map((name, index) => ({ id: 90_000 + index, name, has_image: false }));
    });
    try {
      await opened.page.emulateMedia({ reducedMotion: 'no-preference' });
      const stack = opened.page.locator('[data-media-card][data-id] [data-media-avatars]').first();
      await stack.waitFor({ timeout: 5_000 });
      const avatars = stack.locator('[data-media-avatar]');
      assert.equal(await avatars.count(), 5, 'When the API returns seven performers, the card does not cap at five avatars');
      const before = await avatars.evaluateAll((items) => items.map((item) => parseFloat(getComputedStyle(item).left)));
      const left = (await stack.boundingBox())!.x;
      const textBefore = await stack.locator('xpath=ancestor::article[@data-media-card]').first().locator('[data-media-text]').boundingBox();
      const waitForAvatarMotion = () => stack.evaluate(async (element) => {
        const animations = element.getAnimations({ subtree: true });
        await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
      });

      await avatars.first().hover();
      await waitForAvatarMotion();
      const firstSpread = await avatars.evaluateAll((items) => items.map((item) => parseFloat(getComputedStyle(item).left)));
      for (let index = 1; index < firstSpread.length; index += 1) {
        assert.ok(firstSpread[index] > before[index], `When the first one hovers, item ${index + 1} does not expand toward the title`);
      }

      await avatars.nth(2).hover();
      await waitForAvatarMotion();
      const after = await avatars.evaluateAll((items) => items.map((item) => parseFloat(getComputedStyle(item).left)));
      const card = stack.locator('xpath=ancestor::article[@data-media-card]').first();
      const bounds = await card.evaluate((cardElement) => {
        const stackRect = cardElement.querySelector('[data-media-avatars]')!.getBoundingClientRect();
        const lastRect = cardElement.querySelector('[data-media-avatar]:last-child')!.getBoundingClientRect();
        const firstRect = cardElement.querySelector('[data-media-avatar]')!.getBoundingClientRect();
        const cardRect = cardElement.getBoundingClientRect();
        return {
          stackLeft: stackRect.left,
          stackRight: stackRect.right,
          textLeft: cardElement.querySelector('[data-media-text]')!.getBoundingClientRect().left,
          firstRingLeft: firstRect.left - 2,
          lastRingRight: lastRect.right + 2,
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
        };
      });
      assert.equal(bounds.stackLeft, left, 'Left edge shifts when expanded');
      // When a Chrome compositor layer finishes a transition it leaves a float residual far below one physical pixel; this guards
      // The avatar shows no visible movement, so a rounding gap like 303 vs 302.9933 within the same pixel is not judged a layout regression.
      assert.ok(Math.abs(after[0] - before[0]) <= .5, 'Pointing at the third pushed the first one left');
      assert.ok(after.slice(1).every((value,index)=>Math.abs(value-firstSpread[index+1]!)<=.5), 'Moving between avatars makes the expanded position unstable');
      assert.ok(after[3] > before[3] && after[4] > before[4], 'The avatar did not expand toward the title');
      assert.ok(bounds.firstRingLeft >= bounds.cardLeft - .5, 'The first one enlarged with a ring got clipped by the card\'s left edge');
      assert.ok(bounds.lastRingRight <= bounds.cardRight + .5, 'The expanded avatar leaves the card\'s right edge');
      assert.ok(bounds.lastRingRight > bounds.textLeft && bounds.stackRight <= bounds.textLeft, 'The expanded avatar does not float over the text');
      assert.ok(Math.abs(bounds.textLeft-textBefore!.x)<=.5, 'Expanding the avatar moves the title column');

      await opened.page.mouse.move(0, 0);
      await avatars.nth(2).focus();
      await waitForAvatarMotion();
      const layers = await avatars.evaluateAll((items) => items.map((item) => Number(getComputedStyle(item).zIndex)));
      assert.equal(layers[2], Math.max(...layers), 'The keyboard-focused avatar did not rise to the top layer');

      await opened.page.setViewportSize({ width: 390, height: 844 });
      const drawer = opened.page.locator('#drawer');
      if (await drawer.evaluate((element) => element.classList.contains('open'))) {
        await opened.page.locator('#scrim').evaluate((element) => (element as HTMLElement).click());
        await opened.page.waitForFunction(() => !document.querySelector('#drawer')?.classList.contains('open'));
      }
      await avatars.first().hover();
      await waitForAvatarMotion();
      const narrow = await card.evaluate((cardElement) => {
        const cardRect = cardElement.getBoundingClientRect();
        const firstRect = cardElement.querySelector('[data-media-avatar]')!.getBoundingClientRect();
        const lastRect = cardElement.querySelector('[data-media-avatar]:last-child')!.getBoundingClientRect();
        let clip: Element | null = cardElement.parentElement;
        while (clip && clip !== document.documentElement) {
          const style = getComputedStyle(clip);
          if (style.overflowX !== 'visible' || style.overflowY !== 'visible') break;
          clip = clip.parentElement;
        }
        const clipRect = (clip || document.documentElement).getBoundingClientRect();
        return {
          firstRingLeft: firstRect.left - 2,
          lastRingRight: lastRect.right + 2,
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
          clipLeft: clipRect.left,
          clipRight: clipRect.right,
          viewport: document.documentElement.clientWidth,
        };
      });
      assert.ok(narrow.firstRingLeft >= Math.max(narrow.cardLeft, narrow.clipLeft) - .5,
        'At a 390px viewport the first avatar or ring gets clipped by its nearest clipping ancestor');
      assert.ok(narrow.lastRingRight <= Math.min(narrow.cardRight, narrow.clipRight, narrow.viewport) + .5,
        'At a 390px viewport the expanded avatar leaves the card, a clipping ancestor, or the viewport');
    } finally {
      await opened.close();
    }
  });

  it('When the search box empties it clears the value immediately and dissolves the previous content', { timeout: 60_000 }, async () => {
    const opened = await openCatalog(browser);
    try {
      await opened.page.emulateMedia({ reducedMotion: 'no-preference' });
      const input = opened.page.locator('#q');
      const text = 'A stretch of content long enough to scroll sideways in the search box 0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ '.repeat(4).trim();
      await input.fill(text);
      await input.evaluate((element) => {
        const field = element as HTMLInputElement;
        field.setSelectionRange(field.value.length, field.value.length);
        field.scrollLeft = field.scrollWidth;
        field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      });
      assert.ok(await input.evaluate((element) => (element as HTMLInputElement).scrollLeft) > 0,
        'The test content never actually scrolled the search box sideways');
      /* A ghost lives at most one second (removed on animation end or the fallback timer), so between the test's few round trips under load it is gone.
         Set up the observer on the page before clearing: as soon as the ghost mounts, record its text and offset, then in the same page loop wait frame by frame for
         the placeholder to fade to fully transparent; only if the ghost is removed first while the placeholder is not yet transparent is it a real failure. */
      type DissolveSeen = { text: string | null; transform: string; hidden: boolean };
      type DissolveWindow = Window & { dissolveSeen?: Promise<DissolveSeen> };
      await input.evaluate((element) => {
        const host = element.parentElement!;
        (window as DissolveWindow).dissolveSeen = new Promise<DissolveSeen>((resolve) => {
          const seen: DissolveSeen = { text: null, transform: '', hidden: false };
          const finish = () => { observer.disconnect(); resolve(seen) };
          const poll = () => {
            if (!host.querySelector(':scope > .cleardissolve')) { finish(); return }
            if (getComputedStyle(element, '::placeholder').opacity === '0') { seen.hidden = true; finish(); return }
            requestAnimationFrame(poll);
          };
          const observer = new MutationObserver(() => {
            const value = host.querySelector<HTMLElement>(':scope > .cleardissolve [data-dissolve-value]');
            if (!value || seen.text !== null) return;
            seen.text = value.textContent;
            seen.transform = value.style.transform;
            poll();
          });
          observer.observe(host, { childList: true });
        });
      });
      await input.fill('');
      assert.equal(await input.inputValue(), '', 'The animation blocks clearing the real input');
      const seen = await opened.page.evaluate(() => (window as DissolveWindow).dissolveSeen!);
      assert.equal(seen.text, text, 'Clearing never attached a ghost carrying the original content');
      assert.match(seen.transform, /translateX\(-\d+px\)/);
      assert.ok(seen.hidden, 'While the ghost is present the placeholder is not fully transparent');
      const ghost = opened.page.locator('.search > .cleardissolve');
      await ghost.waitFor({ state: 'detached', timeout: 2_000 });
      assert.equal(await input.evaluate((element) => element.classList.contains('dissolving')), false,
        'After the animation ends the input\'s dissolve state still applies');

      await input.fill(text);
      await input.fill('');
      await opened.page.locator('.search > .cleardissolve').waitFor({ timeout: 1_000 });
      await input.type('New input');
      assert.equal(await opened.page.locator('.search > .cleardissolve').count(), 0,
        'Typing after clearing stays covered by the old ghost');
      assert.equal(await input.inputValue(), 'New input');

      await input.fill('IME candidates');
      await input.fill('');
      await opened.page.locator('.search > .cleardissolve').waitFor({ timeout: 1_000 });
      await input.evaluate((element) => element.dispatchEvent(new CompositionEvent('compositionstart', {
        bubbles: true,
        data: '候',
      })));
      assert.equal(await opened.page.locator('.search > .cleardissolve').count(), 0,
        'After IME composition starts the old ghost still covers the candidate text');
    } finally {
      await opened.close();
    }
  });

  it('While the search box is empty and unfocused, the placeholder recommendation cycles every few seconds; it stops on focus, typing, or composition', { timeout: 60_000 }, async () => {
    const opened = await openCatalog(browser);
    try {
      await opened.page.emulateMedia({ reducedMotion: 'no-preference' });
      const input = opened.page.locator('#q');
      const ghost = opened.page.locator('.search > .placeholderroll');
      // The recommendation phrase pool is fetched when the page is idle; once it arrives, swap in the first phrase, then rotate every few seconds after.
      await opened.page.waitForFunction(() => document.querySelector<HTMLInputElement>('#q')?.dataset.suggestion,
        null, { timeout: 15_000 });
      // The first query also runs the swap animation when set; wait for it to finish before recording the “before swap” phrase.
      await ghost.waitFor({ state: 'detached', timeout: 2_000 });
      const before = await input.getAttribute('placeholder');
      await ghost.waitFor({ timeout: 8_000 });
      const after = await input.getAttribute('placeholder');
      assert.notEqual(after, before, 'When cycling sentences, the placeholder was not updated to the new one');
      assert.equal(after, await input.getAttribute('data-suggestion'), 'The placeholder does not match what an empty Enter would search for');
      assert.equal(await input.evaluate((element) => getComputedStyle(element, '::placeholder').opacity), '0',
        'When the cycling layer is present, the box\'s own placeholder is not dismissed');
      await ghost.waitFor({ state: 'detached', timeout: 2_000 });
      assert.equal(await input.evaluate((element) => element.classList.contains('placeholderrolling')), false,
        'After swapping, the input box\'s placeholder still overlaps');

      await ghost.waitFor({ timeout: 8_000 });
      await input.type('new');
      assert.equal(await ghost.count(), 0, 'After typing starts, the cycling layer still sits over the input box');
      // Don't swap the query while focused: the user is looking at this phrase; swapping it means Enter won't search the word they just saw.
      await input.fill('');
      await opened.page.waitForTimeout(6_000);
      assert.equal(await ghost.count(), 0, 'Placeholder still cycling while the search box is focused');
      await input.blur();
      await ghost.waitFor({ timeout: 8_000 });
      await input.evaluate((element) => element.dispatchEvent(new CompositionEvent('compositionstart', {
        bubbles: true, data: '候',
      })));
      assert.equal(await ghost.count(), 0, 'Once the input method starts composing, the cycling layer still sits over the candidate words');
    } finally {
      await opened.close();
    }
  });

  /* The search box lives in the sticky top bar, always at the viewport's top edge; but `html`'s `scroll-padding-top` marks that strip
     as "covered by the top bar", so the browser scrolls the cursor down on every keystroke and the page keeps scrolling back.
     Clicks use mouse coordinates: a locator's click first scrolls the element into view, and that motion is not the page's own. */
  it('After scrolling down, typing in the search box keeps the page in place', { timeout: 60_000 }, async () => {
    const opened = await openCatalog(browser);
    try {
      const { page } = opened;
      await page.setViewportSize({ width: DESKTOP.width, height: 480 });
      await page.mouse.move(DESKTOP.width / 2, 300);
      await page.mouse.wheel(0, 600);
      await page.waitForFunction(() => scrollY > 300, undefined, { timeout: 5_000 });
      const before = await page.evaluate(() => scrollY);
      const box = await page.locator('#q').boundingBox();
      if (!box) throw new Error('Search box not visible');
      await page.mouse.click(box.x + 40, box.y + box.height / 2);
      await page.keyboard.type('demoabc', { delay: 60 });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => scrollY), before, 'Typing scrolled the page along');
    } finally {
      await opened.close();
    }
  });

  it('Home layout defaults to small images, large images unify the video frame, and the choice is remembered separately', { timeout: 60_000 }, async () => {
    /* The first card uses the code cover, the second uses an ordinary preview image. */
    const opened = await openCatalogFixture(browser, (payload) => {
      Object.assign(payload.items[0], { is_jav: true, code: 'ABC-123', display_code: 'ABC-123', has_cover: true });
    });
    const { page } = opened;
    const ratio = (index: number) => page.locator('#grid [data-media-grid] > [data-media-card][data-id]').nth(index).locator('[data-media-pic]')
      .evaluate((element) => element.getBoundingClientRect().width / element.getBoundingClientRect().height);
    const choice = (value: string) => page.locator(`[data-catalog-filter] input[name="home-layout"][value="${value}"]`);
    try {
      assert.equal(await choice('small').isChecked(), true, 'Home layout does not default to small images');
      assert.ok(Math.abs(await ratio(0) - 16 / 9) < 0.05, 'Under small images code cards are not 16:9');
      await choice('big').check({ force: true });
      assert.ok(Math.abs(await ratio(0) - 0.75) < 0.05, 'Under large images code cards did not stretch to front-cover ratio');
      assert.ok(Math.abs(await ratio(1) - 0.75) < 0.05, 'Under large images regular video frames are not 3:4');
      const box = (index: number) => page.locator('#grid [data-media-grid] > [data-media-card][data-id]').nth(index).locator('[data-media-pic]')
        .evaluate((element) => ({ top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height }));
      const [jav, plain] = [await box(0), await box(1)];
      assert.ok(Math.abs(jav.top - plain.top) < 1, 'The first two cards are not on one line, so the stretch cannot measure');
      assert.ok(Math.abs(plain.height - jav.height) < 1, 'Video frames on one line differ in height');
      // `visit()`'s init script rewrites settings on every navigation, so a reload cannot verify it; read the persisted copy directly.
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('peach.settings.v1') || '{}'));
      assert.equal(saved.homeLayout, 'big', 'Home layout not persisted');
    } finally {
      await opened.close();
    }
  });

  it('Home tabs: unselected is the --field-ring-hover dashed ring, selected is the solid ring on glass, and views draw no dashed ring; on touch the top row is 48, and views and tabs take the compact tier', { timeout: 60_000 }, async () => {
    /* The dashed style says "this filter can be added, not currently added", taking Vercel's inactive filter token tier; the four view keys always have one active and draw nothing.
       Radius matches the cards', details', and intersection bar's key (`--tag-radius`). Touch controls share the 30px height. */
    const opened = await openCatalogBars(browser);
    try {
      const { page } = opened;
      const scope = '[data-catalog-filter]';
      const ring = await tokenColor(page, scope, '--field-ring-hover');
      const low = await tokenColor(page, scope, '--glass-low');
      const edge = (selector: string) => page.locator(`${scope} ${selector}`).first().evaluate((element) => {
        const style = getComputedStyle(element);
        const probe = document.createElement('div');
        probe.style.borderRadius = 'var(--tag-radius)';
        element.append(probe);
        const radius = getComputedStyle(probe).borderTopLeftRadius;
        probe.remove();
        return { style: style.borderTopStyle, color: style.borderTopColor, radius: style.borderTopLeftRadius === radius };
      });
      assert.deepEqual(await edge('[data-catalog-tag][aria-pressed="false"]'), { style: 'dashed', color: ring, radius: true },
        'The unadded tag is not the --field-ring-hover dashed line, or its radius is not --tag-radius');
      assert.notEqual((await edge('[data-catalog-view]')).style, 'dashed', 'Exactly one view is always active, so no dashed line paints');
      await page.locator(`${scope} [data-catalog-tag][aria-pressed="false"]`).first().click();
      await page.locator(`${scope} [data-catalog-tag][aria-pressed="true"]`).waitFor({ timeout: 5_000 });
      assert.deepEqual(await edge('[data-catalog-tag][aria-pressed="true"]'), { style: 'solid', color: low, radius: true },
        'The added tag\'s ring is not --glass-low on glass');
    } finally {
      await opened.close();
    }
    const phone = await openCatalogBars(browser, MOBILE);
    try {
      const { page } = phone;
      const heights = await page.evaluate(() => {
        const height = (selector: string) => {
          const element = document.querySelector(`[data-catalog-filter] ${selector}`);
          return element ? Math.round(element.getBoundingClientRect().height) : null;
        };
        return { coarse: matchMedia('(pointer: coarse)').matches, row: height('[data-filter-row="top"]'),
          view: height('[data-catalog-view]'), tag: height('[data-catalog-tag]'),
          compact: parseFloat(getComputedStyle(document.querySelector('[data-catalog-filter]')!).getPropertyValue('--control-h-compact')) };
      });
      assert.equal(heights.compact, 32);
      assert.deepEqual(heights, { coarse: true, row: 48, view: heights.compact, tag: heights.compact, compact: heights.compact }, 'Touch filter button heights disagree');
    } finally {
      await phone.close();
    }
  });

  it('Index shuffle: avatars, labels and tags hide in place showing only a shimmer, the name bar collapses to 52px, and the four views do not overlap', { timeout: 60_000 }, async () => {
    /* The boxes are their own boxes, zero offset; controls with `visibility:hidden` are not focusable either. The view is decided by state, and this pass does not change them. */
    const opened = await openCatalogBars(browser);
    let release = () => {};
    try {
      const { page } = opened;
      const held = new Promise<void>((resolve) => { release = resolve; });
      // Later registrations intercept first: hold this pass, then hand back the fixture's copy on release.
      await page.route((url) => url.pathname === '/api/tops', async (route) => { await held; await route.fallback(); });
      await page.locator('[data-catalog-filter] [data-entity-batch]').click();
      await page.locator('[data-catalog-filter] [data-catalog-root][data-refreshing]').waitFor({ timeout: 5_000 });
      const shown = await page.evaluate(() => {
        const read = (selector: string) => {
          const element = document.querySelector(`[data-catalog-filter] ${selector}`);
          if (!element) return null;
          return { hidden: getComputedStyle(element).visibility, sheen: getComputedStyle(element, '::after').visibility,
            width: Math.round(element.getBoundingClientRect().width) };
        };
        return { tag: read('[data-catalog-tag]'), ring: read('[data-tier-ring]'), name: read('[data-tier-name]'),
          studio: read('[data-tier-studio]'), view: read('[data-catalog-view]') };
      });
      for (const key of ['tag', 'ring', 'name', 'studio'] as const) {
        assert.equal(shown[key]?.hidden, 'hidden', `On shuffle the ${key} did not hide: ${JSON.stringify(shown[key])}`);
        assert.equal(shown[key]?.sheen, 'visible', `On shuffle the ${key} has no shimmer layer: ${JSON.stringify(shown[key])}`);
      }
      assert.equal(shown.name?.width, 52, 'The name strip did not collapse to the first-screen skeleton\'s width');
      assert.equal(shown.view?.hidden, 'visible', 'The view does not change on this pass, so it should not be covered');
    } finally {
      release();
      await opened.close();
    }
  });
});
