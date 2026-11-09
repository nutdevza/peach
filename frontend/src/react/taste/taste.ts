/* The taste page's data contract, polling cadence and pure reductions.
 *
 * The four endpoints are each declared once in `frontend/src`, here only (`tests/test_frontend_build.py` watches this).
 *
 * Keys carry the analysis window: `['taste', window]`. One machine's seven days and all time are two truths; merged into one
 * key, switching windows would overwrite the previous copy and switching back would ask all over again. On window switches,
 * `keepPreviousData` keeps the previous copy instead of falling back to a skeleton: this screen's structure does not change,
 * only the numbers do. No `staleTime`: the server already caches one layer per `taste:{window}`, and another layer in front
 * would produce "just imported, page still shows pre-import data".
 *
 * The refresh job is another truth with its cadence driven by the background, so it gets its own key
 * (`['taste','refresh']`). */
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { clipGraphemes } from '@peach/legacy/core';

import { apiGet, apiSend, ApiError } from '../../api';
import type { BarRow } from '../charts/bar-card';
import type { ActivityCounts } from '../charts/heat';
import { queryClient } from '../query';
import { playedFor } from '../stats/stats';

export const TASTE_URL = '/api/taste';
export const TASTE_REFRESH_URL = '/api/taste/refresh';
export const TASTE_IMPORT_URL = '/api/taste/import';
export const TASTE_SOURCE_URL = '/api/taste/source';

/** A dashboard's key, with its analytics scope. */
export const tasteKey = (window: string) => ['taste', window] as const;
/** The background task that reads view history. */
export const TASTE_REFRESH_KEY = ['taste', 'refresh'] as const;

/** Analysis window. The values are exactly the ones `/api/taste?window=` accepts. */
export const TASTE_WINDOWS = [
  ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'],
  ['365d', 'Last year'], ['all', 'All time'],
] as const;

export const DEFAULT_WINDOW = 'all';

/** One row in the ranking. `entity_id` and `has_avatar` decide which tier of image to draw, and `peach_items` decides whether clicking does anything. */
export interface RankRow {
  name: string;
  score?: number;
  visits?: number;
  web_visits?: number;
  web_bookmarks?: number;
  peach_score?: number;
  peach_items?: number;
  entity_id?: number | null;
  has_image?: boolean;
  image_version?: string;
  avatar_focus?: unknown;
  has_avatar?: boolean;
  avatar_stand_in?: boolean;
  representative_asset_id?: number | null;
  source_domain?: string | null;
}

/** Rankings aggregated by dimension. Names align with `taste_history.build_taste_dashboard`. */
export interface TasteRankings {
  browser_tags?: RankRow[];
  browser_creators?: RankRow[];
  browser_performers?: RankRow[];
  browser_categories?: RankRow[];
  domains?: RankRow[];
  peach_tags?: RankRow[];
  peach_creators?: RankRow[];
  peach_performers?: RankRow[];
  peach_studios?: RankRow[];
  peach_series?: RankRow[];
}

export interface TasteSummary {
  history_visits?: number;
  bookmarks?: number;
  history_sources?: number;
  peach_items?: number;
  peach_seconds?: number;
  liked?: number;
  disliked?: number;
  range_start?: string | null;
  range_end?: string | null;
}

export interface TasteCoverage {
  tagged?: number; identified?: number; untagged?: number; unidentified?: number;
}

/** One device's viewing history. `source_key` is 64 hex characters and is exactly what gets handed back on removal. */
export interface TasteSource {
  source_key: string; browser: string; profile: string; host: string; visits?: number; bookmarks?: number;
}

export interface TasteAnalysis {
  headline?: string;
  confidence?: { level?: string; label?: string };
  points?: { label: string; text: string }[];
  explore?: { tag: string; title: string; detail: string }[];
  next_steps?: { route: string; title: string; detail: string }[];
}

export interface CreatorFlow { source: string; target: string; value: number }

