/* Stub data, page-opening entries and browser lifecycle shared by the design decision cases (`design-*.test.ts`).
 *
 * Design decisions are asserted against computed styles in the browser, not bound to how the CSS source is written. When
 * pages migrated to React, the old source-string assertions were sorted three ways per ADR-0031: design decisions into
 * `design-*.test.ts` or lint rules, behavior into vitest, layout and runtime problems into `smoke.test.ts`. Each case guards
 * one decision, reads `getComputedStyle`, and holds even when class names or style spellings change. */
import assert from 'node:assert/strict';
import { after, before, beforeEach } from 'node:test';
import type { Browser, Locator, Page } from 'playwright-core';
import {
  configurationBody, expectBody, launch, settle, visit, VIEWPORTS, type Viewport, type Visit,
} from './harness.ts';

export const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
export const MOBILE = VIEWPORTS.find((viewport) => viewport.mobile)!;

/** Resolve one color token inside `scope`: mount a temporary element, read its background color, and remove it. */
export async function tokenColor(page: Page, scope: string, token: string): Promise<string> {
  return page.evaluate(([selector, name]) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${name})`;
    document.querySelector(selector)!.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, [scope, token] as const);
}

/** The access password section under "Network and access" on the configuration page. The demo library has no access.json, so the section is in system-passphrase state.
 *  Same sequence as the smoke tests: wait for the configuration page body, settle, then switch sections. */
export async function openAccess(browser: Browser): Promise<Visit & { form: Locator }> {
  const opened = await visit(browser, '/settings/library', DESKTOP);
  await expectBody(opened.page, '/settings/library', configurationBody(opened.page));
  await settle(opened.page);
  await opened.page.getByRole('tab', { name: 'Network & access' }).click({ timeout: 5_000 });
  await settle(opened.page);
  const form = opened.page.locator('form[aria-label="Access password"]');
  await form.waitFor({ timeout: 10_000 });
  return { ...opened, form };
}

/** A finished task run. Fields follow `/api/tasks` (`src/peach/routes_tasks.py`). */
export const settledRun = (id: number, status: string, label: string) => ({
  id, task_key: `task-${id}`, task_label: label, trigger: 'manual', status, host: 'desk',
  started_at: '2026-09-11T10:00:00Z', finished_at: '2026-09-11T10:01:00Z', elapsed_seconds: 60,
  progress_current: null, progress_total: null, progress_label: '',
  result_summary: {}, error: status === 'failed' ? 'RuntimeError: rejected upstream' : '',
});

/** The activity page opens from a given `/api/tasks` copy: the demo library cannot produce the three states of failed, blocked, and succeeded at once. */
export async function openActivity(browser: Browser, runs: unknown[]): Promise<Visit> {
  const opened = await visit(browser, '/tasks', DESKTOP);
  await opened.page.route('**/api/tasks', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ available: true, running: [], skipped: [], finished: runs }),
  }));
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('li[data-status]').first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** One quality upgrade goal. Fields follow `/api/quality-goals` (`src/peach/web_contract.py`). */
export const qualityGoal = (id: number, name: string) => ({
  id, name, code: null, location: 'local', size: 2147483648, duration: 3725,
  reason: 'Only 720p', cost: 'free', has_thumb: true, has_cover: false,
});

/** A 1x1 transparent PNG, enough for an `<img>` to complete one load. */
export const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The five dimensions of the taste page's browser profile: the first is ten times the rest, matching the real library's distribution. */
export const TASTE_CATEGORIES = [['Drama', 657], ['Photobook', 68], ['Amateur', 56], ['Idol', 4], ['Planning', 1]]
  .map(([name, score]) => ({ name, score }));

/** The face box on a full-body standing photo: the face sits in a small patch in the upper part of the frame, and the small round avatar needs several times magnification to read. */
export const TASTE_FACE = { cx: .439, cy: .224, faceW: 67, imgW: 640, imgH: 960 };

/** The taste page opens against a rewritten `/api/taste`: the demo library has no watch history and no face-framed entity images.
 * Fields defer to `src/peach/taste_history.py` and `src/peach/web_stats.py`; entity images are swapped for flat-color images the size of the face frames. */
export async function openTaste(browser: Browser, viewport: typeof DESKTOP): Promise<Visit> {
  const opened = await visit(browser, '/taste', viewport);
  const face = (id: number, name: string) => ({
    name, peach_items: 3, peach_score: 5, entity_id: id, has_image: true, avatar_focus: { box: TASTE_FACE },
  });
  await opened.page.route(/\/api\/taste\?/, async (route) => {
    const json = await (await route.fetch()).json();
    await route.fulfill({ json: { ...json, rankings: { ...json.rankings,
      browser_categories: TASTE_CATEGORIES,
      peach_performers: [face(901, 'Demo performer')],
      peach_creators: [face(902, 'Demo creator')],
    } } });
  });
  await opened.page.route(/\/entity-image\?/, (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${TASTE_FACE.imgW}" height="${TASTE_FACE.imgH}">`
      + `<rect width="${TASTE_FACE.imgW}" height="${TASTE_FACE.imgH}" fill="#888"/></svg>`,
  }));
  await opened.page.reload({ waitUntil: 'load' });
  await expectBody(opened.page, '/taste', [
    opened.page.locator('#stats').getByRole('tab', { name: 'Browser data', exact: true }),
  ]);
  return opened;
}

