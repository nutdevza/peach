/* The whole block above the home grid: two avatar rows, the glass overlay's two rows (views and tags, readout and sort) and
 * the intersection bar above the grid (`catalog-filter` island, ADR-0031).
 *
 * Videos, details and images reuse `item-fixture.ts`'s stubs; the two avatar rows (`/api/tops`), tags (`/api/facets`'s
 * `tags`) and the catalog list get their own copies here, so requests can be counted and "what was clicked" matched against
 * "how many refetches". What is verified is behavior: which requests a click sends, how pressed states and the address
 * change, and whether the rows are the same nodes after a details round trip. Looks are covered by screenshots elsewhere. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, layout, settle, VIEWPORTS, withPageDiagnostics } from './harness.ts';
import { CATALOG, ITEM, openItemPage, type ItemVisit } from './item-fixture.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const PHONE = VIEWPORTS.find((viewport) => viewport.mobile)!;
const DETAIL_READY = '#stage[open] [data-item-side]';
const FILTER = '[data-catalog-filter]';
const READOUT = `${FILTER} [data-count-readout]`;

/** Page one has forty performers and ten labels; the performer strip has one more page of twenty, and that is the end. */
const PERFORMERS = Array.from({ length: 60 }, (_, at) => ({
  id: 95_000 + at, k: `Demo performer${String(at + 1).padStart(2, '0')}`, n: 60 - at,
  has_image: true, has_avatar: false, avatar_focus: null, rep: null,
}));
const STUDIOS = Array.from({ length: 10 }, (_, at) => ({ k: `Demo label ${at + 1}`, n: 20 - at, has_logo: false }));
const TAGS = Array.from({ length: 40 }, (_, at) => ({ k: `Demo tag${String(at + 1).padStart(2, '0')}`, n: 90 - at }));

interface Counts {
  /** 目录分页带 offset；竖屏、搜索推荐与库存在性探测各走各的。窄屏首批可以只有一张。 */
  items: URL[];
  summaries: URL[];
  facets: URL[];
  tops: URL[];
}

const pathIs = (page: Page, path: string) => page.waitForFunction(
  (want) => decodeURIComponent(location.pathname) === want, path, { timeout: 10_000 });
const withoutPlayer = (problems: string[]) => problems.filter((line) => !line.includes('VIDEOJS'));

/** Wait for the request count recorded on the Node side to land: the stub counts in Node, which the page's `waitForFunction` cannot read. */
async function until(done: () => boolean, message: string | (() => string), timeout = 10_000) {
  const end = Date.now() + timeout;
  while (!done()) {
    if (Date.now() > end) assert.fail(typeof message === 'function' ? message() : message);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Open the home page: reload once the stubs are in place, then wait for the numbers to appear and the waiting state to end. */
async function openHome(browser: Browser, path = '/', viewport = DESKTOP): Promise<ItemVisit & { counts: Counts }> {
  const opened = await openItemPage(browser, '/', viewport, { ready: '#grid [data-media-card]' });
  const { page } = opened;
  const counts: Counts = { items: [], summaries: [], facets: [], tops: [] };
  await page.route((url) => url.pathname === '/api/tops', (route) => {
    const url = new URL(route.request().url());
    counts.tops.push(url);
    const page = Number(url.searchParams.get('page') || 0);
    const performers = page === 0 ? PERFORMERS.slice(0, 40) : page === 1 ? PERFORMERS.slice(40) : [];
    return route.fulfill({ json: { performers, studios: page ? [] : STUDIOS } });
  });
  await page.route((url) => url.pathname === '/api/facets', async (route) => {
    counts.facets.push(new URL(route.request().url()));
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), tags: TAGS } });
  });
  /* Adding one tag filter cuts the list to half: the readouts change with it, which is how you can see this fetch really used the new criteria. */
  await page.route((url) => url.pathname === '/api/items', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('summary_only') === '1') counts.summaries.push(url);
    else if (!url.searchParams.has('orient') && url.searchParams.has('offset')) counts.items.push(url);
    const ids = url.searchParams.get('tag') || url.searchParams.get('owner') === 'none' ? CATALOG.slice(0, 3) : CATALOG;
    return route.fulfill({ json: {
      items: ids.map((id) => ({ id, name: `sample_${id}.mp4`, title: `Demo video ${id}`, is_jav: false, medium: 'video',
        location: 'local', has_thumb: true, duration: 3600, studio: 'Peach Studio', performers: [], tags: [] })),
      total: ids.length, has_more: false,
    } });
  });
  await page.goto(new URL(path, page.url()).toString(), { waitUntil: 'load' });
  await page.locator(READOUT, { hasText: 'matches' }).waitFor({ timeout: 15_000 });
  await page.locator(`${FILTER} [data-tier-performer]`).first().waitFor({ timeout: 15_000 });
  await settle(page);
  return { ...opened, counts };
}

