/* The sidebar island's (`frontend/src/react/sidebar/`, ADR-0031 step 11f) behavior in a real browser: drag-reorder write-back,
 * filter groups and counts for five contexts, the glass sliding along when switching pages, drawer open/close at phone width,
 * and the overlay scrollbar still hanging on the scrolling layer.
 *
 * Write endpoints all land in stubs (`settings-fixture`, `follow-fixture`, `item-fixture`). The aggregate endpoint
 * `/api/facets` fetches a real copy per the demo library, with only content tags swapped for context-distinguishable ones:
 * home and entity pages showing different numbers is what proves the sidebar fetches per context. The demo library has no
 * person entities, so the entity page's profile and videos are provided here in the endpoint's shape (same as
 * `entity-filter.test.ts`). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { expectBody, launch, settle, visit, VIEWPORTS } from './harness.ts';
import { openFollowFeed } from './follow-fixture.ts';
import { ITEM, openItemPage } from './item-fixture.ts';
import { openHome, ORDER } from './settings-fixture.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const PHONE = VIEWPORTS.find((viewport) => viewport.mobile)!;
const HOME_TAGS = [['Demo sidebar Alpha', 41], ['Demo sidebar Beta', 7]] as const;
const ENTITY_TAGS = [['Demo sidebar Alpha', 23], ['Demo sidebar Beta', 5]] as const;
const withoutPlayer = (problems: string[]) => problems.filter((line) => !line.includes('VIDEOJS'));
const PERFORMER = '篠田ゆう';
const THUMB = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#456"/></svg>';

/** The profile data, videos, photos, and images a performer profile page needs. */
async function serveEntity(page: Page): Promise<void> {
  const entity = {
    id: 90_101, kind: 'performer', canonical_name: PERFORMER, aliases: [], display_aliases: [], user_aliases: [],
    asset_count: 6, tags: [], related_performers: [], links: [], metadata: {}, has_image: false, has_avatar: false,
    avatar_focus: null, representative_asset_id: null, entry_links: [], feed: null,
  };
  const items = Array.from({ length: 6 }, (_, at) => ({
    id: 91_000 + at, name: `SSIS-${100 + at} Demo video ${at + 1}`, code: `SSIS-${100 + at}`, is_jav: true, has_thumb: true,
    duration: 7200, studio: 'S1 NO.1 STYLE', tags: [],
  }));
  await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: entity }));
  await page.route((url) => url.pathname === '/api/items', (route) => route.fulfill({ json: {
    items: Number(new URL(route.request().url()).searchParams.get('offset') || 0) ? [] : items, total: items.length, has_more: false,
  } }));
  await page.route((url) => url.pathname === '/api/photos', (route) =>
    route.fulfill({ json: { total: 0, sample_total: 0, sets: [], items: [], has_more: false, seed: '' } }));
  await page.route((url) => url.pathname === '/api/feeds/discoveries', (route) =>
    route.fulfill({ json: { ok: true, more: false, items: [] } }));
  await page.route(/\/(?:thumb|poster|photo-thumb|cover)\?/, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: THUMB }));
}

/** Swap `/api/facets`'s content tags for the context-provided one; return the query string received, to see whether the entity page's fetch used entity terms. */
async function scopeFacets(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route((url) => url.pathname === '/api/facets', async (route) => {
    const url = new URL(route.request().url());
    seen.push(url.search);
    const real = await (await route.fetch()).json() as Record<string, unknown>;
    const rows = url.searchParams.get('scope_kind') ? ENTITY_TAGS : HOME_TAGS;
    await route.fulfill({ json: { ...real, tags: rows.map(([k, n]) => ({ k, n, cat: 'general' })) } });
  });
  return seen;
}

/** A group's chips in the drawer: values and count badge numbers, in the order they render. */
const chips = (page: Page, group: string) =>
  page.locator(`#drawer [data-sidebar-group="${group}"] [data-sidebar-chip]`).evaluateAll((nodes) =>
    nodes.map((node) => [node.getAttribute('data-val') ?? node.getAttribute('data-follow-drawer-tag'),
      node.querySelector('[data-sidebar-count]')?.textContent ?? null]));

