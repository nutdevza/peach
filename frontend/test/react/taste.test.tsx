/* The taste page's behavior: how the two evidence sets switch, whether the screen survives window changes, when the
 * background run counts, which path import and removal each take, and what picking a rank hands back.
 *
 * Looks (the radar's grid, heat cells' density tiers) are design decisions asserted by `frontend/e2e/design-*.test.ts` reading
 * `getComputedStyle`; this file covers only structure, text and requests. Recharts cannot measure container sizes here, so
 * with the whole page mounted the radar and bars draw nothing; their look is verified from names and pure functions outside,
 * and the radar's scale case mounts this chart alone with `ResizeObserver` removed so it draws at its initial size. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import * as legacyUi from '@peach/legacy/ui';

import { JOB_RUNNING_POLL_MS } from '../../src/react/background-job';
import { queryClient } from '../../src/react/query';
import {
  DEFAULT_WINDOW, FLOW_VIEWBOX, flowGraph, historySpan, prefetchTaste, radarRows, RANK_MAX, rankDetail,
  STALE_POLL_MS, TASTE_IMPORT_URL, TASTE_REFRESH_URL, TASTE_SOURCE_URL, TASTE_URL, tasteDimensions, topScores,
  type TasteData, type TasteJob,
} from '../../src/react/taste/taste';
import { TasteRadar } from '../../src/react/taste/charts';
import { TastePage } from '../../src/react/taste/taste-page';

import { choose, click, mount, mountRoot, settle } from './render';

// The client is a module-level singleton (all React roots share one); without clearing between test cases they feed each other data.
afterEach(() => queryClient.clear());

/* Query dispatches updates through the real `setTimeout(0)` it captured itself, which the fake clock cannot advance: after advancing the clock
   the assertions still see the previous frame's DOM. The case dispatches immediately instead. */
notifyManager.setScheduler((notify) => notify());

const payload = (overrides: Partial<TasteData> = {}): TasteData => ({
  summary: {
    history_visits: 900, history_sources: 2, peach_items: 24, peach_seconds: 7200,
    liked: 6, disliked: 1, range_start: '2026-01-01', range_end: '2026-09-01',
  },
  coverage: { tagged: 18, identified: 12, untagged: 6, unidentified: 12 },
  rankings: {
    browser_categories: [
      { name: 'Dimension A', score: 40 }, { name: 'Dimension B', score: 25 }, { name: 'Dimension C', score: 10 },
    ],
    browser_tags: [
      { name: 'Tag A', web_visits: 12, peach_items: 3 },
      { name: 'Tag B', web_visits: 5, peach_items: 0 },
    ],
    browser_creators: [{ name: 'Creator A', web_visits: 8, peach_items: 2, source_domain: 'example.com' }],
    domains: [{ name: 'example.com', visits: 30 }],
    peach_tags: [{ name: 'Tag D', score: 9, peach_items: 4 }],
    peach_creators: [],
    peach_performers: [],
  },
  gaps: [{ name: 'Candidate A', web_visits: 4 }],
  sources: [
    { source_key: 'a1', browser: 'chrome', profile: 'Desktop Chrome', host: 'desk', visits: 120 },
    { source_key: 'b2', browser: 'browserexport', profile: 'Mobile Firefox', host: 'phone', visits: 30 },
  ],
  analysis: {
    headline: 'Taste concentrated in two dimensions',
    confidence: { level: 'medium', label: 'Medium confidence' },
    points: [{ label: 'Main dimension', text: 'Dimension A' }],
    explore: [{ tag: 'Tag C', title: 'Explore tag C', detail: 'Appeared in browsing' }],
    next_steps: [{ route: '/review', title: 'Go to review', detail: 'Fill in identity' }],
  },
  activity: { timezone: 'Asia/Shanghai', days: [{ date: '2026-09-01', count: 3 }], hours: [{ weekday: 0, hour: 21, count: 5 }] },
  creator_flows: [{ source: 'example.com', target: 'Creator A', value: 6 }],
  storage: { exports: 2, bytes: 1048576 },
  window: 'all',
  updated_at: '2026-09-10T00:00:00Z',
  ...overrides,
});

