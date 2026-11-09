/* The follow detail island (`follow-detail`) in a real browser: entering and leaving from the list, back to details then
 * closing while keeping filters, deep links, the stage mounting Video.js in the media frame, multi-image carousel, the
 * compilation and multi-media queues, writes and undo, hide and restore, tags returning to the list, phone.
 * The lightbox receiving the whole image group is in `photo-lightbox.test.ts`.
 *
 * Stub data in `follow-fixture.ts` (the `DETAIL` shapes are only served through the single-entry fetch); not one real fetch
 * to follow sources is sent. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { DETAIL, openFollowFeed } from './follow-fixture.ts';
import { layout, launch, VIEWPORTS } from './harness.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const MOBILE = VIEWPORTS.find((viewport) => viewport.mobile)!;
const DETAIL_READY = '#stage[open] [data-follow-detail-side]';
/** The stub video has no actual feature; the player reports a VIDEOJS error on the empty response. That is not what is being measured. */
const withoutPlayer = (problems: string[]) => problems.filter((line) => !line.includes('VIDEOJS'));
const pathIs = (page: Page, path: string) => page.waitForFunction(
  (wanted) => location.pathname === wanted, path, { timeout: 10_000 });

/** Record the follows list requests and single-entry fetches sent after this page, counted separately. */
function watchFollowRequests(page: Page) {
  const seen = { list: 0, item: [] as string[] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname !== '/api/follow') return;
    if (url.searchParams.has('item')) seen.item.push(url.searchParams.get('item')!);
    else seen.list += 1;
  });
  return seen;
}

/** Before switching entries, record the stage node and watch the skeleton: an in-place entry swap keeps the same overlay node, never returns to skeleton mid-way, and focus stays in the overlay.
 *  Also watch the new player: before Peach's controls (the hint dot among them) install, Video.js's stock control bar and big play key must not show. */
const watchStage = (page: Page) => page.evaluate(() => {
  const watch = { stage: document.getElementById('stage'), skeleton: false, rawControls: false };
  const shown = (node: Element | null) => !!node && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden';
  new MutationObserver(() => {
    if (document.querySelector('#stage [data-skeleton="detail"]')) watch.skeleton = true;
    for (const player of document.querySelectorAll('#stage div.video-js:not(:has(.vjs-peach-bezel))')) {
      if (shown(player.querySelector('.vjs-control-bar')) || shown(player.querySelector('.vjs-big-play-button'))) watch.rawControls = true;
    }
  }).observe(document.body, { childList: true, subtree: true });
  Object.assign(window, { stageWatch: watch });
});
const stageKept = (page: Page) => page.evaluate(() => {
  const watch = (window as unknown as { stageWatch: { stage: Element | null; skeleton: boolean } }).stageWatch;
  return { same: document.getElementById('stage') === watch.stage, skeleton: watch.skeleton,
    focused: !!watch.stage?.contains(document.activeElement) };
});

const openDetail = (browser: Browser, id: number, viewport = DESKTOP) =>
  openFollowFeed(browser, `/posts/${id}`, viewport, { ready: DETAIL_READY });

