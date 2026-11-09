/* The taste page's three charts: the taste dimensions' radar and ranking bars, and the creator-leads flow diagram. The two
 * browsing-activity heatmaps share `../charts/heat-card.tsx` with the stats page.
 *
 * Radar and ranking bars are drawn by EvilCharts, the hover overlay is `../charts/chart-tip.tsx`, differences registered in
 * `../evilcharts/ORIGIN.md`. The radar's radius is a square-root scale while the overlay still reads raw counts. The flow
 * diagram keeps `d3-sankey` self-drawn (ADR-0076): geometry is written as attributes, flow thickness is `stroke-width`, and
 * colors only take BoardUI's `chart-*` tiers; pointing at a flow or node swaps the readout to its numbers via React state,
 * returning to totals on pointer leave or focus loss. Differences registered in `../boardui/ORIGIN.md`. */
import { useState } from 'react';
import { Text } from 'recharts';

import { EvilBarChart } from '@/registry/charts/recharts-bar-chart';
import { EvilRadarChart } from '@/registry/charts/recharts-radar-chart';

import { BAR_DOMAIN, BAR_LABEL_ROOM, barLabel } from '../charts/bar-card';
import {
  CategoryTick, categoryAxisWidth, CHART_CARD, CHART_COLORS, ChartHead, fitLabel, tone,
} from '../charts/chart-card';
import { ChartTip } from '../charts/chart-tip';
import {
  flowGraph, flowLabel, FLOW_LABEL_X, FLOW_NODE_WIDTH, FLOW_VIEWBOX, radarRows, RANK_MAX, topScores,
  type CreatorFlow, type RankRow,
} from './taste';

/** Dimension names outside the radar's vertices. Left and right names extend outward, with width from vertex to chart edge; top and bottom are centered,
 *  with twice the room, vertex to the nearer edge. Truncate when they do not fit; the full name lives in `<title>`, the tooltip and the accessible name. */
function RadarTick(
  props: { x?: number; cx?: number; textAnchor?: string; payload?: { value?: unknown } } & Record<string, unknown>,
) {
  const { x = 0, cx, textAnchor, payload, ...rest } = props;
  const name = String(payload?.value ?? '');
  const width = typeof cx === 'number' ? cx * 2 : 0;
  const room = !width ? 56
    : textAnchor === 'start' ? width - x
    : textAnchor === 'end' ? x
    : 2 * Math.min(x, width - x);
  return (
    <g>
      <title>{name}</title>
      <Text {...(rest as object)} x={x} textAnchor={textAnchor as 'start' | 'middle' | 'end' | undefined}
        fill="currentColor" fontSize={12}>{fitLabel(name, room - 4)}</Text>
    </g>
  );
}

/** A six-tier chart color cycle. Class names are written out whole so Tailwind can see them. */
const FLOW_STROKE = [
  'stroke-chart-1', 'stroke-chart-2', 'stroke-chart-3',
  'stroke-chart-4', 'stroke-chart-5', 'stroke-chart-6',
];
const FLOW_FILL = [
  'fill-chart-1', 'fill-chart-2', 'fill-chart-3',
  'fill-chart-4', 'fill-chart-5', 'fill-chart-6',
];

/** The series for the two taste-dimension charts: how many times each tag under one dimension was hit. Colors follow the taste page stat cards' `chart-4`. */
const DIMENSION_CONFIG = { value: { label: 'Tag occurrence counts', colors: tone(CHART_COLORS[3]) } };

/** The ranking bars' minimum height comes from the bar count, 32 each: on narrow screens where the ranking bars own a row, or with fewer than three dimensions and no radar,
 *  this is exactly its height. With a radar beside, the whole block stretches to the radar column's equal height, and the extra height spreads the bars apart.
 *  The class name is written as a full string so Tailwind can see it. */
