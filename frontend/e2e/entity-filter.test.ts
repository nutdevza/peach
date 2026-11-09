/* The whole block under the entity profile page's profile card: intersection bar and two-row glass overlay (`entity-filter`
 * island, ADR-0031).
 *
 * The demo library has no person entities: profile, videos and photos are provided here in the endpoints' shapes, while the
 * page's own routing, rendering and actions run as usual. What is verified is behavior: no jump when the skeleton swaps for
 * the real overlay, pressed feedback not waiting on requests, what collapses when switching views, stickiness and
 * narrow-screen horizontal scroll. Looks have screenshots elsewhere; pixels are not compared here. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, settle, visit, VIEWPORTS, type Visit } from './harness.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const PHONE = VIEWPORTS.find((viewport) => viewport.mobile)!;
const NAME = '篠田ゆう';
const PATH = `/performers/${encodeURIComponent(NAME)}`;
const THUMB = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#456"/></svg>';
const TAGS = ['Big breasts', 'Pretty breasts', 'Creampie', 'Single videos', 'High quality', 'Nympho', 'Oral', 'Big sister', 'Slender', 'Uniform', 'Squirting', 'Pretty legs'];

const ENTITY = {
  id: 90_101, kind: 'performer', canonical_name: NAME, aliases: [], display_aliases: [], user_aliases: [],
  asset_count: 24, tags: TAGS.map((k, at) => ({ k, n: 40 - at * 2 })), related_performers: [], links: [],
  metadata: {}, has_image: false, has_avatar: false, avatar_focus: null, representative_asset_id: null,
  entry_links: [], feed: null,
};
const costar = (id: number, k: string) => ({ id, k, n: 3, rep: null, has_image: false, has_avatar: false, avatar_focus: null });
const AGENCY = {
  ...ENTITY, id: 90_701, kind: 'agency', canonical_name: 'New Actor eXperience', member_count: 3, feed: undefined,
  tags: ENTITY.tags.slice(0, 6),
  related_performers: [costar(90_710, NAME), costar(90_711, '河北彩伽'), costar(90_712, '三上悠亜')],
};
type Entity = typeof ENTITY | typeof AGENCY;
const items = (jav: boolean) => Array.from({ length: 24 }, (_, at) => ({
  id: 91_000 + at, name: jav ? `SSIS-${100 + at} Demo video ${at + 1}` : `Demo video ${at + 1}`, code: jav ? `SSIS-${100 + at}` : '',
  is_jav: jav, has_thumb: true, duration: 7200, studio: 'S1 NO.1 STYLE', tags: [],
}));
const PHOTOS = { total: 18, sample_total: 0, sets: [], has_more: false, seed: '',
  items: Array.from({ length: 18 }, (_, at) => ({ id: 92_000 + at, name: `${String(at + 1).padStart(3, '0')}.jpg` })) };
const NO_PHOTOS = { total: 0, sample_total: 0, sets: [], items: [], has_more: false, seed: '' };

/** Profiles, videos, photos and images are all served here; agency rosters are not a JAV context, so only performers have photos.
 *  `/api/items` can be held: the request made after `hold()` waits for `release()` before responding. */
async function serve(page: Page, entity: Entity = ENTITY) {
  let gate: Promise<void> | null = null;
  let open = () => {};
  const itemQueries: string[] = [];
  const list = items(entity.kind !== 'agency');
  await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: entity }));
  await page.route((url) => url.pathname === '/api/items', async (route) => {
    const url = new URL(route.request().url());
    itemQueries.push(url.search);
    if (gate) await gate;
    const offset = Number(url.searchParams.get('offset') || 0);
    await route.fulfill({ json: { items: offset ? [] : list, total: list.length, has_more: false } });
  });
  await page.route((url) => url.pathname === '/api/photos', (route) =>
    route.fulfill({ json: entity.kind === 'performer' ? PHOTOS : NO_PHOTOS }));
  await page.route((url) => url.pathname === '/api/feeds/discoveries', (route) =>
    route.fulfill({ json: { ok: true, more: false, items: [] } }));
  await page.route(/\/(?:thumb|poster|photo-thumb|cover)\?/, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: THUMB }));
  return {
    itemQueries,
    hold() { gate = new Promise<void>((resolve) => { open = resolve; }); },
    release() { open(); gate = null; },
  };
}

