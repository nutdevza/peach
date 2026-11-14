/* The stats page's behavior: whether one screen reads one copy of data, which layer each of the four tab-cards opens, where
 * the empty states go, which key clicking a content tag hands back to the shell, and how the charts' binning reduces.
 *
 * Looks (card spacing, shadows) are design decisions asserted by `frontend/e2e/design-*.test.ts` reading `getComputedStyle`;
 * this file covers only structure, text and requests. Recharts cannot measure container sizes here and cannot draw the shapes
 * themselves, so chart readouts are verified from legends, headers and pure functions. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';

import { queryClient } from '../../src/react/query';
import { shortCount } from '../../src/react/charts/bar-card';
import { categoryAxisWidth, fitLabel, labelWidth } from '../../src/react/charts/chart-card';
import {
  fmtCount, lengthRows, mediumRows, percentOf, percentText, playedFor, prefetchStats, radialArc,
  radialBarSize, radialCeiling, radialSlices, replayRows, STATS_URL, watchNote, type StatsData,
} from '../../src/react/stats/stats';
import { RadialCard } from '../../src/react/stats/radial-card';
import { StatsPage } from '../../src/react/stats/stats-page';

import { actionOrder, buttonNamed, click, mount, mountRoot } from './render';

// The client is a module-level singleton (all React roots share one); without clearing between test cases they feed each other data.
afterEach(() => queryClient.clear());

/* Query dispatches updates through the real `setTimeout(0)` it captured itself, which the fake clock cannot advance: after advancing the clock
   the assertions still see the previous frame's DOM. The case dispatches immediately instead. */
notifyManager.setScheduler((notify) => notify());

const payload = (overrides: Partial<StatsData> = {}): StatsData => ({
  by_loc: [{ k: 'local', n: 3, bytes: 3221225472, videos: 3 },
    { k: '115', n: 1, bytes: 1073741824, videos: 1 }],
  by_medium: [{ k: 'video', n: 4, bytes: 4294967296 }, { k: 'image', n: 6, bytes: 1048576 }],
  by_library: [{ k: 'main', name: 'Main library', icon: 'film', videos: 4, bytes: 4294967296 }],
  by_length: [{ k: '速食', n: 1 }, { k: '短', n: 3 }, { k: '中', n: 0 }, { k: '长', n: 0 }],
  by_quality: [{ k: '4K', n: 0 }, { k: '2K', n: 0 }, { k: '1080P', n: 4 }, { k: '720P', n: 0 }, { k: 'Low quality', n: 0 }],
  play_activity: {
    timezone: 'UTC+08:00',
    days: [{ date: '2026-09-20', count: 1 }, { date: '2026-09-22', count: 1 }],
    hours: [{ weekday: 0, hour: 23, count: 1 }, { weekday: 6, hour: 8, count: 1 }],
  },
  replays: [{ k: 1, n: 1 }, { k: 3, n: 1 }],
  attribution: { videos: 4, creator: 3, code: 2, studio: 1, thumb: 4, duration: 4 },
  tag_source: [{ k: 'javdb', n: 12, assets: 3 }],
  tag_cov: 2,
  top_tags: [{ k: 'tag:a', n: 9, cat: 'genre' }, { k: 'tag:b', n: 4, cat: 'genre' }],
  consumption: {
    played: 2, library_played: 1, online_played: 1, play_seconds: 7200,
    o_total: 5, liked: 1, dislike: 1, seen: 2, trash: 0, skimmed: 1,
  },
  recent: [{
    id: 42, name: 'one.mp4', creator: 'Alpha', play_seconds: 600,
    duration: 1200, max_reached: 0.9, o_count: 0, kind: 'library',
  }],
  storage_volumes: [{
    kind: 'media', label: 'R:', root: 'R:\\media', online: true,
    free: 1073741824, used: 3221225472, total: 4294967296,
  }],
  storage_summary: { volumes: 1, online: 1, measured: 1, free: 1073741824, used: 3221225472, total: 4294967296 },
  ...overrides,
});

/** The helpers handed over by the legacy layer, replaced with a recognizable minimal implementation. */
const legacyProps = () => ({
  tagLabel: (key: string) => `Tag ${key}`,
  onTag: vi.fn<(key: string) => void>(),
});

