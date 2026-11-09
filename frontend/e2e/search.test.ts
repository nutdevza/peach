/* Top-bar search (`search` island, ADR-0031): what is in the dropdown, how the keyboard walks it, and where submit goes.
 *
 * Completion (`/api/suggest`) and search history (`/api/search-history`) each get a stub here, so requests can be counted and
 * what was written inspected; videos and details reuse `item-fixture.ts`. The dropdown's layout (two columns, tabs, cover
 * cells) is measured by `design-people.test.ts`. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, unmanagedScrollers, VIEWPORTS, withPageDiagnostics } from './harness.ts';
import { openItemPage, type ItemVisit } from './item-fixture.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const MENU = '#searchMenu';
const OPTION = `${MENU} [data-search-option]`;

/** 'Nanami' hits one performer and one tag; every other word hits nothing. */
const SUGGEST = {
  q: '七海',
  groups: [
    { kind: 'performer', label: 'Performers', total: 1, items: [
      { value: '七海ひな', n: 12, matched: '', entity_id: 90_001, has_image: false, rep: null, agency: '', works: [] },
    ] },
    { kind: 'tag', label: 'Tags', total: 1, items: [{ value: '七海の夏', n: 3, matched: '' }] },
  ],
};

interface Search extends ItemVisit {
  suggest: URL[];
  /** Search history stored in the stub, most recent first. */
  history: string[];
  posts: { query?: string; operation?: string }[];
}

const fold = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();

async function openSearch(browser: Browser, { limit = 10, history = [] as string[], viewport = DESKTOP } = {}): Promise<Search> {
  const opened = await openItemPage(browser, '/', viewport, {
    settings: { searchHistoryLimit: limit }, ready: '#grid [data-media-card]',
  });
  const { page } = opened;
  const suggest: URL[] = [];
  const stored = [...history];
  const posts: Search['posts'] = [];
  await page.route(/\/api\/suggest\?/, (route) => {
    const url = new URL(route.request().url());
    suggest.push(url);
    const q = url.searchParams.get('q') || '';
    return route.fulfill({ json: q === SUGGEST.q ? SUGGEST : { q, groups: [] } });
  });
  await page.route(/\/api\/search-history/, (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Search['posts'][number];
      posts.push(body);
      const query = body.query || '';
      const kept = stored.filter((value) => fold(value) !== fold(query));
      stored.splice(0, stored.length, ...(body.operation === 'remove' ? kept : [query, ...kept]));
      return route.fulfill({ json: { ok: true } });
    }
    const want = Number(new URL(request.url()).searchParams.get('limit')) || 10;
    return route.fulfill({ json: { items: stored.slice(0, want) } });
  });
  await page.locator(`${MENU} > .peach-react`).waitFor({ state: 'attached', timeout: 15_000 });
  return { ...opened, suggest, history: stored, posts };
}

const values = (page: Page) => page.locator(OPTION).evaluateAll((rows) =>
  rows.map((row) => row.getAttribute('data-search-value')));
const active = (page: Page) => page.locator(OPTION).evaluateAll((rows) =>
  rows.flatMap((row) => (row.hasAttribute('data-active') ? [row.getAttribute('data-search-value')] : [])));
const query = (page: Page) => new URL(page.url()).searchParams.get('q');

async function typeQuery(opened: Search, text = SUGGEST.q) {
  const { page } = opened;
  await page.locator('#q').click();
  await page.keyboard.type(text);
  await withPageDiagnostics(page, () => `Search suggestions (requests ${opened.suggest.map(url => url.search).join(', ')})`,
    () => page.locator(`${OPTION}[data-search-value="七海の夏"]`).waitFor({ timeout: 5_000 }));
}

