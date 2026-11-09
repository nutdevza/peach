/* Stub data for the follows page and follow detail islands: shared by `follow-feed.test.ts`, `follow-detail.test.ts` and the
 * design decision cases (`design-*.test.ts`).
 *
 * The demo library has no follow sources, so this builds, per `_source_payload` and `_group_payload`
 * (`src/peach/web_follow.py`), six creators, a page of videos and images, a second continuation page, plus the details'
 * several shapes. Not one real fetch to follow sources is sent: `/api/follow/check`'s POST is caught by the stub, and write
 * endpoints (status, Watch later) also land only in stubs. The sampling seed rolled on page entry is swapped for a seeded
 * sequence, so the two rows come out in the same order every time. */
import type { Page, Route } from 'playwright-core';

import { settle, visit, type Viewport, type Visit } from './harness.ts';
import { mockSubtitleMemory } from './subtitle-fixture.ts';

export const AUTHORS = ['Kou', 'Mira', 'Opal', 'Remi', 'Nanase', 'Lazy'];
const PROVIDERS = [['kemono', 'Kemono'], ['rule34xxx', 'Rule34.xxx'], ['fanbox', 'pixivFANBOX']] as const;
const TAGS = ['animated', 'blender', '3d', 'sound', 'voiced', 'loop', 'solo', 'outdoor'];
export const WORKS = [['overwatch', 'Overwatch', 12, 1], ['zelda', 'The Legend of Zelda', 7, 1], ['nier', 'NieR:Automata', 5, 0]];

const source = (id: number, author: string) => {
  const [provider, label] = PROVIDERS[(id - 1) % PROVIDERS.length]!;
  return {
    id, provider, provider_label: label, ref: `${author.toLowerCase()}-${provider}`, label: `${author} · ${label}`,
    author_name: author, author_key: `name:${author.toLowerCase()}`, official_avatar_url: null, avatar_url: null,
    url: 'https://example.invalid/', semantics: 'work', enabled: true, entity_id: null, entity_name: null,
    can_backfill: true, backfill_page: 0, created_at: '2026-09-01T00:00:00Z', last_checked_at: '2026-09-20T00:00:00Z',
    last_status: 'ok', last_error: null, history_exhausted: false,
  };
};
const SOURCES = AUTHORS.map((author, at) => source(at + 1, author));

const item = (id: number, at: number, extra: Record<string, unknown> = {}) => {
  const from = SOURCES[at % SOURCES.length]!;
  const tags = [TAGS[at % TAGS.length]!, TAGS[(at * 3 + 1) % TAGS.length]!];
  return {
    id, provider: from.provider, provider_label: from.provider_label, resource_provider: from.provider,
    source_id: from.id, source_label: from.label, external_id: String(id), title: `Demo update ${id}`,
    author: from.author_name, summary: null, url: `https://example.invalid/${id}`, thumb_url: `/stub-thumb/${id}`,
    published_at: `2026-09-${String(20 - (at % 18)).padStart(2, '0')}T08:20:00Z`, published_precision: 'exact',
    version: null, duration: 30 + at * 17, variant_kind: 'main', variant_label: null, status: 'new', asset_id: null,
    media_needs_credential: false, media_error: null, has_media: true, media_kind: 'video', width: 1280, height: 720,
    playable: true, media_type: 'video/mp4', media_items: [], hidden_media: [], resource_urls: [], tags,
    detail_tags: tags, tag_types: Object.fromEntries(tags.map((tag) => [tag, 'general'])), ...extra,
  };
};
const imageItem = (id: number, at: number) => item(id, at, {
  media_kind: 'image', thumb_url: `/stub-thumb/${id}-0`, duration: null, media_type: 'image/jpeg', width: 600, height: 800,
  media_items: [{ index: 0, media_kind: 'image', thumb_url: `/stub-thumb/${id}-0`, name: '0.jpg', width: 600, height: 800 }],
});
const group = (primary: ReturnType<typeof item>) => ({
  release_key: `r-${primary.id}`, primary, variants: [], duplicates: [], providers: [primary.provider], has_wip: false,
  is_release: false, newest_at: primary.published_at, stack: null,
});

