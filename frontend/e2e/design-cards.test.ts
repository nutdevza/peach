/* Design decisions: video cards, management pages and review. Reads `getComputedStyle` to assert the appearance the user set; shared stubs and browser lifecycle live in `design-fixture.ts`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser, Locator, Page } from 'playwright-core';
import { expectBody, settle, visit } from './harness.ts';
import {
  DESKTOP, MOBILE, tokenColor, openReview, REVIEW_ROW, lightness, WIDE, JUNK_COUNT, openJunk, junkItem, openJunkWith,
  openCatalog, openCatalogFixture, openFollowManage, stubFollowManage, holdApi, controlFaces, disabledTokens,
  waitingActionFaces, assertDisabledFace, installDesignBrowser, PIXEL,
} from './design-fixture.ts';

/** Each viewport starts from the unread progress; cross-device ledger persistence is verified by API regression. */
async function freshTutorial(page: Page) {
  const state = { version: 1, campaign: 'browser-tutorial', invited: false, completed: false,
    chapters: {} as Record<string, { next: number; read: string[]; skipped: string[] }> };
  await page.route('**/api/tutorial-progress', async route => {
    if (route.request().method() === 'POST') {
      const action = route.request().postDataJSON();
      if (action.action === 'dismiss') state.invited = true;
      else if (action.action === 'complete' || action.action === 'reopen') {
        state.invited = true;
        state.completed = action.action === 'complete';
      } else {
        const row = state.chapters[action.chapter] ??= { next: 0, read: [], skipped: [] };
        row.next = action.next;
        if (action.action === 'step') {
          row.read = row.read.filter(step => step !== action.step);
          row.skipped = row.skipped.filter(step => step !== action.step);
          row[action.skipped ? 'skipped' : 'read'].push(action.step);
        }
      }
    }
    await route.fulfill({ json: state });
  });
}

// 监视器只保留框架异步收尾异常的调用栈，错误仍由 Node 判为失败。
process.on('uncaughtExceptionMonitor', error => console.error(error.stack));