/** The HD target page opens against a given copy of `/api/quality-goals`: the demo library cannot muster very long titles. */
export async function openQualityGoals(browser: Browser, items: unknown[]): Promise<Visit> {
  const opened = await visit(browser, '/quality-goals', DESKTOP);
  await opened.page.route('**/api/quality-goals?limit=200', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ total: items.length, items, offset: 0, has_more: false }),
  }));
  /* These targets are fabricated; the demo library has no matching frame grabs, so previews would 404, and the failed request is itself a separate
     criterion. This case measures the cover block's geometry, so an image that loads is enough. */
  await opened.page.route('**/poster**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('li[data-goal-id]').first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** One scraping source. Fields follow `/api/scraping` (`src/peach/web_scraping.py`). */
export const scrapingSource = (source: string, label: string, cookie: boolean) => ({
  source, label, login: `https://${source}.example/login`,
  accepts_cookie: cookie, network: 'peach', cookie_saved: cookie,
});

/** The sources and credentials page opens against a given `/api/scraping`: the demo library will not necessarily have both cookie-collecting and non-collecting sources.
 *
 * Site marks go through the server's `/site-mark`, and these sources are fabricated, so that fetch necessarily fails; that is another criterion,
 * and here it gets an image that loads, so unrelated failures do not pollute the runtime issues list. */
export async function openScraping(browser: Browser): Promise<Visit> {
  const opened = await visit(browser, '/sources', DESKTOP);
  await opened.page.route('**/api/scraping', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      sources: [scrapingSource('demoa', 'Demo source Alpha', true), scrapingSource('demob', 'Demo source Beta', false)],
    }),
  }));
  await opened.page.route('**/site-mark**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('form[aria-label="Demo source Alpha"]').waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** One row of metadata candidates awaiting human review. Fields follow `_review_rows` in `src/peach/web_review.py`. */
export const REVIEW_ROW = {
  item_key: 'metadata_fields:ABC-123:studio',
  field: 'studio',
  field_label: 'Labels',
  code: 'ABC-123',
  query: 'ABC-123',
  evidence: 'Current value: none yet; 1 matching asset; 2 profile sources',
  candidates: [{ candidate_key: 'javdb:studio', source: 'javdb', display_value: 'Example label' }],
};

/** The manual review page opens with a queue fabricated from one row: the demo library may not have candidates for this cell, and an empty queue has no cards. */
export async function openReview(browser: Browser, rows = [REVIEW_ROW], viewport = DESKTOP): Promise<Visit> {
  const opened = await visit(browser, '/review', viewport);
  await opened.page.route('**/api/review', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      sections: { metadata_fields: rows }, counts: { metadata_fields: rows.length }, genre_tags: [],
      queues: { later: { sections: {}, counts: {} }, ignored: { sections: {}, counts: {} } },
    }),
  }));
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('section[data-review-key]').first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** CIE L*. Whether a 1px line is visible tracks lightness difference, not the contrast ratio: at the same 1.48:1, on a light background
 *  it is a gray line, while on a dark background both endpoints sit near absolute brightness 0 and nothing is visible. */
export function lightness([red, green, blue]: number[]): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const y = 0.2126 * linear(red!) + 0.7152 * linear(green!) + 0.0722 * linear(blue!);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/** Open a page against a given `/api/library-processing`: in the demo library that run finished long ago,
 *  and the running and failed states are exactly the two things being tested. Fields defer to `src/peach/web_library_processing.py`. */
export async function openProcessing(
  browser: Browser, path: '/' | '/data-cleanup', job: Record<string, unknown>,
): Promise<Visit> {
  const opened = await visit(browser, path, DESKTOP, (page) =>
    page.route('**/api/library-processing', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(job),
    })));
  try {
    const body = opened.page.locator(path === '/data-cleanup'
      ? '#libraryProcessing section[aria-label="Scan and collect"]'
      : '[data-catalog-filter] [data-count-readout]');
    await expectBody(opened.page, path, [body], opened.problems);
    return opened;
  } catch (error) {
    await opened.close();
    throw error;
  }
}

/** A 1280 desktop viewport is narrower than `--board-content` and cannot measure differences like "the grid fills, the title centers". */
export const WIDE = { name: 'wide', width: 1600, height: 900, mobile: false };

/** Junk files page. The count row is drawn by the junk queue page and stays even when the demo library has no candidates; the
 *  shell's skeleton (`[data-junk-count-skeleton]`) also carries these two blocks, waiting for the version that takes over once the page mounts. */
export const JUNK_COUNT = '#count > .peach-react:not([data-junk-count-skeleton])';
export async function openJunk(browser: Browser): Promise<Visit> {
  const opened = await visit(browser, '/junk-files', WIDE);
  await expectBody(opened.page, '/junk-files', [
    opened.page.locator(`${JUNK_COUNT} [data-collection-summary]`),
    opened.page.locator(`${JUNK_COUNT} [data-junk-filters]`),
  ]);
  await settle(opened.page);
  return opened;
}

