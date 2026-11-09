import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { DETAIL, openFollowFeed } from './follow-fixture.ts';
import { ITEM, openItemPage } from './item-fixture.ts';
import { launch, VIEWPORTS } from './harness.ts';

async function hoverClearance(page: Page, longHover: boolean) {
  const row = page.locator('#stage [data-related-row]');
  await row.evaluate(node => { node.scrollLeft = 0 });
  const card = row.locator('[data-media-card]').first();
  await card.hover();
  const edges = await card.evaluate(node => {
    const card = node.getBoundingClientRect();
    const row = node.closest('[data-related-row]')!.getBoundingClientRect();
    return [card.left - row.left, card.top - row.top, row.bottom - card.bottom];
  });
  assert.ok(edges.every(edge => edge >= 8 - .5), `The 8px hover surface is clipped by the scroll box: ${JSON.stringify(edges)}`);
  if (longHover) {
    const expanded = await card.evaluate(node => {
      node.setAttribute('data-longhover', '');
      node.getBoundingClientRect();
      node.getAnimations().forEach(animation => animation.finish());
      const card = node.getBoundingClientRect(), row = node.closest('[data-related-row]')!.getBoundingClientRect();
      return [card.left - row.left, card.top - row.top, row.bottom - card.bottom];
    });
    assert.ok(expanded.every(edge => edge >= 8.52 - .5), `The enlarged hover surface is clipped: ${JSON.stringify(expanded)}`);
    await card.evaluate(node => {
      node.removeAttribute('data-longhover');
      node.getBoundingClientRect();
      node.getAnimations().forEach(animation => animation.finish());
    });
  }
  await row.evaluate(node => { node.scrollLeft = node.scrollWidth - node.clientWidth });
  const right = await row.locator('[data-media-card]').last().evaluate(node =>
    node.closest('[data-related-row]')!.getBoundingClientRect().right - node.getBoundingClientRect().right);
  assert.ok(right >= 8 - .5, `The last card's hover surface is clipped: ${right}px`);
  if (longHover) {
    const last = row.locator('[data-media-card]').last();
    await last.hover();
    const expandedRight = await last.evaluate(node => {
      node.setAttribute('data-longhover', '');
      node.getBoundingClientRect();
      node.getAnimations().forEach(animation => animation.finish());
      return node.closest('[data-related-row]')!.getBoundingClientRect().right - node.getBoundingClientRect().right;
    });
    assert.ok(expandedRight >= 8.52 - .5, `The last expanded card is clipped: ${expandedRight}px`);
    await last.evaluate(node => {
      node.removeAttribute('data-longhover');
      node.getBoundingClientRect();
      node.getAnimations().forEach(animation => animation.finish());
    });
  }
}

