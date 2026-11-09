/* The management header and bottom batch bar (`react/manage-header/`, `react/batch-dock/`) in a real browser.
 *
 * Header: title, breadcrumbs and nav align to the content's left edge, with the trash explainer row centered to the body
 * width; the pages where the title collapses on narrow screens, and breadcrumbs taking a plain left click through routing
 * without a full page reload. The trash explainer row placing a placeholder first then landing the readout, without flashing
 * back to the placeholder on same-page re-renders, is measured by the trash geometry case in `design-cards.test.ts`.
 *
 * Batch bar: the keys and counts each context lists for catalog, trash, junk files (pending and excluded) and the follows
 * page. Trash and junk files' lists come from stubs: both are empty in the demo library. Not one write endpoint is clicked. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Locator, Page } from 'playwright-core';

import { openFollowFeed } from './follow-fixture.ts';
import { launch, settle, visit, VIEWPORTS, type Viewport } from './harness.ts';

/** At a 1280 desktop viewport the narrow column is squeezed full by the sidebar, so "centered per --board-content" cannot be measured. */
const WIDE: Viewport = { name: 'wide', width: 1600, height: 900, mobile: false };
const MOBILE = VIEWPORTS.find((viewport) => viewport.mobile)!;

/** Entering the data management hub also fires one off-site link status check; in the demo library that query's result is irrelevant to this file. */
const unrelated = (problems: string[]) => problems.filter((line) => !line.includes('/api/links/check'));

/** `[path, title, breadcrumb current item, narrow-screen collapsed tier]`. Subpages under data management yield the title to the subpage's own name. */
const HEADS = [
  ['/stats', 'Stats', '', false],
  ['/taste', 'Taste', '', false],
  ['/review', 'Manual review', 'Manual review', false],
  ['/data-cleanup', 'Data management', '', true],
  ['/junk-files', 'Junk files', 'Junk files', false],
  ['/duplicates', 'Duplicates', 'Duplicates', false],
  ['/quality-goals', 'HD version', 'HD version', false],
  ['/sources', 'Sources and credentials', 'Sources and credentials', true],
  ['/trash', 'Trash', 'Trash', false],
  ['/subscriptions', 'Manage follows', '', false],
  ['/tasks', 'Task center', '', false],
  ['/settings/library', 'Peach configuration', '', true],
] as const;

const BLOCKS = '[data-manage-header] > :is([data-manage-bar], [data-manage-crumb], [data-manage-title])';

async function readHead(page: Page) {
  await page.locator('[data-manage-title]').waitFor({ timeout: 15_000 });
  return page.evaluate((blocks) => {
    const title = document.querySelector<HTMLElement>('[data-manage-title]')!;
    const crumb = document.querySelector('[data-manage-crumb] [aria-current="true"]');
    return {
      title: title.textContent,
      crumb: crumb?.textContent ?? '',
      font: getComputedStyle(title).fontSize,
      pressed: [...document.querySelectorAll<HTMLElement>('[data-manage][aria-pressed="true"]')].map((node) => node.dataset.manage),
      columns: [...document.querySelectorAll(blocks)].map((node) => {
        const rect = node.getBoundingClientRect();
        return [Math.round(rect.left), Math.round(rect.width)];
      }),
      order: [...document.querySelector('[data-manage-header]')!.children].map(node =>
        node.hasAttribute('data-manage-bar') ? 'bar' : node.hasAttribute('data-manage-crumb') ? 'crumb'
          : node.hasAttribute('data-manage-title') ? 'title' : 'lede'),
      lede: (() => {
        const rect = document.querySelector('[data-manage-lede]')?.getBoundingClientRect();
        return rect ? [rect.left, rect.width] : null;
      })(),
      main: (() => {
        const rect = document.querySelector('#main')!.getBoundingClientRect();
        const style = getComputedStyle(document.querySelector('#main')!);
        return [rect.left + parseFloat(style.paddingLeft), rect.right - parseFloat(style.paddingRight)];
      })(),
    };
  }, BLOCKS);
}