/** One junk candidate. Fields follow `/api/ads` (`q_ads` in `src/peach/web_batch.py`); types are chosen without previews,
 *  so the fabricated ids fetch no thumbnails. */
export const junkItem = (id: number, kind: string, name: string) => ({
  id, name, junk_kind: kind, why: 'Filename looks like promo', size: 1048576 * id, location: 'local', cost: '',
});

/** The junk files page opens with the given candidates: the demo library has no junk candidates. `/api/ads` answers from the current list every time,
 *  and `/api/batch` records the request body and removes the handled entry from the list. */
export async function openJunkWith(browser: Browser, items: ReturnType<typeof junkItem>[], viewport = WIDE) {
  const opened = await visit(browser, '/junk-files', viewport);
  const state = { items: [...items], batches: [] as { ids: number[]; operation: string }[], reads: [] as string[] };
  await opened.page.route('**/api/ads?**', (route) => {
    const url = new URL(route.request().url());
    state.reads.push(url.search);
    const kind = url.searchParams.get('kind');
    const shown = state.items.filter((item) => !kind || item.junk_kind === kind);
    const counts: Record<string, number> = {};
    for (const item of state.items) counts[item.junk_kind] = (counts[item.junk_kind] || 0) + 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      items: shown, total: shown.length, all_total: state.items.length, pending_total: state.items.length,
      dismissed_total: 0, counts,
    }) });
  });
  await opened.page.route('**/api/batch', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.batches.push(body);
    state.items = state.items.filter((item) => !body.ids.includes(item.id));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, updated: body.ids.length }) });
  });
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('#grid [data-junk-card]').first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return { ...opened, state };
}

/** One duplicate file. Fields follow `/api/duplicates` (`src/peach/web_contract.py`). */
export const duplicateFile = (id: number, location: string, patch: Record<string, unknown> = {}) => ({
  id, name: `DUPE-${id}.mp4`, path: `R:\\media\\DUPE-${id}.mp4`, location, drive: location === '115' ? 'B:' : 'R:',
  size: 1073741824, duration: 3600, is_largest: false, is_longest: false, ...patch,
});

/** The duplicate files page opens with the two given groups: the demo library has no duplicate groups. One group is byte-identical, one mixes local files with 115.
 *  The files are fabricated, so the frame-grab round cannot fetch; give it an image that loads. */
export async function openDuplicates(browser: Browser): Promise<Visit> {
  const opened = await visit(browser, '/duplicates', DESKTOP);
  const groups = [
    { code: 'DUPE-001', count: 2, identical: true, drives: ['R:'], cross_drive: false, reclaimable: 1073741824,
      files: [duplicateFile(9001, 'local', { is_largest: true }), duplicateFile(9002, 'local', { is_longest: true })] },
    { code: 'DUPE-002', count: 2, identical: false, drives: ['R:', 'B:'], cross_drive: true, reclaimable: 1073741824,
      files: [duplicateFile(9003, 'local', { is_largest: true, is_longest: true }), duplicateFile(9004, '115')] },
  ];
  await opened.page.route('**/api/duplicates?**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ total: 2, files: 4, reclaimable: 2147483648, groups }),
  }));
  await opened.page.route('**/thumb?**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('#stats section[aria-label="DUPE-002"] .duplicate-row').first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** Open an index page with the roster and word list stubbed: the demo library's index goes from empty to populated within one run, so without stubs
 * this test could measure the empty state. The first roster cell carries a stub image, the rest fall back to initials. */
export async function openIndexPage(browser: Browser, path: string): Promise<Visit> {
  const opened = await visit(browser, path, DESKTOP);
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await opened.page.route('**/api/index?**', (route) => {
    const kind = new URL(route.request().url()).searchParams.get('kind');
    return route.fulfill(json(kind === 'tags'
      ? { items: [{ k: 'Nympho', n: 4, cat: 'role' }, { k: 'Secretary OL', n: 2, cat: 'scene' }], has_more: false,
        categories: { role: 1, scene: 1 } }
      : { items: [{ k: 'Alpha', n: 3, members: 2, entity_id: 90_101, has_image: true }, { k: 'Beta', n: 1, members: 1 }],
        has_more: false }));
  });
  // The placeholder image must be larger than the frame; a smaller one is placed at its natural size under a different rule.
  await opened.page.route('**/entity-image?**', (route) => route.fulfill({
    status: 200, contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#888"/></svg>',
  }));
  await opened.page.route('**/api/follow/tags?**', (route) => route.fulfill(json({
    items: [{ k: 'some_artist', n: 5, cat: 'artist' }, { k: 'long_hair', n: 9, cat: 'general' }], has_more: false,
    categories: { artist: 1, general: 1 } })));
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('#index [data-index-cell], #index [data-alpha-tag], #index [data-tag-chip]').first()
    .waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** The largest pixel number in a `box-shadow` list (computed value or raw token): the blur radius of the farthest of the three shadow layers. */
export const farthestShadow = (shadow: string) =>
  Math.max(0, ...[...shadow.matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1])));

/** The playlists page opens against a fabricated `/api/playlists` (`src/peach/web_playlists.py`): the demo library has no playlists.
 * The first copy has three credited people, the second none (painting the title's initial), the third an empty list (writing "No preview").
 * Covers are fabricated numbers, given an image that loads. */