/** Page one: the first 12 entries are videos, the last 6 are images. */
export const FIRST = [
  ...Array.from({ length: 12 }, (_, at) => group(item(1000 + at, at))),
  ...Array.from({ length: 6 }, (_, at) => group(imageItem(2000 + at, at))),
];
/** The batch of videos from the next page. */
export const MORE = Array.from({ length: 4 }, (_, at) => group(item(3000 + at, at + 3)));

/* ── Details variants ──
   Returned only via the single-item fetch (`/api/follow?item=`) and never entering the list page: the list counts cards by FIRST, unaffected. */
const still = (id: number, index: number) => ({
  index, media_kind: 'image', thumb_url: `/stub-thumb/${id}-${index}`, name: `${index}.jpg`, width: 600, height: 800,
  media_type: 'image/jpeg',
});
const clip = (id: number, index: number) => ({
  index, media_kind: 'video', thumb_url: `/stub-thumb/${id}v${index}`, name: `clip ${index}.mp4`, width: 1280, height: 720,
  media_type: 'video/mp4',
});
const gallery = (id: number, count: number, title: string) => item(id, 1, {
  title, media_kind: 'image', thumb_url: `/stub-thumb/${id}-0`, duration: null, media_type: 'image/jpeg', width: 600,
  height: 800, media_items: Array.from({ length: count }, (_, index) => still(id, index)),
});
/** Multi-image carousels, a video compilation (another edition plus the same entry from another site), a multi-media post, a post with two hidden images, an entry
 *  with no preview at all, a post with one tag of each of six types, and posts whose summary, title and media errors are long unbreakable strings. */
export const DETAIL = { gallery: 5001, largeGallery: 5002, collection: 5101, media: 5201, hidden: 5301, bare: 5401, long: 5501 } as const;
const UNBROKEN = 'abcdef0123456789'.repeat(12);
const TYPED_TAGS = { ow: 'copyright', tracer: 'character', kou: 'artist', solo: 'general', animated: 'metadata', odd: 'unknown' };
const DETAIL_GROUPS = [
  group(gallery(5001, 3, 'Three-image post 5001')),
  group(gallery(5002, 21, 'Post 5002 with 21 images')),
  {
    ...group(item(5101, 0, { title: 'Compilation main entry 5101' })), providers: ['kemono', 'rule34xxx'],
    variants: [item(5102, 0, { title: 'Compilation other edition 5102', variant_kind: 'alt', variant_label: '4K',
      published_at: '2026-09-19T08:20:00Z' })],
    duplicates: [item(5103, 1, { title: 'The same entry on another site, 5103', published_at: '2026-09-18T08:20:00Z' })],
  },
  group(item(5201, 0, { title: 'Multimedia post 5201', media_items: [clip(5201, 0), still(5201, 1), clip(5201, 2)] })),
  group(gallery(5301, 5, 'Post 5301 with hidden images')),
  group(item(5401, 0, {
    title: 'Post 5401 with text only', thumb_url: null, has_media: false, media_kind: 'external', playable: false,
    media_type: null, duration: null, tags: Object.keys(TYPED_TAGS), detail_tags: Object.keys(TYPED_TAGS),
    tag_types: TYPED_TAGS,
  })),
  group(item(5501, 0, {
    title: `long-post_${UNBROKEN}`,
    summary: [...Array.from({ length: 20 }, (_, at) => `Caption paragraph ${at + 1}.`), `Download: https://example.invalid/${UNBROKEN}`].join('\n'),
    media_error: `403 Forbidden: https://n1.example.invalid/data/${UNBROKEN}.mp4`,
  })),
];
const members = (row: (typeof DETAIL_GROUPS)[number]) => [row.primary, ...row.variants, ...row.duplicates];
const detailMediaKind = (id: number, index: number) => DETAIL_GROUPS.flatMap(members)
  .find((member) => member.id === id)?.media_items.find((media) => media.index === index)?.media_kind;

