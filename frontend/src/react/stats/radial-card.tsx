/* The library's radial chart: one segment per ring, with the readout following the pointed-at segment.
 *
 * The ring is drawn by EvilCharts' `EvilRadialChart`, colors cycling `chart-1`...`chart-6`, with a full ring being 1.1 times
 * the longest segment (`radialCeiling`). When there are more than six segments the tail is merged (`radialSlices`), non-zero
 * segments always draw at least a small arc (`radialArc`), and the overlay and readouts still show the original numbers.
 * Highlight is React state: pointer enter/leave and clicking each manage one thing: sweeping over is a look, clicking is a
 * pin. The row of cells under the chart is buttons over the same state and reachable by keyboard; upstream's clickable legend
 * has only one selected state and cannot distinguish "a look" from "pinned", so the ring's shape and clicks come through
 * `radialBarProps` to here.
 * Differences registered in `../evilcharts/ORIGIN.md`. */
import { useState } from 'react';
import { Sector, type SectorProps } from 'recharts';

import { fmtSize } from '@peach/legacy/core';

import { EvilRadialChart } from '@/registry/charts/recharts-radial-chart';

import { CHART_CARD, ChartEmpty, sliceConfig, sliceKey } from '../charts/chart-card';
import { ChartTip } from '../charts/chart-tip';
import { SourceMark } from '../settings/section';
import { radialArc, radialBarSize, radialCeiling, radialSlices, type RadialSlice } from './stats';

/** A six-tier chart color cycle. Class names are written out whole so Tailwind can see them. */
const TILE_SWATCH = [
  'bg-chart-1', 'bg-chart-2', 'bg-chart-3',
  'bg-chart-4', 'bg-chart-5', 'bg-chart-6',
];
/* When a segment is pinned, its cell takes that segment's own color: the old `.board-radial-tiles>button[aria-pressed]`
 * was a same-color 10% blend backing plus a 1px same-color inner stroke. In neutral colors, which of the six cells is pinned would be unrecognizable. */
const TILE_PINNED = [
  'aria-pressed:bg-chart-1/10 aria-pressed:ring-chart-1',
  'aria-pressed:bg-chart-2/10 aria-pressed:ring-chart-2',
  'aria-pressed:bg-chart-3/10 aria-pressed:ring-chart-3',
  'aria-pressed:bg-chart-4/10 aria-pressed:ring-chart-4',
  'aria-pressed:bg-chart-5/10 aria-pressed:ring-chart-5',
  'aria-pressed:bg-chart-6/10 aria-pressed:ring-chart-6',
];

export function RadialCard(
  { title, rows, empty, unit = 'videos' }: { title: string; rows: RadialSlice[]; empty: string; unit?: string },
) {
  /* The pinned segment and the pointer-hovered segment are recorded separately: hovering must be able to return to the pinned segment; merging them into one state
     would erase the user's clicked selection the moment the mouse leaves. */
  const [pinned, setPinned] = useState(-1);
  const [hovered, setHovered] = useState(-1);
  const slices = radialSlices(rows);
  if (!slices.length) return <ChartEmpty title={title}>{empty}</ChartEmpty>;

  const focus = hovered >= 0 ? hovered : pinned;
  const total = slices.reduce((sum, row) => sum + row.value, 0);
  const shown = slices[focus];
  const toggle = (index: number) => setPinned((at) => (at === index ? -1 : index));
  const ceiling = radialCeiling(slices.map((row) => row.value));
  /* The raw number goes in the `count` column, not `value`: when Recharts computes a sector it spreads this row out and writes `value` again, filling
     the drawing column (`arc`), so the overlay would read an inflated arc length. */
  const data = slices.map((row, index) => (
    { slice: sliceKey(index), count: row.value, arc: radialArc(row.value, ceiling) }));

  return (
    <section className={CHART_CARD}>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <span className="flex min-w-0 flex-col gap-1">
          <h3 className="flex items-center gap-1.5 text-title-2-medium wrap-anywhere text-text-primary">
            {shown?.mark ? <SourceMark mark={shown.mark} /> : null}{shown ? shown.name : title}
          </h3>
          <b className="text-display-4-medium tabular-nums text-text-primary">
            {(shown ? shown.value : total).toLocaleString()}
          </b>
        </span>
        <small className="text-caption-1-regular text-text-secondary">{unit}</small>
      </header>
      <div role="img" aria-label={title} onPointerLeave={() => setHovered(-1)}>
        <EvilRadialChart data={data} nameKey="slice" config={sliceConfig(slices.map((row) => row.name))}
          max={ceiling} innerRadius="22%"
          className="aspect-auto h-75 max-sm:h-65">
          <EvilRadialChart.RadialBar dataKey="arc" barSize={radialBarSize(slices.length)} radialBarProps={{
            shape: (props: SectorProps & { index?: number }) => (
              <Sector {...props}
                opacity={focus >= 0 && focus !== props.index ? 0.3 : 1}
                className="cursor-pointer transition-opacity duration-200" />
            ),
            onClick: (_entry: unknown, index: number) => toggle(index),
            onMouseEnter: (_entry: unknown, index: number) => setHovered(index),
          }} />
          <ChartTip nameKey="slice" valueKey="count" hideLabel />
        </EvilRadialChart>
      </div>
      <div className="inline-grid w-full grid-cols-3 gap-2 max-sm:grid-cols-2">
        {slices.map((row, index) => (
          <button key={sliceKey(index)} type="button" aria-pressed={pinned === index}
            onClick={() => toggle(index)}
            onPointerEnter={() => setHovered(index)} onPointerLeave={() => setHovered(-1)}
            onFocus={() => setHovered(index)} onBlur={() => setHovered(-1)}
            className={`flex min-w-0 cursor-pointer flex-col items-start gap-1 rounded-xl bg-background-tertiary-default p-2.5 text-left outline-none aria-pressed:ring-1 aria-pressed:ring-inset focus-visible:ring-2 focus-visible:ring-border-focus-ring ${TILE_PINNED[index % 6]}`}>
            {/* When the name wraps to several lines, the color chip aligns with the first line instead of floating between them. */}
            <span className="flex min-w-0 max-w-full items-start gap-1.5 text-caption-1-regular text-text-secondary">
              <i aria-hidden className={`mt-0.5 size-3 shrink-0 rounded-sm ${TILE_SWATCH[index % 6]}`} />
              <span className="inline-flex min-w-0 items-start gap-1.5 wrap-anywhere">
                {row.mark ? <SourceMark mark={row.mark} /> : null}{row.name}
              </span>
            </span>
            <b className="text-title-2-medium tabular-nums text-text-primary">{row.value.toLocaleString()}</b>
            {row.bytes != null ? <small className="text-caption-1-regular text-text-secondary">{fmtSize(row.bytes)}</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