export async function openPlaylistsPage(browser: Browser, viewport = DESKTOP): Promise<Visit> {
  const opened = await visit(browser, '/playlists', viewport);
  const face = (id: number, name: string, kind = 'performer') => ({ kind, id, name, has_image: false });
  const row = (id: number, patch: Record<string, unknown> = {}) => ({
    id, name: `List ${id}`, source_kind: 'manual', source_seed_asset_id: null, current_asset_id: null,
    created_at: '2026-09-01 10:00:00', updated_at: '2026-09-01 10:00:00', item_count: 2,
    preview_asset_id: 11, preview_ids: [11, 12], faces: [], ...patch,
  });
  await opened.page.route((url) => url.pathname === '/api/playlists', (route) => route.fulfill({ json: { items: [
    row(1, { source_kind: 'mix', faces: [face(901, 'Alpha'), face(902, 'Beta'), face(903, 'Gamma', 'creator')] }),
    row(2),
    row(3, { item_count: 0, preview_asset_id: null, preview_ids: [] }),
  ] } }));
  await opened.page.route('**/poster**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('#stats [data-playlist-card]').first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** Open the catalog and wait for the counts and cards to replace the first-screen skeleton together. */
export async function openCatalog(browser: Browser): Promise<Visit> {
  const opened = await visit(browser, '/', DESKTOP);
  await opened.page.locator('[data-catalog-filter] [data-count-readout]').waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** Opens the catalog with both avatar rows and the tag bar filled by stub data: the demo library's dozen-odd videos cannot make up a full row of tags. */
export async function openCatalogBars(browser: Browser, viewport: Viewport = DESKTOP): Promise<Visit> {
  const opened = await visit(browser, '/', viewport);
  const performers = Array.from({ length: 6 }, (_, at) => ({
    id: 96_000 + at, k: `Demo performer ${at + 1}`, n: 30 - at, has_image: false, has_avatar: false, avatar_focus: null, rep: null,
  }));
  const studios = Array.from({ length: 3 }, (_, at) => ({ k: `Demo label ${at + 1}`, n: 20 - at, has_logo: false }));
  const tags = Array.from({ length: 8 }, (_, at) => ({ k: `Demo tag ${at + 1}`, n: 90 - at }));
  await opened.page.route((url) => url.pathname === '/api/tops', (route) =>
    route.fulfill({ json: Number(new URL(route.request().url()).searchParams.get('page') || 0)
      ? { performers: [], studios: [] } : { performers, studios } }));
  await opened.page.route((url) => url.pathname === '/api/facets', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), tags } });
  });
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('[data-catalog-filter] [data-catalog-tag]').first().waitFor({ timeout: 15_000 });
  await opened.page.locator('[data-catalog-filter] [data-tier-studio]').first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