async function openPerformer(browser: Browser, viewport = DESKTOP, search = '', entity: Entity = ENTITY) {
  const opened = await visit(browser, '/', viewport);
  const stubs = await serve(opened.page, entity);
  const path = entity.kind === 'agency' ? `/agencies/${encodeURIComponent(entity.canonical_name)}` : PATH;
  await opened.page.goto(new URL(path + search, opened.page.url()).href, { waitUntil: 'load' });
  await opened.page.locator('[data-entity-filter-glass] [data-entity-readout]', { hasText: /\S/ })
    .waitFor({ timeout: 15_000 });
  await settle(opened.page);
  assert.equal(await opened.page.locator('[data-entity-filter-glass]').getByRole('button', { name: 'My favorites', exact: true }).count(), 1);
  return { ...opened, stubs };
}

/** The sliding glass and the key it should sit under: both of their bounding boxes, null when the glass is retracted. */
const glideOver = (page: Page, glide: string, key: string) => page.evaluate(([glideSelector, keySelector]) => {
  const rect = (node: Element | null) => {
    if (!node || (node as HTMLElement).hidden) return null;
    const box = node.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  };
  return { glide: rect(document.querySelector(glideSelector)), key: rect(document.querySelector(keySelector)) };
}, [glide, key] as const);

function assertCovers(pair: Awaited<ReturnType<typeof glideOver>>, what: string) {
  assert.ok(pair.glide && pair.key, `${what}: glass or key is not on screen ${JSON.stringify(pair)}`);
  for (const side of ['left', 'top', 'width', 'height'] as const) {
    assert.ok(Math.abs(pair.glide![side] - pair.key![side]) <= 1,
      `${what}: the glass's ${side} is ${pair.glide![side]}, the key is ${pair.key![side]}`);
  }
}

const unexpected = (opened: Visit) => opened.problems;

/** One cell in a segmented toggle: the whole cell's label is what you click, the radio input itself is hidden. */
const segment = (page: Page, group: string, value: string) =>
  page.locator(`[data-entity-layout][aria-label="${group}"] label:has(input[value="${value}"])`);

