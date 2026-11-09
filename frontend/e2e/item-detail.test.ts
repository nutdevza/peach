/* The video details island (`item-detail`) in a real browser: entering and leaving from catalog cards, deep links, back to
 * details and which page closing returns to after refresh, closing back to the list page after a playlist switched entries,
 * the stage mounting Video.js in the media frame,
 * offline notice, co-star collapse, title folding, rating and tag undo, feedback key states, the four queues, playlist
 * ordering and removal, saving a Mix, Continue watching, entity page entries and phone layout.
 *
 * Stub data in `item-fixture.ts`; all read and write endpoints are caught by stubs, and the demo library database is never
 * written. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { layout, launch, VIEWPORTS } from './harness.ts';
import { CATALOG, EDITIONS, ITEM, NAMES, PARTS, PLAYLIST, RELATED, card as itemCard, openItemPage } from './item-fixture.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const MOBILE = VIEWPORTS.find((viewport) => viewport.mobile)!;
const DETAIL_READY = '#stage[open] [data-item-side]';
/** In the main grid, a card's title opens volumes; for the same entry in the portrait strip, the title enters immersive. */
const PART_CARD = `#grid [data-media-card][data-variant="grid"][data-id="${ITEM.part}"] [data-media-text] > button[data-media-title][data-open]`;
/** The stub stream has no actual feature; the player reports a VIDEOJS error on the empty response. That is not what is being measured. */
const withoutPlayer = (problems: string[]) => problems.filter((line) => !line.includes('VIDEOJS'));
const pathIs = (page: Page, path: string) => page.waitForFunction(
  (wanted) => (wanted.includes('?') ? location.pathname + location.search : location.pathname) === wanted, path, { timeout: 10_000 });
/** The receipt stack sits under body, the stage is a modal dialog, and the page outside is inert, so the mouse cannot reach the undo key; this measures undo itself. */
const undo = (page: Page) => page.locator('#toasts').getByRole('button', { name: 'Undo' }).last().dispatchEvent('click');
const current = (page: Page) => page.locator('#stage [data-queue-item][aria-current="true"]').getAttribute('data-queue-item');
const ids = (page: Page, selector: string, attribute: string) => page.locator(selector).evaluateAll(
  (nodes, name) => nodes.map((node) => Number(node.getAttribute(name))), attribute);


/** Before swapping, record the stage node and keep watching the skeleton: on an in-place swap the overlay stays the same node, never falls back to the skeleton mid-way, and focus stays inside the overlay. */
const watchStage = (page: Page) => page.evaluate(() => {
  const watch = { stage: document.getElementById('stage'), skeleton: false, heights: [] as number[] };
  const sample = () => {
    const media = document.querySelector('#stage [data-stage-media]');
    if (media) watch.heights.push(media.getBoundingClientRect().height);
    if (watch.heights.length < 120) requestAnimationFrame(sample);
  }; sample();
  new MutationObserver(() => { if (document.querySelector('#stage [data-skeleton="detail"]')) watch.skeleton = true })
    .observe(document.body, { childList: true, subtree: true });
  Object.assign(window, { stageWatch: watch });
});
const stageKept = (page: Page) => page.evaluate(() => {
  const watch = (window as unknown as { stageWatch: { stage: Element | null; skeleton: boolean; heights: number[] } }).stageWatch;
  if (Math.max(...watch.heights) - Math.min(...watch.heights) > 1)
    throw new Error(`The watch switch frame height is unstable: ${JSON.stringify(watch.heights)}`);
  return { same: document.getElementById('stage') === watch.stage, skeleton: watch.skeleton,
    focused: !!watch.stage?.contains(document.activeElement) };
});

