/* 热力图：统计页的播放时间与口味页的浏览时间共用。
 *
 * Recharts 没有热力图，EvilCharts 的 Recharts 分支也没有，所以格子仍是自绘的 SVG：一格一个
 * `rect`，浓度是 `fill-opacity`，几何全写成属性。外观对齐同页的 EvilCharts 图：颜色只取
 * `chart-*`，指到一格时其余格子淡下去，浮层与柱状、径向图共用 `./chart-tip.tsx` 那一块面；
 * 页头读数也跟着换，键盘聚焦一格时读的是它。取舍见 ADR-0076。
 *
 * 一张图只占一个 Tab 停靠点（漫游焦点，同 EvilCharts 日历热力图 `4c2dd7c9`）：星期 × 小时有
 * 168 格，一格一个停靠点要按上百次 Tab 才走得出这张卡。进卡之后用方向键与 Home/End 挪。 */
import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { CHART_CARD, ChartEmpty, ChartHead } from './chart-card';
import { TIP_SURFACE, TIP_SWATCH, TipRow } from './chart-tip';
import { dayCalendar, hourGrid, WEEKDAYS, type ActivityCounts, type HeatCell } from './heat';

const SIZE = 14;
const STEP = 17;

/** Cell and overlay dot colors. Class names are written out in full so Tailwind can pick them up. */
const TONES = {
  4: { fill: 'fill-chart-4', dot: 'bg-chart-4' },
  5: { fill: 'fill-chart-5', dot: 'bg-chart-5' },
} as const;
export type HeatTone = keyof typeof TONES;

/** Which side the popover aligns to the hovered cell: 10% of width is kept on each side, so edge cells pull the popover inward instead of getting clipped by the card. */
const ANCHOR = {
  start: 'translate-x-0',
  center: '-translate-x-1/2',
  end: '-translate-x-full',
} as const;

function HeatTooltip(
  { cell, series, tone, left, top, anchor }:
  { cell: HeatCell; series: string; tone: HeatTone; left: number; top: number; anchor: keyof typeof ANCHOR },
) {
  return (
    <div aria-hidden
      // oxlint-disable-next-line shadcn/no-inline-styles -- the overlay follows the cell pointed at; the position is a percentage computed at runtime
      style={{ left: `${left}%`, top: `${top}%` }}
      className={`pointer-events-none absolute z-10 -mt-2 -translate-y-full ${TIP_SURFACE} ${ANCHOR[anchor]}`}>
      <div className="font-medium text-foreground">{cell.label}</div>
      <TipRow name={series} value={cell.count} swatch={<i className={`${TIP_SWATCH} ${TONES[tone].dot}`} />} />
    </div>
  );
}

/** Three pieces of readout wording: the unit next to the page header's big number, the overlay row's name, and the quantifier screen readers speak after each cell's count. */
export interface HeatWords { unit: string; series: string; cellUnit: string }

