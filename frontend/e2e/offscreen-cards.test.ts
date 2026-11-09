/* Cards outside the viewport skip rendering: cover and meta area are left to the browser to decide by viewport, while the
 * card box still lays out normally.
 *
 * These guard the side effects of skipped rendering: offscreen cards really are skipped, estimated heights slot unrendered
 * cards in without the page height or card positions jumping, and Ctrl+F still finds text inside offscreen cards. The demo
 * library has only about ten entries fitting one screen, so this blows the catalog's and performer profile page's video
 * responses into one long column, makes the numbers distinct, and rewrites cover requests back to the original one. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, layout, settle, visit, VIEWPORTS, type Visit } from './harness.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const CLONES = 150;
const CLONE_BASE = 900_000;
const PROBE_TAG = 'Off-screen probes';

/** Selectors for the blocks inside cards. Video cards belong to the catalog grid and follow cards to the follows page, both hooked by
 * `data-media-*`; the follow card's cover cell wraps an extra `[data-follow-visual]`, and avatar and tags are `<span>`s. */
interface CardShape {
  card: string; pic: string; meta: string; avatar: string; text: string; tags: string;
  avatarButton: string; tagButton: string;
}
const MEDIA: CardShape = {
  card: '[data-media-card]', pic: '[data-media-pic]', meta: '[data-media-meta]', avatar: '[data-media-avatar]',
  text: '[data-media-text]', tags: '[data-media-tags]',
  avatarButton: '[data-media-meta]>button[data-media-avatar]', tagButton: '[data-media-tags]>button[data-media-tag]',
};
const FOLLOW = MEDIA;
const CATALOG_CARDS = '#grid [data-media-grid]>[data-media-card]';
const ENTITY_CARDS = '#index [data-entity-grid] [data-media-grid]>[data-media-card]';
const FOLLOW_CARDS = '[data-follow-list]>[data-follow-item]';

interface CatalogPayload {
  total: number;
  items: Array<Record<string, unknown>>;
}

/** `/api/items`' home page becomes `CLONES` entries: every third one carries a tag, and the last one carries a unique tag for
 * finding. The tagged ones are also assigned to one performer: the demo library's videos are all unassigned, so avatars are
 * unfocusable `<span>`s, becoming buttons only after assignment, and the focus-ring case needs to focus one.
 * The clone source is the catalog's home page with the `performer` filter removed: the demo library has no person entities,
 * so the profile page filtered by name is empty. */
async function serveLongItems(page: Page): Promise<void> {
  const original = new Map<number, number>();
  let baseline: CatalogPayload | undefined;
  await page.route(/\/api\/items\?/, async (route) => {
    const url = new URL(route.request().url());
    /* The home page's vertical strip is extra content fetched separately after the first page lands and inserted into the middle of the grid; when it arrives depends only on request speed. If it lands
       after the first measurement, the page gains a strip's height out of nowhere, but that is not estimation error being measured. This case gives it an empty list so the strip is not inserted. */
    if (url.searchParams.has('orient')) {
      await route.fulfill({ json: { items: [], total: 0, has_more: false } });
      return;
    }
    if (url.searchParams.get('offset') !== '0') {
      await route.continue();
      return;
    }
    url.searchParams.delete('performer');
    baseline ??= await (await route.fetch({ url: url.toString() })).json() as CatalogPayload;
    const source = baseline.items.filter((item) => !item.part_group && !item.edition_group);
    const items = Array.from({ length: CLONES }, (_, index) => {
      const item = structuredClone(source[index % source.length]);
      original.set(CLONE_BASE + index, Number(item.id));
      item.id = CLONE_BASE + index;
      item.tags = index === CLONES - 1 ? [PROBE_TAG] : index % 3 === 0 ? ['Demo'] : [];
      if (index % 3 === 0) {
        Object.assign(item, { creator: '', performers: ['Demo performer'], performer_total: 1,
          performer_entities: [{ id: 90_100, name: 'Demo performer', has_image: false }] });
      }
      return item;
    });
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...baseline, total: CLONES, has_more: false, items }) });
  });
  await page.route((url) => original.has(Number(url.searchParams.get('id'))), async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('id', String(original.get(Number(url.searchParams.get('id')))));
    await route.continue({ url: url.toString() });
  });
}

