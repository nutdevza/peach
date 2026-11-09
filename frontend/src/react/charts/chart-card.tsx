/* Chart cards' shell, header and EvilCharts coloring, shared by the stats page and taste page.
 *
 * Chart cards take one radius tier above readout cards: the legacy `.board-radial-card` / `.board-heat-card` /
 * `.board-sankey-card` are all 20px. The header is two columns: title over the big number on the left, with the annotation
 * hugging the bottom right aligned to the number's baseline, so annotations of any length never push the title away. */
import type { ReactNode } from 'react';
import { Text } from 'recharts';

import type { ChartConfig } from '@/registry/ui/recharts-chart';

import { cardClass } from '../components/card';

export const CHART_CARD = `${cardClass({ radius: 'chart' })} flex flex-col gap-4 max-sm:p-4`;

/** A chart with no data to draw: title unchanged, the plot area replaced by one line of explanation. Shared by the stats and taste pages' charts. */
export function ChartEmpty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={CHART_CARD} aria-label={title}>
      <h3 className="text-title-2-medium text-text-primary">{title}</h3>
      <p className="text-body-2-regular text-text-secondary">{children}</p>
    </section>
  );
}

/** When glyph width cannot be measured (no canvas), estimate each glyph's width, erring wide: CJK, fullwidth symbols, and emoji count as 13, everything else as 7. */
const glyphWidth = (glyph: string) => ((glyph.codePointAt(0) ?? 0) > 0x2e7f ? 13 : 7);

const graphemes = (text: string): string[] =>
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment);

/** A measuring ruler for axis text (12px, page font), built on first use. `null` when no 2D canvas is available. */
let ruler: CanvasRenderingContext2D | null | undefined;
function measureText(text: string): number | null {
  if (ruler === undefined) {
    try {
      ruler = document.createElement('canvas').getContext('2d');
      if (ruler) ruler.font = `12px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    } catch {
      ruler = null;
    }
  }
  return ruler ? ruler.measureText(text).width : null;
}

/** The width of one axis label in pixels: measured in the browser, or estimated from glyph metrics when it cannot be. */
export const labelWidth = (text: string): number =>
  measureText(text) ?? graphemes(text).reduce((sum, glyph) => sum + glyphWidth(glyph), 0);

/** Truncates a category name to within `room` pixels, replacing the cut part with an ellipsis; returns it unchanged when it fits. */
export function fitLabel(text: string, room: number): string {
  if (labelWidth(text) <= room) return text;
  const glyphs = graphemes(text);
  let kept = 0;
  while (kept < glyphs.length && labelWidth(`${glyphs.slice(0, kept + 1).join('')}…`) <= room) kept += 1;
  return `${glyphs.slice(0, kept).join('')}…`;
}

/** The horizontal bar chart's category axis width: follows the longest name up to `cap`, so bars are not squeezed out by names. */
export const categoryAxisWidth = (names: string[], cap = 104): number =>
  Math.min(cap, Math.max(24, ...names.map(labelWidth)) + 12);

/** One name on the category axis. Recharts hands in the tick's coordinates, the axis width and the visible tick count: vertical bars truncate by each bar's
 *  allotted width, horizontal bars by the axis width. The full name is in `<title>`, and the hover overlay reads the full name too. */
export function CategoryTick(
  props: {
    along: 'x' | 'y'; payload?: { value?: unknown }; width?: number; visibleTicksCount?: number;
  } & Record<string, unknown>,
) {
  const { along, payload, width = 0, visibleTicksCount = 1, ...rest } = props;
  const name = String(payload?.value ?? '');
  // A vertical bar's name centers in the slot its bar takes, with 1px on each side; a horizontal bar's name sits 8px of tickMargin away from the bar.
  const room = along === 'x' ? width / Math.max(1, visibleTicksCount) - 2 : width - 8;
  return (
    <g>
      <title>{name}</title>
      <Text {...(rest as object)}>{fitLabel(name, room)}</Text>
    </g>
  );
}

/** A chart's head: a title, one big number, and a sentence for what it points at right now. */
export function ChartHead({ title, figure, note }: { title: string; figure: string; note: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <span className="flex min-w-0 flex-col gap-1">
        <h3 className="text-title-2-medium text-text-primary">{title}</h3>
        <b className="text-display-4-medium tabular-nums text-text-primary">{figure}</b>
      </span>
      <small className="min-w-0 text-caption-1-regular break-words text-text-secondary">{note}</small>
    </header>
  );
}

/** BoardUI's six chart colors; `ChartConfig` writes only these variables, and both light and dark tiers follow the tokens. */
export const CHART_COLORS = [
  'var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)',
  'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-chart-6)',
] as const;

/** The EvilCharts palette for one color. */
export const tone = (color: string): ChartConfig[string]['colors'] => ({ light: [color] });

/** Keys for the category chart (radial, one color per segment).
 *
 * EvilCharts builds CSS variable names and SVG gradient ids from keys; spaces and CJK in library or source names cannot enter identifiers,
 * so keys are always `s0`, `s1`..., with display names in `label`. */
export const sliceKey = (index: number) => `s${index}`;

export function sliceConfig(names: string[]): ChartConfig {
  return Object.fromEntries(names.map((label, index) => [
    sliceKey(index), { label, colors: tone(CHART_COLORS[index % CHART_COLORS.length]!) },
  ]));
}