/** Single-entry fetch: state and hidden are written as recorded in the stub, and hidden images move from the media list into `hidden_media`, matching the server projection. */
const detailPayload = (id: number, statuses: Map<number, string>, hidden: Map<number, Set<number>>) => {
  const row = DETAIL_GROUPS.find((candidate) => members(candidate).some((member) => member.id === id));
  if (!row) return null;
  const view = <T extends (typeof row)['primary']>(member: T): T => {
    const off = hidden.get(member.id) || new Set<number>();
    return {
      ...member, status: statuses.get(member.id) || member.status,
      media_items: member.media_items.filter((media) => !off.has(media.index)),
      hidden_media: member.media_items.filter((media) => off.has(media.index)),
    };
  };
  const groups = [{ ...row, primary: view(row.primary), variants: row.variants.map(view), duplicates: row.duplicates.map(view) }];
  return { ok: true, sources: SOURCES, author_aliases: [], groups };
};

/** A successful write's status is recorded here, readable on re-read, in sync with the server. */
const payload = (url: URL, statuses: Map<number, string>, bindAuthors = false) => {
  const offset = Number(url.searchParams.get('offset') || 0);
  const groups = (offset ? MORE : FIRST).map((row) => statuses.has(row.primary.id)
    ? { ...row, primary: { ...row.primary, status: statuses.get(row.primary.id)! } } : row);
  return {
    ok: true, sources: bindAuthors ? SOURCES.map(source => ({ ...source, entity_id: source.id, entity_name: source.author_name })) : SOURCES,
    author_aliases: [], alias_suggestions: [], suggestions: [],
    groups, counts: { new: 40, seen: 3, saved: 2, ignored: 1 },
    sort: url.searchParams.get('sort') || 'new', dir: url.searchParams.get('dir') || 'desc', seed: 1,
    facets: {
      authors: AUTHORS.map((author) => `name:${author.toLowerCase()}`), providers: PROVIDERS.map(([key]) => key),
      tags: TAGS.map((tag, at) => [tag, 30 - at * 2]), works: WORKS, duration: true,
    },
    offset, limit: 300, has_more: !offset, providers: PROVIDERS.map(([key]) => key),
  };
};

