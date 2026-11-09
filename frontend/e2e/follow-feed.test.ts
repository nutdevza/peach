/* Follows page island (`follow-feed`) behavior in a real browser: sampling, filters into the address bar, only the list gets a skeleton, photo wall,
 * continuation pages, write operations, check and back-crawl busy states, Shift multi-select, and entering details and returning.
 *
 * Stub data and seeding in `follow-fixture.ts`; no real fetches to follow sources, ever. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { FIRST, MORE, openFollowFeed } from './follow-fixture.ts';
import { launch, layout, settle, VIEWPORTS } from './harness.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const MOBILE = VIEWPORTS.find((viewport) => viewport.mobile)!;
const CARDS = '[data-follow-list] > [data-follow-item]';

const authorOrder = (page: Page) => page.locator('button[data-follow-author]').evaluateAll((buttons) =>
  buttons.map((button) => (button as HTMLElement).dataset.followAuthor));
const cardIds = (page: Page) => page.locator(CARDS).evaluateAll((cards) =>
  cards.map((card) => Number((card as HTMLElement).dataset.followItem)));
/** The stub's entries carry no feature film, so the detail's player gets an empty response and logs a VIDEOJS error; this assertion measures the list and does not count it. */
const withoutPlayer = (problems: string[]) => problems.filter((line) => !line.includes('VIDEOJS'));
/** Wait for the address bar to switch to the given query string; the island only hands over the view, the shell writes the address. */
const searchIs = (page: Page, search: string) => page.waitForFunction(
  (wanted) => location.pathname === '/follow' && location.search === wanted, search, { timeout: 10_000 });

