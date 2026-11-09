/* The React style output must not keep `light-dark()` rewrites.
 *
 * `cssTarget` predates native `light-dark()` support, and lightningcss rewrites it to
 * `var(--lightningcss-light,...)var(--lightningcss-dark,...)`, with both variables defined only by a `color-scheme` declaration.
 * This stylesheet has no such declaration, so the variables stay undefined and the whole declaration fails at computed-value
 * time: `box-shadow` becomes none and the color falls back to inheritance. Theme branches are written as `.dark` ancestor
 * selectors with custom properties, see the lightbox and profile card overlays. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), '../web/dist/peach-app.css'), 'utf8');

it('The React style artifacts contain no lightningcss variables depending on color-scheme', () => {
  const rules = css.match(/[^{}]*\{[^{}]*--lightningcss-(?:light|dark)[^{}]*\}/g) ?? [];
  expect(rules.map((rule) => rule.trim().slice(0, 200))).toEqual([]);
});
