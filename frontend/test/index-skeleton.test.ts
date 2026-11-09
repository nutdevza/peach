/* The five index pages' entry skeletons.
 *
 * Glyphs in the skeleton use the shell `index.html` sprite (`<use href="#i-…">`); writing a name not in the sheet does not error,
 * the cell is just empty: when the tabs "Artists" and "Sellers" are written as `user`, only "Online" in the skeleton has an icon. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

import { indexParams, indexPlaceholderHtml, type IndexPageKind } from '../src/index-skeleton';
import { tagSkeletonHtml } from '../src/tag-skeleton';

const sprite = new Set(
  [...readFileSync(resolve(__dirname, '../../web/index.html'), 'utf8').matchAll(/<symbol id="i-([^"]+)"/g)]
    .map((match) => match[1]));

const PAGES: [IndexPageKind, string][] = [
  ['performers', ''], ['performers', '?scope=online'], ['creators', ''],
  ['studios', ''], ['agencies', ''], ['series', ''], ['tags', ''], ['tags', '?scope=online&view=cloud'],
];

it.each(['cloud', 'alphabet'])('%s tag placeholders reserve body and pagination per the page size', mode => {
  for (const pageSize of [50, 100, 200]) {
    const host = document.createElement('div');
    host.innerHTML = tagSkeletonHtml({ mode, pageSize });
    expect(host.querySelectorAll('[data-tag-skeleton-cell]')).toHaveLength(pageSize);
    expect(host.querySelector('[data-tag-pagination-skeleton]')).not.toBeNull();
    expect(host.querySelector('[aria-busy="true"]')?.getAttribute('role')).toBe('status');
  }
});

it.each(PAGES)('Every glyph in the %s%s skeleton lives in the sprite', (kind, search) => {
  for (const layout of ['big', 'compact'] as const) {
    const html = indexPlaceholderHtml(indexParams(kind, search), layout);
    const used = [...html.matchAll(/href="#i-([^"]+)"/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !sprite.has(name))).toEqual([]);
  }
});