const RANK_HEIGHT = ['min-h-24', 'min-h-24', 'min-h-24', 'min-h-32', 'min-h-40', 'min-h-48', 'min-h-52', 'min-h-60', 'min-h-64'];

/** One bar's thickness cap, the same as the thickness a 32px cell leaves by default: stretching the chart taller does not thicken the bars. */
const RANK_BAR_SIZE = 26;

/** The radar chart plots the `radius` column, with names and colors matching the other two taste-dimension charts. */
const RADAR_CONFIG = { radius: DIMENSION_CONFIG.value };

/** The radar chart's radial scale, and the chart's only transform: `sqrt(count / max)`, the largest dimension landing on the outer ring (1).
 * The first dimension is often ten times the rest; a linear radius would crush the shape into a spike, unreadable for the secondary dimensions; the square root
 * lets them spread out. Raw counts stay in the `value` column for the tooltip; the numbers themselves are given by the ranking bars beside. */
const radarRadius = (value: number, top: number) => Math.sqrt(value / top);

/** Radar chart of the main taste dimensions, drawn with EvilCharts' `EvilRadarChart`. Below three dimensions no surface can form, and the whole block does not appear. */
export function TasteRadar({ rows, label }: { rows: RankRow[]; label: string }) {
  const points = radarRows(rows);
  if (!points.length) return null;
  const top = points[0]!.value;
  const data = points.map((row) => ({ ...row, radius: radarRadius(row.value, top) }));
  return (
    <div role="img" aria-label={`${label}: ${data.map((row) => row.name).join(', ')}`}>
      {/* Radius compressed to 60%: dimension names sit outside the vertices, and seven- or eight-character names must fit in a narrow column without being clipped by the chart frame. */}
      <EvilRadarChart data={data} config={RADAR_CONFIG} chartProps={{ outerRadius: '58%' }}
        className="aspect-auto h-70 text-text-secondary">
        <EvilRadarChart.PolarGrid />
        <EvilRadarChart.PolarAngleAxis dataKey="name" tick={<RadarTick />} />
        {/* The radius axis is pinned to 0 through 1: the outer ring is the largest dimension, so Recharts is not allowed to round up and leave an empty ring. The grid rings follow
            this axis's ticks; Recharts only takes integer ticks by default, so decimals must be allowed to get four evenly spaced rings. */}
        <EvilRadarChart.PolarRadiusAxis domain={[0, 1]} allowDecimals tick={false} />
        <EvilRadarChart.Radar dataKey="radius" />
        <ChartTip valueKey="value" />
      </EvilRadarChart>
    </div>
  );
}

/** Taste dimension ranking: one horizontal bar per dimension, drawn as EvilCharts' `EvilBarChart`, with the number at the bar's tail.
 *  The whole block fills the parent-given height inside a vertical flex; the chart container itself is `flex-1`. The dimension-name column has a width cap:
 *  however long the name, it truncates rather than squeezing the bars away. */
export function RankedBars({ rows, label }: { rows: RankRow[]; label: string }) {
  const data = topScores(rows, RANK_MAX);
  if (!data.length) return null;
  return (
    <section aria-label={label} className={`flex grow flex-col ${RANK_HEIGHT[data.length]}`}>
      <EvilBarChart data={data} config={DIMENSION_CONFIG} layout="horizontal" barRadius={4}
        chartProps={{ maxBarSize: RANK_BAR_SIZE, margin: { top: 5, right: BAR_LABEL_ROOM, bottom: 5, left: 5 } }}
        className="aspect-auto text-text-secondary">
        <EvilBarChart.YAxis dataKey="name" interval={0} tick={<CategoryTick along="y" />}
          width={categoryAxisWidth(data.map((row) => row.name))} />
        <EvilBarChart.XAxis hide domain={BAR_DOMAIN} />
        <EvilBarChart.Bar dataKey="value" enableHoverHighlight
          barProps={{ dataKey: 'value', label: barLabel('right') }} />
        <ChartTip />
      </EvilBarChart>
    </section>
  );
}

