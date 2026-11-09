/* Class names in the React style output must not collide with the legacy stylesheet's class selectors.
 *
 * Neither stylesheet is layered, and `board.css` and `/app.css` come after `peach-app.css`, so same-name classes are won by
 * the legacy rules: the card grid's `.grid` would crush `grid-cols-7` into one column and stretch `gap-1` to 16px. The other
 * way, the generated `.ring` would land on legacy pages' `.ring` elements too. Utility classes React genuinely needs are
 * spelled differently (a grid container inside a flex parent writes `inline-grid`); English words in comments that would be
 * scanned into utilities are excluded in `styles.css` with `@source not inline`. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const web = resolve(process.cwd(), '../web');
const read = (...path: string[]) => readFileSync(resolve(web, ...path), 'utf8');

/** Class names used by class selectors in the stylesheet, with escape characters restored. */
function classNames(css: string): Set<string> {
  const names = new Set<string>();
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{};]+(?=\{)/g) ?? [];
  for (const selector of selectors) {
    if (selector.trim().startsWith('@')) continue;
    for (const [, name = ''] of selector.matchAll(/\.((?:[A-Za-z_-]|\\.)(?:[\w-]|\\.)*)/g)) {
      names.add(name.replace(/\\(.)/g, '$1'));
    }
  }
  return names;
}

it('React style output class names do not share names with the old stylesheet', () => {
  const legacy = new Set([
    ...classNames(read('board.css')),
    ...readdirSync(resolve(web, 'css')).filter((name) => name.endsWith('.css'))
      .flatMap((name) => [...classNames(read('css', name))]),
  ]);
  /* These two are names both sides agreed on, and the sameness is the contract: `.peach-react` lets the legacy stylesheet
     exclude the React subtree from the global focus ring; `.dark` is the theme marker `applyTheme` in
     `src/appearance/theme.ts` hangs on <html>, which the legacy stylesheet uses to give light mode its own face and which the
     React side's Tailwind dark variants also read. */
  const agreed = new Set(['peach-react', 'dark']);
  /* `video-js` and `vjs-*` are Video.js's component contract: classes are attached by its own components, and player styles
     (`src/player/player.css`, the immerse island's `immerse.css`) may only be written against these classes; same-named rules in the old stylesheet select
     the same kind of element, and the shared name is the contract. */
  const videojs = (name: string) => name === 'video-js' || name.startsWith('vjs-');
  const shared = [...classNames(read('dist', 'peach-app.css'))]
    .filter((name) => !agreed.has(name) && !videojs(name) && legacy.has(name));
  expect(shared).toEqual([]);
});