/** The `/api/taste` response. Fields align with `web_stats.q_taste`. */
export interface TasteData {
  browsers?: BrowserSource[];
  summary?: TasteSummary;
  coverage?: TasteCoverage;
  rankings?: TasteRankings;
  gaps?: RankRow[];
  sources?: TasteSource[];
  analysis?: TasteAnalysis;
  activity?: ActivityCounts;
  creator_flows?: CreatorFlow[];
  storage?: { exports?: number; bytes?: number };
  window?: string;
  updated_at?: string | null;
  /** The moment this dashboard was computed at. */
  computed_at?: string | null;
  /** The server is recomputing in the background; this copy is the previous result. */
  stale?: boolean;
  /** Appears together with `stale`: this recomputation failed and the server stopped computing for now, waiting for "retry now". */
  error?: string;
}

/** The board re-asks this often while a background recompute runs, then swaps in the new results once done. */
export const STALE_POLL_MS = 2_000;

/** The polling interval while `stale`: asks only while the server says "this is outdated", and stops once the computation finishes or fails. */
export const tasteRefetchInterval = (data: TasteData | undefined): number | false =>
  (data?.stale && !data.error ? STALE_POLL_MS : false);

/** Snapshot time, precise to the minute: a recalc finishes within seconds, so a date alone cannot tell snapshots apart. */
export const tasteTime = (value: string | null | undefined): string =>
  (value ? new Date(value).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—');

export interface BrowserSource {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  available: boolean;
  profiles: number;
  source_keys?: string[];
}

export const configureTasteBrowser = (body: { operation: 'add' | 'disable' | 'enable' | 'delete_browser'; name?: string; path?: string; id?: string }, window: string) =>
  apiSend<{ dashboard: TasteData }>(TASTE_SOURCE_URL, { ...body, window });

/** Snapshot of the history-read run. `status` is `idle` when it has never run. */
export interface TasteJob {
  status: string;
  job_id?: string;
  stage?: string;
  message?: string;
  checked?: number;
  total?: number | null;
  error?: string;
  warnings?: string[];
}

/** `retry` makes the server skip the post-failure wait and recompute once right away. */
export const fetchTaste = (window: string, signal?: AbortSignal, retry = false) =>
  apiGet<TasteData>(`${TASTE_URL}?window=${window}${retry ? '&retry=1' : ''}`, signal);

export const fetchTasteJob = (signal?: AbortSignal) =>
  apiGet<TasteJob>(TASTE_REFRESH_URL, signal);

/** First screen: paints only after the fetch completes. On abort it throws `AbortError` back to the mounter, which gives up on this attempt. */
export async function prefetchTaste(window: string, signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: tasteKey(window), queryFn: () => fetchTaste(window, signal),
  });
}

/** Start a viewing history read. The reply is a task snapshot; the cadence is still governed by `TASTE_REFRESH_KEY`. */
export const startTasteRefresh = (window: string) =>
  apiSend<TasteJob>(TASTE_REFRESH_URL, { window, background: true });

/** Remove one device's viewing history. The server returns the new dashboard for this scope along with it, so just swap it into the cache. */
export const removeTasteSource = (sourceKey: string, window: string) =>
  apiSend<{ removed: number; dashboard: TasteData }>(
    TASTE_SOURCE_URL, { operation: 'remove', source_key: sourceKey, window });

/** Import a private export.
 *
 * The file goes as the request body verbatim, with the name in `X-Peach-Filename`: multipart would mean the server gains another
 * parser, while here there is one file and one name. The server returns the "all time" dashboard copy. */
export async function importTasteExport(file: File): Promise<{ dashboard: TasteData }> {
  const response = await fetch(TASTE_IMPORT_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Peach-Filename': encodeURIComponent(file.name),
    },
    body: file,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch { /* The failure response is not necessarily JSON; fall back on status codes below */ }
  if (!response.ok) {
    const reason = (payload as { error?: string } | null)?.error;
    throw new ApiError(reason || `Import failed (${response.status})`, response.status, payload);
  }
  return payload as { dashboard: TasteData };
}

/** Polls every ten seconds while the read is idle; this run may have started from another page or the previous session. */
export const IDLE_POLL_MS = 10_000;

export const tasteDate = (value: string | null | undefined): string =>
  (value ? new Date(value).toLocaleDateString('zh-CN') : '—');