describe('Follows page island', () => {
  let browser: Browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser.close();
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`${viewport.name} shows confirmed details while the follow task is still running`, { timeout: 60_000 }, async () => {
      const opened = await openFollowFeed(browser, '/follow', viewport);
      try {
        const page = opened.page;
        const payload = await page.evaluate(async () => (await fetch('/api/follow')).json());
        let revision = 1;
        await page.route((url) => url.pathname === '/api/result-updates', route => route.fulfill({ json: {
          busy: true,
          result_versions: { follow: String(revision) },
        } }));
        await page.route((url) => url.pathname === '/api/follow' && !url.searchParams.has('item'), route =>
          route.fulfill({ json: { ...payload, groups: payload.groups.map((group: typeof FIRST[number]) =>
            group.primary.id === 1000 && revision > 1 ? { ...group, primary: { ...group.primary,
              title: 'The title confirmed while the task runs' } } : group) } }));
        const baseline = page.waitForResponse(url => new URL(url.url()).pathname === '/api/result-updates');
        await page.reload({ waitUntil: 'load' });
        await baseline;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator(CARDS).first().waitFor();
        await page.waitForFunction(() => document.querySelector('[data-follow-list]')?.textContent?.includes('Demo update 1000'));
        revision = 2;
        await page.getByText('The title confirmed while the task runs', { exact: true }).waitFor({ timeout: 15_000 });
        const measured = await layout(page);
        assert.ok(measured.scrollWidth <= measured.viewportWidth + 1, JSON.stringify(measured));
        assert.deepEqual(measured.offenders, []);
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally {
        await opened.close();
      }
    });

    it(`${viewport.name} avatars and credits of authors with profiles enter the author page, and multiple authors stay in one row`, { timeout: 60_000 }, async () => {
      const opened = await openFollowFeed(browser, '/follow', viewport);
      try {
        const page = opened.page;
        const payload = await page.evaluate(async () => {
          const data = await (await fetch('/api/follow')).json();
          data.sources[0].entity_id = 90101;
          data.sources[0].entity_name = 'Kou';
          for (let at = 7; at <= 30; at++) {
            const name = `Creator ${at}`;
            data.sources.push({ ...data.sources[1], id: at, author_name: name, author_key: `name:creator-${at}` });
            data.facets.authors.push(`name:creator-${at}`);
          }
          return data;
        });
        await page.route((url) => url.pathname === '/api/follow' && !url.searchParams.has('item'),
          (route) => route.fulfill({ json: payload }));
        await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
          id: 90101, kind: 'creator', canonical_name: 'Kou', asset_count: 0, tags: [], links: [], metadata: {},
          aliases: [], related_performers: [], has_image: false, has_avatar: false, feed: null,
        } }));
        await page.route((url) => url.pathname === '/api/items', (route) =>
          route.fulfill({ json: { items: [], total: 0, has_more: false } }));
        await page.reload({ waitUntil: 'load' });
        await settle(page);
        assert.equal(await page.getByRole('searchbox', { name: 'Search creators' }).count(), 0);
        const author = page.locator('[data-follow-authors] a[data-follow-author="name:kou"]');
        assert.equal(await author.count(), 1);
        assert.equal(await author.getAttribute('href'), '/creators/90101');
        assert.equal(await author.getAttribute('aria-pressed'), null);
        await author.hover();
        assert.equal(await author.evaluate((node) => getComputedStyle(node).textDecorationLine), 'none');
        await author.focus();
        assert.equal(await author.evaluate((node) => document.activeElement === node), true);
        const card = page.locator('[data-follow-item="1000"]');
        assert.equal(await card.locator('a[data-follow-author]').getAttribute('href'), '/creators/90101');
        assert.equal(await card.locator('a[data-follow-avatar]').getAttribute('href'), '/creators/90101');
        await card.locator('a[data-follow-author]').click();
        await page.waitForURL('**/creators/90101');
        assert.equal(await page.locator('#stage[open]').count(), 0);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`${viewport.name} keeps spacing between filter chips and card hover surfaces`, { timeout: 60_000 }, async () => {
      const opened = await openFollowFeed(browser, '/follow?tag=loop', viewport);
      try {
        const gap = await opened.page.evaluate(() => {
          const chip = document.querySelector('[data-follow-combo]')!.getBoundingClientRect();
          const card = document.querySelector('[data-follow-list] [data-media-card]')!.getBoundingClientRect();
          return card.top - chip.bottom - 8;
        });
        assert.ok(gap >= 16, `The filter is only ${gap}px from the card hover surface`);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });

    it(`${viewport.name} both glass panes snap into place when the filter overlay becomes visible again`, { timeout: 60_000 }, async () => {
      const opened = await openFollowFeed(browser, '/follow', viewport);
      try {
        const page = opened.page;
        await page.locator('[data-follow-feed]').evaluate((node) => { (node as HTMLElement).style.display = 'none' });
        await page.waitForTimeout(100);
        await page.locator('[data-follow-feed]').evaluate((node) => {
          const media = node.querySelector<HTMLElement>('[data-entity-media]')!;
          media.style.gap = '24px';
          (node as HTMLElement).style.display = '';
        });
        await page.waitForTimeout(100);
        const pairs = await page.evaluate(() => [
          ['[data-view-glide=""]', '[data-follow-filter][aria-pressed="true"]'],
          ['[data-view-glide="round"]', '[data-media-view][aria-pressed="true"]'],
        ].map(([glass, key]) => {
          const host = document.querySelector('[data-follow-filter-glass]')!;
          const rect = (selector: string) => {
            const node = host.querySelector<HTMLElement>(selector)!;
            const box = node.getBoundingClientRect();
            return { hidden: node.hidden, left: box.left, top: box.top, width: box.width, height: box.height };
          };
          return { glass: rect(glass!), key: rect(key!) };
        }));
        for (const pair of pairs) {
          assert.equal(pair.glass.hidden, false);
          for (const side of ['left', 'top', 'width', 'height'] as const) {
            assert.ok(Math.abs(pair.glass[side] - pair.key[side]) <= 1, JSON.stringify(pair));
          }
        }
        /* The in-flight glide is started by the glass's own sliding: the pointer moves onto the adjacent key and the glass slides over. The slide animation is
           tracked for undo by `moveGlidePane` itself, so real hover is exercised and no animation is attached to the node separately. After a window resize re-measures,
           that glide must be cut off, not allowed to keep dragging the glass away from the new landing point. The test browser defaults to reduced motion, which disables sliding; this test opts back in. */
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const animations = await page.locator('[data-follow-filter-glass]').evaluate(async (host) => {
          const glass = host.querySelector<HTMLElement>('[data-view-glide=""]')!;
          const keys = [...host.querySelectorAll<HTMLElement>('[data-follow-filter]')];
          const at = keys.findIndex((key) => key.getAttribute('aria-pressed') === 'true');
          const neighbour = keys[at + 1] ?? keys[at - 1]!;
          neighbour.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
          const moving = glass.getAnimations().length;
          window.dispatchEvent(new Event('resize'));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return { moving, left: glass.getAnimations().length };
        });
        assert.ok(animations.moving > 0, `Hovering an adjacent key did not trigger the slide: ${JSON.stringify(animations)}`);
        assert.equal(animations.left, 0, 'After re-placing, an animation still covers the glass position');
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`${viewport.name} image card keyboard focus rings sit outside the cover crop layer`, { timeout: 60_000 }, async () => {
      const opened = await openFollowFeed(browser, '/follow?media=images', viewport,
        { settings: { followImagesOnly: true } });
      try {
        const page = opened.page;
        await page.keyboard.press('Tab');
        const card = page.locator(CARDS).first();
        await card.locator('[data-follow-open]').focus();
        const ring = await card.locator('[data-follow-open]').evaluate((element) => {
          const style = getComputedStyle(element);
          const parent = getComputedStyle(element.parentElement!);
          return { width: style.outlineWidth, offset: style.outlineOffset,
            radius: style.borderRadius, clip: parent.clipPath, overflow: parent.overflow };
        });
        assert.equal(ring.width, '2px');
        assert.equal(ring.offset, '2px');
        assert.notEqual(ring.radius, '0px');
        assert.equal(ring.clip, 'none');
        assert.equal(ring.overflow, 'visible');
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });

  }

  /** The image view keeps only the 5001 group and reports it as a three-image compilation: the merged count appears at the card's top right. */
  const openMixCard = async (viewport: typeof DESKTOP) => {
    const opened = await openFollowFeed(browser, '/follow?media=images', viewport, { settings: { followImagesOnly: false } });
    const page = opened.page;
    const payload = await page.evaluate(async () => {
      const list = await (await fetch('/api/follow?media=images')).json();
      const detail = await (await fetch('/api/follow?item=5001')).json();
      list.groups = detail.groups.map((group: Record<string, unknown>) => ({
        ...group, stack: { media: 3, kind: 'image', faces: [] },
      }));
      list.has_more = false;
      return list;
    });
    await page.route((url) => url.pathname === '/api/follow' && !url.searchParams.has('item'),
      (route) => route.fulfill({ json: payload }));
    await page.reload({ waitUntil: 'load' });
    await settle(page);
    return opened;
  };

  it(`${MOBILE.name} the multi-image count button can open details`, { timeout: 60_000 }, async () => {
    const opened = await openMixCard(MOBILE);
    try {
      const page = opened.page;
      await page.locator('[data-follow-list] [data-follow-collection="5001"]').click();
      await page.waitForURL('**/posts/5001');
      await page.locator('#stage[open]').waitFor();
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it(`${DESKTOP.name} merged counts fade out on hover and keyboard focus; the action key takes the top-right corner`, { timeout: 60_000 }, async () => {
    const opened = await openMixCard(DESKTOP);
    try {
      const page = opened.page;
      const card = page.locator('[data-follow-list] [data-follow-item]').filter({
        has: page.locator('[data-follow-collection="5001"]') }).first();
      const read = () => card.evaluate(async (element) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const collection = element.querySelector<HTMLElement>('[data-follow-collection]')!;
        const actions = element.querySelector<HTMLElement>('[data-follow-actions]')!;
        const pic = element.querySelector<HTMLElement>('[data-media-pic]')!.getBoundingClientRect();
        const box = collection.getBoundingClientRect();
        const keys = actions.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          collection: [getComputedStyle(collection).opacity, getComputedStyle(collection).visibility],
          actions: getComputedStyle(actions).opacity,
          hitCollection: hit?.closest('[data-follow-collection]') === collection,
          /* The count and action buttons both sit in the cover's top-right cell; the offsets of their top and right edges relative to the cover cell. */
          collectionCorner: [Math.round(box.top - pic.top), Math.round(pic.right - box.right)],
          actionsCorner: [Math.round(keys.top - pic.top), Math.round(pic.right - keys.right)],
        };
      });
      await page.mouse.move(0, 0);
      const rest = await read();
      assert.deepEqual(rest.collection, ['1', 'visible'], 'The merged count does not show without hover');
      assert.equal(rest.actions, '0', 'Action buttons are exposed without hover');
      assert.equal(rest.hitCollection, true, 'Without hover the merged count receives no pointer events');

      await card.locator('[data-follow-open]').hover();
      const hovered = await read();
      assert.deepEqual(hovered.collection, ['0', 'hidden'], 'On hover the merged count never fades');
      assert.equal(hovered.actions, '1', 'The action key never appears on hover');
      assert.equal(hovered.hitCollection, false, 'On hover the merged count still covers the action key');
      assert.deepEqual(hovered.actionsCorner, rest.collectionCorner,
        `The action key did not land on the merged count position: ${JSON.stringify(hovered)}`);

      await page.mouse.move(0, 0);
      await card.locator('[data-follow-open]').focus();
      assert.equal(await card.locator('[data-follow-open]').evaluate((element) => element.matches(':focus-visible')), true);
      const focused = await read();
      assert.deepEqual(focused.collection, ['0', 'hidden'], 'The merged count does not fade out on keyboard focus');
      assert.equal(focused.actions, '1', 'Action buttons do not appear on keyboard focus');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('First screen: "All" pressed, with header, two rows, filter overlay, and list top to bottom', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      assert.equal(await page.locator('[data-follow-filter=""]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-follow-filter="new"]').getAttribute('aria-pressed'), 'false');
      const tops = await page.evaluate(() => ['[data-follow-head]', '[data-follow-authors]', '[data-follow-works]',
        '[data-follow-filter-glass]', '[data-follow-list]']
        .map((selector) => document.querySelector(selector)?.getBoundingClientRect().top ?? null));
      assert.ok(tops.every((top) => top !== null), `One block did not paint: ${JSON.stringify(tops)}`);
      assert.deepEqual([...tops].sort((a, b) => a! - b!), tops, `Top-to-bottom order is wrong: ${JSON.stringify(tops)}`);
      assert.deepEqual(await cardIds(page), FIRST.filter((row) => row.primary.media_kind === 'video')
        .map((row) => row.primary.id));
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The cover\'s top left opens details; the source badge hides on hover', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      const card = page.locator(CARDS).first();
      const id = await card.getAttribute('data-follow-item');
      const hit = await card.locator('[data-media-badge]').evaluate((badge) => {
        const box = badge.getBoundingClientRect();
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { badge: target?.closest('[data-media-badge]') === badge, title: badge.getAttribute('title') };
      });
      assert.equal(hit.badge, true, 'The badge center hit target is not the badge itself');
      assert.ok(hit.title, 'The badge carries no source name');
      const corner = (await card.locator('[data-media-badge]').boundingBox())!;
      await card.hover();
      assert.equal(await card.locator('[data-media-badge]').isVisible(), false);
      assert.equal(await card.locator('[data-follow-sources]').evaluate(node => getComputedStyle(node).pointerEvents), 'none');
      await page.mouse.click(corner.x + corner.width / 2, corner.y + corner.height / 2);
      await page.waitForURL(`**/posts/${id}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Both rows keep their samples across filters, and shuffling requests a new list with the address seed', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      const first = await authorOrder(page);
      assert.equal(first.length, 6);
      await page.locator('[data-follow-filter="new"]').click();
      await searchIs(page, '?status=new');
      await page.locator('[data-follow-filter="new"][aria-pressed="true"]').waitFor();
      assert.deepEqual(await authorOrder(page), first, 'After switching states the creators row reshuffled');
      const shuffled = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/follow' && url.searchParams.get('sort') === 'rand';
      });
      await page.getByRole('button', { name: 'Show more', exact: true }).click();
      await page.waitForFunction(() => new URLSearchParams(location.search).get('sort') === 'rand');
      const response = await shuffled;
      assert.equal(response.status(), 200);
      const requestSeed = new URL(response.url()).searchParams.get('seed');
      assert.ok(Number(requestSeed) > 0);
      assert.equal(new URL(page.url()).searchParams.get('seed'), requestSeed);
      await page.locator('[data-follow-list] > [data-follow-item]').first().waitFor();
      assert.deepEqual((await authorOrder(page)).sort(), [...first].sort());
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Clicking a creator, genre, or tag adds it to the combination bar and the address bar; the bar sits after the stats and before the list', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      await page.locator('button[data-follow-author="name:mira"]').click();
      await searchIs(page, '?author=name%3Amira');
      await page.locator('button[data-follow-work="zelda"]').click();
      await searchIs(page, '?author=name%3Amira&work=zelda');
      await page.locator('button[data-follow-tag="loop"]').click();
      await searchIs(page, '?author=name%3Amira&tag=loop&work=zelda');
      const drops = await page.locator('[data-follow-drop]').evaluateAll((buttons) =>
        buttons.map((button) => (button as HTMLElement).dataset.followDropKind));
      assert.deepEqual(drops, ['Creators', 'Genres', 'Tags'], `The combination bar's conditions are wrong: ${JSON.stringify(drops)}`);
      const [readout, combo, list] = await page.evaluate(() => ['[data-follow-readout]', '[data-follow-combo]',
        '[data-follow-list-body]'].map((selector) => document.querySelector(selector)!.getBoundingClientRect()));
      assert.ok(readout!.bottom <= combo!.top + 1 && combo!.bottom <= list!.top + 1,
        `The combination bar is not between the stats and the list: ${JSON.stringify([readout, combo, list])}`);
      // Remove one entry and what comes back is the address after removal.
      await page.locator('[data-follow-drop="loop"]').click();
      await searchIs(page, '?author=name%3Amira&work=zelda');
      // Clicking the pressed creator again removes it.
      await page.locator('button[data-follow-author="name:mira"]').click();
      await searchIs(page, '?work=zelda');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Switching state pills lays the skeleton only over the list, leaving header and both rows as they are', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      opened.stub.hold = (url) => url.searchParams.get('status') === 'saved';
      await page.locator('[data-follow-filter="saved"]').click();
      await page.locator('[data-follow-list-body] [data-skeleton]').waitFor({ timeout: 10_000 });
      const during = await page.evaluate(() => ({
        head: !!document.querySelector('[data-follow-feed] [data-follow-head]'),
        authors: document.querySelectorAll('button[data-follow-author]').length,
        glass: !!document.querySelector('[data-follow-filter-glass]'),
        wholePage: !!document.querySelector('#stats .followauthors'),
        skeletons: [...document.querySelectorAll('[data-skeleton]')]
          .filter(node => !node.closest('[data-content-skeleton][aria-hidden="true"]')).length,
      }));
      assert.deepEqual(during, { head: true, authors: 6, glass: true, wholePage: false, skeletons: 1 });
      await opened.stub.release();
      await page.locator('[data-follow-list-body] [data-skeleton]').waitFor({ state: 'hidden', timeout: 10_000 });
      await page.locator(CARDS).first().waitFor();
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Video cards and the photo wall swap; photo wall size tiers change the column count, with no horizontal overflow on mobile', { timeout: 90_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      await page.locator('[data-media-view="images"]').click();
      await searchIs(page, '?media=images');
      await page.locator('[data-follow-list][data-follow-wall] > [data-follow-item]').first().waitFor();
      assert.deepEqual(await cardIds(page), FIRST.filter((row) => row.primary.media_kind === 'image')
        .map((row) => row.primary.id));
      const columns = () => page.locator('[data-follow-wall]').evaluate((wall) => ({
        size: (wall as HTMLElement).dataset.size, count: getComputedStyle(wall).gridTemplateColumns.split(' ').length,
      }));
      const small = await columns();
      await page.locator('#density').click();
      await page.locator('[data-follow-wall][data-size="big"]').waitFor();
      const big = await columns();
      assert.equal(small.size, 'small');
      assert.ok(Number(big.count) < Number(small.count), `The large image tier is not missing a few columns: ${JSON.stringify([small, big])}`);
      await page.locator('[data-media-view="videos"]').click();
      await searchIs(page, '');
      await page.locator('[data-follow-list]:not([data-follow-wall]) > [data-follow-item]').first().waitFor();
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
    const mobile = await openFollowFeed(browser, '/follow?media=images', MOBILE);
    try {
      const geometry = await layout(mobile.page);
      assert.ok(geometry.scrollWidth <= geometry.viewportWidth,
        `Mobile photo wall overflows horizontally ${geometry.scrollWidth}>${geometry.viewportWidth}: ${geometry.offenders.join(', ')}`);
      assert.deepEqual(mobile.problems, []);
    } finally {
      await mobile.close();
    }
  });

  it('In the masonry layout, images with dimensions reserve space at their own ratio before landing', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow?media=images', DESKTOP, { settings: { photoLayout: 'masonry' } });
    const held: import('playwright-core').Route[] = [];
    try {
      const page = opened.page;
      await page.route((url) => url.pathname.startsWith('/stub-thumb/'), (route) => { held.push(route) });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-follow-wall][data-layout="masonry"] > [data-follow-item]').first().waitFor();
      await page.locator('[data-follow-wall] [data-media-pic] > img[width][height]').first().waitFor();
      const boxes = await page.locator('[data-follow-wall] [data-media-pic] > img[width][height]').evaluateAll((images) =>
        (images as HTMLImageElement[]).map((image) => {
          const box = image.getBoundingClientRect();
          return { pending: !image.complete || !image.naturalWidth, width: box.width, height: box.height,
            ratio: Number(image.getAttribute('height')) / Number(image.getAttribute('width')) };
        }));
      const pending = boxes.filter((box) => box.pending);
      assert.ok(pending.length, 'The thumbnail request is stuck, yet not a single image is left unlanded');
      const off = pending.filter((box) => Math.abs(box.height - box.width * box.ratio) > 1.5);
      assert.deepEqual(off, [], 'Images that have not landed do not reserve space at the width/height attribute ratio');
    } finally {
      for (const route of held.splice(0)) await route.abort().catch(() => {});
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`${viewport.name} dimensionless images fill the masonry card at intrinsic ratio once loaded`, { timeout: 60_000 }, async () => {
      const opened = await openFollowFeed(browser, '/follow?media=images', viewport,
        { settings: { photoLayout: 'masonry' } });
      try {
        const page = opened.page;
        const payload = await page.evaluate(async () => (await fetch('/api/follow?media=images')).json());
        payload.groups = payload.groups.filter((group: { primary: { media_kind: string } }) => group.primary.media_kind === 'image').slice(0, 1);
        const item = payload.groups[0].primary;
        item.width = null;
        item.height = null;
        item.media_items = [];
        payload.has_more = false;
        await page.route((url) => url.pathname === '/api/follow' && !url.searchParams.has('item'),
          (route) => route.fulfill({ json: payload }));
        // When the read-only service refuses the dimension write-back, the current card keeps the dimensions the browser obtained.
        await page.route('**/api/follow/image-dims', (route) => route.fulfill({ status: 409, json: { ok: false } }));
        await page.reload({ waitUntil: 'load' });
        await settle(page);
        const image = page.locator('[data-follow-wall] [data-media-pic] > img').first();
        await image.waitFor();
        await image.evaluate(async (node: HTMLImageElement) => { await node.decode() });
        const geometry = await image.evaluate((node: HTMLImageElement) => {
          const picture = node.parentElement!.getBoundingClientRect();
          const box = node.getBoundingClientRect();
          return { width: box.width, height: box.height, pictureWidth: picture.width, pictureHeight: picture.height,
            ratio: node.naturalWidth / node.naturalHeight, widthAttr: node.getAttribute('width'), heightAttr: node.getAttribute('height') };
        });
        assert.ok(Math.abs(geometry.width / geometry.height - geometry.ratio) < .01, JSON.stringify(geometry));
        assert.ok(Math.abs(geometry.pictureWidth - geometry.width) < 1.5, JSON.stringify(geometry));
        assert.ok(Math.abs(geometry.pictureHeight - geometry.height) < 1.5, JSON.stringify(geometry));
        assert.equal(geometry.widthAttr, '60');
        assert.equal(geometry.heightAttr, '80');
        const viewportGeometry = await layout(page);
        assert.ok(viewportGeometry.scrollWidth <= viewportGeometry.viewportWidth, JSON.stringify(viewportGeometry));
      } finally { await opened.close(); }
    });
  }

  it('Scrolling down for more pages in masonry keeps the position and nodes of already shown cards', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow?media=images', DESKTOP,
      { settings: { photoLayout: 'masonry', followImagesOnly: true } });
    try {
      const page = opened.page;
      const payload = await page.evaluate(async () => (await fetch('/api/follow?media=images')).json());
      const images = payload.groups.filter((group: { primary: { media_kind: string } }) => group.primary.media_kind === 'image');
      payload.groups = images;
      payload.has_more = true;
      const extra = images.map((group: { primary: { id: number }; release_key: string }) => ({
        ...group, release_key: `${group.release_key}-more`, primary: { ...group.primary, id: group.primary.id + 10000 },
      }));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve });
      await page.route((url) => url.pathname === '/api/follow' && !url.searchParams.has('item'), async (route) => {
        const more = Number(new URL(route.request().url()).searchParams.get('offset')) > 0;
        if (more) await gate;
        return route.fulfill({ json: { ...payload, groups: more ? extra : images, has_more: !more } });
      });
      await page.reload({ waitUntil: 'load' });
      await page.locator('[data-follow-item="2005"]').waitFor();
      await page.locator('[data-follow-wall] [data-media-pic] > img').evaluateAll(async (nodes) => {
        await Promise.all(nodes.map((node) => (node as HTMLImageElement).decode()));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const read = () => page.locator(CARDS).evaluateAll((cards) => cards.map((node) => {
        const box = node.getBoundingClientRect();
        return { id: node.getAttribute('data-follow-item'), left: box.left, top: box.top + scrollY };
      }));
      const before = await read();
      await page.locator(CARDS).evaluateAll((cards) => { (window as unknown as { oldCards: Element[] }).oldCards = cards });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      release();
      await page.locator('[data-follow-item="12005"]').waitFor();
      const after = await read();
      for (const old of before) {
        const current = after.find((card) => card.id === old.id)!;
        assert.ok(Math.abs(current.left - old.left) < 1.5 && Math.abs(current.top - old.top) < 1.5,
          JSON.stringify({ old, current }));
      }
      assert.equal(await page.evaluate(() => (window as unknown as { oldCards: Element[] }).oldCards.every((node) => node.isConnected)), true);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`${viewport.name} lazily loaded tall images grow only their own column; cards do not jump columns or overlap`, { timeout: 60_000 }, async () => {
      const opened = await openFollowFeed(browser, '/follow?media=images', viewport,
        { settings: { photoLayout: 'masonry', followImagesOnly: true } });
      const held: import('playwright-core').Route[] = [];
      try {
        const page = opened.page;
        const payload = await page.evaluate(async () => (await fetch('/api/follow?media=images')).json());
        payload.groups = payload.groups.filter((group: { primary: { media_kind: string } }) => group.primary.media_kind === 'image');
        const target = payload.groups.at(-1).primary;
        target.width = null;
        target.height = null;
        target.media_items = [];
        target.thumb_url = '/stub-thumb/delayed-tall';
        payload.has_more = false;
        await page.route((url) => url.pathname === '/api/follow' && !url.searchParams.has('item'),
          (route) => route.fulfill({ json: payload }));
        await page.route('**/stub-thumb/delayed-tall', (route) => { held.push(route) });
        await page.reload({ waitUntil: 'load' });
        const cards = page.locator(CARDS);
        await cards.last().waitFor();
        await cards.last().scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {
          const images = document.querySelectorAll<HTMLImageElement>('[data-follow-wall] [data-media-pic] > img');
          return [...images].slice(0, -1).every((image) => image.complete && image.naturalWidth);
        });
        const positions = () => cards.evaluateAll((nodes) => nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, top: box.top + scrollY, bottom: box.bottom + scrollY, width: box.width };
        }));
        const before = await positions();
        for (const route of held.splice(0)) await route.fulfill({ contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="4000"><rect width="200" height="4000" fill="#888"/></svg>' });
        const image = cards.last().locator('[data-media-pic] > img');
        await page.waitForFunction(() => document.querySelector('[src="/stub-thumb/delayed-tall"]')?.getAttribute('width') === '200');
        await image.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const after = await positions();
        after.forEach((box, index) => {
          assert.ok(Math.abs(box.left - before[index]!.left) < 1.5, JSON.stringify({ before: before[index], box }));
          for (const previous of after.slice(0, index).filter((other) => Math.abs(other.left - box.left) < 1)) {
            assert.ok(box.top >= previous.bottom + 12, JSON.stringify({ previous, box }));
          }
        });
        const picture = await image.evaluate((node) => node.parentElement!.getBoundingClientRect().toJSON());
        assert.ok(picture.height <= picture.width * 2.5 + 1.5, JSON.stringify(picture));
        assert.equal(await image.evaluate((node) => getComputedStyle(node).objectFit), 'cover');
        await page.locator('[data-glass-segment]').filter({ has: page.getByRole('radio', { name: 'Fixed ratio' }) }).click();
        await page.locator('[data-follow-wall][data-layout="fixed"]').waitFor();
        assert.equal(await cards.last().evaluate((node) => (node as HTMLElement).style.gridRow), '');
        const geometry = await layout(page);
        assert.ok(geometry.scrollWidth <= geometry.viewportWidth, JSON.stringify(geometry));
        assert.deepEqual(opened.problems, []);
      } finally {
        for (const route of held.splice(0)) await route.abort().catch(() => {});
        await opened.close();
      }
    });
  }

  it('Load more appends after the existing cards', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      const before = await cardIds(page);
      const more = page.getByRole('button', { name: 'Load more' });
      await more.scrollIntoViewIfNeeded();
      // Scrolling to the bottom loads the next page on its own; if it did not, press again.
      await page.waitForTimeout(800);
      if (!(await page.locator(`[data-follow-item="${MORE[0]!.primary.id}"]`).count())) await more.click().catch(() => {});
      await page.locator(`[data-follow-item="${MORE.at(-1)!.primary.id}"]`).waitFor({ timeout: 10_000 });
      assert.deepEqual(await cardIds(page), [...before, ...MORE.map((row) => row.primary.id)]);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Mark watched and watch later: the request body carries only the entry and target, and the card flips state immediately', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      const card = page.locator('[data-follow-item="1001"]');
      await card.hover();
      await card.locator('[data-follow-status="1001"][data-to="seen"]').click();
      await page.locator('[data-follow-item="1001"][data-status="seen"]').waitFor();
      // The watched card gains an extra "Restore unwatched".
      assert.equal(await card.locator('[data-to="new"]').count(), 1);
      await card.hover();
      await card.locator('[data-follow-save="1001"]').click();
      await card.locator('[data-follow-save="1001"][aria-label="Saved"]').waitFor();
      assert.deepEqual(opened.stub.writes, [
        { url: '/api/follow/status', body: { item: 1001, to: 'seen' } },
        { url: '/api/follow/save', body: { item: 1001 } },
      ]);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Update check and re-fetch share the same task, and both keys go busy while it runs', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      await page.locator('[data-follow-older]').click();
      await page.locator('[data-follow-older][aria-busy="true"]').waitFor();
      await page.locator('[data-follow-older]').filter({ hasText: 'Fetching' }).waitFor();
      assert.match(await page.locator('[data-follow-older]').innerText(), /抓取中/);
      await page.locator('[data-follow-recheck][aria-busy="true"]').waitFor();
      assert.deepEqual(opened.stub.writes, [{ url: '/api/follow/check', body: { older: true, background: true } }]);
      // The busy state includes the requesting phase; the task id is written once the response returns.
      await page.waitForFunction(() => sessionStorage.getItem('peach-follow-job') === 'job-1',
        undefined, { timeout: 10_000 });
      assert.equal(await page.evaluate(() => sessionStorage.getItem('peach-follow-job')), 'job-1');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
    const again = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = again.page;
      await page.locator('[data-follow-recheck]').click();
      await page.locator('[data-follow-recheck][aria-busy="true"]').waitFor();
      await page.locator('[data-follow-older][aria-busy="true"]').waitFor();
      // The check pass only flips that busy chip back; it does not change the text.
      assert.equal(await page.locator('[data-follow-older]').innerText(), 'Fetch an earlier page');
      assert.deepEqual(again.stub.writes, [{ url: '/api/follow/check', body: { background: true } }]);
      assert.deepEqual(again.problems, []);
    } finally {
      await again.close();
    }
  });

  it('In multi-select, Shift range selection frames a span by on-screen order', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow', DESKTOP);
    try {
      const page = opened.page;
      const ids = await cardIds(page);
      await page.locator('#selectMode').click();
      await page.locator('[data-follow-feed][data-select-mode]').waitFor();
      assert.equal(await page.locator('[data-follow-actions]').count(), 0);
      await page.locator(`[data-follow-item="${ids[1]}"]`).click();
      await page.locator(`[data-follow-item="${ids[4]}"]`).click({ modifiers: ['Shift'] });
      await page.locator(`[data-follow-item="${ids[4]}"][data-selected]`).waitFor();
      const picked = await page.locator(`${CARDS}[data-selected]`).evaluateAll((cards) =>
        cards.map((card) => Number((card as HTMLElement).dataset.followItem)));
      assert.deepEqual(picked, ids.slice(1, 5));
      assert.equal(new URL(page.url()).pathname, '/follow', 'Clicking a card in multi-select must never enter details');
      await page.locator('#selectMode').click();
      await page.locator('[data-follow-actions]').first().waitFor();
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Clicking a card opens details, closing returns to the same island and the same cards; a deep link into details mounts the island only when closing', { timeout: 90_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow?status=new', DESKTOP);
    try {
      const page = opened.page;
      const before = await cardIds(page);
      await page.evaluate(() => { (document.querySelector('[data-follow-feed]') as HTMLElement & { mark?: number }).mark = 7 });
      await page.locator('[data-follow-item="1002"] [data-follow-open]').click();
      await page.waitForFunction(() => location.pathname === '/posts/1002');
      await page.locator('#stage[open]').waitFor();
      await page.locator('#closeStage').click();
      await searchIs(page, '?status=new');
      await page.locator(CARDS).first().waitFor();
      assert.equal(await page.evaluate(() => (document.querySelector('[data-follow-feed]') as HTMLElement & { mark?: number }).mark),
        7, 'Island remounted when returning to the list');
      assert.deepEqual(await cardIds(page), before);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
    const deep = await openFollowFeed(browser, '/posts/1003', DESKTOP, { ready: '#stage[open]' });
    try {
      const page = deep.page;
      assert.equal(await page.locator('[data-follow-feed]').count(), 0, 'A deep link into details must never mount the island');
      await page.locator('#closeStage').click();
      await page.locator(CARDS).first().waitFor({ timeout: 15_000 });
      assert.equal(new URL(page.url()).pathname, '/follow');
      assert.deepEqual(withoutPlayer(deep.problems), []);
    } finally {
      await deep.close();
    }
  });
});
