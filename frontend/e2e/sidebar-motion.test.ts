/* Runtime constraints for sidebar open/close: no glass texture repaint during the transition, a repaint at the final size once it stops, and the main area settling into the freed space.
 *
 * Smoke tests open pages with reduced motion by default, where the transition is 0s and these constraints cannot be observed; this page switches back to full motion. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Browser, Page } from 'playwright-core';

import { expectBody, launch, settle, visit, VIEWPORTS } from './harness.ts';

const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;

interface Toggle {
  /** By the end of the first transition segment, several offset sprites have already been drawn. */
  mapsDuring: number;
  /** After both transitions finish and the repaint catches up, the width of the drawer's offset texture (same-size textures are reused and not necessarily repainted). */
  mapWidth: number;
  drawerClientWidth: number;
  opticDuring: string;
  opticAfter: string;
  open: boolean;
  drawerWidth: number;
  drawerRight: number;
  mainLeft: number;
  mainRight: number;
  railW: number;
  viewport: number;
  /** How many frames render within 300ms of the click (the transition's duration), counting the first frame at the moment of the click. */
  frames: number;
}

/** Click the top-left toggle once, then wait for both the `body` `padding-left` and the drawer `width` transitions to come to rest. */
async function toggle(page: Page): Promise<Toggle> {
  return page.evaluate(() => new Promise<Toggle>((resolve, reject) => {
    const counter = window as unknown as { __maps: number };
    const drawer = document.querySelector<HTMLElement>('#drawer')!;
    const start = counter.__maps;
    const pending = new Set(['padding-left', 'width']);
    let mapsDuring = -1;
    let opticDuring = '';
    const timer = setTimeout(() => reject(new Error(`A transition has not finished: missing ${[...pending].join(', ')}`)), 5_000);
    /* Frames are counted from the click to 300 ms: however long the main thread is held by one full-page reflow, that many frames go missing from this window. */
    let clicked = 0;
    let frames = 1;
    let counting = true;
    const tick = (now: number) => {
      if (!counting) return;
      if (now - clicked <= 300) frames++;
      requestAnimationFrame(tick);
    };
    const window300 = new Promise<void>((done) => setTimeout(done, 320));
    const onEnd = (event: TransitionEvent) => {
      const key = event.target === document.body && event.propertyName === 'padding-left' ? 'padding-left'
        : event.target === drawer && event.propertyName === 'width' ? 'width' : '';
      if (!key || !pending.delete(key)) return;
      if (mapsDuring < 0) {
        mapsDuring = counter.__maps - start;
        opticDuring = drawer.style.getPropertyValue('--glass-optic');
      }
      if (pending.size) return;
      clearTimeout(timer);
      window.removeEventListener('transitionend', onEnd, true);
      void window300.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        counting = false;
        const drawerBox = drawer.getBoundingClientRect();
        const mainBox = document.querySelector('#main')!.getBoundingClientRect();
        resolve({
          mapsDuring,
          mapWidth: Number(document.getElementById(/#(peach-optic-\d+)/.exec(drawer.style.getPropertyValue('--glass-optic'))?.[1] || '')
            ?.querySelector('feImage')?.getAttribute('width')),
          drawerClientWidth: Math.round(drawer.clientWidth),
          opticDuring,
          opticAfter: drawer.style.getPropertyValue('--glass-optic'),
          open: drawer.classList.contains('open'),
          drawerWidth: Math.round(drawerBox.width),
          drawerRight: drawerBox.right,
          mainLeft: mainBox.left,
          mainRight: mainBox.right,
          railW: parseFloat(getComputedStyle(document.body).getPropertyValue('--railW')),
          viewport: document.documentElement.clientWidth,
          frames,
        });
      })));
    };
    // Attached at the window capture phase: it receives this end before the page's repaint handler attached to document does.
    window.addEventListener('transitionend', onEnd, true);
    clicked = performance.now();
    requestAnimationFrame(tick);
    document.querySelector<HTMLElement>('#filterBtn')!.click();
  }));
}

describe('Sidebar drawer', () => {
  let browser: Browser;

  before(async () => {
    browser = await launch();
  });

  after(async () => {
    await browser.close();
  });

  it('During the transition the glass degrades to pure blur without repainting textures; after stopping it paints the final state, and the main area\'s left edge lands at the yielded position', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    try {
      const { page } = opened;
      await expectBody(page, '/', [page.locator('#drawer.open')]);
      await settle(page);
      await page.waitForFunction(() => document.querySelector<HTMLElement>('#drawer')?.dataset.opticGlass === 'true');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => {
        const counter = window as unknown as { __maps: number };
        counter.__maps = 0;
        const native = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement, ...args: Parameters<HTMLCanvasElement['toDataURL']>) {
          counter.__maps++;
          return native.apply(this, args);
        };
      });

      const collapsed = await toggle(page);
      const expanded = await toggle(page);
      for (const [name, state] of [['Collapse', collapsed], ['Expand', expanded]] as const) {
        assert.equal(state.mapsDuring, 0, `${name} repainted ${state.mapsDuring} glass textures during the transition`);
        assert.equal(state.opticDuring, 'blur(14px)', `During ${name}'s transition the drawer still holds the old-size displacement texture`);
        assert.equal(state.mapWidth, state.drawerClientWidth, `${name} is ${state.mapWidth} wide after stopping, not patched up to the final size ${state.drawerClientWidth}`);
        assert.match(state.opticAfter, /url\("#peach-optic-\d+"\)/, `${name} did not restore the transform filter on the drawer after stopping`);
        assert.ok(Math.abs(state.mainLeft - state.railW) <= .5, `After ${name} the main area's left edge ${state.mainLeft} should sit at --railW ${state.railW}`);
        assert.ok(Math.abs(state.mainRight - state.viewport) <= 1, `After ${name} the main area's right edge ${state.mainRight} does not reach the viewport's right edge ${state.viewport}`);
        assert.ok(state.drawerRight <= state.mainLeft, `After ${name} the drawer's right edge ${state.drawerRight} pressed into the main area`);
        /* The lower bound only catches "the whole transition swallowed by one long task, jumping straight to the final state": besides the click frame, at least
           one intermediate frame must appear within 300ms. Local headless Chrome: 10-15 frames collapsing, 30-38 expanding; with CPU slowed 6x,
           2 frames collapsing, 4 expanding; CI's slow machines fall between these two tiers. */
        assert.ok(state.frames >= 2, `${name} transition produced only ${state.frames} frames in its 300ms, with the main thread blocked throughout`);
      }
      assert.equal(collapsed.open, false);
      assert.equal(expanded.open, true);
      assert.ok(collapsed.drawerWidth < expanded.drawerWidth, `Collapsed ${collapsed.drawerWidth}px is not narrower than expanded ${expanded.drawerWidth}px`);
      assert.ok(collapsed.railW < expanded.railW, 'After collapse the main area does not expand back left');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });
});
