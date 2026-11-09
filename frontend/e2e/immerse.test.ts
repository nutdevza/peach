/* Immersive mode's streaming, stage shape, address bar and stream session, and gestures on the phone.
 *
 * The queue is pinned to one landscape and one portrait from the demo library: `/api/items`' random sample is swapped for
 * these two, ordered by the starting id. In the first case both `/stream` entries are released by the case after sampling, to
 * make sure the waiting state is sampled. The phone case sends real touches via CDP: the browser's synthetic click follows
 * too, and only here can the 700ms ignore window be verified. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, stubTimelineSheets, visit, VIEWPORTS } from './harness.ts';
import { currentVideo, muteVideos, openImmerse, pickClips, pinQueue, settledClip } from './immerse-fixture.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const MOBILE = VIEWPORTS.find((viewport) => viewport.mobile)!;
const HOLD_MS = 1500;

type Item = { id: number; width: number; height: number };
type Sample = { wide: boolean; shown: boolean; slides: string[] };

/** The current stage: shape, frame and action column, whether the author title is visible, and each cell's offset. */
const sample = (page: Page) => page.evaluate((): Sample => ({
  wide: document.querySelector('[data-immerse-stage]')!.hasAttribute('data-wide'),
  shown: ['[data-immerse-stage]', '[data-immerse-actions]', '[data-immerse-ui]'].every((selector) =>
    getComputedStyle(document.querySelector(selector)!).visibility === 'visible'),
  slides: [...document.querySelectorAll<HTMLElement>('[data-immerse-track] [data-immerse-slide]')].map((slide) => slide.style.transform),
}));

/** Sample every 60ms until `until` holds or the deadline hits. */
async function watch(page: Page, until: () => Promise<boolean>, ms: number) {
  const moments: Sample[] = [];
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !(await until())) {
    moments.push(await sample(page));
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return moments;
}

/** One cell left, the loading notice collapsed, and this cell's video has a frame to show. */
const settled = (page: Page) => page.waitForFunction(() =>
  document.querySelectorAll('[data-immerse-track] [data-immerse-slide]').length === 1
  && Boolean(document.querySelector<HTMLElement>('[data-immerse-loader]')?.hidden)
  && (document.querySelector<HTMLVideoElement>('[data-immerse-track] [data-immerse-slide] video')?.readyState ?? 0) >= 2,
undefined, { timeout: 20_000 });