async function openLongCatalog(browser: Browser, density = 'big'): Promise<Visit> {
  const opened = await visit(browser, '/', DESKTOP);
  const { page } = opened;
  await serveLongItems(page);
  await page.evaluate((value) => localStorage.setItem('density', value), density);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(([selector, count]) => document.querySelectorAll(selector).length >= count,
    [CATALOG_CARDS, CLONES] as const, { timeout: 15_000 });
  await settle(page);
  return opened;
}

/** The performer profile's video section enlarged into the `CLONES` part: the profile is supplied from here, fields shaped after `/api/entity`. */
async function openLongEntity(browser: Browser): Promise<Visit> {
  const name = '七沢みあ';
  const opened = await visit(browser, '/', DESKTOP);
  const { page } = opened;
  await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
    id: 90_001, kind: 'performer', canonical_name: name, aliases: [], display_aliases: [],
    user_aliases: [], asset_count: CLONES, tags: [], related_performers: [], links: [],
    metadata: {}, has_image: false, has_avatar: false, avatar_focus: null,
    representative_asset_id: null, entry_links: [], feed: { following: false },
  } }));
  await serveLongItems(page);
  await page.goto(new URL(`/performers/${encodeURIComponent(name)}`, page.url()).href, { waitUntil: 'load' });
  await page.waitForFunction(([selector, count]) => document.querySelectorAll(selector).length >= count,
    [ENTITY_CARDS, CLONES] as const, { timeout: 15_000 });
  await settle(page);
  return opened;
}

/** The follows page swapped for updates synthesized from `CLONES` rows: the demo library has no follow sources. Fields follow the `/api/follow` shape,
 *  with no thumbnails and no external requests; every third row carries a tag, so off-screen cards get two meta-info heights. */
async function openLongFollow(browser: Browser): Promise<Visit> {
  const opened = await visit(browser, '/', DESKTOP);
  const { page } = opened;
  const source = { id: 1, provider: 'rule34xxx', provider_label: 'Rule34.xxx', ref: 'demo', label: 'Demo source',
    author_name: 'Demo author', author_key: 'name:Demo author', official_avatar_url: null, avatar_url: null,
    url: 'https://example.invalid/', semantics: 'work', enabled: true, entity_id: null, entity_name: null,
    can_backfill: false, backfill_page: 0, created_at: '2026-09-01T00:00:00Z', last_checked_at: null,
    last_status: 'ok', last_error: null, history_exhausted: true };
  const groups = Array.from({ length: CLONES }, (_, index) => ({
    release_key: `demo-${index}`, variants: [], duplicates: [], providers: ['rule34xxx'], has_wip: false,
    is_release: false, newest_at: '2026-09-01T00:00:00Z',
    primary: {
      id: CLONE_BASE + index, provider: 'rule34xxx', provider_label: 'Rule34.xxx', resource_provider: 'rule34xxx',
      source_id: 1, source_label: 'Demo source', external_id: String(index), title: `Demo update ${index}`,
      author: 'Demo author', summary: null, url: `https://example.invalid/${index}`, thumb_url: null,
      published_at: '2026-09-01T00:00:00Z', published_precision: 'exact', version: null, duration: 60,
      variant_kind: 'main', variant_label: null, status: 'new', asset_id: null, media_needs_credential: false,
      media_error: null, has_media: false, media_kind: 'video', width: 1280, height: 720, media_type: null,
      playable: false, media_items: [], hidden_media: [], resource_urls: [],
      tags: index % 3 === 0 ? ['Demo'] : [], detail_tags: [], tag_types: {},
    },
  }));
  const body = { ok: true, sources: [source], author_aliases: [], alias_suggestions: [], suggestions: [], groups,
    counts: { new: CLONES, seen: 0, saved: 0, ignored: 0 }, sort: 'new', dir: 'desc', seed: 1,
    facets: { authors: [], providers: [], tags: [], works: [] }, offset: 0, limit: CLONES, has_more: false,
    providers: ['rule34xxx'] };
  await page.route(/\/api\/follow(\?|$)/, (route) => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(body) }));
  await page.goto(new URL('/follow', page.url()).toString(), { waitUntil: 'load' });
  await page.waitForFunction(([selector, count]) => document.querySelectorAll(selector).length >= count,
    [FOLLOW_CARDS, CLONES] as const, { timeout: 15_000 });
  await settle(page);
  return opened;
}