describe('Top bar search', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });
  it('A failed wait keeps the original error plus the input, focus, and menu state; on success it returns the original result', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.setContent('<input id="q" value="evidence term"><div id="searchMenu">Test suggestion</div>');
      await page.locator('#q').focus();
      const failure = new Error('Original wait failed');
      await assert.rejects(withPageDiagnostics(page, 'Diagnostics fixture', async () => { throw failure }), error => {
        assert.equal((error as Error).cause, failure);
        assert.match((error as Error).message, /原始等待失败/);
        assert.match((error as Error).message, /取证词/);
        assert.match((error as Error).message, /测试建议/);
        assert.match((error as Error).message, /focus/);
        return true;
      });
      assert.equal(await withPageDiagnostics(page, 'Success fixture', async () => 42), 42);
    } finally { await context.close(); }
  });

  for (const viewport of VIEWPORTS) {
    it(`${viewport.name} long search lists use an overlay slider that is draggable, and closing and reopening keeps a single set of tracks`, async () => {
      const opened = await openSearch(browser, { viewport, limit: 30,
        history: Array.from({ length: 30 }, (_, index) => `Search history ${index + 1}`) });
      const { page } = opened;
      try {
        if (viewport.mobile) await page.locator('#searchBtn').click();
        await page.locator('#q').click();
        await page.waitForFunction(() => {
          const menu = document.querySelector<HTMLElement>('#searchMenu')!;
          return menu.dataset.overlayScrollbar === 'true'
            && menu.querySelectorAll('[data-remove-history]').length === 30
            && !menu.querySelector('[data-search-placeholder],[aria-busy="true"]')
            && menu.scrollHeight - menu.clientHeight > 100;
        });
        const track = page.locator(`${MENU} > [data-overlay-track="y"]`);
        await track.waitFor({ state: 'visible' });
        assert.equal(await page.locator(MENU).evaluate(node => getComputedStyle(node).scrollbarWidth), 'none');
        const start = (await track.boundingBox())!;
        await page.locator(MENU).evaluate(node => { node.scrollTop = 100 });
        await page.waitForFunction(() => {
          const menu = document.querySelector<HTMLElement>('#searchMenu')!;
          const track = menu.querySelector<HTMLElement>(':scope > .ov-y')!;
          return Math.abs(menu.scrollTop - 100) <= 1 && !!track.style.transform
            && Math.abs(new DOMMatrixReadOnly(track.style.transform).m42 - menu.scrollTop) <= 1;
        });
        const moved = (await track.boundingBox())!;
        assert.ok(Math.abs(start.y - moved.y) <= 1, 'The track should stay at the visible edge of the dropdown');
        const thumb = (await track.locator('.ovthumb').boundingBox())!;
        await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
        await page.mouse.down();
        await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2 + 40, { steps: 5 });
        await page.mouse.up();
        assert.ok(await page.locator(MENU).evaluate(node => node.scrollTop > 100));
        const beforeWheel = await page.locator(MENU).evaluate(node => node.scrollTop);
        const menuBox = (await page.locator(MENU).boundingBox())!;
        await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2);
        await page.mouse.wheel(0, 140);
        await page.waitForFunction(previous => document.querySelector('#searchMenu')!.scrollTop > previous, beforeWheel);
        await page.keyboard.press('Escape');
        await page.locator(MENU).waitFor({ state: 'hidden' });
        await page.locator('#q').click();
        await track.waitFor({ state: 'visible' });
        assert.equal(await track.count(), 1);
        assert.deepEqual(await unmanagedScrollers(page), []);
        assert.deepEqual(opened.problems, []);
      } catch (error) {
        const state = await page.locator(MENU).evaluate(menu => ({
          history: menu.querySelectorAll('[data-remove-history]').length,
          pending: menu.querySelectorAll('[data-search-placeholder],[aria-busy="true"]').length,
          scrollTop: menu.scrollTop, range: menu.scrollHeight - menu.clientHeight,
          transform: menu.querySelector<HTMLElement>(':scope > .ov-y')?.style.transform,
        })).catch(() => 'Not fetched');
        throw new Error(`${String(error)}; search scroll state: ${JSON.stringify(state)}`, { cause: error });
      } finally { await opened.close(); }
    });

    it(`${viewport.name} collapsing the IME keeps search suggestions, and it closes when focus leaves the search area or the page is tapped`, { timeout: 60_000 }, async () => {
      const opened = await openSearch(browser, { viewport, history: ['Recent searches'] });
      try {
        const { page } = opened;
        if (viewport.mobile) await page.locator('#searchBtn').click();
        await typeQuery(opened);
        await page.locator('#q').evaluate(field => field.blur());
        await page.waitForTimeout(220);
        assert.equal(await page.locator(MENU).isVisible(), true, 'Suggestions stay selectable after the IME closes');
        assert.equal(await page.locator('#q').inputValue(), SUGGEST.q);
        await page.locator('#grid [data-media-title]').first().focus();
        await page.waitForTimeout(220);
        assert.equal(await page.locator(MENU).isVisible(), false, 'Suggestions close when keyboard focus leaves the search area');
        await page.locator('#q').focus();
        await page.locator(MENU).waitFor({ state: 'visible' });
        await page.locator('#q').evaluate(field => field.blur());
        await page.waitForTimeout(220);
        await page.locator('#grid [data-media-title]').first().dispatchEvent('pointerdown');
        await page.locator(MENU).waitFor({ state: 'hidden' });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`${viewport.name} empty search shows video covers, author avatars, and the new release subscription entry`, { timeout: 60_000 }, async () => {
      const opened = await openSearch(browser, { viewport, history: ['Recent searches'] });
      try {
        const { page } = opened;
        // The recommendations column fetches everything in one request: the works one uses the demo library's real results, and the rest are swapped for fixtures that cover every group.
        await page.route(/\/api\/search\/recommendations/, async route => {
          const bundle = await (await route.fetch()).json();
          await route.fulfill({ json: { ...bundle,
            jav: { items: [{ id: 11, asset_id: 11, code: 'ABW-101', title: 'JAV videos', is_jav: true, has_cover: true,
              performer_refs: [{ id: 90001, name: '七海ひな', has_image: true }] }] },
            follow: {
              sources: [{ id: 1, author_key: 'name:author', label: 'Author', ref: 'Author', provider: 'pixiv', official_avatar_url: '/poster?id=11' }],
              groups: [{ primary: { id: 901, source_id: 1, title: 'Followed videos', thumb_url: '/poster?id=11', media_kind: 'video', status: 'saved' },
                variants: [{ id: 902, source_id: 1, title: 'Image videos', thumb_url: '/poster?id=12', media_kind: 'image', status: 'seen',
                  media_items: [{ index: 2, media_kind: 'image', thumb_url: '/poster?id=13' }] }], duplicates: [] }],
            },
            // The author avatar reads the roster row's own address (official first, archive as fallback).
            authors: { items: [{ k: 'Author', key: 'name:author', entity_id: 90002, avatar: '/poster?id=11', avatar_fallback: '' }] },
            feeds: { items: [{ id: 91, code: 'ABW-102', title: 'Subscribe to new releases', has_cover: true }] },
          } });
        });
        // Recommendations are prefetched when the page is idle, before the fixtures are mounted; after mounting, reopen the page once so the prefetch uses the fixtures.
        await page.reload({ waitUntil: 'load' });
        await page.locator(`${MENU} > .peach-react`).waitFor({ state: 'attached', timeout: 15_000 });
        if (viewport.mobile) await page.locator('#searchBtn').click();
        await page.locator('#q').click();
        await page.locator(`${MENU} [data-search-recommendations]`).waitFor();
        // Before the recommendations arrive, the column first holds placeholders laid out in the final layout; only count once all placeholders are swapped for real rows.
        await page.waitForFunction(() => !document.querySelector('#searchMenu [data-search-placeholder]'), undefined, { timeout: 10_000 });
        assert.equal(await page.locator(`${MENU} [data-kind="author"] [data-search-face] img`).count(), 1);
        for (const kind of ['asset', 'jav', 'post', 'photo', 'release']) {
          const cover = page.locator(`${MENU} [data-kind="${kind}"] [data-search-pic] img`).first();
          assert.ok(await cover.count(), `${kind} has no images`);
          const box = await cover.boundingBox();
          assert.ok(box && box.width >= 80, `${kind} did not display as a cover`);
        }
        const overflow = await page.locator(MENU).evaluate(el => ({
          width: el.clientWidth, scrollWidth: el.scrollWidth, right: el.getBoundingClientRect().right,
          viewport: innerWidth,
        }));
        assert.ok(overflow.scrollWidth <= overflow.width + 1);
        assert.ok(overflow.right <= overflow.viewport + 1);
        assert.equal(await page.locator(`${MENU} [data-kind="photo"] h3 a`).getAttribute('href'), '/follow?media=images');
        assert.ok((await page.locator(`${MENU} [data-kind="photo"] [data-search-pic] img`).getAttribute('src'))?.includes('id=13'));
        await page.screenshot({ path: `../build/agent-verification/browser/search-recommendations-${viewport.name}.png` });
        const subscription = page.locator(`${MENU} [data-kind="performer"] h3 a`);
        await subscription.focus();
        await page.waitForTimeout(180);
        assert.equal(await page.locator(MENU).isVisible(), true, 'Keyboard focus inside the menu closes recommendations');
        await subscription.press('Enter');
        await page.waitForURL('**/subscriptions?tab=add');
        assert.ok(!new URL(page.url()).searchParams.has('q'));
      } finally { await opened.close(); }
    });
  }

  for (const viewport of VIEWPORTS) {
    it(`The single-category video preview scrolls; the full results entry can be submitted by keyboard (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openSearch(browser, { viewport });
      try {
        const { page } = opened;
        await page.route(/\/api\/suggest\?/, (route) => {
          const url = new URL(route.request().url());
          const limit = Math.min(53, Number(url.searchParams.get('limit')) || 5);
          const items = Array.from({ length: limit }, (_, i) => ({
            value: `ABF-${i + 1}`, id: i + 1, code: `ABF-${i + 1}`, title: 'Demo video',
            card: { id: 11, code: `ABF-${i + 1}`, is_jav: true, has_cover: true },
          }));
          return route.fulfill({ json: { q: 'abf', groups: [{ kind: 'asset', label: 'Videos', total: 53, items }] } });
        });
        if (viewport.mobile) await page.locator('#searchBtn').click();
        await page.locator('#q').fill('abf');
        await page.locator(`${MENU} [data-search-option="work"]`).first().waitFor({ state: 'visible' });
        assert.equal(await page.locator(`${MENU} [data-search-option="work"]`).count(), 20);
        const geometry = await page.locator(MENU).evaluate((el) => ({
          overflow: el.scrollHeight > el.clientHeight, bottom: el.getBoundingClientRect().bottom,
          viewport: innerHeight, pageScroll: scrollY,
        }));
        assert.ok(geometry.overflow, 'The search panel has no scrollable content');
        assert.ok(geometry.bottom <= geometry.viewport, 'Search panel overflows the viewport');
        await page.locator(MENU).hover();
        await page.mouse.wheel(0, 400);
        await page.waitForFunction(() => document.querySelector('#searchMenu')!.scrollTop > 0);
        assert.equal(await page.evaluate(() => scrollY), geometry.pageScroll, 'Scrolling the search panel scrolls the background page');
        for (let i = 0; i < 21; i++) await page.keyboard.press('ArrowDown');
        const more = page.locator(`${MENU} [data-search-option="more"]`);
        assert.equal(await more.getAttribute('data-active'), '');
        assert.equal(await more.textContent(), 'View all 53 videos');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === 'abf');
        await page.locator(MENU).waitFor({ state: 'hidden' });
      } finally {
        await opened.close();
      }
    });
  }

  it('Typing several characters queries completion once, and the dropdown orders by the backend\'s group sequence', { timeout: 60_000 }, async () => {
    const opened = await openSearch(browser);
    try {
      const { page, suggest } = opened;
      await typeQuery(opened);
      assert.deepEqual(suggest.map((url) => url.searchParams.get('q')), [SUGGEST.q], 'Typing two characters in a row fires completion more than once');
      assert.deepEqual(await page.locator(`${MENU} [data-search-group] > h3`).allTextContents(), ['Performers', 'Tags']);
      assert.deepEqual(await values(page), ['七海ひな', '七海の夏']);
      assert.equal(query(opened.page), null, 'Typing alone should not submit');
    } finally {
      await opened.close();
    }
  });

  it('The soft keyboard enter key is labeled "Search"', { timeout: 60_000 }, async () => {
    const opened = await openSearch(browser);
    try {
      assert.equal(await opened.page.locator('#q').getAttribute('enterkeyhint'), 'search');
    } finally {
      await opened.close();
    }
  });

  it('Arrow keys wrap while choosing; Enter searches the selected entry, records it in search history, and the dropdown collapses', { timeout: 60_000 }, async () => {
    const opened = await openSearch(browser);
    try {
      const { page, posts } = opened;
      await typeQuery(opened);
      assert.deepEqual(await active(page), [], 'Selected the moment it paints');
      for (const [key, want] of [['ArrowDown', '七海ひな'], ['ArrowDown', '七海の夏'], ['ArrowDown', '七海ひな'],
        ['ArrowUp', '七海の夏']] as const) {
        await page.keyboard.press(key);
        assert.deepEqual(await active(page), [want], `After ${key} the wrong item is selected`);
      }
      assert.equal(await page.locator('#q').inputValue(), SUGGEST.q, 'Arrow keys must not alter the input text');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === '七海の夏');
      await page.locator(MENU).waitFor({ state: 'hidden', timeout: 5_000 });
      assert.equal(await page.locator('#q').inputValue(), '七海の夏');
      assert.deepEqual(posts, [{ query: '七海の夏' }]);
      assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'q', 'Focus stays in the input after submitting');
    } finally {
      await opened.close();
    }
  });

  it('The search results page title shows the search term; clicking the sidebar “Home” returns to the home page without a term', { timeout: 60_000 }, async () => {
    const opened = await openSearch(browser);
    try {
      const { page } = opened;
      const title = page.locator('#catalogPageHeading [data-page-title]');
      await typeQuery(opened);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => new URLSearchParams(location.search).has('q'), undefined, { timeout: 5_000 });
      const searched = `Search results: 「${query(page)!}」`;
      await page.waitForFunction(text => document.querySelector('#catalogPageHeading [data-page-title]')?.textContent === text,
        searched, { timeout: 5_000 });
      await page.locator('[data-nav][aria-label="Home"]').first().click();
      await page.waitForFunction(() => !new URLSearchParams(location.search).has('q'), undefined, { timeout: 5_000 });
      assert.equal(await title.textContent(), 'Home');
      assert.equal(await page.locator('#q').inputValue(), '', 'Back on the home page, the search box still holds the term');
    } finally {
      await opened.close();
    }
  });

  it('Enter picks a performer: it opens her profile without a detour through search', { timeout: 60_000 }, async () => {
    const opened = await openSearch(browser);
    try {
      const { page, posts } = opened;
      await typeQuery(opened);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForURL('**/performers/90001');
      assert.equal(query(page), null);
      assert.deepEqual(posts, [{ query: '七海ひな' }], 'The name recorded into search history should be this one');
    } finally {
      await opened.close();
    }
  });

  it('Escape first closes only the dropdown and keeps the text; pressing it again clears the input', { timeout: 60_000 }, async () => {
    const opened = await openSearch(browser);
    try {
      const { page } = opened;
      await typeQuery(opened);
      await page.keyboard.press('Escape');
      await page.locator(MENU).waitFor({ state: 'hidden', timeout: 5_000 });
      assert.equal(await page.locator('#q').inputValue(), SUGGEST.q, 'The first Escape also cleared the text');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'q', 'The first Escape took focus away');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#q').inputValue(), '', 'The second Escape never cleared the text');
      assert.equal(query(page), null, 'Escape must never submit');
    } finally {
      await opened.close();
    }
  });

  it('Enter and arrow keys during composition belong to the IME: no submit, no selection move, no dropdown close', { timeout: 60_000 }, async () => {
    const opened = await openSearch(browser);
    try {
      const { page, posts } = opened;
      await typeQuery(opened);
      await page.locator('#q').evaluate((input) => {
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
        for (const key of ['ArrowDown', 'Enter']) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true }));
        }
      });
      await page.waitForTimeout(300);
      assert.equal(query(page), null, 'Enter during composition submits the search');
      assert.deepEqual(posts, []);
      assert.deepEqual(await active(page), [], 'Arrow keys during composition move the selection');
      assert.equal(await page.locator(MENU).isVisible(), true, 'Enter during IME composition collapses the dropdown');
      await page.locator('#q').evaluate((input) => {
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
      });
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === '七海');
      assert.deepEqual(posts, [{ query: '七海' }]);
    } finally {
      await opened.close();
    }
  });

  it('Search history keeps the configured number of entries; deleting one removes only that entry and the dropdown and focus stay; newly searched terms go first', { timeout: 60_000 }, async () => {
    const opened = await openSearch(browser, { limit: 3, history: ['Alpha video', 'Beta video', 'Gamma video', 'Delta video'] });
    try {
      const { page, posts, history } = opened;
      const recent = () => page.locator(`${MENU} [data-search-group]`, { hasText: 'Search history' })
        .locator('[data-search-option]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-search-value')));
      await page.locator('#q').click();
      await page.locator(`${OPTION}[data-search-value="Gamma video"]`).waitFor({ timeout: 5_000 });
      assert.deepEqual(await recent(), ['Alpha video', 'Beta video', 'Gamma video'], 'Search history does not show only three entries as configured');
      await page.locator(`${MENU} [data-remove-history="Beta video"]`).click();
      await page.waitForFunction(() => !document.querySelector('#searchMenu [data-search-value="B-movies"]'));
      assert.deepEqual(await recent(), ['Alpha video', 'Gamma video']);
      assert.deepEqual(posts, [{ operation: 'remove', query: 'Beta video' }]);
      await page.waitForTimeout(300);
      assert.equal(await page.locator(MENU).isVisible(), true, 'Deleting one record collapsed the dropdown');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'q', 'Deleting one record stole focus');
      await page.keyboard.type('Epsilon video');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === 'Epsilon video');
      assert.deepEqual(posts.at(-1), { query: 'Epsilon video' });
      assert.deepEqual(history.slice(0, 3), ['Epsilon video', 'Alpha video', 'Gamma video']);
      await page.locator('#q').evaluate((input: HTMLInputElement) => { input.value = ''; });
      await page.locator('#q').click();
      await page.locator(`${OPTION}[data-search-value="Epsilon video"]`).waitFor({ timeout: 5_000 });
      assert.deepEqual(await recent(), ['Epsilon video', 'Alpha video', 'Gamma video']);
    } finally {
      await opened.close();
    }
  });
});
