/* The performer profile page's photo tier: code samples (ADR-0068).
 *
 * The demo library has no person entities and no samples: profile, photo list, cover, and sample images are all provided here in the API's shape,
 * while the page's own routing, rendering, deep links, and lightbox run as usual. Sample 2 deliberately returns 404, verifying "the unloadable cell keeps its placeholder,
 * and the lightbox still pages through". */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, settle, visit, VIEWPORTS, type Visit } from './harness.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;
const NAME = '七沢みあ';
// A 1x1 PNG used by both the fixture and local images: what is tested here is structure and interaction, not the image.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const MISSING = /\/sample-(?:thumb|image)\?code=SSIS-057&n=2$/;
const SETS = [
  { id: 'code:SSIS-057', kind: 'code', code: 'SSIS-057', name: '雨の日', title: 'SSIS-057 Rainy Day', n: 3,
    release_date: '2021-05-18', site: 'dmm', site_label: 'DMM', has_cover: true },
  { id: 'code:SSIS-001', kind: 'code', code: 'SSIS-001', name: 'Early summer', title: 'SSIS-001 Early Summer', n: 2,
    release_date: '2021-02-19', site: 'dmm', site_label: 'DMM', has_cover: true },
];

type Local = { first: number; more: number };

/** When `local` is provided there are also local images: `first` images on the first page with `has_more` true, and paging requests record the offset. */
async function serveProfile(page: Page, local?: Local): Promise<number[]> {
  const offsets: number[] = [];
  const photo = (id: number) => ({ id, name: `${id}.jpg`, size: 1, location: 'media' });
  await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
    id: 90_001, kind: 'performer', canonical_name: NAME, aliases: [], display_aliases: [],
    user_aliases: [], asset_count: 0, tags: [], related_performers: [], links: [],
    metadata: {}, has_image: false, has_avatar: false, avatar_focus: null,
    representative_asset_id: null, entry_links: [], feed: { following: false },
  } }));
  await page.route(/\/api\/photos\?/, (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0);
    if (offset) offsets.push(offset);
    const items = !local ? [] : offset
      ? Array.from({ length: local.more }, (_, i) => photo(100 + offset + i))
      : Array.from({ length: local.first }, (_, i) => photo(100 + i));
    return route.fulfill({ json: {
      kind: 'performer', name: NAME, entity_id: 90_001, total: local ? local.first + local.more : 0, items,
      seed: '', has_more: Boolean(local) && !offset, sample_total: 5, sets: SETS,
    } });
  });
  await page.route(/\/photo-thumb\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  await page.route(/\/sample-(?:thumb|image)\?/, (route) => MISSING.test(route.request().url())
    ? route.fulfill({ status: 404, json: { error: 'unavailable' } })
    : route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  return offsets;
}

async function openPhotos(browser: Browser, search: string, local?: Local): Promise<Visit & { offsets: number[]; documents: string[] }> {
  let offsets: number[] = [];
  const documents: string[] = [];
  const opened = await visit(browser, `/performers/${encodeURIComponent(NAME)}?${search}`, DESKTOP, async page => {
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url());
    });
    offsets = await serveProfile(page, local);
  });
  try {
    await opened.page.locator('#index [data-entity-readout]', { hasText: 'Photos' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await settle(opened.page);
    return { ...opened, offsets, documents };
  } catch (error) {
    await opened.close();
    throw error;
  }
}

/** The deliberately-404 page does not count as a runtime problem, and the console 404 the browser logs for it is subtracted by count;
 *  everything else must have zero, per the harness's standard. */
function unexpected(problems: string[]): string[] {
  const planted = /^404 \/sample-/;
  let mirrors = problems.filter((problem) => planted.test(problem)).length;
  return problems.filter((problem) => {
    if (planted.test(problem)) return false;
    if (mirrors > 0 && /^console Failed to load resource: .*404/.test(problem)) { mirrors -= 1; return false; }
    return true;
  });
}

/** Each section's header label and the cell count of the wall beneath it, in page order. */
const groups = (page: Page) => page.locator('[data-photo-group]').evaluateAll((heads) => heads.map((head) => [
  head.querySelector('b')?.textContent?.trim() || '',
  head.nextElementSibling?.querySelectorAll('[data-photo-cell]').length ?? -1,
]));

describe('Code samples', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  it('Photo sections appear even when only samples exist; samples are grouped per video by release date, with section headers showing code, title, and source', async () => {
    const opened = await openPhotos(browser, 'media=photos');
    const { page } = opened;
    try {
      assert.equal(opened.documents.length, 1, 'The fixture opens the target profile directly, navigating the page exactly once');
      assert.equal(new URL(opened.documents[0]).pathname, `/performers/${encodeURIComponent(NAME)}`);
      assert.equal(await page.locator('[data-entity-media] [data-media-view="photos"]').getAttribute('aria-pressed'),
        'true');
      assert.deepEqual(await groups(page), [['SSIS-057', 3], ['SSIS-001', 2]]);
      // The first section's 28px section spacing and the filter overlay's 22px bottom margin collapse into one gap instead of stacking.
      const gap = await page.evaluate(() => document.querySelector('[data-photo-group]')!.getBoundingClientRect().top
        - document.querySelector('[data-entity-filter-glass]')!.getBoundingClientRect().bottom);
      assert.ok(Math.abs(gap - 28) <= 1, `The first paragraph sits ${gap}px from the popover`);
      assert.match(await page.locator('[data-photo-group]').first().innerText(), /雨の日[\s\S]*DMM 样张 · 2021-05-18 · 3 张/);
      assert.match(await page.locator('[data-entity-readout]').innerText(), /样张 5 张 · 2 部作品/);
      assert.equal(await page.locator('[data-entity-batch]').count(), 0, 'No local images to swap in');
      assert.equal(await page.locator('[data-photo-back]').count(), 0, 'Samples never open another layer');
      assert.deepEqual(unexpected(opened.problems), [], JSON.stringify(opened.problems));
    } finally {
      await opened.close();
    }
  });

  it('Unfetchable cells keep their placeholders, and the lightbox pages continuously across segments', async () => {
    const opened = await openPhotos(browser, 'media=photos');
    const { page } = opened;
    try {
      await page.waitForFunction(() => !document.querySelector('[data-photo-wall]')?.children[1]?.querySelector('img'));
      const hole = await page.locator('[data-photo-wall] [data-photo-cell]').nth(1).boundingBox();
      assert.ok(hole && hole.height > 0, 'Placeholder cells never collapse');
      await page.locator('[data-photo-wall] [data-photo-cell]').nth(3).click();
      const count = page.locator('dialog[data-photo-lightbox] [data-photo-count]');
      await count.waitFor({ state: 'visible' });
      assert.equal((await count.innerText()).trim(), '4 / 5');
      await page.locator('dialog[data-photo-lightbox] [data-photo-close]').click();
      assert.deepEqual(unexpected(opened.problems), [], JSON.stringify(opened.problems));
    } finally {
      await opened.close();
    }
  });

  it('Sample image sections come before local images; pagination counts only local images', async () => {
    const opened = await openPhotos(browser, 'media=photos', { first: 2, more: 1 });
    const { page } = opened;
    try {
      // "Load more" flips to the next page the moment it enters the viewport: scroll it in, then wait for both pages to settle before reading.
      await page.evaluate(() => document.querySelector('#index [data-entity-more]')?.scrollIntoView());
      await page.waitForFunction(() => document.querySelectorAll('[data-photo-wall] [data-photo-cell]').length === 8);
      assert.deepEqual(await groups(page), [['SSIS-057', 3], ['SSIS-001', 2], ['Local images', 3]]);
      assert.equal(await page.locator('[data-local-wall] [data-photo-cell] img[src^="/photo-thumb"]').count(), 3);
      assert.deepEqual(opened.offsets, [2]);
      assert.deepEqual(unexpected(opened.problems), [], JSON.stringify(opened.problems));
    } finally {
      await opened.close();
    }
  });

  it('Old URLs with a code set id fall back to the full contents of the photo archive', async () => {
    const opened = await openPhotos(browser, `media=photos&set=${encodeURIComponent('code:SSIS-057')}`);
    const { page } = opened;
    try {
      assert.equal(await page.locator('[data-photo-wall] [data-photo-cell]').count(), 5);
      assert.equal(await page.locator('[data-photo-back]').count(), 0);
      assert.deepEqual(unexpected(opened.problems), [], JSON.stringify(opened.problems));
    } finally {
      await opened.close();
    }
  });
});
