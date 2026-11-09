/* Distribution bar chart: one bar per category, drawn as EvilCharts' `EvilBarChart`.
 *
 * The header's big number is the categories' sum. Each bar's value is labeled at the bar's end and the value axis is not
 * drawn: when categories differ by one or two orders of magnitude, short bars cannot be read off a scale. Bars grow one by
 * one via Motion, drawing the final state directly when the system has reduce motion on (`MotionConfig` in `../entry.tsx`);
 * the hover overlay is `./chart-tip.tsx`. */
import { EvilBarChart } from '@/registry/charts/recharts-bar-chart';

import { CategoryTick, categoryAxisWidth, CHART_CARD, ChartEmpty, ChartHead, tone } from './chart-card';
import { ChartTip } from './chart-tip';

/** One bar: the display name and its count. Written as a type alias so EvilCharts' `data` can accept it as a `Record`. */
export type BarRow = { name: string; value: number };

/** The value axis keeps 20% headroom so the number at the end of the longest bar is not clipped by the chart frame. */
export const BAR_DOMAIN: [number, (max: number) => number] = [0, (max) => max * 1.2];

/** Space reserved to the right of horizontal bars for the bar-end number, in pixels: the longest bar's number lands inside this strip, not clipped by the chart frame. */
export const BAR_LABEL_ROOM = 56;

/** The bar-end number: values past 100k read in ten-thousand and hundred-million units so the strip at the bar end fits; the exact figure is in the hover popover. */
export function shortCount(value: number): string {
  const abs = Math.abs(value);
  const scaled = (unit: number, name: string) => {
    const figure = value / unit;
    return `${figure.toLocaleString(undefined, { maximumFractionDigits: Math.abs(figure) < 100 ? 1 : 0 })}${name}`;
  };
  if (abs >= 1e8) return scaled(1e8, 'B');
  if (abs >= 1e5) return scaled(1e4, 'K');
  return value.toLocaleString();
}

/** The bar-end number. `position` follows the bar's orientation: vertical bars label the top, horizontal bars the right end. */
export const barLabel = (position: 'top' | 'right') => ({
  position,
  className: 'fill-text-secondary',
  formatter: (value: unknown) => shortCount(Number(value)),
});

/** The overlay row's name: `series` is what this set of numbers is called ("videos", "titles"), not a unit.
 *  When not a single bar has a count, the card stays and the chart's place takes the `empty` sentence. */
export function BarCard(
  { title, unit, series, rows, color, empty, layout = 'vertical' }:
  {
    title: string; unit: string; series: string; rows: BarRow[]; color: string; empty: string;
    layout?: 'vertical' | 'horizontal';
  },
) {
  const data = rows
    .filter((row) => Number.isFinite(row.value) && row.value >= 0)
    .map((row) => ({ name: row.name, value: row.value }));
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (!total) return <ChartEmpty title={title}>{empty}</ChartEmpty>;
  const horizontal = layout === 'horizontal';
  /* The chart container has `flex-1` built in; inside a card's flex column it would size from 0 and crush `h-*` to zero height, so switch to `flex-none`.
     The category axis uses `interval={0}`: every bar must have a name, and Recharts by default hides every other crowded name;
     names that do not fit are truncated by `CategoryTick`. */
  return (
    <section className={CHART_CARD} aria-label={title}>
      <ChartHead title={title} figure={total.toLocaleString()} note={unit} />
      <EvilBarChart data={data} config={{ value: { label: series, colors: tone(color) } }}
        layout={layout} barRadius={4}
        chartProps={horizontal ? { margin: { top: 5, right: BAR_LABEL_ROOM, bottom: 5, left: 5 } } : undefined}
        className={horizontal
          ? 'aspect-auto h-64 flex-none text-text-secondary'
          : 'aspect-auto h-56 flex-none text-text-secondary'}>
        <EvilBarChart.Grid />
        {horizontal
          ? <EvilBarChart.YAxis dataKey="name" interval={0} tick={<CategoryTick along="y" />}
              width={categoryAxisWidth(data.map((row) => row.name))} />
          : <EvilBarChart.XAxis dataKey="name" interval={0} tick={<CategoryTick along="x" />} />}
        {horizontal
          ? <EvilBarChart.XAxis hide domain={BAR_DOMAIN} />
          : <EvilBarChart.YAxis hide domain={BAR_DOMAIN} />}
        <EvilBarChart.Bar dataKey="value" enableHoverHighlight
          barProps={{ dataKey: 'value', label: barLabel(horizontal ? 'right' : 'top') }} />
        <ChartTip />
      </EvilBarChart>
    </section>
  );
}
