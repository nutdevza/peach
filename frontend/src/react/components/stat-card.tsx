/* The readout card: one icon with a name, one big number, one footnote.
 *
 * The legacy `.metricstrip>button` and `.tastesummary` are the same card; the stats page makes it double as a tab and the
 * taste page uses it read-only. The three sections each carry their own padding, the footnote hugs the card bottom and is a
 * touch darker than the face, so the card keeps no padding of its own and the three sections lay it out
 * (`padding:16px 0 0`, `0 16px`, `12px 16px 16px`, `10px 16px`).
 *
 * The icon's base color follows the card's position in its row, four cards four colors; the old values were four flat fills,
 * and here the four closest chart-color tokens are taken (blue, purple, green, yellow), differences registered in
 * `../boardui/ORIGIN.md`. */
import type { ReactNode } from 'react';

import { cardClass, type CardOptions } from './card';
import type { Glyph } from './sprite-glyph';

/* The icon's small square is centered with flex, not grid: `grid` collides with a class name in the legacy stylesheet, and per the
 * `@source not inline(...)` rule at the top of `../styles.css` that utility is not generated. */

/** Icon colors for a row of four cards. It cycles from the fifth on, and the old stylesheet also stops at the fourth. */
const ACCENT = ['text-chart-6', 'text-chart-5', 'text-chart-7', 'text-chart-8'];
const ACCENT_TINT = ['bg-chart-6/10', 'bg-chart-5/10', 'bg-chart-7/10', 'bg-chart-8/10'];

/** The count card's face. The host may be a `<div>` or a React Aria `Tab`, so only class names are given. */
export function statCardClass(options: CardOptions = {}) {
  return `${cardClass({ ...options, padding: 'none' })} flex flex-col overflow-hidden pt-4 text-left`;
}

/** A row of stat cards: four per row, wrapping to two per row on narrow screens. The host may be a `TabList`, so the class names are also provided separately. */
export const STAT_STRIP = 'inline-grid w-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4';

/** A row of six readout cards: one row on wide screens, three per row at medium widths, two per row on narrow screens. The follows-management top row is four follow
 *  readouts plus two JAV subscription readouts; in the four-column tier they would break into four plus two, leaving the last two stranded on a second row. */
export const STAT_STRIP_SIX = 'inline-grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6';

/* The plain metric card's face: the data management top row's entry points and resource sync's results. Not the same card as the tier above;
 *  the old `.board-plain-stat` has no footnote strip and no shadow, padding lives on the card itself (16px, 8px between the three segments),
 *  the icon block is a white-background cell, and the footnote line under the reading is third-level gray small text. */
export function plainStatClass({ interactive = false }: { interactive?: boolean } = {}) {
  return cardClass({ padding: 'none', radius: 'plain', interactive,
    className: 'flex min-h-33 flex-col gap-2 p-4 text-left' });
}

/** A row of five clean reading cards: one step narrower gives two per row, on phone one per row; the data management first-screen skeleton uses this same set. */
export const PLAIN_STAT_STRIP = 'inline-grid w-full grid-cols-5 gap-4 max-plain-stat-pair:grid-cols-2'
  + ' max-plain-stat-single:grid-cols-1';

export function PlainStat(
  { label, icon: Icon, mark, aside, figure, meta, wrapMeta = false }:
  {
    label: string; icon?: Glyph; mark?: ReactNode; aside?: ReactNode;
    figure: string; meta?: string; wrapMeta?: boolean;
  },
) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 text-body-medium text-text-secondary">
        {Icon || mark ? (
          <i aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background-primary-default text-text-primary">
            {Icon ? <Icon aria-hidden className="size-4" /> : mark}
          </i>
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
        {aside ? <span className="ml-auto shrink-0 text-caption-1-regular">{aside}</span> : null}
      </span>
      <strong className="block text-title-1-medium tabular-nums text-text-primary">{figure}</strong>
      <span className={`block min-h-4 text-caption-1-regular text-text-tertiary ${wrapMeta ? '' : 'truncate'}`}>
        {meta}
      </span>
    </>
  );
}

export function StatCard(
  { label, icon: Icon, accent = 0, figure, footer }:
  { label: string; icon?: Glyph; accent?: number; figure: string; footer?: ReactNode },
) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 px-4 text-body-regular text-text-secondary max-sm:gap-1.5 max-sm:px-3">
        {Icon ? (
          <i aria-hidden className={`flex size-7 shrink-0 items-center justify-center rounded-lg max-sm:size-6 ${ACCENT[accent % 4]} ${ACCENT_TINT[accent % 4]}`}>
            <Icon aria-hidden className="size-4" />
          </i>
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
      </span>
      {/* On narrow screens with two cards per row the card is only around 140px, so stats drop one font tier; when nine digits no longer fit, wrap instead of truncating the leading digits. */}
      <b className="px-4 pt-3 pb-4 text-title-1-medium tabular-nums text-text-primary wrap-anywhere max-sm:px-3 max-sm:pb-3 max-sm:text-title-3-medium">
        {figure}
      </b>
      {/* The footnote is pinned to the card bottom: when a neighbor stretches the card taller, the freed space goes above the readout and the footnote does not drift. */}
      <small className="mt-auto block min-h-9.5 bg-card-footer px-4 py-2.5 text-caption-1-regular text-text-secondary max-sm:px-3 max-sm:py-2">
        {footer}
      </small>
    </>
  );
}