export interface CatalogFixture {
  total: number;
  items: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Takes a real catalog response from the demo library that renders in full, replacing only the fields the current rule needs. */
export async function openCatalogFixture(
  browser: Browser,
  change: (payload: CatalogFixture, url: URL) => void,
  { completeFirstPage = false }: { completeFirstPage?: boolean } = {},
): Promise<Visit> {
  const opened = await visit(browser, '/', DESKTOP);
  const baselines = new Map<string, CatalogFixture>();
  await opened.page.route(/\/api\/items\?/, async (route) => {
    const url = new URL(route.request().url());
    /* When `visit()` returns, the first screen may still be fetching the next page in the background. If the route takeover first hits offset>0,
       that response might legitimately have no cards and cannot serve as the first-screen baseline; let the old request finish as-is, then build the fixture
       after reload from the offset=0 response. */
    if (url.searchParams.get('offset') !== '0') {
      await route.continue();
      return;
    }
    const key = url.searchParams.get('orient') || '';
    let baseline = baselines.get(key);
    if (!baseline) {
      const fixtureUrl = new URL(url);
      if (completeFirstPage && !fixtureUrl.searchParams.has('orient')) fixtureUrl.searchParams.set('limit', '60');
      const response = await route.fetch({ url: fixtureUrl.href });
      baseline = await response.json() as CatalogFixture;
      baselines.set(key, baseline);
    }
    const payload = structuredClone(baseline);
    change(payload, url);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('[data-catalog-filter] [data-count-readout]').waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** A scan and collection pass caught mid-run. */
export const RUNNING_JOB = { status: 'running', stage: 'Scrape missing profiles', checked: 38, total: 100 };

/** A scan-and-collect run that broke halfway and piled up a long issue list: the demo library can produce neither. */
export const FAILED_JOB = {
  status: 'failed', job_id: 'one', error: 'Processing was interrupted; check the media folders and retry.',
  issue_count: 347, issues_truncated: true, retryable_asset_ids: [1, 2],
  issues_log: 'C:\\peach-data\\state\\library-processing-demo.issues.jsonl',
  issue_preview: Array.from({ length: 20 }, (_, at) => ({
    asset_id: at + 1, title: `example-${at + 1}.mp4`, path: `B:\\Codes\\example-${at + 1}.mp4`,
    message: 'Cover not fetched: javdb: this run\'s harvest quota is used up; run again to continue harvesting; existing images are kept',
  })),
};

/** One follow source. Fields follow `_source_payload` (`src/peach/web_follow.py`). */
export const followSource = (id: number, author: string, provider: string, label: string, status = 'ok') => ({
  id, provider: provider.toLowerCase(), provider_label: provider, ref: `ref/${id}`, label,
  url: `https://example.com/${id}`, enabled: true, last_status: status,
  last_checked_at: '2026-09-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z',
  author_key: `name:${author}`, author_name: author,
});

/** One site's credential state. Fields follow `/api/follow/credentials`. */
export const followCredential = (provider: string, requirement: string, present: boolean, missing: string[]) => ({
  provider: provider.toLowerCase(), provider_label: provider, followable: true, requirement,
  needs: missing, fields: present ? ['cookie'] : [], missing, present,
});

/** The follows-management page opens with a fabricated source and credentials: the demo library has no follow sources and cannot cover all four credential situations.
 *  Site icons as in `openScraping`: fabricated sources fetch no icon, so give it an image that loads. */
export async function openFollowManage(browser: Browser, viewport = DESKTOP, data: FollowManageData = {}): Promise<Visit> {
  const opened = await visit(browser, '/subscriptions', viewport);
  await stubFollowManage(opened.page, data);
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('section[aria-label="kou\'s follow sources"]').waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** Swap the counts and add a few entries after the three sources: for measuring against extreme content. */
interface FollowManageData {
  counts?: Record<string, number>;
  extra?: Record<string, unknown>[];
}

export async function stubFollowManage(page: Page, { counts, extra = [] }: FollowManageData = {}): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/follow?summary=1', (route) => route.fulfill(json({
    sources: [
      followSource(1, 'kou', 'Kemono', 'kou · Kemono'),
      followSource(2, 'kou', 'Pawchive', 'kou · Pawchive'),
      followSource(3, 'mira', 'Kemono', 'mira · Kemono', 'error'),
      ...extra,
    ],
    counts: counts || { new: 0, seen: 0, saved: 0, ignored: 0 },
    author_aliases: [{ canonical_key: 'kou', canonical_name: 'kou', aliases: [{ key: 'kou_art', name: 'kou_art' }] }],
    alias_suggestions: [],
    suggestions: [],
  })));
  await page.route('**/api/follow/credentials', (route) => route.fulfill(json({
    root: 'C:\\peach\\creds',
    providers: [
      followCredential('Fanbox', 'required', false, ['FANBOXSESSID']),
      followCredential('Patreon', 'optional', true, []),
      followCredential('OnlyFans', 'blocked', false, []),
      followCredential('Kemono', 'none', false, []),
    ],
  })));
  await page.route('**/source-icon**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  /* The server's scheduled check may be running; that pass keeps every check key on aria-busy and settle never finishes. */
  await page.route('**/api/follow/check', (route) => (route.request().method() === 'GET'
    ? route.fulfill(json({ status: 'idle' })) : route.fallback()));
}

/** Holds `/api/` requests until the returned `release()` is called: the first-screen skeleton stays up, and requests pass through once measuring is done.
 *  Stubs registered earlier still apply: release goes through `fallback()`, handing requests to them or the real server. */
export async function holdApi(page: Page): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname.startsWith('/api/') && url.pathname !== '/api/settings', async (route) => {
    await gate;
    await route.fallback().catch(() => {});
  });
  return release;
}

/** A control group's current look: fill, text color, border, radius and outer dimensions, plus the button group's selected marker. */
export async function controlFaces(page: Page, selectors: Record<string, string>) {
  return page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, selector]) => {
    const node = document.querySelector(selector);
    if (!node) return [name, null];
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return [name, {
      face: `${style.backgroundColor} ${style.backgroundImage}`, ink: style.color,
      edge: `${style.borderTopWidth} ${style.borderTopColor}`, radius: style.borderTopLeftRadius,
      size: `${Math.round(box.width)}x${Math.round(box.height)}`, pressed: node.getAttribute('aria-pressed'),
    }];
  })), selectors);
}

/** Open a person page for someone with new releases on order and a row of co-performers. The demo library has no person entities, so the profile follows the shape the server sends down. */
export async function openPerformer(browser: Browser, viewport = DESKTOP): Promise<Visit> {
  const name = '七沢みあ';
  const opened = await visit(browser, '/', viewport);
  const costar = (id: number, k: string) => ({ id, k, n: 1, rep: null, has_image: false, has_avatar: false, avatar_focus: null });
  await opened.page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
    id: 90_001, kind: 'performer', canonical_name: name, aliases: [], display_aliases: [],
    user_aliases: [], asset_count: 0, tags: [],
    related_performers: ['本田愛华', '枢木葵', '美谷朱音', '高杉麻里', '高桥圣子', '今井夏帆'].map((k, at) => costar(90_002 + at, k)),
    links: [], metadata: {}, has_image: false, has_avatar: false, avatar_focus: null, representative_asset_id: null,
    entry_links: [
      { site: 'javdb', label: 'JavDB', ordinal: '', slot: 'mark', mark: 'mark-javdb', url: 'https://javdb.com/actors/NPD3' },
      { site: 'missav', label: 'MISSAV', ordinal: '', slot: 'mark', mark: '', url: 'https://missav.ai/actresses/x' },
    ],
    feed: { following: true },
  } }));
  await opened.page.goto(new URL(`/performers/${encodeURIComponent(name)}`, opened.page.url()).href, { waitUntil: 'load' });
  await opened.page.locator('[data-entry-feed]').waitFor({ timeout: 15_000 });
  await opened.page.locator('[data-entity-foot] [data-related-performer]').first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  await opened.page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.classList.remove('dark');
  });
  return opened;
}