/** Returns these responses in order, repeating the last one forever after. The `null` entry returns 500. */
function serve(...responses: (StatsData | null)[]) {
  let at = 0;
  const fetcher = vi.fn(async (_input: string, _init?: RequestInit) => {
    const body = responses[Math.min(at, responses.length - 1)] ?? null;
    at += 1;
    return body
      ? { ok: true, status: 200, json: async () => body }
      : { ok: false, status: 500, json: async () => ({ message: 'Database is currently browse-only' }) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

/** Runs the real first-screen path: prefetch lands in the cache first, then mount. */
async function open(data: StatsData | null = payload(), props = legacyProps()) {
  const fetcher = serve(data);
  await prefetchStats(new AbortController().signal).catch(() => {});
  const mounted = await mountRoot(
    <QueryClientProvider client={queryClient}><StatsPage {...props} /></QueryClientProvider>);
  return { fetcher, props, ...mounted };
}

const tabNamed = (root: ParentNode, name: string) =>
  [...root.querySelectorAll<HTMLElement>('[role=tab]')].find((tab) => tab.textContent?.includes(name)) ?? null;

it('One request for the whole page: the four cards and the three panels below read the same snapshot', async () => {
  const { fetcher, host } = await open();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe(STATS_URL);
  expect(host.querySelectorAll('[role=tablist]')).toHaveLength(2);
  expect([...host.querySelectorAll('[role=tablist]')[0]!.querySelectorAll('[role=tab]')]
    .map((tab) => tab.querySelector('b')?.textContent))
    .toEqual(['4', '2', '50%', '1 volume']);
});

it('The four cards are tabs: clicking "Watched" switches to that layer and the others collapse', async () => {
  const { host } = await open();
  await click(tabNamed(host, 'Watched'));
  expect(tabNamed(host, 'Watched')?.getAttribute('aria-selected')).toBe('true');
  expect(tabNamed(host, 'Library videos')?.getAttribute('aria-selected')).toBe('false');
  const panel = host.querySelector('[role=tabpanel]')!;
  expect(panel.textContent).toContain('videos have play records');
  expect(panel.textContent).toContain('Climax count');
  expect(panel.textContent).not.toContain('Frames extracted');
});

/** The two radial charts in the stock layer: the chart block is named after the chart's title. */
const radialCharts = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>('[role=tabpanel] div[role=img]')];

it('The inventory layer draws one ring per source, with the legend using the source\'s UI name', async () => {
  const { host } = await open();
  const charts = radialCharts(host);
  expect(charts.map((chart) => chart.getAttribute('aria-label'))).toEqual(['Cloud drive and local', 'Media library']);
  const tiles = [...charts[0]!.closest('section')!.querySelectorAll('button')];
  expect(tiles.map((tile) => tile.querySelector('span')?.textContent)).toEqual(['Local', '115']);
  expect(tiles.map((tile) => tile.querySelector('b')?.textContent)).toEqual(['3', '1']);
  expect(tiles[1]!.querySelector('svg use')?.getAttribute('href')).toBe(`#i-${MEDIA_SOURCE_ICONS['115']}`);
  expect(charts[1]!.closest('section')!.querySelector('button svg use')?.getAttribute('href')).toBe('#i-film');
});

it('A full circle is 1.1x the longest segment; the more rings, the thinner each ring', () => {
  expect(radialCeiling([10, 5])).toBeCloseTo(11);
  expect(radialCeiling([])).toBeCloseTo(1.1);
  expect([2, 12, 40].map(radialBarSize)).toEqual([14, 8, 4]);
});

it('Pointing at a segment padded to the minimum arc length, the overlay reads the raw number, not the drawing arc length', async () => {
  // Remove ResizeObserver so Recharts draws at its initial size; declare reduced motion, and the ring goes straight to its final state.
  vi.stubGlobal('ResizeObserver', undefined);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {},
  }));
  // Full circle 3023 × 1.1, the minimum arc length is 2% of it: 66.506, larger than the 36 for Western dramas, so that segment draws a raised arc.
  const rows = [
    { name: 'Solo story', value: 3023 }, { name: 'Co-starring story', value: 128 },
    { name: 'Western story', value: 36 }, { name: 'Photobook', value: 198 },
  ];
  const host = await mount(<RadialCard title="Media library" rows={rows} empty="" />);
  // The base-color sector of each ring: the path's first segment is M cx,cy-outerRadius, the second arc is the inner radius, take the middle radius and point up to it.
  const rings = [...host.querySelectorAll('path.recharts-radial-bar-background-sector')].map((path) => {
    const [outer, inner] = [...(path.getAttribute('d') ?? '').matchAll(/A ([\d.]+),/g)].map(([, r]) => Number(r));
    return { cx: Number(path.getAttribute('cx')), cy: Number(path.getAttribute('cy')), r: (outer! + inner!) / 2 };
  });
  expect(rings).toHaveLength(rows.length);
  const tipFor = async (index: number) => {
    const { cx, cy, r } = rings[index]!;
    await act(async () => {
      host.querySelector('.recharts-wrapper')!.dispatchEvent(new MouseEvent('mousemove',
        { bubbles: true, clientX: cx, clientY: cy - r }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const tip = host.querySelector('.recharts-tooltip-wrapper')!;
    return [...tip.querySelectorAll('span')].map((span) => span.textContent);
  };
  expect(await tipFor(2)).toEqual(['Western story', '36']);
  expect(await tipFor(0)).toEqual(['Solo story', '3,023']);
});

it('Clicking the legend pins that segment and the count follows; clicking again releases it', async () => {
  const { host } = await open();
  const card = radialCharts(host)[0]!.closest('section')!;
  const tile = [...card.querySelectorAll('button')].find((button) => button.textContent?.startsWith('115'))!;
  await click(tile);
  expect(tile.getAttribute('aria-pressed')).toBe('true');
  expect(card.querySelector('h3')?.textContent).toBe('115');
  expect(card.querySelector('h3 svg use')?.getAttribute('href')).toBe(`#i-${MEDIA_SOURCE_ICONS['115']}`);
  expect(card.querySelector('header b')?.textContent).toBe('1');
  await click(tile);
  expect(tile.getAttribute('aria-pressed')).toBe('false');
  expect(card.querySelector('h3')?.textContent).toBe('Cloud drive and local');
});

it('The stock layer renders one distribution chart each for duration, quality, and file type; the page header reads the totals', async () => {
  const { host } = await open();
  const panel = host.querySelector('[role=tabpanel]')!;
  const bars = [...panel.querySelectorAll('section[aria-label]')];
  expect(bars.map((bar) => [bar.getAttribute('aria-label'), bar.querySelector('header b')?.textContent]))
    .toEqual([['Duration', '4'], ['Quality', '4'], ['File types', '10']]);
});

it('Distribution buckets: duration becomes minute ranges, file types sort most-first, and the play-count long tail is merged into buckets', () => {
  expect(lengthRows([{ k: '速食', n: 1 }, { k: '长', n: 2 }, { k: '超长', n: 3 }]))
    .toEqual([{ name: '<5 min', value: 1 }, { name: '40 min and up', value: 2 }, { name: '超长', value: 3 }]);
  expect(mediumRows([{ k: 'video', n: 4, bytes: 0 }, { k: 'account', n: 9, bytes: 0 }, { k: 'x', n: 1, bytes: 0 }]))
    .toEqual([{ name: 'Account', value: 9 }, { name: 'Videos', value: 4 }, { name: 'x', value: 1 }]);
  expect(replayRows([{ k: 1, n: 52 }, { k: 2, n: 13 }, { k: 4, n: 6 }, { k: 7, n: 1 }, { k: 9, n: 1 }, { k: 12, n: 2 }]))
    .toEqual([
      { name: '1', value: 52 }, { name: '2', value: 13 }, { name: '3', value: 0 },
      { name: '4', value: 6 }, { name: '5', value: 0 }, { name: '6–9', value: 2 },
      { name: '≥10', value: 2 },
    ]);
});

it('The watched layer has two play-time heatmaps, and pointing at a cell swaps the reading to that cell', async () => {
  const { host } = await open();
  await click(tabNamed(host, 'Watched'));
  const panel = host.querySelector('[role=tabpanel]')!;
  const heats = [...panel.querySelectorAll('svg[role=img]')];
  expect(heats.map((heat) => heat.getAttribute('aria-label'))).toEqual(['Play time', 'Daily plays']);
  const card = heats[0]!.closest('section')!;
  expect(card.querySelector('header b')?.textContent).toBe('2');
  expect(card.querySelector('footer')?.textContent).toContain('UTC+08:00');
  const cell = card.querySelector<SVGRectElement>('rect[aria-label="Mon 23:00, 1 video"]')!;
  await act(async () => { cell.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
  expect(card.querySelector('header small')?.textContent).toBe('Mon 23:00');
  expect(card.querySelector('header b')?.textContent).toBe('1');
  await act(async () => { cell.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(card.querySelector('header b')?.textContent).toBe('2');
  expect(panel.querySelector('section[aria-label="Play counts"] header b')?.textContent).toBe('2');
  const liked = [...panel.querySelectorAll('span')].find((term) => term.textContent === 'Favorites');
  expect(liked?.nextElementSibling?.textContent).toBe('1');
});

it('One heatmap takes a single Tab stop; arrow keys move between cells', async () => {
  const { host } = await open();
  await click(tabNamed(host, 'Watched'));
  const card = host.querySelector('[role=tabpanel] svg[role=img]')!.closest('section')!;
  const stops = () => [...card.querySelectorAll<SVGRectElement>('rect[tabindex="0"]')];
  expect(card.querySelectorAll('rect').length).toBe(168);
  expect(stops().map((cell) => cell.dataset.cell)).toEqual(['0']);
  const first = stops()[0]!;
  await act(async () => { first.focus(); });
  await act(async () => {
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  expect(document.activeElement?.getAttribute('data-cell')).toBe('24');
  expect(stops().map((cell) => cell.dataset.cell)).toEqual(['24']);
  expect(card.querySelector('header small')?.textContent).toBe(
    document.activeElement?.getAttribute('aria-label')?.split(', ')[0]);
  await act(async () => {
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  expect(document.activeElement?.getAttribute('data-cell')).toBe('47');
});

it('Without play-time records the watched layer draws no heatmap, leaving one note card', async () => {
  const { host } = await open(payload({ play_activity: { timezone: 'UTC+08:00', days: [], hours: [] } }));
  await click(tabNamed(host, 'Watched'));
  expect(host.querySelector('[role=tabpanel] svg[role=img]')).toBeNull();
  expect(host.querySelector('[role=tabpanel] section[aria-label="Play time"] p')?.textContent)
    .toBe('Once playback starts, this shows which weekday hours your plays land in.');
});

it('All-zero distributions and segment-less radial charts both swap to note cards', async () => {
  const { host } = await open(payload({
    by_library: [],
    by_quality: [{ k: '4K', n: 0 }, { k: '1080P', n: 0 }],
  }));
  const panel = host.querySelector('[role=tabpanel]')!;
  expect(panel.querySelector('section[aria-label="Media library"] p')?.textContent)
    .toBe('Once media folders join libraries, this shows video counts per library.');
  expect(panel.querySelector('section[aria-label="Quality"] p')?.textContent).toBe('After quality is probed, the quality distribution shows here.');
});

it('An unavailable count reads "Unavailable" — never a blank screen or NaN', async () => {
  const { host } = await open(payload({
    tag_cov: null,
    attribution: { videos: 4, creator: null, code: null, studio: null, thumb: null, duration: null },
    consumption: {
      played: null, library_played: null, online_played: null, play_seconds: null,
      o_total: null, liked: null, dislike: null, seen: null, trash: null, skimmed: null,
    },
  }));
  const cards = [...host.querySelectorAll('[role=tablist]')[0]!.querySelectorAll('[role=tab]')];
  expect(cards.map((tab) => tab.querySelector('b')?.textContent)).toEqual(['4', 'Not fetched', 'Not fetched', '1 volume']);
  expect(host.textContent).not.toContain('NaN');
});

it('Counts get thousands separators, percentages clamp to 0 through 100, and any fraction means it never reads 0%', () => {
  expect(fmtCount(1234567)).toBe((1234567).toLocaleString());
  expect(fmtCount(null)).toBe('Not fetched');
  expect([percentOf(150, 100), percentOf(-3, 100), percentOf(5, 0), percentOf(null, 10)]).toEqual([100, 0, 0, 0]);
  expect([percentText(1, 1000), percentText(0, 1000), percentText(1, 2)]).toEqual(['<1%', '0%', '50%']);
});

it('Playback duration: under one hour reads minutes, under 48 hours reads hours, and beyond that reads days', () => {
  expect([playedFor(1800), playedFor(7200), playedFor(48 * 3600), playedFor(-5), playedFor(null)])
    .toEqual(['30 min', '2.0 hr', '2 days', '0 min', 'Not fetched']);
});

it('The radial chart merges the tail past six segments with volume following the sum; negatives and non-finite values never paint', () => {
  const rows = Array.from({ length: 8 }, (_, at) => ({ name: `lib${at}`, value: 80 - at * 10, bytes: 1 }));
  const slices = radialSlices([...rows, { name: 'broken', value: -1 }, { name: 'empty', value: Number.NaN }]);
  expect(slices.map((row) => row.name)).toEqual(['lib0', 'lib1', 'lib2', 'lib3', 'lib4', '3 other items']);
  expect(slices.at(-1)).toEqual({ name: '3 other items', value: 30 + 20 + 10, bytes: 3 });
});

it('Non-zero segments render at least 2% of the full circle; zero stays 0', () => {
  expect(radialArc(1, 1000)).toBe(20);
  expect(radialArc(500, 1000)).toBe(500);
  expect(radialArc(0, 1000)).toBe(0);
});

it('Bar tip counts from 100k up switch to 10k and 100M units', () => {
  expect([shortCount(99999), shortCount(123456), shortCount(1_234_567_890)])
    .toEqual([(99999).toLocaleString(), '123K', '1.23B']);
});

it('Category names truncate with an ellipsis when tight, and the axis width follows the longest name with a cap', () => {
  expect(fitLabel('Short n…', 60)).toBe('Short n…');
  const long = 'A particularly long category name';
  const cut = fitLabel(long, 60);
  expect(cut).toMatch(/^A parti.*…$/);
  expect(long.startsWith(cut.slice(0, -1))).toBe(true);
  expect(labelWidth(cut)).toBeLessThanOrEqual(60);
  expect(categoryAxisWidth(['ab'])).toBe(36);
  expect(categoryAxisWidth(['A particularly long category name a particularly long category name'])).toBe(104);
});

it('Every progress bar in the coverage layer shares the same numerator/denominator pair without recomputing', async () => {
  const { host } = await open();
  await click(tabNamed(host, 'Content tags'));
  const bars = [...host.querySelectorAll('[role=meter]')];
  expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
    'With creators: 3 / 4', 'Has code: 2 / 4', 'Has label: 1 / 4', 'Frames extracted: 4 / 4', 'Duration probed: 4 / 4',
  ]);
});

it('Volumes without capacity draw no usage, stating only that it is unavailable', async () => {
  const { host } = await open(payload({
    storage_volumes: [{ kind: 'media', label: 'B:', root: null, online: true, free: null, used: null, total: null }],
    storage_summary: { volumes: 1, online: 1, measured: 0, free: 0, used: 0, total: 0 },
  }));
  await click(tabNamed(host, 'Space usage'));
  const panel = host.querySelectorAll('[role=tabpanel]')[0]!;
  expect(panel.textContent).toContain('Capacity not fetched');
  expect(panel.textContent).toContain('Unmapped');
  expect(panel.querySelector('[role=meter]')).toBeNull();
});

it('Byte-based volumes draw the used segment at true proportion on the hundred-cell canvas, and the screen-reader value stays in bytes', async () => {
  const total = 2_031_179_788_288;
  const used = 1_828_061_809_459;
  const { host } = await open(payload({
    storage_volumes: [{ kind: 'system', label: 'System drive', root: 'C:\\', online: true, free: total - used, used, total }],
    storage_summary: { volumes: 1, online: 1, measured: 1, free: total - used, used, total },
  }));
  await click(tabNamed(host, 'Space usage'));
  const bar = host.querySelectorAll('[role=tabpanel]')[0]!.querySelector('[role=meter]')!;
  expect(bar.getAttribute('aria-valuemax')).toBe(String(total));
  expect(bar.getAttribute('aria-valuenow')).toBe(String(used));
  expect(bar.getAttribute('viewBox')).toBe('0 0 100 1');
  expect(Number(bar.querySelectorAll('rect')[1]!.getAttribute('width'))).toBeCloseTo(90, 1);
  expect(host.querySelectorAll('[role=tabpanel]')[0]!.textContent).toContain('90%');
});

it('When the ranking is collapsed the last two items are not interactive; the arrow expands in place and can collapse back', async () => {
  const tags = Array.from({ length: 12 }, (_, index) => ({ k: `tag:${index}`, n: 12 - index, cat: 'genre' }));
  const { host } = await open(payload({ top_tags: tags }));
  const rows = host.querySelectorAll('ol li');
  const expand = host.querySelector<HTMLButtonElement>('button[aria-label="Show more ranking"]');
  expect(rows).toHaveLength(12);
  expect(rows[10]?.hasAttribute('inert')).toBe(true);
  expect(expand?.querySelector('svg')).not.toBeNull();
  expect(expand?.textContent).toBe('');
  await click(expand);
  expect(rows[10]?.hasAttribute('inert')).toBe(false);
  expect(host.querySelector('[data-expandable-ranking]')?.hasAttribute('data-animating')).toBe(true);
  await click(host.querySelector('button[aria-label="Collapse ranking"]'));
  expect(rows[10]?.hasAttribute('inert')).toBe(true);
});

it('Clicking a content tag returns the key to the shell; the page does not navigate itself', async () => {
  const { host, props } = await open();
  await click(host.querySelector('ol li button'));
  expect(props.onTag.mock.calls).toEqual([['tag:a']]);
});

it('Fast-forwarded skimming and a full watch are different things, distinguishable in one row', async () => {
  expect(watchNote({
    id: 1, name: '', creator: null, play_seconds: 100, duration: 1000, max_reached: 0.9, o_count: 0, kind: 'library',
  })).toBe('Seek-skipped');
  const { host } = await open();
  await click(tabNamed(host, 'Recently watched'));
  const entry = host.querySelector('[role=tabpanel] article')!;
  expect(entry.querySelector('a')?.getAttribute('href')).toBe('/assets/42');
  expect(entry.textContent).toContain('Actual 50% · reached 90%');
});

it('An empty library offers an add-media entry linked to library settings', async () => {
  const { host } = await open(payload({ by_loc: [], by_library: [] }));
  expect(host.querySelector('h3')?.textContent).toBe('No videos yet');
  expect(radialCharts(host)).toEqual([]);
  expect(host.querySelector('[role=tabpanel] section[aria-label]')).toBeNull();
  expect(buttonNamed('Add media', host)).toBeNull();
  expect(linkNamed(host, 'Add media')?.getAttribute('href')).toBe('/settings/library');
});

it('Media configuration and add follows are two separate destinations, with secondary add-follows on the left', async () => {
  const props = legacyProps();
  const { host } = await open(payload({ by_loc: [], by_library: [] }), props);
  expect(actionOrder(host.querySelector('[data-empty-state]'))).toEqual(['Add follows', 'Add media']);
  expect(linkNamed(host, 'Add follows')?.getAttribute('href')).toBe('/subscriptions?tab=add');
  expect(looksLikeButton(linkNamed(host, 'Add follows'))).toBe(true);
});

/** Empty-state destinations render as secondary solid buttons (white fill, hairline border), not a row of underlined text links. */
const looksLikeButton = (link: Element | null) =>
  !!link && link.className.includes('border-border-button-default') && !link.className.includes('hover:underline');
const linkNamed = (root: ParentNode, name: string) =>
  [...root.querySelectorAll('a')].find((a) => a.textContent === name) ?? null;

it('With no content tags the empty state offers a "Complete details" button into the data organization page', async () => {
  const { host } = await open(payload({ top_tags: [] }));
  const link = linkNamed(host, 'Complete details');
  expect(link?.getAttribute('href')).toBe('/data-cleanup');
  expect(looksLikeButton(link)).toBe(true);
});

it('When the first-screen fetch fails only one error shows and no empty board paints', async () => {
  const { host } = await open(null);
  const alert = host.querySelector('[role=alert]');
  // Copy goes through the legacy layer's `requestErrorMessage`: when the server supplies a reason message, use it; the page does not say it a second time.
  expect(alert?.textContent).toContain('Reading library stats failedDatabase is currently browse-only');
  expect(alert?.textContent).toContain('Reading library stats failedDatabase is currently browse-only');
  expect(host.querySelector('[role=tablist]')).toBeNull();
});

it('Re-entering this page refetches: refresh on this page is a fresh re-entry and never reads the cache', async () => {
  const first = await open();
  expect(first.fetcher).toHaveBeenCalledTimes(1);
  await first.unmount();

  // The shell opens this page again: `openManagedRoute` prefetches first, then paints.
  await prefetchStats(new AbortController().signal);
  expect(first.fetcher).toHaveBeenCalledTimes(2);
  const host = await mount(
    <QueryClientProvider client={queryClient}><StatsPage {...legacyProps()} /></QueryClientProvider>);
  expect(first.fetcher).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role=tablist]')).not.toBeNull();
});

it('After unmount nothing touches the database: this page has no polling and should leave no other timers', async () => {
  vi.useFakeTimers();
  const { fetcher, unmount } = await open();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await unmount();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher, 'Fetching continued after unmount').toHaveBeenCalledTimes(1);
});