/** The footnote on the viewing history stat card: the data sources, plus the date range the records cover; when neither end has a date, no range is shown. */
export function historySpan(summary: TasteSummary): string {
  const sources = `${Number(summary.history_sources || 0).toLocaleString()} data sources`;
  if (!summary.range_start && !summary.range_end) return sources;
  const sameYear = summary.range_start?.slice(0, 4) === summary.range_end?.slice(0, 4);
  const date = (value: string | null | undefined) => value && sameYear
    ? new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : tasteDate(value);
  return `${sources} · ${date(summary.range_start)}–${date(summary.range_end)}`;
}

/** Total duration; same basis as the stats page. */
export const tasteHours = playedFor;

/** The 'taste dimensions' readout: only dimensions with a positive score count, the same set drawn in the radar and the ranking bars. */
export const tasteDimensions = (rows: RankRow[]): RankRow[] =>
  rows.filter((row) => Number.isFinite(Number(row.score)) && Number(row.score) > 0)
    .sort((a, b) => Number(b.score) - Number(a.score));

/** A row's strength on this board. The browsing side uses visit counts, the Peach side uses scores, both degrading to item counts. */
export const rankStrength = (row: RankRow): number =>
  Number(row.web_visits ?? row.score ?? row.visits ?? row.peach_items ?? 0);

/** The supplement under a ranking row. With evidence on both sides it shows side by side; with one side only, read that side's number. */
export function rankDetail(row: RankRow): string {
  if (row.web_visits == null && !row.web_bookmarks) return Number(row.score || row.visits || 0).toLocaleString();
  const parts: string[] = [];
  const bookmarks = Number(row.web_bookmarks || 0);
  const visits = Number(row.web_visits ?? row.visits ?? 0) - bookmarks;
  if (visits > 0) parts.push(`Browsed ${visits.toLocaleString()}`);
  if (bookmarks) parts.push(`Bookmarks ${bookmarks.toLocaleString()}`);
  if (row.peach_items) parts.push(`Peach ${Number(row.peach_items).toLocaleString()}`);
  return parts.join(' · ');
}

/** A bar's length as a percentage. The longest bar fills the width; an empty board never divides by zero. */
export function rankShares(rows: RankRow[]): number[] {
  const strengths = rows.map(rankStrength);
  const ceiling = Math.max(1, ...strengths);
  return strengths.map((value) => Math.max(0, Math.min(100, value / ceiling * 100)));
}

/** The top `limit` dimensions by score, descending. Rows scoring 0 or non-finite are filtered out first. */
export const topScores = (rows: RankRow[], limit: number): BarRow[] =>
  rows.filter((row) => Number.isFinite(Number(row.score)) && Number(row.score) > 0)
    .map((row) => ({ name: row.name, value: Number(row.score) }))
    .sort((a, b) => b.value - a.value).slice(0, limit);

/** Fewer than three dimensions cannot form a face, so nothing is drawn below three points. At most the top six are taken; beyond that the labels cover each other up. */
export const RADAR_MIN = 3;
export const RADAR_MAX = 6;

/** The radar chart's vertices. */
export function radarRows(rows: RankRow[]): BarRow[] {
  const values = topScores(rows, RADAR_MAX);
  return values.length < RADAR_MIN ? [] : values;
}

/** At most eight bars in the ranking. */
export const RANK_MAX = 8;

/** A node in the sankey diagram. `side` decides whether it lands left or right, and which way its text flows. */
export interface FlowNode {
  id: string; name: string; side: 'source' | 'target'; index: number;
  x: number; y: number; height: number; value: number; share: number; color: number;
}
/** One stream. `d` is the Bezier path computed by d3. */
export interface FlowLink {
  key: string; d: string; width: number; color: number;
  source: number; target: number; value: number; label: string;
}
export interface FlowGraph { nodes: FlowNode[]; links: FlowLink[]; total: number; height: number }

/** Node bar width and canvas: a margin on each side for text, viewport 720 wide, height follows the node count, minimum 435. */
export const FLOW_NODE_WIDTH = 10;
export const FLOW_VIEWBOX = { width: 720, height: 435 } as const;
export const FLOW_LABEL_X = { source: 145, target: 545 } as const;

/** Maximum nodes per side. Beyond that the ones with the most leads stay, and the rest merge into an "other N ..." node. */
export const FLOW_SIDE_MAX = 12;