const navKeys = (page: Page) =>
  page.locator('#drawer [data-sidebar-nav] [data-nav]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-nav')));

/** Open a group (initially only the active group is expanded; collapsed groups are `inert`, and their chips cannot be clicked). */
async function openGroup(page: Page, group: string): Promise<void> {
  const toggle = page.locator(`#drawer [data-sidebar-group="${group}"] > [data-sidebar-toggle]`);
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.locator(`#drawer [data-sidebar-group="${group}"] [data-sidebar-collapse]:not([inert])`).waitFor({ timeout: 5_000 });
}

describe('Sidebar island', () => {
  let browser: Browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser.close();
  });

  it('Dragging an item reorders navigation: it re-sorts in place, writes to settings, and survives a refresh in the new order', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page, server } = opened;
    try {
      assert.deepEqual(await navKeys(page), ORDER, 'The sidebar does not draw in the settings order');
      const from = (await page.locator('#drawer [data-nav="tags"]').boundingBox())!;
      const to = (await page.locator('#drawer [data-nav="follow"]').boundingBox())!;
      await page.mouse.move(from.x + 40, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 44, from.y + from.height / 2 - 6, { steps: 4 });
      await page.mouse.move(to.x + 40, to.y + 6, { steps: 8 });
      await page.mouse.move(to.x + 42, to.y + 7, { steps: 2 });
      assert.equal(await page.locator('#drawer [data-nav="tags"]').getAttribute('data-dragging'), '', 'The dragged item was never marked');
      const line = await page.locator('#drawer [data-sidebar-drop-line]').boundingBox();
      assert.ok(line && line.width > 0, 'The insertion line never showed');
      assert.equal(await page.locator('#drawer [data-nav="follow"]').evaluate(node => node.style.getPropertyValue('--sidebar-nudge')), '10px');
      assert.equal(await page.locator('#drawer [data-nav="jav"]').evaluate(node => node.style.getPropertyValue('--sidebar-delay')), '24ms');
      await page.mouse.up();
      const moved = ['', 'tags', 'follow', 'jav', 'performers', 'studios', 'flagged', 'manage'];
      await page.waitForFunction((want) => JSON.stringify([...document.querySelectorAll('#drawer [data-sidebar-nav] [data-nav]')]
        .map((node) => node.getAttribute('data-nav'))) === want, JSON.stringify(moved), { timeout: 5_000 });
      const posts = server.posts.filter((post) => post.path === '/api/settings' && 'sidebarOrder' in post.body);
      assert.deepEqual(posts.at(-1)?.body.sidebarOrder, moved, 'New order not written to settings');
      assert.equal(await page.locator('#drawer [data-dragging], #drawer [data-sidebar-drop-line]').count(), 0, 'After release the drag mark never cleared');

      await page.reload({ waitUntil: 'load' });
      await page.locator('#drawer [data-sidebar-nav] [data-nav]').first().waitFor({ timeout: 15_000 });
      await settle(page);
      assert.deepEqual(await navKeys(page), moved, 'After refresh the sidebar falls back to the old order');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Esc and dragging out of the navigation area cancel reordering — nothing is saved and no navigation fires', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page, server } = opened;
    try {
      for (const escape of [true, false]) {
        const from = (await page.locator('#drawer [data-nav="tags"]').boundingBox())!;
        const to = (await page.locator('#drawer [data-nav="follow"]').boundingBox())!;
        await page.mouse.move(from.x + 40, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(to.x + 40, to.y + 4, { steps: 8 });
        if (escape) await page.keyboard.press('Escape');
        else await page.mouse.move(600, to.y + 4, { steps: 4 });
        await page.mouse.up();
        assert.deepEqual(await navKeys(page), ORDER);
        assert.equal(new URL(page.url()).pathname, '/');
        assert.equal(await page.locator('#drawer [data-dragging],#drawer [data-sidebar-drop-line]').count(), 0);
      }
      assert.equal(server.posts.filter(post => post.path === '/api/settings' && 'sidebarOrder' in post.body).length, 0);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('The follows page reuses loaded content on both ways in and never refetches the list or lays the first-screen skeleton', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    const { page } = opened;
    let requests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/follow') requests++ });
    try {
      const items = () => page.locator('[data-follow-list] > [data-follow-item]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-follow-item')));
      const before = await items();
      await page.evaluate(() => {
        const tracking = { skeletons: 0 };
        Object.assign(window, { followReturnTracking: tracking });
        new MutationObserver(records => {
          for (const record of records) for (const node of record.addedNodes) {
            if (node instanceof Element && (node.matches('[data-skeleton-tier]') || node.querySelector('[data-skeleton-tier]'))) tracking.skeletons++;
          }
        }).observe(document.getElementById('stats')!, { childList: true, subtree: true });
      });
      for (let round = 0; round < 2; round++) {
        await page.locator('#drawer [data-nav=""]').click();
        await page.locator('#grid [data-media-body]').waitFor({ state: 'visible' });
        await page.locator('html[data-page-navigation-pending]').waitFor({ state: 'detached' });
        await page.locator('#drawer [data-nav="follow"]').click();
        await page.locator('[data-follow-list] > [data-follow-item]').first().waitFor({ state: 'visible' });
        await page.locator('html[data-page-navigation-pending]').waitFor({ state: 'detached' });
        assert.deepEqual(await items(), before);
      }
      assert.equal(requests, 0);
      assert.equal(await page.evaluate(() => (window as unknown as { followReturnTracking: { skeletons: number } }).followReturnTracking.skeletons), 0);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally { await opened.close() }
  });

  it('Home and entity pages list content tags and counts by their own criteria; clicking a chip presses it and writes the URL', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    try {
      const seen = await scopeFacets(page);
      await page.reload({ waitUntil: 'load' });
      await page.locator('#drawer [data-sidebar-group="Content tags"]').waitFor({ state: 'attached', timeout: 15_000 });
      await settle(page);
      assert.deepEqual(await chips(page, 'Content tags'), HOME_TAGS.map(([k, n]) => [k, String(n)]), 'Home\'s content tags are not the whole-library copy');
      assert.ok((await chips(page, 'Source')).some(([value, count]) => value === 'local' && Number(count) > 0), 'The sources group lacks local counts');

      await openGroup(page, 'Content tags');
      const chip = page.locator(`#drawer [data-sidebar-chip][data-key="tag"][data-val="${HOME_TAGS[0][0]}"]`);
      await chip.click();
      await page.waitForFunction((tag) => new URL(location.href).searchParams.get('tag') === tag, HOME_TAGS[0][0], { timeout: 5_000 });
      await page.locator(`#drawer [data-sidebar-chip][data-val="${HOME_TAGS[0][0]}"][aria-pressed="true"]`).waitFor({ timeout: 5_000 });
      assert.ok(seen.some((query) => new URLSearchParams(query).get('tag') === HOME_TAGS[0][0]), 'After pressing the chip, the aggregation did not refetch with this filter');

      await serveEntity(page);
      await page.goto(new URL(`/performers/${encodeURIComponent(PERFORMER)}`, page.url()).toString(), { waitUntil: 'load' });
      await page.locator('#drawer [data-sidebar-group="Content tags"]').waitFor({ state: 'attached', timeout: 15_000 });
      await settle(page);
      assert.ok(seen.some((query) => {
        const params = new URLSearchParams(query);
        return params.get('scope_kind') === 'performer' && params.get('scope_name') === PERFORMER;
      }), `The entity page did not fetch aggregations by entity scope: ${seen.join(' | ')}`);
      assert.deepEqual(await chips(page, 'Content tags'), ENTITY_TAGS.map(([k, n]) => [k, String(n)]), 'The entity page does not list this entity\'s counts');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The follow page counts tags by this revision\'s entries, and follow details list only this item\'s tags at one each', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    const { page } = opened;
    try {
      await page.locator('#drawer [data-sidebar-group="Content tags"] [data-follow-drawer-tag]').first().waitFor({ state: 'attached', timeout: 10_000 });
      const listed = await chips(page, 'Content tags');
      const shown = await page.locator('[data-follow-list] > [data-follow-item]').count();
      assert.ok(listed.length > 1, 'The follows page\'s tag group is empty');
      assert.ok(listed.every(([, count]) => Number(count) >= 1), `Follows page tags are missing counts: ${JSON.stringify(listed)}`);
      assert.equal(listed.reduce((sum, [, count]) => sum + Number(count), 0), shown * 2,
        'Each entry updates two tags; the sum of counts should be twice the entry count');

      await page.locator('[data-follow-item="1002"] [data-follow-open]').click();
      await page.locator('#stage[open] [data-follow-detail-side]').waitFor({ timeout: 10_000 });
      await page.waitForFunction(() => document.querySelectorAll('#drawer [data-follow-drawer-tag]').length === 2, undefined, { timeout: 5_000 });
      assert.deepEqual((await chips(page, 'Content tags')).sort(), [['3d', '1'], ['outdoor', '1']], 'Follow details do not list this entry\'s tags');
      await page.locator('#closeStage').click();
      await page.waitForFunction((count) => document.querySelectorAll('#drawer [data-follow-drawer-tag]').length === count,
        listed.length, { timeout: 5_000 });
      assert.deepEqual(await chips(page, 'Content tags'), listed, 'Closing details changed the follows page\'s tag counts');

      /* Follow tags in the drawer are single-select: tapping one filters by it alone, the drawer collapses, and what remains is the filtered list. */
      await openGroup(page, 'Content tags');
      const [tag] = listed[0]!;
      await page.locator(`#drawer [data-follow-drawer-tag="${tag}"]`).click();
      await page.waitForFunction((want) => new URL(location.href).searchParams.get('tag') === want
        && !document.querySelector('#drawer')?.classList.contains('open'), tag, { timeout: 5_000 });
      await page.locator('#filterBtn').click();
      await page.locator(`#drawer.open [data-follow-drawer-tag="${tag}"][aria-pressed="true"]`).waitFor({ timeout: 5_000 });
      const pressed = await page.locator('#drawer [data-follow-drawer-tag][aria-pressed="true"]').count();
      assert.equal(pressed, 1, 'More than one follow tag is pressed');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('The follows page sidebar has Source, Duration and Content tags groups; source and duration go into the address and drive the server fetch, the drawer does not collapse, and a refresh presses them by the address', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    const { page } = opened;
    const lists: URLSearchParams[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/follow' && !url.searchParams.has('item')) lists.push(url.searchParams);
    });
    const groups = () => page.locator('#drawer [data-sidebar-group]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-sidebar-group')));
    try {
      await page.locator('#drawer [data-sidebar-group="Source"] [data-sidebar-chip]').first().waitFor({ state: 'attached', timeout: 10_000 });
      assert.deepEqual(await groups(), ['Source', 'Duration', 'Content tags'], 'The follows page sidebar\'s grouping is wrong');
      assert.deepEqual((await chips(page, 'Source')).map(([value]) => value), ['kemono', 'rule34xxx', 'fanbox'],
        'The source group is not the whole library\'s set of sites');

      await openGroup(page, 'Source');
      await page.locator('#drawer [data-sidebar-chip][data-key="provider"][data-val="rule34xxx"]').click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('provider') === 'rule34xxx', undefined, { timeout: 5_000 });
      await page.locator('#drawer.open [data-sidebar-chip][data-val="rule34xxx"][aria-pressed="true"]').waitFor({ timeout: 5_000 });
      await page.waitForFunction(() => document.querySelectorAll('#drawer [data-sidebar-group="Source"] [data-sidebar-chip]').length === 3,
        undefined, { timeout: 5_000 });
      assert.ok(lists.some((params) => params.get('provider') === 'rule34xxx'), 'After pressing a source it did not fetch from the server by it');

      await openGroup(page, 'Duration');
      await page.locator('#durMin').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => new URL(location.href).searchParams.get('dur_min') === '300', undefined, { timeout: 5_000 });
      await page.waitForFunction(() => document.querySelector('#drawer')?.classList.contains('open'), undefined, { timeout: 5_000 });
      assert.ok(lists.some((params) => params.get('dur_min') === '300' && params.get('provider') === 'rule34xxx'),
        'After dragging duration it did not fetch from the server carrying both filters');
      assert.ok(!new URL(page.url()).searchParams.has('dur_max'), 'The right end never moved yet the upper bound was written');

      await page.reload({ waitUntil: 'load' });
      await page.locator('#drawer [data-sidebar-chip][data-val="rule34xxx"][aria-pressed="true"]').waitFor({ state: 'attached', timeout: 10_000 });
      assert.equal(await page.locator('#durMin').inputValue(), '5', 'After refresh, the left end of the duration does not return to 5 min per the URL');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('With video details open the sidebar keeps only navigation, and closing restores the list groups as they were', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, '/', DESKTOP, { ready: `#grid [data-media-card][data-id="${ITEM.plain}"]` });
    const { page } = opened;
    try {
      await page.locator('#drawer [data-sidebar-group]').first().waitFor({ state: 'attached', timeout: 10_000 });
      const groups = () => page.locator('#drawer [data-sidebar-group]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-sidebar-group')));
      const before = await groups();
      const sources = await chips(page, 'Source');
      assert.ok(before.length > 1, `Home's groups are incomplete: ${before.join(', ')}`);
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"] [data-media-title]`).first().click();
      await page.locator('#stage[open] [data-item-side]').waitFor({ timeout: 10_000 });
      assert.deepEqual(await groups(), [], 'With details open the sidebar still carries the list\'s filter groups');
      assert.ok((await navKeys(page)).includes(''), 'The nav column is gone while details are open');
      await page.locator('#closeStage').click();
      await page.waitForFunction((want) => JSON.stringify([...document.querySelectorAll('#drawer [data-sidebar-group]')]
        .map((node) => node.getAttribute('data-sidebar-group'))) === want, JSON.stringify(before), { timeout: 10_000 });
      assert.deepEqual(await chips(page, 'Source'), sources, 'Closing details changed that source group\'s counts');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('An Esc already consumed by a popover or dialog no longer collapses the sidebar; an unhandled Esc still does', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    try {
      await settle(page);
      const drawer = () => page.evaluate(() => document.body.classList.contains('drawer-open'));
      assert.equal(await drawer(), true, 'At desktop width the sidebar is expanded by default');
      // 详情先于全局入口关完时，冒泡上来的就是这样一下已被 preventDefault 的 Esc。
      await page.evaluate(() => document.body.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.preventDefault();
      }, { capture: true, once: true }));
      await page.keyboard.press('Escape');
      assert.equal(await drawer(), true, 'An Esc that was already used collapsed the sidebar');
      await page.keyboard.press('Escape');
      assert.equal(await drawer(), false, 'An unhandled Esc did not collapse the sidebar');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Across page switches the current item\'s glass keeps its node, plays the full animation, and settles on the selected item', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    try {
      await expectBody(page, 'Home', [page.locator('#drawer.open [data-sidebar-nav] [aria-pressed="true"]')]);
      await page.locator('#drawer [data-sidebar-group]').first().waitFor({ state: 'attached', timeout: 15_000 });
      await settle(page);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      for (const key of ['performers', 'tags', '']) {
        const run = await page.evaluate(async (target) => {
          const glide = document.querySelector<HTMLElement>('#drawer > [data-sidebar-glide]')!;
          (glide as unknown as { __mark: boolean }).__mark = true;
          const seen = new Set<Animation>();
          let cancelled = 0;
          const watch = () => glide.getAnimations().forEach((animation) => {
            if (seen.has(animation)) return;
            seen.add(animation);
            animation.addEventListener('cancel', () => { cancelled += 1 });
          });
          document.querySelector<HTMLElement>(`#drawer [data-sidebar-nav] [data-nav="${target}"]`)!.click();
          watch();
          const started = seen.size;
          await Promise.all([...seen].map((animation) => animation.finished));
          const now = document.querySelector('#drawer > [data-sidebar-glide]') as (HTMLElement & { __mark?: boolean }) | null;
          const pressed = document.querySelector<HTMLElement>('#drawer [data-sidebar-nav] [aria-pressed="true"]')!;
          return {
            same: !!now?.__mark, started, cancelled, to: now!.getBoundingClientRect().top,
            pressedKey: pressed.dataset.nav, pressedTop: pressed.getBoundingClientRect().top,
          };
        }, key);
        assert.equal(run.pressedKey, key, `After clicking ${key || 'Home'} a different item is pressed`);
        assert.ok(run.same, 'After switching pages the glass changes nodes, so the transform restarts from the beginning');
        assert.ok(run.started > 0, `Switching to ${key || 'Home'} started no glass animation`);
        assert.equal(run.cancelled, 0, `The glass animation got cut off while switching to ${key || 'Home'}`);
        assert.ok(Math.abs(run.to - run.pressedTop) <= 1, `Glass stopped at ${run.to}, current item at ${run.pressedTop}`);
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('At mobile width the drawer starts collapsed and opens over the page; tapping the scrim or the navigation closes it; the scroll layer still carries the overlay scrollbar', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', PHONE);
    const { page } = opened;
    try {
      await page.locator('#drawer [data-sidebar-nav] [data-nav]').first().waitFor({ state: 'attached', timeout: 15_000 });
      await settle(page);
      const state = () => page.evaluate(() => {
        const drawer = document.querySelector<HTMLElement>('#drawer')!;
        return {
          open: drawer.classList.contains('open'), inert: drawer.inert,
          expanded: document.querySelector('#filterBtn')!.getAttribute('aria-expanded'),
          scrim: getComputedStyle(document.querySelector('#scrim')!).display,
          left: Math.round(drawer.getBoundingClientRect().left),
        };
      });
      const closed = await state();
      assert.equal(closed.open, false, 'On phones the drawer starts open on entry');
      assert.equal(closed.inert, true, 'The collapsed drawer lacks inert, so Tab walks off screen');
      assert.equal(closed.scrim, 'none', 'The drawer mask is still in the render tree while collapsed');
      assert.ok(closed.left < 0, 'The collapsed drawer never moved off screen');

      await page.locator('#filterBtn').tap();
      await page.waitForFunction(() => document.querySelector('#drawer')?.classList.contains('open'));
      const shown = await state();
      assert.deepEqual([shown.inert, shown.expanded, shown.scrim, shown.left], [false, 'true', 'block', 12], 'After opening the drawer never slides over');

      assert.equal(await page.evaluate(() => document.elementFromPoint(370, 420)?.id), 'scrim', 'The strip right of the drawer does not hit the scrim');
      await page.mouse.click(370, 420);
      await page.waitForFunction(() => !document.querySelector('#drawer')?.classList.contains('open'));
      assert.deepEqual((await state()).scrim, 'none', 'After collapsing via scrim tap the scrim never left the render tree');

      await page.locator('#filterBtn').tap();
      await page.waitForFunction(() => document.querySelector('#drawer')?.classList.contains('open'));
      await page.locator('#drawer [data-sidebar-nav] [data-nav="tags"]').tap();
      await page.waitForFunction(() => location.pathname === '/tags' && !document.querySelector('#drawer')?.classList.contains('open'),
        undefined, { timeout: 5_000 });

      const scroller = await page.evaluate(() => {
        const scroll = document.querySelector<HTMLElement>('#drawerScroll')!;
        const drawer = document.querySelector<HTMLElement>('#drawer')!;
        return {
          parent: scroll.parentElement?.id, overflow: getComputedStyle(scroll).overflowY,
          drawerOverflow: getComputedStyle(drawer).overflowY,
          nav: !!scroll.querySelector(':scope > [data-sidebar-nav]'),
          tracks: drawer.querySelectorAll(':scope > .ovtrack').length,
        };
      });
      assert.deepEqual(scroller, { parent: 'drawer', overflow: 'auto', drawerOverflow: 'hidden', nav: true, tracks: 2 },
        'The scroll does not land on the drawer\'s layer, or the overlay scrollbar is not attached to it');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });
});
