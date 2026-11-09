/* "Which site this entry came from" in follows is always shown by site icon, with the site name only in the icon's
 * alt/title.
 *
 * Two places are guarded: the video compilation's queue cards under details (source icon, marks and time centered on one
 * line), and the cards' "see also" badges (together with the edition marks' status-badge look). The demo library has no follow
 * sources, so per `_group_payload` (`src/peach/web_follow.py`) this builds one cross-site entry: the main entry on Fanbox and
 * two more on Rule34.xxx. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { launch, settle, visit, VIEWPORTS, type Visit } from './harness.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;

/** A 1x1 transparent PNG: the site icon's request has an image to land on, and what is measured is the geometry it lays out. */
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** One playable follow video. Fields follow `_item_payload`. */
const followVideo = (id: number, provider: string, label: string, publishedAt: string) => ({
  id, provider, provider_label: label, resource_provider: provider, source_id: 1,
  source_label: `Demo · ${label}`, external_id: String(id), title: `Demo video ${id}`,
  author: null, summary: null, url: `https://example.com/${id}`, thumb_url: null,
  published_at: publishedAt, published_precision: 'exact', version: null, duration: 20,
  variant_kind: null, variant_label: null, status: 'new', asset_id: null,
  media_needs_credential: false, media_error: null, has_media: true, media_kind: 'video',
  width: null, height: null, playable: true, media_type: 'video/mp4', media_items: [],
  hidden_media: [], resource_urls: [], tags: [], detail_tags: [], tag_types: {},
});

const GROUP = {
  release_key: 'demo-release',
  primary: followVideo(1, 'fanbox', 'pixivFANBOX', '2026-09-16T00:20:00Z'),
  variants: [],
  duplicates: [
    followVideo(2, 'rule34xxx', 'Rule34.xxx', '2026-09-16T00:19:00Z'),
    followVideo(3, 'rule34xxx', 'Rule34.xxx', '2026-09-16T00:16:00Z'),
  ],
  providers: ['fanbox', 'rule34xxx'],
  has_wip: false,
  is_release: false,
  newest_at: '2026-09-16T00:20:00Z',
  stack: null,
};

/** The main entry is on Fanbox but has no video: the card face switches to the latest Rule34.xxx entry in the group, and See also should list Fanbox and Pawchive. */
const FRONTED = {
  ...GROUP,
  release_key: 'demo-fronted',
  primary: { ...followVideo(11, 'fanbox', 'pixivFANBOX', '2026-09-15T00:20:00Z'),
    has_media: false, media_kind: null, playable: false, duration: null },
  duplicates: [
    followVideo(12, 'rule34xxx', 'Rule34.xxx', '2026-09-15T00:19:00Z'),
    followVideo(13, 'pawchive', 'Pawchive', '2026-09-15T00:16:00Z'),
  ],
  providers: ['fanbox', 'pawchive', 'rule34xxx'],
  newest_at: '2026-09-15T00:20:00Z',
};

async function stubFollow(page: Page): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route((url) => url.pathname === '/api/follow', (route) => route.fulfill(json({
    groups: [GROUP, FRONTED], sources: [], counts: { new: 2, seen: 0, saved: 0, ignored: 0 },
    facets: { authors: [], providers: ['fanbox', 'pawchive', 'rule34xxx'] }, has_more: false,
  })));
  await page.route('**/api/follow/credentials', (route) => route.fulfill(json({ providers: [] })));
  /* The server's scheduled check may be running; that pass keeps the check key on aria-busy and settle never finishes. */
  await page.route('**/api/follow/check', (route) => (route.request().method() === 'GET'
    ? route.fulfill(json({ status: 'idle' })) : route.fallback()));
  await page.route('**/source-icon**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
  }));
  // The fabricated entry has no feature film; this case measures the queue card, and the player just needs to receive an empty response.
  await page.route('**/follow-stream**', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/follow-qualities**', (route) => route.fulfill(json({})));
}

async function openFollow(browser: Browser, path: string, ready: string): Promise<Visit> {
  const opened = await visit(browser, path, DESKTOP);
  await stubFollow(opened.page);
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator(ready).first().waitFor({ timeout: 15_000 });
  await settle(opened.page);
  return opened;
}

/** Each child box's vertical midline within the row, plus the text; whether site name text is mixed into the row is judged from the row's own textContent. */
async function lineGeometry(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((lines) => lines.map((line) => {
    const mid = (node: Element | null) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return box.top + box.height / 2;
    };
    const icon = line.querySelector('img');
    return {
      text: (line.textContent || '').trim(),
      alt: icon?.getAttribute('alt') ?? null,
      title: icon?.getAttribute('title') ?? null,
      icon: mid(icon),
      mark: mid(line.querySelector('[data-follow-variant]')),
      time: mid(line.querySelector('time')),
      line: mid(line),
    };
  }));
}