/** Scrolls screen by screen to the bottom and back to the top, waiting two frames per step so every card renders at least once. */
function roundTrip(page: Page): Promise<void> {
  return page.evaluate(async () => {
    const frame = () => new Promise(requestAnimationFrame);
    for (const direction of [1, -1]) {
      for (let step = 0; step < 500; step++) {
        const y = scrollY;
        scrollBy(0, direction * innerHeight * .9);
        await frame();
        await frame();
        if (scrollY === y) break;
      }
    }
  });
}

describe('Cards outside the viewport', () => {
  let browser: Browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser.close();
  });

  it('Mobile follow cards are sized by text and tags; an empty tag area takes no row', { timeout: 60_000 }, async () => {
    const opened = await openLongFollow(browser);
    try {
      await opened.page.setViewportSize({ width: 390, height: 844 });
      for (const density of ['roomy', 'dense']) {
        await opened.page.evaluate(value => { document.body.dataset.density = value }, density);
        const cards = await opened.page.locator(FOLLOW_CARDS).evaluateAll(nodes => nodes.slice(0, 3).map(node => {
          const meta = node.querySelector('[data-media-meta]')!;
          const children = [...meta.children].filter(child => getComputedStyle(child).display !== 'none')
            .map(child => child.getBoundingClientRect());
          const content = Math.max(...children.map(child => child.bottom)) - Math.min(...children.map(child => child.top));
          return { height: meta.getBoundingClientRect().height, content };
        }));
        for (const card of cards) assert.ok(card.height <= card.content + 17, JSON.stringify({ density, ...card }));
      }
      assert.deepEqual((await layout(opened.page)).offenders, []);
    } finally { await opened.close() }
  });

  for (const [where, open, selector] of [
    ['Library', openLongCatalog, CATALOG_CARDS],
    ['Performer profile', openLongEntity, ENTITY_CARDS],
  ] as const) {
    it(`${where}: skips rendering the cover and meta section; Ctrl+F still finds text in off-screen cards`, { timeout: 60_000 }, async () => {
      const opened = await open(browser);
      try {
        const state = await opened.page.evaluate(([tag, cardSelector, shape]) => {
          const last = [...document.querySelectorAll<HTMLElement>(cardSelector)].at(-1)!;
          const parts = [last.querySelector(shape.pic)!, last.querySelector(shape.meta)!];
          // What is skipped is the element's content; the element itself still takes layout, so query its first child.
          const skipped = parts.map((part) => !part.firstElementChild!.checkVisibility({ contentVisibilityAuto: true }));
          const box = last.getBoundingClientRect();
          /* The sidebar's tag list also holds this tag, earlier in the document; keep searching downward until it lands inside that card. */
          const find = (window as unknown as { find(text: string): boolean }).find.bind(window);
          let hits = 0;
          while (hits < 5 && find(tag)) {
            hits++;
            const node = getSelection()?.anchorNode;
            if (node && last.contains(node)) break;
          }
          const hit = getSelection()?.anchorNode;
          return {
            values: parts.map((part) => getComputedStyle(part).contentVisibility),
            skipped, below: box.top - innerHeight, height: box.height,
            hits, inLast: !!hit && last.contains(hit),
          };
        }, [PROBE_TAG, selector, MEDIA] as const);
        assert.deepEqual(state.values, ['auto', 'auto'], 'Off-screen cards\' covers and meta sections were never left to the browser\'s viewport culling');
        assert.ok(state.below > 1000, `The last card is only ${state.below}px from the viewport; the enlarged list is not long enough`);
        assert.deepEqual(state.skipped, [true, true], 'Off-screen cards\' covers or meta sections still render');
        assert.ok(state.height > 0, 'An off-screen card\'s getBoundingClientRect measured zero height');
        assert.ok(state.inLast, `In-page find did not reach the off-screen card's tags (${state.hits} hits)`);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  for (const [where, open, selector, shape] of [
    ['Library', openLongCatalog, CATALOG_CARDS, MEDIA],
    ['Library one level denser', (b: Browser) => openLongCatalog(b, 'dense'), CATALOG_CARDS, MEDIA],
    ['Performer profile', openLongEntity, ENTITY_CARDS, MEDIA],
    ['Follows', openLongFollow, FOLLOW_CARDS, FOLLOW],
  ] as const) {
    it(`${where}: after a long round trip, the full page height and the position of the deep card do not jump, and the geometry measured offscreen matches the rendered one`, { timeout: 90_000 }, async () => {
      const opened = await open(browser);
      try {
        const { page } = opened;
        const measure = () => page.evaluate(([cardSelector, metaSelector]) => {
          const cards = [...document.querySelectorAll(cardSelector)];
          const deep = cards[Math.floor(cards.length * .8)];
          return { height: document.documentElement.scrollHeight,
            deep: deep.getBoundingClientRect().top + scrollY, y: scrollY,
            view: deep.getBoundingClientRect().top,
            skipping: getComputedStyle(deep.querySelector(metaSelector)!).contentVisibility,
            meta: deep.querySelector(metaSelector)!.getBoundingClientRect().height };
        }, [selector, shape.meta] as const);
        /* Cards beyond the first screen have never rendered at this point, so heights are all estimates; after one round trip each card remembers its actual
           size. The difference between the two measurements is the estimate's error; a little per row compounds down the list into a jumping scrollbar. */
        const fresh = await measure();
        assert.equal(fresh.skipping, 'auto', `${where} off-screen cards do not skip rendering, so no estimation error goes unmeasured`);
        await roundTrip(page);
        const rendered = await measure();
        assert.ok(Math.abs(rendered.height - fresh.height) <= 1,
          `The page height changed from ${fresh.height} to ${rendered.height}: the meta section's estimated height does not match reality`);
        assert.ok(Math.abs(rendered.deep - fresh.deep) <= 1,
          `The deep card moved from ${fresh.deep} to ${rendered.deep}`);

        /* Stop deep in the list, scroll to the bottom and back: at the same scrollY that card should still be in place. */
        await page.evaluate((y) => scrollTo(0, y), rendered.deep - 300);
        await page.waitForTimeout(300);
        const parked = await measure();
        /* Geometry measured while skipping render must match post-render: when other children in the card compete for space, a meta-info area whose content does not count toward minimum size
           gets squashed while the card's total height stays the same, invisible from outside; only measuring the element itself exposes it. */
        assert.ok(Math.abs(fresh.meta - parked.meta) <= 1,
          `The offscreen card meta section measures ${fresh.meta}px, and ${parked.meta}px after render`);
        await roundTrip(page);
        await page.evaluate((y) => scrollTo(0, y), parked.y);
        await page.waitForTimeout(300);
        const back = await measure();
        assert.equal(back.y, parked.y, 'The original scroll position never comes back');
        assert.ok(Math.abs(back.view - parked.view) <= 1,
          `After returning to the same scroll position, the card moved from ${parked.view} to ${back.view} in the viewport`);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  /* Follow card avatars and tags are `<span>`s and not focusable, so the focus-ring half is checked only on video cards. */
  for (const [where, open, selector, shape, focusable] of [
    ['Library', openLongCatalog, CATALOG_CARDS, MEDIA, true],
    ['Library one level denser', (b: Browser) => openLongCatalog(b, 'dense'), CATALOG_CARDS, MEDIA, true],
    ['Performer profile', openLongEntity, ENTITY_CARDS, MEDIA, true],
    ['Follows', openLongFollow, FOLLOW_CARDS, FOLLOW, false],
  ] as const) {
    it(`${where}: the clip padding added by the meta section does not change layout or take pointer events, and the avatar and tag focus rings are fully visible`, { timeout: 60_000 }, async () => {
      const opened = await open(browser);
      try {
        const { page } = opened;
        await page.locator(selector).first().evaluate(async (card) => {
          card.scrollIntoView({ block: 'center' });
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        /* The meta area pads itself with padding and cancels it with negative margins, so the clip edge (padding box) grows outward
           while the content box stays put.
           The content box must hug the card's left and right edges and sit one card row-gap below the cover, so the margin
           box's bottom edge is the content box's bottom; in the same row, the tallest card leaves no gap between its content
           box's bottom and the card's bottom edge (the follow card's bottom is `[data-follow-state]`), so card height remains
           cover plus row-gap plus content. Avatar and text columns hug the content box. The padded ring extends past the card
           box, and a pointer landing there does not count as this card. */
        const frames = await page.evaluate(([cardSelector, parts]) => {
          const inFlow = (element: Element | null, step: 'previousElementSibling' | 'nextElementSibling') => {
            let node = element?.[step] ?? null;
            while (node && getComputedStyle(node).position === 'absolute') node = node[step];
            return node;
          };
          return [...document.querySelectorAll(cardSelector)].filter((card) => {
            const box = card.getBoundingClientRect();
            return card.querySelector(`:scope>${parts.meta}`) && box.top >= 0 && box.bottom <= innerHeight;
          }).map((card) => {
            const meta = card.querySelector(`:scope>${parts.meta}`)!;
            const style = getComputedStyle(meta);
            const border = meta.getBoundingClientRect();
            const content = {
              left: border.left + meta.clientLeft + parseFloat(style.paddingLeft),
              top: border.top + meta.clientTop + parseFloat(style.paddingTop),
              right: border.left + meta.clientLeft + meta.clientWidth - parseFloat(style.paddingRight),
              bottom: border.top + meta.clientTop + meta.clientHeight - parseFloat(style.paddingBottom),
            };
            const cardBox = card.getBoundingClientRect();
            const cardStyle = getComputedStyle(card);
            const gap = parseFloat(cardStyle.rowGap);
            const above = inFlow(meta, 'previousElementSibling')!.getBoundingClientRect();
            const below = inFlow(meta, 'nextElementSibling');
            const floor = below ? below.getBoundingClientRect().top - gap
              : cardBox.bottom - parseFloat(cardStyle.paddingBottom);
            const mav = meta.querySelector(`:scope>${parts.avatar}`)?.getBoundingClientRect();
            const mtext = meta.querySelector(`:scope>${parts.text}`)!;
            const textStyle = getComputedStyle(mtext);
            const textBox = mtext.getBoundingClientRect();
            /* Probing targets the dots inside the padded rings (8 px for the meta area, 4 px for the tag row and the dense text columns). */
            const tags = meta.querySelector(parts.tags)?.getBoundingClientRect();
            const probes = [...[content.top + 10, (content.top + content.bottom) / 2, content.bottom - 4]
              .flatMap((y) => [[cardBox.left - 2, y], [cardBox.right + 2, y]]),
            [(content.left + content.right) / 2, cardBox.bottom + 2],
            ...(tags ? [[tags.left + 10, cardBox.bottom + 2], [cardBox.right + 2, (tags.top + tags.bottom) / 2]] : [])];
            const outside = probes.map(([x, y]) => document.elementFromPoint(x, y));
            return {
              row: Math.round(cardBox.top), slack: floor - content.bottom,
              padded: [parseFloat(style.paddingLeft), parseFloat(style.paddingTop)],
              offsets: [content.left - cardBox.left, cardBox.right - content.right,
                content.top - (above.bottom + gap), border.bottom + parseFloat(style.marginBottom) - content.bottom,
                mav ? mav.left - content.left : 0,
                textBox.top - parseFloat(textStyle.marginTop) - content.top,
                content.right - (textBox.right + parseFloat(textStyle.marginRight))].map((n) => Math.round(n * 100) / 100),
              background: style.backgroundColor,
              claimed: outside.filter((hit) => hit && card.contains(hit)).length,
            };
          });
        }, [selector, shape] as const);
        assert.ok(frames.length > 0, `${where} has no card fully inside the viewport`);
        for (const frame of frames) {
          assert.ok(frame.padded.every((value) => value > 0), `${where} meta area has no crop padding`);
          assert.ok(frame.offsets.every((value) => Math.abs(value) <= .5),
            `${where}'s meta section content box drifts from the card and cover: ${frame.offsets.join(', ')}`);
          assert.equal(frame.background, 'rgba(0, 0, 0, 0)', `${where} meta area has a background, and the padded ring paints outside the card`);
          assert.equal(frame.claimed, 0, `A pointer 2px outside ${where}'s card box landed inside this card`);
          assert.ok(frame.slack >= -.5, `${where} meta section content box crosses the card bottom edge ${-frame.slack}px`);
        }
        for (const row of new Set(frames.map((frame) => frame.row))) {
          const least = Math.min(...frames.filter((frame) => frame.row === row).map((frame) => frame.slack));
          assert.ok(least <= .5, `In ${where} the tallest card in the row leaves ${least}px empty under the meta section, so the card is stretched taller`);
        }

        /* The focus ring paints outside the element; walk up layer by layer to find clipping ancestors (`overflow` not visible, or paint containment from skip-contents),
           and the ring's outer edge must fall inside every layer's padding box. */
        const room = (target: string) => page.locator(`${selector} ${target}`).first().evaluate((element, cardSelector) => {
          const style = getComputedStyle(element);
          const ring = style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
          const box = element.getBoundingClientRect();
          let least = Infinity, clips = 0;
          for (let clip = element.parentElement; clip && !clip.matches(cardSelector); clip = clip.parentElement) {
            const clipStyle = getComputedStyle(clip);
            if (clipStyle.overflow === 'visible' && clipStyle.contentVisibility !== 'auto') continue;
            clips++;
            const edge = clip.getBoundingClientRect();
            const left = edge.left + clip.clientLeft, top = edge.top + clip.clientTop;
            least = Math.min(least, box.left - ring - left, box.top - ring - top,
              left + clip.clientWidth - (box.right + ring), top + clip.clientHeight - (box.bottom + ring));
          }
          return { focused: element.matches(':focus-visible'), ring, least, clips };
        }, shape.card);
        for (const target of focusable ? [shape.avatarButton, shape.tagButton] : []) {
          await page.keyboard.press('Tab');
          await page.locator(`${selector} ${target}`).first().focus();
          const edge = await room(target);
          assert.ok(edge.focused && edge.ring > 0, `${where} keyboard-focused ${target} has no focus ring`);
          assert.ok(edge.clips > 0, `${where} ${target} no longer has a clipping ancestor: the premise this test guards has changed, update the test`);
          assert.ok(edge.least >= -.5, `${where}'s ${target} focus ring crosses the clip edge by ${-edge.least}px and that part would be cut off`);
        }
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }
});