describe('Follow details island', () => {
  let browser: Browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser.close();
  });

  for (const viewport of VIEWPORTS) {
    it(`The details tag picker goes top-level and scrolls within the available space (${viewport.name})`, async () => {
      const opened = await openDetail(browser, 1002, viewport);
      try {
        const { page } = opened;
        await page.locator('#stage [data-tag-plus]').click();
        const menu = page.locator('#stage [data-tag-picker]');
        await menu.waitFor({ state: 'visible' });
        const visible = await menu.evaluate(node => {
          const r = node.getBoundingClientRect();
          return { topLayer: node.matches(':popover-open'), top:r.top, bottom:r.bottom, right:r.right,
            height:r.height, screen:[innerWidth,innerHeight],
            inside:node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
        });
        assert.equal(visible.topLayer, true);
        assert.ok(visible.inside && visible.height > 50 && visible.top >= 0 && visible.bottom <= visible.screen[1]);
        assert.ok(visible.right <= visible.screen[0]);
        const appearance = await menu.evaluate(node => {
          const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--surface)'; node.append(probe);
          const expected = getComputedStyle(probe).backgroundColor; probe.remove();
          return { background:getComputedStyle(node).backgroundColor, expected, blur:getComputedStyle(node).backdropFilter,
            icons:[...node.querySelectorAll('svg')].map(svg => ({ fill:getComputedStyle(svg).fill, stroke:getComputedStyle(svg).stroke })) };
        });
        assert.equal(appearance.background, appearance.expected);
        assert.equal(appearance.blur, 'none');
        assert.ok(appearance.icons.every(icon => icon.fill === 'none' && icon.stroke !== 'none'));
        const scrollbar = await menu.locator('[data-tag-body]').evaluate(node => ({
          hidden:getComputedStyle(node).scrollbarWidth,
          track:!!node.parentElement?.querySelector('.ovtrack.ov-y'),
          positioned:getComputedStyle(node.parentElement!).position,
        }));
        assert.equal(scrollbar.hidden, 'none');
        assert.equal(scrollbar.track, true);
        assert.equal(scrollbar.positioned, 'relative');
      } finally { await opened.close(); }
    });

    it(`Online cinema mode keeps the visible player and the same media node (${viewport.name})`, async () => {
      const opened = await openDetail(browser, 1002, viewport);
      try {
        const { page } = opened;
        const player = page.locator('#stage .video-js');
        await player.locator('.vjs-peach-bezel').waitFor({ state: 'attached' });
        const node = await player.elementHandle();
        const normal = await player.boundingBox();
        assert.ok(normal && normal.height > 100);
        await page.locator('#stage [data-player-theater]').dispatchEvent('click');
        await page.locator('#stage[data-theater]').waitFor();
        const scroll = page.locator('#stage > [data-stage-scroll]');
        await page.waitForFunction(() => document.querySelector('#stage > [data-stage-scroll]')?.hasAttribute('data-overlay-scrollbar'));
        assert.equal(await scroll.evaluate(node => getComputedStyle(node).scrollbarWidth), 'none');
        assert.equal(await page.locator('#stage > .ovtrack.ov-y').count(), 1);
        await page.waitForFunction(() => {
          const region=document.querySelector<HTMLElement>('#stage > [data-stage-scroll]')!;
          return region.scrollHeight<=region.clientHeight+1 || !document.querySelector<HTMLElement>('#stage > .ovtrack.ov-y')?.hidden;
        });
        const cinema = await player.boundingBox();
        assert.ok(cinema && cinema.height > 100, `The cinema view is not visible: ${JSON.stringify(cinema)}`);
        assert.equal(await node!.evaluate(element => element === document.querySelector('#stage .video-js')), true);
        await page.locator('#stage [data-player-theater]').dispatchEvent('click');
        const restored = await player.boundingBox();
        assert.ok(restored && Math.abs(restored.height - normal.height) < 2);
      } finally { await opened.close(); }
    });
  }

  it('Clicking a card in the list opens details: the address becomes this item and no single fetch runs; closing back to the list does not refetch', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      const seen = watchFollowRequests(page);
      await page.locator('[data-follow-item="1002"] [data-follow-open]').click();
      await pathIs(page, '/posts/1002');
      await page.locator(DETAIL_READY).waitFor();
      assert.equal((await page.locator('#stage [data-follow-detail-name]').innerText()).trim(), 'Demo update 1002');
      assert.deepEqual(seen.item, [], 'This entry, already in the list cache, did another single fetch');
      await page.locator('[data-follow-related] [data-follow-item]').first().waitFor();
      const listedBeforeClose = seen.list;
      await page.locator('#closeStage').click();
      await pathIs(page, '/follow');
      await page.locator('[data-follow-list] > [data-follow-item]').first().waitFor();
      assert.equal(seen.list, listedBeforeClose, 'Closing details returns to the list and refetches');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Filter a tier then enter details: going back to details and closing returns to the same filtered tier', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow?status=new', DESKTOP);
    try {
      const page = opened.page;
      const filtered = () => page.waitForFunction(
        () => location.pathname === '/follow' && location.search === '?status=new', undefined, { timeout: 10_000 });
      await page.locator('[data-follow-item="1002"] [data-follow-open]').click();
      await pathIs(page, '/posts/1002');
      await page.locator(DETAIL_READY).waitFor();
      await page.locator('#closeStage').click();
      await filtered();
      await page.goBack();
      await pathIs(page, '/posts/1002');
      await page.locator(DETAIL_READY).waitFor();
      await page.locator('#closeStage').click();
      await filtered();
      await page.locator('[data-follow-list] > [data-follow-item]').first().waitFor();
      assert.equal(await page.locator('#stage[open]').count(), 0);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Deep links into details fetch only that entry and mount no list island; focus lands on the close button once content arrives; on refresh only the skeleton inside the popover shows', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.collection);
    try {
      const page = opened.page;
      assert.equal(await page.locator('[data-follow-feed]').count(), 0, 'A deep link into details mounted the list island');
      assert.equal((await page.locator('#stage [data-follow-detail-name]').innerText()).trim(), 'Compilation main entry 5101');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'closeStage');
      assert.deepEqual(withoutPlayer(opened.problems), []);

      // Refreshing this page: the wait shows only the skeleton inside the floating window; the page never lays one outside the window first.
      await page.addInitScript(() => {
        const seen = { outside: false };
        Object.assign(window, { detailSkeletonSeen: seen });
        new MutationObserver(() => {
          for (const one of document.querySelectorAll('[data-skeleton="detail"]')) if (!one.closest('#stage')) seen.outside = true;
        }).observe(document, { childList: true, subtree: true });
      });
      let releaseItem = () => {};
      const itemWait = new Promise<void>((resolve) => { releaseItem = resolve; });
      await page.route((url) => url.pathname === '/api/follow' && url.searchParams.has('item'), async (route) => {
        await itemWait;
        await route.fallback();
      });
      try {
        await page.reload({ waitUntil: 'load' });
        const media = page.locator('#stage [data-skeleton="detail"] [data-stage-media]');
        await media.waitFor();
        const box = await media.boundingBox();
        assert.ok(box && box.height > 120, `The details waiting view is too short: ${JSON.stringify(box)}`);
        assert.equal(await page.locator('#stage [data-skeleton="detail"] [data-stage-side-content]')
          .evaluate((node) => getComputedStyle(node).rowGap), '12px');
        assert.equal(await page.locator('#stage [data-skeleton="detail"] [data-stage-side-content]')
          .evaluate((node) => getComputedStyle(node).scrollbarWidth), 'none');
      } finally {
        releaseItem();
      }
      await page.locator(DETAIL_READY).waitFor({ timeout: 15_000 });
      assert.equal(await page.evaluate(() => (window as unknown as { detailSkeletonSeen: { outside: boolean } })
        .detailSkeletonSeen.outside), false, 'On refresh a details skeleton paints outside the popover first');
    } finally {
      await opened.close();
    }
  });

  it('Video: the stage mounts Video.js inside the media box, with the ambient-light canvas and stats badge inserted into the same box; switching items and going back swap in place with one player left', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.collection);
    try {
      const page = opened.page;
      const frame = page.locator('#stage [data-follow-detail-media="video"]');
      // The control bar hides after the user is idle for a while (Video.js userActive), so only wait for it to mount, not to become visible.
      await frame.locator('.video-js .vjs-control-bar').waitFor({ state: 'attached' });
      assert.equal(await frame.locator('[data-ambient-canvas]').count(), 1);
      assert.equal(await frame.locator('.video-js video.vjs-tech').count(), 1, 'More than one active video lives in the media box');
      await watchStage(page);
      const seen = watchFollowRequests(page);
      await page.locator('[data-follow-queue-item="5102"]').click();
      await pathIs(page, '/posts/5102');
      await page.locator('#stage [data-follow-queue-item="5102"][aria-current="true"]').waitFor();
      await page.locator('#stage .video-js .vjs-control-bar').waitFor({ state: 'attached' });
      assert.equal(await page.locator('#stage .video-js').count(), 1, 'After switching items the old player never tore down');
      assert.equal(await page.locator('#stage [data-ambient-canvas]').count(), 1);
      assert.deepEqual(await stageKept(page), { same: true, skeleton: false, focused: true }, 'Switching rows reopened the floating window');
      await page.goBack();
      await pathIs(page, '/posts/5101');
      await page.locator('#stage [data-follow-queue-item="5101"][aria-current="true"]').waitFor();
      await page.locator('#stage .video-js .vjs-control-bar').waitFor({ state: 'attached' });
      assert.equal(await page.locator('#stage .video-js').count(), 1, 'Going back never tore down the old player');
      assert.deepEqual(await stageKept(page), { same: true, skeleton: false, focused: true }, 'Going back to the previous item reopened the popover');
      assert.deepEqual(seen.item, [], 'Another group member and the fetched one each did a single fetch again, so clicking waits one round trip before swapping');
      assert.equal(await page.evaluate(() => (window as unknown as { stageWatch: { rawControls: boolean } }).stageWatch.rawControls),
        false, 'The stock Video.js control bar or big play button showed before Peach controls mounted');
      await page.locator('#closeStage').click();
      await pathIs(page, '/follow');
      await page.locator('[data-follow-list] > [data-follow-item]').first().waitFor({ timeout: 15_000 });
      assert.equal(await page.locator('.video-js').count(), 0, 'The player stayed mounted after closing details');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Multi-image carousel: dots announce the current image, and arrows and dots swap images without touching the address', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.gallery);
    try {
      const page = opened.page;
      const current = () => page.locator('#stage [data-follow-image-dots] button').evaluateAll((dots) =>
        dots.map((dot) => dot.getAttribute('aria-current')));
      const poster = page.locator('#stage [data-follow-detail-poster]');
      assert.deepEqual(await current(), ['true', 'false', 'false']);
      assert.equal(await poster.getAttribute('src'), '/follow-stream?id=5001&media=0');
      await page.locator('#stage [data-follow-image-arrow="next"]').click();
      await page.waitForFunction(() => document.querySelector('#stage [data-follow-detail-poster]')
        ?.getAttribute('src') === '/follow-stream?id=5001&media=1');
      assert.deepEqual(await current(), ['false', 'true', 'false']);
      await page.locator('#stage [data-follow-image-arrow="prev"]').click();
      await page.locator('#stage [data-follow-image-dots] button').nth(2).click();
      await page.waitForFunction(() => document.querySelector('#stage [data-follow-detail-poster]')
        ?.getAttribute('src') === '/follow-stream?id=5001&media=2');
      assert.deepEqual(await current(), ['false', 'false', 'true']);
      assert.equal(new URL(page.url()).pathname, '/posts/5001');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Compilation queue: lists only playable videos, newest first, with the current one pressed; the other-site entry\'s origin is the site icon', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.collection);
    try {
      const page = opened.page;
      const queue = page.locator('#stage [data-follow-queue][data-queue-kind="collection"]');
      const rows = await queue.locator('[data-follow-queue-item]').evaluateAll((buttons) => buttons.map((button) => ({
        id: Number((button as HTMLElement).dataset.followQueueItem), current: button.getAttribute('aria-current'),
        icon: button.querySelector('[data-follow-queue-meta] img')?.getAttribute('alt') ?? null,
      })));
      assert.deepEqual(rows, [
        { id: 5101, current: 'true', icon: null },
        { id: 5102, current: 'false', icon: null },
        { id: 5103, current: 'false', icon: 'Rule34.xxx' },
      ]);
      assert.match(await queue.locator('[data-mix-queue-head]').innerText(), /视频合集[\s\S]*3 个视频/);
      assert.equal(await queue.locator('[data-queue-close]').isVisible(), false, 'Side-by-side queue heads should have no close key');
      /* On desktop, media sits left and details right, with the bottom queue laid out horizontally. */
      const grid = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const media = box('#stage [data-stage-media]'), side = box('#stage [data-follow-detail-side]');
        const queue = box('#stage [data-follow-queue]');
        return { sideRight: side.left >= media.right - 1, queueBelow: queue.top >= Math.max(media.bottom, side.bottom) - 1,
          flow: getComputedStyle(document.querySelector('#stage [data-follow-queue] [data-mix-list]')!).gridAutoFlow };
      });
      assert.deepEqual(grid, { sideRight: true, queueBelow: true, flow: 'column' });
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Multimedia queue: images and videos in a post each get a row; clicking an image swaps to it without changing the URL', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.media);
    try {
      const page = opened.page;
      const queue = page.locator('#stage [data-follow-queue][data-queue-kind="media"]');
      const kinds = await queue.locator('[data-follow-media-item]').evaluateAll((buttons) =>
        buttons.map((button) => [(button as HTMLElement).dataset.mediaKind, button.getAttribute('aria-current')]));
      assert.deepEqual(kinds, [['video', 'true'], ['image', 'false'], ['video', 'false']]);
      await queue.locator('[data-follow-media-item="1"]').click();
      await page.locator('#stage [data-follow-detail-media="image"] [data-follow-detail-poster]').waitFor();
      assert.equal(await queue.locator('[data-follow-media-item="1"]').getAttribute('aria-current'), 'true');
      assert.equal(await page.locator('#stage .video-js').count(), 0, 'Switching to images never tore down the player');
      assert.equal(new URL(page.url()).pathname, '/posts/5201');
      // When the current item is an image, the action bar gains a "Hide this image" button.
      assert.equal(await page.locator('#stage [data-follow-media-hide="1"]').count(), 1);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Saving and state: writes go to the stub and key states follow; the watched receipt can be undone, which restores the key state', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.gallery);
    try {
      const page = opened.page;
      const seen = page.locator('#stage [data-follow-detail-status="seen"]');
      assert.equal(await seen.getAttribute('aria-pressed'), 'false');
      await seen.click();
      await page.locator('#stage [data-follow-detail-status="seen"][aria-pressed="true"]').waitFor();
      assert.equal(await page.locator('#stage [data-follow-detail-status="new"]').count(), 1, 'After watching there is no "restore unwatched"');
      // The receipt stack sits under body, the stage is a modal dialog, and the rest of the page is inert, so the mouse cannot reach the undo key; this measures undo itself.
      await page.locator('#toasts').getByRole('button', { name: 'Undo' }).dispatchEvent('click');
      await page.locator('#stage [data-follow-detail-status="seen"][aria-pressed="false"]').waitFor();
      await page.locator('#stage [data-follow-detail-save]').click();
      await page.locator('#stage [data-follow-detail-save][aria-label="Saved"]').waitFor();
      assert.deepEqual(opened.stub.writes, [
        { url: '/api/follow/status', body: { item: 5001, to: 'seen' } },
        { url: '/api/follow/status', body: { item: 5001, to: 'new' } },
        { url: '/api/follow/save', body: { item: 5001 } },
      ]);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of VIEWPORTS) it(`${viewport.name}: the dots for twenty-one images scroll and follow the current image, and the address keeps the current post`, { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.largeGallery, viewport);
    try {
      const page = opened.page;
      const poster = page.locator('#stage [data-follow-detail-poster]');
      const dots = page.locator('#stage [data-follow-image-dots]');
      const thumbnails = page.locator('#stage [data-media-thumbnails]');
      assert.equal(await thumbnails.locator('button').count(), 21);
      await thumbnails.locator('img').first().waitFor({ state: 'visible' });
      const thumbnailBox = await thumbnails.boundingBox(), posterBox = await poster.boundingBox();
      assert.ok(thumbnailBox && posterBox && thumbnailBox.y >= posterBox.y + posterBox.height, 'Thumbnail below the main image');
      assert.equal(await dots.locator('button').count(), 21);
      assert.ok(await dots.evaluate(node => node.scrollWidth > node.clientWidth), 'When dots overflow the strip scrolls them');
      assert.ok(await dots.evaluate(node => {
        const frame = node.closest('[data-media-indicator]');
        if (!frame) return false;
        const style = getComputedStyle(frame);
        return style.borderTopWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0.5)'
          && style.borderRadius === getComputedStyle(document.documentElement).getPropertyValue('--pill-radius').trim();
      }), 'The indicator uses the follow details\' translucent pill backing');
      assert.equal(await dots.getAttribute('data-overflow-left'), 'false');
      assert.equal(await dots.getAttribute('data-overflow-right'), 'true');
      assert.ok(await dots.evaluate(node => getComputedStyle(node).maskImage.includes('linear-gradient')), 'Overflow edge reuses the horizontal fade');
      await dots.hover();
      await page.mouse.wheel(0, 100);
      await page.waitForFunction(() => {
        const strip = document.querySelector('[data-follow-image-dots]');
        return (strip?.scrollLeft || 0) > 1 && strip?.getAttribute('data-overflow-left') === 'true';
      });
      assert.equal(await dots.getAttribute('data-overflow-left'), 'true');
      for (const [key, index] of [['ArrowRight', 1], ['ArrowLeft', 0], ['ArrowLeft', 20]] as const) {
        await page.keyboard.press(key);
        await page.waitForFunction((wanted) => document.querySelector('#stage [data-follow-detail-poster]')
          ?.getAttribute('src') === wanted, `/follow-stream?id=5002&media=${index}`);
        assert.equal(await poster.getAttribute('src'), `/follow-stream?id=5002&media=${index}`);
        const selected = dots.locator('[aria-current="true"]');
        assert.equal(await selected.getAttribute('data-follow-image-item'), String(index));
        assert.ok(await selected.evaluate(node => {
          const item = node.getBoundingClientRect(), strip = node.parentElement!.getBoundingClientRect();
          return item.left >= strip.left && item.right <= strip.right;
        }), 'Current dot fully visible');
        assert.ok(await thumbnails.locator('[aria-current="true"]').evaluate(node => {
          const item = node.getBoundingClientRect(), strip = node.parentElement!.getBoundingClientRect();
          return item.left >= strip.left && item.right <= strip.right;
        }), 'Current thumbnail fully visible');
        if (index === 20) assert.equal(await dots.getAttribute('data-overflow-right'), 'false');
      }
      await page.keyboard.press('ArrowRight');
      await dots.locator('[data-follow-image-item="0"][aria-current="true"]').waitFor();
      assert.ok(await dots.evaluate(node => node.scrollLeft < 1), 'When looping back to the first slide the dot returns to the start');
      const geometry = await layout(page);
      assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1);
      assert.equal(new URL(page.url()).pathname, '/posts/5002');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Hiding this image retires it to the restore strip, and clicking it back there returns it to the carousel', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.hidden);
    try {
      const page = opened.page;
      const restores = () => page.locator('#stage [data-follow-media-restore]').evaluateAll((buttons) =>
        buttons.map((button) => Number((button as HTMLElement).dataset.followMediaRestore)));
      const dots = () => page.locator('#stage [data-follow-image-dots] button').count();
      assert.deepEqual(await restores(), [3, 4]);
      assert.equal(await dots(), 3);
      await page.locator('#stage [data-follow-media-hide="0"]').click();
      await page.waitForFunction(() => document.querySelectorAll('#stage [data-follow-media-restore]').length === 3);
      assert.deepEqual(await restores(), [0, 3, 4]);
      assert.equal(await dots(), 2);
      assert.match(await page.locator('#stage [data-follow-hidden-label]').innerText(), /已隐藏 3 张/);
      await page.locator('#stage [data-follow-media-restore="0"]').click();
      await page.waitForFunction(() => document.querySelectorAll('#stage [data-follow-media-restore]').length === 2);
      assert.equal(await page.locator('#stage [data-follow-detail-poster]').getAttribute('src'),
        '/follow-stream?id=5301&media=0', 'The restored card never returns to the stage');
      assert.deepEqual(opened.stub.writes, [
        { url: '/api/follow/media/hide', body: { item: 5301, media: 0, hidden: true } },
        { url: '/api/follow/media/hide', body: { item: 5301, media: 0, hidden: false } },
      ]);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Clicking a tag in details returns to the list carrying that tag', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.gallery);
    try {
      const page = opened.page;
      const tag = page.locator('#stage [data-follow-tag]').first();
      const name = (await tag.getAttribute('data-follow-tag'))!;
      await tag.click();
      await page.waitForFunction((wanted) => location.pathname === '/follow'
        && new URLSearchParams(location.search).get('tag') === wanted, name, { timeout: 10_000 });
      await page.locator('[data-follow-list] > [data-follow-item]').first().waitFor({ timeout: 15_000 });
      assert.equal(await page.locator('#stage[open]').count(), 0);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Phone 390: details do not overflow, the action bar sizes to its content, and the compilation queue sits below the sidebar', { timeout: 60_000 }, async () => {
    const opened = await openDetail(browser, DETAIL.collection, MOBILE);
    try {
      const page = opened.page;
      assert.deepEqual((await layout(page)).offenders, [], 'An element in details overflows the viewport right edge');
      const boxes = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const actions = box('#stage [data-follow-detail-actions]');
        const buttons = [...document.querySelectorAll('#stage [data-follow-detail-actions] > *')]
          .map((node) => node.getBoundingClientRect());
        return { actions: actions.width, used: buttons.at(-1)!.right - buttons[0]!.left,
          side: box('#stage [data-follow-detail-side]').bottom, queue: box('#stage [data-follow-queue]').top };
      });
      assert.ok(Math.abs(boxes.actions - boxes.used) <= 1, `The action bar grew too wide: ${JSON.stringify(boxes)}`);
      assert.ok(boxes.queue >= boxes.side - 1, `The compilation queue is not below the sidebar: ${JSON.stringify(boxes)}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`Follow details without a preview keep the full frame (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openDetail(browser, DETAIL.bare, viewport);
      try {
        const { page } = opened;
        const placeholder = page.locator('#stage [data-follow-detail-placeholder]');
        await placeholder.waitFor();
        const box = await placeholder.evaluate(node => {
          const frame = node.closest('[data-stage-media]')!.getBoundingClientRect();
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height, frameWidth: frame.width, frameHeight: frame.height };
        });
        assert.ok(Math.abs(box.width - box.frameWidth) < 1, `The empty state fills the media width: ${JSON.stringify(box)}`);
        if (viewport.mobile) assert.ok(Math.abs(box.width / box.height - 16 / 9) < .02, `The empty state reserves height at frame ratio: ${JSON.stringify(box)}`);
        else assert.ok(box.height >= 180, `The desktop empty state shows the icon and description fully: ${JSON.stringify(box)}`);
        assert.ok(box.frameHeight >= box.height - 1, 'Media frame fits the full empty state');
        assert.equal(await page.locator('#closeStage').isVisible(), true);
        assert.deepEqual((await layout(page)).offenders, []);
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally { await opened.close(); }
    });

    it(`Long summaries clamp to eight lines and are not squashed by the sidebar, and long title strings and media errors do not widen the sidebar (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openDetail(browser, DETAIL.long, viewport);
      try {
        const page = opened.page;
        const measure = () => page.evaluate(() => {
          const side = document.querySelector('#stage [data-stage-side-content]')!;
          const summary = document.querySelector<HTMLElement>('#stage [data-follow-detail-summary]')!;
          const lineHeight = parseFloat(getComputedStyle(summary).lineHeight);
          const right = side.getBoundingClientRect().right;
          const inside = ['[data-follow-detail-name]', '[data-follow-detail-summary]', '[data-follow-media-issue]']
            .map((selector) => document.querySelector(`#stage ${selector}`)!.getBoundingClientRect().right)
            .every((edge) => edge <= right + 1);
          return { lines: summary.clientHeight / lineHeight, inside, scroll: side.scrollWidth, width: side.clientWidth };
        });
        const folded = await measure();
        assert.ok(folded.lines >= 7.5 && folded.lines <= 8.5, `The collapsed summary is not eight lines: ${JSON.stringify(folded)}`);
        assert.ok(folded.inside && folded.scroll <= folded.width, `The sidebar grew wider: ${JSON.stringify(folded)}`);
        const toggle = page.locator('#stage [data-follow-summary-toggle]');
        assert.equal((await toggle.innerText()).trim(), 'Expand');
        await toggle.click();
        const open = await measure();
        assert.ok(open.lines > 20, `The expanded summary does not show everything: ${JSON.stringify(open)}`);
        assert.ok(open.inside && open.scroll <= open.width, `The sidebar grew wider after expanding: ${JSON.stringify(open)}`);
        assert.deepEqual((await layout(page)).offenders, [], 'An element in details overflows the viewport right edge');
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally {
        await opened.close();
      }
    });
  }
});