describe('Follow origins use site icons', () => {
  let browser: Browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser.close();
  });

  it('Compilation queue cards: the source is an icon with the site name, sharing one midline with the time', { timeout: 60_000 }, async () => {
    const opened = await openFollow(browser, '/posts/1', '[data-follow-queue-item]');
    try {
      const rows = await lineGeometry(opened.page, '[data-follow-queue-item] [data-follow-queue-meta]');
      assert.equal(rows.length, 3, `Queue card count is wrong: ${JSON.stringify(rows)}`);
      const duplicates = rows.filter((row) => row.alt !== null);
      assert.equal(duplicates.length, 2, `The two other-site entries have no origin icons: ${JSON.stringify(rows)}`);
      for (const row of duplicates) {
        assert.equal(row.alt, 'Rule34.xxx', 'The source icon carries no site name as its accessible name');
        assert.equal(row.title, 'Rule34.xxx', 'Source icons never announce the site name on hover');
        assert.ok(!row.text.includes('Rule34'), `This row still contains site name text: ${row.text}`);
        assert.ok(Math.abs(row.icon! - row.time!) <= 1, `The icon and time center lines differ by ${Math.abs(row.icon! - row.time!)}px`);
      }
      // This site's row is still marker plus time, both centered in the box the same way.
      const own = rows.find((row) => row.alt === null)!;
      assert.ok(own.mark !== null && Math.abs(own.mark - own.time!) <= 1,
        `Marker differs from the time midline by ${own.mark === null ? 'not captured' : Math.abs(own.mark - own.time!)}px`);
    } finally {
      await opened.close();
    }
  });

  it('The card\'s "also on" badge: other sites list as icons without writing the names as text', { timeout: 60_000 }, async () => {
    const opened = await openFollow(browser, '/follow', '[data-follow-item] [data-follow-seealso]');
    try {
      const [badge] = await lineGeometry(opened.page, '[data-follow-item] [data-follow-seealso]');
      assert.ok(badge, 'The card carries no "also on" badge');
      assert.equal(badge.text, 'Also on');
      assert.equal(badge.alt, 'Rule34.xxx');
      assert.ok(Math.abs(badge.icon! - badge.line!) <= 1, `The icon is off the badge center line by ${Math.abs(badge.icon! - badge.line!)}px`);
      await opened.page.locator('[data-follow-item]:has([data-follow-seealso])').first().hover();
      const source = await opened.page.locator('[data-follow-item]:has([data-follow-seealso]) [data-follow-sources]').first().evaluate(node => {
        const style = getComputedStyle(node);
        return { opacity: style.opacity, visibility: style.visibility, events: style.pointerEvents };
      });
      assert.deepEqual(source, { opacity: '0', visibility: 'hidden', events: 'none' });
    } finally {
      await opened.close();
    }
  });

  /* Design decisions, measured separately from which mark hangs where (`test/react/follow-marks.test.ts`): see-also and
     edition marks are status badges, not tags, with corners on `--badge-radius`; "contains WIP" speaks of another entry in
 * the group and reads one tier weaker than WIP itself; in SFW mode site icons stay unblurred like brand marks. Marks are
 * temporarily placed into card titles in `follow-marks.ts`'s shape for measuring. */
  it('See-also and source icons share the cover corner badge; soft WIP is weaker than WIP, and SFW mode does not blur site icons', { timeout: 60_000 }, async () => {
    const opened = await openFollow(browser, '/follow', '[data-follow-item] [data-follow-seealso]');
    try {
      const look = await opened.page.evaluate(() => {
        const badge = document.querySelector('[data-follow-item] [data-follow-seealso]')!;
        const probe = document.createElement('span');
        probe.style.cssText = 'border-radius:var(--badge-radius);color:var(--muted);background:var(--meter)';
        badge.parentElement!.append(probe);
        const want = getComputedStyle(probe);
        const expected = { radius: want.borderTopLeftRadius, muted: want.color, meter: want.backgroundColor };
        probe.remove();
        const title = badge.closest('[data-follow-item]')!.querySelector('[data-media-title]') ?? badge.parentElement!;
        title.insertAdjacentHTML('afterbegin', '<small class="javedition" data-follow-edition="wip">WIP</small>'
          + '<small class="javedition" data-follow-edition="has-wip">Has WIP</small>');
        const [wip, hasWip] = [...title.querySelectorAll('[data-follow-edition]')].map((node) => getComputedStyle(node));
        const shape = getComputedStyle(badge);
        const source = badge.closest('[data-follow-sources]')!.querySelector('[data-media-badge]')!;
        const sourceShape = getComputedStyle(source);
        const sameSource = { radius: sourceShape.borderTopLeftRadius, background: sourceShape.backgroundColor, shadow: sourceShape.boxShadow };
        document.body.classList.add('censor');
        const icon = getComputedStyle(badge.querySelector('[data-follow-site-icon]')!).filter;
        document.body.classList.remove('censor');
        return { expected, sameSource, radius: shape.borderTopLeftRadius, border: shape.borderTopStyle,
          background: shape.backgroundColor, shadow: shape.boxShadow,
          editionRadius: wip!.borderTopLeftRadius, wip: wip!.color, hasWip: hasWip!.color, icon };
      });
      assert.equal(look.radius, look.sameSource.radius, 'Also-on and source badges share one radius');
      assert.equal(look.background, look.sameSource.background);
      assert.equal(look.shadow, look.sameSource.shadow);
      assert.equal(look.editionRadius, look.expected.radius, 'Edition wording is a state mark too');
      assert.equal(look.border, 'none');
      assert.equal(look.wip, look.expected.meter, 'WIP itself takes --meter');
      assert.equal(look.hasWip, look.expected.muted, '"Has WIP" de-emphasizes to --muted');
      assert.equal(look.icon, 'none', 'Site icons are not blurry in SFW mode');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('When the card face switches to another site, see-also lists the sites of the main entry and not those of the card face itself', { timeout: 60_000 }, async () => {
    const opened = await openFollow(browser, '/follow', '[data-follow-item="12"] [data-follow-seealso]');
    try {
      const card = opened.page.locator('[data-follow-item="12"]');
      const shown = await card.locator('[data-media-badge]').getAttribute('title');
      const alts = await card.locator('[data-follow-seealso] img').evaluateAll((icons) =>
        icons.map((icon) => icon.getAttribute('alt')));
      assert.equal(shown, 'Rule34.xxx', 'The card face does not switch to the video entry');
      assert.deepEqual(alts, ['pixivFANBOX', 'Pawchive'], `The also-seen column's sites are wrong: ${JSON.stringify(alts)}`);
    } finally {
      await opened.close();
    }
  });
});
