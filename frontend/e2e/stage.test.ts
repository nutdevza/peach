/* The stage island's (`frontend/src/react/stage/`) behavior in a real browser: both details share one stage, closing returns
 * to the origin, deep links, skeleton reveal, Video.js and its controls (quality, theater, hints, narrow-screen collapse,
 * stats badge, context menu), the mini player (enter/exit, expand without rebuild, drag snapping), the player handoff when
 * the queue switches entries, Escape closing the innermost layer first, and phone 390.
 *
 * Stub data in `item-fixture.ts` and `follow-fixture.ts`; all read and write endpoints are caught by stubs, and the demo
 * library database is never written. The stream source serves no actual video: the mini player is always entered via the i
 * key or context menu (bypassing playback-state judgment), never by actually playing. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { DETAIL, openFollowFeed } from './follow-fixture.ts';
import { layout, launch, stubTimelineSheets, VIEWPORTS } from './harness.ts';
import { ITEM, openItemPage } from './item-fixture.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const MOBILE = VIEWPORTS.find((viewport) => viewport.mobile)!;
const ITEM_READY = '#stage[open] [data-item-side]';
const FOLLOW_READY = '#stage[open] [data-follow-detail-side]';
const PLAYER = '#stage .video-js .vjs-control-bar';
/** The stub stream has no actual feature; the player reports a VIDEOJS error on the empty response. That is not what is being measured. */
const withoutPlayer = (problems: string[]) => problems.filter((line) => !line.includes('VIDEOJS'));
const pathIs = (page: Page, path: string) => page.waitForFunction(
  (wanted) => location.pathname === wanted, path, { timeout: 10_000 });
const card = (id: number) => `#grid [data-media-card][data-id="${id}"] [data-media-title]`;

/** The stage host lives permanently on body, and the host contains exactly one `<dialog id="stage">`. */
const stageShape = (page: Page) => page.evaluate(() => {
  const stage = document.getElementById('stage');
  return {
    host: stage?.parentElement?.matches('body > [data-stage-host]') ?? false,
    modal: stage?.matches(':modal') ?? false,
    stages: document.querySelectorAll('dialog#stage').length,
    hosts: document.querySelectorAll('[data-stage-host]').length,
  };
});

/** Marks the player currently on the stage: finding the same mark later means it is the same instance. */
const markPlayer = (page: Page, selector: string) => page.evaluate((scope) => {
  const player = document.querySelector<HTMLElement>(`${scope} .video-js`)!;
  player.dataset.probe = 'kept';
}, selector);

/** Enter the mini player: press i with focus in the stage, matching YouTube's meaning. */
async function toMiniplayer(page: Page): Promise<void> {
  await page.locator(PLAYER).waitFor({ state: 'attached' });
  await page.keyboard.press('i');
  await page.locator('#miniplayer:not([hidden]) .video-js').waitFor({ timeout: 10_000 });
  await page.locator('#stage[open]').waitFor({ state: 'detached', timeout: 10_000 });
}