/** The gap between adjacent nodes, i.e. the minimum distance between node centers: a node's name and its count line reach about 7 above and 22 below center,
 *  so 30 apart keeps small nodes from crowding and keeps the two text lines off the next node. */
const FLOW_ROW = 30;

/** Height left for the nodes themselves, apart from the gaps, distributed by thread count. */
const FLOW_NODE_ROOM = 240;

/** When one side has more than `FLOW_SIDE_MAX` names, the names with fewer clues map onto one merged node. */
function foldSide(flows: CreatorFlow[], side: 'source' | 'target', rest: (count: number) => string) {
  const totals = new Map<string, number>();
  for (const row of flows) totals.set(row[side], (totals.get(row[side]) ?? 0) + row.value);
  if (totals.size <= FLOW_SIDE_MAX) return (name: string) => name;
  const ranked = [...totals].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const kept = new Set(ranked.slice(0, FLOW_SIDE_MAX - 1));
  const merged = rest(ranked.length - kept.size);
  return (name: string) => (kept.has(name) ? name : merged);
}

/** A flow layout from source sites to creators. Flows with a value of 0 or a missing end are filtered out first, and `null` is returned when nothing is left. */
export function flowGraph(rows: CreatorFlow[] = []): FlowGraph | null {
  const valid = rows.filter((row) =>
    row.source && row.target && Number.isFinite(row.value) && row.value > 0);
  if (!valid.length) return null;
  const sourceOf = foldSide(valid, 'source', (count) => `${count.toLocaleString()} other sites`);
  const targetOf = foldSide(valid, 'target', (count) => `${count.toLocaleString()} other creators`);
  const folded = new Map<string, CreatorFlow>();
  for (const row of valid) {
    const source = sourceOf(row.source);
    const target = targetOf(row.target);
    const key = JSON.stringify([source, target]);
    const seen = folded.get(key);
    if (seen) seen.value += row.value;
    else folded.set(key, { source, target, value: row.value });
  }
  const flows = [...folded.values()];
  const sources = [...new Set(flows.map((row) => row.source))];
  const targets = [...new Set(flows.map((row) => row.target))];
  const rowsOnSide = Math.max(sources.length, targets.length);
  const bottom = Math.max(404, 16 + (rowsOnSide - 1) * FLOW_ROW + FLOW_NODE_ROOM);
  const graph = sankey<{ id: string; name: string; side: 'source' | 'target' }, object>()
    .nodeId((node) => node.id).nodeWidth(FLOW_NODE_WIDTH).nodePadding(FLOW_ROW)
    .extent([[155, 16], [535, bottom]])({
      nodes: [
        ...sources.map((name) => ({ id: `source:${name}`, name, side: 'source' as const })),
        ...targets.map((name) => ({ id: `target:${name}`, name, side: 'target' as const })),
      ],
      links: flows.map((row) => (
        { source: `source:${row.source}`, target: `target:${row.target}`, value: row.value })),
    });
  const total = flows.reduce((sum, row) => sum + row.value, 0);
  const path = sankeyLinkHorizontal();
  type Node = typeof graph.nodes[number];
  const nodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id, name: node.name, side: node.side, index: node.index ?? 0,
    x: node.x0 ?? 0, y: node.y0 ?? 0, height: Math.max(1, (node.y1 ?? 0) - (node.y0 ?? 0)),
    value: node.value ?? 0, share: (node.value ?? 0) / total * 100,
    color: sources.indexOf(node.name) % 6,
  }));
  const links: FlowLink[] = graph.links.map((link, at) => {
    const from = link.source as Node;
    const to = link.target as Node;
    return {
      key: `${from.id}->${to.id}:${at}`, d: path(link) || '',
      width: Math.max(0.5, link.width || 0), color: sources.indexOf(from.name) % 6,
      source: from.index ?? 0, target: to.index ?? 0, value: link.value,
      label: `${from.name} → ${to.name}`,
    };
  });
  return { nodes, links, total, height: bottom + FLOW_VIEWBOX.height - 404 };
}

/** Truncates node names that are too long. A cell in the diagram is only this wide; the full name lives in `aria-label` and `<title>`. */
export const flowLabel = (name: string): string => clipGraphemes(name, 17);