describe('Entity page filter overlay', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  for (const viewport of [DESKTOP, PHONE]) {
    it(`${viewport.mobile ? 'Phone' : 'Desktop'} alias URLs normalize while keeping params and fragments, and back returns to the entry`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/', viewport);
      try {
        const { page } = opened;
        await serve(page);
        const suffix = '?sort=release&dir=asc&tag=a%2Fb&offset=48#works';
        await page.goto(new URL('/performers/OldName' + suffix, page.url()).href, { waitUntil: 'load' });
        await page.waitForURL(url => url.pathname === '/performers/90101' && url.search + url.hash === suffix);
        await page.locator('[data-entity-filter-glass] [data-entity-readout]').waitFor();
        await page.goBack({ waitUntil: 'load' });
        assert.equal(new URL(page.url()).pathname, '/');
      } finally { await opened.close(); }
    });
  }

  it('Swapping the skeleton overlay for the real one does not jump: size, distance from the profile card, and the video grid top edge all stay in place', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    try {
      const { page } = opened;
      await serve(page);
      let release = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route(/\/api\/entity\?/, async (route) => { await held; await route.fallback(); });
      await page.goto(new URL(PATH, page.url()).href, { waitUntil: 'load' });
      await page.locator('#index [data-skeleton="entity/performer"] .board-filter-frame').waitFor({ timeout: 15_000 });
      const material = await page.locator('#index [data-skeleton] .board-filter-frame').evaluate(node => {
        const style = getComputedStyle(node);
        return { image: style.backgroundImage, backdrop: style.backdropFilter, background: style.backgroundColor };
      });
      assert.notEqual(material.backdrop, 'none');
      assert.notEqual(material.background, 'rgb(0, 0, 0)');
      /* The profile card is another island, and the height gap between skeleton and real card is not this block's business: the overlay's position is measured by its distance from the profile card's bottom edge. */
      const measure = (hero: string, glass: string, grid: string) => page.evaluate(([heroSelector, glassSelector, gridSelector]) => {
        const heroBox = document.querySelector(heroSelector)!.getBoundingClientRect();
        const glassBox = document.querySelector(glassSelector)!.getBoundingClientRect();
        const gridBox = document.querySelector(gridSelector)!.getBoundingClientRect();
        return { gap: glassBox.top - heroBox.bottom, left: glassBox.left, width: glassBox.width,
          height: glassBox.height, grid: gridBox.top - glassBox.bottom };
      }, [hero, glass, grid] as const);
      const skeleton = await measure('#index [data-skeleton] .entityhero', '#index [data-skeleton] .board-filter-frame',
        '#index [data-skeleton] .entitysection');
      release();
      await page.locator('[data-entity-filter-glass] [data-entity-readout]', { hasText: 'Videos' }).waitFor({ timeout: 15_000 });
      await settle(page);
      const live = await measure('#index [data-entity-card]', '#index [data-entity-filter-glass]', '#index [data-entity-body]');
      for (const key of ['gap', 'left', 'width', 'height', 'grid'] as const) {
        assert.ok(Math.abs(skeleton[key] - live[key]) <= 1,
          `The overlay's ${key} jumps at takeover: skeleton ${skeleton[key]}, after takeover ${live[key]}`);
      }
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('On entering the page, the two sliding glass panels already sit under the current view and watch state; switching watch state slides the glass over immediately, and the readout waits for that pass', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser);
    try {
      const { page, stubs } = opened;
      assertCovers(await glideOver(page, '[data-view-glide="round"]', '[data-media-view][aria-pressed="true"]'), 'View key');
      assertCovers(await glideOver(page, '[data-view-glide=""]', '[data-entity-state][aria-pressed="true"]'), 'Watch states');
      stubs.hold();
      await page.locator('[data-entity-state="fresh"]').click();
      const pressed = await page.evaluate(() => ({
        state: document.querySelector('[data-entity-state="fresh"]')?.getAttribute('aria-pressed'),
        busy: document.querySelector('[data-entity-filter-glass] [data-filter-row="bottom"]')?.getAttribute('aria-busy'),
        shimmer: !!document.querySelector('[data-entity-readout] [data-async-text][aria-busy="true"] > [data-async-text-skeleton]'),
        retained: document.querySelector('[data-entity-readout] [data-async-text-value]')?.getAttribute('aria-hidden'),
      }));
      assert.deepEqual(pressed, { state: 'true', busy: 'true', shimmer: true, retained: 'true' }, 'The pressed state and the waiting-for-reading state land immediately');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-entity-readout] [data-async-text-skeleton]')!).opacity === '1');
      assertCovers(await glideOver(page, '[data-view-glide=""]', '[data-entity-state="fresh"]'), 'Watch state after switching');
      stubs.release();
      await page.locator('[data-entity-readout]', { hasText: 'Videos · 24' }).waitFor({ timeout: 15_000 });
      await page.waitForFunction(() => !document.querySelector('[data-entity-readout] [data-async-text][aria-busy="true"]')
        && getComputedStyle(document.querySelector('[data-entity-readout] [data-async-text-skeleton]')!).opacity === '0');
      assert.match(page.url(), /[?&]state=fresh/);
      assert.match(stubs.itemQueries.at(-1)!, /state=fresh/);
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('Switching the sort presses it immediately and draws the direction arrow; clicking again flips the direction, and switching the JAV layout sends no request', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser);
    try {
      const { page, stubs } = opened;
      stubs.hold();
      await page.locator('[data-entity-sort="rating"]').click();
      assert.equal(await page.locator('[data-entity-sort="rating"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-entity-sort="new"]').getAttribute('aria-pressed'), 'false');
      const visibleArrows = await page.locator('[data-entity-sort="rating"] svg').evaluateAll(nodes =>
        nodes.filter(node => getComputedStyle(node.closest('[data-icon]') || node).opacity === '1').length);
      assert.equal(visibleArrows, 1, 'The selected sort key should show a direction');
      stubs.release();
      await page.locator('[data-entity-readout]', { hasText: 'Videos · 24' }).waitFor({ timeout: 15_000 });
      assert.equal(await page.locator('[data-entity-sort="rating"]').getAttribute('aria-label'), 'Sort by rating low to high');
      await page.locator('[data-entity-sort="rating"]').click();
      await page.locator('[data-entity-readout]', { hasText: 'Videos · 24' }).waitFor({ timeout: 15_000 });
      assert.match(page.url(), /[?&]dir=asc/);
      const before = stubs.itemQueries.length;
      const small = segment(page, 'JAV card layout', 'small');
      assert.equal(await small.getAttribute('data-selected'), null);
      await small.click();
      await page.waitForFunction(() => document.querySelector(
        '[data-entity-layout][aria-label="JAV card layout"] label:has(input[value="small"])')?.hasAttribute('data-selected'));
      await segment(page, 'JAV card layout', 'big').click();
      assert.equal(stubs.itemQueries.length, before, 'Switching layouts refetched the videos once');
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('Clicking a tag adds it to the intersection bar; removing it there pops the tag back up; the URL stays in sync', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser);
    try {
      const { page } = opened;
      assert.equal(await page.locator('[data-entity-combo] [data-combo-chip]').count(), 0);
      // The tag shares the face of the one on the home filter bar: 32px tall at the `--control-h-compact` tier, 8px radius at the `--tag-radius` tier, and a 1px solid outline.
      const face = await page.locator('[data-entity-tag="creampie"]').evaluate((el) => {
        const css = getComputedStyle(el);
        return [el.getBoundingClientRect().height, css.borderTopLeftRadius, css.borderTopWidth, css.borderTopStyle];
      });
      assert.deepEqual(face, [32, '8px', '1px', 'solid']);
      await page.locator('[data-entity-tag="creampie"]').click();
      assert.equal(await page.locator('[data-entity-tag="creampie"]').getAttribute('aria-pressed'), 'true');
      await page.locator('[data-entity-combo] [data-combo-chip]', { hasText: 'Creampie' }).waitFor();
      await page.locator('[data-entity-readout]', { hasText: 'Videos · 24 · 1 tag selected' }).waitFor({ timeout: 15_000 });
      assert.match(decodeURIComponent(page.url()), /[?&]tag=中出/);
      await page.getByRole('button', { name: 'Remove Creampie' }).click();
      await page.locator('[data-entity-readout]', { hasText: /^视频 · 24$/ }).waitFor({ timeout: 15_000 });
      assert.equal(await page.locator('[data-entity-tag="creampie"]').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('[data-entity-combo] [data-combo-chip]').count(), 0);
      assert.doesNotMatch(page.url(), /[?&]tag=/);
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('Switching to photos: the view key swaps over immediately, watch state, tags and the intersection chip collapse, and the lower row changes to the photos row; switching back to video restores everything', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser, DESKTOP, `?tag=${encodeURIComponent('Creampie')}`);
    try {
      const { page } = opened;
      await page.locator('[data-media-view="photos"]').click();
      await page.locator('[data-entity-readout]', { hasText: /^照片/ }).waitFor({ timeout: 15_000 });
      const photos = await page.evaluate(() => ({
        pressed: document.querySelector('[data-media-view="photos"]')?.getAttribute('aria-pressed'),
        states: (document.querySelector('[data-entity-states]') as HTMLElement | null)?.hidden,
        tags: document.querySelectorAll('[data-entity-tag]').length,
        combo: (document.querySelector('[data-entity-combo]') as HTMLElement | null)?.hidden,
        sorts: document.querySelectorAll('[data-entity-sort]').length,
        batch: document.querySelectorAll('[data-entity-batch]').length,
      }));
      assert.deepEqual(photos, { pressed: 'true', states: true, tags: 0, combo: true, sorts: 0, batch: 1 });
      assertCovers(await glideOver(page, '[data-view-glide="round"]', '[data-media-view="photos"]'), 'Photo key');
      assert.equal(await page.locator('[data-view-glide=""]').evaluate((node) => (node as HTMLElement).hidden), true,
        'The watch state collapsed but that glass pane still glows');
      await segment(page, 'Image layout', 'fixed').click();
      await page.waitForFunction(() => document.querySelector('[data-local-wall]')?.getAttribute('data-layout') === 'fixed');
      await segment(page, 'Image layout', 'masonry').click();
      await page.locator('[data-media-view="videos"]').click();
      await page.locator('[data-entity-readout]', { hasText: 'Videos · 24 · 1 tag selected' }).waitFor({ timeout: 15_000 });
      assert.equal(await page.locator('[data-entity-tag]').count(), TAGS.length);
      assert.equal(await page.locator('[data-entity-combo] [data-combo-chip]').count(), 1);
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('The overlay sticks under the top bar, gets data-stuck when held, and the glass follows the key without drifting', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser);
    try {
      const { page } = opened;
      await page.evaluate(() => window.scrollTo(0, 700));
      await page.waitForFunction(() => document.querySelector('[data-entity-filter-glass]')!.hasAttribute('data-stuck'),
        undefined, { timeout: 5_000 });
      const pinned = await page.evaluate(() => {
        const glass = document.querySelector('[data-entity-filter-glass]')!;
        return { top: glass.getBoundingClientRect().top, sticky: parseFloat(getComputedStyle(glass).top) };
      });
      assert.ok(Math.abs(pinned.top - pinned.sticky) <= 1, `The overlay did not stick: top edge ${pinned.top}, sticky position ${pinned.sticky}`);
      assertCovers(await glideOver(page, '[data-view-glide="round"]', '[data-media-view][aria-pressed="true"]'), 'The view key while stuck');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => !document.querySelector('[data-entity-filter-glass]')!.hasAttribute('data-stuck'),
        undefined, { timeout: 5_000 });
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('The agency page lands on its performer roster with only counts on the second row; switching to videos shows sorting and tags, no JAV layout', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser, DESKTOP, '', AGENCY);
    try {
      const { page } = opened;
      const roster = await page.evaluate(() => ({
        readout: document.querySelector('[data-entity-readout]')?.textContent,
        pressed: document.querySelector('[data-media-view][aria-pressed="true"]')?.getAttribute('data-media-view'),
        views: [...document.querySelectorAll('[data-media-view]')].map((node) => node.getAttribute('data-media-view')),
        sorts: document.querySelectorAll('[data-entity-sort]').length,
        tags: document.querySelectorAll('[data-entity-tag]').length,
        cards: document.querySelectorAll('#index [data-entity-body] [data-index-grid] > [data-index-cell]').length,
      }));
      assert.deepEqual(roster, { readout: 'Performers · 3', pressed: 'people', views: ['people', 'videos'], sorts: 0, tags: 0, cards: 3 });
      await page.locator('[data-media-view="videos"]').click();
      await page.locator('[data-entity-readout]', { hasText: 'Videos · 24' }).waitFor({ timeout: 15_000 });
      assert.equal(await page.locator('[data-entity-tag]').count(), AGENCY.tags.length);
      assert.ok(await page.locator('[data-entity-sort]').count() > 0);
      assert.equal(await page.locator('[data-entity-layout][aria-label="JAV card layout"]').count(), 0);
      assertCovers(await glideOver(page, '[data-view-glide="round"]', '[data-media-view="videos"]'), 'Video key');
      await page.locator('[data-media-view="people"]').click();
      await page.locator('[data-entity-readout]', { hasText: 'Performers · 3' }).waitFor({ timeout: 15_000 });
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('At mobile width watch state and tags scroll horizontally as a block with view keys pinned; scrolling down the overlay yields the top bar, scrolling back it drops in', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser, PHONE);
    try {
      const { page } = opened;
      const scroller = page.locator('[data-entity-scroll]');
      const overflow = await scroller.evaluate((node) => node.scrollWidth - node.clientWidth);
      assert.ok(overflow > 100, `This section has no horizontal overflow at narrow width (${overflow}px); the horizontal scroll criterion did not fire`);
      const keyBefore = await page.locator('[data-media-view="videos"]').boundingBox();
      await scroller.evaluate((node) => { node.scrollLeft = 220; node.dispatchEvent(new Event('scroll')); });
      await page.waitForFunction(() => document.querySelector('[data-entity-scroll]')!.scrollLeft > 0);
      const keyAfter = await page.locator('[data-media-view="videos"]').boundingBox();
      assert.equal(keyAfter?.x, keyBefore?.x, 'View key drifted with the horizontal scroll');
      await page.waitForFunction(() => (document.querySelector('[data-view-glide=""]') as HTMLElement).hidden,
        undefined, { timeout: 5_000 });
      const glass = '[data-entity-filter-glass]';
      /* Direction is judged by "the previous y": the shell queues one rAF frame inside the scroll event before reading scrollY, so
         two scrolls landing in one frame read only the later one, and down 300 then to 700 would read as one step, with 700
         back to 500 reading as scrolling down from 300. So after each scroll it waits until the scroll event at that position
         has really fired, then two more frames: the shell's frame queues ahead of this one, and after two frames it must have
         read this position, so only the next scroll fires. */
      const scrollSettled = (y: number) => page.evaluate((target) => new Promise<void>((done) => {
        addEventListener('scroll', function seen() {
          if (scrollY !== target) return;
          removeEventListener('scroll', seen);
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        });
        scrollTo(0, target);
      }), y);
      await scrollSettled(300);
      await scrollSettled(700);
      await page.waitForFunction((selector) => document.querySelector(selector)!.hasAttribute('data-filter-free'),
        glass, { timeout: 5_000 });
      const bottom = (selector: string) => page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().bottom, selector);
      assert.ok(await bottom(glass) <= 0, `After yielding, the overlay still presses the top of the screen: bottom edge ${await bottom(glass)}`);
      await scrollSettled(500);
      await page.waitForFunction((selector) => !document.querySelector(selector)!.hasAttribute('data-filter-free'),
        glass, { timeout: 5_000 });
      const top = await page.evaluate((s) => {
        const node = document.querySelector(s)!;
        return { at: node.getBoundingClientRect().top, sticky: parseFloat(getComputedStyle(node).top) };
      }, glass);
      assert.ok(Math.abs(top.at - top.sticky) <= 1, `After scrolling back the overlay did not settle at the top bar's lower edge: ${JSON.stringify(top)}`);
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('A deep link with media=photos lands straight on the photo wall; after returning to video, adding one tag refetches once, and switching to photos and back refetches nothing', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser, DESKTOP, '?media=photos');
    try {
      const { page, stubs } = opened;
      await page.locator('[data-entity-readout]', { hasText: /^照片/ }).waitFor({ timeout: 15_000 });
      assert.equal(await page.locator('[data-media-view="photos"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-local-wall] [data-photo-index]').count(), PHOTOS.items.length);
      await page.locator('[data-media-view="videos"]').click();
      await page.locator('[data-entity-readout]', { hasText: /^视频 · 24$/ }).waitFor({ timeout: 15_000 });
      assert.doesNotMatch(page.url(), /[?&]media=/);
      const before = stubs.itemQueries.length;
      await page.locator('[data-entity-tag="creampie"]').click();
      await page.locator('[data-entity-readout]', { hasText: 'Videos · 24 · 1 tag selected' }).waitFor({ timeout: 15_000 });
      await settle(page);
      assert.equal(stubs.itemQueries.length - before, 1, `Adding one tag sent ${stubs.itemQueries.length - before} video requests`);
      await page.locator('[data-media-view="photos"]').click();
      await page.locator('[data-entity-readout]', { hasText: /^照片/ }).waitFor({ timeout: 15_000 });
      await page.locator('[data-media-view="videos"]').click();
      await page.locator('[data-entity-readout]', { hasText: 'Videos · 24 · 1 tag selected' }).waitFor({ timeout: 15_000 });
      await settle(page);
      assert.equal(stubs.itemQueries.length - before, 1, 'Switching to photos and back to videos fetched the videos again');
      assert.deepEqual(unexpected(opened), []);
    } finally {
      await opened.close();
    }
  });

  it('With six long tags selected the reading reports only the count, and the page never widens at either width', { timeout: 60_000 }, async () => {
    const long = Array.from({ length: 6 }, (_, at) => `とても長い日本語のタグ名その${at + 1}・途中で切れない`);
    for (const viewport of [DESKTOP, PHONE]) {
      const opened = await openPerformer(browser, viewport, `?tag=${encodeURIComponent(long.join(','))}`);
      try {
        const { page } = opened;
        await page.locator('[data-entity-readout]', { hasText: 'Videos · 24 · 6 tags selected' }).waitFor({ timeout: 15_000 });
        const width = await page.evaluate(() => ({
          page: document.documentElement.scrollWidth, view: window.innerWidth,
          readout: document.querySelector('[data-entity-filter-glass] [data-entity-readout]')!.textContent,
        }));
        assert.ok(width.page <= width.view, `${viewport.name}: the page is stretched to ${width.page}px (viewport ${width.view})`);
        assert.ok(!long.some((tag) => width.readout?.includes(tag)), `${viewport.name}: the reading lists tag names again`);
        assert.deepEqual(unexpected(opened), []);
      } finally {
        await opened.close();
      }
    }
  });
});