describe('Video details island', () => {
  let browser: Browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser.close();
  });

  it('Recommendation loading keeps details height stable, with reason and hover radius fitting the default viewport', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    let release = () => {};
    try {
      const page = opened.page;
      let requested!: () => void;
      const received = new Promise<void>(resolve => { requested = resolve });
      const waiting = new Promise<void>(resolve => { release = resolve });
      await page.route(url => url.pathname === '/api/related', async route => {
        requested();
        await waiting;
        await route.fulfill({ json: { items: RELATED.map(id => ({ ...itemCard(id), why: 'Similar tags' })) } });
      });
      await page.reload();
      await received;
      const media = page.locator('#stage [data-item-media]');
      const initialHeight = await media.evaluate(node => node.getBoundingClientRect().height);
      release();
      const reasons = '#stage [data-item-related] [aria-label^="View recommendation reasons"]';
      await page.locator(reasons).first().waitFor();
      const visible = () => page.waitForFunction(selector => {
        const scroll = document.querySelector('#stage [data-stage-scroll]')!;
        const bottom = scroll.getBoundingClientRect().bottom;
        return scroll.scrollTop === 0 && [...document.querySelectorAll(selector)]
          .every(reason => reason.getBoundingClientRect().bottom <= bottom + 1);
      }, reasons);
      await visible();
      const finalHeight = await media.evaluate(node => node.getBoundingClientRect().height);
      assert.ok(Math.abs(initialHeight - finalHeight) <= 1, `${initialHeight} → ${finalHeight}`);
      const card = page.locator('#stage [data-item-related] [data-media-card]').first();
      await card.hover();
      const shape = await card.evaluate(node => ({
        shadow:getComputedStyle(node).boxShadow,
        outer:parseFloat(getComputedStyle(node,'::before').borderTopLeftRadius),
        inner:parseFloat(getComputedStyle(node).getPropertyValue('--surface-radius')),
        height:node.getBoundingClientRect().height,
      }));
      assert.equal(shape.shadow, 'none');
      assert.equal(shape.outer, shape.inner + 8);
      assert.ok(shape.height < 220, JSON.stringify(shape));
      await page.locator('#stage [data-item-related] h3').evaluate(node => {
        node.textContent = 'Continue watching '.repeat(60);
      });
      await visible();
      await page.setViewportSize({ width: 1280, height: 720 });
      await visible();
      assert.deepEqual((await layout(page)).offenders, []);
    } finally { release(); await opened.close() }
  });

  for (const viewport of VIEWPORTS) it(`The local tag picker reuses the overlay scrollbar (${viewport.name})`, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, viewport);
    try {
      const { page } = opened;
      await page.locator('#stage [data-tag-plus]').evaluate(node => node.scrollIntoView({ block:'center', behavior:'instant' }));
      await page.locator('#stage [data-tag-plus]').click();
      const menu = page.locator('#stage [data-tag-picker]');
      await menu.waitFor({ state:'visible' });
      const scrollbar = await menu.locator('[data-tag-body]').evaluate(node => ({
        hidden:getComputedStyle(node).scrollbarWidth,
        track:!!node.parentElement?.querySelector('.ovtrack.ov-y'),
        positioned:getComputedStyle(node.parentElement!).position,
      }));
      assert.deepEqual(scrollbar, { hidden:'none', track:true, positioned:'relative' });
    } finally { await opened.close(); }
  });

  for (const kind of ['parts', 'editions'] as const) for (const count of [1, 2, 3]) {
    it(`${kind} queue: the ${count} cards get space by content, and recommendation cards align at equal width`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, '/', DESKTOP, { ready: '#grid [data-media-card]' });
      try {
        const page = opened.page;
        const seed = kind === 'parts' ? ITEM.part : ITEM.edition;
        const group = kind === 'parts' ? PARTS : EDITIONS;
        await page.route(url => url.pathname === `/api/${kind}`, route => route.fulfill({ json: {
          ...group, items: Array.from({ length: count }, (_, index) => ({ ...group.items[index % group.items.length], id: seed + index })),
        } }));
        await page.goto(new URL(`/assets/${seed}?${kind}=${seed}`, page.url()).toString());
        await page.locator('#stage [data-queue-row]').first().waitFor();
        await page.locator('#stage [data-item-related] [data-media-card]').first().waitFor();
        const measured = await page.locator('[data-detail-continuation]').evaluate(node => {
          const queue = node.querySelector('[data-mix-queue]')!.getBoundingClientRect();
          const cards = [...node.querySelectorAll('[data-queue-row]')].map(card => card.getBoundingClientRect());
          const related = node.querySelector('[data-item-related] [data-media-card]')!.getBoundingClientRect();
          return { width: queue.width, full: node.getBoundingClientRect().width, cards: cards.map(card => ({ width: card.width, y: card.y })), related: { width: related.width, y: related.y } };
        });
        const width = measured.cards[0]!.width;
        if (count < 3) assert.ok(Math.abs(measured.width - (count * width + (count - 1) * 10 + 28)) < 1, JSON.stringify(measured));
        else assert.ok(Math.abs(measured.width - measured.full / 2) < 1, JSON.stringify(measured));
        assert.ok(measured.cards.every(card => Math.abs(card.width - measured.related.width) < 1 && Math.abs(card.y - measured.related.y) < 1), JSON.stringify(measured));
        if (count === 2) await page.screenshot({ path: `../build/detail-two-${kind}.png` });
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally { await opened.close() }
    });
  }

  for (const destination of ['/tasks', '/performers']) {
    it(`Going back to ${destination} while volumes await a response: the stage withdraws, and a late response cannot change the address or history depth`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, '/', DESKTOP, { ready: PART_CARD, catalogIds: [...CATALOG, ITEM.part] });
      let release = () => {};
      try {
        const page = opened.page;
        await page.evaluate(async (path) => {
          const moduleUrl = '/dist/peach-app.js';
          const { peachHistory } = await import(moduleUrl);
          peachHistory.push(path);
        }, destination);
        await pathIs(page, destination);
        await page.evaluate(async () => { const moduleUrl = '/dist/peach-app.js'; (await import(moduleUrl)).peachHistory.push('/') });
        await page.locator(PART_CARD).waitFor();
        const depth = await page.evaluate(() => history.length);
        let arrived = () => {};
        const requested = new Promise<void>(resolve => { arrived = resolve });
        const gate = new Promise<void>(resolve => { release = resolve });
        let finished = () => {};
        const responded = new Promise<void>(resolve => { finished = resolve });
        await page.route((url) => url.pathname === '/api/parts', async route => {
          arrived();
          await gate;
          try { await route.fallback() }
          catch (error) { assert.match(route.request().failure()?.errorText || '', /ERR_ABORTED/, String(error)) }
          finally { finished() }
        });
        await page.locator(PART_CARD).click();
        await requested;
        await page.locator('#stage[open]').waitFor();
        assert.equal(await page.evaluate(() => location.pathname), '/');
        assert.equal(await page.evaluate(() => history.length), depth, 'While the queue is incomplete there are no temporary history entries');
        await page.goBack();
        await pathIs(page, destination);
        await page.waitForFunction(() => !document.querySelector('#stage[open]'));
        const seq = await page.evaluate(async () => { const moduleUrl = '/dist/peach-app.js'; return (await import(moduleUrl)).peachHistory.navigation.seq });
        release();
        await responded;
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#stage[open]').count(), 0);
        assert.equal(await page.evaluate(() => location.pathname), destination);
        assert.equal(await page.evaluate(() => history.length), depth);
        assert.equal(await page.evaluate(async () => { const moduleUrl = '/dist/peach-app.js'; return (await import(moduleUrl)).peachHistory.navigation.seq }), seq);
        assert.deepEqual(opened.stub.writes, []);
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally { release(); await opened.close() }
    });
  }

  it('Replaying the source page POP in the same task as clicking a volume: the queue intent fetches nothing, lays no stage and writes no entry', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, '/', DESKTOP, { ready: PART_CARD, catalogIds: [...CATALOG, ITEM.part] });
    try {
      const page = opened.page;
      const depth = await page.evaluate(() => history.length);
      await page.locator(PART_CARD).evaluate(node => {
        (node as HTMLElement).click();
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      });
      await page.waitForTimeout(500);
      assert.equal(opened.stub.reads.get('/api/parts') || 0, 0);
      assert.equal(await page.locator('#stage[open]').count(), 0);
      assert.deepEqual(await page.evaluate(() => [location.pathname, history.length]), ['/', depth]);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally { await opened.close() }
  });

  it('The first stage host attach replays the source page POP: even an old queue request whose package already arrived cannot open the stage', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, '/', DESKTOP, { ready: PART_CARD, catalogIds: [...CATALOG, ITEM.part] });
    try {
      const page = opened.page;
      assert.equal(await page.locator('[data-stage-host]').count(), 0);
      const depth = await page.evaluate(() => history.length);
      await page.evaluate(() => {
        const append = document.body.append.bind(document.body);
        document.body.append = (...nodes: (Node | string)[]) => {
          append(...nodes);
          if (nodes.some(node => node instanceof HTMLElement && node.hasAttribute('data-stage-host'))) {
            document.body.append = append;
            document.body.dataset.queueStagePop = '1';
            window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
          }
        };
      });
      await page.locator(PART_CARD).click();
      await page.locator('body[data-queue-stage-pop]').waitFor({ state: 'attached' });
      await page.waitForTimeout(500);
      assert.equal(opened.stub.reads.get('/api/parts') || 0, 0);
      assert.equal(await page.locator('#stage[open]').count(), 0);
      assert.deepEqual(await page.evaluate(() => [location.pathname, history.length]), ['/', depth]);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally { await opened.close() }
  });

  it('Clicking a card in the catalog opens details: the address becomes that item; closing back to the list does not refetch', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, '/', DESKTOP, { ready: `#grid [data-media-card][data-id="${ITEM.plain}"]` });
    try {
      const page = opened.page;
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.route(/\/api\/item\?/, async route => {
        await new Promise(resolve => setTimeout(resolve, 400));
        await route.fallback();
      });
      await page.evaluate(() => {
        const heights: number[] = [];
        Object.assign(window, { coldCatalogHeights: heights });
        const sample = () => {
          const dialog = document.querySelector<HTMLDialogElement>('#stage[open]');
          if (dialog) heights.push(dialog.clientHeight);
          if (heights.length < 180) requestAnimationFrame(sample);
        }; requestAnimationFrame(sample);
      });
      const listed = opened.stub.reads.get('/api/items') || 0;
      const backgroundPlayState=()=>page.locator('.top .search').first().evaluate(
        node=>getComputedStyle(node).animationPlayState);
      const initialPlayState=await backgroundPlayState();
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"] [data-media-title]`).first().click();
      await pathIs(page, `/assets/${ITEM.plain}`);
      await page.locator(DETAIL_READY).waitFor();
      const heights = await page.evaluate(() => (window as unknown as { coldCatalogHeights: number[] }).coldCatalogHeights);
      assert.ok(heights.length > 5 && Math.max(...heights) - Math.min(...heights) < 1, JSON.stringify(heights));
      assert.ok((await backgroundPlayState()).split(',').every(state=>state.trim()==='paused'));
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'closeStage', 'When content arrives, focus is not on the close button');
      await page.locator('#closeStage').click();
      await pathIs(page, '/');
      await page.locator('#stage[open]').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
      assert.equal(await page.locator('#stage[open]').count(), 0);
      assert.equal(await backgroundPlayState(),initialPlayState,'Closing details restores the background animation state');
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"]`).first().waitFor();
      assert.equal(opened.stub.reads.get('/api/items') || 0, listed, 'Closing details returns to the list and refetches');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('A deep link into details fetches that item singly; closing backfills the list per the address', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      assert.equal(opened.stub.reads.get('/api/item'), 1);
      await page.locator('#closeStage').click();
      await pathIs(page, '/');
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"]`).first().waitFor({ timeout: 15_000 });
      assert.ok((opened.stub.reads.get('/api/items') || 0) >= 1, 'After the deep link closes, the list is not refetched to catch up');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Going back to details then closing: it returns to the page this item opened over, with address and picture in agreement', { timeout: 90_000 }, async () => {
    const opened = await openItemPage(browser, '/trash', DESKTOP, { ready: `#grid [data-media-card][data-id="${ITEM.plain}"]` });
    try {
      const page = opened.page;
      const openCard = async (id: number) => {
        await page.locator(`#grid [data-media-card][data-id="${id}"] [data-media-title]`).first().click();
        await pathIs(page, `/assets/${id}`);
        await page.locator(DETAIL_READY).waitFor();
      };
      await openCard(ITEM.plain);
      await page.locator('#closeStage').click();
      await pathIs(page, '/trash');
      await page.locator('[data-nav=""]:visible').first().click();
      await pathIs(page, '/');
      await page.locator(`#grid [data-media-card][data-id="${ITEM.cast}"]`).first().waitFor({ timeout: 15_000 });
      await openCard(ITEM.cast);
      for (const path of ['/', '/trash', `/assets/${ITEM.plain}`]) {
        await page.goBack();
        await pathIs(page, path);
      }
      await page.locator(DETAIL_READY).waitFor();
      await page.locator('#closeStage').click();
      await pathIs(page, '/trash');
      await page.locator('#stage[open]').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
      assert.equal(await page.locator('#stage[open]').count(), 0);
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"]`).first().waitFor();
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('A refresh landing on details does not read the origin recorded on the entry: the catalog grid paints underneath, and closing returns home', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, '/trash', DESKTOP, { ready: `#grid [data-media-card][data-id="${ITEM.plain}"]` });
    try {
      const page = opened.page;
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"] [data-media-title]`).first().click();
      await pathIs(page, `/assets/${ITEM.plain}`);
      await page.locator(DETAIL_READY).waitFor();
      assert.deepEqual(await page.evaluate(() => history.state?.usr?.backgroundLocation), { pathname: '/trash', search: '' });
      await page.reload({ waitUntil: 'load' });
      await page.locator(DETAIL_READY).waitFor({ timeout: 15_000 });
      await page.locator('#closeStage').click();
      await pathIs(page, '/');
      await page.locator(`#grid [data-media-card][data-id="${ITEM.plain}"]`).first().waitFor({ timeout: 15_000 });
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Switching items in a playlist then closing returns to the list page and refetches; going back to one item then closing does the same', { timeout: 90_000 }, async () => {
    const opened = await openItemPage(browser, '/', DESKTOP, { ready: `#grid [data-media-card][data-id="${ITEM.plain}"]` });
    try {
      const page = opened.page;
      let listed = 0;
      // The list summary reflects the resume point successfully written; after closing, both the card and reopening should use it.
      await page.route((url) => url.pathname === '/api/playlists', (route) => {
        listed += 1;
        const progress = opened.stub.writes.findLast(write => write.url === '/api/playlist'
          && write.body.action === 'progress' && write.body.id === PLAYLIST.id);
        const current = Number(progress?.body.asset_id || PLAYLIST.items[0]);
        return route.fulfill({ json: { items: [{
          id: PLAYLIST.id, name: PLAYLIST.name, item_count: PLAYLIST.items.length,
          current_asset_id: current, preview_asset_id: current,
        }] } });
      });
      await page.goto(new URL('/playlists', page.url()).toString(), { waitUntil: 'load' });
      const card = page.locator(`[data-playlist-card="${PLAYLIST.id}"]`);
      const step = async (id: number) => {
        await page.locator(`#stage [data-queue-item="${id}"]`).click();
        await pathIs(page, `/assets/${id}?playlist=${PLAYLIST.id}`);
        await page.locator(`#stage [data-queue-item="${id}"][aria-current="true"]`).waitFor();
      };
      const enter = async (resume: number) => {
        await card.locator('[data-mix-open]').click();
        await pathIs(page, `/assets/${resume}?playlist=${PLAYLIST.id}`);
        await page.locator(DETAIL_READY).waitFor();
        await step(PLAYLIST.items[1]!);
        await step(PLAYLIST.items[2]!);
      };
      const closeToList = async (resume: number) => {
        const before = listed;
        await page.locator('#closeStage').click();
        await pathIs(page, '/playlists');
        await page.locator('#stage[open]').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
        await card.waitFor();
        assert.equal(await page.locator('#stage[open]').count(), 0);
        for (const deadline = Date.now() + 10_000; listed <= before && Date.now() < deadline;) await page.waitForTimeout(50);
        assert.ok(listed > before, 'After closing the list page never reread');
        await card.locator(`img[src*="id=${resume}&"]`).first().waitFor();
      };
      await card.waitFor({ timeout: 15_000 });
      await enter(PLAYLIST.items[0]!);
      await closeToList(PLAYLIST.items[2]!);
      await enter(PLAYLIST.items[2]!);
      await page.goBack();
      await pathIs(page, `/assets/${PLAYLIST.items[1]}?playlist=${PLAYLIST.id}`);
      await page.locator(`#stage [data-queue-item="${PLAYLIST.items[1]}"][aria-current="true"]`).waitFor();
      await page.locator(DETAIL_READY).waitFor();
      await closeToList(PLAYLIST.items[1]!);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('The stage mounts Video.js inside the media frame; the ambient light canvas and stat badge join it in the same media area', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#stage [data-item-media="video"] > .video-js video.vjs-tech').waitFor({ state: 'attached' });
      const shape = await page.evaluate(() => {
        const media = document.querySelector('#stage [data-item-media="video"]')!;
        return { id: media.querySelector(':scope > .video-js')!.id, canvas: !!media.querySelector(':scope > [data-ambient-canvas]'),
          stats: !!media.querySelector('#playerStatsBtn'), videos: media.querySelectorAll('video').length };
      });
      assert.deepEqual(shape, { id: 'vid', canvas: true, stats: true, videos: 1 });
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Source unreadable: a note block replaces the player, and after a status refresh the read result shows', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.offline}`, DESKTOP);
    try {
      const page = opened.page;
      const gate = page.locator('#stage [data-item-gate="offline"]');
      assert.match(await gate.innerText(), /媒体目录无法访问/);
      assert.equal(await page.locator('#stage .vjs-tech').count(), 0, 'A dead-link entry mounted a player');
      await page.locator('#offlineRetry').click();
      await page.locator('#offlineRetry', { hasText: 'Still unreadable · refresh' }).waitFor();
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`${viewport.mobile ? 'Phone' : 'Desktop'} source states: permission reasons stay visible, and an unfetched state is never judged a dead link`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, `/assets/${ITEM.offline}`, viewport);
      try {
        const page = opened.page;
        let online: boolean | null = false;
        await page.route((url) => url.pathname === '/api/sources', (route) => route.fulfill({ json: {
          sources: [{ location: 'local', online: true }, { location: '115', online,
            state: online === false ? 'permission_denied' : 'timeout',
            message: online === false ? 'CloudDrive · 115: no read permission' : 'CloudDrive · 115: probe did not respond' }],
        } }));
        await page.reload({ waitUntil: 'load' });
        await page.locator(DETAIL_READY).waitFor();
        assert.match(await page.locator('#stage [data-item-gate="offline"]').innerText(), /没有权限读取/);
        online = null;
        await page.reload({ waitUntil: 'load' });
        await page.locator(DETAIL_READY).waitFor();
        assert.equal(await page.locator('#stage [data-item-gate="offline"]').count(), 0);
        assert.equal(await page.locator('body.offline-source').count(), 0);
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally {
        await opened.close();
      }
    });
  }

  for (const viewport of [DESKTOP, MOBILE]) {
  it(`${viewport.name}: casts over 8 people collapse first, and clicking "N more people" expands them all`, { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.cast}`, viewport);
    try {
      const page = opened.page;
      const shown = () => page.locator('#stage [data-item-identity] [data-entity-kind="performer"]:visible').count();
      assert.equal(await shown(), 8);
      assert.equal((await page.locator('#castMore').innerText()).trim(), `${NAMES.length - 8} more`);
      const button = page.getByRole('button', { name: `${NAMES.length - 8} more` });
      const appearance = await button.evaluate((node) => {
        const style = getComputedStyle(node);
        return { border: style.borderTopStyle, width: parseFloat(style.borderTopWidth),
          background: style.backgroundColor, icon: !!node.querySelector('svg'), height: node.getBoundingClientRect().height };
      });
      assert.equal(appearance.border, 'solid');
      assert.ok(appearance.width >= 1);
      assert.notEqual(appearance.background, 'rgba(0, 0, 0, 0)');
      assert.equal(appearance.icon, true);
      assert.ok(appearance.height >= 32);
      const centers = await button.evaluate((node) => {
        const own = node.getBoundingClientRect();
        const siblings = [...node.parentElement!.querySelectorAll<HTMLElement>('[data-id-cell]:not([hidden])')]
          .map((cell) => cell.getBoundingClientRect()).filter((cell) => cell.top < own.bottom && cell.bottom > own.top);
        return { margin: getComputedStyle(node).marginTop,
          delta: siblings.map((cell) => own.top + own.height / 2 - cell.top - cell.height / 2) };
      });
      assert.equal(centers.margin, '0px', 'The expand button should vertically center within the cast row');
      assert.ok(centers.delta.every((delta) => Math.abs(delta) < 1), JSON.stringify(centers));
      await button.focus();
      await page.keyboard.press('Enter');
      assert.equal(await shown(), NAMES.length);
      assert.equal(await page.locator('#castMore').count(), 0);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });
  }

  it('The title wraps to two lines and the expand button appears only on real overflow; both the button and the title text expand, and clicking again collapses', { timeout: 60_000 }, async () => {
    const short = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      assert.equal(await short.page.locator('#stage [data-title-fold]').isHidden(), true);
    } finally {
      await short.close();
    }
    const opened = await openItemPage(browser, `/assets/${ITEM.long}`, DESKTOP);
    try {
      const page = opened.page;
      const title = page.locator('#stage [data-detail-title]');
      const fold = page.locator('#stage [data-title-fold]');
      const lines = () => title.evaluate((node) => Math.round(node.clientHeight / parseFloat(getComputedStyle(node).lineHeight)));
      assert.equal(await fold.isVisible(), true);
      assert.equal(await lines(), 2);
      await fold.click();
      assert.equal(await fold.getAttribute('aria-label'), 'Collapse title');
      assert.ok(await lines() > 2, 'After expanding the whole title is there');
      await title.click();
      assert.equal(await fold.getAttribute('aria-label'), 'Expand title');
      assert.equal(await lines(), 2);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Rating: clicking the current star clears the rating; the receipt\'s undo writes back the original score', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      const value = page.locator('#detailRating [data-rating-value]');
      assert.equal((await value.innerText()).trim(), '3 stars');
      await page.locator('#detailRating [data-rate="3"]').click();
      await page.locator('#detailRating [data-rating-value]', { hasText: 'Unrated' }).waitFor();
      assert.equal(await page.locator('#detailRating [data-on="true"]').count(), 0);
      await undo(page);
      await page.locator('#detailRating [data-rating-value]', { hasText: '3 stars' }).waitFor();
      assert.deepEqual(opened.stub.writes.filter((write) => write.url === '/api/feedback').map((write) => write.body), [
        { id: ITEM.plain, kind: 'rate', value: 0 },
        { id: ITEM.plain, kind: 'rate', value: 60 },
      ]);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Tags: delete one and undo it back; create a new one from the selector', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      const tag = (name: string) => page.locator(`#detailTags [data-tag="${name}"]`);
      await page.locator('#detailTags [data-remove-tag="Drama"]').click();
      await tag('Drama').waitFor({ state: 'detached' });
      await undo(page);
      await tag('Drama').waitFor();
      await page.locator('#tagPlus').click();
      await page.locator('#tagPicker:not([hidden])').waitFor();
      await page.locator('#tagPickSearch').fill('The newly created tag');
      await page.locator('#tagPicker [data-pick="New tag"]', { hasText: 'Created "New tag"' }).waitFor();
      await page.locator('#tagPickSearch').press('Enter');
      await tag('The newly created tag').waitFor();
      assert.equal(await page.locator('#tagPicker').isHidden(), true, 'After adding a tag the picker never collapsed');
      assert.deepEqual(opened.stub.writes.filter((write) => write.url === '/api/item-tag').map((write) => write.body), [
        { id: ITEM.plain, operation: 'remove', tag: 'Drama' },
        { id: ITEM.plain, operation: 'add', tag: 'Drama' },
        { id: ITEM.plain, operation: 'add', tag: 'The newly created tag' },
      ]);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`${viewport.name} details actions stay on one line with tooltips on the popover's top layer`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, viewport);
      try {
        const page = opened.page;
        const actions = page.locator('#stage [data-item-feedback] button');
        const rects = await actions.evaluateAll(nodes => nodes.map(node => {
          const r = node.getBoundingClientRect(); return { top: r.top, width: r.width };
        }));
        assert.equal(rects.length, 8);
        assert.equal(await page.locator('#stage [data-fb="cloud-download"]').count(), 0);
        assert.ok(Math.max(...rects.map(r => r.top)) - Math.min(...rects.map(r => r.top)) <= 1);
        assert.ok(rects.every(r => r.width >= 30));
        await actions.first().scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await actions.first().focus();
        const tip = page.locator('#board-control-tooltip');
        await tip.waitFor({state:'visible'});
        assert.equal(await tip.evaluate(node => node.matches(':popover-open')), true);
        assert.equal(await tip.evaluate(node => node.closest('dialog')?.id), 'stage');
        const r = await tip.boundingBox();
        assert.ok(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width && r.y + r.height <= viewport.height);
        await actions.first().evaluate(node => (node as HTMLElement).blur());
        assert.equal(await tip.isHidden(), true);
      } finally { await opened.close() }
    });
  }

  it('Watch later and feedback keys: after writing, the key state follows the server\'s response', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#stageLater').click();
      await page.locator('#stageLater[aria-pressed="true"]').waitFor();
      await page.locator('#stage [data-kind="dislike"]').click();
      await page.locator('#stage [data-kind="dislike"][aria-pressed="true"]').waitFor();
      await page.locator('#stage [data-kind="seen"]').click();
      await page.locator('#stage [data-kind="seen"][aria-pressed="true"]').waitFor();
      assert.equal(await page.locator('#stage [data-kind="dislike"]').getAttribute('aria-pressed'), 'false', 'Watched and not-my-taste glow at the same time');
      assert.deepEqual(opened.stub.writes.map((write) => [write.url, write.body.kind ?? null]), [
        ['/api/watch-later', null], ['/api/feedback', 'dislike'], ['/api/feedback', 'seen'],
      ]);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`${viewport.name} full files and repaired volumes share one card, and the edition queue only continues into the next volume of the same edition`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, '/', viewport, { catalogIds: [ITEM.edition], ready: '#grid [data-media-card]' });
      try {
        const page = opened.page;
        const full = await page.evaluate(async id => (await fetch(`/api/item?id=${id}`)).json(), ITEM.edition);
        const repair = await page.evaluate(async () => (await fetch('/api/item?id=32')).json());
        const edition_group = { key: 'PCH-031', seed_id: 31, count: 2, editions: ['1080p', '4K repair'] };
        const part_group = { key: 'PCH-031:32', seed_id: 32, count: 2 };
        const files = [
          { ...full, edition_group, edition_label: '1080p', version_id: 31 },
          { ...repair, edition_group, part_group, edition_label: '4K repair', version_id: 32, part_label: '1' },
          { ...repair, id: 33, edition_group, part_group, edition_label: '4K repair', version_id: 32, part_label: '2' },
        ];
        await page.route(url => url.pathname === '/api/item', route => {
          const file = files.find(row => row.id === Number(new URL(route.request().url()).searchParams.get('id')));
          return file ? route.fulfill({ json: file }) : route.fallback();
        });
        await page.route(url => url.pathname === '/api/editions', route => route.fulfill({ json: { title: 'PCH-031', count: 2, items: files } }));
        await page.route(url => url.pathname === '/api/items', route => route.fulfill({ json: {
          items: [files[2], files[0], files[1]].map(row => ({ ...row, tags: row.tags.map((tag: { k: string }) => tag.k) })),
          total: 3, work_total: 1, has_more: false,
        } }));
        await page.reload({ waitUntil: 'load' });
        const card = page.locator('#grid [data-media-card][data-variant="grid"]');
        await card.first().waitFor();
        assert.equal(await card.count(), 1);
        assert.deepEqual(await card.locator('[data-media-group]').allTextContents(), ['2 editions']);
        await card.locator('[data-media-title]').click();
        await pathIs(page, '/assets/33?editions=31');
        await page.locator('#stage [data-queue-item="33"][aria-current="true"]').waitFor();
        assert.equal(await page.locator('#stage [data-queue-item]').count(), 3);
        assert.equal(await page.locator('#stage').getByText('2 editions', { exact: true }).count(), 1);
        await page.locator('#stage [data-queue-item="32"]').click();
        await page.locator('#stage [data-queue-item="32"][aria-current="true"]').waitFor();
        await page.locator('#stage video.vjs-tech').dispatchEvent('ended');
        await pathIs(page, '/assets/33?editions=31');
        await page.locator('#stage [data-queue-item="33"][aria-current="true"]').waitFor();
        await page.locator('#stage video.vjs-tech').dispatchEvent('ended');
        assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, '/assets/33?editions=31');
        const bounds = await layout(page);
        assert.ok(bounds.scrollWidth <= bounds.viewportWidth + 1, JSON.stringify(bounds));
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally {
        await opened.close();
      }
    });
  }

  for (const [kind, path, next, wanted] of [
    ['Mix', `/assets/${ITEM.plain}?mix=${ITEM.plain}`, 14, `/assets/14?mix=${ITEM.plain}`],
    ['Volumes', `/assets/22?parts=${ITEM.part}`, 23, `/assets/23?parts=${ITEM.part}`],
    ['Editions', `/assets/${ITEM.edition}?editions=${ITEM.edition}`, 32, `/assets/32?editions=${ITEM.edition}`],
    ['Playlists', `/assets/11?playlist=${PLAYLIST.id}`, 15, `/assets/15?playlist=${PLAYLIST.id}`],
  ] as const) {
    it(`${kind} queue: a deep link lands on the given item, clicking another swaps in place without refetching the queue`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, path, DESKTOP);
      try {
        const page = opened.page;
        assert.equal(await current(page), new URL(path, page.url()).pathname.split('/').at(-1));
        const reads = new Map(opened.stub.reads);
        await watchStage(page);
        await page.locator(`#stage [data-queue-item="${next}"]`).click();
        await pathIs(page, wanted);
        await page.locator(`#stage [data-queue-item="${next}"][aria-current="true"]`).waitFor();
        await page.locator(DETAIL_READY).waitFor();
        assert.deepEqual(await stageKept(page), { same: true, skeleton: false, focused: true }, `Switching items in the ${kind} queue reopened the popover`);
        if (kind === 'Volumes') assert.match(await page.locator('#stage [data-detail-title]').innerText(), /第 3 卷/);
        for (const url of ['/api/parts', '/api/editions', '/api/related']) {
          assert.equal(opened.stub.reads.get(url) || 0, reads.get(url) || 0, `Switching items within the same ${kind} queue fetched ${url} again`);
        }
        if (kind === 'Playlists') {
          assert.deepEqual(opened.stub.writes.filter((write) => write.body.action === 'progress').map((write) => write.body.asset_id),
            [11, next], 'The playlist does not save the resume position');
        }
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally {
        await opened.close();
      }
    });
  }

  it('Playlist: drag to reorder and remove an item, both undoable', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/11?playlist=${PLAYLIST.id}`, DESKTOP);
    try {
      const page = opened.page;
      const order = () => ids(page, '#stage [data-queue-row]', 'data-queue-row');
      const wait = (wanted: number[]) => page.waitForFunction((want) => JSON.stringify([...document
        .querySelectorAll('#stage [data-queue-row]')].map((row) => Number(row.getAttribute('data-queue-row')))) === want,
      JSON.stringify(wanted), { timeout: 10_000 });
      assert.deepEqual(await order(), PLAYLIST.items);
      await page.locator('#stage [data-queue-row="16"]').dragTo(page.locator('#stage [data-queue-row="14"]'),
        { targetPosition: { x: 4, y: 2 } });
      await wait([11, 16, 14, 15]);
      await undo(page);
      await wait(PLAYLIST.items);
      await page.locator('#stage [data-queue-remove="15"]').click();
      await page.locator('[data-modal-confirm]').click();
      await wait([11, 14, 16]);
      await undo(page);
      await wait(PLAYLIST.items);
      assert.deepEqual(opened.stub.writes.filter((write) => write.body.action !== 'progress')
        .map((write) => [write.body.action, write.body.asset_ids ?? write.body.asset_id]), [
        ['reorder', [11, 16, 14, 15]], ['reorder', PLAYLIST.items],
        ['remove', 15], ['add', [15]], ['reorder', PLAYLIST.items],
      ]);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Save Mix: after confirming, go to the newly created playlist', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}?mix=${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#stage [data-save-mix]').click();
      await page.locator('[name="name"]').fill('My Mix');
      await page.locator('[data-modal-confirm]').click();
      await page.waitForFunction(() => location.pathname.startsWith('/assets/') && new URLSearchParams(location.search).get('playlist') === '8', undefined, { timeout: 10_000 });
      await page.locator('#stage [data-queue-row]').first().waitFor();
      assert.deepEqual(await ids(page, '#stage [data-queue-row]', 'data-queue-row'), [ITEM.plain, ...RELATED]);
      const created = opened.stub.writes.find((write) => write.body.action === 'create')!;
      assert.deepEqual(created.body, {
        action: 'create', name: 'My Mix', asset_ids: [ITEM.plain, ...RELATED], source_kind: 'mix',
        source_seed_asset_id: ITEM.plain,
      });
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Continue watching: one row of cards in related-video order; clicking one swaps to it in place', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#nrow [data-media-card]').first().waitFor();
      assert.deepEqual(await ids(page, '#nrow [data-media-card]', 'data-id'), RELATED);
      const before = await page.locator('#stage [data-detail-title]').innerText();
      await watchStage(page);
      await page.locator(`#nrow [data-media-card][data-id="${RELATED[0]}"] [data-media-title]`).click();
      await pathIs(page, `/assets/${RELATED[0]}`);
      await page.waitForFunction((title) => {
        const now = document.querySelector('#stage [data-detail-title]');
        return !!now && (now as HTMLElement).innerText !== title;
      }, before, { timeout: 10_000 });
      await page.locator(DETAIL_READY).waitFor();
      assert.deepEqual(await stageKept(page), { same: true, skeleton: false, focused: true }, 'Continue watching reopened the popover when switching items');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Clicking a performer opens her entity page and collapses the stage', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.route(url => url.pathname === '/api/entity', route => {
        assert.equal(new URL(route.request().url()).searchParams.get('id'), '1');
        return route.fulfill({ json: {
          id: 1, kind: 'performer', canonical_name: NAMES[0], aliases: [], display_aliases: [], user_aliases: [],
          asset_count: 1, tags: [], related_performers: [], links: [], metadata: {},
          has_image: false, has_avatar: false, representative_asset_id: null, entry_links: [],
        } });
      });
      await page.locator(`#stage [data-item-identity] [data-entity-kind="performer"][data-entity-name="${NAMES[0]}"]`).click();
      await pathIs(page, '/performers/1');
      await page.locator('#index [data-entity-title] h2').filter({ hasText: NAMES[0] }).waitFor();
      await page.waitForFunction(() => !document.querySelector('#stage[open]'), undefined, { timeout: 10_000 });
      assert.equal(await page.evaluate(() => document.body.classList.contains('entity-open')), true);
    } finally {
      await opened.close();
    }
  });

  it('Item unavailable: the player box still fills at 16:9 with a centered retry note instead of collapsing into a thin strip', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.route((url) => url.pathname === '/api/item', (route) => route.fulfill({ status: 500, json: { error: 'database is locked' } }));
      await page.goto(new URL('/assets/987654', page.url()).toString(), { waitUntil: 'load' });
      await page.locator('#stage [data-item-placeholder] [data-media-error]').waitFor({ timeout: 15_000 });
      const box = await page.evaluate(() => {
        const frame = document.querySelector('#stage [data-item-placeholder]')!.getBoundingClientRect();
        const note = document.querySelector('#stage [data-item-placeholder] [data-media-error]')!.getBoundingClientRect();
        return { ratio: frame.width / frame.height, offset: Math.abs((note.top + note.bottom) / 2 - (frame.top + frame.bottom) / 2) };
      });
      assert.ok(Math.abs(box.ratio - 16 / 9) < 0.02, `The player box is not 16:9: ${JSON.stringify(box)}`);
      assert.ok(box.offset < 2, `The tooltip is not vertically centered: ${JSON.stringify(box)}`);
    } finally {
      await opened.close();
    }
  });

  it('Long tags ellipsize on one line at the same height as other tags', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, MOBILE);
    try {
      const page = opened.page;
      const heights = await page.evaluate(() => {
        const tag = document.querySelector('#detailTags [data-tag]') as HTMLElement;
        const before = tag.getBoundingClientRect().height;
        tag.textContent = 'customer-feedback-from-enterprise-onboarding-customer-feedback-from-enterprise-onboarding';
        return { before, after: tag.getBoundingClientRect().height, wide: tag.scrollWidth > tag.clientWidth };
      });
      assert.equal(heights.after, heights.before, `A long tag wrapped: ${JSON.stringify(heights)}`);
      assert.equal(heights.wide, true, 'Long tags should be ellipsized');
      assert.deepEqual((await layout(page)).offenders, [], 'A long tag stretches past the viewport');
    } finally {
      await opened.close();
    }
  });

  it('Consecutive decode errors from a stub source never consume the real diagnosis budget; other errors keep passing through', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const forwarded: unknown[] = [];
      await opened.page.context().route((url) => url.pathname === '/api/diagnostics/client-error', (route) => {
        forwarded.push(route.request().postDataJSON());
        return route.fulfill({ json: { recorded: false } });
      });
      const replies = await opened.page.evaluate(async () => {
        const send = async (kind: string, source_route: string, message = 'Fixture error') => (await fetch('/api/diagnostics/client-error', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, message, playback: { source_route } }),
        })).json();
        const ambient = await send('media', '/stream', 'Concurrent player errors');
        const media = await Promise.all(Array.from({ length: 21 }, () => send('media', '/stream')));
        return { ambient, media, other: await send('error', '/stream'), external: await send('media', '/external') };
      });
      assert.deepEqual(replies.ambient, { recorded: true });
      assert.deepEqual(replies.media, Array.from({ length: 21 }, () => ({ recorded: true })));
      assert.equal(opened.stub.mediaErrors.filter((sent) => sent.message === 'Fixture error').length, 21);
      assert.deepEqual(replies.other, { recorded: false });
      assert.deepEqual(replies.external, { recorded: false });
      assert.deepEqual(forwarded, [
        { kind: 'error', message: 'Fixture error', playback: { source_route: '/stream' } },
        { kind: 'media', message: 'Fixture error', playback: { source_route: '/external' } },
      ]);
    } finally { await opened.close() }
  });

  it('Phone 390: details never overflow horizontally, and the sidebar sits below the playback area', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, MOBILE);
    try {
      const page = opened.page;
      assert.deepEqual((await layout(page)).offenders, [], 'An element in details overflows the viewport right edge');
      const boxes = await page.evaluate(() => ({
        media: document.querySelector('#stage [data-item-media]')!.getBoundingClientRect().bottom,
        side: document.querySelector('#stage [data-item-side]')!.getBoundingClientRect().top,
      }));
      assert.ok(boxes.side >= boxes.media - 1, `The sidebar is not under the playback area: ${JSON.stringify(boxes)}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });
});
