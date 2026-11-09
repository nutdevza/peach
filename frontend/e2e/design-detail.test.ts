/* Design decisions: video cards, management pages and review. Reads `getComputedStyle` to assert the appearance the user set; shared stubs and browser lifecycle live in `design-fixture.ts`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { DETAIL, openFollowFeed } from './follow-fixture.ts';
import { settle, visit, VIEWPORTS, type Viewport, type Visit } from './harness.ts';
import { muteVideos, openImmerse, pickClips, pinQueue, settledClip } from './immerse-fixture.ts';
import { ITEM, openItemPage } from './item-fixture.ts';
import { DESKTOP, MOBILE, tokenColor, installDesignBrowser } from './design-fixture.ts';

describe('Design decisions: follow details, video details, player, and sidebar', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });

  it('Follow details pager buttons are pinned 11px from the sides; 48px on desktop and 44px on mobile, with the nav bar below the image', { timeout: 90_000 }, async () => {
    const read = (page: Page) => page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('#stage [data-follow-detail-media="image"]')!;
      const next = frame.querySelector('[data-follow-image-arrow="next"]')!, style = getComputedStyle(next);
      const outer = frame.getBoundingClientRect(), box = next.getBoundingClientRect();
      const indicator = frame.querySelector('[data-media-indicator]')!.getBoundingClientRect();
      return {
        size: [box.width, box.height], background: style.backgroundColor, blur: style.backdropFilter,
        inset: outer.right - box.right, indicatorBottom: outer.bottom - indicator.bottom,
        framed: frame.hasAttribute('data-framed'),
        ratio: getComputedStyle(frame.querySelector('[data-follow-detail-poster]')!).aspectRatio,
      };
    });
    const settlePoster = async (page: Page) => {
      await page.waitForFunction(() => {
        const image = document.querySelector<HTMLImageElement>('#stage [data-follow-detail-poster]');
        return image?.complete && image.naturalWidth > 0;
      });
      // Read geometry once the image is decoded and layout is ready.
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
    };
    const wide = await openFollowFeed(browser, `/posts/${DETAIL.gallery}`, DESKTOP,
      { ready: '#stage [data-follow-image-arrow="next"]' });
    try {
      await settlePoster(wide.page);
      const shown = await read(wide.page);
      assert.deepEqual(shown.size, [48, 48]);
      assert.equal(shown.background, 'rgba(0, 0, 0, 0.6)');
      assert.equal(shown.blur, 'blur(16px)');
      assert.ok(Math.abs(shown.inset - 11) <= 1, `Arrow padding: ${JSON.stringify(shown)}`);
      assert.ok(Math.abs(shown.indicatorBottom - 8) <= .5, `Nav bottom padding is ${shown.indicatorBottom}px`);
      // The frame ratio follows the whole image group: details do not jump in height when the image changes.
      assert.equal(shown.framed, true);
      assert.match(shown.ratio, /^0\.75\b/);
      assert.deepEqual(wide.problems, []);
    } finally {
      await wide.close();
    }
    const narrow = await openFollowFeed(browser, `/posts/${DETAIL.gallery}`, MOBILE,
      { ready: '#stage [data-follow-image-arrow="next"]' });
    try {
      await settlePoster(narrow.page);
      const shown = await read(narrow.page);
      assert.deepEqual(shown.size, [44, 44]);
      assert.ok(Math.abs(shown.inset - 11) <= 1, `Narrow-screen arrow padding: ${JSON.stringify(shown)}`);
      assert.ok(Math.abs(shown.indicatorBottom - 8) <= .5, `Narrow-screen nav bar bottom padding is ${shown.indicatorBottom}px`);
      assert.deepEqual(narrow.problems, []);
    } finally {
      await narrow.close();
    }
  });

  it('Follow details: media without a preview fills 16:9; tags keep their source categories and reuse the details tag look', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, `/posts/${DETAIL.bare}`, DESKTOP,
      { ready: '#stage [data-follow-detail-tags]' });
    try {
      const page = opened.page;
      const shown = await page.evaluate(() => ({
        placeholder: getComputedStyle(document.querySelector('#stage [data-follow-detail-placeholder]')!).aspectRatio,
        tags: Object.fromEntries([...document.querySelectorAll<HTMLElement>('#stage [data-follow-detail-tags] [data-follow-tag]')].map((tag) =>
          [tag.dataset.followTag, getComputedStyle(tag).getPropertyValue('--tag-color').trim()])),
      }));
      assert.equal(shown.placeholder, '16 / 9');
      const chip = await page.locator('#stage [data-detail-tag]').first().evaluate(node => {
        const style = getComputedStyle(node), probe = document.createElement('span');
        probe.style.backgroundColor = 'color-mix(in srgb,var(--tag-color) 10%,var(--surface))'; node.append(probe);
        const expected = getComputedStyle(probe).backgroundColor; probe.remove();
        return { fill: style.backgroundColor, expected, height: node.getBoundingClientRect().height };
      });
      assert.equal(chip.fill, chip.expected);
      assert.ok(chip.height >= 20 && chip.height <= 32);
      const muted = await tokenColor(page, '#stage [data-follow-detail]', '--muted');
      const unknown = await page.evaluate(() => {
        const tag = document.querySelector<HTMLElement>('#stage [data-follow-detail-tags] [data-follow-tag="odd"]')!;
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--tag-color)';
        tag.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      });
      assert.deepEqual({ ...shown.tags, odd: unknown }, {
        ow: '#d675d6', tracer: '#68c76f', kou: '#e36c6c', solo: '#55a7ff', animated: '#f5a24a', odd: muted,
      });
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Follow details title: the source external-link mark is concentric with the title\'s first line and hugs that line even when the title wraps', { timeout: 60_000 }, async () => {
    const opened = await openFollowFeed(browser, `/posts/${DETAIL.gallery}`, DESKTOP,
      { ready: '#stage [data-follow-origin]' });
    try {
      const page = opened.page;
      const measure = () => page.evaluate(() => {
        const name = document.querySelector('#stage [data-follow-detail-name]')!;
        const mark = document.querySelector('#stage [data-follow-origin] svg')!.getBoundingClientRect();
        return { line: name.getBoundingClientRect().top + parseFloat(getComputedStyle(name).lineHeight) / 2,
          mark: (mark.top + mark.bottom) / 2 };
      });
      const single = await measure();
      assert.ok(Math.abs(single.mark - single.line) <= 0.5, `The external link icon is not centered on the title's first line: ${JSON.stringify(single)}`);
      await page.evaluate(() => { document.querySelector('#stage [data-follow-detail-name]')!.textContent = 'A very long title'.repeat(12) });
      const wrapped = await measure();
      assert.ok(Math.abs(wrapped.mark - wrapped.line) <= 0.5, `External link icon left the first line after the title wrapped: ${JSON.stringify(wrapped)}`);
    } finally {
      await opened.close();
    }
  });

  /* Video details (the `item-detail` island). Stub data in `item-fixture.ts`: the normal entry has a 3-star rating, two cast members,
     one studio and one series, all with entity ids. The stub's source has no main feature, so the player's VIDEOJS error does not count. */
  const withoutPlayer = (problems: string[]) => problems.filter((line) => !line.includes('VIDEOJS'));

  it('Video details title and rating: the source mark leads the first title line; the star row is one amber whether or not it is rated, and hover previews up to the star under the pointer', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      const title = await page.evaluate(() => {
        const text = document.querySelector('#stage [data-detail-title]')!;
        const badge = text.querySelector('[class~="srcbig"]')!;
        const style = getComputedStyle(badge);
        const glyph = badge.querySelector('svg, img')!.getBoundingClientRect();
        const line = text.getBoundingClientRect().top + parseFloat(getComputedStyle(text).lineHeight) / 2;
        return {
          clamp: getComputedStyle(text).webkitLineClamp,
          first: text.firstElementChild === badge,
          badge: { display: style.display, width: style.width, height: style.height, gap: style.marginRight },
          centered: Math.abs((glyph.top + glyph.bottom) / 2 - line) <= 0.5,
          tools: document.querySelector('#stage [data-title-tools]')!.getBoundingClientRect().top
            >= text.getBoundingClientRect().bottom - 0.5,
        };
      });
      assert.deepEqual(title, {
        clamp: '2', first: true, badge: { display: 'inline-grid', width: '17px', height: '28px', gap: '8px' },
        centered: true, tools: true,
      }, 'The badge is an inline block, centered on the first line, clipped by the two-line fold along with the text; that row of keys sits on its own line below the title');

      const stars = page.locator('#stage [data-rate]');
      const read = () => stars.evaluateAll((nodes) => nodes.map((node) => ({
        color: getComputedStyle(node).color, filled: getComputedStyle(node.querySelector('svg')!).fill !== 'none',
      })));
      const amber = await tokenColor(page, '#stage [data-item-detail]', '--rating');
      await page.mouse.move(0, 0);
      const rest = await read();
      assert.deepEqual(rest.map((star) => star.color), Array(5).fill(amber), 'The recolor step cannot produce a gray that works for both levels in the light theme');
      assert.deepEqual(rest.map((star) => star.filled), [true, true, true, false, false]);
      await stars.nth(1).hover();
      const preview = await read();
      assert.deepEqual(preview.map((star) => star.color), Array(5).fill(amber));
      assert.deepEqual(preview.map((star) => star.filled), [true, true, false, false, false]);
      const edges = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(`#stage ${selector}`)!.getBoundingClientRect();
        return { stars: box('[data-rating-stars]').left, title: box('[data-detail-title]').left };
      });
      assert.equal(edges.stars, edges.title - 4, 'The star inside the 26px hit area starts about 4px from the right, and the row gives the space back to the left');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Work detail identity area: each group wraps side by side by content width, the name is centered under the avatar with the row box fitting the descenders; the series is a full-row-width icon link, not a label pill', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      const shown = await page.evaluate(() => {
        const stage = document.querySelector('#stage')!;
        const primary = stage.querySelector('[data-identity-primary]')!;
        const width = primary.getBoundingClientRect().width;
        const name = getComputedStyle(stage.querySelector('[data-id-group="performer"] [data-id-name]')!);
        const series = stage.querySelector('[data-series-link]')!;
        const link = getComputedStyle(series);
        return {
          primary: [getComputedStyle(primary).display, getComputedStyle(primary).flexWrap],
          narrower: [...primary.querySelectorAll('[data-id-group]')].every((group) => group.getBoundingClientRect().width < width),
          name: { ratio: parseFloat(name.lineHeight) / parseFloat(name.fontSize), overflow: name.textOverflow, align: name.textAlign },
          cursor: getComputedStyle(stage.querySelector('[data-id-group="performer"] [data-id-cell]')!).cursor,
          face: getComputedStyle(stage.querySelector('[data-id-group="performer"] [data-id-face]')!).backgroundColor,
          series: {
            display: link.display, wrap: link.overflowWrap, border: link.borderTopWidth,
            full: Math.abs(series.getBoundingClientRect().width - series.parentElement!.getBoundingClientRect().width) < 0.5,
          },
        };
      });
      assert.deepEqual(shown.primary, ['flex', 'wrap']);
      assert.equal(shown.narrower, true, 'Groups size to content width, so group works never fill a whole row');
      assert.ok(shown.name.ratio >= 1.5, `The name line-height is ${shown.name.ratio} times the font size, so Latin descenders get clipped by the ellipsis layer's overflow`);
      assert.deepEqual([shown.name.overflow, shown.name.align], ['ellipsis', 'center']);
      assert.equal(shown.cursor, 'pointer');
      assert.notEqual(shown.face, 'rgba(0, 0, 0, 0)', 'Avatar without image renders an initial disc');
      assert.deepEqual(shown.series, { display: 'flex', wrap: 'anywhere', border: '0px', full: true });
      await page.locator('#stage [data-series-link]').hover();
      const hovered = await page.locator('#stage [data-series-link]').evaluate((node) =>
        [getComputedStyle(node).color, getComputedStyle(node).textDecorationLine]);
      assert.deepEqual(hovered, [await tokenColor(page, '#stage [data-item-detail]', '--tungsten'), 'none']);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of VIEWPORTS) {
    it(`The video details avatar frames and renders within the sized circle (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, viewport);
      try {
        const page = opened.page;
        const base = await page.evaluate(() => fetch('/api/item?id=14').then((response) => response.json()));
        const payload = { ...base, performers: ['Framed performer', 'Artist without image'],
          entity_refs: { ...base.entity_refs, performer: [
            { id: 3, name: 'Framed performer', has_image: true, image_version: 'face-version',
              avatar_focus: { box: { cx: 0.58, cy: 0.49, faceW: 344, imgW: 1000, imgH: 1000 } } },
            { id: 4, name: 'Artist without image', has_image: false },
          ] } };
        await page.route((url) => url.pathname === '/api/item', (route) => route.fulfill({ json: payload }));
        await page.route('**/entity-image**', (route) => route.fulfill({ contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="#ddd"/></svg>' }));
        await page.goto(new URL('/assets/14', page.url()).href, { waitUntil: 'load' });
        const face = page.locator('#stage [data-entity-name="Featured performer"] [data-id-face]');
        await face.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {
          const image = document.querySelector<HTMLImageElement>('#stage [data-id-cell="performer"] img');
          return image?.complete && image.naturalWidth > 0;
        });
        const geometry = await face.evaluate((ring) => {
          const image = ring.querySelector('img')!, frame = ring.getBoundingClientRect(), pixels = image.getBoundingClientRect();
          return { visible: getComputedStyle(image).visibility, framed: image.hasAttribute('data-face-framed'),
            direct: image.parentElement === ring, zoomed: pixels.width > frame.width,
            covers: pixels.left <= frame.left + 0.5 && pixels.right >= frame.right - 0.5
              && pixels.top <= frame.top + 0.5 && pixels.bottom >= frame.bottom - 0.5 };
        });
        assert.deepEqual(geometry, { visible: 'visible', framed: true, direct: true, zoomed: true, covers: true });
        assert.equal(await page.locator('#stage [data-entity-name="Performer without image"] img').count(), 0);
        assert.deepEqual(withoutPlayer(opened.problems), []);
      } finally { await opened.close(); }
    });
  }

  it('Video details identity area: cells without an entity id get no pointer, and label marks fill their box', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      // First fetch the untouched response through the stub; `route.fetch()` bypasses the stub and hits the server directly.
      const base = await page.evaluate(() => fetch('/api/item?id=14').then((response) => response.json()));
      const payload = {
        ...base, performers: ['Unnamed'], performer_total: 1, performer_entities: [{ id: 0, has_image: false }], has_studio_logo: true,
        entity_refs: { ...base.entity_refs,
          performer: [{ id: 0, name: 'Unnamed', has_image: false, avatar_focus: null }],
          studio: [{ id: 50, name: 'Peach Studio', has_image: false, has_logo: true }] },
      };
      await page.route((url) => url.pathname === '/api/item', (route) => route.fulfill({ json: payload }));
      await page.goto(new URL('/assets/14', page.url()).href, { waitUntil: 'load' });
      await page.locator('#stage [data-id-cell="studio"] img').waitFor({ timeout: 15_000 });
      await settle(page);
      const shown = await page.evaluate(() => {
        const cell = (kind: string) => document.querySelector(`#stage [data-id-cell="${kind}"]`)!;
        const face = cell('studio').querySelector('[data-id-face]')!.getBoundingClientRect();
        const img = cell('studio').querySelector('img')!;
        const box = img.getBoundingClientRect();
        return {
          performer: [cell('performer').tagName, getComputedStyle(cell('performer')).cursor],
          studio: getComputedStyle(cell('studio')).cursor,
          fit: getComputedStyle(img).objectFit,
          filled: [box.left - face.left, box.top - face.top, box.width - face.width, box.height - face.height]
            .every((delta) => Math.abs(delta) < 0.5),
        };
      });
      assert.deepEqual(shown, { performer: ['SPAN', 'default'], studio: 'pointer', fit: 'cover', filled: true },
        'Logo files carry their own padding; adding an inset or switching to contain draws an extra ring around it');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('When a work detail has many tags, show 20 first; the expand button reports how many remain, and it collapses again', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      const base = await page.evaluate(() => fetch('/api/item?id=14').then((response) => response.json()));
      const tags = Array.from({ length: 30 }, (_, index) => ({ k: `Collapsed label ${String(index).padStart(2, '0')}`, cat: 'scene' }));
      await page.route((url) => url.pathname === '/api/item', (route) => route.fulfill({ json: { ...base, tags } }));
      await page.goto(new URL('/assets/14', page.url()).href, { waitUntil: 'load' });
      const more = page.locator('#stage [data-tags-more]');
      await more.waitFor({ timeout: 15_000 });
      const chips = page.locator('#stage [data-detail-tags] [data-detail-tag]');
      assert.deepEqual([await chips.count(), (await more.innerText()).trim()], [20, '10 more']);
      await more.click();
      assert.deepEqual([await chips.count(), (await more.innerText()).trim()], [30, 'Collapse']);
      await more.click();
      assert.equal(await chips.count(), 20);
      assert.equal(await page.locator('#stage [data-detail-tags] [data-tag-plus]').isVisible(), true, 'Plus stays put when collapsed');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Video details tags and feedback keys: tags share the card face, the filter half lifts its fill on hover, and every feedback pill changes color on hover', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      const face = await page.evaluate(() => {
        const tag = document.querySelector('#stage [data-detail-tag]')!;
        const probe = document.createElement('div');
        probe.style.cssText = 'border:1px solid var(--line);border-radius:var(--tag-radius);background:var(--tag-fill);color:var(--ink-2)';
        tag.parentElement!.append(probe);
        const want = getComputedStyle(probe);
        const expected = { radius: want.borderTopLeftRadius, line: want.borderTopColor, fill: want.backgroundColor, ink: want.color };
        probe.remove();
        const style = getComputedStyle(tag);
        return { expected, actual: { radius: style.borderTopLeftRadius, line: style.borderTopColor,
          fill: style.backgroundColor, ink: getComputedStyle(tag.querySelector('[data-tag]')!).color } };
      });
      assert.deepEqual(face.actual, face.expected, 'Radius, lines, fill, and text color all come from the one token set on the card\'s `.tg`');
      const filter = page.locator('#stage [data-detail-tag] [data-tag]').first();
      await filter.hover();
      assert.equal(await filter.evaluate((node) => getComputedStyle(node).backgroundColor),
        await tokenColor(page, '#stage [data-item-detail]', '--hover'));

      const buttons = ['[data-fb="like"]', '[data-fb="reason"]', '[data-stage-action="dislike"]', '[data-stage-action="seen"]', '[data-stage-action="later"]', '[data-fb="playlist"]',
        '[data-fb="quality"]', '[data-fb="dispose"]'];
      const unchanged: string[] = [];
      for (const selector of buttons) {
        const button = page.locator(`#stage [data-stage-actions] ${selector}`);
        const color = () => button.evaluate((node) => {
          node.getAnimations({ subtree: true }).forEach((animation) => animation.finish());
          return getComputedStyle(node).color;
        });
        await page.mouse.move(0, 0);
        const rest = await color();
        await button.hover();
        if (await color() === rest) unchanged.push(selector);
      }
      assert.deepEqual(unchanged, [], 'The swatch missing a color stays at --muted the whole time and looks unclickable');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Video details favorite-reason box and Continue watching: the focused input paints the BoardUI 2px inner ring; Continue watching shares the sidebar base with a hairline on top', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#stage [data-media-card]').first().waitFor({ timeout: 15_000 });
      await page.locator('#preferenceToggle').click();
      const field = page.locator('#stage [data-item-preference] textarea');
      await field.focus();
      const ring = await field.evaluate((node) => {
        node.getAnimations().forEach((animation) => animation.finish());
        return getComputedStyle(node).boxShadow;
      });
      const active = await tokenColor(page, '#stage [data-item-detail]', '--color-border-button-active');
      assert.equal(ring, `${active} 0px 0px 0px 2px inset`);

      const related = await page.evaluate(() => {
        const block = document.querySelector('#stage [data-item-related]')!;
        const style = getComputedStyle(block);
        const row = getComputedStyle(block.querySelector('[data-related-row]')!);
        return {
          fill: style.backgroundColor, side: getComputedStyle(document.querySelector('#stage [data-item-side]')!).backgroundColor,
          line: [style.borderTopWidth, style.borderTopStyle, style.borderTopColor],
          heading: getComputedStyle(block.querySelector('h3')!).fontWeight,
          row: [row.display, row.overflowX, row.scrollbarWidth],
        };
      });
      assert.equal(related.fill, related.side, 'The two blocks of the same details cell share one background source, or a color seam runs the full width');
      assert.deepEqual(related.line, ['1px', 'solid', await tokenColor(page, '#stage', '--line-soft')]);
      assert.equal(related.heading, '600');
      assert.deepEqual(related.row, ['flex', 'auto', 'none'], 'That row scrolls horizontally with no native scrollbar showing');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Video details queue and note block: the edition badge shares the title\'s line and is not italic; the off-disc note block fills the player cell', { timeout: 60_000 }, async () => {
    const editions = await openItemPage(browser, `/assets/${ITEM.edition}?editions=${ITEM.edition}`, DESKTOP,
      { ready: '#stage [data-queue-edition]' });
    try {
      const shown = await editions.page.evaluate(() => {
        const badge = document.querySelector('#stage [data-queue-edition]')!;
        const head = badge.parentElement!;
        const name = head.querySelector('b')!.getBoundingClientRect();
        const box = badge.getBoundingClientRect();
        return {
          head: [getComputedStyle(head).display, getComputedStyle(head).flexDirection],
          badge: [getComputedStyle(badge).fontStyle, getComputedStyle(badge).flexShrink, getComputedStyle(badge).maxWidth],
          sameRow: box.top < name.bottom && box.bottom > name.top,
          heading: getComputedStyle(document.querySelector('#stage [data-mix-queue-head] h2')!).fontWeight,
        };
      });
      assert.deepEqual(shown, { head: ['flex', 'row'], badge: ['normal', '1', '50%'], sameRow: true, heading: '600' },
        '`<i>` is italic by default and the badge is not emphasis; long edition text takes at most half the width, and the code is not squeezed out');
      /* The queue header button is a close-style action and uses the control corner radius, not a circular chip. */
      const head = await editions.page.evaluate(() => {
        const button = document.querySelector('#stage [data-mix-queue-head] button')!;
        return [getComputedStyle(button).borderTopLeftRadius, getComputedStyle(button).getPropertyValue('--control-radius').trim()];
      });
      assert.equal(head[0], head[1]);
      assert.deepEqual(withoutPlayer(editions.problems), []);
    } finally {
      await editions.close();
    }
    const offline = await openItemPage(browser, `/assets/${ITEM.offline}`, DESKTOP, { ready: '#stage #offlineGate' });
    try {
      const fit = await offline.page.evaluate(() => {
        const gate = document.querySelector('#stage #offlineGate')!;
        const cell = gate.parentElement!;
        const a = gate.getBoundingClientRect(), b = cell.getBoundingClientRect();
        return {
          filled: [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height].every((delta) => Math.abs(delta) < 0.5),
          radius: [getComputedStyle(gate).borderTopLeftRadius, getComputedStyle(cell).borderTopLeftRadius],
        };
      });
      assert.equal(fit.filled, true, 'The note block fills the player box with no black above or below');
      assert.equal(fit.radius[0], fit.radius[1], 'Corner radius follows the cell');
      assert.notEqual(fit.radius[0], '0px');
      assert.deepEqual(offline.problems, []);
    } finally {
      await offline.close();
    }
  });

  it('The video details tag picker uses the site-wide dropdown panel\'s open and close motion pair, switching instantly when reduced motion is on', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      const picker = page.locator('#stage [data-tag-picker]');
      /* The close animation lasts only 150ms, so reading computed styles after the click can return the collapsed state under load; instead, record the animation that actually started on the selector. */
      await page.evaluate(() => {
        const played: string[] = [];
        (window as unknown as { pickerMotion: string[] }).pickerMotion = played;
        document.addEventListener('animationstart', (event) => {
          if ((event.target as Element).matches('[data-tag-picker]')) played.push(event.animationName);
        }, true);
      });
      const played = () => page.evaluate(() => (window as unknown as { pickerMotion: string[] }).pickerMotion.splice(0));
      const cycle = async () => {
        await page.locator('#tagPlus').click();
        await page.locator('#tagPickSearch').waitFor();
        if (await page.evaluate(() => !matchMedia('(prefers-reduced-motion: reduce)').matches)) {
          await page.waitForFunction(() => (window as unknown as { pickerMotion: string[] }).pickerMotion.includes('board-menu-in'));
        }
        await page.locator('#stage [data-rating-value]').click();
        await picker.waitFor({ state: 'hidden' });
        return played();
      };
      assert.deepEqual(await cycle(), [], 'Under reduced motion it opens and closes on the spot without animation');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      assert.deepEqual(await cycle(), ['board-menu-in', 'board-menu-out']);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  /* Stage and player appearance: values measured against YouTube desktop delhi-modern's player and ytd-miniplayer.
     The stub's source cannot play, so Video.js sits in the error state with controls still attached, and computed values are read. */
  const PLAYER_BAR = '#stage .video-js .vjs-control-bar';
  const PLAYER_BLACK = 'rgba(0, 0, 0, 0.6)';
  const styleOf = (page: Page, selector: string, properties: string[], pseudo = '') => page.evaluate(
    ([target, names, element]) => {
      const node = document.querySelector(target);
      if (!node) return null;
      const style = getComputedStyle(node, element || null);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
    }, [selector, properties, pseudo] as const);
  const tokenOf = (page: Page, selector: string, token: string) => page.evaluate(([target, name]) =>
    getComputedStyle(document.querySelector(target)!).getPropertyValue(name).trim(), [selector, token] as const);

  it('Details overlay: the scrim uses the same --scrim tier without blur, enter and exit like the settings popover; the close button is a 40px black circle pressed onto the picture; media cells round only the top-left corner, and theater mode rounds the top two corners and stacks a single column', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP, { settings: { theme: 'light' } });
    try {
      const page = opened.page;
      const scrim = await tokenColor(page, 'body', '--scrim');
      assert.equal(scrim, 'rgba(0, 0, 0, 0.7)');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      assert.deepEqual(await styleOf(page, '#stage', ['background-color', 'backdrop-filter', 'animation-name'], '::backdrop'),
        { 'background-color': scrim, 'backdrop-filter': 'none', 'animation-name': 'settings-backdrop-in' });
      assert.equal((await styleOf(page, '#stage', ['animation-name']))!['animation-name'], 'board-dialog-in');
      /* In the light theme a white glow on white shows no hover, and users take YouTube as the reference: player keys are black-backed in light mode too. */
      assert.deepEqual(await styleOf(page, '#closeStage', ['width', 'height', 'border-top-left-radius', 'background-color', 'color']),
        { width: '40px', height: '40px', 'border-top-left-radius': '50%', 'background-color': PLAYER_BLACK, color: 'rgb(255, 255, 255)' });

      const corners = () => styleOf(page, '#stage [data-stage-media]',
        ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius']);
      const wide = (await corners())!;
      assert.notEqual(wide['border-top-left-radius'], '0px', 'Media cell top-left corner not rounded');
      assert.deepEqual([wide['border-top-right-radius'], wide['border-bottom-left-radius']], ['0px', '0px'],
        'The media cell hugs the sidebar on the right and Continue watching below, rounding only its top-left corner');
      /* `overflow-y:auto` makes overflow-x compute to auto, and content 1px wider shows a horizontal scrollbar; the sidebar fills its whole row and never shows a sliver of background. */
      assert.deepEqual(await styleOf(page, '#stage [data-stage-side-content]', ['overflow-x', 'overflow-y']),
        { 'overflow-x': 'hidden', 'overflow-y': 'auto' });
      assert.equal((await styleOf(page, '#stage [data-stage-side]', ['align-self']))!['align-self'], 'stretch');
      await page.locator('#stage [data-player-theater]').dispatchEvent('click');
      await page.locator('#stage[data-theater]').waitFor();
      const theater = (await corners())!;
      assert.deepEqual([theater['border-top-right-radius'], theater['border-bottom-left-radius']],
        [wide['border-top-left-radius'], '0px'], 'In theater mode the media box rounds its top two corners');
      const columns = (await styleOf(page, '#stage [data-stage-grid]', ['grid-template-columns']))!['grid-template-columns']!;
      assert.equal(columns.split(' ').length, 1, `Theater mode did not lay out as a single column: ${columns}`);
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('On phones the details popover sits 8px from the screen edge, the inner layer scrolls, and the video box sticks to its top', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, MOBILE);
    try {
      const page = opened.page;
      await page.locator(PLAYER_BAR).waitFor({ state: 'attached' });
      const box = (await page.locator('#stage').boundingBox())!;
      assert.deepEqual([box.x, box.y, box.width], [8, 8, MOBILE.width - 16]);
      assert.equal((await styleOf(page, '#stage > [data-stage-scroll]', ['overflow-y']))!['overflow-y'], 'auto');
      assert.deepEqual(await styleOf(page, '#stage [data-stage-media]', ['position', 'top']), { position: 'sticky', top: '0px' });
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('On mobile, UI buttons and tags do not select text on long press and taps do not wait for double-click detection; library data like titles and codes still selects and copies normally', { timeout: 90_000 }, async () => {
    /* Each sample records [touch-action, user-select]; null when not found. */
    const touchOf = (page: Page, selectors: string[]) => page.evaluate((list) => list.map((selector) => {
      const node = document.querySelector(selector);
      return node ? [getComputedStyle(node).touchAction, getComputedStyle(node).userSelect] : null;
    }), selectors);
    const controls = ['#closeStage', '#likeBtn', '#stage [data-stage-action]', '#stage [data-title-fold]', '#tagPlus',
      '#stage [data-detail-tag] [data-tag]'];
    const stage = await openItemPage(browser, `/assets/${ITEM.plain}`, MOBILE);
    try {
      await stage.page.locator('#stage [data-detail-tag] [data-tag]').first().waitFor({ state: 'attached' });
      assert.deepEqual(await touchOf(stage.page, controls), controls.map(() => ['manipulation', 'none']),
        `Control order: ${controls.join(', ')}`);
      const [title] = await touchOf(stage.page, ['#stage [data-detail-title]']);
      assert.notEqual(title?.[1], 'none', 'The details title is content and must not lose text selection along with the controls');
      assert.deepEqual(withoutPlayer(stage.problems), []);
    } finally {
      await stage.close();
    }
    const home = await openItemPage(browser, '/', MOBILE, { ready: '#grid [data-media-card] [data-media-title]' });
    try {
      const [card] = await touchOf(home.page, ['#grid [data-media-card] [data-media-title]']);
      assert.equal(card?.[0], 'manipulation', 'Video card titles are buttons and taps must never wait on double-tap detection');
      assert.notEqual(card?.[1], 'none', 'Video card titles carry the code, so long-press must select and copy');
      assert.deepEqual(home.problems, []);
    } finally {
      await home.close();
    }
  });

  it('Player controls: 40px black round play button, right-side pill and tooltip in the same black tier, tungsten-colored progress, page font; the stats button and load speed badge sit top-left; errors are a card laid over the stats', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator(PLAYER_BAR).waitFor({ state: 'attached' });
      assert.deepEqual(await styleOf(page, `${PLAYER_BAR} > .vjs-play-control`, ['width', 'height', 'border-top-left-radius', 'background-color']),
        { width: '40px', height: '40px', 'border-top-left-radius': '50%', 'background-color': PLAYER_BLACK });
      assert.equal((await styleOf(page, '#stage .vjs-peach-right-controls', ['background-color']))!['background-color'], PLAYER_BLACK);
      /* In the error state the control bar collapses and the box cannot be measured; read its computed distances from the player's four edges. */
      assert.deepEqual(await styleOf(page, PLAYER_BAR, ['left', 'right', 'bottom', 'height']),
        { left: '12px', right: '12px', bottom: '8px', height: '59px' });
      /* The color strip is 6px and the grab area 18px, with the extra 12px all above the strip: extending downward would cover the top edge of the button row. */
      assert.deepEqual(await styleOf(page, '#stage .vjs-progress-control', ['height', 'top']), { height: '18px', top: '-12px' });
      assert.equal((await styleOf(page, '#stage .vjs-progress-holder > media-slider-track', ['height']))!.height, '6px', 'The color bar itself never thickens');
      assert.equal((await styleOf(page, '#stage .vjs-play-progress', ['background-color']))!['background-color'],
        await tokenColor(page, '#stage', '--tungsten'));
      assert.equal((await styleOf(page, '#stage .video-js', ['font-family']))!['font-family'],
        (await styleOf(page, 'body', ['font-family']))!['font-family'], 'Player text uses the page font, not Video.js\' Arial');
      assert.deepEqual(await styleOf(page, '#stage [data-player-theater] > .vjs-peach-tooltip',
        ['background-color', 'color', 'padding-top', 'padding-left', 'backdrop-filter', 'white-space']),
      { 'background-color': PLAYER_BLACK, color: 'rgb(255, 255, 255)', 'padding-top': '5px', 'padding-left': '9px',
        'backdrop-filter': 'blur(16px)', 'white-space': 'nowrap' });
      assert.deepEqual(await styleOf(page, '#stage #playerStatsBtn', ['width', 'height', 'border-top-left-radius', 'background-color']),
        { width: '40px', height: '40px', 'border-top-left-radius': '50%', 'background-color': PLAYER_BLACK });
      assert.deepEqual(await styleOf(page, '#stage [data-player-toolbar]', ['left', 'top', 'flex-wrap']),
        { left: '11px', top: '11px', 'flex-wrap': 'wrap' });
      /* The volume capsule shares a row with the one on its right and the same frosted-glass tier: frosted on one side only, it turns more transparent than its neighbor once expanded. */
      assert.equal((await styleOf(page, `${PLAYER_BAR} > .vjs-volume-panel`, ['backdrop-filter']))!['backdrop-filter'], 'blur(16px)');
      assert.deepEqual(await styleOf(page, '#stage #playerNet', ['height', 'white-space']),
        { height: '40px', 'white-space': 'nowrap' }, 'Speed breaking into two lines would burst the 40px pill');
      /* The dashboard glyph in the sprite is stroked, not filled; without a declaration on the container it fills black by SVG default, and on a black background that means no icon.
         The demo library's videos cannot play and the badge has no rate to show, so this measures a temporary svg dropped in for the case. */
      const gauge = await page.evaluate(() => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        document.querySelector('#stage #playerNet')!.append(svg);
        const style = getComputedStyle(svg);
        const shown = { fill: style.fill, stroke: style.stroke };
        svg.remove();
        return shown;
      });
      assert.deepEqual(gauge, { fill: 'none', stroke: 'rgb(255, 255, 255)' });
      await page.locator('#stage .video-js.vjs-error').waitFor({ timeout: 10_000 });
      const error = (await styleOf(page, '#stage .vjs-error-display .vjs-modal-dialog-content', ['background-color', 'z-index']))!;
      const stats = (await styleOf(page, '#stage #playerStats', ['z-index']))!;
      assert.equal(error['background-color'], 'rgba(2, 4, 8, 0.86)');
      assert.ok(Number(error['z-index']) > Number(stats['z-index']), `The error card sits under the stats panel: ${error['z-index']} / ${stats['z-index']}`);
      const card = (await page.locator('#stage .vjs-error-display .vjs-modal-dialog-content').boundingBox())!;
      const frame = (await page.locator('#stage .video-js').boundingBox())!;
      assert.ok(Math.abs(card.x + card.width / 2 - (frame.x + frame.width / 2)) < 1
        && Math.abs(card.y + card.height / 2 - (frame.y + frame.height / 2)) < 1, 'The error card is centered in the frame, clear of the rate badge in the top left');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('The player settings panel and context menu: the same black tier, overlay radius, 48px rows; context menu hover lifts with a layer of white', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#stage #playerStatsBtn').waitFor();
      const menu = '#stage .vjs-peach-settings-menu';
      /* The closed state cannot be display:none: it has no transitionable intermediate state and the panel would vanish instantly. */
      assert.deepEqual(await styleOf(page, menu, ['display', 'opacity', 'visibility']),
        { display: 'block', opacity: '0', visibility: 'hidden' });
      await page.locator('#stage .vjs-peach-settings-toggle').dispatchEvent('click');
      const floating = await tokenOf(page, menu, '--floating-radius');
      const settings = (await styleOf(page, menu, ['background-color', 'border-top-left-radius', 'width', 'backdrop-filter']))!;
      assert.equal(settings['background-color'], PLAYER_BLACK);
      assert.equal(settings['backdrop-filter'], 'blur(16px)', 'The settings panel\'s frosted glass never took effect');
      assert.equal(settings['border-top-left-radius'], floating);
      assert.ok(parseFloat(settings.width!) <= 274, `Settings panel width ${settings.width}`);
      assert.equal((await styleOf(page, `${menu} .vjs-peach-menu-row`, ['min-height']))!['min-height'], '48px');
      await page.locator('#stage .vjs-peach-settings-toggle').dispatchEvent('click');

      await page.locator('#stage .video-js').click({ button: 'right' });
      await page.locator('#playerMenu:popover-open').waitFor();
      assert.deepEqual(await styleOf(page, '#playerMenu', ['padding-top', 'background-color', 'border-top-left-radius', 'backdrop-filter']),
        { 'padding-top': '8px', 'background-color': PLAYER_BLACK, 'border-top-left-radius': await tokenOf(page, '#playerMenu', '--floating-radius'),
          'backdrop-filter': 'blur(16px)' });
      const row = (await styleOf(page, '#playerMenu [data-player-menu]', ['min-height', 'grid-template-columns']))!;
      assert.equal(row['min-height'], '48px');
      const tracks = row['grid-template-columns']!.split(' ');
      assert.deepEqual([tracks[0], tracks.at(-1)], ['56px', '32px'], `Context menu row columns: ${row['grid-template-columns']}`);
      await page.locator('#playerMenu [data-player-menu]').first().hover();
      assert.equal((await styleOf(page, '#playerMenu [data-player-menu]', ['background-color']))!['background-color'],
        'rgba(255, 255, 255, 0.1)');
      await page.keyboard.press('Escape');
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  it('Stats chart 20px tall, the buffering bar changes color by health; the mini player follows ytd-miniplayer: pinned 16px from the bottom-right corner, 400px wide, layered under popovers, rewind and fast-forward keys 36px', { timeout: 60_000 }, async () => {
    const opened = await openItemPage(browser, `/assets/${ITEM.plain}`, DESKTOP);
    try {
      const page = opened.page;
      await page.locator('#stage #playerStatsBtn').click();
      const plot = '#stage [data-player-stats-plot="buffer"]';
      assert.equal((await styleOf(page, plot, ['height']))!.height, '20px');
      const colors = await page.evaluate((selector) => ['low', 'mid'].map((state) => {
        const bar = document.createElement('i');
        bar.dataset.bar = state;
        document.querySelector(selector)!.append(bar);
        const color = getComputedStyle(bar).backgroundColor;
        bar.remove();
        return color;
      }), plot);
      assert.deepEqual(colors, ['rgb(225, 105, 98)', 'rgb(239, 181, 95)']);

      await page.locator('#closeStage').focus();
      await page.keyboard.press('i');
      await page.locator('#miniplayer:not([hidden]) .video-js').waitFor({ timeout: 10_000 });
      assert.deepEqual(await styleOf(page, '#miniplayer', ['position', 'z-index']), { position: 'fixed', 'z-index': '900' });
      const box = (await page.locator('#miniplayer').boundingBox())!;
      assert.deepEqual([box.width, box.x + box.width, box.y + box.height], [400, DESKTOP.width - 16, DESKTOP.height - 16]);
      assert.deepEqual(await styleOf(page, '#miniplayerBack', ['width', 'height']), { width: '36px', height: '36px' });
      assert.deepEqual(withoutPlayer(opened.problems), []);
    } finally {
      await opened.close();
    }
  });

  /** The bounding box of a set of elements, to one decimal place. */
  const rectsOf = (page: Page, selectors: Record<string, string>) => page.evaluate((entries) => Object.fromEntries(
    Object.entries(entries).map(([name, selector]) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      const round = (value: number) => Math.round(value * 10) / 10;
      return [name, { left: round(box.left), top: round(box.top), right: round(box.right), bottom: round(box.bottom), width: round(box.width), height: round(box.height) }];
    })), selectors);
  const IMMERSE = {
    root: '[data-immerse]', stage: '[data-immerse-stage]', actions: '[data-immerse-actions]', ui: '[data-immerse-ui]',
    bar: '[data-immerse-bar]', close: '[data-immerse-close]',
  };

  it('Immersive mode on desktop follows Shorts in three ways: 9:16 stage centered, action column 12px off the stage\'s right edge, author title bottom-left; landscape videos switch to 16:9 with the action column inside the frame; still a dark layer under the light theme', { timeout: 90_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    try {
      const { page } = opened;
      const { wide, tall } = await pickClips(page);
      await pinQueue(page, [tall, wide]);
      await muteVideos(page);
      await openImmerse(page, tall.id);
      const portrait = await rectsOf(page, IMMERSE);
      assert.deepEqual(portrait.stage, { left: 415, top: 0, right: 865, bottom: 800, width: 450, height: 800 });
      assert.deepEqual([portrait.actions.left, portrait.actions.width, portrait.actions.bottom], [877, 72, 792]);
      assert.deepEqual([portrait.ui.left, portrait.ui.bottom], [20, 780]);
      assert.deepEqual(portrait.bar, { left: 0, top: 780, right: 1280, bottom: 800, width: 1280, height: 20 });
      assert.deepEqual([portrait.close.top, portrait.close.right, portrait.close.width], [15, 1265, 42]);
      const faces = await page.evaluate(() => {
        const read = (selector: string, names: string[]) => {
          const style = getComputedStyle(document.querySelector(selector)!);
          return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
        };
        return {
          root: read('[data-immerse]', ['background-color']),
          track: read('[data-immerse-track]', ['border-radius', 'background-color']),
          floating: (() => {
            const probe = document.createElement('div');
            probe.style.borderRadius = 'var(--floating-radius)';
            document.querySelector('[data-immerse]')!.append(probe);
            const value = getComputedStyle(probe).borderRadius;
            probe.remove();
            return value;
          })(),
          circle: read('[data-immerse-circle]', ['width', 'height', 'border-radius', 'background-color', 'color']),
          glyph: read('[data-immerse-circle] svg', ['width', 'height', 'fill', 'stroke']),
          author: read('[data-immerse-author]>a', ['color', 'font-weight']),
          title: read('[data-immerse-title]', ['font-size', 'font-weight', 'text-overflow', 'white-space', 'pointer-events']),
          caption: read('[data-immerse-ui]', ['pointer-events']),
          progress: read('[data-immerse-bar] i', ['height']),
        };
      });
      const { floating, ...face } = faces;
      assert.notEqual(floating, '0px');
      assert.deepEqual(face, {
        root: { 'background-color': 'rgb(15, 15, 15)' },
        track: { 'border-radius': floating, 'background-color': 'rgb(0, 0, 0)' },
        circle: { width: '48px', height: '48px', 'border-radius': '50%', 'background-color': 'rgba(255, 255, 255, 0.1)', color: 'rgb(241, 241, 241)' },
        glyph: { width: '24px', height: '24px', fill: 'none', stroke: 'rgb(241, 241, 241)' },
        author: { color: 'rgb(241, 241, 241)', 'font-weight': '600' },
        title: { 'font-size': '20px', 'font-weight': '600', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', 'pointer-events': 'auto' },
        caption: { 'pointer-events': 'none' },
        progress: { height: '4px' },
      });

      // Progress: a 4px line sits at the bottom of the 20px hit area in tungsten blue, and thickens only when the pointer nears.
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-immerse-bar] i')!).backgroundColor),
        await tokenColor(page, '[data-immerse]', '--tungsten'));
      await page.hover('[data-immerse-bar]');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-immerse-bar] i')!).height === '9px');

      // Action buttons give feedback through background color and keep their size on hover and press; selection uses a light background with dark text.
      await page.route('**/api/feedback', (route) => route.fulfill({ json: { feedback: 'seen', o_count: 0 } }));
      const seen = '[data-immerse-actions] button[aria-label="Mark as watched"]';
      const resting = await page.locator(seen).boundingBox();
      const background = await page.locator(seen).evaluate(node => getComputedStyle(node).backgroundColor);
      await page.hover(seen);
      await page.waitForFunction(([selector, color]) => getComputedStyle(document.querySelector(selector!)!).backgroundColor !== color, [seen, background]);
      assert.deepEqual(await page.locator(seen).boundingBox(), resting);
      assert.equal(await page.locator(seen).evaluate(node => getComputedStyle(node).scale), 'none');
      await page.mouse.down();
      assert.deepEqual(await page.locator(seen).boundingBox(), resting);
      assert.equal(await page.locator(seen).evaluate(node => getComputedStyle(node).scale), 'none');
      await page.mouse.up();
      await page.locator(`${seen}[aria-pressed="true"]`).waitFor({ timeout: 5_000 });
      await page.mouse.move(0, 0);
      assert.deepEqual(await page.evaluate((selector) => {
        const style = getComputedStyle(document.querySelector(selector)!);
        return [style.backgroundColor, style.color];
      }, seen), ['rgb(241, 241, 241)', 'rgb(15, 15, 15)']);

      await page.keyboard.press('ArrowDown');
      await page.waitForFunction((id) => location.search === `?id=${id}`, wide.id);
      await settledClip(page);
      const landscape = await rectsOf(page, IMMERSE);
      assert.deepEqual(landscape.stage, { left: 230.4, top: 169.6, right: 1049.6, bottom: 630.4, width: 819.2, height: 460.8 });
      assert.deepEqual([landscape.actions.right, landscape.actions.bottom], [1037.6, 612.4]);
      assert.equal(landscape.ui.width, 404.8);

      await page.evaluate(() => { document.documentElement.dataset.theme = 'light' });
      assert.deepEqual(await page.evaluate(() => [
        getComputedStyle(document.querySelector('[data-immerse]')!).backgroundColor,
        getComputedStyle(document.querySelector('[data-immerse-author]>a')!).color,
      ]), ['rgb(15, 15, 15)', 'rgb(241, 241, 241)']);
      assert.deepEqual(opened.problems.filter((line) => !line.includes('VIDEOJS')), []);
    } finally {
      await opened.close();
    }
  });

  it('Immersive mode on mobile fills the viewport: the stage loses its rounded corners, the action column hugs the right and the author title the bottom left, and the duration and index in the author row collapse', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', MOBILE);
    try {
      const { page } = opened;
      const { wide, tall } = await pickClips(page);
      await pinQueue(page, [tall, wide]);
      await muteVideos(page);
      await openImmerse(page, tall.id);
      const rects = await rectsOf(page, { ...IMMERSE, avatar: '[data-immerse-avatar]' });
      assert.deepEqual(rects.stage, { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 });
      assert.deepEqual([rects.actions.right, rects.actions.bottom, rects.actions.width], [382, 752, 56]);
      assert.deepEqual([rects.ui.left, rects.ui.right, rects.ui.bottom], [14, 308, 816]);
      assert.deepEqual([rects.avatar.width, rects.avatar.height], [36, 36]);
      assert.deepEqual([rects.close.top, rects.close.right], [10, 380]);
      assert.deepEqual(await page.evaluate(() => ({
        radius: getComputedStyle(document.querySelector('[data-immerse-track]')!).borderRadius,
        meta: getComputedStyle(document.querySelector('[data-immerse-author]>span')!).display,
        title: getComputedStyle(document.querySelector('[data-immerse-title]')!).fontSize,
      })), { radius: '0px', meta: 'none', title: '14px' });
      assert.deepEqual(opened.problems.filter((line) => !line.includes('VIDEOJS')), []);
    } finally {
      await opened.close();
    }
  });

  /* ── Sidebar island (`frontend/src/react/sidebar/sidebar.css`) ── */

  /** Open the home page and wait for the sidebar groups to paint. Aggregates are genuinely fetched against the demo library; only the duration group is guaranteed to exist (the demo library's shorts may not add up to a total duration). */
  async function openSidebar(viewport: Viewport): Promise<Visit> {
    const opened = await visit(browser, '/', viewport);
    await opened.page.route((url) => url.pathname === '/api/facets', async (route) => {
      const real = await (await route.fetch()).json() as { stats?: Record<string, unknown> };
      await route.fulfill({ json: { ...real, stats: { ...real.stats, duration: real.stats?.duration || 540 } } });
    });
    await opened.page.reload({ waitUntil: 'load' });
    await opened.page.locator('#drawer [data-sidebar-group="Duration"]').waitFor({ state: 'attached', timeout: 15_000 });
    await settle(opened.page);
    return opened;
  }

  it('The current sidebar item has no fill of its own and is marked by the glass panel attached to the drawer; on hover the glass follows the pointer, and leaving the column returns it to the current item', { timeout: 60_000 }, async () => {
    const opened = await openSidebar(DESKTOP);
    try {
      const { page } = opened;
      const read = (key: string) => page.evaluate((target) => {
        const glide = document.querySelector<HTMLElement>('[data-sidebar-glide]')!;
        const button = document.querySelector<HTMLElement>(`#drawer [data-sidebar-nav] [data-nav="${target}"]`)!;
        const box = (node: Element) => {
          const rect = node.getBoundingClientRect();
          return [rect.left, rect.top, rect.width, rect.height].map(Math.round);
        };
        const style = getComputedStyle(button);
        return {
          glide: box(glide), button: box(button), parent: glide.parentElement?.id,
          layer: getComputedStyle(glide).zIndex, radius: getComputedStyle(glide).borderRadius,
          fill: [style.backgroundColor, style.backgroundImage, style.boxShadow], color: style.color,
        };
      }, key);
      const current = await read('');
      assert.equal(current.parent, 'drawer', 'The glass is not mounted on the drawer, so vertical scrolling clips it with the scroll layer');
      assert.deepEqual([current.layer, current.radius], ['-1', '10px'], 'The glass must sit beneath the text with the button\'s 10px corner radius');
      assert.deepEqual(current.glide, current.button, 'The glass never sits beneath the current item');
      assert.deepEqual(current.fill, ['rgba(0, 0, 0, 0)', 'none', 'none'], 'The current item paints its own background, so at rest two backgrounds stack');
      assert.equal(current.color, await tokenColor(page, '#drawer', '--glass-text'), 'The current item\'s text color is not the on-glass text color');
      const idle = await read('studios');
      assert.equal(idle.color, await tokenColor(page, '#drawer', '--color-text-secondary'), 'Unselected items\' text color is not the secondary text color');

      await page.locator('#drawer [data-sidebar-nav] [data-nav="studios"]').hover();
      const hovered = await read('studios');
      assert.deepEqual(hovered.glide, hovered.button, 'On hover the glass did not follow the pointed item');
      assert.deepEqual(hovered.fill, ['rgba(0, 0, 0, 0)', 'none', 'none'], 'The hovered item paints its own background');
      await page.mouse.move(900, 420);
      const back = await read('');
      assert.deepEqual(back.glide, back.button, 'After the pointer leaves the column the glass did not return to the current item');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Sidebar title row: 32px round badge switcher, 20px-tall collapse button, 12px from the first nav item; group arrows rotate 90° when expanded; collapsed leaves only a 60px-wide icon column', { timeout: 60_000 }, async () => {
    const opened = await openSidebar(DESKTOP);
    try {
      const { page } = opened;
      const head = await page.evaluate(() => {
        const drawer = document.querySelector('#drawer')!;
        const rect = (selector: string) => drawer.querySelector(selector)!.getBoundingClientRect();
        const mark = drawer.querySelector('#brandHome .mark')!;
        const rotation = (group: Element) => {
          const matrix = new DOMMatrix(getComputedStyle(group.querySelector(':scope > [data-sidebar-toggle] svg')!).transform);
          return Math.round(Math.atan2(matrix.b, matrix.a) * 180 / Math.PI);
        };
        const groups = [...drawer.querySelectorAll<HTMLDetailsElement>('[data-sidebar-group]')];
        return {
          gap: Math.round(rect('[data-sidebar-nav]').top - rect('[data-sidebar-head]').bottom),
          mark: [Math.round(rect('#brandHome .mark').width), Math.round(rect('#brandHome .mark').height), getComputedStyle(mark).borderRadius],
          toggle: Math.round(rect('#filterBtn').height),
          open: groups.filter((group) => group.open).map(rotation),
          closed: groups.filter((group) => !group.open).map(rotation),
        };
      });
      assert.equal(head.gap, 12, 'The switcher sits too close to the nav\'s first item, so the two backgrounds read as stacked');
      assert.deepEqual(head.mark, [32, 32, '50%'], 'The switcher\'s mark is not a 32px circle');
      assert.equal(head.toggle, 20, 'The collapse button is not 20px tall');
      assert.ok(head.open.length && head.closed.length, `The home sections have no open and close pair to compare: ${JSON.stringify(head)}`);
      assert.ok(head.open.every((angle) => angle === 90), `The expanded group arrow did not rotate to 90°: ${head.open}`);
      assert.ok(head.closed.every((angle) => angle === 0), `The collapsed group arrow did not return to 0°: ${head.closed}`);

      await page.locator('#filterBtn').click();
      await page.waitForFunction(() => Math.round(document.querySelector('#drawer')!.getBoundingClientRect().width) === 60,
        undefined, { timeout: 5_000 });
      const rail = await page.evaluate(() => {
        const drawer = document.querySelector('#drawer')!;
        const toggle = drawer.querySelector('#filterBtn')!.getBoundingClientRect();
        return {
          toggle: [Math.round(toggle.width), Math.round(toggle.height)],
          groups: [...new Set([...drawer.querySelectorAll('[data-sidebar-group]')].map((group) => getComputedStyle(group).display))],
          labels: [...new Set([...drawer.querySelectorAll('[data-sidebar-nav] button span')].map((span) => getComputedStyle(span).maxWidth))],
        };
      });
      assert.deepEqual(rail, { toggle: [36, 20], groups: ['none'], labels: ['0px'] }, 'The collapsed narrow rail is not one column of icons');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Duration slider: the selected segment is an accent gradient, both readouts stay visible and never leave the track even pushed to the ends, and the handle just moved sits on top', { timeout: 60_000 }, async () => {
    const opened = await openSidebar(DESKTOP);
    try {
      const { page } = opened;
      await page.locator('#drawer [data-sidebar-group="Duration"] > [data-sidebar-toggle]').click();
      await page.locator('#drawer [data-sidebar-group="Duration"] [data-sidebar-collapse]:not([inert])').waitFor({ timeout: 5_000 });
      const read = () => page.evaluate(() => {
        const range = document.querySelector('#durationRange')!;
        const bounds = range.getBoundingClientRect();
        return {
          fill: getComputedStyle(range.querySelector('[data-sidebar-range-fill]')!).backgroundImage,
          tips: [...range.querySelectorAll<HTMLElement>('[data-sidebar-range-tip]')].map((tip) => {
            const box = tip.getBoundingClientRect();
            return {
              end: tip.dataset.rangeEnd, text: tip.textContent, layer: getComputedStyle(tip).zIndex,
              visible: getComputedStyle(tip).visibility === 'visible' && box.width > 0,
              inside: box.left >= bounds.left - 1 && box.right <= bounds.right + 1,
            };
          }),
        };
      });
      const resting = await read();
      const accent = await tokenColor(page, '#drawer', '--color-accent-400');
      assert.ok(resting.fill.startsWith('linear-gradient(90deg') && resting.fill.includes(accent),
        `The selected segment is not a horizontal gradient starting at accent-400: ${resting.fill}`);
      assert.deepEqual(resting.tips, [
        { end: 'min', text: '0 min', layer: '1', visible: true, inside: true },
        { end: 'max', text: 'Any', layer: '2', visible: true, inside: true },
      ], 'Both end labels stay visible and hug the track ends without crossing them; when untouched the right one sits on top');

      await page.locator('#durMin').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[data-sidebar-range-tip][data-range-end="min"]')?.hasAttribute('data-range-active'),
        undefined, { timeout: 5_000 });
      const moved = await read();
      assert.deepEqual(moved.tips.map((tip) => [tip.end, tip.layer, tip.inside]), [['min', '2', true], ['max', '1', true]],
        'The just-touched end did not stack on top');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Phone sidebar: while the drawer is open the scrim shell is invisible with its dark layer on ::before, stacked below the drawer; on collapse the scrim leaves the render tree', { timeout: 60_000 }, async () => {
    const opened = await openSidebar(MOBILE);
    try {
      const { page } = opened;
      const scrim = () => page.evaluate(() => {
        const node = document.querySelector('#scrim')!, drawer = document.querySelector('#drawer')!;
        const before = getComputedStyle(node, '::before');
        return {
          display: getComputedStyle(node).display, visibility: getComputedStyle(node).visibility,
          dim: [before.visibility, before.backgroundColor],
          layers: [Number(getComputedStyle(node).zIndex), Number(getComputedStyle(drawer).zIndex)],
          fill: getComputedStyle(drawer).getPropertyValue('--glass-fill'),
        };
      });
      assert.equal((await scrim()).display, 'none', 'While the drawer is closed the scrim stays in the render tree; Safari on iOS uses it to color the status bar');
      await page.locator('#filterBtn').tap();
      await page.waitForFunction(() => document.querySelector('#drawer')?.classList.contains('open'));
      const shown = await scrim();
      assert.deepEqual([shown.display, shown.visibility], ['block', 'hidden'], 'The scrim shell is not invisible; iOS Safari would sample it for the status bar color');
      assert.equal(shown.dim[0], 'visible', 'The overlay darkening is not painted on ::before');
      assert.notEqual(shown.dim[1], 'rgba(0, 0, 0, 0)', 'The scrim\'s ::before is transparent and never darkens the page behind it');
      assert.ok(shown.layers[0] < shown.layers[1], `With the scrim above the drawer, the drawer cannot be clicked: ${shown.layers}`);
      assert.ok(shown.fill.replace(/\s/g, '').includes('86%'), `The narrow-screen drawer fill did not thicken to 86%: ${shown.fill}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });
});
