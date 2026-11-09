import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { layout, settle, VIEWPORTS } from './harness.ts';
import { installDesignBrowser, openCatalogFixture } from './design-fixture.ts';

describe('Video card byline row', () => {
  let browser: Browser;
  installDesignBrowser(next => { browser = next });
  it('Dense cards keep date and size complete after text enlarges, with no meta clipping', { timeout:60_000 }, async () => {
    const opened = await openCatalogFixture(browser, payload => {
      Object.assign(payload.items[0], {is_jav:true,code:'MIAA-155',performers:['篠田优'],
        performer_total:1,release_date:'2019-09-13',size:6549825126});
    });
    try {
      await opened.page.evaluate(() => {
        document.body.dataset.density = 'dense';
        document.body.style.setProperty('--fs-xs','18px');
      });
      await settle(opened.page);
      const card = opened.page.locator('#grid [data-media-card]').first();
      for (const name of ['release','size']) {
        const item = card.locator(`[data-media-${name}]`);
        assert.equal(await item.isVisible(), true);
        const geometry = await item.evaluate(e => {
          const date=e.getBoundingClientRect(), line=e.closest('[data-media-byline]')!.getBoundingClientRect();
          const meta=e.closest('[data-media-meta]')!.getBoundingClientRect();
          return {right:date.right,bottom:date.bottom,lineRight:line.right,lineBottom:line.bottom,metaBottom:meta.bottom};
        });
        assert(geometry.right<=geometry.lineRight+1 && geometry.bottom<=geometry.lineBottom+1
          && geometry.bottom<=geometry.metaBottom+1, JSON.stringify(geometry));
      }
    } finally { await opened.close() }
  });
  it('Dense narrow-card credits stay on one line: what does not fit steps aside, without pressing tags or crossing the row box', { timeout: 60_000 }, async () => {
    const opened = await openCatalogFixture(browser, payload => {
      Object.assign(payload.items[0], { is_jav: true, code: 'MIAA-155', performers: ['篠田优', '水野葵', '森田优'], performer_total: 12,
        release_date: '2019-09-13', size: 6549825126, tags: ['Big breasts', 'Creampie'] });
    });
    try {
      await opened.page.evaluate(() => { document.body.dataset.density = 'dense' });
      for (const [tile, date] of [['300px', true], ['168px', false]] as const) {
        await opened.page.evaluate(value => document.documentElement.style.setProperty('--tile', value), tile);
        await settle(opened.page);
        const rows = await opened.page.locator('#grid [data-media-card]').first().evaluate(card => {
          const line = card.querySelector('[data-media-byline]')!.getBoundingClientRect();
          const shown = [...card.querySelectorAll('[data-media-byline] > *, [data-media-facts] > *')]
            .filter(node => node.getClientRects().length > 0).map(node => node.getBoundingClientRect());
          return { text: card.querySelector('[data-media-text]')!.getBoundingClientRect().width,
            line: line.height, outside: shown.filter(box => box.top < line.top - 1 || box.bottom > line.bottom + 1 || box.right > line.right + 1).length,
            date: card.querySelector('[data-media-release]')!.getClientRects().length > 0,
            tag: card.querySelector('[data-media-tag]')!.getBoundingClientRect().top, bottom: line.bottom };
        });
        assert.ok(rows.text < 360, `This card should be a narrow card: ${JSON.stringify(rows)}`);
        assert.equal(rows.outside, 0, `Byline content wrapped or overflowed: ${JSON.stringify(rows)}`);
        assert.equal(rows.date, date, `${tile}-wide card date ${date ? 'should keep' : 'should yield'}: ${JSON.stringify(rows)}`);
        assert.ok(rows.tag >= rows.bottom, `Tags are overlapping the credit: ${JSON.stringify(rows)}`);
      }
    } finally { await opened.close() }
  });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name} names sit left, and dates wrap and stay on narrow cards`, { timeout: 60_000 }, async () => {
      const opened = await openCatalogFixture(browser, payload => {
        Object.assign(payload.items[0], { is_jav: true, code: 'MIAA-155', name: 'Demo video',
          performers: ['篠田优'], performer_total: 1, release_date: '2019-09-13', size: 6549825126 });
      });
      try {
        await opened.page.setViewportSize({ width: viewport.width, height: viewport.height });
        await settle(opened.page);
        const card = opened.page.locator('#grid [data-media-card]').first();
        for (const [field, glyph] of [['who', 'user-round'], ['release', 'calendar'], ['size', 'hard-drive']]) {
          assert.equal(await card.locator(`[data-media-${field}] svg use`).getAttribute('href'), `#i-${glyph}`);
          const icon = card.locator(`[data-media-${field}] svg`);
          assert.equal(await icon.isVisible(), true);
          // Icons inline with text take `--icon-inline` (1.2em), computing their edge length from the surrounding text's font size.
          {
            const [width, inline] = await icon.evaluate(node => [node.getBoundingClientRect().width,
              parseFloat(getComputedStyle(node).fontSize) * 1.2]);
            assert.ok(Math.abs(width - inline) < 0.5, `${field} icon is ${width}px, expected ${inline}px`);
          }
        }
        const geometry = await card.evaluate(element => {
          const who = element.querySelector('[data-media-who]')!;
          const byline = element.querySelector('[data-media-byline]')!;
          const date = element.querySelector('[data-media-release]')!;
          const style = getComputedStyle(who);
          const a = who.getBoundingClientRect(), b = date.getBoundingClientRect();
          return { align: style.textAlign, width: a.width, available: byline.getBoundingClientRect().width,
            together: Math.abs(a.top - b.top) < 2, height: byline.clientHeight, content: byline.scrollHeight };
        });
        assert.equal(geometry.align, 'left');
        assert(geometry.width < geometry.available / 2);
        assert.equal(geometry.together, geometry.available >= 360);
        assert(geometry.content <= geometry.height + 1, JSON.stringify(geometry));
        const size = await layout(opened.page);
        assert.equal(size.viewportWidth, viewport.width);
        assert(size.scrollWidth <= size.viewportWidth + 1, JSON.stringify(size));
        assert.deepEqual(size.offenders, []);
        await opened.page.screenshot({ path: resolve('../build', `byline-${viewport.name}.png`) });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
