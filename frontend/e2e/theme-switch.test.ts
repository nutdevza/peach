/* Color transitions on controls do not play at the theme-switch moment.
 *
 * The fixture opens pages with reduce motion by default, and the global rule turns transitions off with it; what is wanted
 * here is exactly the transitions-on look, so the page sets `no-preference`. The same page first bypasses `applyTheme` and
 * writes the attribute directly to confirm this button does transition under that kind of switch; only then does the later
 * "is empty" prove `applyTheme` suppressed it. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, settle, visit, VIEWPORTS } from './harness.ts';

const desktop = VIEWPORTS.find((viewport) => !viewport.mobile)!;

describe('Switch theme', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });

  it('The sidebar footer\'s theme, palette, and settings controls keep their order between expanded and collapsed', async () => {
    const opened = await visit(browser, '/', desktop);
    try {
      const { page } = opened;
      const drawer = page.locator('#drawer');
      if (!await drawer.evaluate(node => node.classList.contains('open'))) await page.locator('#filterBtn').click();
      await settle(page);
      const positions = () => page.locator('.board-sidebar-foot').evaluate(root => {
        const selectors = ['.board-theme-toggle', '#boardGlowBtn', '#settingsBtn'];
        return selectors.map(selector => {
          const r = root.querySelector(selector)!.getBoundingClientRect();
          return { x: r.left, y: r.top };
        });
      });
      const expanded = await positions();
      assert.ok(expanded[0]!.x < expanded[1]!.x && expanded[1]!.x < expanded[2]!.x);
      const buttons = await page.locator('.board-sidebar-foot button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
      assert.deepEqual(buttons, ['Light theme', 'Dark theme', 'Glow palette', 'Open settings']);
      await page.locator('#filterBtn').click();
      await page.waitForFunction(() => Math.round(document.querySelector('#drawer')!.getBoundingClientRect().width) === 60);
      await settle(page);
      const collapsed = await positions();
      assert.ok(collapsed[0]!.y < collapsed[1]!.y && collapsed[1]!.y < collapsed[2]!.y);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('Controls with color transitions get no animation during the theme switch; the light/dark slider still moves and transitions resume next frame', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/data-cleanup/media-repair', desktop);
    try {
      const { page } = opened;
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const section = page.locator('section[aria-label="Media repair"]');
      await section.waitFor({ state: 'visible', timeout: 15_000 });
      await section.locator('button[aria-haspopup="listbox"]:not(:disabled)').waitFor({ state: 'visible', timeout: 15_000 });
      // The slider does not render while the sidebar is collapsed, so there is no displacement to watch; desktop viewports start expanded.
      await page.locator('#drawer.open .board-theme-thumb').waitFor({ state: 'visible', timeout: 5_000 });
      await settle(page);

      const result = await section.evaluate(async (host) => {
        const entry = '/dist/peach-app.js', ui = await import(entry);
        const root = document.documentElement;
        const thumb = document.querySelector<HTMLElement>('.board-theme-thumb')!;
        const node = host.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;
        const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 150)));
        // Ends only the transitions: with animations on, the page also has infinite glow animations and `finish()` throws on those.
        const finish = () => document.getAnimations()
          .forEach((animation) => { if (animation instanceof CSSTransition) animation.finish() });
        const transitions = (element: Element) => element.getAnimations()
          .map((animation) => (animation as CSSTransition).transitionProperty);
        const colours = () => document.getAnimations()
          .filter((animation): animation is CSSTransition => animation instanceof CSSTransition)
          .filter((animation) => /color|fill|stroke|shadow/.test(animation.transitionProperty))
          .map((animation) => {
            const target = (animation.effect as KeyframeEffect).target;
            return `${target?.tagName.toLowerCase()}.${target?.getAttribute('class')} ${animation.transitionProperty}`;
          });

        ui.applyTheme('light');
        await frame();
        finish();
        const declared = getComputedStyle(node).transitionProperty;

        root.dataset.theme = 'dark';
        root.classList.add('dark');
        const raw = transitions(node);
        finish();
        ui.applyTheme('light');
        await frame();
        finish();

        ui.applyTheme('dark');
        const switched = transitions(node);
        const page = colours();
        const slid = transitions(thumb);
        await frame();
        const restored = getComputedStyle(node).transitionProperty;

        /* Immediately after the switch above, the animation is read while the temporary style is still mounted. Real pages never read: rAF removes the style,
           and only the following frame computes styles. Here nothing is read after switching; wait two frames and look, since a 0.12s transition that started on the first frame is still running. */
        finish();
        ui.applyTheme('light');
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const settled = [...transitions(node), ...colours()];
        return { declared, raw, switched, page, slid, restored, settled };
      });

      assert.match(result.declared, /background-color/, `This button declares no color transition: ${result.declared}`);
      assert.ok(result.raw.length > 0, 'When theme properties are written directly, the button has no transition and the comparison fails');
      assert.deepEqual(result.switched, [], `After applyTheme buttons are still transitioning: ${result.switched.join(', ')}`);
      assert.deepEqual(result.page, [], `After applyTheme the page still has color transitions: ${result.page.join('; ')}`);
      assert.deepEqual(result.slid, ['transform'], `Theme toggle slider did not move along: ${result.slid.join(', ')}`);
      assert.equal(result.restored, result.declared, 'The button\'s transition did not recover next frame; the transition-killing temporary style is still attached');
      assert.deepEqual(result.settled, [], `The frame that removed the temporary style replayed color transitions: ${result.settled.join('; ')}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });
});