const svg = (key: string, width: number, height: number) => {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="${width}" height="${height}" fill="hsl(${hash % 360} 35% 45%)"/></svg>`;
};

export interface FollowStub {
  /** Write requests the stub received: URLs and bodies, in arrival order. */
  writes: { url: string; body: unknown }[];
  /** When this returns true, list requests stay pending and the view sits in its waiting state; `release()` lets the pending ones through. */
  hold: ((url: URL) => boolean) | null;
  release(): Promise<void>;
}

async function stub(page: Page, bindAuthors = false): Promise<FollowStub> {
  await mockSubtitleMemory(page);
  const held: { route: Route; url: URL }[] = [];
  const statuses = new Map<number, string>();
  const hidden = new Map([[DETAIL.hidden, new Set([3, 4])]]);
  const state: FollowStub = {
    writes: [], hold: null,
    release: async () => {
      state.hold = null;
      for (const { route, url } of held.splice(0)) await route.fulfill({ json: payload(url, statuses, bindAuthors) }).catch(() => {});
    },
  };
  await page.route((url) => url.pathname === '/api/follow', (route) => {
    const url = new URL(route.request().url());
    const single = url.searchParams.has('item') && detailPayload(Number(url.searchParams.get('item')), statuses, hidden);
    if (single) return route.fulfill({ json: single });
    if (state.hold?.(url)) {
      held.push({ route, url });
      return;
    }
    return route.fulfill({ json: payload(url, statuses, bindAuthors) });
  });
  await page.route('**/api/follow/credentials', (route) => route.fulfill({ json: { providers: [] } }));
  await page.route('**/api/tag-management**', route => route.fulfill({ json: { items: [], total:0, categories:{}, duplicate_groups: [] } }));
  // After one run, GET keeps reporting "running": the screen stays in the busy state, and both buttons can be measured as busy together.
  let started = false;
  await page.route('**/api/follow/check', (route) => {
    if (route.request().method() === 'POST') {
      started = true;
      state.writes.push({ url: '/api/follow/check', body: route.request().postDataJSON() });
      return route.fulfill({ json: { job_id: 'job-1', status: 'running' } });
    }
    return route.fulfill({ json: started ? { job_id: 'job-1', status: 'running', results: [] } : { status: 'idle' } });
  });
  for (const path of ['/api/follow/status', '/api/follow/save']) {
    await page.route((url) => url.pathname === path, (route) => {
      const body = route.request().postDataJSON() as { item: number; to?: string };
      state.writes.push({ url: path, body });
      statuses.set(body.item, body.to || 'saved');
      return route.fulfill({ json: { ok: true } });
    });
  }
  await page.route('**/api/follow/image-dims', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/follow/tags**', (route) => route.fulfill({ json: { tags: [] } }));
  await page.route((url) => url.pathname === '/work-icon', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: svg(route.request().url(), 32, 32) }));
  await page.route((url) => url.pathname.startsWith('/stub-thumb/'), (route) => {
    const key = new URL(route.request().url()).pathname;
    const [width, height] = key.includes('-') ? [60, 80] : [160, 90];
    return route.fulfill({ contentType: 'image/svg+xml', body: svg(key, width, height) });
  });
  await page.route('**/source-icon**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: svg('icon', 32, 32) }));
  await page.route((url) => url.pathname === '/api/follow/media/hide', (route) => {
    const body = route.request().postDataJSON() as { item: number; media: number; hidden: boolean };
    state.writes.push({ url: '/api/follow/media/hide', body });
    const off = hidden.get(body.item) || new Set<number>();
    if (body.hidden) off.add(body.media); else off.delete(body.media);
    hidden.set(body.item, off);
    return route.fulfill({ json: { ok: true } });
  });
  // Images are proxied at original size to a rendered image; videos get no real footage, and the one VIDEOJS error the player reports is filtered out by each item itself.
  await page.route('**/follow-stream**', (route) => {
    const url = new URL(route.request().url());
    const kind = detailMediaKind(Number(url.searchParams.get('id')), Number(url.searchParams.get('media')));
    return kind === 'image'
      ? route.fulfill({ contentType: 'image/svg+xml', body: svg(url.search, 600, 800) })
      : route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/follow-qualities**', (route) => route.fulfill({ json: {} }));
  return state;
}

export interface FollowVisit extends Visit {
  stub: FollowStub;
}

/** Opens the follows page: install stubs and fix the seed before navigating, then wait for the island's cards to render and the pending state to end. */
export async function openFollowFeed(browser: import('playwright-core').Browser, path: string, viewport: Viewport,
  { settings = {}, ready = '[data-follow-list] > [data-follow-item]', bindAuthors = false }: {
    settings?: Record<string, unknown>; ready?: string; bindAuthors?: boolean;
  } = {},
): Promise<FollowVisit> {
  let stubbed!: FollowStub;
  const opened = await visit(browser, path, viewport, async page => {
    await page.context().addInitScript((value) => {
      localStorage.setItem('peach.settings.v1', JSON.stringify(value));
      let state = 20260928;
      Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296 };
    }, { detailAutoplay: false, ...settings });
    stubbed = await stub(page, bindAuthors);
  });
  const page = opened.page;
  await page.locator(ready).first().waitFor({ timeout: 15_000 });
  await settle(page);
  return { ...opened, stub: stubbed };
}
