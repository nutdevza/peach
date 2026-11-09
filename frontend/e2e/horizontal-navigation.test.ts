/* The horizontal nav's overflow hints: direction follows scroll position, recomputed after the container resizes, with the native scrollbar taking no space. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser, Locator } from 'playwright-core';
import { launch, settle, visit, VIEWPORTS } from './harness.ts';
import { openFollowFeed } from './follow-fixture.ts';

const MOBILE = VIEWPORTS.find(viewport => viewport.mobile)!;

async function edges(row: Locator, left: boolean, right: boolean) {
  await row.page().waitForFunction(([selector, expectedLeft, expectedRight]) => {
    const node = document.querySelector<HTMLElement>(selector);
    return node?.dataset.overflowLeft === String(expectedLeft)
      && node?.dataset.overflowRight === String(expectedRight);
  }, [await row.evaluate(node => {
    node.setAttribute('data-scroll-test', 'active');
    return '[data-scroll-test="active"]';
  }), left, right], { timeout: 5_000 });
  const style = await row.evaluate(node => ({
    bar: getComputedStyle(node).scrollbarWidth,
    mask: getComputedStyle(node).maskImage,
  }));
  assert.equal(style.bar, 'none', 'Horizontal navigation shows a native scrollbar');
  assert.equal(style.mask.includes('linear-gradient'), left || right, 'Edge hints do not match the scrollable directions');
  await row.evaluate(node => node.removeAttribute('data-scroll-test'));
}

async function scrollPositions(row: Locator) {
  const range = await row.evaluate(node => node.scrollWidth - node.clientWidth);
  assert.ok(range > 10, `The fixture produced no horizontal overflow: ${range}`);
  await row.evaluate(node => { node.scrollLeft = 0 });
  await edges(row, false, true);
  await row.evaluate(node => { node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2 });
  await edges(row, true, true);
  await row.evaluate(node => { node.scrollLeft = node.scrollWidth });
  await edges(row, true, false);
}

describe('Horizontal navigation hint', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });

  it('Review categories scroll horizontally on narrow screens, and the desktop category column keeps no scroll hint', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/review', MOBILE);
    try {
      const row = opened.page.getByRole('tablist', { name: 'Review classification' });
      await row.waitFor();
      await settle(opened.page);
      await scrollPositions(row);
      await opened.page.setViewportSize({ width: 1280, height: 844 });
      await opened.page.waitForFunction(() => {
        const node = document.querySelector('[role="tablist"][aria-label="Review categories"]');
        return node?.getAttribute('aria-orientation') === 'vertical';
      });
      assert.equal(await row.evaluate(node => getComputedStyle(node).maskImage), 'none');
      await opened.page.setViewportSize({ width: 390, height: 844 });
      await row.evaluate(node => { node.scrollLeft = 0 });
      await edges(row, false, true);
      await row.getByRole('tab').first().focus();
      await opened.page.keyboard.press('End');
      await edges(row, true, false);
      const geometry = await row.evaluate(node => {
        const selected = node.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
        const host = node.getBoundingClientRect();
        return selected.left >= host.left - 1 && selected.right <= host.right + 1;
      });
      assert.ok(geometry, 'The keyboard-selected category never entered the visible range');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('Tag types and initial navigation both show horizontal hints, and the initial hint drops once there is room', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/tags', MOBILE, async page => {
      await page.route('**/api/index?**', route => route.fulfill({ json: {
        items: Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (letter, at) => ({ k: `${letter} tags`, n: at + 1, cat: 'general' })),
        categories: { meta: 3, relationship: 3, role: 3, appearance: 3, scene: 3, story: 3, position: 3, general: 5 },
        has_more: false,
      } }));
    });
    try {
      const page = opened.page;
      const row = page.getByRole('group', { name: 'Tag kinds' });
      await row.waitFor();
      await settle(page);
      await scrollPositions(row);
      const alphabet = page.getByRole('navigation', { name: 'Jump by initial' });
      await scrollPositions(alphabet);
      await page.setViewportSize({ width: 1600, height: 900 });
      await edges(alphabet, false, false);
      await alphabet.getByRole('button').last().evaluate(node => { node.textContent = 'A very long category name'.repeat(40) });
      await edges(alphabet, false, true);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('The bottom action row of the follow image view supports horizontal scrolling and edge hints', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, '/follow?media=images', MOBILE);
    try {
      await scrollPositions(opened.page.locator('[data-follow-filter-glass] > [data-filter-row="bottom"]'));
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });
});