describe('Design decisions: video cards, manage pages, and review', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });

  /* The skeleton previews the screen's shape before the list returns: JAV defaults to large images with 3:4 front-cover cards, and if the skeleton laid out at 16:9
     the whole screen of cards would stretch taller the moment content arrived. The list request is held so only the skeleton itself is measured. */
  it('Video skeleton cover ratio follows the current layout: JAV large image 3:4, home small image 16:9', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    const { page } = opened;
    await page.route(/\/api\/items\?/, () => {});
    /* The frame where a skeleton attaches may not have laid out yet (width and height both 0), which measures as NaN. Read only once it has a size and the ratio has held for two
       consecutive frames: what is measured is the shape after this screen settles, not the instant the node entered the DOM. */
    const skeletonRatio = async (path: string) => {
      await page.goto(new URL(path, page.url()).href, { waitUntil: 'load' });
      const handle = await page.waitForFunction(() => {
        const cover = document.querySelector('#grid .catalog-skeleton .skeletoncard i');
        const box = cover?.getBoundingClientRect();
        if (!box || !box.width || !box.height) return false;
        const ratio = box.width / box.height;
        const holder = window as unknown as { skeletonRatioSeen?: number };
        const settled = holder.skeletonRatioSeen === ratio;
        holder.skeletonRatioSeen = ratio;
        return settled && ratio;
      }, undefined, { polling: 'raf', timeout: 15_000 });
      return Number(await handle.jsonValue());
    };
    try {
      assert.ok(Math.abs(await skeletonRatio('/?jav=1') - 0.75) < 0.05, 'Under JAV large images the skeleton cover is not front-cover ratio');
      assert.ok(Math.abs(await skeletonRatio('/') - 16 / 9) < 0.05, 'Under home small images the skeleton cover is not 16:9');
    } finally {
      await opened.close();
    }
  });

  it('Card hover feedback never outlines cover pixels', { timeout: 60_000 }, async () => {
    const opened = await openCatalog(browser);
    try {
      const card = opened.page.locator('#grid [data-media-card]').first();
      const picture = card.locator('[data-media-pic]');
      await card.hover();
      const overlay = await picture.evaluate((element) => {
        const style = getComputedStyle(element, '::after');
        return { content: style.content, borderWidth: style.borderTopWidth };
      });
      assert.equal(overlay.content, 'none', 'The hover pseudo-element still paints over cover pixels');
      assert.equal(overlay.borderWidth, '0px', 'The hover border still pollutes the rounded edge\'s pixels');
      assert.match(await card.evaluate((element) => getComputedStyle(element).boxShadow),
        /0px 0px 0px 8px/, 'The hover background did not extend 8px outward around the card');
      assert.equal(await card.locator('[data-media-later]').evaluate(
        (element) => getComputedStyle(element).opacity), '1', 'Removing the outline dropped the hover feedback');
    } finally {
      await opened.close();
    }
  });

  it('The long hover control shrinks with narrow cards in sync; the two corner buttons stay on the same tier and never cover the main control', { timeout: 60_000 }, async () => {
    const opened = await openCatalog(browser);
    try {
      const card = opened.page.locator('#grid [data-media-card]:has([data-media-seek])').first();
      for (const [width, main, corner] of [[470, 58, 36], [200, 36, 30]]) {
        await card.evaluate((node, size) => {
          const element = node as HTMLElement;
          element.style.width = `${size}px`;
          element.style.minWidth = `${size}px`;
          element.style.maxWidth = `${size}px`;
          element.dataset.longhover = '';
        }, width!);
        await opened.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const geometry = await card.evaluate(node => {
          const primary = [...node.querySelectorAll('[data-media-seek] button')];
          const corners = [...node.querySelectorAll('[data-media-preview], [data-media-later] button')];
          const sizes = (nodes: Element[]) => nodes.map(button => {
            const style = getComputedStyle(button);
            return [parseFloat(style.width), parseFloat(style.height)];
          });
          const overlaps = corners.some(corner => primary.some(button => {
            const a = corner.getBoundingClientRect(), b = button.getBoundingClientRect();
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          }));
          return { primary: sizes(primary), corners: sizes(corners), overlaps };
        });
        assert.deepEqual(geometry.primary, Array.from({ length: 3 }, () => [main, main]));
        assert.deepEqual(geometry.corners, [[corner, corner], [corner, corner]]);
        assert.equal(geometry.overlaps, false, JSON.stringify({ width, geometry }));
      }
    } finally { await opened.close() }
  });

  it('Library card text uses the page body tier, and badges, hover controls, progress bars, the portrait strip, Mix and trash card faces are painted to the settled spec', { timeout: 90_000 }, async () => {
    /* The demo library cannot produce non-video resources in trash: the trash page swaps the second entry for an archive.
       The catalog page gives the first three entries half-way watch progress, to measure the progress bar's colors. */
    const opened = await openCatalogFixture(browser, (payload, url) => {
      if (url.searchParams.get('state') !== 'trash') {
        if (!url.searchParams.has('orient')) assert.ok(payload.items.length >= 8, 'The Mix appearance fixture provides at least eight works');
        for (const item of payload.items.slice(0, 3)) Object.assign(item, { duration: 600, play_seconds: 300 });
        return;
      }
      const item = payload.items[1];
      if (!item) throw new Error('Demo catalog has fewer than two items');
      Object.assign(item, { medium: 'archive', name: 'Demo profile.zip', disposal: 'trash' });
      Object.assign(payload.items[0], { disposal: 'trash', is_jav: false, has_cover: false, has_thumb: true });
    }, { completeFirstPage: true });
    const { page } = opened;
    await page.route('**/poster**', (route) => route.fulfill({
      status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
    }));
    /* The island root is `line-height:1.5`, and cells without an explicit line height inherit it; the legacy card reads the page body's 14px/20px.
       Values are measured from an empty element under the same island root, not copied as pixels into assertions. */
    const readStyles = (selectors: Record<string, string>) => page.evaluate((wanted) => {
      const root = document.querySelector('#grid .peach-react')!;
      const pick = (element: Element | null) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        return { fontSize: style.fontSize, lineHeight: style.lineHeight, fontFamily: style.fontFamily,
          letterSpacing: style.letterSpacing, minHeight: style.minHeight, padding: style.padding,
          display: style.display, place: `${style.alignItems} ${style.justifyItems}`, color: style.color,
          background: style.backgroundColor, borderWidth: style.borderTopWidth, borderColor: style.borderTopColor,
          leftRadius: style.borderTopLeftRadius, width: style.width, opacity: style.opacity };
      };
      const probe = (css: string) => {
        const element = document.createElement('div');
        element.style.cssText = css;
        root.append(element);
        const value = pick(element)!;
        element.remove();
        return value;
      };
      return {
        body: probe('font: var(--board-body)'), caption: probe('font: var(--board-caption)'),
        md: probe('font-size: var(--fs-md)'), muted: probe('color: var(--muted)'), text: probe(''),
        ground: probe('background: var(--ground)'), tungsten: probe('background: var(--tungsten)'),
        overlay: probe('background: var(--overlay-5); border: 1px solid var(--border-10)'),
        ...Object.fromEntries(Object.entries(wanted).map(([key, selector]) => [key, pick(root.querySelector(selector))])),
      };
    }, selectors);
    try {
      await page.locator('#grid [data-shorts-strip]').first().waitFor({ timeout: 10_000 });
      await page.locator('#grid [data-media-grid] > [data-media-card] [data-media-progress]').first().waitFor({ timeout: 10_000 });
      // 本例检查外观，夹具提供完整首页，Mix 按累计八张的真实规则插入。
      await page.locator('#grid [data-mix-glyph]').first().waitFor({ state: 'attached' });
      const catalog = await readStyles({
        card: '[data-media-grid] > [data-media-card]',
        badge: '[data-media-grid] > [data-media-card] [data-media-badge]',
        shorts: '[data-shorts-strip] > h2',
        mix: '[data-media-grid] > [data-mix-card]',
        mixTitle: '[data-media-grid] > [data-mix-card] [data-mix-title]',
        mixGlyph: '[data-media-grid] > [data-mix-card] [data-mix-glyph]',
        strip: '[data-shorts-strip]',
        progress: '[data-media-grid] > [data-media-card] [data-media-progress] > i',
        seekGlyph: '[data-media-grid] > [data-media-card] [data-media-seek] svg',
        laterButton: '[data-media-grid] > [data-media-card] [data-media-later] button',
        laterGlyph: '[data-media-grid] > [data-media-card] [data-media-later] svg',
      });
      const { body, caption, md, card, badge, shorts, mix, mixTitle } = catalog;
      /* Portrait bands are distinguished by background and grid, not outlines; on wide screens they extend left across the sidebar track, with no corner radius against the viewport edge. */
      assert.deepEqual([catalog.strip?.background, catalog.strip?.borderWidth], [catalog.ground.background, '0px'],
        'The portrait strip is not the same surface as the page background, or has a border drawn around it');
      assert.equal(catalog.strip?.leftRadius, '0px', 'On wide screens the portrait strip keeps its radius on the viewport side');
      const edges = await page.evaluate(() => ({
        strip: document.querySelector('#grid [data-shorts-strip]')!.getBoundingClientRect().left,
        grid: document.querySelector('#grid [data-media-grid]')!.getBoundingClientRect().left,
      }));
      assert.ok(edges.strip < edges.grid, `The portrait strip's left edge ${edges.strip} does not cross the grid's left edge ${edges.grid} under the sidebar`);
      /* Immersive mode is a stack of cards flipped vertically; its entry uses the card-stack glyph and shares it with no other action. */
      assert.equal(await page.locator('#grid [data-shorts-enter] svg use').first().getAttribute('href'), '#i-gallery-vertical-end',
        'The portrait strip\'s "Enter immersive mode" changed glyph');
      const immerse = page.locator('#grid [data-shorts-enter]').first();
      await immerse.scrollIntoViewIfNeeded();
      const measureImmerse = () => immerse.evaluate((node) => {
        const button = node.getBoundingClientRect();
        const strip = node.closest('[data-shorts-strip]')!.getBoundingClientRect();
        return { x: button.x - strip.x, y: button.y - strip.y,
          width: button.width, height: button.height, transform: getComputedStyle(node).transform };
      });
      const resting = await measureImmerse();
      await immerse.hover();
      await page.waitForTimeout(180);
      const hovering = await measureImmerse();
      assert.deepEqual(hovering, resting, 'The immersive entry\'s hover keeps its position and size');
      const shortCard = page.locator('#grid [data-shorts-row] [data-media-card]').first();
      await shortCard.hover();
      await page.waitForTimeout(180);
      const feedback = await shortCard.evaluate(node => {
        const card = node.getBoundingClientRect(), row = node.closest('[data-shorts-row]')!.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, shadow: style.boxShadow, top: card.top - row.top,
          bottom: row.bottom - card.bottom, strip: getComputedStyle(node.closest('[data-shorts-strip]')!).backgroundColor };
      });
      assert.notEqual(feedback.background, 'rgba(0, 0, 0, 0)');
      assert.notEqual(feedback.shadow, 'none');
      /* In light mode the site-wide hover surface and the ribbon base are both #F7F7F7, so spreading it out changes nothing. */
      assert.notEqual(feedback.background, feedback.strip, 'In the portrait strip the card hover face matches the strip base color');
      assert.ok(feedback.top >= 8 && feedback.bottom >= 8, JSON.stringify(feedback));
      /* The long-hover lift and scale, plus the spread hover surface, must all land inside the horizontal row's clip box. */
      const lifted = await shortCard.evaluate(async node => {
        node.setAttribute('data-longhover', '');
        await Promise.all(node.getAnimations().map(animation => { animation.finish(); return animation.finished }));
        const card = node.getBoundingClientRect(), row = node.closest('[data-shorts-row]')!.getBoundingClientRect();
        const spread = parseFloat(getComputedStyle(node).boxShadow.split(' ').at(-1)!) * 1.065;
        node.removeAttribute('data-longhover');
        return { top: card.top - spread - row.top, bottom: row.bottom - card.bottom - spread };
      });
      assert.ok(lifted.top >= 0 && lifted.bottom >= 0, `The enlarged portrait card is clipped by the horizontal scroll row: ${JSON.stringify(lifted)}`);
      await page.mouse.move(0, 0);
      assert.equal(catalog.progress?.background, catalog.tungsten.background, 'The watch progress bar is not filament blue');
      assert.deepEqual([catalog.mixGlyph?.background, catalog.mixGlyph?.borderWidth, catalog.mixGlyph?.borderColor],
        [catalog.overlay.background, '1px', catalog.overlay.borderColor], 'The Mix byline glyph is not a translucent fill with a thin border');
      /* 主控保持 58px 配 34px 图标；角落动作取同一档 36px 配 18px 图标。 */
      assert.deepEqual([catalog.seekGlyph?.width, catalog.laterButton?.width, catalog.laterGlyph?.width], ['34px', '36px', '18px'],
        'The hover control\'s size and icon ratio changed');
      const denseShort = await page.evaluate(() => {
        document.body.dataset.density = 'dense';
        const width = getComputedStyle(document.querySelector('#grid [data-shorts-strip] [data-media-card]')!).width;
        delete document.body.dataset.density;
        return width;
      });
      assert.equal(denseShort, '107px', 'In dense mode the portrait strip\'s cards did not shrink to half of 214px');
      assert.deepEqual([card?.fontSize, card?.lineHeight], ['14px', '20px'], 'Video card text is not the page body tier; the 1.5 line-height from the island root leaked in');
      assert.deepEqual([badge?.fontSize, badge?.lineHeight], [caption.fontSize, caption.lineHeight], 'The source badge text is not the caption size tier');
      assert.equal(badge?.minHeight, '24px', 'The source badge is under 24px tall');
      assert.deepEqual([shorts?.fontFamily, shorts?.lineHeight], [body.fontFamily, '20px'], 'The portrait strip title\'s font or line height differs from page body');
      assert.ok(mix && mixTitle, 'The fixture folders never inserted into the Mix');
      assert.deepEqual([mix.fontSize, mix.lineHeight], ['14px', '20px'], 'The Mix card in the grid did not take the page body size tier');
      assert.equal(mixTitle.letterSpacing, 'normal', 'The Mix title in the grid carries letter spacing');
      assert.ok(Math.abs(parseFloat(mixTitle.lineHeight) - parseFloat(md.fontSize) * 1.45) < .5,
        `The Mix title line-height in the grid is ${mixTitle.lineHeight}, not 1.45 times --fs-md`);

      await page.goto(new URL('/trash', page.url()).href, { waitUntil: 'load' });
      await page.locator('#grid [data-media-card][data-variant="resource"]').first().waitFor({ timeout: 15_000 });
      await settle(page);
      const trash = await readStyles({
        meta: '[data-media-grid] > [data-media-card] [data-media-meta]',
        glyph: '[data-variant="resource"] [data-media-glyph]',
        kind: '[data-variant="resource"] [data-media-kind-glyph]',
      });
      /* Trash card titles are always two lines, the avatar aligns with the title's top, and the trash reason and border keep their spacing. */
      const inset = await page.locator('#grid [data-media-card][data-variant="resource"]').first().evaluate((card) => {
        const box = (selector: string) => card.querySelector(selector)!.getBoundingClientRect();
        const frame = card.getBoundingClientRect();
        const [pic, avatar, title, reason] = ['[data-media-pic]', '[data-media-avatar]', '[data-media-title]', '[data-media-disposal-reason]'].map(box);
        return { left: avatar.left - frame.left, top: title.top - pic.bottom, bottom: frame.bottom - reason.bottom,
          title: title.height, lineHeight: parseFloat(getComputedStyle(card.querySelector('[data-media-title]')!).lineHeight),
          skew: Math.abs(avatar.top - title.top) };
      });
      assert.ok(inset.left >= 10 && inset.top >= 8 && inset.bottom >= 10,
        `The trash card's meta area hugs the border or cover: left ${inset.left}, top ${inset.top}, bottom ${inset.bottom}`);
      assert.ok(Math.abs(inset.title - inset.lineHeight * 2) < 1, `Trash title did not reserve two lines: ${JSON.stringify(inset)}`);
      assert.ok(inset.skew <= 3, `The avatar is not at the top of the title area, off by ${inset.skew}px`);
      assert.deepEqual([trash.glyph?.display, trash.glyph?.place, trash.glyph?.color], ['grid', 'center center', trash.muted.color],
        'The glyph in the trash resource card\'s cover cell is not centered or not the secondary text color');
      assert.deepEqual([trash.kind?.display, trash.kind?.place, trash.kind?.color], ['grid', 'center center', trash.text.color],
        'The glyph in the trash resource card\'s avatar slot is not centered or not in body text color');
      /* The hover peek layer is the `img.ui-hvframes` the shell inserts into the cover cell: the pending-deletion card's graying must include it, otherwise hovering revives the whole card to normal color. */
      const scan = await page.locator('#grid [data-media-card][data-pending-delete]:not([data-variant="resource"]) [data-media-pic]')
        .first().evaluate((pic) => {
          const layer = document.createElement('img');
          layer.className = 'ui-hvframes';
          pic.append(layer);
          const filter = getComputedStyle(layer).filter;
          layer.remove();
          return filter;
        });
      assert.match(scan, /grayscale\(0\.9\)/, 'The pending-deletion card\'s hover scan layer did not gray out with it');
      /* On a card pending deletion, cover, backing, and meta info dim together. */
      const pending = await page.locator('#grid [data-media-card][data-pending-delete]:not([data-variant="resource"])')
        .first().evaluate((card) => ({
          meta: getComputedStyle(card.querySelector('[data-media-meta]')!).opacity,
          backdrop: getComputedStyle(card.querySelector('[data-media-pic]')!, '::before').filter,
          image: getComputedStyle(card.querySelector('[data-media-pic] img')!).filter,
        }));
      assert.equal(pending.meta, '0.58', 'The pending delete card meta area is not dimmed');
      assert.match(pending.backdrop, /blur\(26px\) grayscale\(0\.9\) brightness\(0\.27\)/, 'The pending-deletion card\'s blur base grays out with the cover');
      assert.match(pending.image, /grayscale\(0\.9\) brightness\(0\.54\)/, 'The pending delete cover is not grayed out');
    } finally {
      await opened.close();
    }
  });

  it('The trash skeleton and the settled page share geometry, and the count bar stays distinct from the page background in both themes', { timeout: 90_000 }, async () => {
    /* The trash is mostly images and archives, so the skeleton follows resource cards: the fixture swaps the trash page entirely to images. */
    const opened = await openCatalogFixture(browser, (payload, url) => {
      if (url.searchParams.get('state') !== 'trash') return;
      for (const [at, item] of payload.items.entries()) {
        Object.assign(item, { medium: 'image', name: `demo-image-${at}.jpg`, disposal: 'trash' });
      }
    });
    const { page } = opened;
    const measure = () => page.evaluate(() => {
      const box = (element: Element | null) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return [Math.round(rect.top), Math.round(rect.height)];
      };
      const lede = document.querySelector<HTMLElement>('[data-manage-lede]');
      const card = [...document.querySelectorAll(
        '#grid .catalog-skeleton .skeletoncard, #grid [data-media-card][data-variant="resource"]',
      )].find(node => !node.closest('[data-content-skeleton][aria-hidden="true"], [data-content-current][aria-hidden="true"]')
        && getComputedStyle(node).visibility === 'visible') ?? null;
      /* The vertical centerlines of the readout and "empty trash": both speak of the same files and sit in the same description row. */
      const middle = (element: Element | null | undefined) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return Math.round(rect.top + rect.height / 2);
      };
      return { lede: box(lede), card: box(card),
        cells: [...lede?.querySelectorAll<HTMLElement>('[data-trash-lede-skeleton]') ?? []].map((cell) => cell.dataset.trashLedeSkeleton),
        text: lede?.querySelector('[data-lede-text]')?.textContent ?? null,
        row: [middle(lede?.querySelector('[data-lede-text]')), middle(lede?.querySelector('[data-empty-trash]'))] };
    });
    try {
      const release = await holdApi(page);
      await page.goto(new URL('/trash', page.url()).href, { waitUntil: 'load' });
      await page.locator('#grid .catalog-skeleton .skeletoncard').first().waitFor({ timeout: 15_000 });
      const waiting = await measure();
      release();
      await page.locator('#grid [data-media-card][data-variant="resource"]').first().waitFor({ timeout: 15_000 });
      await settle(page);
      const landed = await measure();
      assert.ok(waiting.lede, 'During the trash skeleton there is no count bar; it appears only once the reading arrives and pushes the grid down');
      assert.deepEqual([waiting.cells, waiting.text], [['text', 'action'], null], `During the skeleton the caption row is not a two-cell placeholder: ${JSON.stringify(waiting)}`);
      assert.match(landed.text ?? '', /个符合 · 显示 \d+/, `Readout did not land in the caption row: ${JSON.stringify(landed)}`);
      assert.deepEqual(landed.cells, [], 'Placeholder remains after the readout lands');
      const [textMiddle, buttonMiddle] = landed.row;
      assert.ok(textMiddle != null && buttonMiddle != null && Math.abs(textMiddle - buttonMiddle) <= 1,
        `The readout and clear button are not on the same row as the description: ${JSON.stringify(landed.row)}`);
      assert.deepEqual(waiting.lede, landed.lede, `The count bar jumped in position or height when it landed: ${JSON.stringify({ waiting, landed })}`);
      assert.deepEqual(waiting.card, landed.card, `The first trash card jumped in position or height when it landed: ${JSON.stringify({ waiting, landed })}`);
      /* The same history entry keeps its reading and card; it re-fetches nothing and re-lays no placeholder. */
      await page.evaluate(() => {
        const flags = window as unknown as { trashLedeFlashed?: boolean };
        flags.trashLedeFlashed = false;
        new MutationObserver(() => {
          if (document.querySelector('[data-trash-lede-skeleton]')) flags.trashLedeFlashed = true;
        }).observe(document.querySelector('[data-manage-header]')!, { childList: true, subtree: true });
      });
      const rereads: string[] = [];
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname === '/api/items' && url.searchParams.get('state') === 'trash') rereads.push(url.href);
      });
      await page.evaluate(() => dispatchEvent(new PopStateEvent('popstate')));
      await page.locator('#grid [data-media-card][data-variant="resource"]').first().waitFor({ timeout: 15_000 });
      await settle(page);
      const holding = await measure();
      assert.deepEqual(rereads, [], 'The same history entry fetches twice');
      assert.deepEqual([holding.cells, holding.text], [[], landed.text], `On same-page rerender the caption row reverted to the placeholder: ${JSON.stringify(holding)}`);
      assert.equal(await page.evaluate(() => (window as unknown as { trashLedeFlashed?: boolean }).trashLedeFlashed), false,
        'During a same-page repaint the note line flashed back to its placeholder');
      const surfaces = await page.evaluate(() => {
        const root = document.documentElement;
        const before = root.dataset.theme;
        const read = (theme: string) => {
          root.dataset.theme = theme;
          return [getComputedStyle(document.querySelector('[data-manage-lede]')!).backgroundColor,
            getComputedStyle(document.body).backgroundColor];
        };
        const result = { light: read('light'), dark: read('dark') };
        if (before === undefined) delete root.dataset.theme;
        else root.dataset.theme = before;
        return result;
      });
      for (const [theme, [lede, ground]] of Object.entries(surfaces)) {
        assert.notEqual(lede, ground, `Under the ${theme} theme the trash count bar shares the page background: ${lede}`);
      }
    } finally {
      await opened.close();
    }
  });

  it('Batch bar keys use inline glyphs and counts use --ink-2; the two danger keys, the batch bar and Empty trash, read the same red set', { timeout: 90_000 }, async () => {
    const opened = await openCatalogFixture(browser, (payload, url) => {
      if (url.searchParams.get('state') !== 'trash') return;
      for (const item of payload.items) Object.assign(item, { disposal: 'trash' });
    });
    const { page } = opened;
    try {
      await page.goto(new URL('/trash', page.url()).href, { waitUntil: 'load' });
      const cards = page.locator('#grid [data-media-card][data-id]');
      await cards.nth(1).waitFor({ timeout: 15_000 });
      await page.locator('[data-manage-lede] [data-empty-trash]').waitFor({ timeout: 15_000 });
      for (const at of [0, 1]) await cards.nth(at).click({ modifiers: ['Control'], position: { x: 20, y: 20 } });
      await page.locator('[data-batch-dock] [data-selection-dock]').waitFor({ timeout: 10_000 });
      await settle(page);
      const read = await page.evaluate(() => {
        const dock = document.querySelector('[data-batch-dock] [data-selection-dock]')!;
        /* Read the rest face and the hover layer of the two danger keys separately, then compare against the probe that parses the tokens directly: only one shared definition makes all three agree. */
        const probe = (token: string) => {
          const node = document.createElement('div');
          node.style.background = `var(${token})`;
          document.body.append(node);
          const value = getComputedStyle(node).backgroundImage;
          node.remove();
          return value;
        };
        const paint = (key: Element) => [getComputedStyle(key).backgroundImage, getComputedStyle(key, '::before').backgroundImage];
        return {
          // Inline glyphs take `--icon-inline` (1.2em), computing their edge length from the surrounding text's font size.
          glyphs: [...dock.querySelectorAll('button svg')].map((svg) => {
            const box = svg.getBoundingClientRect();
            const inline = parseFloat(getComputedStyle(svg).fontSize) * 1.2;
            return [Math.abs(box.width - inline) < 0.5, Math.abs(box.height - inline) < 0.5];
          }),
          count: getComputedStyle(dock.querySelector('[role="status"]')!).color,
          batch: paint(dock.querySelector('[data-batch-action="delete"]')!),
          empty: paint(document.querySelector('[data-manage-lede] [data-empty-trash]')!),
          tokens: [probe('--board-red'), probe('--board-red-hover')],
        };
      });
      assert.deepEqual(read.glyphs, [[true, true], [true, true], [true, true]], `Batch bar glyphs did not scale with the inline font size: ${JSON.stringify(read.glyphs)}`);
      assert.equal(read.count, await tokenColor(page, 'body', '--ink-2'), 'The bulk bar count is not the secondary ink color');
      assert.match(read.tokens[0], /^linear-gradient/, `--board-red did not resolve to a gradient: ${read.tokens[0]}`);
      assert.deepEqual(read.batch, read.tokens, `The batch bar's "Delete permanently" red is not the --board-red set: ${JSON.stringify(read)}`);
      assert.deepEqual(read.empty, read.tokens, `"Empty trash" red is not the --board-red set: ${JSON.stringify(read)}`);
    } finally {
      await opened.close();
    }
  });

  it('Admin navigation, breadcrumbs, and titles are laid out by hierarchy, with a neutral fill for the selected nav item', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/duplicates', DESKTOP);
    try {
      const { page } = opened;
      await page.locator('[data-manage-crumb] [aria-current="true"]').waitFor({ timeout: 15_000 });
      await settle(page);
      const [ink, muted, fill] = await Promise.all(['--ink', '--muted', '--hover'].map((token) => tokenColor(page, 'body', token)));
      const read = await page.evaluate(() => {
        const items = [...document.querySelectorAll<HTMLElement>('[data-manage-crumb] li')];
        const pressed = document.querySelector<HTMLElement>('[data-manage][aria-pressed="true"]')!;
        const thumb = pressed.parentElement!.querySelector('[data-pill-thumb]')!;
        const selectedBox = pressed.getBoundingClientRect(), thumbBox = thumb.getBoundingClientRect();
        return {
          colors: items.map((item) => getComputedStyle(item).color),
          separators: items.map((item) => item.querySelector('svg') ? getComputedStyle(item.querySelector('svg')!).stroke : null),
          gap: getComputedStyle(document.querySelector('[data-manage-crumb] ol')!).columnGap,
          tab: getComputedStyle(pressed).color,
          fill: getComputedStyle(thumb).backgroundColor,
          buttonFill: getComputedStyle(pressed).backgroundColor,
          selectionDelta: [thumbBox.left - selectedBox.left, thumbBox.top - selectedBox.top,
            thumbBox.width - selectedBox.width, thumbBox.height - selectedBox.height],
          navBeforeCrumb: document.querySelector('[data-manage-bar]')!.getBoundingClientRect().bottom <= document.querySelector('[data-manage-crumb]')!.getBoundingClientRect().top,
          crumbBeforeTitle: document.querySelector('[data-manage-crumb]')!.getBoundingClientRect().bottom <= document.querySelector('[data-manage-title]')!.getBoundingClientRect().top,
          titleLeft: Math.round(document.querySelector('[data-manage-title]')!.getBoundingClientRect().left - document.querySelector('#grid')!.getBoundingClientRect().left),
        };
      });
      assert.deepEqual(read.colors, [muted, ink], 'The parent is not --muted, or the current item did not rise to --ink');
      assert.deepEqual(read.separators, [muted, null], 'The separator brightened with the current item, or the last item also carries one');
      assert.equal(read.gap, '6px');
      assert.deepEqual([read.tab, read.fill], [ink, fill]);
      assert.equal(read.buttonFill, 'rgba(0, 0, 0, 0)');
      assert.ok(read.selectionDelta.every(value => Math.abs(value) < 1), 'The selection base never aligned with the current nav item');
      assert.equal(read.navBeforeCrumb, true);
      assert.equal(read.crumbBeforeTitle, true);
      assert.equal(read.titleLeft, 0);
      assert.deepEqual(opened.problems.filter((line) => !line.includes('/api/links/check')), []);
    } finally {
      await opened.close();
    }
  });

  it('Volume cards never flip and hover runs the segment preview, with stacked edges sharing the cover\'s radius tier', { timeout: 60_000 }, async () => {
    /* All volumes share the same code's jacket, and flipping over shows the same image. The demo library has no volumes, so the first card carries one. */
    const opened = await openCatalogFixture(browser, (payload) => {
      const [first, second] = payload.items;
      payload.items[0] = { ...first, part_group: {
        key: 'DEMO-PART', title: 'DEMO-PART', count: 2, seed_id: first.id,
        item_ids: [first.id, second.id], total_duration: 120, total_size: 1 } };
    });
    try {
      const shapeOf = (selector: string) => opened.page.locator(selector).first().evaluate((element) => {
        const stack = element.querySelector('[data-media-stack],[data-mix-stack]')!;
        const cover = element.querySelector('[data-media-pic],[data-mix-cover]')!;
        return {
          // The cover cell's corners are clipped out by clip-path (media-card.css); the cell itself writes no border-radius.
          cover: getComputedStyle(cover).clipPath.match(/round (\S+)\)$/)?.[1] ?? '0px',
          ground: getComputedStyle(cover).backgroundColor,
          layers: ['::before', '::after'].map((pseudo) => getComputedStyle(stack, pseudo).borderTopLeftRadius),
          faces: element.querySelectorAll('[data-mix-faces]').length,
          preview: Boolean(element.querySelector('[data-media-preview]')),
        };
      });
      await opened.page.locator('[data-media-card][data-part-seed]').first().waitFor({ timeout: 10_000 });
      const part = await shapeOf('[data-media-card][data-part-seed]');
      assert.notEqual(part.cover, '0px', 'The cover has no radius, making the comparison moot');
      assert.deepEqual(part.layers, [part.cover, part.cover], 'The volume card\'s stacked edges and cover do not share one radius tier');
      // A paper edge sits behind the cover cell: when the cell is empty, the paper edge lines show through wherever the cover does not cover.
      assert.notEqual(part.ground, 'rgba(0, 0, 0, 0)', 'The stacked card\'s cover cell is transparent, letting edges show through the cover');
      assert.equal(part.faces, 0, 'The volume card still carries its flip panel');
      assert.ok(part.preview, 'Volume card hover has no segment-preview entry');
      if (await opened.page.locator('#grid [data-mix-card]').count()) {
        const mix = await shapeOf('#grid [data-mix-card]');
        assert.deepEqual(mix.layers, [mix.cover, mix.cover], 'The Mix card\'s layered paper edge and cover do not share the same corner radius tier');
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The volume count fades on hover and keyboard focus, yielding the top-right corner to the countdown ring', { timeout: 60_000 }, async () => {
    const opened = await openCatalogFixture(browser, (payload) => {
      const [first, second] = payload.items;
      payload.items[0] = { ...first, part_group: {
        key: 'DEMO-PART', title: 'DEMO-PART', count: 2, seed_id: first.id,
        item_ids: [first.id, second.id], total_duration: 120, total_size: 1 } };
    });
    try {
      const page = opened.page;
      const card = page.locator('[data-media-card][data-part-seed]').first();
      await card.waitFor({ timeout: 10_000 });
      const read = () => card.evaluate(async (element) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const group = element.querySelector<HTMLElement>('[data-media-group]')!;
        const box = group.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          group: [getComputedStyle(group).opacity, getComputedStyle(group).visibility],
          later: getComputedStyle(element.querySelector('[data-media-later]')!).opacity,
          hitGroup: hit?.closest('[data-media-group]') === group,
        };
      });
      await page.mouse.move(0, 0);
      assert.deepEqual(await read(), { group: ['1', 'visible'], later: '0', hitGroup: true }, 'Without hover the volume count did not display as usual');

      await card.locator('[data-media-pic]').hover();
      assert.deepEqual(await read(), { group: ['0', 'hidden'], later: '1', hitGroup: false },
        'The volume count did not fade on hover, or still covers the top-right hover tool');

      await page.mouse.move(0, 0);
      const opener = card.locator('[data-media-open]');
      await opener.focus();
      assert.equal(await opener.evaluate((element) => element.matches(':focus-visible')), true);
      assert.deepEqual(await read(), { group: ['0', 'hidden'], later: '1', hitGroup: false }, 'On keyboard focus the volume count never fades');
      assert.equal(await card.locator('[data-media-preview]').evaluate((element) => getComputedStyle(element).opacity), '1',
        'On keyboard focus the top-right corner has no open-preview key');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Lift and push-apart belong only to video cards\' co-star avatars', { timeout: 60_000 }, async () => {
    const opened = await openCatalog(browser);
    try {
      await opened.page.emulateMedia({ reducedMotion: 'no-preference' });
      for (const selector of ['[data-tier-performer]', '[data-tier-studio]']) {
        const entry = opened.page.locator(selector).first();
        if (!await entry.count()) continue;
        await entry.hover();
        await opened.page.waitForTimeout(320);
        assert.equal(await entry.evaluate((element) => getComputedStyle(element).transform), 'none',
          `${selector} still carries the video co-star avatar lift effect`);
      }
    } finally {
      await opened.close();
    }
  });

  it('The video card is one whole entry while inner links stay independent', { timeout: 60_000 }, async () => {
    const opened = await openCatalogFixture(browser, (payload) => {
      payload.items[0] = { ...payload.items[0], tags: ['Demo tag'] };
    });
    try {
      const card = opened.page.locator('#grid [data-media-card][data-id]').first();
      const opener = card.locator('[data-media-open]');
      const boxes = await Promise.all([card.boundingBox(), opener.boundingBox()]);
      assert.deepEqual(boxes[1], boxes[0], 'The whole-card entry does not cover image, text, and card whitespace');
      await card.hover();
      assert.notEqual(await card.evaluate((element) => getComputedStyle(element).backgroundColor),
        'rgba(0, 0, 0, 0)', 'Hovering the whole card gives no gray feedback');

      await opened.page.setViewportSize({ width: 390, height: 844 });
      const narrow = await Promise.all([card.boundingBox(), opener.boundingBox()]);
      assert.deepEqual(narrow[1], narrow[0], 'At 390px the whole-card entry does not cover the full card');
      assert.ok((narrow[0]?.x || 0) >= 0 && (narrow[0]?.x || 0) + (narrow[0]?.width || 0) <= 390,
        'At 390px a video card leaves the viewport');

      const nested = card.locator('button[data-media-tag]').first();
      const tag = await nested.getAttribute('data-tag');
      assert.ok(tag, 'The demo card has no operable inner tags');
      await nested.focus();
      assert.equal(await nested.evaluate((element) => element.matches(':focus-visible')), true,
        'Links inside the card cannot take keyboard focus');
      await nested.press('Enter');
      await opened.page.waitForURL((url) => url.searchParams.get('tag') === tag, { timeout: 10_000 });
      assert.doesNotMatch(opened.page.url(), /\/item\//, 'A bubbling card link click opened the video');
    } finally {
      await opened.close();
    }
  });

  for (const [label, viewport] of [['390px', MOBILE], ['Widescreen', DESKTOP]] as const) {
    it(`Under ${label} the tutorial center can be read, dismissed, and reopened without submitting any business writes`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/', viewport, freshTutorial);
      try {
        const page = opened.page;
        await expectBody(page, '/', [page.locator('#grid')]);
        await settle(page);
        const writes: string[] = [];
        const streams: string[] = [];
        page.on('request', request => {
          if (/^\/(?:stream|api\/stream-plan)/.test(new URL(request.url()).pathname)) streams.push(request.url());
          if (new URL(request.url()).pathname === '/api/diagnostics/client-error' && request.postDataJSON()?.kind === 'context') return;
          if (new URL(request.url()).pathname.startsWith('/api/') && new URL(request.url()).pathname !== '/api/tutorial-progress' && !['GET', 'HEAD'].includes(request.method())) {
            writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
          }
        });
        const opener = page.locator('#tutorialBtn');
        await page.locator('.peach-guide-popover').getByRole('heading', { name: 'Opens the guided tour from here' }).waitFor();
        assert.ok(await opener.evaluate(node => node.classList.contains('driver-active-element')));
        await opener.click();
        const dialog = page.getByRole('dialog', { name: 'Guided tour', exact: true });
        await dialog.waitFor();
        for (const name of ['Get started', 'Interface tour', 'Settings tour']) {
          await dialog.locator('label').filter({ has: page.getByRole('radio', { name, exact: true }) }).click();
          assert.equal(await dialog.locator('[data-guide-banner]').count(), 1, `${name} is missing the shared leading area`);
          assert.equal(await dialog.locator('[data-guide-banner] .peach-guide-topic-icon svg').count(), 1, `${name} is missing an icon`);
        }
        const box = await dialog.boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
          'The tutorial center escapes the viewport');
        await dialog.locator('label').filter({ has: page.getByRole('radio', { name: 'Settings tour', exact: true }) }).click();
        const segments = await dialog.getByRole('radiogroup', { name: 'Tour path' }).evaluate(node => {
          const surface = node.querySelector('[data-moving-surface]')!;
          const first = node.querySelector('label')!;
          return { position: getComputedStyle(surface).position, inset: first.getBoundingClientRect().left - node.getBoundingClientRect().left };
        });
        assert.equal(segments.position, 'absolute', 'The selected backing plate takes no layout space inside the segmented control');
        assert.ok(segments.inset <= 8, `${segments.inset}px of blank space appears before the first option`);
        const scroller = dialog.locator('.peach-guide-body');
        assert.equal(await scroller.evaluate(node => getComputedStyle(node).scrollbarWidth), 'none', 'The body should use the shared overlay scrollbar');
        const headerTop = (await dialog.locator('header').boundingBox())!.y;
        await scroller.evaluate(node => { node.scrollTop = node.scrollHeight });
        assert.equal((await dialog.locator('header').boundingBox())!.y, headerTop, 'The header scrolled away with the body');
        await dialog.getByRole('searchbox', { name: 'Search the tours' }).fill('The nonexistent feature xyz');
        await dialog.getByRole('heading', { name: 'No matching tour', exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Close the guided tour', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement === document.getElementById('tutorialBtn'));
        await opener.click();
        await dialog.waitFor();
        const inside = (await dialog.locator('header').boundingBox())!;
        await page.mouse.move(inside.x + 40, inside.y + 20);
        await page.mouse.down();
        await page.mouse.move(2, 2);
        await page.mouse.up();
        assert.ok(await dialog.isVisible(), 'Dragging from the body onto the overlay must not close the tour');
        await page.mouse.click(2, 2);
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement === document.getElementById('tutorialBtn'));
        await opener.click();
        await dialog.waitFor();
        await dialog.locator('label').filter({ has: page.getByRole('radio', { name: 'Interface tour', exact: true }) }).click();
        assert.equal(await dialog.locator('[data-guide-topic]').count(), 4);
        await dialog.locator('[data-guide-topic="browse"] > details > summary').click();
        await dialog.getByRole('button', { name: /找到并播放/ }).click();
        await page.locator('.peach-guide-popover').waitFor();
        assert.equal(await dialog.isVisible(), false, 'Clicking a chapter still lands on the middle intro page');
        const playbackGuide = page.locator('.peach-guide-popover');
        for (let step = 0; step < 4; step += 1) await playbackGuide.getByRole('button', { name: 'Next step', exact: true }).click();
        await page.locator('#stage .vjs-control-bar.driver-active-element').waitFor();
        assert.deepEqual(await page.locator('#stage video.vjs-tech').evaluate(video => ({ paused: (video as HTMLVideoElement).paused, src: (video as HTMLVideoElement).currentSrc })), { paused: true, src: '' });
        await playbackGuide.getByRole('button', { name: 'Next step', exact: true }).click();
        await page.locator('#stage [data-player-subtitles].driver-active-element').waitFor();
        await playbackGuide.locator('#driver-popover-description').click();
        assert.equal(await page.locator('#stage .vjs-peach-settings-toggle').getAttribute('aria-expanded'), 'true', 'Clicking the explanation closed the menu being explained');
        await page.waitForFunction(() => {
          const panel = document.querySelector('.peach-guide-popover')?.getBoundingClientRect();
          return document.querySelector('.driver-overlay')?.parentElement?.id === 'stage'
            && panel && panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight;
        });
        await playbackGuide.getByRole('button', { name: 'Next step', exact: true }).click();
        await page.locator('#stage [data-local-playback-row].driver-active-element').waitFor();
        await playbackGuide.getByRole('button', { name: 'Finish this chapter', exact: true }).click();
        await page.locator('#stage[open]').waitFor({ state: 'hidden' });
        assert.deepEqual(streams, [], 'The tour requested the actual video');
        await dialog.waitFor();
        await dialog.getByRole('button', { name: 'Start the quick tour', exact: true }).click();
        const guide = page.locator('.peach-guide-popover');
        await guide.waitFor();
        await settle(page, '.peach-guide-popover');
        const guideBox = (await guide.boundingBox())!;
        assert.ok(guideBox.x >= 8 && guideBox.x + guideBox.width <= viewport.width - 8, 'The tour card is glued to the viewport edge');
        assert.ok(await guide.evaluate(node => node.contains(document.activeElement)), 'Tour focus did not stay inside the explanation card');
        const resized = viewport.width === 390 ? { width: 1280, height: 800 } : { width: 390, height: 844 };
        await page.setViewportSize(resized);
        await page.waitForFunction(() => {
          const box = document.querySelector('.peach-guide-popover')?.getBoundingClientRect();
          const target = document.querySelector('.driver-active-element')?.getBoundingClientRect();
          return box && target && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
            && target.width > 0 && target.right > 0 && target.left < innerWidth;
        });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.mouse.click(2, viewport.height - 2);
        await guide.waitFor({ state: 'hidden' });
        await dialog.waitFor();
        await dialog.getByRole('button', { name: 'Continue the quick tour', exact: true }).click();
        await guide.waitFor();
        await page.keyboard.press('Escape');
        await guide.waitFor({ state: 'hidden' });
        await dialog.waitFor();
        await dialog.getByRole('button', { name: 'Continue the quick tour', exact: true }).click();
        await guide.getByRole('button', { name: 'Skip this chapter', exact: true }).click();
        await dialog.waitFor();
        assert.equal(await guide.isVisible(), false, 'After skipping a chapter the tour still sits inside a step');
        assert.equal(await dialog.locator('[data-guide-banner][data-guide-completed]').count(), 0, 'A skip was misrecorded as complete');
        await dialog.locator('label').filter({ has: page.getByRole('radio', { name: 'Settings tour', exact: true }) }).click();
        await dialog.getByRole('button', { name: 'Learn the common settings', exact: true }).click();
        await guide.waitFor();
        for (let step = 0; step < 4; step += 1) await guide.getByRole('button', { name: 'Next step', exact: true }).click();
        await guide.getByRole('button', { name: 'Finish this chapter', exact: true }).click();
        await dialog.waitFor();
        await page.locator('#settingsPanel').waitFor({ state: 'hidden' });
        assert.equal(new URL(page.url()).pathname, '/', 'After the settings tour ends it does not return to the page you started on');
        assert.ok(await dialog.getByRole('radio', { name: 'Settings tour', exact: true }).isChecked());
        await dialog.getByRole('searchbox', { name: 'Search the tours' }).fill('Media library');
        await dialog.getByRole('button', { name: /媒体库与入库 媒体库/ }).click();
        await guide.waitFor();
        for (let step = 0; step < 8; step += 1) await guide.getByRole('button', { name: 'Next step', exact: true }).click();
        await guide.getByRole('button', { name: 'Finish this chapter', exact: true }).click();
        await dialog.waitFor();
        assert.equal(new URL(page.url()).pathname, '/', 'After the page tour ends it does not return to the page you started on');
        assert.ok(await dialog.getByRole('searchbox', { name: 'Search the tours' }).isVisible());
        await dialog.locator('label').filter({ has: page.getByRole('radio', { name: 'Interface tour', exact: true }) }).click();
        await dialog.getByRole('button', { name: 'Continue the quick tour', exact: true }).click();
        for (let step = 0; step < 3; step += 1) await guide.getByRole('button', { name: 'Next step', exact: true }).click();
        await guide.getByRole('button', { name: 'Finish this chapter', exact: true }).click();
        await dialog.waitFor();
        await opener.waitFor({ state: 'hidden' });
        assert.ok(await dialog.getByRole('button', { name: 'Watch again', exact: true }).isVisible());
        assert.equal(await dialog.locator('[data-guide-banner][data-guide-completed]').count(), 1);
        await page.reload();
        await page.locator('#grid').waitFor();
        assert.equal(await opener.isVisible(), false, 'After finishing the quick tour, a refresh shows the tour button again');
        assert.deepEqual(writes, [], 'A read-only tour triggered a business write');
        await page.goto(new URL('/settings/maintenance', page.url()).href);
        await page.getByRole('region', { name: 'Guided tour', exact: true }).getByRole('button', { name: 'Reopen', exact: true }).click();
        await dialog.waitFor();
        assert.equal(await opener.evaluate(node => (node as HTMLElement).hidden), false, 'Reopening settings did not restore the top-bar entry');
        assert.ok(writes.every(write => write === 'POST /api/configuration/storage/measure'),
          `Entering the maintenance page normally only allows automatic usage measurement: ${JSON.stringify(writes)}`);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }

  it('Dropdowns on the review filter bar match the buttons\' height', { timeout: 60_000 }, async () => {
    const opened = await openReview(browser);
    try {
      /* BoardUI's Button and Input hardcode h-8/h-9, and Select's trigger only has padding,
         stretching itself to 28px/38px. Side by side, that 4px is visible at a glance. What gets measured is every
         control on the whole filter bar, not naming one: whatever this row gains later must land on the same tier. */
      const heights = await opened.page.locator('[data-review-filter]')
        .evaluate((bar) => [...bar.querySelectorAll('button')]
          .map((node) => Math.round(node.getBoundingClientRect().height)));
      assert.ok(heights.length >= 2, `Only ${heights.length} controls measured on the filter bar`);
      assert.deepEqual([...new Set(heights)], [heights[0]],
        `Filter bar control heights are uneven: ${heights.join(' / ')}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The review card\'s checkbox and title share one midline', { timeout: 60_000 }, async () => {
    const opened = await openReview(browser);
    try {
      /* Checkbox 16px, title row 24px (the field name is a caption Chip). Two things of different heights
         aligned top to top read as the checkbox sticking up above the title, even though they describe the same card. */
      const offset = await opened.page.locator('section[data-review-key] header').first()
        .evaluate((element) => {
          const middle = (node: Element) => {
            const box = node.getBoundingClientRect();
            return box.top + box.height / 2;
          };
          return middle(element.querySelector('label > span[aria-hidden="true"]')!) - middle(element.querySelector('h4')!);
        });
      assert.ok(Math.abs(offset) <= 1, `The checkbox is offset from the title by ${offset.toFixed(1)}px, not on the same centerline`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Source evidence uses underline-free expand buttons with clearly visible text differences', { timeout: 60_000 }, async () => {
    const row = { ...REVIEW_ROW, field: 'title', field_label: 'Title', current_value: 'Shared old title.',
      candidates: ['dmm', 'javdb'].map(source => ({ candidate_key: `${source}:title`, source,
        display_value: 'Shared new title.', catalog_evidence: { title: { display_value: 'Shared new title.' } } })) };
    const opened = await openReview(browser, [row]);
    try {
      const card = opened.page.locator('section[data-review-key]').first();
      const toggle = card.getByRole('button', { name: 'Expand the dmm source evidence', exact: true });
      await toggle.hover();
      const observed = await toggle.evaluate(node => ({ tag: node.tagName,
        underline: [node, ...node.querySelectorAll('*')].some(element =>
          getComputedStyle(element).textDecorationLine.includes('underline')) }));
      assert.deepEqual(observed, { tag: 'BUTTON', underline: false });
      const mark = card.locator('label:has(input[type="radio"]) mark').first();
      assert.equal(await mark.textContent(), 'new');
      const color = await mark.evaluate(node => ({ text: getComputedStyle(node).color,
        parent: getComputedStyle(node.parentElement!).color, background: getComputedStyle(node).backgroundColor }));
      assert.notEqual(color.text, color.parent);
      assert.notEqual(color.background, 'rgba(0, 0, 0, 0)');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`Review of long profiles scrolls only the body; card header and verdict actions stay inside the card ${viewport.width}`, { timeout: 60_000 }, async () => {
      const row = { ...REVIEW_ROW, current_value: 'The complete profile currently on record.'.repeat(20),
        candidates: ['dmm', 'javdb'].map(source => ({ candidate_key: `${source}:studio`, source,
          content_id: 'very-long-content-identifier'.repeat(8),
          display_value: 'Long profile provided by the source.'.repeat(30) })) };
      const opened = await openReview(browser, [row], viewport);
      try {
        const geometry = await opened.page.locator('section[data-review-key]').first().evaluate(node => {
          const box = node.getBoundingClientRect();
          const body = node.querySelector('[data-overlay-scrollbar]')!;
          const footer = node.querySelector('footer')!.getBoundingClientRect();
          return { areas: node.querySelectorAll('[data-overlay-scrollbar]').length,
            scrolls: body.scrollHeight > body.clientHeight,
            footerInside: footer.top >= box.top && footer.bottom <= box.bottom + 1,
            overflow: node.scrollWidth > node.clientWidth,
            pageOverflow: document.documentElement.scrollWidth > innerWidth,
            currentInBody: body.contains(node.querySelector('[aria-label="Current info"]')),
            sourceOverflow: [...node.querySelectorAll('label:has(input[type="radio"])')]
              .some(label => label.scrollWidth > label.clientWidth + 1) };
        });
        assert.deepEqual(geometry, { areas: 1, scrolls: true, footerInside: true,
          overflow: false, pageOverflow: false, currentInBody: true, sourceOverflow: false });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });

    it(`Dividers separate unindexed terms ${viewport.width}`, { timeout: 60_000 }, async () => {
      const row = { ...REVIEW_ROW, candidates: [{ ...REVIEW_ROW.candidates[0]!,
        unmapped_genres: ['アクメ・オーガズム', 'Beautiful girl film'] }] };
      const opened = await openReview(browser, [row], viewport);
      try {
        const group = opened.page.getByRole('group', { name: 'Uncollected genre', exact: true });
        const rows = group.getByRole('listitem');
        assert.equal(await rows.count(), 2);
        const dividers = await rows.evaluateAll(nodes => nodes.map(node => {
          const style = getComputedStyle(node);
          const parent = getComputedStyle(node.closest('[role="group"]')!);
          return { width: style.borderTopWidth, solid: style.borderTopStyle === 'solid',
            visible: style.borderTopColor !== parent.backgroundColor && style.borderTopColor !== 'rgba(0, 0, 0, 0)' };
        }));
        assert.deepEqual(dividers.map(row => row.width), ['0px', '1px']);
        assert.ok(dividers[1]!.solid && dividers[1]!.visible, 'Entry divider not visible');
        assert.equal(await rows.nth(0).getByRole('button', { name: 'Included', exact: true }).count(), 1);
        assert.equal(await rows.nth(1).getByRole('button', { name: 'Not content', exact: true }).count(), 1);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });

    it(`Review source switching scrolls only the evidence body; card header and action bar stay fixed ${viewport.width}`, { timeout: 60_000 }, async () => {
      const row = { ...REVIEW_ROW, candidates: ['dmm', 'javdb', 'mgs'].map(source => ({
        candidate_key: `${source}:studio`, source, display_value: 'プレステージ',
        catalog_evidence: {
          title: { display_value: '隣の人妻と過ごす休日' },
          runtime: { display_value: '120 min' },
          director: { display_value: '田中' },
          label: { display_value: 'プレステージ' },
        },
      })) };
      const opened = await openReview(browser, [row], viewport);
      try {
        const card = opened.page.locator('section[data-review-key]').first();
        const scroller = card.locator('div[data-overlay-scrollbar]').first();
        const choices = card.locator('label:has(input[type="radio"])');
        await card.scrollIntoViewIfNeeded();
        const geometry = () => card.evaluate(node => {
          const rect = (element: Element) => {
            const box = element.getBoundingClientRect();
            return { top: box.top, height: box.height };
          };
          return { page: window.scrollY, scroll: node.scrollTop, card: rect(node),
            header: rect(node.querySelector('header')!), footer: rect(node.querySelector('footer')!) };
        });
        const before = await geometry();
        const unanchored = await card.locator('input[type="radio"], input[type="checkbox"]')
          .evaluateAll(inputs => inputs.flatMap(input => {
            const native = input.getBoundingClientRect();
            const label = input.closest('label')!.getBoundingClientRect();
            const inside = native.top >= label.top - 1 && native.bottom <= label.bottom + 1
              && native.left >= label.left - 1 && native.right <= label.right + 1;
            return inside ? [] : [{type:(input as HTMLInputElement).type,native:native.toJSON(),label:label.toJSON(),parent:input.parentElement?.outerHTML.slice(0,500)}];
          }));
        assert.deepEqual(unanchored, [], 'The hidden input is not positioned with its own radio or checkbox label');
        for (const at of [1, 2, 0]) {
          const choice = choices.nth(at);
          await choice.evaluate(node => {
            const body = node.closest('div[data-overlay-scrollbar]')!;
            body.scrollTop += node.getBoundingClientRect().top - body.getBoundingClientRect().top;
          });
          await choice.click();
          assert.equal(await choice.locator('input').isChecked(), true);
          assert.deepEqual(await geometry(), before, 'Clicking a source moved the page, cards, or the action bar');
        }
        await choices.first().locator('input').focus();
        for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp']) {
          await opened.page.keyboard.press(key);
          assert.deepEqual(await geometry(), before, 'Arrow keys moved the page, cards, or the action bar');
          const visible = await scroller.evaluate(node => {
            const input = node.querySelector<HTMLInputElement>('input:checked')!;
            const box = input.getBoundingClientRect();
            const body = node.getBoundingClientRect();
            return box.top >= body.top - 1 && box.bottom <= body.bottom + 1;
          });
          assert.ok(visible, 'The keyboard-selected source did not enter the visible body area');
        }
        const selected = await choices.locator('input').evaluateAll(inputs =>
          inputs.map(input => (input as HTMLInputElement).checked));
        for (const source of ['javdb', 'mgs']) {
          await opened.page.keyboard.press('Tab');
          const evidence = card.getByRole('button', { name: new RegExp(`^(Expand|Collapse) source evidence for ${source}$`) });
          assert.equal(await evidence.evaluate(node => node === document.activeElement), true,
            'Tab should reach the independent source evidence in document order');
          await opened.page.keyboard.press('Space');
          assert.equal(await evidence.getAttribute('aria-expanded'), 'true');
          await opened.page.keyboard.press('Space');
          assert.equal(await evidence.getAttribute('aria-expanded'), 'false');
          assert.deepEqual(await choices.locator('input').evaluateAll(inputs =>
            inputs.map(input => (input as HTMLInputElement).checked)), selected,
            'Expanding the evidence must not change the chosen source');
        }
        await opened.page.keyboard.press('Tab');
        assert.equal(await card.locator('footer').evaluate(node => node.contains(document.activeElement)), true,
          'After the access rationale, Tab should leave the body and move to the judgment actions');
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }

  it('Review scroll edges appear per direction, and current info plus candidates share the body scroll', { timeout: 60_000 }, async () => {
    const opened = await openReview(browser);
    try {
      const card = opened.page.locator('section[data-review-key]').first();
      const scroller = card.locator('div[data-overlay-scrollbar]').first();
      // More candidate content, covering the overflow recompute after image loads or queue updates.
      await scroller.evaluate((node) => {
        const content = document.createElement('div');
        content.style.cssText = 'height:1000px;flex-shrink:0';
        content.dataset.scrollTest = '';
        node.append(content);
      });
      const edges = scroller.locator('..').locator('.ui-ov-edges');
      await opened.page.waitForFunction(() => !!document.querySelector('[data-review-key] .ui-can-scroll-bottom'));
      assert.equal(await edges.evaluate((node) => node.classList.contains('ui-can-scroll-top')), false);
      await scroller.evaluate((node) => { node.scrollTop = 100 });
      await opened.page.waitForFunction(() => !!document.querySelector('[data-review-key] .ui-can-scroll-top.ui-can-scroll-bottom'));
      assert.equal(await edges.evaluate((node) => getComputedStyle(node).pointerEvents), 'none');
      assert.equal(await edges.locator('.ui-ov-edge-top').evaluate((node) => getComputedStyle(node).backdropFilter), 'blur(2px)');
      const track = scroller.locator('..').locator('.ovtrack.ov-y');
      for (const viewport of [DESKTOP, MOBILE]) {
        await opened.page.setViewportSize({ width: viewport.width, height: viewport.height });
        const bounds = await track.evaluate((node) => {
          const scroll = node.parentElement!.querySelector('[data-overlay-scrollbar]')!.getBoundingClientRect();
          const rail = node.getBoundingClientRect();
          const card = node.closest('section')!.getBoundingClientRect();
          return { gap: rail.left - scroll.right, inset: card.right - rail.right };
        });
        assert.ok(bounds.gap >= -1, `Scrollbar hit area covers the body: ${JSON.stringify(bounds)}`);
        assert.ok(bounds.inset >= 1, `The scrollbar leaves the card: ${JSON.stringify(bounds)}`);
      }
      await opened.page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
      const thumb = await track.locator('.ovthumb').boundingBox();
      assert.ok(thumb);
      await opened.page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
      await opened.page.mouse.down();
      await opened.page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2 + 30);
      await opened.page.mouse.up();
      assert.ok(await scroller.evaluate((node) => node.scrollTop > 100), 'Dragging the right track does not scroll the body');
      await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight });
      await opened.page.waitForFunction(() => !document.querySelector('[data-review-key] .ui-can-scroll-bottom'));
      await scroller.locator('[data-scroll-test]').evaluate((node) => node.remove());
      await opened.page.waitForFunction(() => !document.querySelector('[data-review-key] [data-scroll-edges]'));
      const current = await card.getByRole('region', { name: 'Current info' }).evaluate((node) => {
        const style = getComputedStyle(node);
        return { inBody: !!node.closest('[data-overlay-scrollbar]'), overflow: style.overflowY,
          areas: node.closest('section[data-review-key]')!.querySelectorAll('[data-overlay-scrollbar]').length };
      });
      assert.equal(current.inBody, true, 'The current details are not in the candidates\' shared body');
      assert.equal(current.areas, 1, 'One card ended up with multiple independent scroll areas');
      assert.notEqual(current.overflow, 'auto', 'The current profile should not scroll separately again');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close() }
  });

  it('In the dark theme an unchecked checkbox\'s border is no weaker than in light', { timeout: 60_000 }, async () => {
    const opened = await openReview(browser);
    try {
      /* The box's fill matches the card face, so the whole shape speaks through that 1px border. On light it is a pale gray line on white;
         on dark it must be at least as clear, or the card reads as having no box. */
      /* The computed value is the raw `oklch()` string, which cannot be parsed into channels; painting it into a 1×1 canvas and reading it back gives RGBA. */
      const edge = () => opened.page.locator('section[data-review-key] header label > span').first()
        .evaluate((node) => {
          const context = document.createElement('canvas').getContext('2d')!;
          const paint = (color: string) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
          };
          const style = getComputedStyle(node);
          return [paint(style.borderTopColor), paint(style.backgroundColor)] as const;
        });
      const [lightEdge, lightFace] = await edge();
      // `applyTheme('dark')` in `web/app.js` is exactly these two lines; this only borrows it to switch the palette once.
      await opened.page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
        document.documentElement.classList.add('dark');
      });
      const [darkEdge, darkFace] = await edge();
      const light = Math.abs(lightness(lightEdge) - lightness(lightFace));
      const dark = Math.abs(lightness(darkEdge) - lightness(darkFace));
      assert.ok(dark >= light,
        `In the dark theme the border and the fill differ by ${dark.toFixed(1)} lightness, in the light theme by ${light.toFixed(1)}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('In the dark theme dividers are no weaker than light on either card face', { timeout: 60_000 }, async () => {
    const opened = await openReview(browser);
    try {
      /* What's measured is a token pair, not a particular line: where `separator-border` draws on which surface is decided by each spot itself;
         the line between the review card's header and the candidate block lands on `primary`, and the footnote strip's line lands on `secondary`. Calling out each one by name
         means adding a new spot requires remembering to add a test case too, and a missing one looks identical on screen to "this spot never had a line".
         Finally, re-check that the divider inside the review card really resolves to this token, so both tiers passing doesn't hide the fact that it never reached the real place. */
      const read = () => opened.page.locator('section[data-review-key]').first()
        .evaluate((node) => {
          const context = document.createElement('canvas').getContext('2d')!;
          const paint = (color: string) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
          };
          const style = getComputedStyle(node);
          const token = (name: string) => paint(style.getPropertyValue(name).trim());
          return {
            line: token('--color-separator-border'),
            card: token('--color-background-primary-default'),
            filled: token('--color-background-secondary-default'),
            edge: paint(getComputedStyle(node.querySelector('.border-separator-border')!).borderBottomColor),
          };
        });
      const before = await read();
      // `applyTheme('dark')` in `web/app.js` is exactly these two lines; this only borrows it to switch the palette once.
      await opened.page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
        document.documentElement.classList.add('dark');
      });
      const after = await read();
      for (const [face, label] of [['card', 'Outlined card face'], ['filled', 'Filled card face']] as const) {
        const light = Math.abs(lightness(before.line) - lightness(before[face]));
        const dark = Math.abs(lightness(after.line) - lightness(after[face]));
        assert.ok(dark >= light,
          `In dark mode the divider over ${label} differs by only ${dark.toFixed(1)} lightness, versus ${light.toFixed(1)} in light mode`);
      }
      assert.deepEqual(after.edge, after.line, 'The review card\'s divider is not using separator-border');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Junk files\' count row matches the body width, with the title at the content\'s top-left', { timeout: 60_000 }, async () => {
    const opened = await openJunk(browser);
    try {
      /* The title aligns with the content's left edge; summary, category switching and the grid share the body width. */
      const box = await opened.page.evaluate(() => {
        // Light mode is where two surfaces most easily vanish into each other: in dark mode primary is already a step brighter than the page.
        document.documentElement.dataset.theme = 'light';
        document.documentElement.classList.remove('dark');
        const span = (selector: string) => {
          const rect = document.querySelector(selector)!.getBoundingClientRect();
          return { left: Math.round(rect.left), width: Math.round(rect.width) };
        };
        const face = (selector: string) =>
          getComputedStyle(document.querySelector(selector)!).backgroundColor;
        return {
          title: span('[data-manage-title]'),
          main: span('#main'),
          summary: span('#count [data-collection-summary]'),
          filters: span('#count [data-junk-filters-frame]'),
          grid: span('#grid'),
          summaryFace: face('#count [data-collection-summary]'),
          filtersFace: face('#count [data-junk-filters-frame]'),
          page: getComputedStyle(document.body).backgroundColor,
        };
      });
      assert.ok(box.filters.width > 0, 'The category switch collapses to zero width under the summary, invisible at desktop width');
      assert.deepEqual(box.title, box.grid);
      assert.equal(box.title.width, box.grid.width);
      for (const [label, measured] of [['Summary', box.summary], ['Category switch', box.filters]] as const) {
        assert.deepEqual(measured, box.grid,
          `${label} is not as wide as the body grid: ${measured.left}+${measured.width} against ${box.grid.left}+${box.grid.width}`);
      }
      assert.notEqual(box.summaryFace, box.page, 'The summary surface matches the page background, making it invisible');
      assert.notEqual(box.filtersFace, box.page, 'The category switch surface is the same color as the page background, so the whole block is invisible');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('While junk files and other data are pending, it still draws its own count row', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/junk-files', WIDE);
    try {
      /* Hold the waiting state on screen: let this page's only fetch hang unanswered. Only the counts are waiting; category switching is decided by
         the URL and can paint its final form right now; painting the catalog version instead would show a row of batch-change and sort keys
         this page does not even have while waiting, replaced by something else entirely once data arrives. */
      await opened.page.route('**/api/ads?**', () => {});
      await opened.page.reload({ waitUntil: 'load' });
      // Wait for the island takeover: the shell-laid skeleton matches the version it shows while waiting for data, and only this version counts after takeover.
      await opened.page.locator(`${JUNK_COUNT} [data-junk-filters]`).waitFor({ timeout: 15_000 });
      const row = await opened.page.locator('#count').evaluate((node) => ({
        busy: node.getAttribute('aria-busy'),
        filters: node.querySelectorAll('[data-junk-filters] a').length,
        placeholder: node.querySelectorAll('[data-collection-summary] [data-skeleton="count"]').length,
        sorts: node.querySelectorAll('.sorts').length,
      }));
      assert.equal(row.busy, 'true', 'The waiting state is not exposed to assistive technology');
      assert.ok(row.filters > 0, 'While waiting this row has no category switch');
      assert.equal(row.placeholder, 1, 'The placeholder does not land in the stat cell');
      assert.equal(row.sorts, 0, 'While waiting, a sort key this page does not have is showing');
    } finally {
      await opened.close();
    }
  });

  it('Disposing of a junk card sends one batch request and the card leaves with it; switching categories never does a full page jump', { timeout: 90_000 }, async () => {
    const opened = await openJunkWith(browser, [
      junkItem(9101, 'archive', 'Promo compilation.zip'), junkItem(9102, 'url', 'Official site.url'), junkItem(9103, 'audio', 'Ad.mp3'),
    ]);
    try {
      const page = opened.page;
      const cards = page.locator('#grid [data-junk-card]');
      assert.equal(await cards.count(), 3);
      await cards.first().locator('[data-junk-action="dispose"]').click();
      await page.waitForFunction(() => document.querySelectorAll('#grid [data-junk-card]').length === 2, null,
        { timeout: 10_000 });
      assert.deepEqual(opened.state.batches, [{ ids: [9101], operation: 'dispose', disposal_reason: 'junk' }]);
      await page.getByText('Moved to trash', { exact: true }).first().waitFor({ timeout: 5_000 });

      // Categories are `<a href>` elements and a plain left click has the shell change the address and re-read: a full page reload would lose this flag recorded on the page.
      await page.evaluate(() => { (window as { junkStay?: boolean }).junkStay = true });
      await page.locator(`${JUNK_COUNT} [data-junk-kind-link="url"]`).click();
      await page.waitForFunction(() => location.search === '?type=url'
        && document.querySelectorAll('#grid [data-junk-card]').length === 1, null, { timeout: 10_000 });
      assert.equal(await page.evaluate(() => (window as { junkStay?: boolean }).junkStay), true, 'Switching categories reloads the whole page');
      assert.match(opened.state.reads.at(-1)!, /kind=url/);
      assert.equal(await page.locator(`${JUNK_COUNT} [data-junk-kind-link="url"]`).getAttribute('aria-current'), 'page');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The junk card is one bordered surface: three equal-width centered keys, with move-to-trash solid red at rest', { timeout: 90_000 }, async () => {
    const opened = await openJunkWith(browser, [junkItem(9201, 'archive', 'Promo.zip'), junkItem(9202, 'url', 'Official site.url')]);
    try {
      const page = opened.page;
      const read = () => page.evaluate(() => {
        const card = document.querySelector('#grid [data-junk-card]')!;
        const keys = [...card.querySelectorAll('[data-junk-action]')].map((button) => {
          const style = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return {
            action: (button as HTMLElement).dataset.junkAction, width: Math.round(rect.width), height: Math.round(rect.height),
            justify: style.justifyContent, border: style.borderTopWidth, face: style.backgroundColor, ink: style.color,
            label: getComputedStyle(button.querySelector('[data-junk-label]')!).display,
          };
        });
        const rect = (node: Element | null) => {
          if (!node) return null;
          const { left, top, width, height } = node.getBoundingClientRect();
          return [left, top, width, height].map(Math.round);
        };
        const links = [...document.querySelectorAll('#count [data-junk-filters] a')].map((link) => ({
          current: link.getAttribute('aria-current') === 'page', face: getComputedStyle(link).backgroundColor,
          height: Math.round(link.getBoundingClientRect().height), box: rect(link),
        }));
        // When the count badge arrives, the glass strip re-settles with an animation: measure after it finishes, measuring where it stopped.
        document.querySelector('#count [data-view-glide]')?.getAnimations().forEach((one) => one.finish());
        const glide = rect(document.querySelector('#count [data-view-glide]:not([hidden])'));
        // The card reads oklch inside an island while the page background is rgb: paint one pixel each and compare; a different literal does not mean a different color.
        const pixel = (color: string) => {
          const context = document.createElement('canvas').getContext('2d')!;
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].join(',');
        };
        const style = getComputedStyle(card);
        const ground = [document.body, document.documentElement].map((el) => pixel(getComputedStyle(el).backgroundColor))
          .find((value) => !value.endsWith(',0')) ?? '255,255,255,255';
        return { edge: style.borderTopWidth, line: pixel(style.borderTopColor), page: ground, keys, links, glide };
      });
      const red = await tokenColor(page, 'body', '--board-red');
      const wide = await read();
      // In light mode the card and the page are both white, so the card's outline relies entirely on this border: 1px wide, and its color must not match the page background.
      assert.equal(wide.edge, '1px', 'The junk card has no outline');
      assert.notEqual(wide.line, wide.page, 'The junk card border matches the page background');
      assert.equal(new Set(wide.keys.map((key) => key.width)).size, 1, `The three keys differ in width: ${wide.keys.map((key) => key.width)}`);
      for (const key of wide.keys) {
        assert.equal(key.justify, 'center', `${key.action}'s icon and label are not centered`);
        assert.equal(key.height, 36, `${key.action} height ${key.height}`);
      }
      const dispose = wide.keys.find((key) => key.action === 'dispose')!;
      assert.equal(dispose.face, red, 'Move-to-trash at rest is not solid red');
      assert.equal(dispose.ink, 'rgb(255, 255, 255)');
      for (const key of wide.keys.filter((one) => one.action !== 'dispose')) assert.equal(key.border, '1px', `${key.action} has no outline`);
      const current = wide.links.filter((link) => link.current);
      assert.equal(current.length, 1);
      // The category bar is the home filter bar's set: the keys lay no background of their own; what sits under the active category is that sliding glass.
      assert.ok(wide.links.every((link) => link.face === 'rgba(0, 0, 0, 0)'), 'The category key paints its own background, not home\'s sliding glass');
      assert.deepEqual(wide.glide, current[0]!.box, 'The sliding glass did not land on the current category');

      // At compact density only the icon remains on the button.
      await page.evaluate(() => { document.body.dataset.density = 'dense' });
      assert.ok((await read()).keys.every((key) => key.label === 'none'), 'Under compact density the keys still carry text');
      await page.evaluate(() => { delete document.body.dataset.density });

      // Finger-tappable on mobile: the category and the three buttons all reach 44px.
      await page.setViewportSize({ width: MOBILE.width, height: MOBILE.height });
      const narrow = await read();
      assert.ok(narrow.keys.every((key) => key.height >= 44), `On mobile the key heights are ${narrow.keys.map((key) => key.height)}`);
      assert.ok(narrow.links.every((link) => link.height >= 44), `On mobile the category heights are ${narrow.links.map((link) => link.height)}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('In the follows list toolbar the primary action, layout switch, sort box, and direction key share one height', { timeout: 60_000 }, async () => {
    const opened = await openFollowManage(browser);
    try {
      const page = opened.page;
      const controls = {
        检查全部: page.locator('button[aria-label="Check all"]'),
        // The two icon buttons form one group; what aligns is the group's outer frame, not the individual buttons inside.
        版式开关: page.locator('[aria-label="Follows list layout"]'),
        排序框: page.locator('button[aria-label="Follows list sort"]'),
        方向键: page.locator('button[aria-label^="By check time"]'),
      };
      const heights: Record<string, number> = {};
      for (const [name, control] of Object.entries(controls)) {
        heights[name] = (await control.boundingBox())!.height;
      }
      assert.equal(new Set(Object.values(heights)).size, 1, `Controls in the same row have differing heights: ${JSON.stringify(heights)}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`The follows list skeleton's preference controls look identical after takeover, and action keys wait disabled (${viewport.name})`, { timeout: 60_000 }, async () => {
      /* Skeleton and real page each measured once. Layout, sort, and direction are this browser's preferences, so the skeleton already shows the final tier;
         check all, collapse all, and the row-end remove keys wait for the list, disabled in the skeleton, matching the takeover only in size.
         On narrow screens the toolbar collapses to icon-only, both collapsing along the same line, sizes matching too. */
      const opened = await visit(browser, '/subscriptions', viewport);
      try {
        const page = opened.page;
        await stubFollowManage(page);
        const release = await holdApi(page);
        await page.reload({ waitUntil: 'load' });
        await page.locator('[data-skeleton="board/subscriptions"] .ui-follow-skeleton-toolbar').waitFor({ timeout: 15_000 });
        const toolbar = '[data-skeleton] .ui-follow-skeleton-toolbar';
        const skeleton = await controlFaces(page, {
          检查全部: `${toolbar} [data-follow-toolbar-actions] > button:nth-of-type(1)`,
          默认视图: `${toolbar} [data-button-group] > button:first-child`,
          表格视图: `${toolbar} [data-button-group] > button:last-child`,
          排序框: `${toolbar} button[aria-haspopup="listbox"]`,
          方向键: `${toolbar} [data-follow-toolbar-controls] > span:last-of-type > button:last-child`,
          全部收起: `${toolbar} [data-follow-toolbar-controls] > button`,
          移除来源: '[data-skeleton] .follow-skeleton-source [data-follow-source-controls] > span:last-child > button:last-child',
        });
        const expected = await disabledTokens(page);
        const waiting = await waitingActionFaces(page, '[data-skeleton] [data-skeleton-action]');
        assert.ok(waiting.length >= 3, 'The follows list skeleton does not mark its data-waiting action keys');
        for (const face of waiting) assertDisabledFace(face, expected);
        release();
        await page.locator('section[aria-label="kou\'s follow sources"]').waitFor({ timeout: 15_000 });
        await settle(page);
        const final = await controlFaces(page, {
          检查全部: 'button[aria-label="Check all"]',
          默认视图: '[aria-label="Follows list layout"] > button:first-child',
          表格视图: '[aria-label="Follows list layout"] > button:last-child',
          排序框: 'button[aria-label="Follows list sort"]',
          方向键: 'button[aria-label^="By check time"]',
          全部收起: 'button[aria-label="Collapse all"]',
          移除来源: '[data-source-divider] [data-follow-source-controls] > span:last-child > button:last-child',
        });
        const waitsForData = new Set(['Check all', 'Collapse all', 'Remove source']);
        for (const name of Object.keys(final)) {
          assert.ok(final[name], `${name} cannot be found after takeover`);
          if (waitsForData.has(name)) {
            assert.equal(skeleton[name]!.size, final[name]!.size, `${name}'s size jumped at takeover`);
            continue;
          }
          assert.deepEqual(skeleton[name], final[name], `${name} looks different in the skeleton than after takeover`);
        }
        assert.equal(final['Default view']!.pressed, 'true', 'Under the default layout the selected one is not the grid\'s key');
      } finally {
        await opened.close();
      }
    });
  }

  /* Once the whole row is clickable, the hovered row must be distinguishable. The source row in card view and the table row follow the same rule; the selected row
     has its own background and does not change on hover. */
  it('The follows list recolors whichever row is hovered, in both views, and hover does not cover the selected row\'s background', { timeout: 60_000 }, async () => {
    const opened = await openFollowManage(browser);
    try {
      const page = opened.page;
      const background = (locator: Locator) => locator.evaluate((element) => {
        for (const animation of element.getAnimations()) animation.finish();
        return getComputedStyle(element).backgroundColor;
      });
      /* The checkbox's input is visually hidden beneath the drawn box, so clicking it needs force, same as the selected-background case above. */
      const select = () => page.getByRole('checkbox', { name: 'Select kou · Kemono' })
        .check({ force: true, timeout: 5_000 });
      const card = page.locator('[data-source-divider] > div').first();
      const cardRested = await background(card);
      await card.hover();
      assert.notEqual(await background(card), cardRested, 'Hovering a card-view source row never swapped the background');
      await select();
      const cardSelectedHovered = await background(card);
      await page.mouse.move(0, 0);
      const cardSelectedRested = await background(card);
      assert.equal(cardSelectedHovered, cardSelectedRested, 'In card view the selected row changes background on hover, covering the selected state');
      assert.notEqual(cardSelectedRested, cardRested, 'Card view\'s selected row has no background of its own');

      await page.locator('button[aria-label="Table view"]').click({ timeout: 5_000 });
      const row = page.locator('[data-board-data-table] tbody tr').first();
      await row.waitFor({ timeout: 15_000 });
      await page.mouse.move(0, 0);
      const selectedRested = await background(row);
      await row.hover();
      assert.equal(await background(row), selectedRested, 'In table view the selected row changes background on hover, covering the selected state');
      await page.getByRole('checkbox', { name: 'Select kou · Kemono' }).uncheck({ force: true, timeout: 5_000 });
      await page.mouse.move(0, 0);
      const rested = await background(row);
      assert.notEqual(selectedRested, rested, 'Table view\'s selected row has no background of its own');
      await row.hover();
      assert.notEqual(await background(row), rested, 'Hovering a table row never swapped the background');
    } finally {
      await opened.close();
    }
  });
});