describe('The details footer\'s queue and recommendations', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });

  it('The volumes queue uses the details entity avatar', async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.part}?parts=${ITEM.part}`, VIEWPORTS[0]!);
    try {
      const images = opened.page.locator('#stage [data-queue-item="21"] .mav img');
      assert.equal(await images.count(), 2);
      assert.match(await images.first().getAttribute('src') || '', /entity-image\?kind=performer&id=1/);
      await opened.page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(
        '#stage [data-queue-item="21"] .mav img')].every(image => image.complete && image.naturalWidth > 0));
    } finally { await opened.close() }
  });

  for (const viewport of VIEWPORTS) for (const kind of ['local', 'follow'] as const) {
    it(`${viewport.name} ${kind}: the Continue watching empty state shows the full description`, { timeout: 60_000 }, async () => {
      const opened = kind === 'local'
        ? await openItemPage(browser, `/assets/${ITEM.plain}`, viewport)
        : await openFollowFeed(browser, `/posts/${DETAIL.collection}`, viewport,
          { ready: '#stage [data-follow-queue]', settings: { relatedLimit: 12 } });
      try {
        const page = opened.page;
        await page.route(kind === 'local' ? '**/api/related?*' : '**/api/follow?*', route => {
          if (kind === 'follow' && new URL(route.request().url()).searchParams.has('item')) return route.fallback();
          return route.fulfill({ json: kind === 'local' ? { items: [] }
            : { groups: [], sources: [], author_aliases: [], has_more: false } });
        });
        await page.reload({ waitUntil: 'load' });
        const empty = page.locator('#stage [data-item-related] [data-empty-state]');
        await empty.waitFor({ state: 'visible' });
        assert.equal(await empty.locator('h3').textContent(), 'Nothing to continue watching yet');
        assert.equal(await empty.locator('p').textContent(), 'You can go back to the list to pick another video.');
        const box = await empty.boundingBox();
        assert.ok(box && box.width > 0 && box.x >= 0 && box.x + box.width <= viewport.width + 1);
        assert.equal(await page.locator('#stage [data-item-related] [aria-busy="true"]').count(), 0);
        await empty.scrollIntoViewIfNeeded();
        await page.locator('#stage').screenshot({ path: `../build/detail-hover-avatar/${kind}-${viewport.name}-empty.png` });
        assert.deepEqual(opened.problems.filter(problem => !problem.includes('VIDEOJS')), []);
      } finally { await opened.close() }
    });

    it(`${viewport.name} ${kind}: episodes and recommendations share the layout, hover surface intact`, { timeout: 60_000 }, async () => {
      const opened = kind === 'local'
        ? await openItemPage(browser, `/assets/${ITEM.part}?parts=${ITEM.part}`, viewport)
        : await openFollowFeed(browser, `/posts/${DETAIL.collection}`, viewport,
          { ready: '#stage [data-follow-queue]' });
      try {
        const page = opened.page;
        await page.locator('#stage [data-related-row] [data-media-card]').first().waitFor({ timeout: 15_000 });
        const boxes = await page.evaluate(() => {
          const queue = document.querySelector('#stage [data-mix-queue]')!;
          const related = document.querySelector('#stage [data-item-related]')!;
          const q = queue.getBoundingClientRect(), r = related.getBoundingClientRect();
          const queuePic = queue.querySelector('[data-mix-item-pic]')!.getBoundingClientRect();
          const relatedPic = related.querySelector('[data-media-pic]')!.getBoundingClientRect();
          return { q: { top: q.top, bottom: q.bottom, right: q.right }, r: { top: r.top, left: r.left },
            covers: { queue: { top: queuePic.top, height: queuePic.height }, related: { top: relatedPic.top, height: relatedPic.height } },
            sameSurface: getComputedStyle(queue).backgroundColor === getComputedStyle(related).backgroundColor };
        });
        if (viewport.mobile) assert.ok(boxes.r.top >= boxes.q.bottom - .5, JSON.stringify(boxes));
        else {
          assert.ok(Math.abs(boxes.q.top - boxes.r.top) <= .5 && boxes.q.right <= boxes.r.left + .5, JSON.stringify(boxes));
          assert.ok(boxes.sameSurface, 'Queue and recommendations should share a background');
          assert.ok(Math.abs(boxes.covers.queue.top - boxes.covers.related.top) <= .5,
            `Cover top edges must align: ${JSON.stringify(boxes.covers)}`);
          assert.ok(Math.abs(boxes.covers.queue.height - boxes.covers.related.height) <= .5,
            `Cover heights must match: ${JSON.stringify(boxes.covers)}`);
          const bigCover = await page.locator('#stage [data-related-row] [data-media-pic]').first().evaluate(node => {
            const picture = node as HTMLElement;
            const ratio = picture.style.getPropertyValue('--card-ratio');
            picture.style.setProperty('--card-ratio', '.75');
            const height = picture.getBoundingClientRect().height;
            picture.style.setProperty('--card-ratio', ratio);
            return height;
          });
          assert.ok(Math.abs(bigCover - boxes.covers.queue.height) <= .5, `Large-ratio recommendation covers must share one height: ${bigCover}`);
        }
        await hoverClearance(page, kind === 'local' && !viewport.mobile);
        await page.locator('#stage [data-related-row]').evaluate(node => { node.scrollLeft = 0 });
        await page.locator('#stage [data-related-row] [data-media-card]').first().hover();
        await page.locator('#stage').screenshot({ path: `../build/detail-hover-avatar/${kind}-${viewport.name}.png` });
        assert.deepEqual(opened.problems.filter(problem => !problem.includes('VIDEOJS')), []);
      } finally { await opened.close() }
    });
  }
});
