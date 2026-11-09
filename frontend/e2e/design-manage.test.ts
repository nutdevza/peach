/* Design decisions: data management, index pages and the profile page header. Reads `getComputedStyle` to assert the appearance the user set; shared stubs and browser lifecycle live in `design-fixture.ts`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { layout, settle, visit } from './harness.ts';
import {
  DESKTOP, MOBILE, tokenColor, openDuplicates, openIndexPage, openPlaylistsPage, openFollowManage, holdApi,
  openPerformer, PROFILED, openProfiledPerformer, popmenuShadow, heroGeometry, disabledTokens,
  waitingActionFaces, assertDisabledFace, followTab, followSource, installDesignBrowser,
} from './design-fixture.ts';

describe('Design decisions: data management, index page, and profile headers', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });

  it('The follows list action area wraps as whole groups and keeps laying out controls within narrow screens', { timeout: 60_000 }, async () => {
    const opened = await openFollowManage(browser, DESKTOP, {
      counts: { new: 17_097 }, extra: [
        followSource(4, 'kou', 'Fanbox', 'kou · Fanbox'),
        followSource(5, 'kou', 'Patreon', 'kou · Patreon'),
        followSource(6, 'kou', 'Rule34Video', 'kou · Rule34Video'),
      ],
    });
    try {
      const { page } = opened;
      for (const width of [1698, 1000, 820, 760, 650, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await settle(page);
        const geometry = await page.locator('[data-follow-toolbar]').evaluate((root) => {
          const box = (element: Element) => {
            const r = element.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          };
          const actions = root.querySelector('[data-follow-toolbar-actions]')!;
          return {
            toolbar: box(root), heading: box(root.querySelector('[data-follow-toolbar-heading]')!),
            actions: box(actions), buttons: [...actions.querySelectorAll('button')].map(box),
          };
        });
        const { toolbar, heading, actions, buttons } = geometry;
        assert.ok(actions.left >= toolbar.left - 1 && actions.right <= toolbar.right + 1,
          `At ${width}px the action area leaves the toolbar`);
        for (const button of buttons) {
          assert.ok(button.left >= actions.left - 1 && button.right <= actions.right + 1,
            `At ${width}px controls leave the action area`);
        }
        const below = actions.top >= heading.bottom - 1;
        if (below) {
          assert.ok(Math.abs(actions.left - toolbar.left) < 1, `${width}px wrapped action area is not left aligned`);
        } else {
          assert.ok(actions.left >= heading.right, `At ${width}px the action area overlaps the title`);
          assert.ok(Math.max(...buttons.map((b) => b.top)) - Math.min(...buttons.map((b) => b.top)) < 2,
            `At ${width}px only some controls wrap while on the title's line`);
        }
        if (width === 1698) assert.equal(below, false);
        if (width <= 650) assert.equal(below, true);
        const authorButtons = await page.locator('[data-follow-author-controls]').evaluateAll(groups => groups.map(group =>
          [...group.querySelectorAll(':scope > span:last-child > button')].map(button => button.getBoundingClientRect().top)));
        assert.ok(authorButtons.every(tops => tops.length === 2 && Math.abs(tops[0]! - tops[1]!) < 1),
          `At ${width}px the creator card's select-all and collapse buttons wrap apart`);
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  const cleanupCards = [
    { path: '/data-cleanup', label: 'Scan and scrape', skeleton: 'cleanup', names: ['Sync new files', 'More sync options'] },
    { path: '/data-cleanup/media-repair', label: 'Media repair', skeleton: 'cleanup/media-repair', names: ['Start repair'] },
  ];
  for (const viewport of [DESKTOP, MOBILE]) for (const item of cleanupCards) {
    it(`The ${item.label} skeleton shares the content card's frame, padding, and action-area layout (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, item.path, viewport);
      try {
        const page = opened.page;
        await page.route('**/api/library-processing', route => route.fulfill({ json: { status: 'idle' } }));
        const release = await holdApi(page);
        await page.reload({ waitUntil: 'load' });
        const card = `section[aria-label="${item.label}"]`;
        await page.locator(`[data-skeleton="${item.skeleton}"] ${card} footer`).waitFor({ timeout: 15_000 });
        const geometry = () => page.locator(card).evaluateAll(cards => cards.map(card => {
          const style = (part: Element) => {
            const css = getComputedStyle(part);
            return [css.display, css.padding, css.gap, css.borderTopWidth, css.borderRadius, css.backgroundColor];
          };
          return { width: Math.round(card.getBoundingClientRect().width), height: Math.round(card.getBoundingClientRect().height), face: style(card),
            body: style(card.firstElementChild!), footer: style(card.querySelector('footer')!) };
        }));
        const waiting = await geometry();
        assert.equal(waiting.length, 1);
        assert.equal(waiting[0]!.face[3], '0px', 'The skeleton card still has an outer frame; the on-page card relies only on its fill background');
        const expected = await disabledTokens(page);
        const faces = await waitingActionFaces(page, `[data-skeleton="${item.skeleton}"] [data-skeleton-action]`);
        assert.deepEqual(faces.map(face => face.name).filter(Boolean), item.names);
        for (const face of faces) assertDisabledFace(face, expected);
        const buttons = page.locator(`${card} footer button`).filter({ hasText: /同步新增文件|开始修复/ }).or(
          page.locator(`${card} footer button[aria-label="More sync methods"]`));
        const sizes = await buttons.evaluateAll(nodes => nodes.map(node => {
          const box = node.getBoundingClientRect();
          return [box.width, box.height];
        }));
        if (item.skeleton === 'cleanup') {
          const ring = await page.locator(`${card} [data-split-button]`).evaluate(node => getComputedStyle(node).boxShadow);
          assert.ok(ring.includes(expected.ring), `The skeleton part-key outer ring is not the disabled stroke: ${ring}`);
        }
        release();
        await page.locator(`${card} footer button:not([data-skeleton-action])`).first().waitFor({ timeout: 15_000 });
        await settle(page);
        assert.deepEqual(await geometry(), waiting, 'The skeleton and content card container layouts disagree');
        assert.deepEqual(await buttons.evaluateAll(nodes => nodes.map(node => {
          const box = node.getBoundingClientRect();
          return [box.width, box.height];
        })), sizes, 'The action button\'s size jumps when it takes over');
        assert.deepEqual(await buttons.evaluateAll(nodes => nodes.map(node => (node as HTMLButtonElement).disabled)), item.names.map(() => false));
        for (const face of await buttons.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundImage))) {
          assert.match(face, /gradient/, 'Once data arrives the action button still has not regained its primary style');
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }

  const cleanupTools = [
    ['/data-cleanup/organize', 'organize'], ['/data-cleanup/resource-sync', 'resource-sync'],
    ['/data-cleanup/orphan-records', 'orphan-records'], ['/data-cleanup/links', 'links'],
    ['/data-cleanup/batch-delete', 'batch-delete'],
  ] as const;
  for (const viewport of [DESKTOP, MOBILE]) {
    it(`The maintenance tool second-level page skeleton is drawn in the main content column; the first card is in the same position and width after handover (${viewport.name})`, { timeout: 90_000 }, async () => {
      const opened = await visit(browser, cleanupTools[0][0], viewport);
      try {
        const page = opened.page;
        const release = await holdApi(page);
        const frame = (column: string) => page.locator(column).evaluate((node) => {
          const box = (part: Element) => {
            const { left, width } = part.getBoundingClientRect();
            return [Math.round(left), Math.round(width)];
          };
          return { column: box(node), card: box(node.firstElementChild!) };
        });
        const waiting: Record<string, unknown> = {};
        for (const [path, key] of cleanupTools) {
          await page.goto(new URL(path, page.url()).href, { waitUntil: 'load' });
          await page.locator(`[data-skeleton="cleanup/${key}"] [inert] > *`).first().waitFor({ timeout: 15_000 });
          waiting[path] = await frame(`[data-skeleton="cleanup/${key}"] [inert]`);
        }
        release();
        // In the beat of handover, the old skeleton moves into the fade-out layer .skelfade, no longer hanging under data-skeleton; both layers must be excluded.
        const content = '#stats .max-w-board:not([data-skeleton] *, .skelfade *)';
        for (const [path] of cleanupTools) {
          await page.goto(new URL(path, page.url()).href, { waitUntil: 'load' });
          await page.locator(`${content} > *`).first().waitFor({ timeout: 15_000 });
          await page.locator('#stats .skelfade').waitFor({ state: 'detached', timeout: 15_000 });
          await settle(page);
          assert.deepEqual(await frame(content), waiting[path], `${path} skeleton and content disagree on the body column or first card position`);
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }

  it('Tool page headings use medium; link readings use the established size and line height', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/data-cleanup/links', DESKTOP);
    try {
      const page = opened.page;
      for (const [path, id, name] of [
        ['/data-cleanup/links', 'link-manager', 'Link management'],
        ['/data-cleanup/resource-sync', 'resource-sync', 'Resource sync'],
      ]) {
        await page.goto(new URL(path!, page.url()).href);
        await page.locator(`#${id}-title`).waitFor({ timeout: 15_000 });
        await settle(page);
        const heading = await page.locator(`#${id}-title`).evaluate(node => {
          const css = getComputedStyle(node);
          return [css.fontSize, css.fontWeight, css.lineHeight, css.marginBottom];
        });
        assert.deepEqual(heading, ['20px', '500', '26px', '8px'], `${name} heading style`);
        assert.equal(await page.locator(`#${id} > h2, #${id} > h3`).count(), 0, 'An out-of-frame title appeared');
        if (id === 'link-manager') {
          const styles = await page.locator('#link-manager .link-stat-grid').evaluate(node => {
            const label = getComputedStyle(node.querySelector('span')!);
            const figure = getComputedStyle(node.querySelector('b')!);
            return [label.fontSize, label.lineHeight, figure.fontSize, figure.fontWeight, figure.lineHeight];
          });
          assert.deepEqual(styles, ['12px', '20px', '20px', '700', '20px']);
        }
      }
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('Clickable cards on hover lay a card surface blended with 5% primary text color, not transparent', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/data-cleanup', DESKTOP);
    try {
      const page = opened.page;
      const selector = '.peach-react [data-cleanup-go]';
      const card = page.locator(selector).first();
      await card.waitFor({ timeout: 15_000 });
      await settle(page);
      const rest = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
      await card.hover();
      // Read only after the transition ends: wait for the background color to change, or after three seconds report the unchanged value as-is.
      await page.waitForFunction(([target, before]) =>
        getComputedStyle(document.querySelector(target)!).backgroundColor !== before,
      [selector, rest] as const, { timeout: 3_000 }).catch(() => undefined);
      const hovered = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.notEqual(hovered, 'rgba(0, 0, 0, 0)', 'The hover background resolved to transparent: the token collapsed at the root');
      assert.notEqual(hovered, rest, 'Hover does not flip sides');
      assert.equal(hovered, await tokenColor(page, '.peach-react', '--card-hover'), 'The hover background is not the card face mixed with 5% primary text color');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Index page roster cells use the legacy card face set: cell backing --ground, avatar frame --sunk, initial and readings --muted in Bahnschrift, hover blended with 6% primary text; the header filter box and layout switch are both 36px tall, the two switch keys 66px wide together', { timeout: 60_000 }, async () => {
    const opened = await openIndexPage(browser, '/performers');
    try {
      const page = opened.page;
      const selector = '#index [data-index-cell]';
      const cell = page.locator(selector).first();
      const rest = await cell.evaluate((element) => getComputedStyle(element).backgroundColor);
      const face = await page.evaluate(() => {
        const ring = document.querySelector('#index [data-person-ring]')!;
        const initial = document.querySelector('#index [data-person-ring] .ini')!;
        const readout = document.querySelector('#index [data-index-readout]')!;
        return { ring: getComputedStyle(ring).backgroundColor, initial: getComputedStyle(initial).color,
          font: getComputedStyle(initial).fontFamily, readout: getComputedStyle(readout).color };
      });
      assert.equal(rest, await tokenColor(page, 'html', '--ground'), 'The roster cell base is not --ground');
      assert.equal(face.ring, await tokenColor(page, 'html', '--sunk'), 'The avatar ring base is not --sunk');
      const muted = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.color = 'var(--muted)';
        document.documentElement.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      });
      assert.deepEqual([face.initial, face.readout], [muted, muted], 'The initial and count are not --muted');
      assert.match(face.font, /^Bahnschrift/, 'The initial is not Bahnschrift');
      await cell.hover();
      await page.waitForFunction(([target, before]) =>
        getComputedStyle(document.querySelector(target)!).backgroundColor !== before,
      [selector, rest] as const, { timeout: 3_000 }).catch(() => undefined);
      const hovered = await cell.evaluate((element) => getComputedStyle(element).backgroundColor);
      const lifted = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'color-mix(in srgb, var(--ink) 6%, var(--ground))';
        document.documentElement.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      });
      assert.equal(hovered, lifted, 'Roster cell hover is not the cell base mixed with 6% primary text color');
      const head = await page.evaluate(() => {
        const input = document.querySelector('#index [data-index-search] input')!;
        const shell = input.closest('[role="presentation"]')!;
        const toggle = document.querySelector('#index [data-index-layout]')!;
        return { search: getComputedStyle(shell).height, toggle: getComputedStyle(toggle).height,
          width: getComputedStyle(toggle).width };
      });
      assert.deepEqual(head, { search: '36px', toggle: '36px', width: '66px' });
      // The face zoom stretches the img wider than its frame and offsets it negatively; Preflight's `max-width:100%` would clamp it back to the frame width.
      const photo = page.locator('#index [data-person-ring] img').first();
      await photo.waitFor({ state: 'attached', timeout: 5_000 });
      await page.waitForFunction(() => document.querySelector('#index [data-person-ring]')?.hasAttribute('data-native-small'),
        undefined, { timeout: 5_000 });
      assert.equal(await photo.evaluate((element) => getComputedStyle(element).maxWidth), 'none');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Index page sections use a neutral fill selected state; arrow keys can switch between them', { timeout: 60_000 }, async () => {
    const opened = await openIndexPage(browser, '/studios');
    try {
      const page = opened.page;
      const selected = page.locator('#index [role="tab"][aria-selected="true"]');
      const look = await selected.evaluate((element) => {
        const style = getComputedStyle(element);
        const thumb = element.closest('[data-pill-nav]')!.querySelector('[data-pill-thumb]')!;
        return { background: style.backgroundColor, selectedSurface: getComputedStyle(thumb).backgroundColor,
          border: style.borderBottomWidth, weight: style.fontWeight };
      });
      assert.equal(look.background, 'rgba(0, 0, 0, 0)');
      assert.notEqual(look.selectedSurface, 'rgba(0, 0, 0, 0)');
      assert.equal(look.border, '0px');
      assert.equal(look.weight, '400');
      await selected.focus();
      await page.keyboard.press('ArrowRight');
      await page.locator('#index [role="tab"][aria-selected="true"][data-tab="series"]').waitFor({ timeout: 5_000 });
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Playlist card: two stacked paper edges behind the cover, black-backed cover, glass badge, 38px avatar with image at 22px overlay or initial-only at 8px; title 32/44, menu button transparent at rest', { timeout: 60_000 }, async () => {
    const opened = await openPlaylistsPage(browser);
    try {
      const page = opened.page;
      const look = await page.evaluate(() => {
        const card = document.querySelector('#stats [data-playlist-card="1"]')!;
        const css = (selector: string) => getComputedStyle(card.querySelector(selector)!);
        const stack = card.querySelector('[data-mix-stack]')!;
        const back = getComputedStyle(stack, '::before');
        const mid = getComputedStyle(stack, '::after');
        const title = getComputedStyle(document.querySelector('#stats header h2')!);
        const cover = css('[data-mix-cover]');
        const badge = css('[data-mix-badge]');
        const menu = css('[data-playlist-menu]');
        const blank = getComputedStyle(document.querySelector('#stats [data-playlist-card="3"] [data-mix-cover] > span')!);
        return {
          title: [title.fontSize, title.lineHeight, title.fontWeight],
          gap: getComputedStyle(document.querySelector('#stats [data-playlist-grid]')!).gap,
          back: [back.borderTopWidth, back.inset, back.transform, back.opacity],
          mid: [mid.borderTopWidth, mid.inset, mid.transform, mid.opacity],
          cover: [cover.backgroundColor, cover.clipPath],
          badge: [badge.backgroundColor, badge.backdropFilter, badge.minHeight, badge.borderRadius, badge.right, badge.bottom],
          avatars: [...card.querySelectorAll('[data-mix-avatars] button')].map((button) => {
            const style = getComputedStyle(button);
            return [style.width, style.marginLeft, style.zIndex];
          }),
          menu: [menu.width, menu.height, menu.borderRadius, menu.backgroundColor],
          blank: [blank.letterSpacing, blank.textTransform],
        };
      });
      assert.deepEqual(look, {
        title: ['32px', '44px', '500'],
        gap: '18px',
        back: ['1px', '0px 12px 8px', 'matrix(1, 0, 0, 1, 0, -7)', '0.54'],
        mid: ['1px', '0px 6px 4px', 'matrix(1, 0, 0, 1, 0, -4)', '0.78'],
        cover: ['rgb(0, 0, 0)', 'inset(0px round 14px)'],
        badge: ['rgba(12, 8, 8, 0.72)', 'blur(10px)', '28px', '10px', '9px', '9px'],
        avatars: [['38px', '0px', '5'], ['38px', '-8px', '4'], ['38px', '-8px', '3']],
        menu: ['30px', '30px', '10px', 'rgba(0, 0, 0, 0)'],
        blank: ['1.44px', 'uppercase'],
      });
      // The hovered avatar lifts 4px and scales to 1.05, and the one to its right yields 10px toward the title.
      await page.locator('#stats [data-playlist-card="1"] [data-mix-avatars] button').first().hover();
      const lifted = await page.evaluate(() => {
        document.getAnimations().forEach((animation) => animation.finish());
        return [...document.querySelectorAll('#stats [data-playlist-card="1"] [data-mix-avatars] button')]
          .slice(0, 2).map((button) => getComputedStyle(button).transform);
      });
      assert.deepEqual(lifted, ['matrix(1.05, 0, 0, 1.05, 0, -4)', 'matrix(1, 0, 0, 1, 10, -1.8)']);
      // The three-dot menu's outer width is 172px, same as the old card menu.
      await page.locator('#stats [data-playlist-card="1"] [data-playlist-menu]').click();
      const panel = page.locator(':has(> [role="dialog"][aria-label="Playlist actions: List 1"])');
      await panel.waitFor({ timeout: 5_000 });
      assert.equal(await panel.evaluate((element) => getComputedStyle(element).width), '172px');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Playlist page on narrow screens: the header goes vertical and the create input is 16px so iOS does not zoom on focus', { timeout: 60_000 }, async () => {
    const opened = await openPlaylistsPage(browser, MOBILE);
    try {
      const narrow = await opened.page.evaluate(() => ({
        header: getComputedStyle(document.querySelector('#stats header')!).flexDirection,
        input: getComputedStyle(document.querySelector('#stats [data-playlist-create] input')!).fontSize,
        title: getComputedStyle(document.querySelector('#stats header h2')!).fontSize,
      }));
      assert.deepEqual(narrow, { header: 'column', input: '16px', title: '32px' });
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The segmented base supports reverse mouse movement, instant keyboard switching, and reduced motion', { timeout: 60_000 }, async () => {
    const opened = await openIndexPage(browser, '/performers');
    const { page } = opened;
    try {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const track = page.locator('[data-index-layout]');
      const choices = track.locator('label');
      const pane = track.locator('[data-moving-surface]');
      await pane.waitFor();
      const aligned = async () => {
        await page.waitForFunction(() => {
          const host = document.querySelector('[data-index-layout]')!;
          const pane = host.querySelector('[data-moving-surface]')!.getBoundingClientRect();
          const selected = host.querySelector('label[data-selected]')!.getBoundingClientRect();
          return Math.abs(pane.x - selected.x) < 1 && Math.abs(pane.width - selected.width) < 1;
        });
      };
      const assertInstant = async () => {
        const offset = await pane.evaluate((node) => {
          const selected = node.parentElement!.querySelector('label[data-selected]')!.getBoundingClientRect();
          const box = node.getBoundingClientRect();
          return { x: box.x - selected.x, width: box.width - selected.width };
        });
        assert.ok(Math.abs(offset.x) < 1 && Math.abs(offset.width) < 1,
          `Instant toggle knob position: ${JSON.stringify(offset)}`);
      };
      await choices.nth(0).click();
      await aligned();
      const endpoints = await choices.evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.getBoundingClientRect().x));
      await pane.evaluate((node) => {
        const target = node.parentElement!.querySelectorAll('label')[1];
        target.addEventListener('pointerdown', () => {
        const samples: number[] = [];
        const sample = () => {
          samples.push(node.getBoundingClientRect().x);
          if (samples.length < 24) requestAnimationFrame(sample);
          else (node as HTMLElement).dataset.motionSamples = JSON.stringify(samples);
        };
        requestAnimationFrame(sample);
        }, { once: true });
      });
      await choices.nth(1).click();
      await page.waitForFunction(() => document.querySelector('[data-index-layout] [data-motion-samples]'));
      const samples = JSON.parse((await pane.getAttribute('data-motion-samples'))!) as number[];
      assert.ok(samples.some((x) => x > Math.min(...endpoints) + 1 && x < Math.max(...endpoints) - 1),
        `Mouse toggle should pass through the midpoint between the two items: ${JSON.stringify(samples)}`);
      await choices.nth(0).click();
      await choices.nth(1).click();
      await choices.nth(0).click();
      await aligned();
      assert.equal(await pane.count(), 1);
      assert.equal(await pane.getAttribute('aria-hidden'), 'true');
      await track.getByRole('radio').nth(0).focus();
      await page.keyboard.press('ArrowRight');
      await assertInstant();
      assert.equal(await track.getByRole('radio').nth(1).isChecked(), true);
      assert.equal(await pane.evaluate((node) => node.getAnimations().length), 0);
      assert.match(await choices.nth(1).evaluate((node) => getComputedStyle(node).getPropertyValue('--tw-ring-shadow')), /2px/,
        'The selection base must never erase the keyboard focus ring');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await choices.nth(0).click();
      await assertInstant();
      assert.equal(await pane.evaluate((node) => node.getAnimations().length), 0);
      await page.setViewportSize({ width: 390, height: 844 });
      await aligned();
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('The input error state only changes the border to the danger color: fill matches the resting state, and the reason uses the caption gray', { timeout: 60_000 }, async () => {
    const opened = await openPlaylistsPage(browser);
    const { page } = opened;
    try {
      const form = page.locator('[data-playlist-create]');
      const resting = await form.locator('[data-input-size] > div[data-rac]').evaluate((node) => getComputedStyle(node).backgroundColor);
      await form.getByRole('button', { name: 'New' }).click();
      await form.locator('[data-input-size] > div[data-rac][data-invalid]').waitFor();
      const looks = await form.locator('[data-input-size]').evaluate((root) => {
        const probe = (token: string) => {
          const swatch = document.createElement('i');
          swatch.style.color = `var(${token})`;
          root.append(swatch);
          const color = getComputedStyle(swatch).color;
          swatch.remove();
          return color;
        };
        const group = getComputedStyle(root.querySelector(':scope > div[data-rac]')!);
        return {
          fill: group.backgroundColor, outline: group.outlineColor, width: group.outlineWidth,
          reason: getComputedStyle(root.querySelector(':scope > [slot="errorMessage"]')!).color,
          danger: probe('--color-border-error-default'), secondary: probe('--color-text-secondary'),
        };
      });
      assert.deepEqual([looks.fill, looks.outline, looks.width, looks.reason],
        [resting, looks.danger, '1px', looks.secondary]);
    } finally { await opened.close(); }
  });

  it('The short menu shares the hover surface; closing the popup releases focus and the overlay', { timeout: 60_000 }, async () => {
    const opened = await openPlaylistsPage(browser);
    const { page } = opened;
    try {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const trigger = page.locator('[data-playlist-card="1"] [data-playlist-menu]');
      await trigger.click();
      const menu = page.getByRole('dialog', { name: 'Playlist actions: List 1' });
      await menu.getByRole('button', { name: 'Edit name' }).hover();
      const pane = menu.locator('[data-moving-surface]');
      await pane.waitFor();
      await menu.getByRole('button', { name: 'Delete playlist' }).hover();
      await page.waitForFunction(() => {
        const host = document.querySelector('[data-surface-host="hover"]')!;
        const pane = host.querySelector('[data-moving-surface]')!.getBoundingClientRect();
        const button = [...host.querySelectorAll('button')].at(-1)!.getBoundingClientRect();
        return Math.abs(pane.y - button.y) < 1;
      });
      await page.keyboard.press('Tab');
      assert.equal(await pane.isVisible(), false);
      await menu.getByRole('button', { name: 'Edit name' }).click();
      const modal = page.locator('[data-modal-motion]');
      await modal.waitFor();
      await modal.getByRole('textbox', { name: 'Name' }).waitFor();
      assert.equal(await modal.locator('[data-modal-surface]').evaluate((node) =>
        getComputedStyle(node).transitionProperty.includes('transform')), true);
      await modal.locator('form').getByRole('button', { name: 'Cancel', exact: true }).click();
      await modal.waitFor({ state: 'detached' });
      await trigger.click();
      await menu.getByRole('button', { name: 'Edit name' }).focus();
      await page.keyboard.press('Enter');
      await modal.waitFor();
      assert.equal(await modal.getAttribute('data-motion-instant'), 'true');
      await page.waitForFunction(() => Boolean(document.activeElement?.closest('[data-modal-motion]')),
        null, { timeout: 5_000 });
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-modal-motion]') !== null), false);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('The batch selection bar updates its count in place; when emptied it exits and leaves no interactive controls', { timeout: 60_000 }, async () => {
    const opened = await openIndexPage(browser, '/tags');
    const { page } = opened;
    try {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('#selectMode').click();
      const tags = page.locator('#index [data-alpha-tag]');
      await tags.nth(0).click();
      const dock = page.locator('[data-selection-dock]');
      await dock.waitFor();
      await dock.evaluate((node) => node.setAttribute('data-test-identity', 'retained'));
      await tags.nth(1).click();
      assert.equal(await dock.getAttribute('data-test-identity'), 'retained');
      assert.match(await dock.textContent() ?? '', /已选 2 个标签/);
      await dock.getByRole('button', { name: 'Clear', exact: true }).click();
      await page.waitForFunction(() => {
        const dock = document.querySelector<HTMLElement>('[data-selection-dock]');
        return !dock || (dock.inert && dock.getAttribute('aria-hidden') === 'true');
      });
      await dock.waitFor({ state: 'detached' });
      await tags.nth(0).click();
      await dock.waitFor();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await dock.getByRole('button', { name: 'Clear', exact: true }).click();
      await dock.waitFor({ state: 'detached' });
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('When the tag multi-select dock appears, the page bottom reserves space at its real height; online vocabulary type colors follow the upstream tag_type set', { timeout: 60_000 }, async () => {
    const opened = await openIndexPage(browser, '/tags');
    try {
      const page = opened.page;
      await page.locator('#selectMode').click({ timeout: 5_000 });
      await page.locator('#index [data-alpha-tag]').nth(0).click({ timeout: 5_000 });
      await page.locator('#index [data-alpha-tag]').nth(1).click({ timeout: 5_000 });
      const dock = page.locator('[data-selection-dock]');
      await dock.waitFor({ timeout: 5_000 });
      const clearance = await dock.evaluate((element) => ({
        padding: parseFloat(getComputedStyle(document.querySelector('#index .peach-react')!).paddingBottom),
        required: (element as HTMLElement).offsetHeight + parseFloat(getComputedStyle(element).bottom) + 16,
      }));
      assert.ok(clearance.padding >= clearance.required, `Not enough clearance below the selection dock: ${JSON.stringify(clearance)}`);
      await page.locator('#index [role="tab"][data-tab="online"]').click({ timeout: 5_000 });
      const dot = page.locator('#index [data-alpha-tag][data-tag-cat="r34-artist"] [data-tag-dot]');
      await dot.waitFor({ timeout: 5_000 });
      assert.equal(await dot.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(227, 108, 108)');
      assert.equal(await dock.count(), 0, 'Online word list gets no multi-select dock');
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--selection-dock-space')), '');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('In a tag cloud chip the name and count are one space apart; the filter overlay Aa glyph fits a 16×16 box', { timeout: 60_000 }, async () => {
    const opened = await openIndexPage(browser, '/tags?view=cloud');
    try {
      const page = opened.page;
      const spacing = await page.locator('#index [data-tag-chip]').first().evaluate((chip) => {
        // The name's text is measured character by character: from the last character's right edge to the count's left edge, compared against the width the trailing space itself paints.
        const name = chip.firstElementChild!.firstChild!;
        const end = name.textContent!.trimEnd().length;
        const box = (from: number, to: number) => {
          const part = document.createRange();
          part.setStart(name, from);
          part.setEnd(name, to);
          return part.getBoundingClientRect();
        };
        const count = chip.querySelector('[data-tag-n]')!.getBoundingClientRect();
        return { gap: count.left - box(0, end).right, space: box(end, name.textContent!.length).width,
          columnGap: getComputedStyle(chip).columnGap };
      });
      assert.equal(spacing.columnGap, 'normal', 'No extra flex gap sits between name and count');
      assert.ok(spacing.space > 2 && Math.abs(spacing.gap - spacing.space) < 0.5,
        `The name and count are ${spacing.gap}px apart while a space is ${spacing.space}px`);
      const glyph = page.locator('#index svg:has(use[href="#i-text-aa"])');
      const letterGlyph = await glyph.evaluate((element) => {
        const style = getComputedStyle(element);
        const ink = (element as SVGSVGElement).getBBox();
        return { width: parseFloat(style.width), height: parseFloat(style.height), inkHeight: ink.height };
      });
      assert.equal(letterGlyph.height, 16);
      assert.ok(letterGlyph.width / letterGlyph.height > 1.4, 'Alphabet glyphs keep their aspect ratio by height');
      assert.ok(letterGlyph.inkHeight / 24 > 0.8, 'The alphabet glyphs\' actual ink fills the peer icons\' hit area');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The duplicates summary bar is a glass surface, group cards have a 14px radius and 20px header padding, and each row has a 1px divider above', { timeout: 60_000 }, async () => {
    const opened = await openDuplicates(browser);
    try {
      const faces = await opened.page.evaluate(() => {
        const glass = getComputedStyle(document.querySelector('[data-filter-glass]')!);
        const group = document.querySelector('#stats section[aria-label="DUPE-002"]')!;
        const head = group.firstElementChild!;
        const card = getComputedStyle(group);
        const header = getComputedStyle(head);
        const code = getComputedStyle(head.querySelector('b')!);
        return {
          glass: { filter: glass.backdropFilter, padding: glass.padding, height: glass.height,
            compact: parseFloat(glass.getPropertyValue('--control-h-compact')) },
          card: { radius: card.borderRadius, overflow: card.overflow, face: card.backgroundColor },
          head: { padding: header.padding, face: header.backgroundColor, size: code.fontSize, weight: code.fontWeight },
          rows: [...group.querySelectorAll('.duplicate-row')].map((row) => {
            const computed = getComputedStyle(row);
            return [computed.borderTopWidth, computed.padding];
          }),
        };
      });
      assert.match(faces.glass.filter, /blur\(/, 'The summary bar has no background blur and is not a glass surface');
      // Controls in the summary bar use the compact size; bar height is 10px padding above and below plus one compact control.
      assert.deepEqual([faces.glass.padding, faces.glass.height], ['10px 16px', `${20 + faces.glass.compact}px`]);
      assert.deepEqual([faces.card.radius, faces.card.overflow], ['14px', 'hidden'], 'Group card radius or clipping is wrong');
      assert.notEqual(faces.head.face, faces.card.face, 'Group header and group card share a color, so the code row does not stand out');
      assert.deepEqual([faces.head.padding, faces.head.size, faces.head.weight], ['20px', '20px', '500']);
      assert.deepEqual(faces.rows, [['1px', '16px 20px'], ['1px', '16px 20px']],
        'Each row in a group lacks the 1px divider above, or the padding is not 16/20');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Stats, HD summary, and configuration empty lists carry background and border without overflowing on narrow screens', { timeout: 60_000 }, async () => {
    const cases = [
      { path: '/stats', title: 'No videos yet', height: 320 },
      { path: '/quality-goals', title: 'No HD target is being marked', height: 320 },
      { path: '/settings/diagnostics', title: 'The list is empty', height: 240 },
      { path: '/settings/subscriptions', title: 'No configurable sources', height: 240 },
    ];
    for (const viewport of [DESKTOP, MOBILE]) {
      for (const example of cases) {
        const opened = await visit(browser, example.path, viewport, async page => {
          await page.route('**/api/stats', async route => {
            const report = await (await route.fetch()).json();
            await route.fulfill({ json: { ...report, by_loc: [] } });
          });
          await page.route('**/api/quality-goals?**', route => route.fulfill({ json: { total: 0, items: [] } }));
          await page.route('**/api/follow/credentials', route => route.fulfill({ json: { providers: [] } }));
          await page.route('**/api/diagnostics', async route => {
            const report = await (await route.fetch()).json();
            report.library.groups = { empty: { label: 'Empty list sample', status: 'ok', count: 0, items: [], truncated: false } };
            await route.fulfill({ json: report });
          });
        });
        try {
          const { page } = opened;
          if (example.path === '/settings/diagnostics') {
            await page.locator('summary').filter({ hasText: 'Empty list sample · 0 items' }).click();
          }
          const empty = page.locator('[data-empty-state]').filter({
            has: page.getByRole('heading', { name: example.title, exact: true }),
          });
          await empty.waitFor();
          await settle(page);
          const face = await empty.evaluate(node => {
            const style = getComputedStyle(node);
            const glyph = node.querySelector('svg')!;
            const frame = glyph.parentElement!;
            return { background: style.backgroundColor, border: style.borderTopWidth, color: style.borderTopColor,
              height: node.getBoundingClientRect().height, glyph: getComputedStyle(glyph).width,
              frame: getComputedStyle(frame).width, title: getComputedStyle(node.querySelector('h3')!).fontSize };
          });
          assert.equal(face.background, await tokenColor(page, '.peach-react', '--color-background-secondary-default'));
          assert.equal(face.border, '1px', `${example.path} empty state is missing a border`);
          assert.equal(face.color, await tokenColor(page, '.peach-react', '--color-separator-border'));
          assert.ok(face.height >= example.height);
          assert.deepEqual([face.glyph, face.frame, face.title], ['32px', '54px', '14px']);
          assert.deepEqual((await layout(page)).offenders, []);
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close(); }
      }
    }
  });

  it('Standard empty states share the background, radius, 320px height, and 54px icon box', { timeout: 60_000 }, async () => {
    // The demo library can produce a duplicate group in one round; only a stubbed-empty result reliably lands on the full-page empty state.
    const opened = await visit(browser, '/duplicates', DESKTOP);
    try {
      const page = opened.page;
      await page.route('**/api/duplicates?**', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ total: 0, files: 0, reclaimable: 0, groups: [] }),
      }));
      await page.reload({ waitUntil: 'load' });
      await page.locator('#stats [data-empty-state]').waitFor({ timeout: 15_000 });
      await settle(page);
      const face = await page.evaluate(() => {
        const root = document.querySelector('#stats [data-empty-state]')!;
        const glyph = root.querySelector('svg')!;
        const box = glyph.parentElement!;
        const shell = getComputedStyle(root);
        const frame = getComputedStyle(box);
        const title = getComputedStyle(root.querySelector('h3')!);
        const copy = getComputedStyle(root.querySelector('p')!);
        return {
          shell: { face: shell.backgroundColor, line: shell.borderTopColor, width: shell.borderTopWidth,
            radius: shell.borderTopLeftRadius, minHeight: shell.minHeight },
          boxed: box !== root,
          frame: { width: frame.width, height: frame.height, radius: frame.borderTopLeftRadius,
            line: frame.borderTopWidth, glyph: getComputedStyle(glyph).width },
          title: [title.fontSize, title.fontWeight], copy: [copy.maxWidth, copy.lineHeight],
        };
      });
      assert.equal(face.shell.face, await tokenColor(page, '.peach-react', '--color-background-secondary-default'),
        'The full-page empty state skips its darker background tier');
      assert.equal(face.shell.line, await tokenColor(page, '.peach-react', '--color-separator-border'), 'Outer frame is not divider-colored');
      assert.deepEqual([face.shell.width, face.shell.radius, face.shell.minHeight], ['1px', '20px', '320px']);
      assert.ok(face.boxed, 'The full-page empty state\'s icon never sits in its box');
      assert.deepEqual(face.frame, { width: '54px', height: '54px', radius: '20px', line: '1px', glyph: '32px' });
      assert.deepEqual(face.title, ['14px', '600']);
      assert.deepEqual(face.copy, ['340px', '20.15px']);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
    // Task records use the same standard empty state.
    const activity = await visit(browser, '/tasks', DESKTOP);
    try {
      await activity.page.route('**/api/tasks', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ available: true, running: [], skipped: [], finished: [] }),
      }));
      await activity.page.reload({ waitUntil: 'load' });
      const empty = activity.page.locator('[data-empty-state]');
      await empty.waitFor({ timeout: 15_000 });
      await settle(activity.page);
      assert.equal(await empty.evaluate((root) => root.querySelector('svg')!.parentElement === root), false,
        'Task empty state missing icon frame');
      assert.deepEqual(activity.problems, []);
    } finally {
      await activity.close();
    }
  });

  it('Skeleton placeholders and button hover give no feedback and cannot be clicked', { timeout: 120_000 }, async () => {
    const name = '七沢みあ';
    const pages: { path: string; ready: string; targets: string[]; prepare?: (page: Page) => Promise<void> }[] = [
      { path: `/performers/${encodeURIComponent(name)}`, ready: '[data-skeleton="entity/performer"] [data-entity-foot] [data-hero-ring]',
        targets: ['[data-skeleton] [data-entity-foot] [data-hero-ring]'],
        prepare: (page) => page.route(/\/api\/entity\/shapes/, (route) => route.fulfill({ json: {
          ok: true, entities: [{ id: 90_001, kind: 'performer', names: [name], parts: ['costars'] }] } })) },
      { path: '/data-cleanup', ready: '[data-skeleton="cleanup"] [data-skeleton-action]',
        targets: ['[data-skeleton] .inline-grid > div', '[data-skeleton] a[href="/sources"]',
          '[data-skeleton] [data-skeleton-action]'] },
      { path: '/data-cleanup/media-repair', ready: '[data-skeleton="cleanup/media-repair"] [data-skeleton-action]',
        targets: ['[data-skeleton] [data-skeleton-action]'] },
      { path: '/review', ready: '[data-skeleton="review"] .reviewtabs button',
        targets: ['[data-skeleton] .reviewtabs button', '[data-skeleton] .skeletoncard'] },
      { path: '/follow', ready: '.followauthors .avskeleton',
        targets: ['.followauthors .avskeleton', '.followworks .brandskeleton', '[data-skeleton^="cards/"] > div > *'] },
      { path: '/subscriptions', ready: '[data-skeleton="board/subscriptions"] .ui-follow-skeleton-toolbar',
        targets: ['[data-skeleton] .ui-follow-skeleton-toolbar [data-follow-toolbar-controls] button',
          '[data-skeleton] .ui-follow-skeleton-toolbar [data-follow-toolbar-actions] > button:nth-of-type(1)'] },
    ];
    for (const { path, ready, targets, prepare } of pages) {
      const opened = await visit(browser, '/', DESKTOP);
      try {
        const page = opened.page;
        // Routes registered later get the request first: the stub must come after the one intercepting /api/, otherwise it gets intercepted too.
        await holdApi(page);
        await prepare?.(page);
        await page.goto(new URL(path, page.url()).href, { waitUntil: 'load' });
        await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 });
        for (const target of targets) {
          const node = page.locator(target).first();
          await node.waitFor({ state: 'visible', timeout: 5_000 });
          // Targets below the first screen (the data management organize card) scroll into the viewport first: `elementFromPoint` only recognizes points inside the viewport.
          await node.scrollIntoViewIfNeeded();
          const box = (await node.boundingBox())!;
          const look = () => node.evaluate((element) => [element, ...element.querySelectorAll('*')].slice(0, 6).map((part) => {
            const style = getComputedStyle(part);
            return [style.borderColor, style.boxShadow, style.backgroundColor, style.backgroundImage,
              style.outlineStyle, style.color, style.scale, style.transform].join(' | ');
          }));
          await page.mouse.move(0, 0);
          const rest = await look();
          const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
          await page.mouse.move(x, y);
          assert.deepEqual(await look(), rest, `${path} ${target} changed appearance on hover`);
          // The tiered skeleton row (`data-skeleton-tier`) is the final track itself, so hitting it equals hitting the page bottom;
          // The question is whether the pointer landed on some placeholder or inside the whole skeleton.
          const hit = await page.evaluate(([px, py]) => {
            const at = document.elementFromPoint(px!, py!);
            return { cursor: at ? getComputedStyle(at).cursor : '',
              inside: !!at?.closest('[data-skeleton],.avskeleton,.brandskeleton,.tagskeleton,.skeletoncard'),
              disabled: !!at?.closest('button:disabled') };
          }, [x, y]);
          assert.ok(['auto', 'default', 'not-allowed'].includes(hit.cursor), `${path} ${target} changed the cursor on hover: ${hit.cursor}`);
          assert.ok(!hit.inside || hit.disabled, `${path} ${target} is still clickable in the skeleton`);
        }
      } finally {
        await opened.close();
      }
    }
  });

  it('Paused sources\' tags use the primary text color; the card\'s last-line feedback face is concentric with the outer frame', { timeout: 60_000 }, async () => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const opened = await openFollowManage(browser, viewport, {
        extra: [{ ...followSource(4, 'paused', 'Kemono', 'paused · Kemono'), enabled: false }],
      });
      try {
        const { page } = opened;
        for (const theme of ['light', 'dark']) {
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
            document.documentElement.classList.toggle('dark', value === 'dark');
          }, theme);
          const card = page.getByRole('region', { name: 'A paused follow source', exact: true });
          const badge = card.getByText('Paused', { exact: true });
          assert.equal(await badge.evaluate((node) => getComputedStyle(node).color),
            await tokenColor(page, '.peach-react', '--color-text-primary'));
          assert.notEqual(await badge.evaluate((node) => getComputedStyle(node).backgroundColor),
            await card.evaluate((node) => getComputedStyle(node).backgroundColor));
          const row = card.locator('[data-follow-source-row]').last();
          await row.hover();
          const corners = await row.evaluate((node) => {
            const parent = node.closest('section')!, outer = getComputedStyle(parent), inner = getComputedStyle(node);
            return { outer: parseFloat(outer.borderBottomLeftRadius), inset: parseFloat(outer.paddingBottom),
              left: parseFloat(inner.borderBottomLeftRadius), right: parseFloat(inner.borderBottomRightRadius),
              top: parseFloat(inner.borderTopLeftRadius) };
          });
          assert.equal(corners.left + corners.inset, corners.outer);
          assert.equal(corners.right, corners.left);
          assert.equal(corners.top, 0);
        }
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    }
  });

  it('Checked sources get the BoardUI data table\'s selected background in both card and table layouts', { timeout: 60_000 }, async () => {
    const opened = await openFollowManage(browser);
    try {
      const page = opened.page;
      const selected = await tokenColor(page, '.peach-react', '--color-background-secondary-default');
      await page.getByRole('checkbox', { name: 'Select kou · Kemono' }).check({ force: true, timeout: 5_000 });
      const cardRow = page.locator('[data-source-divider] > [data-selected]');
      assert.equal(await cardRow.count(), 1);
      assert.equal(await cardRow.evaluate((row) => getComputedStyle(row).backgroundColor), selected,
        'The card\'s selected row never painted the selected background');

      await page.locator('button[aria-label="Table view"]').click({ timeout: 5_000 });
      const tableRow = page.locator('[data-follow-selected]');
      await tableRow.waitFor({ timeout: 5_000 });
      assert.equal(await tableRow.evaluate((row) => getComputedStyle(row).backgroundColor), selected,
        'The table\'s selected row and the card\'s are not the same tier');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The alias group count reads in secondary text color, never borrowing note or primary button colors', { timeout: 60_000 }, async () => {
    const opened = await openFollowManage(browser);
    try {
      await followTab(opened, 'Add follow');
      const count = opened.page.getByText('1 group', { exact: true });
      const look = await count.evaluate((node) => ({
        ink: getComputedStyle(node).color, face: getComputedStyle(node).backgroundColor,
      }));
      assert.equal(look.ink, await tokenColor(opened.page, '.peach-react', '--color-text-secondary'));
      assert.equal(look.face, 'rgba(0, 0, 0, 0)', 'The group count painted as a backed badge');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  /* Suggestions come from here, 30 entries across the two groups, and they do not fit below the field in either viewport. Desktop takes 1280×1000,
     with the field's lower edge in the lower half of the viewport: exactly the situation that can only open downward and cannot fit entirely. */
  for (const viewport of [{ ...DESKTOP, height: 1000 }, MOBILE]) {
    it(`The add-follow suggestion dropdown fits the space under the field, scrolls inside the menu when it cannot fit, and scrolls the selected row into view (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openFollowManage(browser, viewport);
      try {
        const { page } = opened;
        await page.route(/\/api\/follow\/suggest\?/, (route) => route.fulfill({ json: {
          q: 'bulging',
          groups: [['Archive site', 18], ['Site categories', 12]].map(([label, count]) => ({
            kind: String(label), label,
            items: Array.from({ length: Number(count) }, (_, at) => ({
              value: `bulging ${label} ${at + 1}`, matched: 'Kemono', n: 120 - at,
            })),
          })),
        } }));
        await followTab(opened, 'Add follow');
        const before = await page.evaluate(() => document.documentElement.scrollHeight);
        const input = page.getByRole('textbox', { name: 'Source link, name or id' });
        await input.click({ timeout: 5_000 });
        await input.fill('bulging');
        const menu = page.locator('[aria-label="Source suggestions"]');
        await menu.locator('button').nth(29).waitFor({ state: 'attached', timeout: 10_000 });
        const measure = () => menu.evaluate((element) => {
          for (const animation of element.getAnimations({ subtree: true })) animation.finish();
          const box = element.getBoundingClientRect();
          const field = element.ownerDocument.querySelector('input[aria-label="Source link, name, or id"]')!
            .getBoundingClientRect();
          const row = element.querySelector('[aria-current="true"]')?.getBoundingClientRect();
          return {
            top: box.top, bottom: box.bottom, fieldBottom: field.bottom, viewport: innerHeight,
            overflowing: element.scrollHeight > element.clientHeight,
            overscroll: getComputedStyle(element).overscrollBehaviorY,
            page: document.documentElement.scrollHeight, pageWidth: document.documentElement.scrollWidth,
            width: innerWidth, y: scrollY,
            row: row ? { top: row.top, bottom: row.bottom } : null,
          };
        });
        const open = await measure();
        assert.ok(open.bottom <= open.viewport + .5, `Dropdown bottom edge ${open.bottom} exceeds the viewport ${open.viewport}`);
        assert.ok(open.top >= open.fieldBottom, `The dropdown top edge ${open.top} covers the field (bottom edge ${open.fieldBottom})`);
        assert.ok(open.overflowing, '30 suggestions did not overflow the dropdown, so this test never exercised inner scrolling');
        assert.equal(open.overscroll, 'contain', 'Scrolling the dropdown to its end drags the page along');
        assert.ok(open.page <= before, `The dropdown grew the page from ${before} to ${open.page}`);
        assert.ok(open.pageWidth <= open.width, `The page overflows into horizontal scroll: ${open.pageWidth} > ${open.width}`);

        // Walk to the last entry: it sits outside the initially visible area and must be scrolled in, while the page itself does not move.
        for (let step = 0; step < 30; step++) await input.press('ArrowDown');
        const last = await measure();
        assert.ok(last.row, 'Arrow keys selected no row');
        assert.ok(last.row.top >= last.top - .5 && last.row.bottom <= last.bottom + .5,
          `Selected rows ${last.row.top}–${last.row.bottom} are outside the dropdown's visible range ${last.top}–${last.bottom}`);
        assert.equal(last.y, open.y, 'Scrolling the selected row into view scrolled the page too');
        await input.press('ArrowDown');
        const first = await measure();
        assert.ok(first.row && first.row.top >= first.top - .5, 'After wrapping to the first one it never scrolled back into view');
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  for (const viewport of [DESKTOP, { ...MOBILE, name: 'narrow', width: 320 }]) {
    it(`Seven-digit counts and units stay on one line inside the card; source rows with long names and long errors do not overflow the row, and on desktop the action buttons share a line with the name (${viewport.name})`, { timeout: 60_000 }, async () => {
      const long = 'ThisIsAVeryLongUsernameThatPatreonAllowsWithoutAnySpaces2024';
      const opened = await openFollowManage(browser, viewport, {
        counts: { new: 1284000, seen: 22000, saved: 0, ignored: 0 },
        extra: [
          followSource(4, long, 'Patreon', `${long} · Patreon`),
          { ...followSource(5, 'broken', 'Kemono', 'broken · Kemono', 'error'),
            last_error: `peach.follow_providers.ProviderError: HTTP 403: <!DOCTYPE html>${'<div class="cf">'.repeat(40)}` },
        ],
      });
      try {
        await opened.page.waitForFunction(() => {
          const card = document.querySelector('[data-measured-reading="updates"]');
          const value = card?.querySelector('[skullet-pane]:not([skullet-exiting]) [data-follow-reading]');
          return !!card && !card.querySelector('[aria-busy="true"]') && value?.textContent?.includes('1,284,000');
        });
        const spill = await opened.page.evaluate(() => {
          const out = (node: Element, frame: Element) => node.getBoundingClientRect().right > frame.getBoundingClientRect().right + 1;
          const values = [...document.querySelectorAll('[data-measured-reading] [data-follow-reading]')]
            .filter(node => !node.closest('[aria-hidden="true"], [inert], [skullet-exiting]'));
          const readings = values
            .filter((node) => [...node.children].some((part) => out(part, node.parentElement!)))
            .map((node) => node.textContent);
          const wrapped = values.filter((node) => {
            const [figure, unit] = [...node.children].map((part) => part.getBoundingClientRect());
            return unit!.top >= figure!.bottom - 1;
          }).map((node) => node.textContent);
          const rows = [...document.querySelectorAll('[data-follow-source-row]')];
          const spilled = rows
            .filter((row) => row.scrollWidth > row.clientWidth + 1 || [...row.querySelectorAll('button, [role="switch"], input')]
              .some((control) => out(control, row)))
            .map((row) => row.textContent);
          // When the last action button's vertical centerline falls between the name column's top and bottom edges, it is the same row.
          const split = rows.filter((row) => {
            const name = row.querySelector('a')!.parentElement!.getBoundingClientRect();
            const last = [...row.querySelectorAll('button')].at(-1)!.getBoundingClientRect();
            const middle = (last.top + last.bottom) / 2;
            return middle < name.top - 1 || middle > name.bottom + 1;
          }).map((row) => row.textContent);
          return { readings, wrapped, spilled, split, rows: rows.length, values: values.length,
            text: document.querySelector('[data-measured-reading="updates"] [skullet-pane]:not([skullet-exiting]) [data-follow-reading]')?.textContent };
        });
        assert.ok(spill.text?.includes('1,284,000'), `The reading never reached seven digits: ${spill.text}`);
        assert.equal(spill.values, 6, 'Six visible real readings should be measured, hidden samples excluded');
        assert.equal(spill.rows, 5, 'The five stubbed sources did not all paint');
        assert.deepEqual(spill.readings, [], 'The reading leaves the card');
        assert.deepEqual(spill.wrapped, [], 'A seven-digit reading pushed its unit onto the next line');
        assert.deepEqual(spill.spilled, [], 'The source row\'s controls leave the row');
        if (!viewport.mobile) assert.deepEqual(spill.split, [], 'On desktop the source row\'s action key dropped below the name');
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  it('The four credential states get four backgrounds: pending and done are distinguishable at a glance', { timeout: 60_000 }, async () => {
    const opened = await openFollowManage(browser);
    try {
      await opened.page.getByRole('link', { name: /^来源与订阅设置/ }).click();
      await opened.page.getByRole('tab', { name: 'Sources and subscriptions', exact: true, selected: true }).waitFor();
      await opened.page.getByRole('region', { name: 'Configurable credentials', exact: true }).waitFor();
      await settle(opened.page);
      const faces: Record<string, string> = {};
      for (const state of ['Required', 'Configured', 'Cannot connect right now', 'Not needed']) {
        faces[state] = await opened.page.getByText(state, { exact: true }).first()
          .evaluate((chip) => getComputedStyle(chip).backgroundColor);
      }
      assert.equal(new Set(Object.values(faces)).size, 4, `Two situations share a color: ${JSON.stringify(faces)}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('In the light theme the two watch marks gain a backing on hover, and the profile card carries the subscribe-to-new-releases switch', { timeout: 60_000 }, async () => {
    // The demo library has no person entities: the details come from here, with entry and toggle fields shaped exactly as the server assembles and ships them.
    const name = '七沢みあ';
    const opened = await visit(browser, '/', DESKTOP);
    try {
      await opened.page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
        id: 90_001, kind: 'performer', canonical_name: name, aliases: [], display_aliases: [],
        user_aliases: [], asset_count: 0, tags: [], related_performers: [], links: [],
        metadata: {}, has_image: false, has_avatar: false, avatar_focus: null,
        representative_asset_id: null,
        entry_links: [{ site: 'javdb', label: 'JavDB', ordinal: '', slot: 'mark',
          mark: 'mark-javdb', url: 'https://javdb.com/actors/NPD3' }],
        feed: { following: false },
      } }));
      await opened.page.goto(new URL(`/performers/${encodeURIComponent(name)}`,
        opened.page.url()).href, { waitUntil: 'load' });
      const mark = opened.page.locator('[data-entry-marks] a[data-entry-mark]').first();
      await mark.waitFor({ timeout: 15_000 });
      await settle(opened.page);
      // In light mode `--hover` and the profile card's `--ground` are both #f7f7f7, so the backing layer amounts to nothing.
      await opened.page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
        document.documentElement.classList.remove('dark');
      });
      await mark.hover();
      const faces = await mark.evaluate((element) => ({
        mark: getComputedStyle(element).backgroundColor,
        card: getComputedStyle(element.closest('[data-entity-card]')!).backgroundColor,
      }));
      assert.notEqual(faces.mark, 'rgba(0, 0, 0, 0)', 'Hover has no backdrop');
      assert.notEqual(faces.mark, faces.card, 'The hover background matches the profile card, so it cannot be seen');
      const toggle = opened.page.getByRole('switch', { name: 'Subscribe to new releases' });
      assert.equal(await toggle.count(), 1, 'The profile card has no new releases toggle');
      assert.equal(await toggle.isChecked(), false);
      const feed = opened.page.locator('[data-entry-feed]');
      await opened.page.emulateMedia({ reducedMotion: 'no-preference' });
      assert.equal(await feed.evaluate((element) => getComputedStyle(element).animationName),
        'entryfeed-breathe', 'The unsubscribed icon does not breathe — a small ink icon nobody notices');
      const tip = opened.page.locator('#entityFeedTip');
      assert.equal(await tip.isVisible(), false);
      await feed.hover();
      assert.equal(await tip.isVisible(), true, 'Hovering never explains what this icon does');
      assert.equal(await tip.innerText(), 'Subscribe to new releases');
      const placed = await tip.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
      });
      assert.ok(placed, 'Help overlay overflows the viewport');
      await toggle.focus();
      await opened.page.keyboard.press('Escape');
      assert.equal(await tip.isVisible(), false, 'Escape never collapses the note popover');
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`The subscribe-to-new-releases note sits fully outside: never clipped by the profile card nor covered by the co-stars row (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openPerformer(browser, viewport);
      try {
        const page = opened.page;
        const feed = page.locator('[data-entry-feed]');
        await feed.hover();
        const tip = page.locator('#entityFeedTip');
        await tip.waitFor({ state: 'visible', timeout: 5_000 });
        const placement = await tip.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const clippedBy: string[] = [];
          // Elements in the top layer are not clipped by ancestor overflow; only overlays written into the document flow need measuring layer by layer.
          const topLayer = element.matches(':popover-open');
          for (let node = topLayer ? null : element.parentElement; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
            const clip = node.getBoundingClientRect();
            if (box.left < clip.left - 0.5 || box.right > clip.right + 0.5
              || box.top < clip.top - 0.5 || box.bottom > clip.bottom + 0.5) clippedBy.push(node.className || node.tagName);
          }
          // The overlay itself does not receive pointers; temporarily re-enable them and probe the four edges and the center for the topmost element, and whatever covers it reveals itself.
          // Sample points sit 16px from the corners: the bit outside the rounded corner was never part of it.
          element.style.pointerEvents = 'auto';
          const [midX, midY] = [box.left + box.width / 2, box.top + box.height / 2];
          const covered = [[box.left + 16, box.top + 2], [box.right - 16, box.top + 2], [box.left + 16, box.bottom - 2],
            [box.right - 16, box.bottom - 2], [box.left + 2, midY], [box.right - 2, midY], [midX, midY]]
            .map(([x, y]) => document.elementFromPoint(x!, y!))
            .filter((hit) => !hit || !element.contains(hit)).map((hit) => hit?.className || 'null');
          element.style.pointerEvents = '';
          return { inView: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
            clippedBy, covered, below: box.top >= document.querySelector('[data-entry-feed]')!.getBoundingClientRect().bottom };
        });
        assert.ok(placement.inView, 'Help overlay overflows the viewport');
        assert.deepEqual(placement.clippedBy, [], 'The note popover gets clipped by an outer container');
        assert.deepEqual(placement.covered, [], 'The description overlay is covered by something else');
        assert.ok(placement.below, 'When it fits below the viewport, the note popover should sit under the icon');
        const page_ = await layout(page);
        assert.ok(page_.scrollWidth <= page_.viewportWidth, 'The note popover pushed the page into horizontal scroll');
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  // With a 1000px window and the sidebar expanded, the content area is left with only about 700px: the three-column criterion measures the content area, so this tier must lay out in two rows,
  // The identity column must not be squeezed by the details table down to one character wide.
  for (const [viewport, stacked] of [[DESKTOP, false], [{ name: 'wide', width: 1440, height: 900, mobile: false }, false],
    [{ name: 'mid', width: 1000, height: 900, mobile: false }, true], [MOBILE, true]] as const) {
    it(`Performer header: on wide screens the profile table sits right of the identity block with a vertical rule, on narrow screens it moves below with a horizontal rule, and the card never overflows (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openProfiledPerformer(browser, viewport);
      try {
        const geometry = await heroGeometry(opened.page);
        assert.deepEqual(geometry.labels, ['Birthday', 'Figure', 'Debut', 'Career', 'Tags'], 'Profile table is not those five fields');
        assert.ok(geometry.facts && geometry.identity && geometry.hero, 'The header is missing the profile table');
        assert.ok(geometry.identity.right - geometry.identity.left >= 240, 'Identity column squeezed too narrow');
        if (stacked) {
          assert.ok(geometry.facts.top >= geometry.identity.bottom - 0.5, 'On narrow screens the profile table did not move under the identity info');
          assert.deepEqual(geometry.rule, { left: '0px', top: '1px' }, 'On narrow screens the profile table should separate from identity info with a horizontal rule');
        } else {
          assert.ok(geometry.facts.left >= geometry.identity.right - 0.5, 'On wide screens the profile table did not sit right of the identity info');
          assert.deepEqual(geometry.rule, { left: '1px', top: '0px' }, 'On wide screens the profile table should separate from identity info with a vertical rule');
        }
        assert.ok(geometry.facts.right <= geometry.hero.right + 0.5, 'Profile table overflows the profile card');
        assert.equal(geometry.heroScrolls, false, 'Something in the profile card is clipped horizontally');
        const debut = await opened.page.locator('[data-entity-facts] dd[title]').evaluate((dd) => ({
          title: dd.getAttribute('title'), wrap: getComputedStyle(dd).whiteSpace,
          cut: getComputedStyle(dd).textOverflow, clipped: dd.scrollWidth > dd.clientWidth,
          lines: Math.round(dd.getBoundingClientRect().height / parseFloat(getComputedStyle(dd).lineHeight)),
        }));
        assert.equal(debut.title, PROFILED.profile.debut_title, 'The debut cell\'s title does not give the full name');
        assert.deepEqual([debut.wrap, debut.cut, debut.lines], ['nowrap', 'ellipsis', 1], 'The debut title never truncates to one line');
        const page_ = await layout(opened.page);
        assert.ok(page_.scrollWidth <= page_.viewportWidth, `Page header pushed the page into horizontal scroll: ${page_.offenders.join(', ')}`);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`The company profile page shows company and brand facts, and long addresses wrap (${viewport.name})`, { timeout: 60_000 }, async () => {
      const fact = (value: string) => ({ value, source_url: 'https://company.example/about' });
      const opened = await openProfiledPerformer(browser, viewport, 'light', {
        kind: 'studio', canonical_name: 'Company', profile: undefined, agency: undefined,
        company_profile: { legal_name: fact('Example Company, LLC'), founded: fact('2002-05'),
          launched: fact('2016'), operator: fact('General Media Systems, LLC'),
          location: fact('LongOfficeAddressWithoutSpaces'.repeat(5)) },
      });
      try {
        await opened.page.goto(new URL('/studios/Company', opened.page.url()).href, { waitUntil: 'load' });
        await opened.page.locator('[data-entity-facts]').waitFor();
        await settle(opened.page);
        const geometry = await heroGeometry(opened.page);
        assert.deepEqual(geometry.labels, ['Company name', 'Company founded', 'Brand launched', 'Location', 'Operating company']);
        assert.equal(geometry.heroScrolls, false);
        assert.ok(geometry.hero && geometry.facts && geometry.facts.right <= geometry.hero.right + 1);
        assert.equal(await opened.page.locator('[data-entity-facts] [title]').count(), 0);
        const page_ = await layout(opened.page);
        assert.ok(page_.scrollWidth <= page_.viewportWidth);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  it('Performer header row under the name: video count, agency and reading plus the first three aliases, with external links always 36px icon-only squares', { timeout: 60_000 }, async () => {
    const opened = await openProfiledPerformer(browser, DESKTOP);
    try {
      const page = opened.page;
      const line = await page.locator('[data-entity-alias]').evaluate((alias) => ({
        glyphs: [...alias.querySelectorAll(':scope > [data-meta-item] > svg use')].map((use) => use.getAttribute('href')),
        names: [...alias.querySelectorAll('[data-alias-names] > span')].map((span) => span.textContent!.trim()),
        more: alias.querySelector('[data-hero-more="alias"]')?.textContent?.trim() ?? '',
        agency: alias.querySelector('a[data-agency]')?.textContent?.trim() ?? '',
      }));
      assert.deepEqual(line.glyphs, ['#i-film', '#i-briefcase', '#i-id-card'], 'The name row\'s three items are not videos, agency, aliases');
      assert.deepEqual(line.names, ['しのだゆう', '篠崎ゆう子', '高木早希', '橋本真紀'], 'Readings do not lead the aliases, or the aliases are not the first three');
      assert.equal(line.more, '+4', 'The "+N" does not count the remaining aliases');
      assert.equal(line.agency, 'New Actor eXperience');
      const links = await page.locator('[data-entity-links] a').evaluateAll((anchors) => anchors.map((a) => {
        const box = a.getBoundingClientRect();
        return { size: `${Math.round(box.width)}x${Math.round(box.height)}`, kind: a.getAttribute('data-link'), title: a.getAttribute('title'),
          name: a.getAttribute('aria-label') ?? '', visibleText: a.querySelector('[data-link-label]') !== null };
      }));
      assert.equal(links.length, 3);
      for (const link of links) {
        assert.deepEqual([link.size, link.kind, link.visibleText], ['36x36', 'icon', false], `${link.title} is not a pure icon tile`);
        assert.equal(link.name, link.title, `${link.title} screen reader name and hover tooltip do not match`);
      }
      assert.deepEqual(links.map((link) => link.title), ['みんなのAV', 'New Actor eXperience official profile', 'X @shinoda_yu']);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`The aliases "+N" popover groups by name in the top layer, shows on hover and focus, is never clipped by the profile card, and collapses on Escape (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openProfiledPerformer(browser, viewport);
      try {
        const page = opened.page;
        const more = page.locator('[data-hero-more="alias"]');
        const pop = page.locator('#entityAliasPop');
        assert.equal(await pop.isVisible(), false);
        await more.hover();
        await pop.waitFor({ state: 'visible', timeout: 5_000 });
        assert.equal(await more.getAttribute('aria-expanded'), 'true');
        const shown = await pop.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            topLayer: element.matches(':popover-open'),
            inView: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
            title: element.querySelector('[data-hero-pop-head]')?.textContent?.trim(),
            groups: [...element.querySelectorAll('dt')].map((dt) => dt.textContent!.trim()),
            face: getComputedStyle(element).backgroundColor,
            shadow: getComputedStyle(element).boxShadow,
          };
        });
        assert.equal(shown.shadow, await popmenuShadow(page), 'The alias popover\'s shadow differs from .popmenu\'s');
        assert.equal(shown.topLayer, true, 'The alias popover is not in the top layer, so the profile card\'s overflow:hidden clips it');
        assert.ok(shown.inView, 'Alias popover overflows the viewport');
        assert.equal(shown.title, '7 aliases');
        assert.deepEqual(shown.groups, ['Former name', '舞ワイフ', 'ラグジュTV', 'Other']);
        assert.notEqual(shown.face, 'rgba(0, 0, 0, 0)', 'Alias popover has no background');
        // The pointer moves from the button onto the overlay to read the name; the overlay must not collapse midway.
        const box = (await pop.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
        await page.waitForTimeout(300);
        assert.equal(await pop.isVisible(), true, 'Moving the pointer onto the overlay collapses it');
        await page.mouse.move(1, 1);
        await pop.waitFor({ state: 'hidden', timeout: 5_000 });
        await more.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await pop.waitFor({ state: 'visible', timeout: 5_000 });
        await page.keyboard.press('Escape');
        assert.equal(await pop.isVisible(), false, 'Escape never collapses the alias popover');
        const page_ = await layout(page);
        assert.ok(page_.scrollWidth <= page_.viewportWidth, 'The alias popover pushed the page into horizontal scroll');
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  // If the button right of the name opened leftward, the 260px menu would cross over the name and cover the avatar (reported by a user).
  for (const viewport of [DESKTOP, MOBILE]) {
    it(`Name and alias menus open rightward from the button's left edge without covering the header avatar (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openProfiledPerformer(browser, viewport);
      try {
        const page = opened.page;
        await page.locator('[data-namepick-toggle]').click();
        await page.locator('[data-namepick-menu]').waitFor({ state: 'visible', timeout: 5_000 });
        const box = await page.evaluate(() => {
          const rect = (selector: string) => {
            const b = document.querySelector(selector)!.getBoundingClientRect();
            return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
          };
          return { menu: rect('[data-namepick-menu]'), portrait: rect('[data-entity-portrait]'), toggle: rect('[data-namepick-toggle]') };
        });
        const overlaps = box.menu.left < box.portrait.right && box.menu.right > box.portrait.left
          && box.menu.top < box.portrait.bottom && box.menu.bottom > box.portrait.top;
        assert.equal(overlaps, false, `The name menu covers the avatar: ${JSON.stringify(box)}`);
        assert.ok(box.menu.left >= 0 && box.menu.right <= viewport.width, 'Name menu overflows the viewport');
        if (!viewport.mobile) assert.ok(Math.abs(box.menu.left - box.toggle.left) < 1, 'On wide screens the menu never aligns with the button\'s left edge');
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }
});