const tag = (page: Page, key: string) => page.locator(`${FILTER} [data-catalog-tag="${key}"]`);
const chips = (page: Page) => page.locator('#combo [data-combo-chip]');

describe('Home filter bar', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  it('While the JAV reading has not returned, a two-line skeleton holds; the merge is decided once content is ready', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser, '/?jav=1');
    const { page } = opened;
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve });
    try {
      await page.route((url) => url.pathname === '/api/facets', async route => {
        const response = await route.fetch();
        await route.fulfill({ json: { ...await response.json(), tags: TAGS.slice(0, 1) } });
      });
      await page.route((url) => url.pathname === '/api/items', async route => { await waiting; await route.fallback() });
      await page.setViewportSize({ width: 1920, height: 900 });
      await page.reload();
      const frame = page.locator(`${FILTER} [data-catalog-frame]`);
      await frame.locator('[data-catalog-tag]').first().waitFor();
      assert.equal(await frame.getAttribute('data-single-row'), null);
      assert.equal(await frame.evaluate(node => node.getBoundingClientRect().height), 96);
      release();
      await page.locator(READOUT, { hasText: 'matches' }).waitFor();
      await page.locator(`${FILTER} [data-catalog-frame][data-single-row]`).waitFor();
      assert.deepEqual(opened.problems, []);
    } finally { release(); await opened.close() }
  });

  it('With few filters, they and the right-side actions share a row or wrap by container width', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    const { page } = opened;
    try {
      await page.route((url) => url.pathname === '/api/facets', async route => {
        const response = await route.fetch();
        await route.fulfill({ json: { ...await response.json(), tags: TAGS.slice(0, 1) } });
      });
      await page.setViewportSize({ width: 1920, height: 900 });
      await page.reload(); await settle(page);
      const frame = page.locator(`${FILTER} [data-catalog-frame]`);
      await frame.locator('[data-catalog-tag]').first().waitFor();
      await page.locator(`${FILTER} [data-catalog-frame][data-single-row]`).waitFor();
      const wide = await frame.evaluate(element => {
        const top = element.querySelector('[data-filter-row="top"]')!.getBoundingClientRect();
        const bottom = element.querySelector('[data-filter-row="bottom"]')!.getBoundingClientRect();
        return { same: Math.abs(top.y - bottom.y) < 2, after: bottom.x >= top.right - 2 };
      });
      assert.deepEqual(wide, { same: true, after: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(`${FILTER} [data-catalog-frame]:not([data-single-row])`).waitFor();
      assert.ok((await layout(page)).scrollWidth <= 390);
    } finally { await opened.close(); }
  });

  for (const viewport of [DESKTOP, PHONE]) {
    it(`${viewport.name} keeps spacing between filter chips and video card hover surfaces`, { timeout: 60_000 }, async () => {
      const opened = await openHome(browser, '/?studio=Peach%20Studio', viewport);
      try {
        await opened.page.mouse.move(0, 0);
        const controls = await opened.page.locator(`${FILTER} [data-filter-glass]`).evaluate(frame => {
          const candidates = [...frame.querySelectorAll('button,a[aria-pressed],[data-glass-segment]')]
            .filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
          const actions = ['[data-shortcuts-trigger]', '[data-entity-batch]'].map(selector => {
            const node = frame.querySelector(selector)!;
            const style = getComputedStyle(node), rect = node.getBoundingClientRect();
            return { width: rect.width, height: rect.height, background: style.backgroundImage,
              color: style.color, border: style.border, shadow: style.boxShadow, radius: style.borderRadius };
          });
          return { heights: candidates.map(node => ({ label: node.getAttribute('aria-label') || node.textContent,
            height: node.getBoundingClientRect().height })), actions,
            compact: parseFloat(getComputedStyle(frame).getPropertyValue('--control-h-compact')) };
        });
        // The whole filter bar takes the compact tier: tabs, pills, segments, and the two action buttons share one height.
        assert.equal(controls.compact, 32);
        for (const control of controls.heights) assert.equal(control.height, controls.compact, JSON.stringify(control));
        assert.deepEqual(controls.actions[0], controls.actions[1]);
        assert.equal(controls.actions[0].width, controls.compact);
        assert.equal(controls.actions[0].color, 'rgb(255, 255, 255)');
        assert.match(controls.actions[0].background, /^linear-gradient\(/);
        const gap = await opened.page.evaluate(() => document.querySelector('#grid [data-media-card]')!.getBoundingClientRect().top
          - document.querySelector('#combo [data-entity-combo]')!.getBoundingClientRect().bottom - 8);
        assert.ok(gap >= 16, `The filter is only ${gap}px from the card hover surface`);
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally { await opened.close(); }
    });
  }

  it('Clicking a cell in the avatar strip opens that person\'s profile page; the studio filter in the URL shows an intersection chip, and removing it refetches the list once', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser, '/?studio=Peach%20Studio');
    try {
      const { page, counts } = opened;
      await chips(page).filter({ hasText: 'Label Peach Studio' }).waitFor();
      const before = counts.items.length;
      await chips(page).filter({ hasText: 'Peach Studio' }).getByRole('button', { name: 'Remove label Peach Studio' }).click();
      await page.waitForFunction(() => !new URLSearchParams(location.search).has('studio'));
      await page.locator(READOUT, { hasText: `${CATALOG.length} matches` }).waitFor();
      assert.equal(await chips(page).count(), 0, 'Something remains on the intersection bar after removal');
      const after = counts.items.slice(before);
      assert.ok(after.length >= 1 && after.every((url) => !url.searchParams.has('studio')), 'Removal does not refetch with the new criteria');
      await page.locator(`${FILTER} [data-tier-performer]`).first().click();
      await pathIs(page, `/performers/${PERFORMERS[0]!.id}`);
    } finally {
      await opened.close();
    }
  });

  it('Tag strip selection: the pressed state changes immediately, an intersection chip appears, and the readout and sidebar counts each take one pass with the new filter; removing it from the intersection chip restores the original', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const { page, counts } = opened;
      /* The first screen's tags are drawn by seed from the forty; click the first one on screen, not the first in the list. */
      const key = (await page.locator(`${FILTER} [data-catalog-tag]`).first().getAttribute('data-catalog-tag'))!;
      await page.evaluate((filter) => {
        const first = document.querySelector(`${filter} [data-tier-performer]`) as HTMLElement & { __kept?: boolean };
        first.__kept = true;
      }, FILTER);
      const [items, facets, summaries] = [counts.items.length, counts.facets.length, counts.summaries.length];
      const order = () => page.locator(`${FILTER} [data-catalog-tag]`).evaluateAll((pills) =>
        pills.map((pill) => pill.getAttribute('data-catalog-tag')));
      const members = await order();
      /* The count is an annotation on the tag: spaced apart, one font size down, one color step dimmer, so it never reads as one word with the tag name. */
      const footnote = await tag(page, key).evaluate((pill) => {
        const badge = pill.querySelector('[data-count-badge]')!;
        const [p, b] = [getComputedStyle(pill), getComputedStyle(badge)];
        return { gap: parseFloat(b.marginLeft), smaller: parseFloat(b.fontSize) < parseFloat(p.fontSize),
          dimmer: b.color !== p.color, spaced: !/\s$/.test(badge.previousSibling?.textContent ?? '') };
      });
      assert.ok(footnote.gap >= 4, `The count sits only ${footnote.gap}px from the label`);
      assert.deepEqual([footnote.smaller, footnote.dimmer, footnote.spaced], [true, true, true],
        'Count and tag share size and color, or a space text node separates them');
      await tag(page, key).click();
      await page.locator(`${FILTER} [data-catalog-tag="${key}"][aria-pressed="true"]`).waitFor({ timeout: 2_000 });
      await chips(page).filter({ hasText: key }).waitFor();
      await page.locator(READOUT, { hasText: '3 matches' }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('tag'), key);
      assert.deepEqual(counts.items.slice(items).map((url) => url.searchParams.get('tag')), [key],
        'Clicking a tag should fetch the list exactly once under the new convention');
      assert.deepEqual(counts.summaries.slice(summaries).map((url) => url.searchParams.get('tag')), [key],
        'The independent reading should fetch statistics once under the new criteria');
      assert.deepEqual(counts.facets.slice(facets).map((url) => url.searchParams.get('tag')), [key],
        'Sidebar counts should fetch one aggregation under the new convention');
      /* When the metric changes, both avatar rows refetch under the new metric (`getBarsData`), but the same person's cell swaps its numbers in place instead of being torn down and rebuilt. */
      assert.equal(await page.evaluate((filter) => !!(document.querySelector(`${filter} [data-tier-performer]`) as
        (HTMLElement & { __kept?: boolean }) | null)?.__kept, FILTER), true, 'Adding a filter tore the avatar strip down and rebuilt it');
      /* The tag bar's members and order are unchanged: the tag just clicked stays where it was instead of moving to the front. */
      assert.deepEqual(await order(), members, 'Adding a filter reflows the tag bar');
      await chips(page).filter({ hasText: key }).getByRole('button').click();
      await page.locator(READOUT, { hasText: `${CATALOG.length} matches` }).waitFor();
      await page.locator(`${FILTER} [data-catalog-tag="${key}"][aria-pressed="false"]`).waitFor({ timeout: 2_000 });
      assert.equal(await chips(page).count(), 0);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Scrolling the avatar strip to the right lays out the page in hand first, then requests the next, and stops when an empty page arrives', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const { page, counts } = opened;
      const row = page.locator(`${FILTER} [data-catalog-tier="performers"]`);
      const shown = () => row.locator('[data-tier-performer]').count();
      assert.equal(await shown(), 24, 'The first screen should lay out only 24');
      for (let at = 0; at < 20 && await shown() < PERFORMERS.length; at += 1) {
        await row.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await page.waitForTimeout(120);
      }
      assert.equal(await shown(), PERFORMERS.length, 'The next page never lays out page two');
      for (let at = 0; at < 5; at += 1) {
        await row.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await page.waitForTimeout(120);
      }
      /* The request does not say which row it is for: the labels row fits its first page right away and is already at the right end when mounted, so requesting page 1 (empty) stops it. When the performers row
         turns to page 1 the parameter string is identical, so both share that one response; it then requests page 2 on its own. */
      assert.deepEqual(counts.tops.map((url) => url.searchParams.get('page') ?? '').sort(), ['', '1', '2'],
        'The continuation page number is wrong, or it keeps requesting past the end');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Sort key: the pressed state lands immediately and the grid refetches once; clicking the same key again flips the direction', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const { page, counts } = opened;
      const key = page.locator(`${FILTER} [data-entity-sort="new"]`);
      const before = counts.items.length;
      await key.click();
      await page.locator(`${FILTER} [data-entity-sort="new"][aria-pressed="true"]`).waitFor({ timeout: 2_000 });
      await until(() => counts.items.length > before, 'The list is not refetched after a sort change');
      await settle(page);
      assert.deepEqual(counts.items.slice(before).map((url) => url.searchParams.get('sort')), ['new'],
        'One sort change should refetch the list exactly once');
      /* Only the first page counts: the studio row sits at the right end when mounted; the empty page on the follow-up fetch is unrelated to sorting. */
      assert.equal(counts.tops.filter((url) => !url.searchParams.has('page')).length, 1, 'A sort change should not refetch both avatar rows');
      await key.click();
      await until(() => counts.items.length > before + 1, 'The list is not refetched after flipping direction');
      await settle(page);
      assert.deepEqual(counts.items.slice(before).map((url) => url.searchParams.get('dir') || ''), ['desc', 'asc']);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Card layout: repaints without refetching, recording the choice in settings', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const { page, counts } = opened;
      const choice = (value: string) => page.locator(`${FILTER} input[name="home-layout"][value="${value}"]`);
      const before = counts.items.length;
      assert.equal(await choice('small').isChecked(), true);
      await page.locator(`${FILTER} label:has(input[name="home-layout"][value="big"])`).click();
      assert.equal(await choice('big').isChecked(), true);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('peach.settings.v1') || '{}'));
      assert.equal(saved.homeLayout, 'big');
      assert.equal(counts.items.length, before, 'Switching layout must not refetch the list');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, PHONE]) {
  it(`${viewport.name} JAV library keeps the catalog layout, filters and top search, with all three sections reachable both ways`, { timeout: 60_000 }, async () => {
    const opened = await openHome(browser, '/', viewport);
    try {
      const { page, counts } = opened;
      const before = counts.items.length;
      const homeIds = await page.locator('#grid [data-media-card]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')));
      if (viewport.mobile) await page.locator('#filterBtn').click();
      await page.locator('button[data-nav="jav"]:visible').first().click();
      await page.waitForFunction(() => location.pathname === '/' && new URLSearchParams(location.search).get('jav') === '1');
      await page.getByRole('tab', { name: 'Library', exact: true, selected: true }).waitFor();
      await page.locator('#grid [data-media-card]').first().waitFor();
      await settle(page);
      assert.ok(counts.items.slice(before).some((url) => url.searchParams.get('jav') === '1'), 'The JAV scope does not refetch the list');
      assert.equal(await page.evaluate(() => document.querySelector('#javLibraryHeader')!.getBoundingClientRect().bottom <= document.querySelector('#catalogFilter [data-catalog-tier="performers"]')!.getBoundingClientRect().top), true, 'JAV title and sections should come before the visible filter row');
      assert.equal(await page.locator('#catalogPageHeading').isVisible(), false);
      assert.equal(await page.locator(`${FILTER} input[name="home-layout"]`).first().isVisible(), false);
      await page.locator(`${FILTER} input[name="jav-layout"]`).first().waitFor({ state: 'attached' });
      assert.ok(await page.locator(`${FILTER} [data-tier-performer]`).count() > 0, 'JAV has no performer filter');
      assert.ok(await page.locator(`${FILTER} [data-tier-studio]`).count() > 0, 'JAV has no label filter');
      assert.ok(await page.locator(`${FILTER} [data-catalog-tag]`).count() > 0, 'JAV has no tag filter');
      assert.equal(await page.getByRole('textbox', { name: 'Search videos', exact: true }).count(), 0);
      const width = await page.evaluate(() => ({
        grid: document.querySelector('#grid')!.getBoundingClientRect().width,
        main: document.querySelector('#main')!.clientWidth,
      }));
      assert.ok(width.grid >= width.main - 40, 'The JAV grid never fills the catalog width');
      await page.locator(`${FILTER} label:has(input[name="jav-layout"][value="big"])`).click();
      assert.equal(await page.locator(`${FILTER} input[name="jav-layout"][value="big"]`).isChecked(), true);
      const beforeSearch = counts.items.length;
      if (viewport.mobile) await page.locator('#searchBtn').click();
      await page.locator('#q').fill('Demo video');
      await page.locator('#q').press('Enter');
      await withPageDiagnostics(page, 'Video search did not refetch the JAV library by the search term', () => until(
        () => counts.items.slice(beforeSearch).some(url => url.searchParams.get('q') === 'Demo video'),
        () => JSON.stringify({ url: page.url(), list: counts.items.slice(beforeSearch).map(url => url.search),
          summaries: counts.summaries.map(url => url.search) })));
      assert.equal(counts.items.at(-1)?.searchParams.get('jav'), '1');
      assert.equal(counts.items.at(-1)?.searchParams.get('q'), 'Demo video');
      assert.equal(new URL(page.url()).searchParams.get('jav'), '1');
      assert.equal(new URL(page.url()).searchParams.get('q'), 'Demo video');
      if (viewport.mobile) await page.locator('#searchBack').click();
      await page.getByRole('tab', { name: 'Discover', exact: true }).click();
      await page.getByRole('tab', { name: 'Discover', exact: true, selected: true }).waitFor();
      assert.equal(await page.locator('#javLibraryHeader').isVisible(), false);
      await page.getByRole('tab', { name: 'Want', exact: true }).click();
      await page.getByRole('tab', { name: 'Want', exact: true, selected: true }).waitFor();
      await page.getByRole('tab', { name: 'Library', exact: true }).click();
      await page.getByRole('tab', { name: 'Library', exact: true, selected: true }).waitFor();
      await page.locator('#grid [data-media-card]').first().waitFor();
      assert.equal(await page.locator(`${FILTER} input[name="jav-layout"][value="big"]`).isChecked(), true);
      const box = await layout(page);
      assert.ok(box.scrollWidth <= box.viewportWidth, 'The JAV page overflows horizontally');
      await settle(page);
      const beforeHome = counts.items.length;
      if (viewport.mobile) await page.locator('#filterBtn').click();
      await page.locator('button[data-nav=""]:visible').first().click();
      await page.waitForFunction(() => location.pathname === '/' && !new URLSearchParams(location.search).has('jav'));
      await page.locator(`${FILTER} input[name="home-layout"]`).first().waitFor({ state: 'attached' });
      await page.locator(READOUT, { hasText: 'matches' }).waitFor();
      await settle(page);
      assert.equal(counts.items.length, beforeHome, 'Returning home reuses the original catalog cache');
      assert.deepEqual(await page.locator('#grid [data-media-card]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id'))), homeIds);
      assert.equal(await page.locator('#javLibraryHeader').isVisible(), false);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });
  }

  it('Unfiled items keep the home position, dropping the filter falls back to the whole library, and going back restores the unfiled cache', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser, '/?owner=none');
    try {
      const { page, counts } = opened;
      assert.equal(counts.items.at(-1)?.searchParams.get('owner'), 'none', 'The address\'s unattributed never entered the list request');
      let before = counts.items.length;
      const mainCards = page.locator('#grid [data-media-grid] > [data-media-card]');
      const filteredIds = await mainCards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')));
      await page.locator('[data-nav=""]:visible').first().click();
      await settle(page);
      assert.equal(new URL(page.url()).searchParams.get('owner'), 'none');
      assert.equal(counts.items.length, before, 'Clicking the current section keeps the filters');
      await chips(page).filter({ hasText: 'Unassigned' }).getByRole('button').click();
      await page.waitForFunction(() => !new URLSearchParams(location.search).has('owner'));
      await until(() => counts.items.length > before, 'Removing the unfiled filter never refetches the list');
      await settle(page);
      assert.equal(counts.items.at(-1)?.searchParams.has('owner'), false);
      assert.equal(await mainCards.count(), CATALOG.length);
      before = counts.items.length;
      await page.goBack();
      await page.waitForFunction(() => new URLSearchParams(location.search).get('owner') === 'none');
      await settle(page);
      assert.equal(counts.items.length, before, 'Going back restores the already-fetched unfiled results');
      assert.equal(await chips(page).filter({ hasText: 'Unassigned' }).count(), 1);
      assert.deepEqual(await mainCards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id'))), filteredIds);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Enter details and close again: the avatar strip keeps the original nodes, the image is still the decoded one, and no extra aggregate request is sent', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const { page, counts } = opened;
      await page.waitForFunction((filter) => {
        const img = document.querySelector(`${filter} [data-tier-ring] > img`) as HTMLImageElement | null;
        return !!img && img.complete && img.naturalWidth > 0;
      }, FILTER, { timeout: 10_000 });
      await page.evaluate((filter) => {
        const first = document.querySelector(`${filter} [data-tier-performer]`) as HTMLElement & { __kept?: boolean };
        first.__kept = true;
        (first.querySelector('[data-tier-ring] > img') as HTMLImageElement & { __kept?: boolean }).__kept = true;
      }, FILTER);
      const [facets, tops] = [counts.facets.length, counts.tops.length];
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"] [data-media-title]`).first().click();
      await pathIs(page, `/assets/${ITEM.plain}`);
      await page.locator(DETAIL_READY).waitFor();
      await page.locator('#closeStage').click();
      await pathIs(page, '/');
      await page.locator('#stage[open]').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
      await settle(page);
      const kept = await page.evaluate((filter) => {
        const first = document.querySelector(`${filter} [data-tier-performer]`) as (HTMLElement & { __kept?: boolean }) | null;
        const img = first?.querySelector('[data-tier-ring] > img') as (HTMLImageElement & { __kept?: boolean }) | null;
        return { same: !!first?.__kept, img: !!img?.__kept && img.complete && img.naturalWidth > 0 };
      }, FILTER);
      assert.deepEqual(kept, { same: true, img: true }, 'Closing details rebuilds the avatar strip');
      assert.equal(counts.facets.length, facets, 'A details round trip fetches the aggregate twice');
      assert.equal(counts.tops.length, tops, 'A details round trip fetches the avatars twice');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Go to the index page and back to home: collapsing leaves no duplicate overlay of the same name, and on return the glass sits beneath the current view', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const { page } = opened;
      await page.locator('[data-nav="tags"]:visible').first().click();
      await pathIs(page, '/tags');
      await settle(page);
      assert.equal(await page.locator(`${FILTER} [data-catalog-frame]`).count(), 0, 'The collapsed home overlay is still on the page');
      assert.equal(await page.locator(`${FILTER} [data-skeleton], ${FILTER} [aria-busy="true"]`).count(), 0);
      await page.locator('[data-nav=""]:visible').first().click();
      await pathIs(page, '/');
      await page.locator(READOUT, { hasText: 'matches' }).waitFor();
      await settle(page);
      const back = await page.evaluate((filter) => {
        const rect = (node: Element | null) => {
          if (!node || (node as HTMLElement).hidden) return null;
          const { left, width } = node.getBoundingClientRect();
          return { left: Math.round(left), width: Math.round(width) };
        };
        return {
          glide: rect(document.querySelector(`${filter} [data-view-glide]`)),
          key: rect(document.querySelector(`${filter} [data-catalog-view][aria-pressed="true"]`)),
        };
      }, FILTER);
      assert.ok(back.glide && back.key && Math.abs(back.glide.left - back.key.left) <= 1
        && Math.abs(back.glide.width - back.key.width) <= 1, `Glass is not layered beneath the current view ${JSON.stringify(back)}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('At mobile 390 width: views and tags scroll horizontally as one block, and the page itself never widens', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser, '/', PHONE);
    try {
      const { page } = opened;
      const scroller = page.locator(`${FILTER} [data-catalog-scroll]`);
      const before = await scroller.evaluate((element) => ({
        overflow: getComputedStyle(element).overflowX, room: element.scrollWidth - element.clientWidth,
        view: element.querySelector('[data-catalog-view]')!.getBoundingClientRect().left,
      }));
      assert.equal(before.overflow, 'auto', 'On narrow screens the scrolling layer should be the one outside views and tags');
      assert.ok(before.room > 100, `Views and tags should not fit at 390 wide: overflowing by ${before.room}px`);
      await scroller.evaluate((element) => { element.scrollLeft = 200; });
      const moved = await scroller.evaluate((element) => ({
        left: element.scrollLeft, view: element.querySelector('[data-catalog-view]')!.getBoundingClientRect().left,
      }));
      assert.ok(moved.left > 0, 'The outer layer cannot scroll');
      assert.ok(moved.view < before.view - 100, 'The four views never scrolled away with the tags');
      const controls = page.locator(`${FILTER} [data-filter-row="bottom"]`);
      const bottom = await controls.evaluate(element => {
        const summary = element.querySelector('[data-catalog-summary]')!.getBoundingClientRect();
        const sorts = element.querySelector('[data-entity-sorts]')!.getBoundingClientRect();
        return { height: element.getBoundingClientRect().height, summary: summary.y + summary.height / 2,
          sorts: sorts.y + sorts.height / 2, room: element.scrollWidth - element.clientWidth,
          overflow: getComputedStyle(element).overflowX };
      });
      assert.ok(Math.abs(bottom.summary - bottom.sorts) < 2, JSON.stringify(bottom));
      assert.ok(bottom.height <= 56 && bottom.room > 100 && bottom.overflow === 'auto', JSON.stringify(bottom));
      await controls.evaluate(element => { element.scrollLeft = 300 });
      assert.ok(await controls.evaluate(element => element.scrollLeft > 100));
      for (const width of [430, 390, 760, 761, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const glass = await page.locator(`${FILTER} [data-filter-glass]`).evaluate(async element => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const style = getComputedStyle(element);
          return { filter: style.backdropFilter, width: element.getBoundingClientRect().width,
            viewport: document.documentElement.clientWidth };
        });
        assert.ok(glass.filter.includes('blur(') && glass.width < glass.viewport, JSON.stringify(glass));
      }
      const measured = await layout(page);
      assert.deepEqual(measured.offenders, [], `Filter bar stretched the page wider: ${measured.offenders.join(', ')}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Last time both rows were empty: re-entering home does not lay two row placeholders while refetching, and the overlay does not shift on arrival', { timeout: 60_000 }, async () => {
    const opened = await openHome(browser);
    try {
      const { page } = opened;
      let delay = 0;
      // Later registrations intercept first: this pair has nothing in either row, so on the second visit the three-second stall measures the moment right before the fetch returns.
      await page.route((url) => url.pathname === '/api/tops', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await route.fulfill({ json: { performers: [], studios: [] } });
      });
      await page.reload();
      await page.locator(`${FILTER} [data-catalog-root]:not([data-loading])`).waitFor();
      await settle(page);
      delay = 3_000;
      await page.reload({ waitUntil: 'domcontentloaded' });
      const frame = page.locator(`${FILTER} [data-catalog-frame]`);
      await frame.waitFor();
      const read = () => page.evaluate((filter) => ({
        rows: document.querySelectorAll(`${filter} [data-catalog-tier]`).length,
        loading: !!document.querySelector(`${filter} [data-catalog-root][data-loading]`),
        top: Math.round(document.querySelector(`${filter} [data-catalog-frame]`)!.getBoundingClientRect().top),
      }), FILTER);
      const waiting = await read();
      assert.deepEqual({ rows: waiting.rows, loading: waiting.loading }, { rows: 0, loading: true }, JSON.stringify(waiting));
      await page.locator(`${FILTER} [data-catalog-root]:not([data-loading])`).waitFor({ timeout: 10_000 });
      await settle(page);
      const done = await read();
      assert.equal(done.rows, 0);
      assert.ok(Math.abs(done.top - waiting.top) <= 1, `Overlay moved after fetch: ${waiting.top} → ${done.top}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });
});
