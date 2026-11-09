/* Design decisions: performer and label profile pages. Reads `getComputedStyle` to assert the appearance the user set; shared stubs and browser lifecycle live in `design-fixture.ts`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { expectBody, layout, requiredEnv, settle, visit, VIEWPORTS } from './harness.ts';
import {
  DESKTOP, MOBILE, tokenColor, PIXEL, TASTE_FACE, WIDE, openCatalog, openCatalogFixture, openFollowManage,
  openPerformer, openPhotoWall, photoWallFaces, PROFILED, openProfiledPerformer, popmenuShadow, SUGGEST,
  stubSuggest, installDesignBrowser,
} from './design-fixture.ts';

describe('Design decisions: person and label profile pages', () => {
  let browser: Browser;
  installDesignBrowser((next) => { browser = next; });

  it('Lazy avatars keep visibility before being cropped into the frame; after loading the portrait shows', { timeout: 60_000 }, async () => {
    const opened = await openProfiledPerformer(browser, DESKTOP);
    try {
      const page = opened.page;
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/avatar-loading-probe', async route => {
        await pending;
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="green"/></svg>' });
      });
      const state = await page.evaluate(() => {
        const ring = document.createElement('span');
        ring.style.cssText = 'position:fixed;top:20px;left:20px;width:80px;height:80px';
        ring.innerHTML = '<img id="avatar-loading-probe" loading="lazy" width="128" height="128" data-facebox="0.5 0.5 60 128 128" src="/avatar-loading-probe">';
        document.body.append(ring);
        const image = ring.querySelector('img')!;
        return { visibility: getComputedStyle(image).visibility, opacity: getComputedStyle(image).opacity };
      });
      release();
      assert.deepEqual(state, { visibility: 'visible', opacity: '0' });
      await page.waitForFunction(() => {
        const image = document.querySelector<HTMLImageElement>('#avatar-loading-probe')!;
        return image.naturalWidth > 0 && getComputedStyle(image).opacity === '1';
      });
    } finally {
      await opened.close();
    }
  });

  for (const [viewport, split] of [[WIDE, true], [MOBILE, false]] as const) {
    it(`The search dropdown paginates by kind; wide screens split two columns with names carrying avatars and recent works and videos as cover tiles, narrow screens one column (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await visit(browser, '/', viewport);
      try {
        const page = opened.page;
        const kinds = await stubSuggest(page);
        await expectBody(page, '/', [page.locator('#grid [data-media-card][data-id]').first()]);
        await settle(page);
        if (viewport.mobile) await page.locator('#searchBtn').click();
        await page.locator('#q').fill(SUGGEST.q);
        const menu = page.locator('#searchMenu');
        await menu.locator('[data-search-option="person"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        const shown = await page.evaluate(() => {
          const menuBox = document.querySelector('#searchMenu')!.getBoundingClientRect();
          const results = document.querySelector<HTMLElement>('#searchMenu [data-search-results]')!;
          const columns = [...results.querySelectorAll(':scope > [data-search-col]')];
          const person = document.querySelector('#searchMenu [data-search-option="person"]')!;
          /* The matched alias and video count are this row's footnote: one font size down, one color step dimmer, with the count right-aligned. */
          const footnote = (selector: string) => {
            const note = document.querySelector<HTMLElement>(`#searchMenu ${selector}`)!;
            const row = note.closest('[data-search-option]')!;
            const name = note.previousElementSibling!;
            const [noteStyle, nameStyle] = [getComputedStyle(note), getComputedStyle(name)];
            return {
              smaller: parseFloat(noteStyle.fontSize) < parseFloat(nameStyle.fontSize),
              quieter: noteStyle.color !== nameStyle.color,
              trailing: Math.round(row.getBoundingClientRect().right - note.getBoundingClientRect().right),
            };
          };
          return {
            matched: footnote('[data-search-matched]'),
            count: footnote('[data-search-n]'),
            radius: getComputedStyle(person).borderRadius === getComputedStyle(document.documentElement).getPropertyValue('--control-radius').trim(),
            tabs: [...document.querySelectorAll('#searchMenu [role="tab"]')].map((tab) => tab.textContent!.trim()),
            tracks: getComputedStyle(results).gridTemplateColumns.split(' ').filter((track) => track !== 'none').length,
            divider: getComputedStyle(results, '::before').content,
            dividerHeight: parseFloat(getComputedStyle(results, '::before').height),
            resultsHeight: results.getBoundingClientRect().height,
            right: columns.at(-1)!.querySelector('[data-search-group]')?.getAttribute('data-kind'),
            videoGrid: getComputedStyle(document.querySelector('#searchMenu [data-search-group][data-kind="asset"] [data-search-items]')!).display,
            peeks: getComputedStyle(person.querySelector('[data-search-peeks]')!).display,
            peekCount: person.querySelectorAll('[data-open-work]').length,
            sub: person.querySelector('[data-search-sub]')!.textContent,
            face: person.querySelector('[data-search-face] img')?.getAttribute('src'),
            inView: menuBox.left >= 0 && menuBox.right <= innerWidth,
            edges: [Math.round(menuBox.left), Math.round(innerWidth - menuBox.right)],
          };
        });
        assert.deepEqual(shown.tabs, ['All', 'Performer 2', 'Label 1', 'video12'], 'The tabs are not "All" plus per-kind hit counts');
        assert.equal(shown.tracks, split ? 2 : 0, split ? 'Wide-screen dropdown does not split into two columns' : 'Dropdown should not split columns on narrow screens');
        assert.equal(shown.divider, split ? '""' : 'none', split ? 'No divider sits between the two desktop columns' : 'The narrow-screen single column should have no divider');
        if (split) {
          assert.ok(Math.abs(shown.dividerHeight - shown.resultsHeight) <= 1,
            `The divider is ${shown.dividerHeight}px tall and the two columns ${shown.resultsHeight}px`);
        }
        assert.equal(shown.right, 'asset', 'Video is not in the last column');
        assert.equal(shown.videoGrid, split ? 'grid' : 'block', split ? 'Wide-screen videos never lay out as cover tiles' : 'One video per row on narrow screens');
        assert.equal(shown.peeks, split ? 'flex' : 'none', split ? 'Wide-screen name rows never place recent works' : 'Narrow-screen name rows never place recent works');
        assert.equal(shown.peekCount, 4);
        assert.equal(shown.sub, '128 videos · Capsule Agency');
        assert.equal(shown.face, '/entity-image?kind=performer&id=90301&thumb=1');
        for (const [name, note] of [['Aliases', shown.matched], ['Video count', shown.count]] as const) {
          assert.ok(note.smaller && note.quieter, `${name} did not fall back to a footnote: ${JSON.stringify(note)}`);
        }
        assert.equal(shown.count.trailing, 10, 'The video count does not hug the row\'s right padding');
        assert.ok(shown.radius, 'The completion row\'s radius is not --control-radius');
        assert.ok(shown.inView, 'Dropdown overflows the viewport');
        // On narrow screens the dropdown overlaps the back button's column; like the top bar's edges it leaves 8 on each side, and does not indent under the search box.
        if (viewport.mobile) assert.deepEqual(shown.edges, [8, 8], 'On narrow screens the dropdown\'s side padding is not 8');
        const page_ = await layout(page);
        assert.ok(page_.scrollWidth <= page_.viewportWidth, `Dropdown pushed the page into horizontal scroll: ${page_.offenders.join(', ')}`);

        await menu.getByRole('tab', { name: /^女优/ }).click();
        await page.waitForFunction(() => document.querySelectorAll('#searchMenu [data-search-group][data-kind]').length === 1);
        assert.equal(await menu.isVisible(), true, 'Clicking a tab collapsed the dropdown');
        assert.ok(kinds.includes('performer'), 'Picking a category never fetched it to fill');
        assert.equal(await menu.getByRole('tab', { name: /^女优/ }).getAttribute('aria-selected'), 'true');

        // Clicking the name row opens the profile page, not another search by that name.
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForURL('**/performers/90301');
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  it('Videos-only cover cells split evenly by column to fill the row, each with a width cap', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', WIDE);
    try {
      const page = opened.page;
      await stubSuggest(page);
      await expectBody(page, '/', [page.locator('article[data-media-card][data-id]').first()]);
      await settle(page);
      await page.locator('#q').fill(SUGGEST.q);
      const menu = page.locator('#searchMenu');
      await menu.locator('[data-search-option="person"]').first().waitFor({ state: 'visible', timeout: 5_000 });
      await menu.getByRole('tab', { name: /^视频/ }).click();
      await page.waitForFunction(() => document.querySelectorAll('#searchMenu [data-search-group][data-kind]').length === 1);
      const grid = await page.evaluate(() => {
        const items = document.querySelector('#searchMenu [data-search-group][data-kind="asset"] [data-search-items]')!;
        const box = items.getBoundingClientRect();
        const cards = [...items.querySelectorAll('[data-search-option="work"]')].map((card) => card.getBoundingClientRect());
        return {
          rows: new Set(cards.map((card) => Math.round(card.top))).size,
          widths: cards.map((card) => Math.round(card.width)),
          slack: Math.round(box.right - cards.at(-1)!.right),
        };
      });
      assert.equal(grid.rows, 1, 'The five videos did not share one line');
      assert.ok(grid.slack <= 1, `${grid.slack}px sit empty to the cover cell's right`);
      assert.ok(grid.widths.every((width) => width >= 96 && width <= 242), `Cover width out of the 96-242 range: ${grid.widths.join(', ')}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Profile photo wall: at 1280 wide, small images 4 columns and large 2, phones 2; the fixed layout is a grid and masonry fills by column; each cell is an equal-height empty base', { timeout: 90_000 }, async () => {
    const opened = await openPhotoWall(browser);
    try {
      const { page } = opened;
      // Masonry by default, small images.
      assert.deepEqual(await photoWallFaces(page), { display: 'block', columns: 4, gap: '10px', square: true });
      const cell = await page.evaluate(() => {
        const node = document.querySelector<HTMLElement>('[data-local-wall] [data-photo-cell]')!;
        const style = getComputedStyle(node);
        const head = document.querySelector('[data-photo-group]')!;
        return {
          radius: style.borderRadius, cursor: style.cursor, sunk: style.backgroundColor,
          token: getComputedStyle(document.documentElement).getPropertyValue('--surface-radius').trim(),
          alt: getComputedStyle(node.querySelector('img')!).color,
          headTop: getComputedStyle(head).marginTop,
          rows: [head, head.querySelector('b')!].map((node) => getComputedStyle(node).lineHeight),
          code: getComputedStyle(head.querySelector('b')!).fontFamily,
          meta: getComputedStyle(head.querySelector('[data-photo-group-meta]')!).marginLeft !== '0px',
        };
      });
      assert.equal(cell.radius, cell.token, 'Photo cells use --surface-radius');
      assert.equal(cell.cursor, 'zoom-in');
      assert.equal(cell.alt, 'rgba(0, 0, 0, 0)', 'While an image loads the alt file name never paints');
      assert.notEqual(cell.sunk, 'rgba(0, 0, 0, 0)', 'Cell has a built-in sunken background');
      assert.equal(cell.headTop, '28px', 'Spacing above each section');
      assert.deepEqual(cell.rows, ['20px', '20px'], 'Section header rows are 20px; the code does not stretch the row with its own font size');
      assert.match(cell.code, /Cascadia Mono/, 'Section header code is monospaced');
      assert.ok(cell.meta, 'Source and count sit right');
      assert.equal(await page.locator('#index [data-entity-more]').evaluate((node) => {
        const style = getComputedStyle(node);
        return `${style.height} ${style.borderRadius} ${style.fontSize} ${style.fontWeight}`;
      }), '36px 10px 14px 500', 'Load more is a secondary button, 36px tall with a 10px radius');
      await page.locator('[data-entity-layout][aria-label="Image layout"] label:has(input[value="fixed"])').click();
      await page.waitForFunction(() => document.querySelector('[data-local-wall]')?.getAttribute('data-layout') === 'fixed');
      assert.deepEqual(await photoWallFaces(page), { display: 'grid', columns: 4, gap: '10px', square: true });
      // The size button in the top bar switches the photo size tier in photo mode without sending a single request.
      await page.locator('#density').click();
      await page.waitForFunction(() => document.querySelector('[data-local-wall]')?.getAttribute('data-size') === 'big');
      assert.deepEqual(await photoWallFaces(page), { display: 'grid', columns: 2, gap: '10px', square: true });
      assert.equal(await page.locator('#density').getAttribute('title'), 'Current: large images');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
    const phone = await openPhotoWall(browser, MOBILE);
    try {
      const { page } = phone;
      assert.deepEqual(await photoWallFaces(page), { display: 'block', columns: 2, gap: '10px', square: true });
      await page.locator('[data-entity-layout][aria-label="Image layout"] label:has(input[value="fixed"])').click();
      await page.waitForFunction(() => document.querySelector('[data-local-wall]')?.getAttribute('data-layout') === 'fixed');
      assert.deepEqual(await photoWallFaces(page), { display: 'grid', columns: 2, gap: '8px', square: true });
      assert.deepEqual(phone.problems, []);
    } finally {
      await phone.close();
    }
  });

  it('An empty search splits avatar and cover columns; search history sits at the bottom of the left column, and the divider spans both columns', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', WIDE);
    try {
      const page = opened.page;
      const history = Array.from({ length: 10 }, (_, at) => `Search history ${at + 1}`);
      await page.route(/\/api\/search-history\?/, (route) => route.fulfill({ json: { items: history } }));
      await page.reload({ waitUntil: 'load' });
      await expectBody(page, '/', [page.locator('article[data-media-card][data-id]').first()]);
      await settle(page);
      await page.locator('#q').click();
      await page.locator('#searchMenu [data-search-recommendations] [data-search-results][data-split]').waitFor({ state: 'visible', timeout: 5_000 });
      // Recommendations are pre-fetched and present on open; search history arrives later and slots in at the bottom of the left column.
      await page.waitForFunction(() => [...document.querySelectorAll('#searchMenu [data-search-col]:first-child > [data-search-group] > h3')]
        .some((title) => title.textContent === 'Search history'), undefined, { timeout: 5_000 });
      const split = await page.evaluate(() => {
        const results = document.querySelector('#searchMenu [data-search-results]')!;
        const [left, right] = [...results.querySelectorAll(':scope > [data-search-col]')].map((col) => col.getBoundingClientRect());
        const box = results.getBoundingClientRect();
        const line = getComputedStyle(results, '::before');
        // Search history arrives after recommendations and sits at the bottom of the left column; when it arrives it does not push what is above it down.
        const groups = [...results.querySelectorAll(':scope > [data-search-col]:first-child > [data-search-group]')];
        const history = groups.at(-1)!;
        return {
          box: box.height, leftWidth: left.width, rightWidth: right.width, line: parseFloat(line.height),
          historyLabel: history.querySelector('h3')?.textContent,
          historyAfter: history.getBoundingClientRect().top >= groups.at(-2)!.getBoundingClientRect().bottom,
          historyCount: history.querySelectorAll('[data-search-option]').length,
          offset: parseFloat(line.left) + parseFloat(line.width) / 2 - ((left.right + right.left) / 2 - box.left),
        };
      });
      assert.ok(split.rightWidth > split.leftWidth, 'Cover column wider than avatar column');
      assert.equal(split.historyLabel, 'Search history', 'The last group in the left column should be search history');
      assert.equal(split.historyAfter, true, 'Search history should come after the left column\'s picks');
      assert.equal(split.historyCount, 10);
      assert.ok(Math.abs(split.line - split.box) <= 1, `Divider height ${split.line}px, two-column height ${split.box}px`);
      assert.ok(Math.abs(split.offset) <= 1, `The divider is off the gap between the two columns by ${split.offset}px`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The profile table lists the first four tags, folds the rest into "+N", and the popover lists all tags in the top layer', { timeout: 60_000 }, async () => {
    const opened = await openProfiledPerformer(browser, DESKTOP);
    try {
      const page = opened.page;
      const cell = await page.locator('[data-entity-facts] dd[data-fact="tags"]').evaluate((dd) => ({
        shown: [...dd.querySelectorAll(':scope > [data-fact-tag]')].map((tag) => tag.textContent!.trim()),
        more: dd.querySelector(':scope > [data-hero-more="fact"]')?.textContent?.trim() ?? '',
      }));
      assert.deepEqual(cell.shown, PROFILED.profile.tags.slice(0, 4), 'The tag cell is not the first four');
      assert.equal(cell.more, '+5', 'The "+N" does not count the remaining tags');
      const pop = page.locator('#entityTagPop');
      assert.equal(await pop.isVisible(), false);
      await page.locator('[data-hero-more="fact"]').hover();
      await pop.waitFor({ state: 'visible', timeout: 5_000 });
      const shown = await pop.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          topLayer: element.matches(':popover-open'),
          inView: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
          title: element.querySelector('[data-hero-pop-head]')?.textContent?.trim(),
          tags: [...element.querySelectorAll('[data-fact-tag]')].map((tag) => tag.textContent!.trim()),
        };
      });
      assert.equal(shown.topLayer, true, 'The tag popover is not in the top layer, so the profile card\'s overflow:hidden clips it');
      assert.ok(shown.inView, 'Tag popover overflows the viewport');
      assert.equal(shown.title, '9 tags');
      assert.deepEqual(shown.tags, PROFILED.profile.tags);
      await page.mouse.move(1, 1);
      await pop.waitFor({ state: 'hidden', timeout: 5_000 });
      // One click pins it: it stays open when the pointer leaves, and only Escape closes it.
      await page.locator('[data-hero-more="fact"]').click();
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
      assert.equal(await pop.isVisible(), true, 'Tapping the pinned tag popover collapsed it as soon as the pointer left');
      await page.keyboard.press('Escape');
      assert.equal(await pop.isVisible(), false, 'Escape never collapses the tag popover');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The avatar-change plus is measured on the ring: even when the row is taller than the ring it hugs the ring\'s bottom-right', { timeout: 60_000 }, async () => {
    const opened = await openProfiledPerformer(browser, { name: 'wide', width: 1440, height: 900, mobile: false });
    try {
      const page = opened.page;
      const button = page.locator('[data-entity-portrait-wrap] [data-avatar-picker] button');
      await button.waitFor({ timeout: 15_000 });
      // Row height depends on how many details she has and whether the aliases row wraps; this stretches the identity column directly and measures whether the plus follows the round frame.
      await page.addStyleTag({ content: '[data-entity-identity]{padding-block:40px}' });
      const box = await page.evaluate(() => {
        const rect = (element: Element) => element.getBoundingClientRect();
        const wrap = rect(document.querySelector('[data-entity-portrait-wrap]')!);
        const circle = rect(document.querySelector('[data-entity-portrait]')!);
        const plus = rect(document.querySelector('[data-entity-portrait-wrap] [data-avatar-picker] button')!);
        return { wrap: wrap.height, circle: { right: circle.right, bottom: circle.bottom, height: circle.height },
          plus: { right: plus.right, bottom: plus.bottom } };
      });
      assert.ok(box.wrap > box.circle.height + 8, `The row is not taller than the ring, so the test cannot measure an offset (row ${box.wrap}, ring ${box.circle.height})`);
      // Tailwind's `right-1 bottom-1`: the button sits 4px from the round frame's right and bottom edges.
      assert.ok(Math.abs(box.circle.bottom - box.plus.bottom - 4) < 1, `The plus does not hug the circle's bottom edge: ${JSON.stringify(box)}`);
      assert.ok(Math.abs(box.circle.right - box.plus.right - 4) < 1, `The plus does not hug the circle's right edge: ${JSON.stringify(box)}`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Performer header dark theme: the profile table and aliases popover pick ink and popover surface from the theme', { timeout: 60_000 }, async () => {
    const opened = await openProfiledPerformer(browser, DESKTOP, 'dark');
    try {
      const page = opened.page;
      const ink = await tokenColor(page, '#main', '--ink');
      const muted = await tokenColor(page, '#main', '--muted');
      const ground = await tokenColor(page, '#main', '--ground');
      const facts = await page.locator('[data-entity-facts]').evaluate((dl) => ({
        dd: getComputedStyle(dl.querySelector('dd')!).color, dt: getComputedStyle(dl.querySelector('dt')!).color,
      }));
      assert.equal(facts.dd, ink, 'In dark mode the profile table values are not ink');
      assert.equal(facts.dt, muted, 'In dark theme the profile table\'s item names are not the secondary text color');
      await page.locator('[data-hero-more="alias"]').hover();
      const pop = page.locator('#entityAliasPop');
      await pop.waitFor({ state: 'visible', timeout: 5_000 });
      const { face, shadow } = await pop.evaluate((element) => {
        const style = getComputedStyle(element);
        return { face: style.backgroundColor, shadow: style.boxShadow };
      });
      assert.notEqual(face, 'rgba(0, 0, 0, 0)');
      assert.notEqual(face, 'rgb(255, 255, 255)', 'In dark theme the alias popover still has a white base');
      assert.equal(shadow, await popmenuShadow(page), 'In the dark theme the alias popover\'s shadow differs from .popmenu\'s');
      assert.notEqual(ground, 'rgb(255, 255, 255)', 'Theme did not switch to dark');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('In the detail cast area, each group\'s title and avatar share one left edge, with the name centered right below the avatar', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/', DESKTOP);
    try {
      const page = opened.page;
      /* The demo library's videos have no performers or labels; identity data is spliced in following the `entity_refs` shape of `/api/item`;
         names wider than the avatar show misalignment most easily, so performer names are four characters long. */
      await page.route(/\/api\/item\?/, async (route) => {
        const payload = await (await route.fetch()).json();
        Object.assign(payload, {
          is_jav: true, performers: ['凉森玲梦'], studio: 'Prestige', creator: '',
          entity_refs: {
            creator: [], series: [],
            performer: [{ id: 90_101, name: '凉森玲梦', has_image: true }],
            studio: [{ id: 90_102, name: 'Prestige', has_image: false, has_logo: true }],
          },
        });
        await route.fulfill({ json: payload });
      });
      const square = { contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#888"/></svg>' };
      await page.route(/\/entity-image\?/, (route) => route.fulfill(square));
      await page.route(/\/logo\?/, (route) => route.fulfill(square));
      await page.goto(new URL(`/assets/${requiredEnv('PEACH_E2E_ITEM')}`, page.url()).href, { waitUntil: 'load' });
      await page.locator('[data-item-identity] [data-id-group="studio"] [data-id-name]').waitFor({ timeout: 15_000 });
      const edges = await page.evaluate(() => Object.fromEntries(
        ['performer', 'studio'].map((kind) => {
          const group = document.querySelector(`[data-item-identity] [data-id-group="${kind}"]`)!;
          const name = document.createRange();
          name.selectNodeContents(group.querySelector('[data-id-name]')!);
          const face = group.querySelector('[data-id-face]')!.getBoundingClientRect();
          const text = name.getBoundingClientRect();
          return [kind, {
            label: group.querySelector('[data-id-label]')!.getBoundingClientRect().left,
            face: face.left, faceCenter: face.left + face.width / 2,
            nameCenter: text.left + text.width / 2,
          }];
        })));
      for (const [kind, edge] of Object.entries(edges)) {
        assert.ok(Math.abs(edge.face - edge.label) < 0.5, `${kind} group avatar left edge ${edge.face} is not on the title left edge ${edge.label}`);
        assert.ok(Math.abs(edge.nameCenter - edge.faceCenter) < 0.5,
          `${kind} group's name center line ${edge.nameCenter} not on the avatar center line ${edge.faceCenter}`);
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('On the person page, co-star avatar hover matches the home top bar performer avatar: lift the whole tile\'s fill, no ring', { timeout: 60_000 }, async () => {
    const opened = await openPerformer(browser, DESKTOP);
    try {
      const page = opened.page;
      const person = page.locator('[data-entity-foot] [data-related-performer]').first();
      const face = () => person.evaluate((element) => {
        const style = getComputedStyle(element), ring = getComputedStyle(element.querySelector('[data-hero-ring]')!);
        return { fill: style.backgroundColor, ink: style.color, radius: style.borderRadius, padding: style.padding,
          width: style.width, ring: ring.boxShadow, size: ring.width };
      });
      await page.mouse.move(0, 0);
      const rest = await face();
      await person.hover();
      const hovered = await face();
      // The home page cell (board.css "top two rows on home"): 76px wide, 6/4px padding, 12px radius, hover fills
      // primary-hover, text switches to the primary text color, and the 48px round avatar gets no extra ring.
      const home = {
        fill: await tokenColor(page, '#main', '--color-background-primary-hover'),
        ink: await tokenColor(page, '#main', '--color-text-primary'),
      };
      assert.equal(rest.fill, 'rgba(0, 0, 0, 0)', 'A backing appeared without any hover');
      assert.deepEqual({ radius: hovered.radius, padding: hovered.padding, width: hovered.width, size: hovered.size },
        { radius: '12px', padding: '6px 4px', width: '76px', size: '48px' }, 'The co-star cell and the home avatar cell do not share the same geometry');
      assert.equal(hovered.fill, home.fill, 'Hover does not paint the home tier fill');
      assert.equal(hovered.ink.replace(/\s/g, ''), home.ink.replace(/\s/g, ''), 'Hover never switched to the primary text color');
      assert.equal(hovered.ring, 'none', 'Hover still rings the round avatar');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Profile card lead avatars and co-star avatars zoom to the face box: the image keeps its ratio, fills the ring, and is never clamped by the preflight max-width', { timeout: 60_000 }, async () => {
    const name = '七沢みあ';
    const opened = await visit(browser, '/', DESKTOP);
    try {
      const page = opened.page;
      const focus = { box: TASTE_FACE };
      await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
        id: 90_001, kind: 'performer', canonical_name: name, aliases: [], display_aliases: [],
        user_aliases: [], asset_count: 0, tags: [], links: [], metadata: {}, entry_links: [],
        related_performers: [{ id: 90_002, k: 'Co-stars', n: 1, rep: null, has_image: true, has_avatar: false,
          avatar_focus: focus }],
        has_image: true, has_avatar: false, avatar_focus: focus, representative_asset_id: null,
      } }));
      await page.route(/\/entity-image\?/, (route) => route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${TASTE_FACE.imgW}" height="${TASTE_FACE.imgH}">`
          + `<rect width="${TASTE_FACE.imgW}" height="${TASTE_FACE.imgH}" fill="#888"/></svg>`,
      }));
      await page.goto(new URL(`/performers/${encodeURIComponent(name)}`, page.url()).href, { waitUntil: 'load' });
      for (const [where, selector] of [['Lead slot', '[data-entity-portrait] > img[data-facebox]'],
        ['Co-stars', '[data-hero-ring] > img[data-facebox]']] as const) {
        const img = page.locator(selector).first();
        await img.waitFor({ state: 'attached', timeout: 15_000 });
        // The zoom is written into inline style by `avatarFrame` after the image loads; measure only once that step has landed.
        await page.waitForFunction((element) => element instanceof HTMLImageElement
          && element.complete && element.naturalWidth > 0 && element.style.width !== '',
        await img.elementHandle(), { timeout: 15_000 });
        const frame = await img.evaluate((element) => {
          const ring = element.parentElement!.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return {
            maxWidth: getComputedStyle(element).maxWidth, maxHeight: getComputedStyle(element).maxHeight,
            ring: ring.width, width: box.width, aspect: box.width / box.height,
            gaps: [box.left - ring.left, ring.right - box.right, box.top - ring.top, ring.bottom - box.bottom],
            initial: getComputedStyle(element.parentElement!.querySelector('span')!).display,
          };
        });
        assert.deepEqual([frame.maxWidth, frame.maxHeight], ['none', 'none'], `${where}'s image is clamped by preflight's max-width`);
        assert.ok(frame.width > frame.ring, `${where} is not zoomed to the face box: image width ${frame.width}px, ring ${frame.ring}px`);
        assert.ok(Math.abs(frame.aspect - TASTE_FACE.imgW / TASTE_FACE.imgH) < .02, `The image at ${where} has aspect ${frame.aspect} and is squashed`);
        assert.ok(frame.gaps.every((gap) => gap <= .5), `${where} image does not fill the circle: ${frame.gaps.join(', ')}`);
        if (where === 'Lead slot') assert.equal(frame.initial, 'none', 'When the large slot has an image, the initial letter does not yield');
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`Profile card external-link discs carry no backing and social glyphs fill the disc; on phones the row does not wrap, scrolls sideways, and its scroll layer reaches the card edge (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openProfiledPerformer(browser, viewport);
      try {
        const row = await opened.page.locator('[data-entity-links]').evaluate((element) => {
          const style = getComputedStyle(element);
          const card = element.closest('[data-entity-card]')!.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          const brand = element.querySelector('[data-link-icon="brand"]')!;
          const glyph = brand.querySelector('svg')!.getBoundingClientRect(), plate = brand.getBoundingClientRect();
          return {
            wrap: style.flexWrap, overflowX: style.overflowX, justify: style.justifyContent,
            edges: [box.left - card.left, card.right - box.right],
            discs: [...element.querySelectorAll('[data-link-icon]')].map((disc) => getComputedStyle(disc).backgroundColor),
            glyph: [Math.round(glyph.width), Math.round(glyph.height)], plate: [Math.round(plate.width), Math.round(plate.height)],
          };
        });
        // Padding a backing layer makes the disc one step darker than its surroundings, which reads as the link being disabled.
        assert.ok(row.discs.every((fill) => fill === 'rgba(0, 0, 0, 0)'), `External-link discs carry a backing color: ${row.discs.join(', ')}`);
        assert.deepEqual(row.glyph, row.plate, 'Social glyphs do not fill the disc, exposing the backing at the field-colored corners');
        if (viewport.mobile) {
          // Plain `center` pushes the first half of the row before the scroll origin when it overflows, so those items cannot be scrolled to.
          assert.deepEqual([row.wrap, row.overflowX, row.justify], ['nowrap', 'auto', 'safe center'], 'Narrow-screen external links are not one sideways row');
          assert.ok(row.edges.every((gap) => Math.abs(gap) < 0.5), `The narrow-screen external links scroll layer does not reach the card edge: ${row.edges.join(', ')}`);
        } else {
          assert.equal(row.wrap, 'wrap', 'Desktop external links should wrap, never scroll sideways');
        }
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });

    it(`Name menu: the current overall name raises its background one tier and gets a checkmark, the other rows leave the check slot empty; on mobile the switch draws 32px with a 44px hit area, menu rows 44px (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openProfiledPerformer(browser, viewport);
      try {
        const page = opened.page;
        const toggle = page.locator('[data-namepick-toggle]');
        const hit = await toggle.evaluate((element) => {
          const box = element.getBoundingClientRect(), after = getComputedStyle(element, '::after');
          return { drawn: [Math.round(box.width), Math.round(box.height)], hit: [after.width, after.height] };
        });
        assert.deepEqual(hit.drawn, [32, 32], 'The switch beside the name does not render at 32px');
        if (viewport.mobile) assert.deepEqual(hit.hit, ['44px', '44px'], 'On phones the switch\'s hit area is under 44px');
        await toggle.click();
        await page.locator('[data-namepick-menu]').waitFor({ state: 'visible', timeout: 5_000 });
        const rows = await page.locator('[data-namepick-menu] [role="menuitemradio"]').evaluateAll((items) => items.map((item) => ({
          checked: item.getAttribute('aria-checked') === 'true', fill: getComputedStyle(item).backgroundColor,
          tick: getComputedStyle(item.querySelector('svg')!).visibility, height: item.getBoundingClientRect().height,
          menu: getComputedStyle(item.closest('[data-namepick-menu]')!).backgroundColor,
        })));
        assert.deepEqual(rows.map((row) => row.checked), [true, false], 'In the menu the current unified name is not the first row, or more than one row is selected');
        const [current, other] = rows;
        assert.notEqual(current!.fill, 'rgba(0, 0, 0, 0)', 'The current canonical name\'s row never lifts its background');
        assert.notEqual(current!.fill, current!.menu, 'The current unified name row\'s background matches the menu surface, making it invisible');
        assert.deepEqual([current!.tick, other!.tick], ['visible', 'hidden'], 'The check is not reserved for the current unified name only, or unselected rows keep no check slot');
        assert.equal(other!.fill, 'rgba(0, 0, 0, 0)', 'The unselected row also lifted a background');
        const least = viewport.mobile ? 44 : 36;
        const alias = await page.locator('[data-namepick-alias]').evaluate((item) => item.getBoundingClientRect().height);
        assert.ok([...rows.map((row) => row.height), alias].every((height) => height >= least - 0.5), `A menu row is shorter than ${least}px`);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  /* Dimensions are set by which rows the identity column has: both external links and watch row present is 160px, one missing is 120px. Taking a percentage of row height would make
     the round frame width, column width, alias wrapping, and row height chase each other in a circle, with the extra wrapped height pressing into the card's bottom padding.
     A performer with a profile has only the external links row by default; one with both rows needs the watch logo and subscribe switch added; Nanase Mia has only the watch row. */
  for (const viewport of VIEWPORTS) {
    it(`The category icon shares the row with the video count, category leftmost on the identity line (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openProfiledPerformer(browser, viewport, 'light', { identity_labels: ['Performers','Western'] });
      try {
        const geometry = await opened.page.locator('[data-entity-alias="meta"]').evaluate((element) => {
          const classification = element.querySelector('[data-identity-classification]')!;
          const count = classification.nextElementSibling!;
          const label = classification.getBoundingClientRect(), video = count.getBoundingClientRect();
          const glyph = classification.querySelector('svg')!.getBoundingClientRect();
          // Inline glyphs take `--icon-inline`, 1.2 times the surrounding text's font size.
          const inline = parseFloat(getComputedStyle(classification.querySelector('svg')!).fontSize) * 1.2;
          return { first: element.firstElementChild === classification, top: [label.top, video.top],
            edges: [label.right, video.left], glyph: [glyph.width, glyph.height].map(side => Math.abs(side - inline) < 0.5) };
        });
        assert.equal(geometry.first, true);
        assert.ok(Math.abs(geometry.top[0]! - geometry.top[1]!) < 1, 'The category and video count started a new line');
        assert.ok(geometry.edges[0]! <= geometry.edges[1]!, 'The category is not left of the video count');
        assert.deepEqual(geometry.glyph, [true, true]);
        const measured = await layout(opened.page);
        assert.ok(measured.scrollWidth <= measured.viewportWidth + 1);
        assert.deepEqual(measured.offenders, []);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }
  const openBothRows = (browser: Browser, viewport: typeof DESKTOP) => openProfiledPerformer(browser, viewport, 'light', {
    entry_links: [
      { site: 'minnano-av', label: 'みんなのAV', ordinal: '', slot: 'pill', mark: 'brand-minnano',
        url: 'https://www.minnano-av.com/actress12345.html' },
      { site: 'javdb', label: 'JavDB', ordinal: '', slot: 'mark', mark: 'mark-javdb', url: 'https://javdb.com/actors/NPD3' },
    ],
    feed: { following: false },
  });
  for (const [label, open, size] of [
    ['Both the external links and watch rows are present', openBothRows, 160],
    ['Only the watch row', openPerformer, 120],
    ['Only the external links row', openProfiledPerformer, 120],
  ] as const) {
    it(`The profile card lead sizes by the identity column's row count: ${label} is a ${size}px circle, and the identity column never eats into the card's bottom padding`, { timeout: 60_000 }, async () => {
      const opened = await open(browser, DESKTOP);
      try {
        const box = await opened.page.locator('[data-entity-portrait]').evaluate((element) => {
          const portrait = element.getBoundingClientRect();
          const profile = element.closest('[data-entity-profile]')!.getBoundingClientRect();
          const identity = element.closest('[data-entity-profile]')!.querySelector('[data-entity-identity]')!.getBoundingClientRect();
          return { width: portrait.width, height: portrait.height, room: profile.bottom - identity.bottom };
        });
        assert.ok(Math.abs(box.height - size) < 1, `Avatar is ${box.height}px, expected ${size}px`);
        assert.ok(Math.abs(box.width - box.height) < 1, 'Avatar is not a perfect circle');
        assert.ok(box.room >= 19.5, `The identity row has only ${box.room}px to the card bottom, pressing into the 20px padding`);
        assert.deepEqual(opened.problems, []);
      } finally {
        await opened.close();
      }
    });
  }

  it('The watch row: the two marks sit 32px apart aligned to a 22px text height; MISSAV follows the styling on its own site, AV uses its pink, and the second carries the index', { timeout: 60_000 }, async () => {
    const name = '七沢みあ';
    const opened = await visit(browser, `/performers/${encodeURIComponent(name)}`, DESKTOP, async page => {
      await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
        id: 90_001, kind: 'performer', canonical_name: name, aliases: [], display_aliases: [],
        user_aliases: [], asset_count: 0, tags: [], related_performers: [], links: [], metadata: {},
        has_image: false, has_avatar: false, avatar_focus: null, representative_asset_id: null,
        entry_links: [
          { site: 'javdb', label: 'JavDB', ordinal: '', slot: 'mark', mark: 'mark-javdb', url: 'https://javdb.com/actors/NPD3' },
          { site: 'missav', label: 'MISSAV', ordinal: '2', slot: 'mark', mark: '', url: 'https://missav.ws/actresses/x' },
        ],
      } }));
    });
    try {
      const page = opened.page;
      await page.locator('[data-missav-mark]').waitFor({ timeout: 15_000 });
      const marks = await page.locator('[data-entry-marks]').evaluate((row) => {
        const wordmark = row.querySelector('[data-missav-mark]')!;
        const [miss, av] = [...wordmark.children].map((part) => getComputedStyle(part).color);
        return {
          gap: getComputedStyle(row).columnGap,
          javdb: row.querySelector('[data-entry-mark] svg')!.getBoundingClientRect().height,
          family: getComputedStyle(wordmark).fontFamily, weight: getComputedStyle(wordmark).fontWeight,
          miss, av, ink: getComputedStyle(wordmark.closest('a')!).color,
          ordinal: row.querySelector('[data-entry-ordinal]')?.textContent ?? '',
          hrefs: [...row.querySelectorAll('a[data-entry-mark]')].map((a) => a.getAttribute('href')),
        };
      });
      assert.equal(marks.gap, '32px', 'The two marks are not 32px apart');
      assert.equal(Math.round(marks.javdb), 22, 'The JavDB mark\'s text height is not 22px');
      assert.match(marks.family, /^Halant/, 'MISSAV is not typeset in Halant');
      assert.equal(marks.weight, '500');
      assert.equal(marks.miss, marks.ink, 'The MISS half does not follow the page\'s ink color');
      assert.equal(marks.av, 'rgb(254, 98, 142)', 'The AV half is not MISSAV\'s pink');
      assert.equal(marks.ordinal, '2', 'The second one lacks the server-assigned index');
      assert.deepEqual(marks.hrefs, ['https://javdb.com/actors/NPD3', 'https://missav.ws/actresses/x'], 'The entry address is not the one the server sent');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Label page profile card: the logo fills the square; the official site linking back to its own domain reads "Official website", with the site disc and .02em letter spacing', { timeout: 60_000 }, async () => {
    const name = 'S1 NO.1 STYLE';
    const opened = await visit(browser, '/', DESKTOP);
    try {
      const page = opened.page;
      await page.route(/\/api\/entity\?/, (route) => route.fulfill({ json: {
        id: 90_601, kind: 'studio', canonical_name: name, aliases: [], display_aliases: [], user_aliases: [],
        asset_count: 3, tags: [], related_performers: [], labels: [], metadata: {}, entry_links: [],
        has_image: false, has_avatar: false, has_logo: true, avatar_focus: null, representative_asset_id: null,
        links: [{ link_id: 90_602, link_kind: 'official', clickable: true, label: 'S1', url: 'https://www.s1s1s1.com/' }],
      } }));
      // A logo larger than the box takes the cover-fit path; one smaller centers at native size, which is a separate rule.
      await page.route(/\/logo\?/, (route) => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#888"/></svg>',
      }));
      await page.route('**/link-mark**', (route) => route.fulfill({
        status: 200, contentType: 'image/png', body: Buffer.from(PIXEL, 'base64'),
      }));
      await page.goto(new URL(`/studios/${encodeURIComponent(name)}`, page.url()).href, { waitUntil: 'load' });
      const logo = page.locator('[data-entity-portrait] > img');
      await logo.waitFor({ state: 'attached', timeout: 15_000 });
      await page.waitForFunction((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
        await logo.elementHandle(), { timeout: 15_000 });
      const face = await logo.evaluate((element) => {
        const frame = element.parentElement!, box = element.getBoundingClientRect(), outer = frame.getBoundingClientRect();
        return { shape: frame.getAttribute('data-entity-portrait'), radius: getComputedStyle(frame).borderTopLeftRadius,
          fit: getComputedStyle(element).objectFit,
          gaps: [box.left - outer.left, outer.right - box.right, box.top - outer.top, outer.bottom - box.bottom] };
      });
      assert.equal(face.shape, 'square');
      assert.notEqual(face.radius, '50%', 'The label\'s mark box painted as a circle');
      // Logos follow the "never upscale an image smaller than the frame" group: contain does not crop the wordmark and shrinks larger ones to the frame, so it still fills.
      assert.equal(face.fit, 'contain', 'The label mark got cropped into a fill');
      assert.ok(face.gaps.every((gap) => Math.abs(gap) < 0.5), `The logo does not fill the box: ${face.gaps.join(', ')}`);
      const site = await page.locator('[data-entity-links] a[data-link="url"]').evaluate((a) => ({
        text: a.querySelector('[data-link-label]')?.textContent ?? '',
        spacing: parseFloat(getComputedStyle(a).letterSpacing) / parseFloat(getComputedStyle(a).fontSize),
        mark: a.querySelector('[data-link-icon] img')?.getAttribute('src') ?? '',
        referrer: a.querySelector('[data-link-icon] img')?.getAttribute('referrerpolicy') ?? '',
      }));
      assert.equal(site.text, 'Official site');
      assert.ok(Math.abs(site.spacing - 0.02) < 0.001, `The official site cell's letter spacing is ${site.spacing}em`);
      assert.deepEqual([site.mark, site.referrer], ['/link-mark?id=90602', 'no-referrer'], 'The official site lacks the locally composed site roundel');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The people page first frame keeps the height of new releases and co-performers; text renders first and covers load independently', { timeout: 60_000 }, async () => {
    const name = '七沢みあ';
    const opened = await visit(browser, '/', DESKTOP);
    let releaseCover = () => {};
    try {
      await opened.page.route(/\/api\/entity\/shapes/, (route) => route.fulfill({ json: {
        ok: true, entities: [{ id: 90_001, kind: 'performer', names: [name], parts: ['feed', 'costars'] }] } }));
      // Record which pieces the skeleton carries at the moment it enters the page: anything added later is a flicker inside the skeleton.
      await opened.page.addInitScript(() => {
        const first = { feed: null as boolean | null, foot: null as boolean | null, sheen: '' };
        (window as unknown as { skeletonFirst: typeof first }).skeletonFirst = first;
        new MutationObserver(() => {
          const skeleton = document.querySelector('[data-skeleton="entity/performer"]');
          if (!skeleton || first.feed !== null) return;
          first.feed = !!skeleton.querySelector('.feednew');
          first.foot = !!skeleton.querySelector('.entityfoot');
          // The skeleton card's shimmer arrives the same frame as the skeleton: any later, and that frame exposes the cover cell's black backing.
          const pic = skeleton.querySelector('.feednewskeleton .pic.imgwait');
          first.sheen = pic ? getComputedStyle(pic, '::after').opacity : '';
        }).observe(document, { childList: true, subtree: true });
        // On the real library the startup script keeps running for another four to five hundred milliseconds after sending the roster request, and the roster response arrives within that window,
        // and queues up. Here, at the end of the same task that sends the request, the main thread is held for 700ms to reproduce that window.
        const fetch = window.fetch;
        let blocked = false;
        window.fetch = (...args) => {
          if (!blocked && String(args[0]).includes('/api/entity/shapes')) {
            blocked = true;
            queueMicrotask(() => { const end = performance.now() + 700; while (performance.now() < end); });
          }
          return fetch(...args);
        };
      });
      let release = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      await opened.page.route(/\/api\/entity\?/, async (route) => {
        await held;
        await route.fulfill({ json: {
          id: 90_001, kind: 'performer', canonical_name: name, aliases: [], display_aliases: [],
          user_aliases: [], asset_count: 0, tags: [],
          related_performers: [{ id: 90_002, k: 'Co-stars', n: 1, rep: null, has_image: false,
            has_avatar: false, avatar_focus: null }],
          links: [], metadata: {}, has_image: false, has_avatar: false, avatar_focus: null,
          representative_asset_id: null, entry_links: [], feed: { following: true },
        } });
      });
      await opened.page.route(/\/api\/feeds\/discoveries\?/, (route) => route.fulfill({ json: {
        ok: true, more: false, items: [{
          id: 1, code: 'ABC-001', title: 'Title', link: 'https://javdb.com/v/x', cover_url: null,
          has_cover: true, cover_frame: null, poster_box: null, release_date: '2026-09-01',
          studio: 'Labels', performers: name, source_name: '', read: false, ignored: false,
          scrape_error: null }] } }));
      // 封面尚未返回时，身份、标题和操作仍应可见。
      const coverWaiting = new Promise<void>(resolve => { releaseCover = resolve });
      await opened.page.route(/\/cover\?code=ABC-001/, async (route) => {
        await coverWaiting;
        await route.fulfill({ contentType: 'image/png', body: Buffer.from(PIXEL, 'base64') });
      });
      await opened.page.goto(new URL(`/performers/${encodeURIComponent(name)}`,
        opened.page.url()).href, { waitUntil: 'load' });
      const skeleton = opened.page.locator('[data-skeleton="entity/performer"]');
      await skeleton.locator('.feednew .feednewskeleton').first().waitFor({ timeout: 15_000 });
      const before = await skeleton.evaluate((element) => {
        const row = element.querySelector('.feednew')!;
        const foot = element.querySelector('.entityhero > .entityfoot');
        // The same `.pic.imgwait` is placed outside the new-releases row, and its shimmer is the site-wide waiting style.
        const probe = document.createElement('div');
        probe.className = 'pic imgwait';
        document.querySelector('#main')!.append(probe);
        const plain = getComputedStyle(probe, '::after').backgroundImage;
        probe.remove();
        return { height: row.getBoundingClientRect().height,
          footHeight: foot?.getBoundingClientRect().height ?? 0,
          between: !!(row.previousElementSibling?.matches('[data-filter-frame]') || row.previousElementSibling?.querySelector('[data-filter-frame]'))
            && !!row.nextElementSibling?.matches('.entitysection'),
          sheen: getComputedStyle(row.querySelector('.pic.imgwait')!, '::after').backgroundImage, plain,
          first: (window as unknown as { skeletonFirst: { feed: boolean; foot: boolean; sheen: string } }).skeletonFirst };
      });
      assert.ok(before.between, 'In the skeleton the new-releases row is not between the filter bar and the videos');
      const { sheen, ...parts } = before.first;
      assert.deepEqual(parts, { feed: true, foot: true }, 'The skeleton painted one version first, with the new-releases row or co-stars backfilled later');
      assert.equal(sheen, '1', 'The new-release skeleton card\'s shimmer arrives after the skeleton, exposing the cover cell\'s black base in between');
      assert.ok(before.footHeight > 0, 'The skeleton\'s profile card base lacks the co-stars row');
      assert.equal(before.sheen, before.plain, 'The new-releases skeleton\'s shimmer uses a different color');
      // 身份就绪后新作可以独立等待；真卡出现后不能再退回骨架。
      await opened.page.evaluate(() => {
        const seen = { ready: false, second: false };
        (window as unknown as { feedSeen: typeof seen }).feedSeen = seen;
        new MutationObserver(() => {
          if (document.querySelector('[data-feed-new] [data-feed-id]')) seen.ready = true;
          if (seen.ready && document.querySelector('[data-feed-new] .feednewskeleton')) seen.second = true;
        }).observe(document.querySelector('#index')!, { childList: true, subtree: true });
      });
      release();
      const row = opened.page.locator('[data-feed-new]');
      await row.locator('[data-feed-id]').waitFor({ timeout: 15_000 });
      const after = await row.evaluate((element) => ({
        height: element.getBoundingClientRect().height, busy: element.getAttribute('aria-busy'),
        waiting: element.querySelectorAll('[data-feed-id] .pic.imgwait').length,
        footHeight: document.querySelector('[data-entity-card] > [data-entity-foot]')?.getBoundingClientRect().height ?? 0,
        second: (window as unknown as { feedSeen: { second: boolean } }).feedSeen.second }));
      assert.equal(after.height, before.height, 'The placeholder row and the arrived row differ in height, so the video grid below jumps');
      assert.equal(after.footHeight, before.footHeight, 'The co-stars row\'s placeholder height differs from the real one, so the profile card stretches');
      assert.equal(after.busy, null);
      assert.equal(after.second, false, 'After the whole page renders, the new releases row skeletons one more round on its own');
      assert.equal(after.waiting, 1, 'While the cover waits independently the card keeps its title and actions');
      releaseCover();
      await opened.page.waitForFunction(() => !document.querySelector('[data-feed-id] .pic.imgwait'));
      assert.equal(await row.locator('[data-feed-id] img').first().evaluate(image =>
        (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0), true);
      assert.deepEqual(opened.problems, []);
    } finally {
      releaseCover();
      await opened.close();
    }
  });

  it('The card hover surface does not touch neighboring cards, and the three card grids share one column gap', { timeout: 60_000 }, async () => {
    const opened = await openCatalog(browser);
    try {
      const card = opened.page.locator('#grid [data-media-grid] > [data-media-card]').first();
      await card.hover();
      const geometry = await card.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const neighbor = [...element.parentElement!.children].find((other) => other !== element
          && Math.abs(other.getBoundingClientRect().top - box.top) < 1)!;
        const spread = Number(/0px 0px 0px (\d+(?:\.\d+)?)px/.exec(getComputedStyle(element).boxShadow)?.[1]);
        // The shell's skeleton grid and the follows island's video list are not in the home page's card stack: mount one same-shaped empty shell for each to read the column gap.
        const columnGap = (build: (probe: HTMLElement) => HTMLElement) => {
          const probe = document.createElement('div');
          const host = build(probe);
          document.querySelector('#main')!.append(host);
          const gap = parseFloat(getComputedStyle(probe).columnGap);
          host.remove();
          return gap;
        };
        return {
          spread, clearance: neighbor.getBoundingClientRect().left - (box.right + spread),
          home: parseFloat(getComputedStyle(element.parentElement!).columnGap),
          skeleton: columnGap((probe) => { probe.className = 'grid'; return probe }),
          follow: columnGap((probe) => {
            const island = document.createElement('div');
            island.className = 'peach-react';
            probe.setAttribute('data-follow-list', '');
            island.append(probe);
            return island;
          }),
        };
      });
      assert.ok(geometry.spread > 0, 'The card\'s hover face never spreads outside the box');
      assert.ok(geometry.clearance >= geometry.spread,
        `The hover surface sits ${geometry.clearance}px from the neighboring card, narrower than the ${geometry.spread}px it spreads outward`);
      assert.equal(geometry.skeleton, geometry.home, 'The shell\'s skeleton grid uses a different column gap than home, so the whole row shifts when real cards swap in');
      assert.equal(geometry.follow, geometry.home, 'The follows page video list\'s column gap differs from home\'s');
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('Adjacent watch-later cards\' backgrounds sit a full column gap apart', { timeout: 60_000 }, async () => {
    const opened = await openCatalogFixture(browser, (payload) => {
      if (payload.items.length < 2) throw new Error('Demo catalog has fewer than two cards');
      for (const item of payload.items.slice(0, 2)) item.watch_later = true;
    });
    try {
      await opened.page.mouse.move(0, 0);
      const geometry = await opened.page.evaluate(() => {
        const [first, second] = [...document.querySelectorAll<HTMLElement>('#grid [data-media-grid] > [data-media-card][data-watch-later]')];
        const spread = (element: HTMLElement) => Number(/0px 0px 0px (\d+(?:\.\d+)?)px/.exec(getComputedStyle(element).boxShadow)?.[1] ?? 0);
        return {
          sameRow: Math.abs(first!.getBoundingClientRect().top - second!.getBoundingClientRect().top) < 1,
          clearance: second!.getBoundingClientRect().left - spread(second!) - (first!.getBoundingClientRect().right + spread(first!)),
          columnGap: parseFloat(getComputedStyle(first!.parentElement!).columnGap),
        };
      });
      assert.ok(geometry.sameRow, 'The first two watch later cards are not on one row');
      assert.equal(geometry.clearance, geometry.columnGap, `Only ${geometry.clearance}px left between the two Watch later card backgrounds`);
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  it('The render-skipping meta section never clips edge-hugging avatar hover rings and focus rings', { timeout: 60_000 }, async () => {
    /* Nothing in the demo library is attributed, so avatars are unfocusable `<span>`s; the first card is attributed to a performer, which is when the avatar becomes a button. */
    const opened = await openCatalogFixture(browser, (payload) => {
      const item = payload.items[0];
      if (!item) throw new Error('The demo catalog has no swappable cards');
      item.creator = '';
      item.performers = ['Demo performer'];
      item.performer_total = 1;
      item.performer_entities = [{ id: 90_000, name: 'Demo performer', has_image: false }];
    });
    try {
      /* Viewport render skipping brings paint containment with it, and pixels painted outside the padding box in the meta area are
         clipped; geometry is computed as usual, so what is compared here is the border's outer edge against the padding box,
 * not the content box. Avatar hugs the content box's left and top edges. This does not read `overflow-clip-margin`: Safari
 * ignores it, so the clip edge can only be the box itself. */
      const { page } = opened;
      const avatar = page.locator('#grid [data-media-grid] > [data-media-card] [data-media-meta] > button[data-media-avatar]').first();
      const edges = () => avatar.evaluate((element) => {
        const meta = element.closest('[data-media-meta]')!;
        const style = getComputedStyle(element);
        const shadow = Number(/0px 0px 0px (\d+(?:\.\d+)?)px/.exec(style.boxShadow)?.[1] ?? 0);
        const outline = style.outlineStyle === 'none' ? 0
          : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const ring = Math.max(shadow, outline);
        const box = element.getBoundingClientRect();
        const clip = meta.getBoundingClientRect();
        const left = clip.left + meta.clientLeft, top = clip.top + meta.clientTop;
        return {
          contained: getComputedStyle(meta).contentVisibility === 'auto',
          focused: element.matches(':focus-visible'), ring,
          // How much room is left from the stroke's outer edge to the clip edge; take the smallest of the four sides.
          room: Math.min(box.left - ring - left, box.top - ring - top,
            left + meta.clientWidth - (box.right + ring), top + meta.clientHeight - (box.bottom + ring)),
        };
      });
      await avatar.hover();
      const hovered = await edges();
      assert.ok(hovered.contained, 'Home card meta sections no longer skip rendering: the clipping premise this test guarded changed, so the test changed');
      assert.ok(hovered.ring > 0, 'Avatar hover has no outline');
      assert.ok(hovered.room >= -.5, `The avatar hover outline crosses the meta section clip edge by ${-hovered.room}px, and that part gets clipped`);
      await page.mouse.move(0, 0);
      await page.keyboard.press('Tab');
      await avatar.focus();
      const focused = await edges();
      assert.ok(focused.focused && focused.ring > 0, 'The keyboard focused avatar has no focus ring');
      assert.ok(focused.room >= -.5, `The avatar focus ring crosses the meta section clip edge by ${-focused.room}px, and that part gets clipped`);
    } finally {
      await opened.close();
    }
  });

  it('The image inside the avatar circle, with inline dimensions written from the face box, is not clamped back to the frame width by island preflight', { timeout: 60_000 }, async () => {
    /* The demo library has no entity images, so the first card's avatar frame gets an image scaled up by the face box: when the width exceeds the frame width the image is meant to be that wide,
       cropped by the circle's overflow; clamped back to the frame width, the face drifts left and the initial underneath peeks out on the right. */
    const opened = await openCatalogFixture(browser, (payload) => {
      const item = payload.items[0];
      if (!item) throw new Error('The demo catalog has no swappable cards');
      item.creator = '';
      item.performers = ['Demo performer'];
      item.performer_total = 1;
      item.performer_entities = [{ id: 90_000, name: 'Demo performer', has_image: false }];
    });
    try {
      const avatar = opened.page.locator('#grid [data-media-grid] > [data-media-card] [data-media-meta] > button[data-media-avatar]').first();
      const framed = await avatar.evaluate((element) => {
        const img = document.createElement('img');
        img.setAttribute('style', 'position:absolute;inset:-25% auto auto 0;width:150%;height:195%');
        element.appendChild(img);
        const frame = element.getBoundingClientRect();
        const box = img.getBoundingClientRect();
        const style = getComputedStyle(img);
        return { maxWidth: style.maxWidth, maxHeight: style.maxHeight,
          width: box.width / frame.width, height: box.height / frame.height };
      });
      assert.equal(framed.maxWidth, 'none', 'The avatar image still carries preflight\'s max-width');
      assert.equal(framed.maxHeight, 'none', 'The avatar image still carries max-height');
      assert.ok(Math.abs(framed.width - 1.5) <= .02, `Image scaled by face box to 1.5x box width was clamped to ${framed.width}x`);
      assert.ok(Math.abs(framed.height - 1.95) <= .02, `Image scaled by face box to 1.95x box height was clamped to ${framed.height}x`);
    } finally {
      await opened.close();
    }
  });

  it('The light/dark buttons keep size and hover face, and cards and receipts keep contact shadows', { timeout: 60_000 }, async () => {
    const opened = await visit(browser, '/stats', DESKTOP);
    try {
      // The selected tab collapses its contact shadow to the baseline, so it reads like the unselected tab next to it.
      const card = opened.page.locator('#main [class~="shadow-card"]:not([data-selected])').first();
      await card.waitFor({ timeout: 15_000 });
      await settle(opened.page);
      const checkSecondaryButton = async () => {
        await opened.page.mouse.move(0, 0);
        const dimensions = await opened.page.evaluate(() => {
          const holder = document.createElement('div');
          holder.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000';
          const button = document.createElement('button');
          button.className = 'geist-button';
          button.dataset.buttonProbe = '';
          button.textContent = 'Actions';
          holder.append(button);
          document.body.append(holder);
          const style = getComputedStyle(button);
          return [style.boxSizing, style.height, style.paddingTop, style.paddingRight,
            style.borderTopWidth, style.display];
        });
        assert.deepEqual(dimensions, ['border-box', '36px', '8px', '12px', '1px', 'inline-flex']);
        const button = opened.page.locator('[data-button-probe]');
        try {
          const idle = await button.evaluate(element => getComputedStyle(element).backgroundColor);
          assert.equal(idle, await tokenColor(opened.page, 'body', '--color-background-primary-default'));
          const border = await button.evaluate(element => getComputedStyle(element).borderTopColor);
          await button.hover();
          await settle(opened.page);
          const hovered = await button.evaluate(element => getComputedStyle(element).backgroundColor);
          assert.equal(hovered, await tokenColor(opened.page, 'body', '--control-hover'));
          assert.equal(await button.evaluate(element => getComputedStyle(element).borderTopColor), border);
        } finally {
          await button.evaluate(element => element.parentElement!.remove());
        }
      };
      /* Tailwind copies shadow token literals into utility classes, so changing `--shadow-*` in `.dark` cannot reach them;
         the light shadows hardcoded in the old stylesheet do not follow the theme either. Read one computed value from each of three source types. */
      const alphas = () => opened.page.evaluate(() => {
        const strongest = (shadow: string) => Math.max(0, ...[...shadow.matchAll(
          /rgba\(0, 0, 0, ([\d.]+)\)|rgb\(0, 0, 0\)/g)].map((match) => (match[1] ? Number(match[1]) : 1)));
        const probe = (html: string, parent: Element = document.body) => {
          const holder = document.createElement('div');
          holder.innerHTML = html;
          const element = holder.firstElementChild!;
          // Mounted outside the React island: a reset inside the island would clear the old stylesheet's button shadow.
          parent.append(element);
          const shadow = getComputedStyle(element).boxShadow;
          element.remove();
          return strongest(shadow);
        };
        return {
          card: strongest(getComputedStyle(document.querySelector('#main [class~="shadow-card"]:not([data-selected])')!).boxShadow),
          button: probe('<button class="geist-button" type="button">Key</button>'),
          // The Toast's surface styling only applies inside #toasts: the shadow is written on Sonner's own attribute selector.
          toast: probe('<li data-sonner-toast data-styled="true">Receipt</li>', document.getElementById('toasts')!),
        };
      });
      await opened.page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
        document.documentElement.classList.remove('dark');
      });
      const light = await alphas();
      await checkSecondaryButton();
      // `applyTheme('dark')` in `web/app.js` is exactly these two lines; this only borrows it to switch the palette once.
      await opened.page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
        document.documentElement.classList.add('dark');
      });
      const dark = await alphas();
      await checkSecondaryButton();
      for (const key of Object.keys(light) as Array<keyof typeof light>) {
        assert.ok(light[key] > 0 && light[key] < .2, `In light theme the ${key} shadow ${light[key]} is not on the light tier`);
        assert.ok(dark[key] > light[key] && dark[key] <= .2,
          `The dark ${key} shadow should keep contact without a heavy edge: ${dark[key]}`);
      }
      assert.deepEqual(opened.problems, []);
    } finally {
      await opened.close();
    }
  });

  for (const viewport of [DESKTOP, MOBILE]) {
    it(`JAV subscription cards include pagination and a flush bottom bar (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openFollowManage(browser, viewport);
      try {
        const page = opened.page;
        await page.route('**/api/feeds', route => route.fulfill({ json: {
          unread: 81, sources: Array.from({ length: 25 }, (_, i) => ({
            id: i + 1, kind: 'javdb-actor', kind_label: 'JAV subscriptions', name: `Test subscription ${i + 1}`,
            url: `https://example.com/actors/${i + 1}`, entity_id: null, entity_name: null,
            has_image: false, enabled: true, interval_minutes: 360, last_fetched_at: null,
            last_error: null, last_new_count: 0, seen: 0,
          })),
        } }));
        await page.reload({ waitUntil: 'load' });
        await page.getByRole('tab', { name: 'Follows list', exact: true }).waitFor();
        const card = page.getByRole('region', { name: 'JAV subscription list', exact: true });
        await card.getByText('1-20 / 25 follow sources', { exact: true }).waitFor();
        assert.equal(await card.locator('[role="row"][data-key]').count(), 20);
        await card.getByRole('button', { name: 'Next page', exact: true }).click();
        await card.getByText('21-25 / 25 follow sources', { exact: true }).waitFor();
        assert.equal(await card.locator('[role="row"][data-key]').count(), 5);
        for (const theme of ['light', 'dark']) {
          await page.evaluate(value => {
            document.documentElement.dataset.theme = value;
            document.documentElement.classList.toggle('dark', value === 'dark');
          }, theme);
          const surface = await card.evaluate(element => {
            const footer = element.querySelector('footer')!;
            const box = element.getBoundingClientRect();
            const bottom = footer.getBoundingClientRect();
            return { background: getComputedStyle(element).backgroundColor,
              footerBackground: getComputedStyle(footer).backgroundColor,
              left: bottom.left - box.left, right: box.right - bottom.right,
              bottom: box.bottom - bottom.bottom };
          });
          assert.notEqual(surface.background, 'rgba(0, 0, 0, 0)');
          assert.notEqual(surface.background, surface.footerBackground);
          for (const edge of ['left', 'right', 'bottom'] as const) assert.ok(Math.abs(surface[edge]) <= 1);
          const dimensions = await layout(page);
          assert.ok(dimensions.scrollWidth <= dimensions.viewportWidth + 1, JSON.stringify(dimensions));
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
    it(`Follow categories use Pills; add-follow results have an outline (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openFollowManage(browser, viewport);
      try {
        const page = opened.page;
        const tabs = page.getByRole('tablist', { name: 'Follows management area' });
        for (const theme of ['light', 'dark']) {
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
            document.documentElement.classList.toggle('dark', value === 'dark');
          }, theme);
          await tabs.getByRole('tab', { name: 'Add follow', exact: true }).click();
          await page.waitForFunction(() => {
            const host = document.querySelector('[role="tablist"][aria-label="Follows management area"]')!;
            const selected = host.querySelector('[aria-selected=true]')!.getBoundingClientRect();
            const surface = host.querySelector('[data-pill-thumb]')?.getBoundingClientRect();
            return surface && Math.abs(selected.left - surface.left) <= 1
              && Math.abs(selected.width - surface.width) <= 1;
          });
          const face = await tabs.evaluate((element) => {
            const selected = element.querySelector('[data-pill-thumb]')!;
            return { track: getComputedStyle(element).backgroundColor,
              selected: getComputedStyle(selected).backgroundColor,
              shadow: getComputedStyle(selected).boxShadow };
          });
          assert.equal(face.track, 'rgba(0, 0, 0, 0)', 'The Pills container should be transparent');
          assert.notEqual(face.selected, face.track, 'The current category deserves its own background');
          assert.equal(face.shadow, 'none', 'Pills use no floating thumb');
          await tabs.getByRole('tab', { name: 'Add follow', exact: true }).focus();
          await page.keyboard.press('Home');
          await page.keyboard.press('Enter');
          assert.equal(await tabs.getByRole('tab', { name: 'Follows list', exact: true }).getAttribute('aria-selected'), 'true');
          const dimensions = await layout(page);
          assert.ok(dimensions.scrollWidth <= dimensions.viewportWidth + 1, JSON.stringify(dimensions));
        }
        await page.route('**/api/follow/resolve', (route) => route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify({
            status: 'done', results: [{ line: 'Theme test source', candidates: [{
              provider: 'kemono', provider_label: 'Kemono', label: 'Theme test candidate', url: 'https://example.com/creator',
            }] }],
          }),
        }));
        await tabs.getByRole('tab', { name: 'Add follow', exact: true }).click();
        await page.getByRole('textbox', { name: 'Source link, name or id' }).fill('Theme test source');
        await page.getByRole('region', { name: 'Add a creator follow', exact: true }).getByRole('button', { name: 'Find', exact: true }).click();
        const result = page.getByText('Theme test source', { exact: true }).locator('..');
        await result.waitFor();
        for (const theme of ['light', 'dark']) {
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
            document.documentElement.classList.toggle('dark', value === 'dark');
          }, theme);
          const surface = await result.evaluate((element) => {
            const s = getComputedStyle(element);
            return { shadow: s.boxShadow, width: s.borderTopWidth, border: s.borderTopColor, bg: s.backgroundColor };
          });
          assert.equal(surface.shadow, 'none');
          assert.equal(surface.width, '1px');
          assert.notEqual(surface.border, surface.bg, 'Result groups must have a recognizable boundary');
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
    it(`Peach configuration source credentials are grouped as required with outlines (${viewport.name})`, { timeout: 60_000 }, async () => {
      const opened = await openFollowManage(browser, viewport);
      try {
        const page = opened.page;
        await page.getByRole('link', { name: /^来源与订阅设置/ }).click();
        await page.getByRole('tab', { name: 'Sources and subscriptions', exact: true, selected: true }).waitFor();
        await page.getByRole('region', { name: 'Configurable credentials', exact: true }).waitFor();
        await settle(page);
        for (const theme of ['light', 'dark']) {
          await page.evaluate(value => {
            document.documentElement.dataset.theme = value;
            document.documentElement.classList.toggle('dark', value === 'dark');
          }, theme);
          for (const name of ['Configurable credentials', 'No credentials needed', 'Not supported yet']) {
            const group = page.getByRole('region', { name, exact: true });
            const rows = await group.evaluate(element => {
              const style = getComputedStyle(element.lastElementChild!);
              return { shadow: style.boxShadow, width: style.borderTopWidth,
                border: style.borderTopColor, background: style.backgroundColor };
            });
            assert.equal(rows.shadow, 'none');
            assert.equal(rows.width, '1px');
            assert.notEqual(rows.border, rows.background);
          }
          assert.match(await page.getByRole('region', { name: 'No credentials needed', exact: true }).innerText(), /Kemono/);
          assert.match(await page.getByRole('region', { name: 'Not supported yet', exact: true }).innerText(), /OnlyFans/);
          const dimensions = await layout(page);
          assert.ok(dimensions.scrollWidth <= dimensions.viewportWidth + 1, JSON.stringify(dimensions));
        }
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }
});