describe('Manage area header', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  it('Manage page title, nav, and body share one centered width', { timeout: 180_000 }, async () => {
    const opened = await visit(browser, '/stats', WIDE);
    try {
      for (const [path, title, crumb] of HEADS) {
        await opened.page.goto(new URL(path, opened.page.url()).href, { waitUntil: 'load' });
        const head = await readHead(opened.page);
        assert.deepEqual([head.title, head.crumb], [title, crumb], `${path}'s title or breadcrumb is wrong`);
        assert.ok(head.columns.length >= 2, `${path} page header measured only ${head.columns.length} blocks`);
        for (const column of head.columns) assert.deepEqual(column, head.columns[0], `${path} header blocks do not share one column: ${JSON.stringify(head.columns)}`);
        const [left, width] = head.columns[0]!;
        const [start, end] = head.main;
        assert.deepEqual(head.order.slice(0, crumb ? 3 : 2), crumb ? ['bar', 'crumb', 'title'] : ['bar', 'title'],
          `${path}'s header does not stack manage nav, breadcrumbs, then title`);
        assert.equal(width, Math.min(1120, Math.round(end - start)), `${path}'s header does not use the body width`);
        assert.ok(Math.abs((left - start) - (end - left - width)) <= 1, `${path}'s header is not center-aligned with the body`);
        if (head.lede) {
          const [ledeLeft, ledeWidth] = head.lede;
          assert.equal(Math.round(ledeWidth), Math.min(1120, Math.round(end - start)));
          assert.ok(Math.abs((ledeLeft - start) - (end - ledeLeft - ledeWidth)) <= 1,
            `${path} trash description is not centered to the body width`);
        }
      }
      assert.deepEqual(unrelated(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('At 390px only the data management hub, sources, credentials, and configuration titles step down one size', { timeout: 180_000 }, async () => {
    const opened = await visit(browser, '/stats', MOBILE);
    try {
      const fonts: Record<string, string> = {};
      for (const [path, , , compact] of HEADS) {
        await opened.page.goto(new URL(path, opened.page.url()).href, { waitUntil: 'load' });
        const head = await readHead(opened.page);
        fonts[path] = head.font;
        assert.equal(head.font === '22px', compact, `${path}'s narrow-screen title is ${head.font}`);
      }
      assert.equal(new Set(Object.entries(fonts).filter(([path]) => !HEADS.find((row) => row[0] === path)![3]).map(([, font]) => font)).size, 1,
        `Narrow-screen titles on the other admin pages are not on the same tier: ${JSON.stringify(fonts)}`);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of VIEWPORTS) {
    it(`A plain left click on the breadcrumb returns to data management without a full page reload, and the admin bar switches its pressed item along (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/duplicates', viewport);
      try {
        const page = opened.page;
        await readHead(page);
        await page.evaluate(() => { (window as unknown as { stayed?: boolean }).stayed = true });
        const link = page.locator('[data-manage-crumb] a');
        assert.equal(await link.getAttribute('href'), '/data-cleanup');
        await link.click();
        await page.waitForFunction(() => location.pathname === '/data-cleanup');
        await page.waitForFunction(() => document.querySelector('[data-manage-title]')?.textContent === 'Data management');
        assert.equal(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed), true, 'Breadcrumb reloads the whole page');
        const head = await readHead(page);
        assert.deepEqual([head.crumb, head.pressed], ['', ['cleanup']]);
        await settle(page);
        assert.deepEqual(unrelated(opened.problems), []);
      } finally {
        await opened.close();
      }
    });
  }
});

/* ── Batch bar ── */

const DOCK = '[data-batch-dock] [data-selection-dock]';

async function pickTwo(cards: Locator) {
  for (const at of [0, 1]) await cards.nth(at).click({ modifiers: ['Control'], position: { x: 20, y: 20 } });
}

async function readDock(page: Page) {
  await page.locator(DOCK).waitFor({ timeout: 10_000 });
  return page.locator(DOCK).evaluate((dock) => ({
    count: dock.querySelector('[role="status"]')?.textContent,
    buttons: [...dock.querySelectorAll('button')].map((button) => button.textContent?.trim()),
  }));
}

/** The trash list replies with the home page's data: the demo library's trash is empty. Read-only; write APIs do not pass through here. */
async function stubTrash(page: Page) {
  await page.route((url) => url.pathname === '/api/items' && url.searchParams.get('state') === 'trash', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.delete('state');
    const response = await route.fetch({ url: url.href });
    const payload = await response.json();
    for (const item of payload.items ?? []) item.disposal = 'trash';
    await route.fulfill({ response, json: payload });
  });
}

/** Junk candidates pick types with no preview: the fabricated ids have no thumbnails to fetch. */
const junkItem = (id: number) => ({ id, name: `promo-${id}.zip`, junk_kind: 'archive', why: 'Filename looks like promo',
  size: 1048576 * id, location: 'local', cost: '' });

async function stubJunk(page: Page) {
  await page.route('**/api/ads?**', (route) => route.fulfill({ json: {
    items: [9301, 9302, 9303].map(junkItem), total: 3, all_total: 3, pending_total: 3, dismissed_total: 3, counts: { archive: 3 },
  } }));
}

describe('Batch bar', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  for (const viewport of VIEWPORTS) {
    it(`Catalog, trash, and junk files each keep their own keys and counts (${viewport.name})`, { timeout: 120_000 }, async () => {
      const opened = await visit(browser, '/', viewport);
      try {
        const page = opened.page;
        const cards = page.locator('#grid [data-media-card][data-id]');
        await cards.first().waitFor({ timeout: 15_000 });
        await settle(page);
        assert.equal(await page.locator(DOCK).count(), 0, 'The bulk bar renders with nothing selected');
        await pickTwo(cards);
        assert.deepEqual(await readDock(page),
          { count: '2 items selected', buttons: ['Like', 'Watched', 'Watch later', 'Decide origin', 'Move to trash', 'Cancel'] });
        await page.locator(`${DOCK} [data-batch-group="clear"]`).click();
        await page.locator(DOCK).waitFor({ state: 'detached', timeout: 10_000 });

        await stubTrash(page);
        await page.goto(new URL('/trash', page.url()).href, { waitUntil: 'load' });
        await cards.first().waitFor({ timeout: 15_000 });
        await settle(page);
        // The "empty trash" key at the right end of the description row: a Geist 32px compact key on desktop, back to this project's 44px touch target on phones.
        const empty = await page.locator('[data-manage-lede] [data-empty-trash]').boundingBox();
        assert.equal(Math.round(empty!.height), viewport.mobile ? 44 : 32, 'Empty trash button height');
        await pickTwo(cards);
        assert.deepEqual(await readDock(page), { count: '2 items selected', buttons: ['Restore', 'Delete permanently', 'Cancel'] });

        await stubJunk(page);
        const junk = page.locator('#grid [data-junk-card]');
        for (const [path, first] of [['/junk-files', 'Not junk'], ['/junk-files?view=dismissed', 'Judge again']] as const) {
          await page.goto(new URL(path, page.url()).href, { waitUntil: 'load' });
          await junk.first().waitFor({ timeout: 15_000 });
          await settle(page);
          await pickTwo(junk);
          assert.deepEqual(await readDock(page), { count: '2 items selected', buttons: [first, 'Move to trash', 'Cancel'] }, path);
        }
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });

    it(`The follows page's keys and counts (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openFollowFeed(browser, '/follow', viewport);
      try {
        await pickTwo(opened.page.locator('[data-follow-list] > [data-follow-item]'));
        assert.deepEqual(await readDock(opened.page), { count: '2 items selected', buttons: ['Save to the database', 'Mark as watched', 'Ignore', 'Cancel'] });
        assert.deepEqual(opened.stub.writes.filter((write) => write.url !== '/api/follow/check'), []);
      } finally {
        await opened.close();
      }
    });
  }
});