/** The capabilities handed over by the legacy layer, replaced with a recognizable minimal implementation. */
const legacyProps = () => ({
  onSignal: vi.fn<(kind: string, name: string) => void>(),
  navigate: vi.fn<(route: string) => void>(),
  toast: vi.fn<(message: string) => void>(),
  onboarding: false,
});

/** This one never comes back: use it when switching scope to settle whether the previous copy is still alive. */
const HOLD = 'hold' as const;
type TasteReply = TasteData | null | typeof HOLD;

interface Plan {
  taste?: TasteReply[];
  /** A queue of snapshots for reading tasks. A still-pending Promise in it means that request is still in flight. */
  job?: (TasteJob | Promise<TasteJob>)[];
  imported?: { dashboard: TasteData };
  removed?: { removed: number; dashboard: TasteData };
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** A fake fetch routed by endpoint: each endpoint has its own queue, and after the last entry it repeats that one forever. */
function serve(plan: Plan) {
  const tastes = [...(plan.taste ?? [payload()])];
  const jobs = [...(plan.job ?? [{ status: 'idle' } as TasteJob])];
  const next = <T,>(queue: T[]): T => (queue.length > 1 ? queue.shift()! : queue[0]!);
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === TASTE_IMPORT_URL) return ok(plan.imported ?? { dashboard: payload() });
    if (input === TASTE_SOURCE_URL) return ok(plan.removed ?? { removed: 1, dashboard: payload() });
    if (input === TASTE_REFRESH_URL) {
      // Starting a run returns that run's running snapshot, consistent with `BackgroundJob.start`.
      if (init?.method) return ok({ status: 'running', stage: 'discovering' });
      return ok(await next(jobs));
    }
    if (input.startsWith(TASTE_URL)) {
      const reply = next(tastes);
      if (reply === HOLD) return new Promise<never>(() => {});
      return reply
        ? ok(reply)
        : { ok: false, status: 500, json: async () => ({ message: 'Database is currently browse-only' }) };
    }
    throw new Error(`No handler is scheduled for this endpoint: ${input}${init?.method ? ` ${init.method}` : ''}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

type Fetcher = ReturnType<typeof serve>;

const tasteGets = (fetcher: Fetcher) =>
  fetcher.mock.calls.filter(([input]) => String(input).startsWith(`${TASTE_URL}?`));

const callTo = (fetcher: Fetcher, url: string) =>
  fetcher.mock.calls.filter(([input]) => String(input) === url);

/** Runs the real first-screen path: prefetch lands in the cache first, then mount. */
async function open(plan: Plan = {}, props = legacyProps()) {
  const fetcher = serve(plan);
  await prefetchTaste(DEFAULT_WINDOW, new AbortController().signal).catch(() => {});
  const mounted = await mountRoot(
    <QueryClientProvider client={queryClient}><TastePage {...props} /></QueryClientProvider>);
  await settle();
  return { fetcher, props, ...mounted };
}

/** The poll is a timer inside the component, so advancing the clock triggers a rerender; it must be advanced inside act. */
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) });

/** Find the control by its visible text. The rank row and the clue row are each a whole-row button. */
const rowNamed = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((button) => button.textContent?.includes(text)) ?? null;

/** The native file input cannot be clicked into a change in happy-dom: assign the selected files directly and dispatch instead. */
const choosePeachFile = (input: HTMLInputElement, chosen: File) => act(async () => {
  Object.defineProperty(input, 'files', { configurable: true, value: [chosen] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

it('The first screen reads the prefetched cache entry, and the two evidence sets are tabs rather than side by side', async () => {
  const { fetcher, host } = await open();
  expect(tasteGets(fetcher)).toHaveLength(1);
  expect(tasteGets(fetcher)[0]?.[0]).toBe(`${TASTE_URL}?window=all`);
  expect([...host.querySelectorAll('[role=tab]')].map((tab) => tab.textContent).slice(0, 2))
    .toEqual(['Peach watches and ratings', 'Browser history']);
  expect(host.textContent).toContain('900');
  expect(host.textContent).not.toContain(' videos have internal behavior evidence');
});

it('Taste dimensions take the top-scoring few: three to six on the radar and at most eight ranking bars', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ name: `Dimension ${index}`, score: index }));
  expect(topScores(rows, RANK_MAX).map((row) => row.value)).toEqual([9, 8, 7, 6, 5, 4, 3, 2]);
  expect(radarRows(rows).map((row) => row.name)).toEqual(['Dimension 9', 'Dimension 8', 'Dimension 7', 'Dimension 6', 'Dimension 5', 'Dimension 4']);
  expect(radarRows([{ name: 'Alpha', score: 3 }, { name: 'Beta', score: 1 }, { name: 'Gamma' }])).toEqual([]);
});

it('The taste dimensions readout counts only dimensions with a positive score, the same set the radar and ranking bars draw', () => {
  expect(tasteDimensions([{ name: 'negative', score: -2 }, { name: 'Beta', score: 3 }, { name: 'zero', score: 0 },
    { name: 'Alpha', score: 9 }, { name: 'missing' }]).map((row) => row.name)).toEqual(['Alpha', 'Beta']);
});

it('Numbers under data sources and rankings get thousands separators, and without a date range only the source count reads', () => {
  expect(historySpan({ history_sources: 12345 })).toBe(`${(12345).toLocaleString()} data sources`);
  expect(historySpan({ history_sources: 2, range_start: '2026-01-01', range_end: '2026-09-01' }))
    .toMatch(/^2 data sources · .+–.+$/);
  expect(rankDetail({ name: 'Alpha', web_visits: 12345, peach_items: 6789 }))
    .toBe(`Browsed ${(12345).toLocaleString()} · Peach ${(6789).toLocaleString()}`);
  expect(rankDetail({ name: 'Beta', web_visits: 5, web_bookmarks: 3 })).toBe('Browsed 2 · Bookmarks 3');
});

it('When one side of the flow diagram exceeds twelve nodes the tail is merged; the canvas grows with the node count and nodes never crowd together', () => {
  const flows = Array.from({ length: 20 }, (_, at) => ({ source: 'example.com', target: `Creator ${at}`, value: 40 - at }));
  const graph = flowGraph(flows)!;
  const targets = graph.nodes.filter((node) => node.side === 'target');
  expect(targets).toHaveLength(12);
  expect(targets.find((node) => node.name === '9 other creators')?.value).toBe(29 + 28 + 27 + 26 + 25 + 24 + 23 + 22 + 21);
  expect(graph.height).toBeGreaterThan(FLOW_VIEWBOX.height);
  const centers = targets.map((node) => node.y + node.height / 2).sort((a, b) => a - b);
  for (let at = 1; at < centers.length; at += 1) expect(centers[at]! - centers[at - 1]!).toBeGreaterThanOrEqual(30);
  expect(flowGraph(flows.slice(0, 3))!.height).toBe(FLOW_VIEWBOX.height);
});

it('With fewer than three dimensions the profile card omits the radar but still shows ranking bars', async () => {
  const { host } = await open({ taste: [payload({ rankings: {
    ...payload().rankings, browser_categories: [{ name: 'Dimension A', score: 4 }, { name: 'Dimension B', score: 2 }],
  } })] });
  const portrait = host.querySelector('section[aria-label="Browser profile"]')!;
  expect(portrait.querySelector('div[role=img]')).toBeNull();
  expect(portrait.querySelector('section[aria-label="Taste dimension ranking"]')).not.toBeNull();
});

it('Rankings without a rank offer one line on how to fill it, never repeating "not enough evidence yet"', async () => {
  const { host } = await open();
  await click([...host.querySelectorAll('[role=tab]')].find((tab) => tab.textContent === 'Peach watches and ratings') ?? null);
  await click([...host.querySelectorAll('[role=tab]')].find((tab) => tab.textContent === 'Creators') ?? null);
  const panel = [...host.querySelectorAll('[role=tabpanel]')].at(-1)!;
  expect(panel.textContent).toContain('Not enough records');
  expect(panel.textContent).toContain('After you play or rate videos in Peach, the related creators are listed here.');
});

it('Radar radius uses a square-root scale: the largest dimension lands on the outer ring, while the overlay still reads the raw counts', async () => {
  // Recharts measures the container via ResizeObserver; remove it and it draws at EvilCharts' initial size of 320 × 200;
  // With reduced motion declared, Recharts skips its growth animation and the polygons render in their final state.
  vi.stubGlobal('ResizeObserver', undefined);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {},
  }));
  const counts = [657, 68, 56, 4, 1];
  const host = await mount(
    <TasteRadar rows={counts.map((score, index) => ({ name: `Dimension ${index}`, score }))} label="Main taste dimensions" />);
  const points = (path: Element | null | undefined) =>
    [...(path?.getAttribute('d') ?? '').matchAll(/(-?[\d.]+),\s*(-?[\d.]+)/g)]
      .map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
  const rings = [...host.querySelectorAll('.recharts-polar-grid-concentric-polygon')].map(points);
  // The radius 0 ring degenerates to the center point; the grid is quartered, and the outermost ring is 1 on the radius axis.
  expect(rings).toHaveLength(5);
  const center = rings[0]![0]!;
  const reach = (point: { x: number; y: number }) => Math.hypot(point.x - center.x, point.y - center.y);
  const outer = reach(rings.at(-1)![0]!);
  const radar = points(host.querySelector('.recharts-radar-polygon path')).slice(0, counts.length);
  expect(radar.map((point) => reach(point) / outer))
    .toEqual(counts.map((count) => expect.closeTo(Math.sqrt(count / 657), 3)));

  // It points at the topmost vertex (the largest dimension); the overlay reports 657 hits, not the radius 1 used for drawing.
  await act(async () => {
    host.querySelector('.recharts-wrapper')!.dispatchEvent(new MouseEvent('mousemove',
      { bubbles: true, clientX: center.x, clientY: center.y - outer / 2 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const tip = host.querySelector('.recharts-tooltip-wrapper')!;
  expect(tip.textContent).toContain('Dimension 0');
  expect([...tip.querySelectorAll('span')].map((span) => span.textContent)).toEqual(['Tag occurrence counts', '657']);
});

it('The browser profile\'s radar, ranking, and browsing-activity heatmaps all paint from this one dataset', async () => {
  const { host } = await open();
  const portrait = host.querySelector('section[aria-label="Browser profile"]')!;
  expect(portrait.querySelector('div[role=img]')?.getAttribute('aria-label'))
    .toBe('Main taste dimensions: Dimension A, Dimension B, Dimension C');
  expect(portrait.querySelector('section[aria-label="Taste dimension ranking"]')).not.toBeNull();
  const heats = [...host.querySelectorAll('svg[role=img]')].map((heat) => heat.getAttribute('aria-label'));
  expect(heats).toEqual(expect.arrayContaining(['Browsing activity time', 'Daily activity']));
  expect(host.querySelector('rect[aria-label="Mon 21:00, 5 visits"]')).not.toBeNull();
});

it('Switching the analysis scope keeps the previous copy: the screen never falls back to waiting and just holds for the new numbers', async () => {
  const { fetcher, host } = await open({ taste: [payload(), HOLD] });
  await choose(host.querySelector('[aria-haspopup="listbox"]'), 'Last 7 days');
  await settle();
  expect(tasteGets(fetcher).map(([input]) => String(input)))
    .toEqual([`${TASTE_URL}?window=all`, `${TASTE_URL}?window=7d`]);
  // The previous copy is still on screen: readings, tabs, and rankings all remain legible, with no fall back to "Read failed".
  expect(host.textContent).toContain('900');
  expect(rowNamed(host, 'Tag A')).not.toBeNull();
  expect(host.querySelector('[role=alert]')).toBeNull();
});

it('The background recompute asks again after a while and stops once the new results are in', async () => {
  vi.useFakeTimers();
  const { fetcher, host } = await open({ taste: [payload({ stale: true }), payload()] });
  expect(host.textContent).toContain('Updating taste analysis');
  await tick(STALE_POLL_MS);
  await settle();
  expect(tasteGets(fetcher)).toHaveLength(2);
  expect(host.textContent).not.toContain('Updating taste analysis');
  await tick(STALE_POLL_MS * 3);
  expect(tasteGets(fetcher)).toHaveLength(2);
});

it('A failed recompute stops polling; the banner says the update failed, and "Retry now" has the server skip the wait and compute again', async () => {
  vi.useFakeTimers();
  const failed = payload({ stale: true, error: 'Reading the ledger failed', computed_at: '2026-09-10T00:00:00Z' });
  const fresh = payload({ summary: { history_visits: 4321, history_sources: 2 } });
  const { fetcher, host } = await open({ taste: [failed, fresh] });
  expect(host.textContent).toContain('Taste analysis update failed');
  expect(host.textContent).toContain('Reading the ledger failed');
  expect(host.textContent).not.toContain('Updating taste analysis');
  await tick(STALE_POLL_MS * 3);
  expect(tasteGets(fetcher), 'Polling continued after failure').toHaveLength(1);
  await click(rowNamed(host, 'Retry now'));
  await settle();
  expect(String(tasteGets(fetcher).at(-1)?.[0])).toBe(`${TASTE_URL}?window=all&retry=1`);
  expect(host.textContent).not.toContain('Taste analysis update failed');
  expect(host.textContent).toContain('4,321');
});

it('A stale terminal state read on the first screen does not pose as a new result: no receipt is sent and the dashboard is not refetched', async () => {
  const { fetcher, props, host } = await open({ job: [{ status: 'complete' }] });
  expect(props.toast).not.toHaveBeenCalled();
  expect(tasteGets(fetcher)).toHaveLength(1);
  expect(host.querySelector('[role=alert]')).toBeNull();
});

it('This run saw it executing first-hand; only after it finishes does it settle the receipt and refetch the dashboard', async () => {
  vi.useFakeTimers();
  const { fetcher, props, host } = await open({
    job: [{ status: 'running', message: 'Reading browsing data' }, { status: 'complete' }],
  });
  expect(host.textContent).toContain('Reading browsing data');
  const actions = [...host.querySelectorAll('[data-split-button] > button')];
  expect(actions).toHaveLength(2);
  expect(actions.every(button => button.getAttribute('aria-disabled') === 'true')).toBe(true);
  await click(actions[1]);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[data-task-progress]')).not.toBeNull();
  await tick(JOB_RUNNING_POLL_MS);
  await settle();
  expect(props.toast.mock.calls).toEqual([['Taste analysis updated']]);
  expect(tasteGets(fetcher).length).toBeGreaterThan(1);
});

it('The import sends the raw file as octet-stream with the filename in the request header, and the returned copy is swapped straight into "All time"', async () => {
  const { fetcher, props, host } = await open({
    imported: { dashboard: payload({ summary: { history_visits: 4321, history_sources: 3 } }) },
  });
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  await choosePeachFile(input, new File(['x'], 'history.zip'));
  await settle();
  const sent = callTo(fetcher, TASTE_IMPORT_URL);
  expect(sent).toHaveLength(1);
  const init = sent[0]?.[1];
  const headers = init?.headers as Record<string, string>;
  expect(init?.method).toBe('POST');
  expect(headers['Content-Type']).toBe('application/octet-stream');
  expect(headers['X-Peach-Filename']).toBe(encodeURIComponent('history.zip'));
  expect(props.toast.mock.calls).toEqual([['Taste data imported']]);
  // Swapping into the cache is enough; do not query `/api/taste` again for a single import.
  expect(host.textContent).toContain('4,321');
  expect(tasteGets(fetcher)).toHaveLength(1);
});

it('After a bookmark file uploads it shows its own count and source', async () => {
  const { host, fetcher } = await open({ imported: { dashboard: payload({
    summary: { history_visits: 0, bookmarks: 27 },
    sources: [{ source_key: 'b2', browser: 'bookmarks', profile: 'bookmarks.html', host: 'desktop', bookmarks: 27 }],
  }) } });
  await choosePeachFile(host.querySelector<HTMLInputElement>('[data-bookmark-import]')!,
    new File(['<!DOCTYPE NETSCAPE-Bookmark-file-1>'], 'bookmarks.html'));
  await settle();
  expect(callTo(fetcher, TASTE_IMPORT_URL)).toHaveLength(1);
  expect(host.textContent).toContain('Browser bookmarks');
  expect(host.textContent).toContain('27 bookmarks');
});

it('After importing, return to the range viewed before the import, reading data from after the import', async () => {
  const { fetcher, host } = await open({
    // 90 days before the import, the "all time" restored by the import, and 90 days after: three distinct copies, each recognizable.
    taste: [
      payload(),
      payload({ summary: { history_visits: 111, history_sources: 2 } }),
      payload({ summary: { history_visits: 4321, history_sources: 3 } }),
      payload({ summary: { history_visits: 999, history_sources: 3 } }),
    ],
    imported: { dashboard: payload({ summary: { history_visits: 4321, history_sources: 3 } }) },
  });
  await choose(host.querySelector('[aria-haspopup="listbox"]'), 'Last 90 days');
  await settle();
  expect(host.textContent).toContain('111');

  await choosePeachFile(host.querySelector<HTMLInputElement>('input[type=file]')!,
    new File(['x'], 'history.zip'));
  await settle();
  expect(host.textContent).toContain('4,321');

  await choose(host.querySelector('[aria-haspopup="listbox"]'), 'Last 90 days');
  await settle();
  /* Changing the scope always refetches: the cached copy predates the import, and using it would hide the import's results.
     The `window=all` request after the import also lands here; it returns the same data, and what it confirms is that the server has persisted it too. */
  expect(tasteGets(fetcher).map(([input]) => String(input))).toEqual([
    `${TASTE_URL}?window=all`, `${TASTE_URL}?window=90d`,
    `${TASTE_URL}?window=all`, `${TASTE_URL}?window=90d`,
  ]);
  expect(host.textContent).toContain('999');
  expect(host.textContent).not.toContain('111');
});

it('Removing a data source swaps in the returned copy in place instead of refetching the whole page', async () => {
  const modal = vi.spyOn(legacyUi, 'confirmModal').mockImplementation(async (options) => {
    await options.onConfirm?.();
    return { confirmed: true };
  });
  const rest = payload({
    sources: [{ source_key: 'b2', browser: 'browserexport', profile: 'Mobile Firefox', host: 'phone', visits: 30 }],
  });
  const { fetcher, props, host } = await open({ removed: { removed: 1, dashboard: rest } });
  expect(host.textContent).toContain('Desktop Chrome');
  await click(host.querySelector('[aria-label="Remove Desktop Chrome"]'));
  await settle();
  expect(modal).toHaveBeenCalledTimes(1);
  const sent = callTo(fetcher, TASTE_SOURCE_URL);
  expect(sent).toHaveLength(1);
  expect(JSON.parse(String(sent[0]?.[1]?.body)))
    .toEqual({ operation: 'remove', source_key: 'a1', window: 'all' });
  expect(props.toast.mock.calls).toEqual([['Removed the taste data source']]);
  expect(host.textContent).not.toContain('Desktop Chrome');
  expect(tasteGets(fetcher)).toHaveLength(1);
});

it('A ranking is clickable only when the library has a matching entry; clicking sends the signal back to the shell and the page never navigates itself', async () => {
  const { props, host } = await open();
  expect(rowNamed(host, 'Tag B')).toBeNull();
  await click(rowNamed(host, 'Tag A'));
  expect(props.onSignal.mock.calls).toEqual([['tag', 'Tag A']]);
  expect(props.navigate).not.toHaveBeenCalled();
});

it('Each taste summary line has its own exit: explore sends a signal and next steps send a route', async () => {
  const { props, host } = await open();
  await click(rowNamed(host, 'Explore tag C'));
  expect(props.onSignal.mock.calls).toEqual([['tag', 'Tag C']]);
  await click(rowNamed(host, 'Go to review'));
  expect(props.navigate.mock.calls).toEqual([['/review']]);
});

it('No more DB hits after unmount: the background polling pass follows this root', async () => {
  vi.useFakeTimers();
  const { fetcher, unmount } = await open();
  const before = fetcher.mock.calls.length;
  await unmount();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher.mock.calls.length, 'Fetching continued after unmount').toBe(before);
});