/** Photo fixture: one video's two official sample shots plus six local images, all thumbnails 1×1 images, measuring the wall's geometry. */
export async function openPhotoWall(browser: Browser, viewport = DESKTOP): Promise<Visit> {
  const name = '七沢みあ';
  const opened = await visit(browser, '/', viewport);
  const { page } = opened;
  await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
    id: 90_001, kind: 'performer', canonical_name: name, aliases: [], display_aliases: [], user_aliases: [],
    asset_count: 0, tags: [], related_performers: [], links: [], metadata: {}, has_image: false, has_avatar: false,
    avatar_focus: null, representative_asset_id: null, entry_links: [], feed: { following: false },
  } }));
  // The next page never returns: "Load more" stays busy, the wall stops changing, and the button's geometry can be measured.
  await page.route(/\/api\/photos\?/, (route) => Number(new URL(route.request().url()).searchParams.get('offset') || 0) ? undefined : route.fulfill({ json: {
    kind: 'performer', name, entity_id: 90_001, total: 12, seed: '', has_more: true, sample_total: 2,
    items: Array.from({ length: 6 }, (_, i) => ({ id: 200 + i, name: `${200 + i}.jpg`, size: 1, location: 'media' })),
    sets: [{ id: 'code:SSIS-057', kind: 'code', code: 'SSIS-057', name: '雨の日', title: 'SSIS-057 Rainy Day', n: 2,
      release_date: '2021-05-18', site: 'dmm', site_label: 'DMM', has_cover: true }],
  } }));
  await page.route(/\/(?:photo-thumb|sample-thumb)\?/, (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  await page.goto(new URL(`/performers/${encodeURIComponent(name)}?media=photos`, page.url()).href, { waitUntil: 'load' });
  await page.locator('[data-local-wall] [data-photo-cell] img').first().waitFor({ timeout: 15_000 });
  // The next-page sentinel starts fetching a screen early, so this short wall goes for that page as soon as it appears; it is covered from above, and that key's busy state does not count as the page waiting.
  await settle(page, 'body', { except: '[data-entity-more]' });
  return opened;
}

/** Layout of the local image wall: the grid counts column widths, the masonry counts column-count. */
export const photoWallFaces = (page: Page) => page.evaluate(() => {
  const wall = document.querySelector<HTMLElement>('[data-local-wall]')!;
  const style = getComputedStyle(wall);
  const cell = wall.querySelector<HTMLElement>('[data-photo-cell]')!;
  const box = cell.getBoundingClientRect();
  return {
    display: style.display,
    columns: style.display === 'grid' ? style.gridTemplateColumns.split(' ').length : Number(style.columnCount),
    gap: style.columnGap,
    square: Math.abs(box.width - box.height) <= 1,
  };
});

/** A photo archive with `count` local images and a lightbox that opens the first one. The large image is an SVG at `width`×`height`; all image endpoints return stubs,
 *  since `/photo` originals go through metered sources and design cases never touch the real ones. */
export async function openLightbox(browser: Browser, { count, width, height }: { count: number; width: number; height: number }):
  Promise<Visit & { box: Locator }> {
  const name = '七沢みあ';
  const opened = await visit(browser, '/', DESKTOP);
  const { page } = opened;
  const svg = (w: number, h: number) => ({ status: 200, contentType: 'image/svg+xml',
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#3a4a5a"/></svg>` });
  await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
    id: 90_001, kind: 'performer', canonical_name: name, aliases: [], display_aliases: [], user_aliases: [],
    asset_count: 0, tags: [], related_performers: [], links: [], metadata: {}, has_image: false, has_avatar: false,
    avatar_focus: null, representative_asset_id: null, entry_links: [], feed: { following: false },
  } }));
  await page.route(/\/api\/photos\?/, (route) => route.fulfill({ json: {
    kind: 'performer', name, entity_id: 90_001, total: count, seed: '', has_more: false, sample_total: 0, sets: [],
    items: Array.from({ length: count }, (_, i) => ({ id: 300 + i, name: `${300 + i}.jpg`, size: 1, location: 'media' })),
  } }));
  await page.route(/\/photo\?/, (route) => route.fulfill(svg(width, height)));
  await page.route(/\/photo-thumb\?/, (route) => route.fulfill(svg(160, 120)));
  await page.goto(new URL(`/performers/${encodeURIComponent(name)}?media=photos`, page.url()).href, { waitUntil: 'load' });
  await page.locator('[data-photo-cell] img').first().waitFor({ timeout: 15_000 });
  await settle(page);
  await page.locator('[data-photo-cell]').first().click();
  const box = page.locator('dialog[data-photo-lightbox][open]');
  await box.waitFor();
  await page.waitForFunction(() => document.querySelector<HTMLImageElement>('[data-photo-main] .swiper-slide-active img')!
    .naturalWidth > 0, undefined, { timeout: 10_000 });
  return { ...opened, box };
}