/** The flow of sources behind a creator's trail. Point at one flow or node and the number switches to it. */
export function CreatorSankey({ flows }: { flows: CreatorFlow[] | undefined }) {
  const [shown, setShown] = useState<{ value: number; label: string; node: number | null } | null>(null);
  const graph = flowGraph(flows);
  if (!graph) return null;
  const node = shown?.node ?? null;
  /** Whether this flow should fade out right now. For a node it means keeping the flows at both ends; for a flow it means keeping only itself. */
  const linkLit = (link: typeof graph.links[number], key: string) =>
    (!shown ? true
      : node !== null ? link.source === node || link.target === node
      : shown.label === key);
  return (
    <section className={CHART_CARD}>
      <ChartHead title="Creator clue sources" figure={(shown ? shown.value : graph.total).toLocaleString()}
        note={shown ? shown.label : 'clues'} />
      {/* Each side reserves a stretch for node names, and below a 640 canvas the text shrinks past readability: on phones it becomes one flow column ordered by clue count. */}
      <ol aria-label="Source sites and creator leads" className="flex flex-col sm:hidden">
        {[...graph.links].sort((a, b) => b.value - a.value).map((link) => (
          <li key={link.key}
            className="flex items-baseline justify-between gap-3 border-b border-separator-border py-2 text-body-2-regular text-text-primary last:border-b-0">
            <span className="min-w-0 wrap-anywhere">{link.label}</span>
            <b className="shrink-0 tabular-nums">{link.value.toLocaleString()}</b>
          </li>
        ))}
      </ol>
      <div className="min-w-0 max-sm:hidden">
        <svg viewBox={`0 0 ${FLOW_VIEWBOX.width} ${graph.height}`} fill="none"
          role="img" aria-label="Source sites and creator leads"
          className="block h-auto w-full" onPointerLeave={() => setShown(null)}>
          <g>
            {graph.links.map((link) => (
              <path key={link.key} d={link.d} strokeWidth={link.width} tabIndex={0} role="img"
                aria-label={`${link.label}: ${link.value} leads`}
                fillOpacity={0} strokeOpacity={linkLit(link, link.label) ? 0.55 : 0.08}
                className={`outline-none transition-opacity ${FLOW_STROKE[link.color]}`}
                onPointerEnter={() => setShown({ value: link.value, label: link.label, node: null })}
                onFocus={() => setShown({ value: link.value, label: link.label, node: null })}
                onBlur={() => setShown(null)} />
            ))}
          </g>
          <g>
            {graph.nodes.map((item) => (
              <g key={item.id} tabIndex={0} role="img"
                aria-label={`${item.name}: ${item.value} leads`}
                className="outline-none focus-visible:opacity-100"
                onPointerEnter={() => setShown(
                  { value: item.value, label: item.name, node: item.index })}
                onFocus={() => setShown({ value: item.value, label: item.name, node: item.index })}
                onBlur={() => setShown(null)}>
                <rect x={item.x} y={item.y} width={FLOW_NODE_WIDTH} height={item.height} rx={5}
                  className={item.side === 'source' ? FLOW_FILL[item.color] : 'fill-text-secondary'} />
                <text x={FLOW_LABEL_X[item.side]} y={item.y + item.height / 2}
                  textAnchor={item.side === 'source' ? 'end' : 'start'} dominantBaseline="middle"
                  className="fill-text-secondary text-caption-1-regular">
                  {flowLabel(item.name)}
                  <tspan x={FLOW_LABEL_X[item.side]} dy={15}>
                    {item.side === 'source'
                      ? item.value.toLocaleString()
                      : `${item.share.toFixed(1)}%`}
                  </tspan>
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <footer className="flex justify-between gap-3 text-caption-1-regular text-text-secondary max-sm:hidden">
        <span>Source sites</span><span>Creators · lead share</span>
      </footer>
    </section>
  );
}