describe('Stage island', () => {
  let browser: Browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser.close();
  });

  it('Catalog cards and follow cards share one stage: the host stays on body, closing returns to where you came from, and the list is not refetched', { timeout: 90_000 }, async () => {
    const catalog = await openItemPage(browser, '/', DESKTOP, { ready: card(ITEM.plain) });
    try {
      const page = catalog.page;
      const listed = catalog.stub.reads.get('/api/items') || 0;
      await page.locator(card(ITEM.plain)).first().click();
      await page.locator(ITEM_READY).waitFor();
      assert.deepEqual(await stageShape(page), { host: true, modal: true, stages: 1, hosts: 1 });
      await page.evaluate(() => { (window as unknown as { stageHost: Element }).stageHost = document.querySelector('[data-stage-host]')! });
      await page.locator('#closeStage').click();
      await pathIs(page, '/');
      await page.locator('#stage').waitFor({ state: 'detached', timeout: 10_000 });
      await page.locator(card(ITEM.cast)).first().click();
      await page.locator(ITEM_READY).waitFor();
      assert.equal(await page.evaluate(() =>
        (window as unknown as { stageHost: Element }).stageHost === document.querySelector('[data-stage-host]')), true, 'After switching entries the stage host changes to another one');
      await page.locator('#closeStage').click();
      await pathIs(page, '/');
      assert.equal(catalog.stub.reads.get('/api/items') || 0, listed, 'Closing details returns to the list and refetches');
      assert.deepEqual(withoutPlayer(catalog.problems), []);
    } finally {
      await catalog.close();
    }
    const follow = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = follow.page;
      let listed = 0;
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname === '/api/follow' && !url.searchParams.has('item')) listed += 1;
      });
      await page.locator('[data-follow-item="1002"] [data-follow-open]').click();
      await page.locator(FOLLOW_READY).waitFor();
      assert.deepEqual(await stageShape(page), { host: true, modal: true, stages: 1, hosts: 1 });
      await page.locator('[data-follow-related] [data-follow-item]').first().waitFor();
      const listedBeforeClose = listed;
      await page.locator('#closeStage').click();
      await pathIs(page, '/follow');
      await page.locator('[data-follow-list] > [data-follow-item]').first().waitFor();
      assert.equal(listed, listedBeforeClose, 'Closing details back to the follows list refetched once');
      assert.deepEqual(withoutPlayer(follow.problems), []);
    } finally {
      await follow.close();
    }
  });

  it('Clicking outside the overlay exits details back to the origin; pressing inside the overlay and releasing outside does not count', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, '/', DESKTOP, { ready: card(ITEM.plain) });
    try {
      const page = opened.page;
      await page.locator(card(ITEM.plain)).first().click();
      await page.locator(ITEM_READY).waitFor();
      const box = (await page.locator('#stage').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 40);
      await page.mouse.down();
      await page.mouse.move(4, 4, { steps: 4 });
      await page.mouse.up();
      assert.equal(await page.locator('#stage[open]').count(), 1, 'Dragging out of the popover and releasing also closed the details');
      await page.mouse.click(4, 4);
      await pathIs(page, '/');
      await page.locator('#stage').waitFor({ state: 'detached', timeout: 10_000 });
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Deep links enter both kinds of details directly: skeleton first, then reveal, and focus moves to the close button once content arrives', { timeout: 60_000 }, async () => {
    const item = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      assert.deepEqual(await stageShape(item.page), { host: true, modal: true, stages: 1, hosts: 1 });
      assert.equal(await item.page.evaluate(() => document.activeElement?.id), 'closeStage');
      assert.equal(await item.page.locator('#stage [data-skeleton]').count(), 0, 'The skeleton stays after the reveal');
      assert.deepEqual(withoutPlayer(item.problems), []);
    } finally {
      await item.close();
    }
    const follow = await openFollowFeed(browser, `/posts/${DETAIL.collection}`, DESKTOP, { ready: FOLLOW_READY });
    try {
      assert.deepEqual(await stageShape(follow.page), { host: true, modal: true, stages: 1, hosts: 1 });
      assert.equal(await follow.page.evaluate(() => document.activeElement?.id), 'closeStage');
      assert.deepEqual(withoutPlayer(follow.problems), []);
    } finally {
      await follow.close();
    }
  });

  it('The title in the skeleton\'s reveal segment already wraps to two lines instead of filling first and retracting', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, '/', DESKTOP, { ready: card(ITEM.plain) });
    try {
      const page = opened.page;
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      let release = () => {};
      const held = new Promise<void>((resolve) => { release = resolve });
      await page.route((url) => url.pathname === '/api/item', async (route) => { await held; await route.fallback() });
      // The long-title entry is not in the catalog: it is deep-linked, and the stage island draws the skeleton.
      await page.goto(new URL(`/assets/${ITEM.long}`, page.url()).toString(), { waitUntil: 'load' });
      await page.locator('#stage[open] [data-skeleton="detail"]').waitFor({ timeout: 15_000 });
      /* During the reveal, measure the title's line count every frame until the fade layer is removed. */
      const sampled = page.evaluate(() => new Promise<number[]>((resolve) => {
        const lines: number[] = [];
        const tick = () => {
          const title = document.querySelector<HTMLElement>('#stage [data-detail-title]');
          if (title) lines.push(Math.round(title.clientHeight / parseFloat(getComputedStyle(title).lineHeight)));
          if (title && !document.querySelector('#stage [data-stage-fade]')) { resolve(lines); return }
          requestAnimationFrame(tick);
        };
        tick();
      }));
      release();
      const lines = await sampled;
      assert.ok(lines.length > 0, 'Title not measured during the reveal');
      assert.deepEqual([...new Set(lines)], [2], `Title line counts during the reveal: ${lines.join(',')}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Video.js mounted: the quality key opens the settings panel, the stats badge is mutually exclusive with it, the theater key and T toggle, and tooltips carry shortcuts', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator(PLAYER).waitFor({ state: 'attached' });
      assert.equal(await page.locator('#stage .vjs-time-tooltip').count(),0);
      assert.equal(await page.locator('#stage [data-player-time]').count(),1);
      assert.equal(await page.locator('#stage [data-player-seek-preview]').count(),1);
      const settings = page.locator('#stage .vjs-peach-settings-toggle');
      const stats = page.locator('#stage #playerStatsBtn');
      await stats.waitFor();
      await settings.dispatchEvent('click');
      assert.equal(await settings.getAttribute('aria-expanded'), 'true', 'The quality key never opened the settings panel');
      await stats.click();
      assert.equal(await stats.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#stage #playerStats').isVisible(), true, 'The stats panel never opened');
      assert.equal(await settings.getAttribute('aria-expanded'), 'false', 'Opening stats never collapsed the settings panel');
      await settings.dispatchEvent('click');
      assert.equal(await page.locator('#stage #playerStats').isHidden(), true, 'Opening the settings panel never collapsed stats');
      await settings.dispatchEvent('click');

      const theater = page.locator('#stage [data-player-theater]');
      await theater.dispatchEvent('click');
      assert.equal(await page.locator('#stage[data-theater]').count(), 1, 'The theater key never switched to theater mode');
      assert.equal(await theater.getAttribute('aria-pressed'), 'true');
      await page.locator('#closeStage').focus();
      await page.keyboard.press('t');
      assert.equal(await page.locator('#stage[data-theater]').count(), 0, 'The T key never switched back');
      assert.equal(await theater.getAttribute('aria-pressed'), 'false');

      for (const size of [{ width: 1074, height: 884 }, { width: 390, height: 844 }, { width: 1320, height: 1088 }]) {
        await page.setViewportSize(size);
        await page.waitForFunction(() => {
          const media = document.querySelector('#stage [data-stage-media]')?.getBoundingClientRect();
          const controls = document.querySelector('#stage .vjs-control-bar')?.getBoundingClientRect();
          const timeline = document.querySelector('#stage .vjs-progress-control')?.getBoundingClientRect();
          return media && controls && timeline && controls.bottom <= media.bottom + 1
            && timeline.top >= media.top - 1 && timeline.right <= media.right + 1;
        });
      }
      await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });

      /* The stubbed source cannot play, so Video.js sits in the error state and the control bar ignores pointers, which makes hover unmeasurable; only the prompt's content is measured. */
      const tip = page.locator('#stage [data-player-theater] > .vjs-peach-tooltip');
      assert.equal(await theater.getAttribute('title'), null, 'The native title and the drawn tooltip would stack');
      assert.deepEqual(await tip.evaluate((node) => [node.querySelector('.vjs-peach-tooltip-text')?.textContent,
        node.querySelector('kbd')?.textContent]), ['Theater mode', 'T']);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Progress bar frame preview: take a cell by time, edges stay whole within the progress bar, and each page\'s mosaic is fetched only once; the mini window and touch drag share the same block', { timeout: 60_000 }, async () => {
    let requested = new Map<number, number>();
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      // The stub entry is 3600 seconds, one frame every 10 seconds, 360 frames total, 4 tile images. After mounting, entering detail, the player fetches the index on mount.
      requested = await stubTimelineSheets(page, { frames: 360, interval: 10 });
      await page.reload({ waitUntil: 'load' });
      await page.locator(PLAYER).waitFor({ state: 'attached' });
      /* The stub source can't play, so the control bar doesn't take the pointer: pointer events go straight to the progress bar, measuring wiring and geometry. */
      const point = (scope: string, type: string, at: number, pointerType = 'mouse') => page.evaluate(
        ([selector, kind, ratio, pointer]) => {
          const bar = document.querySelector<HTMLElement>(selector)!, box = bar.getBoundingClientRect();
          bar.dispatchEvent(new PointerEvent(kind, { bubbles: true, pointerType: pointer, clientX: box.left + box.width * ratio, clientY: box.top + 2 }));
        }, [scope, type, at, pointerType] as const);
      const measure = (scope: string) => page.evaluate((selector) => {
        const bar = document.querySelector<HTMLElement>(selector)!, preview = bar.querySelector<HTMLElement>('[data-player-seek-preview]')!;
        const image = preview.querySelector('img'), box = bar.getBoundingClientRect(), shown = preview.getBoundingClientRect();
        const frame = preview.querySelector('.vjs-peach-seek-frame')?.getBoundingClientRect();
        return { hidden: preview.hidden, left: shown.left - box.left, right: box.right - shown.right, width: shown.width,
          time: preview.querySelector('span')!.textContent, src: image?.getAttribute('src') ?? '', offset: image?.style.top ?? '',
          scale: image && frame?.width ? image.getBoundingClientRect().width / frame.width : 0,
          transition: getComputedStyle(preview).transitionDuration };
      }, scope);
      const progress = '#stage .vjs-progress-control';
      await point(progress, 'pointermove', .5);
      await page.waitForFunction(() => document.querySelector<HTMLImageElement>('#stage [data-player-seek-preview] img')?.complete);
      const middle = await measure(progress);
      assert.equal(middle.hidden, false);
      assert.equal(middle.time, '30:00');
      assert.equal(middle.src, `/timeline?id=${ITEM.plain}&s=1&source=peach`, '30 minutes is frame 180, which falls in sprite sheet 2');
      assert.equal(middle.offset, '-800%', 'Frame 180 is sheet 2\'s cell 80, row 9');
      assert.ok(Math.abs(middle.scale - 10) < .3, `The mosaic must be zoomed to 10× the viewfinder to reveal just one cell: ${middle.scale}`);
      assert.equal(middle.transition, '0s', 'With reduced motion, the preview has no translation animation');
      for (const at of [0, .01, .99, 1]) {
        await point(progress, 'pointermove', at);
        const edge = await measure(progress);
        assert.ok(edge.left >= -0.5 && edge.right >= -0.5, `Clipped at the edge: ${JSON.stringify({ at, ...edge })}`);
      }
      for (let at = 0; at <= 1; at += .05) await point(progress, 'pointermove', at);
      assert.deepEqual([...requested.entries()].sort(), [[0, 1], [1, 1], [2, 1], [3, 1]], 'After a sprite is warmed once, it should not re-fetch on every pointer move');
      await point(progress, 'pointerleave', 1);
      assert.equal((await measure(progress)).hidden, true);

      await toMiniplayer(page);
      const mini = '#miniplayer .vjs-progress-control';
      await point(mini, 'pointermove', .02);
      const inMini = await page.evaluate(() => {
        const frame = document.querySelector('[data-miniplayer-frame]')!.getBoundingClientRect();
        const preview = document.querySelector<HTMLElement>('#miniplayer [data-player-seek-preview]')!;
        const box = preview.getBoundingClientRect();
        const clock = document.querySelector('#miniplayer [data-miniplayer-time]');
        return { hidden: preview.hidden, display: getComputedStyle(preview).display,
          inside: box.left >= frame.left - .5 && box.right <= frame.right + .5 && box.top >= frame.top - .5, width: box.width,
          clock: clock ? getComputedStyle(clock).visibility : 'hidden' };
      });
      assert.deepEqual(inMini, { hidden: false, display: 'flex', inside: true, width: inMini.width, clock: 'hidden' }, JSON.stringify(inMini));
      assert.ok(inMini.width <= 170, `The mini window's preview did not get the narrow variant: ${inMini.width}`);

      await point(mini, 'pointerdown', .75, 'touch');
      assert.equal((await measure(mini)).time, '45:00');
      await point(mini, 'pointermove', .8, 'touch');
      assert.equal((await measure(mini)).time, '48:00');
      await point(mini, 'pointerup', .8, 'touch');
      assert.equal((await measure(mini)).hidden, true, 'Touch-screen: preview not dismissed on release');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Context menu item by item: Escape closes only the menu; "Mini player" enters the mini player, where the menu becomes "Expand"', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#stage #playerStatsBtn').waitFor();
      const labels = () => page.locator('#playerMenu [data-player-menu] span').allInnerTexts();
      await page.locator('#stage .video-js').click({ button: 'right' });
      await page.locator('#stage #playerMenu:popover-open').waitFor();
      assert.deepEqual((await labels()).filter((label) => label !== 'Picture in picture'),
        ['Loop playback', 'Mini player', 'Copy video URL', 'Copy the video URL at the current time', 'Play stats']);
      await page.keyboard.press('Escape');
      await page.locator('#playerMenu:popover-open').waitFor({ state: 'detached' }).catch(() => {});
      assert.equal(await page.locator('#playerMenu:popover-open').count(), 0, 'Escape does not close the menu');
      assert.equal(await page.locator('#stage[open]').count(), 1, 'Escape closed the stage along with it');

      await page.locator('#stage .video-js').click({ button: 'right' });
      await page.locator('#playerMenu [data-player-menu]', { hasText: 'Mini player' }).click();
      await page.locator('#miniplayer:not([hidden]) .video-js').waitFor({ timeout: 10_000 });
      await pathIs(page, '/');
      /* The mini player's key layer sits over the video, and right-clicks dispatch straight to the player. */
      await page.locator('#miniplayer .video-js').dispatchEvent('contextmenu', { clientX: 1000, clientY: 600 });
      await page.locator('#playerMenu:popover-open').waitFor();
      const mini = (await labels()).filter((label) => label !== 'Picture in picture');
      assert.deepEqual(mini, ['Loop playback', 'Expand', 'Copy video URL', 'Copy the video URL at the current time'], 'The mini window\'s menu is wrong');
      await page.keyboard.press('Escape');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Expanding the mini player back to details never rebuilds the player; dropping it in the top-left quadrant snaps to the top-left corner', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator(PLAYER).waitFor({ state: 'attached' });
      await markPlayer(page, '#stage');
      await toMiniplayer(page);
      await pathIs(page, '/');
      assert.equal(await page.locator('#miniplayer .video-js[data-probe="kept"]').count(), 1, 'Entering the mini window swapped in another player');
      assert.equal(await page.locator('#miniplayer').getAttribute('data-corner'), 'br');

      const info = await page.locator('#miniplayerInfo').boundingBox();
      assert.ok(info);
      await page.mouse.move(info.x + info.width / 2, info.y + info.height / 2);
      await page.mouse.down();
      await page.mouse.move(info.x - 200, info.y - 200, { steps: 6 });
      await page.mouse.move(120, 160, { steps: 6 });
      await page.mouse.up();
      await page.waitForFunction(() => document.getElementById('miniplayer')?.dataset.corner === 'tl', null, { timeout: 5_000 });
      assert.equal(await page.locator('#miniplayer').evaluate((node) => (node as HTMLElement).style.transform), '');
      await pathIs(page, '/');
      assert.equal(await page.locator('#stage[open]').count(), 0, 'The release after dragging was treated as "Expand"');

      // Controls on the mini player only surface when the pointer is over it.
      let releaseRefresh = () => {};
      const refreshed = new Promise<void>(resolve => { releaseRefresh = resolve });
      await page.route(/\/api\/item\?id=11$/, async route => { await refreshed; await route.continue() });
      await page.locator('#miniplayerCard').hover();
      await page.locator('#miniplayerExpand').click();
      await pathIs(page, `/assets/${ITEM.plain}`);
      try {
        await page.locator(ITEM_READY).waitFor({ timeout: 3000 });
        assert.equal(await page.locator('#stage [data-skeleton="detail"]').count(), 0, 'Expanding already-loaded details must never fall back to the skeleton');
      } finally { releaseRefresh() }
      await page.locator('#stage [data-item-media="video"] > .video-js[data-probe="kept"]').waitFor({ state: 'attached' });
      assert.equal(await page.locator('.video-js').count(), 1, 'After expanding there is one extra player');
      assert.equal(await page.locator('#miniplayer').isHidden(), true, 'Mini player still visible after expanding');
      assert.equal(await page.locator('#stage #playerStatsBtn').count(), 1);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Queue switching: the old player tears down before the new one mounts, with exactly one at any moment', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}?mix=${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator(PLAYER).waitFor({ state: 'attached' });
      await markPlayer(page, '#stage');
      await page.evaluate(() => {
        const log = { live: document.querySelectorAll('div.video-js').length, most: 0, order: [] as string[] };
        const players = (nodes: NodeList) => [...nodes].filter((node): node is HTMLElement =>
          node instanceof HTMLElement && node.matches('div.video-js')).length;
        new MutationObserver((records) => {
          for (const record of records) {
            const gone = players(record.removedNodes), added = players(record.addedNodes);
            if (gone) { log.live -= gone; log.order.push('拆') }
            if (added) { log.live += added; log.order.push('挂') }
            log.most = Math.max(log.most, log.live);
          }
        }).observe(document.body, { childList: true, subtree: true });
        (window as unknown as { playerLog: typeof log }).playerLog = log;
      });
      const next = await page.locator('#stage [data-queue-item]:not([aria-current="true"])').first().getAttribute('data-queue-item');
      await page.locator(`#stage [data-queue-item="${next}"]`).click();
      await page.locator(`#stage [data-queue-item="${next}"][aria-current="true"]`).waitFor();
      await page.locator(PLAYER).waitFor({ state: 'attached' });
      const log = await page.evaluate(() => (window as unknown as { playerLog: { live: number; most: number; order: string[] } }).playerLog);
      assert.equal(log.most, 1, `Switching items had ${log.most} players mounted at once`);
      assert.deepEqual(log.order.slice(0, 2), ['拆', '挂']);
      assert.equal(await page.locator('.video-js[data-probe="kept"]').count(), 0, 'After switching entries the player still belongs to the previous one');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Escape in the tag search box only collapses the picker and leaves the stage up; another press closes the stage', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#tagPlus').click();
      await page.locator('#tagPicker:not([hidden])').waitFor();
      await page.locator('#tagPickSearch').focus();
      await page.keyboard.press('Escape');
      await page.locator('#tagPicker').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#stage[open]').count(), 1, 'Escape closed the stage along with it');
      assert.equal(await page.evaluate(() => location.pathname), `/assets/${ITEM.plain}`);
      await page.keyboard.press('Escape');
      await pathIs(page, '/');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Follow details: while /follow-qualities hangs the video still mounts, the poster is the same node before and after mount, and the stats key lives in the same media box', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, `/posts/${DETAIL.collection}`, DESKTOP, { ready: FOLLOW_READY });
    try {
      const page = opened.page;
      const frame = page.locator('#stage [data-follow-detail-media="video"]');
      await frame.locator('.video-js .vjs-control-bar').waitFor({ state: 'attached' });
      await frame.locator(':scope > #playerStatsBtn').waitFor();
      const poster = () => frame.locator('video.vjs-tech').getAttribute('poster');
      assert.match(await poster() || '', /\/stub-thumb\/5101$/, 'The poster vanished after Video.js mounted');

      await page.route('**/follow-qualities**', () => {});
      await page.locator('[data-follow-queue-item="5102"]').click();
      await pathIs(page, '/posts/5102');
      await frame.locator('.video-js .vjs-control-bar').waitFor({ state: 'attached', timeout: 10_000 });
      assert.equal(await page.locator('#stage .video-js').count(), 1);
      assert.match(await poster() || '', /\/stub-thumb\/5102$/);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Phone 390: details do not overflow horizontally, player controls collapse to the narrow set, and the mini player stays inside the viewport', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, MOBILE);
    try {
      const page = opened.page;
      await page.locator(PLAYER).waitFor({ state: 'attached' });
      await page.waitForFunction(() => document.querySelector('#stage .video-js')?.classList.contains('vjs-peach-xsmall'),
        null, { timeout: 5_000 });
      const measured = await layout(page);
      assert.equal(measured.scrollWidth, measured.viewportWidth, `Horizontal overflow: ${measured.offenders.join(', ')}`);
      await toMiniplayer(page);
      const box = await page.locator('#miniplayerCard').boundingBox();
      assert.ok(box);
      assert.ok(box.x >= 0 && box.x + box.width <= MOBILE.width, `The mini player overflows the viewport: ${JSON.stringify(box)}`);
      assert.ok(box.y >= 0 && box.y + box.height <= MOBILE.height, `The mini player overflows the viewport: ${JSON.stringify(box)}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });
});