/** A performer with minnano-av data. `profile` and `name_groups` follow `peach.entity_profile.header`'s shape,
 *  with the debut title deliberately very long: the profile table's cell must truncate on one line. */
export const PROFILED = {
  name: '篠田ゆう',
  profile: {
    birth_date: '1991-07-21', age: 35, height: 155, bust: 86, waist: 60, hip: 87, cup: 'F',
    debut_date: '2010-12-02', debut_title: 'Sekirara ~ Loose sex lives of the current generation ~ 03 Record of an amateur girl flustered by her first shoot',
    active: { from: '2010', to: '2023' },
    tags: ['Pretty breasts', 'Pretty butt', 'Yuri', 'Anal', 'Big breasts', 'Good looks', 'Slender', 'Tall', 'Bushy'],
  },
  name_groups: {
    reading: 'しのだゆう', shown: ['篠崎ゆう子', '高木早希', '橋本真紀'], total: 7,
    groups: [
      { label: 'Former name', names: [{ name: '篠崎ゆう子', reading: 'しのざきゆうこ' }] },
      { label: '舞ワイフ', names: [{ name: '橋本真紀' }, { name: '桧山彩音' }, { name: '篠田杏奈' }] },
      { label: 'ラグジュTV', names: [{ name: '高木早希' }] },
      { label: 'Other', names: [{ name: '城田優子' }] },
    ],
  },
};

/** Open a performer with a profile: profile table, name row, and external links written in the shape the server hands down, theme switched by parameter.
 *  `extra` overrides profile fields: by default no watch row (`entry_links` only has the minnano-av pill, no `feed`);
 *  geometry with both rows present is verified by adding them here. */
export async function openProfiledPerformer(browser: Browser, viewport = DESKTOP, theme: 'light' | 'dark' = 'light',
  extra: Record<string, unknown> = {}): Promise<Visit> {
  const opened = await visit(browser, '/', viewport);
  await opened.page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
    id: 90_101, kind: 'performer', canonical_name: PROFILED.name, aliases: ['篠崎ゆう子'], display_aliases: ['篠崎ゆう子'],
    user_aliases: [], asset_count: 42, tags: [], related_performers: [], metadata: {},
    has_image: false, has_avatar: false, avatar_focus: null, representative_asset_id: null,
    agency: { id: 90_102, canonical_name: 'New Actor eXperience', source: 'test', checked_at: '' },
    links: [
      { link_id: 90_201, link_kind: 'official', clickable: true, label: 'New Actor eXperience',
        url: 'https://official.nax-pro.com/actress/shinoda' },
      { link_id: 90_202, link_kind: 'social', clickable: true, label: 'X @shinoda_yu', url: 'https://x.com/shinoda_yu' },
    ],
    entry_links: [{ site: 'minnano-av', label: 'みんなのAV', ordinal: '', slot: 'pill', mark: 'brand-minnano',
      url: 'https://www.minnano-av.com/actress12345.html' }],
    profile: PROFILED.profile, name_groups: PROFILED.name_groups,
    ...extra,
  } }));
  // These links are fabricated and the server's favicon cannot be fetched; that is a different criterion, so here a loadable image is provided.
  await opened.page.route('**/link-mark**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  await opened.page.goto(new URL(`/performers/${encodeURIComponent(PROFILED.name)}`, opened.page.url()).href, { waitUntil: 'load' });
  await opened.page.locator('[data-entity-card] [data-entity-links]').waitFor({ timeout: 15_000 });
  await settle(opened.page);
  await opened.page.evaluate((dark) => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', dark);
  }, theme === 'dark');
  return opened;
}

/** The profile card popover's shadow must be the same one as the legacy `.popmenu`: create an empty `.popmenu` on the same page and read its computed value. */
export async function popmenuShadow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const menu = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'popmenu' }));
    const shadow = getComputedStyle(menu).boxShadow;
    menu.remove();
    return shadow;
  });
}

/** A video's thumbnail in the dropdown. Fields follow `_suggest_work_card` (`src/peach/web_entity.py`). */
export const suggestCard = (id: number) => ({ id, code: `ABW-${id % 1000}`, has_cover: true, has_thumb: false, cover_frame: null, poster_box: null });

/** One input segment hits completions in three categories, performers, labels, and videos; fields follow `q_suggest`. The demo library has no performer entities. */
export const SUGGEST = {
  q: '涼森',
  groups: [
    { kind: 'performer', label: 'Performers', total: 2, items: [
      { value: '涼森れむ', n: 128, matched: '', id: null, entity_id: 90_301, has_image: true, avatar_focus: null, rep: null,
        agency: 'Capsule Agency', works: [1, 2, 3, 4].map((at) => suggestCard(90_400 + at)) },
      { value: '涼森ひより', n: 3, matched: 'すずもりひより', id: null, entity_id: 90_302, has_image: false, rep: null,
        agency: '', works: [] },
    ] },
    { kind: 'studio', label: 'Labels', total: 1, items: [
      { value: 'Prestige', n: 900, matched: '', id: null, entity_id: 90_303, has_image: false, has_logo: true },
    ] },
    { kind: 'asset', label: 'Videos', total: 12, items: [1, 2, 3, 4, 5].map((at) => ({
      value: `ABW-${500 + at}`, n: 0, matched: '', id: 90_500 + at, code: `ABW-${500 + at}`,
      title: 'Appearances', who: '涼森れむ', card: suggestCard(90_500 + at),
    })) },
  ],
};

