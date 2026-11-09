/* Shared card face.
 *
 * What is pinned is the fact that "a card is a filled surface": Board's cards were never outlined hollow shells, yet during migration each page assembled its own
 * `rounded-2xl border border-separator-border` string, ten files and twenty spots, and the whole admin area lost a layer of surface color.
 * So besides the variant, this also sweeps the React subtree to stop the next person from assembling their own card face. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

import { cardClass } from '../src/react/components/card';

const classes = (options?: Parameters<typeof cardClass>[0]) =>
  new Set(cardClass(options).split(' '));

it('The default tier card is filled with no outline', () => {
  const card = classes();
  expect(card).toContain('bg-background-secondary-default');
  expect(card).toContain('shadow-card');
  expect([...card].filter((name) => name.startsWith('border'))).toEqual([]);
});

it('Radius and padding come per variant', () => {
  expect(classes()).toContain('rounded-2xl');
  expect(classes()).toContain('p-5');
  // The chart card steps up one size, matching the legacy `.board-radial-card{border-radius:20px}`.
  expect(classes({ radius: 'chart' })).toContain('rounded-2-5xl');
  // Cards that lay out their own header, body, and footer padding (stat cards, sections) get none of this.
  expect(classes({ padding: 'none' })).not.toContain('p-5');
});

it('An outlined card is a primary surface plus a hairline, not a transparent hollow shell', () => {
  const outlined = classes({ variant: 'outlined' });
  expect(outlined).toContain('bg-background-primary-default');
  expect(outlined).toContain('border-separator-border');
  expect(outlined).not.toContain('bg-background-secondary-default');
});

/* The old `.reviewitem` took the `--surface-radius` tier and had no touch shadow: shadows are for filled cards
   "floating on a secondary backing"; outlined cards already edge themselves with lines, and pressing another shadow on is two edge treatments stacked. */
it('Outlined cards carry their own 14px radius, do not follow the filled-card tier, and add no shadow', () => {
  const outlined = classes({ variant: 'outlined' });
  expect(outlined).toContain('rounded-surface');
  expect(outlined).not.toContain('shadow-card');
  // When the caller asks for a different radius, the caller still wins.
  expect(classes({ variant: 'outlined', radius: 'chart' })).toContain('rounded-2-5xl');
});

it('The extra layer floating in the card uses the primary background with no border', () => {
  const raised = classes({ variant: 'raised' });
  expect(raised).toContain('bg-background-primary-default');
  expect([...raised].filter((name) => name.startsWith('border'))).toEqual([]);
});

it('The extra outline on top of a filled card never swaps the base', () => {
  const fieldset = classes({ bordered: 'line' });
  expect(fieldset).toContain('bg-background-secondary-default');
  expect(fieldset).toContain('border-border-button-default');
  expect(classes({ bordered: 'soft' })).toContain('border-separator-border');
  // The failure card's border needs a width to be drawn, and it's drawn as an outline that doesn't occupy the box, so content isn't squeezed into 1px.
  const failed = [...classes({ bordered: 'error' })];
  expect(failed.filter((name) => name.startsWith('border'))).toEqual([]);
  expect(failed).toEqual(expect.arrayContaining(['outline-1', '-outline-offset-1', 'outline-border-error-default']));
});

/* The ring draws on the `::after` overlay: an inset box-shadow paints beneath child elements, and the footer strip's background would cover the ring's lower half. */
it('The selected state draws a 2px outline on the top layer, drops the contact shadow, and hover never covers selected', () => {
  const tab = cardClass({ interactive: true, selectable: true });
  expect(tab).toContain('relative');
  expect(tab).toContain('data-selected:shadow-none');
  expect(tab).toContain('data-selected:after:absolute');
  expect(tab).toContain('data-selected:after:inset-0');
  expect(tab).toContain('data-selected:after:z-1');
  expect(tab).toContain('data-selected:after:rounded-[inherit]');
  expect(tab).toContain('data-selected:after:border-2');
  expect(tab).toContain('data-selected:after:border-border-focus-ring');
  expect(tab).not.toContain('ring-inset');
  // The hover rule is written as `not-data-selected:`, without relying on utility class ordering.
  expect(tab).toContain('not-data-selected:hover:bg-card-hover');
  expect(tab).not.toContain(' hover:bg-card-hover');
});

/** The `.tsx` files in the React subtree except BoardUI sources. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'boardui' ? [] : sources(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

it('The page never assembles its own card faces', () => {
  const offenders = sources(resolve(process.cwd(), 'src/react'))
    .filter((path) => {
      const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // The stroke plus the card's two corner radii (16px, 20px) make a card; the card face uses `components/card.tsx`.
      // The remaining `border-t` / `border-b` / `border-y` are dividers, and `rounded-2lg` is a small block inside a card,
      // `shadow-dropdown` is an overlay; overlays are outlined to begin with.
      return /className=\{?"[^"]*\bborder border-/.test(code)
        && /className=\{?"[^"]*\brounded-(?:2xl|2-5xl)\b/.test(code)
        && !code.includes('shadow-dropdown');
    })
    .map((path) => path.split(/[\\/]/).slice(-2).join('/'));
  expect(offenders).toEqual([]);
});