/** A heatmap: one count per cell; hover a cell and the number switches to that cell. */
export function HeatCard(
  { title, words, cells, total, columns, rows, axis, footer, tone }:
  {
    title: string; words: HeatWords; cells: HeatCell[]; total: number;
    columns: number; rows: number; axis?: ReactNode; footer: ReactNode; tone: HeatTone;
  },
) {
  const [shown, setShown] = useState(-1);
  const [stop, setStop] = useState(0);
  const grid = useRef<SVGSVGElement>(null);
  // When data changes and there are fewer cells, the stop falls back to the first cell so the image doesn't end up with no stops at all.
  const focusable = stop < cells.length ? stop : 0;
  const left = axis ? 30 : 0;
  const top = axis ? 18 : 0;
  const width = left + columns * STEP;
  const height = top + rows * STEP;
  const at = (index: number) => ({
    x: left + (index % columns) * STEP, y: top + Math.floor(index / columns) * STEP,
  });
  const cell = cells[shown];
  const pin = cell ? at(shown) : null;
  const share = pin ? (pin.x + SIZE / 2) / width : 0;
  const anchor = share < 0.1 ? 'start' : share > 0.9 ? 'end' : 'center';
  const edge = pin ? { start: pin.x, center: pin.x + SIZE / 2, end: pin.x + SIZE }[anchor] : 0;
  const move = (event: KeyboardEvent<SVGRectElement>, index: number) => {
    const rowStart = index - (index % columns);
    const next = {
      ArrowLeft: index - 1, ArrowRight: index + 1, ArrowUp: index - columns, ArrowDown: index + columns,
      Home: rowStart, End: Math.min(rowStart + columns, cells.length) - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (next < 0 || next >= cells.length) return;
    setStop(next);
    grid.current?.querySelector<SVGRectElement>(`rect[data-cell="${next}"]`)?.focus();
  };
  return (
    <section className={CHART_CARD}>
      <ChartHead title={title} figure={(cell ? cell.count : total).toLocaleString()}
        note={cell ? cell.label : words.unit} />
      {/* The week × hour chart with axes has 24 columns; squeezed below 320 neither the cells nor the labels stay legible, so it scrolls horizontally inside the card;
          the daily chart has only 13 columns and shrinks with the card, so recent days never hide off to the right. */}
      <div className="relative">
        <div className="min-w-0 overflow-x-auto">
          <svg ref={grid} role="img" aria-label={title} onPointerLeave={() => setShown(-1)}
            viewBox={`0 0 ${width} ${height}`} className={axis ? 'block h-auto min-w-80 w-full' : 'block h-auto w-full'}>
            {axis}
            {cells.map((item, index) => {
              const { x, y } = at(index);
              return (
                <rect key={item.key} data-cell={index} tabIndex={index === focusable ? 0 : -1} role="img"
                  aria-label={`${item.label}, ${item.count} ${words.cellUnit}`}
                  x={x} y={y} width={SIZE} height={SIZE} rx={3} fillOpacity={item.share || 1}
                  opacity={shown >= 0 && shown !== index ? 0.4 : 1}
                  className={item.share
                    ? `outline-none transition-opacity duration-200 focus-visible:stroke-border-focus-ring ${TONES[tone].fill}`
                    : 'fill-chart-track outline-none transition-opacity duration-200 focus-visible:stroke-border-focus-ring'}
                  onPointerEnter={() => setShown(index)}
                  onFocus={() => { setShown(index); setStop(index); }} onBlur={() => setShown(-1)}
                  onKeyDown={(event) => move(event, index)} />
              );
            })}
          </svg>
        </div>
        {cell && pin ? (
          <HeatTooltip cell={cell} series={words.series} tone={tone} anchor={anchor}
            left={edge / width * 100} top={pin.y / height * 100} />
        ) : null}
      </div>
      <footer className="flex flex-wrap justify-between gap-3 text-caption-1-regular text-text-secondary">
        {footer}
      </footer>
    </section>
  );
}

/** Week by hour coordinates: weekdays down the left, a clock mark across the top every two hours. */
const HOUR_AXIS = (
  <>
    {WEEKDAYS.map((name, day) => (
      <text key={name} x={0} y={18 + day * STEP + 7} dominantBaseline="middle"
        className="fill-text-secondary text-caption-1-regular">{name}</text>
    ))}
    {Array.from({ length: 24 }, (_, hour) => (hour % 2 ? null : (
      <text key={hour} x={30 + hour * STEP} y={8} dominantBaseline="middle"
        className="fill-text-secondary text-caption-1-regular">{hour}</text>
    )))}
  </>
);

/** Two heatmaps for one activity count: weekday × hour, and the last 91 days.
 *
 * With no usable records, leave a card carrying only the `empty` line. */
export function ActivityHeat(
  { activity, title, dailyTitle, words, tone, empty }:
  {
    activity: ActivityCounts | undefined; title: string; dailyTitle: string;
    words: HeatWords; tone: HeatTone; empty: string;
  },
) {
  const hours = hourGrid(activity);
  const days = dayCalendar(activity);
  if (!days.cells.length) return <ChartEmpty title={title}>{empty}</ChartEmpty>;
  /* The two cards size to their own content heights: weekday × hour has 24 columns with cells half the size of the daily one, and forcing equal height in the same row
     would leave half a card of blank space beneath it. */
  return (
    <div className="inline-grid w-full items-start gap-5 lg:grid-cols-2">
      <HeatCard title={title} words={words} tone={tone}
        cells={hours.cells} total={hours.total} columns={24} rows={7} axis={HOUR_AXIS}
        footer={<><span>Weekday × hour</span><span>{activity?.timezone || 'UTC+08:00'}</span></>} />
      <HeatCard title={dailyTitle} words={words} tone={tone}
        cells={days.cells} total={days.total} columns={13} rows={7}
        footer={<><span>{days.start}</span><span>{days.end}</span></>} />
    </div>
  );
}