/** Autocomplete, images in the dropdown and the profile page it opens all answer from the fabricated data above. Each completion request returns the kind it asked for.
 *  Images for fabricated entities and codes cannot be fetched from the server; that is a separate criterion, so here it gets an image that loads. */
export async function stubSuggest(page: Page): Promise<string[]> {
  const kinds: string[] = [];
  await page.route(/\/api\/suggest\?/, (route) => {
    const kind = new URL(route.request().url()).searchParams.get('kind') || '';
    kinds.push(kind);
    return route.fulfill({ json: { q: SUGGEST.q, groups: SUGGEST.groups.filter((group) => !kind || group.kind === kind) } });
  });
  await page.route(/\/(?:cover|entity-image|avatar|logo)\?/, (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
    id: 90_301, kind: 'performer', canonical_name: '涼森れむ', aliases: [], display_aliases: [], user_aliases: [],
    asset_count: 0, tags: [], related_performers: [], links: [], metadata: {}, entry_links: [],
    has_image: false, has_avatar: false, avatar_focus: null, representative_asset_id: null,
  } }));
  return kinds;
}

/** The profile card's current geometry: the identity column, the details table and the card's outer frame, plus which side the details table's divider sits on. */
export async function heroGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null;
    };
    const hero = document.querySelector('[data-entity-card]')!;
    const facts = document.querySelector('[data-entity-facts]');
    const style = facts ? getComputedStyle(facts) : null;
    return {
      hero: rect('[data-entity-card]'), identity: rect('[data-entity-identity]'), facts: rect('[data-entity-facts]'),
      heroScrolls: hero.scrollWidth > hero.clientWidth + 1,
      rule: style ? { left: style.borderLeftWidth, top: style.borderTopWidth } : null,
      labels: [...document.querySelectorAll('[data-entity-facts] dt')].map((dt) => dt.textContent!.trim()),
    };
  });
}

/** The disabled tier's three colors (the peach-web-ui rule "button hover lifts fill only"): `--surface` base, `--border-15` border, `--muted` text. */
export async function disabledTokens(page: Page) {
  return {
    face: await tokenColor(page, '#main', '--surface'),
    ink: await tokenColor(page, '#main', '--muted'),
    ring: await tokenColor(page, '#main', '--border-15'),
  };
}

/** The current look and state of the skeleton's data-waiting action buttons, in document order. */
export async function waitingActionFaces(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((buttons) => buttons.map((button) => {
    const style = getComputedStyle(button);
    return {
      name: (button.getAttribute('aria-label') || button.textContent || '').trim(),
      disabled: (button as HTMLButtonElement).disabled, cursor: style.cursor, opacity: style.opacity,
      face: style.backgroundColor, image: style.backgroundImage, ink: style.color, ring: style.boxShadow,
      split: !!button.closest('[data-split-button]'),
    };
  }));
}

export function assertDisabledFace(face: Awaited<ReturnType<typeof waitingActionFaces>>[number],
  expected: Awaited<ReturnType<typeof disabledTokens>>): void {
  assert.equal(face.disabled, true, `${face.name} is not disabled in the skeleton`);
  assert.equal(face.cursor, 'not-allowed', `${face.name}'s cursor in the skeleton is not the disabled one`);
  assert.equal(face.opacity, '1', `${face.name} disabled state relies on opacity, not a color swap`);
  assert.equal(face.face, expected.face, `${face.name} in the skeleton is not the disabled background`);
  assert.equal(face.image, 'none', `${face.name} still shows the gradient in the skeleton`);
  assert.equal(face.ink, expected.ink, `${face.name} in the skeleton is not the disabled text color`);
  // The split key's outer ring is drawn on the whole group; a ring on each half would leave two lines down the middle seam.
  if (!face.split) assert.ok(face.ring.includes(expected.ring), `${face.name} ring is not disabled in the skeleton: ${face.ring}`);
}

/** Switch to the other column of the follows management page. A pending-setup count may trail the column name, so match on the prefix. */
export async function followTab(opened: Visit, name: string): Promise<void> {
  await opened.page.locator('#stats').getByRole('tab', { name: new RegExp(`^${name}`) }).click({ timeout: 5_000 });
  await settle(opened.page);
}

/** One browser per design-decision file, swapped out after at most 8 cases so page and image caches cannot accumulate unbounded.
 * `assign` receives the new browser each time it is swapped in; cases in the file keep reading the same `browser` variable. */
export function installDesignBrowser(assign: (browser: Browser) => void): void {
  let browser: Browser;
  let browserTests = 0;

  before(async () => {
    browser = await launch();
    assign(browser);
  });

  beforeEach(async () => {
    if (browserTests === 8) {
      await browser.close();
      browser = await launch();
      assign(browser);
      browserTests = 0;
    }
    browserTests += 1;
  });

  after(async () => {
    await browser.close();
  });
}