describe('Immersive mode', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  it('The stream asks stream-plan first; the stage stays hidden until the first segment appears, keeps the old shape while segments preload, and swaps only at the moment the first frame lands', async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    const releases: (() => void)[] = [];
    try {
      const items: Item[] = await page.evaluate(async () =>
        (await (await fetch('/api/items?limit=60&offset=0&thumb=')).json()).items);
      const wide = items.find((item) => item.width > item.height);
      const tall = items.find((item) => item.height > item.width);
      assert.ok(wide && tall, 'The demo library needs one landscape and one portrait video');
      await page.route(/\/api\/items\?.*sort=rand/, (route) => route.fulfill({ json: { items: [wide, tall]
        .map((item) => items.find((full) => full.id === item.id)) } }));
      const planned: number[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname === '/api/stream-plan') planned.push(Number(url.searchParams.get('id')));
      });
      const holds = new Map<number, { wait: Promise<void>; release: () => void }>();
      for (const item of [wide, tall]) {
        let release = () => {};
        const wait = new Promise<void>((resolve) => { release = resolve; });
        holds.set(item.id, { wait, release });
        releases.push(release);
      }
      await page.route(new RegExp(`/stream\\?id=(${wide.id}|${tall.id})&`), async (route) => {
        await holds.get(Number(new URL(route.request().url()).searchParams.get('id')))!.wait;
        await route.continue().catch(() => {});
      });
      // Someone is next to this machine: every video inserted from now on starts muted.
      await page.addInitScript(() => {
        new MutationObserver(() => document.querySelectorAll('video').forEach((video) => { video.muted = true; }))
          .observe(document, { childList: true, subtree: true });
      });
      await page.goto(new URL(`/immerse?id=${wide.id}`, page.url()).href, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-immerse-track] [data-immerse-slide] video.vjs-tech').waitFor({ state: 'attached' });

      // While the first item is still off screen: the box, the action column and the author title all stay hidden; once it is on screen it snaps to landscape in one step.
      const loaderHidden = () => page.evaluate(() => document.querySelector<HTMLElement>('[data-immerse-loader]')!.hidden);
      const loading = await watch(page, loaderHidden, HOLD_MS);
      assert.ok(loading.length > 3, `Only ${loading.length} samples captured in the first-item load window`);
      for (const moment of loading) assert.equal(moment.shown, false, JSON.stringify(moment));
      holds.get(wide.id)!.release();
      await settled(page);
      assert.deepEqual(await sample(page), { wide: true, shown: true, slides: [''] });
      assert.deepEqual(planned, [wide.id]);

      await page.dispatchEvent('[data-immerse]', 'wheel', { deltaY: 100 });
      await page.waitForFunction(() => document.querySelectorAll('[data-immerse-track] [data-immerse-slide]').length === 2);
      const preloading = await watch(page, async () => false, HOLD_MS - 300);
      assert.ok(preloading.length > 3, `Only ${preloading.length} samples fell inside the preload window`);
      for (const moment of preloading) {
        assert.deepEqual(moment, { wide: true, shown: true, slides: ['', 'translateY(100%)'] });
      }
      holds.get(tall.id)!.release();
      await settled(page);
      assert.deepEqual(await sample(page), { wide: false, shown: true, slides: [''] });
      assert.deepEqual(planned, [wide.id, tall.id]);
      assert.deepEqual(opened.problems, [], JSON.stringify(opened.problems));
    } finally {
      releases.forEach((release) => release());
      await opened.close();
    }
  });

  it('Deep links and refresh land back on the same entry; switching entries writes the address with replace and fetches details once per entry; closing cancels reads by session', async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    try {
      const { wide, tall } = await pickClips(page);
      await pinQueue(page, [tall, wide]);
      await muteVideos(page);
      const details = new Map<number, number>();
      const plans: { id: number; session: string }[] = [];
      const cancels: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        const id = Number(url.searchParams.get('id'));
        if (url.pathname === '/api/item') details.set(id, (details.get(id) ?? 0) + 1);
        if (url.pathname === '/api/stream-plan') plans.push({ id, session: url.searchParams.get('session') ?? '' });
        if (url.pathname === '/api/stream-cancel') cancels.push(url.searchParams.get('session') ?? '');
      });
      const landed = (id: number) => page.waitForFunction((want) => location.search === `?id=${want}`, id);

      await openImmerse(page, tall.id);
      assert.equal(plans[0]?.id, tall.id);
      const depth = await page.evaluate(() => history.length);
      await page.keyboard.press('ArrowDown');
      await landed(wide.id);
      await settledClip(page);
      await page.keyboard.press('ArrowUp');
      await landed(tall.id);
      await settledClip(page);
      assert.equal(await page.evaluate(() => history.length), depth, 'If every swipe entered history the back key would be useless');
      assert.deepEqual(Object.fromEntries(details), { [tall.id]: 1, [wide.id]: 1 });
      // The cell that got swapped away is canceled under its own session.
      assert.ok(cancels.includes(plans[0]!.session), JSON.stringify({ plans, cancels }));

      // Swipe to a later entry and refresh: what you land back on is that entry, not the first one in the sample.
      await page.keyboard.press('ArrowDown');
      await landed(wide.id);
      await settledClip(page);
      const before = plans.length;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settledClip(page);
      assert.equal(plans[before]?.id, wide.id);
      assert.equal(new URL(page.url()).searchParams.get('id'), String(wide.id));

      const live = plans.at(-1)!.session;
      await page.evaluate(() => { delete document.documentElement.dataset.peachStreamCancel });
      await page.click('[data-immerse-close]');
      await page.waitForFunction(() => document.documentElement.dataset.peachStreamCancel !== undefined);
      assert.ok(cancels.includes(live), JSON.stringify({ live, cancels }));
      assert.equal(await page.locator('[data-immerse]').isHidden(), true);
      assert.equal(await page.locator(currentVideo).count(), 0);
      assert.equal(new URL(page.url()).pathname, '/');
      assert.deepEqual(opened.problems, [], JSON.stringify(opened.problems));
    } finally {
      await opened.close();
    }
  });

  it('Mobile at 390 wide: vertical swipe switches items, horizontal swipe scrubs progress (the bar thickens while dragging), and double taps in the same half seek without switching playback', async () => {
    const opened = await visit(browser, '/', MOBILE);
    const { page } = opened;
    try {
      const { wide, tall } = await pickClips(page);
      await pinQueue(page, [tall, wide]);
      await muteVideos(page);
      await openImmerse(page, tall.id);
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      async function drag(from: [number, number], to: [number, number], end = true) {
        await touch('touchStart', ...from);
        for (let step = 1; step <= 8; step += 1) {
          await touch('touchMove', from[0] + (to[0] - from[0]) * step / 8, from[1] + (to[1] - from[1]) * step / 8);
        }
        if (end) await touch('touchEnd');
      }
      const media = () => page.evaluate((selector) => {
        const video = document.querySelector<HTMLVideoElement>(selector)!;
        return { time: video.currentTime, duration: video.duration, paused: video.paused };
      }, currentVideo);

      await drag([195, 640], [195, 300]);
      await page.waitForFunction((want) => location.search === `?id=${want}`, wide.id);
      await settledClip(page);

      await page.evaluate((selector) => {
        const video = document.querySelector<HTMLVideoElement>(selector)!;
        video.pause();
        video.currentTime = 0;
      }, currentVideo);
      const start = await media();
      await drag([100, 400], [100 + MOBILE.width / 4, 404], false);
      assert.equal(await page.locator('[data-immerse-bar][data-scrubbing]').count(), 1, 'The progress bar never thickens while dragging');
      assert.ok((await media()).time < 0.5, 'Dragging must never seek');
      await touch('touchEnd');
      const scrubbed = await media();
      assert.ok(Math.abs(scrubbed.time - start.duration / 4) < 0.5, JSON.stringify({ start, scrubbed }));
      assert.equal(await page.locator('[data-immerse-bar][data-scrubbing]').count(), 0);

      const tap = async () => { await touch('touchStart', 300, 400); await touch('touchEnd') };
      await tap();
      await tap();
      await new Promise((resolve) => setTimeout(resolve, 800));
      const seeked = await media();
      assert.ok(Math.abs(seeked.time - Math.min(seeked.duration, scrubbed.time + 10)) < 0.5, JSON.stringify({ scrubbed, seeked }));
      assert.equal(seeked.paused, true, 'Neither the double click nor the synthesized click that follows should toggle playback');
      assert.deepEqual(opened.problems, [], JSON.stringify(opened.problems));
    } finally {
      await opened.close();
    }
  });

  /** That preview above the progress bar: whether it's shown, the left/right margins relative to the viewport, the reported time, and which cell was taken. */
  const seekPreview = (page: Page) => page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>('[data-immerse-bar] [data-player-seek-preview]');
    if (!preview) return null;
    const box = preview.getBoundingClientRect(), image = preview.querySelector('img');
    return { hidden: preview.hidden, left: box.left, right: innerWidth - box.right, bottom: innerHeight - box.bottom,
      time: preview.querySelector('span')!.textContent, src: image?.getAttribute('src') ?? '',
      cell: image ? [image.style.left, image.style.top] : [] };
  });

  it('Progress bar frame preview: on desktop hover, take a cell by time, both ends stay whole within the viewport, and it collapses on leave; the mosaic is fetched only once', async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    try {
      const { wide } = await pickClips(page);
      await pinQueue(page, [wide]);
      await muteVideos(page);
      // The demo clip is 2 seconds: one frame every 0.1 second for 20 frames total, a single sprite.
      const requested = await stubTimelineSheets(page, { frames: 20, interval: .1 });
      await openImmerse(page, wide.id);
      await page.evaluate((selector) => document.querySelector<HTMLVideoElement>(selector)!.pause(), currentVideo);
      const y = DESKTOP.height - 4, ratio = .65;
      await page.mouse.move(DESKTOP.width * ratio, y);
      // 没设 src 的 img 的 `complete` 也是 true，所以等预览自己显出来：它只在拼图那一格加载好之后显示。
      await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-immerse-bar] [data-player-seek-preview]')?.hidden === false);
      const middle = await seekPreview(page);
      assert.equal(middle?.hidden, false, JSON.stringify(middle));
      assert.equal(middle.src, `/timeline?id=${wide.id}&s=0&source=peach`);
      const duration = await page.evaluate((selector) => document.querySelector<HTMLVideoElement>(selector)!.duration, currentVideo);
      const frame = Math.min(19, Math.floor(duration * ratio / .1));
      assert.deepEqual(middle.cell, [`${-(frame % 10) * 100}%`, `${-Math.floor(frame / 10) * 100}%`], `Frame ${frame}`);
      assert.ok(middle.bottom > 9, `The preview must sit above the progress bar that thickens to 9px on hover: ${middle.bottom}`);
      assert.equal(await page.locator('[data-immerse-ui]').evaluate((node) => getComputedStyle(node).visibility), 'hidden',
        'When the preview shows, the author and title should step aside');
      for (const x of [1, DESKTOP.width - 1]) {
        await page.mouse.move(x, y);
        const edge = (await seekPreview(page))!;
        assert.ok(edge.left >= 11.5 && edge.right >= 11.5, `Both ends must leave 12px each: ${JSON.stringify(edge)}`);
      }
      await page.mouse.move(DESKTOP.width / 2, DESKTOP.height / 2);
      assert.equal((await seekPreview(page))?.hidden, true, 'Leaving the progress bar did not dismiss the preview');
      assert.deepEqual([...requested.entries()], [[0, 1]]);
      assert.deepEqual(opened.problems, [], JSON.stringify(opened.problems));
    } finally {
      await opened.close();
    }
  });

  it('Phone at 390 wide: swiping still seeks without preview images, no empty preview or contact sheet is fetched', async () => {
    const opened = await visit(browser, '/', MOBILE);
    const { page } = opened;
    try {
      const { tall } = await pickClips(page);
      await pinQueue(page, [{ ...tall, has_thumb: false }]);
      await muteVideos(page);
      await page.route('**/api/timeline?*', route => route.fulfill({ json: null }));
      const sheets: string[] = [];
      page.on('request', (request) => { if (new URL(request.url()).pathname === '/timeline') sheets.push(request.url()) });
      await openImmerse(page, tall.id);
      await page.evaluate((selector) => document.querySelector<HTMLVideoElement>(selector)!.pause(), currentVideo);
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await touch('touchStart', 100, 400);
      for (let step = 1; step <= 8; step += 1) await touch('touchMove', 100 + MOBILE.width / 2 * step / 8, 402);
      const dragging = (await seekPreview(page))!;
      assert.equal(dragging.hidden, true, 'Without an image no empty preview shows');
      assert.match(dragging.time, /^0:0[0-2]$/);
      await touch('touchEnd');
      const time = await page.evaluate((selector) => document.querySelector<HTMLVideoElement>(selector)!.currentTime, currentVideo);
      assert.ok(time > 0 && time <= Number(tall.duration), `Swipe still seeks: ${time}`);
      assert.equal((await seekPreview(page))?.hidden, true, 'Preview not dismissed on release');
      assert.deepEqual(sheets, []);
      assert.deepEqual(opened.problems, [], JSON.stringify(opened.problems));
    } finally {
      await opened.close();
    }
  });
});
