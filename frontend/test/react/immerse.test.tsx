/* Immersive mode: how the queue is drawn, which entry autoplay and deep links land on, how many detail fetches each switch
 * makes, which caches the action keys write back, whether fetching is cancelled per session after close, and the gestures:
 * single click, double click, horizontal swipe, vertical swipe and the progress bar; plus its behavior as a resident
 * component (`RESIDENT_ROUTES.immerse`) in the route tree: host is `[data-immerse-host]` at the end of body, the handle is
 * handed over only after rendering, the renders inside `open` complete synchronously, and a thrown error unmounts only the
 * component while module-level listeners survive.
 *
 * Every case walks the app startup order: reload the modules, render the route tree, connect fetching, then take the handle
 * via `application-residents`' `loadImmerse`. The player is swapped for a bookkeeping double: what is tested here is what this
 * surface hands it and when it tears it down; real Video.js and real stream sessions are walked in the browser by e2e
 * (`e2e/immerse.test.ts`). */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { seekVideoBy, toggleVideoPlayback } from '../../src/player/playback';
import type { BatchDockApi, BatchDockHost } from '../../src/react/batch-dock/batch-dock-api';
import { catalogKey, type GridPage } from '../../src/react/catalog-grid/catalog-grid';
import {
  FIT_TOLERANCE, extendList, fitMode, immerseQuery, isWide, ownerOf, playable, type ImmerseItem,
} from '../../src/react/immerse/immerse';
import type { ImmerseApi, ImmerseHost } from '../../src/react/immerse/immerse-api';
import { itemKey, type DetailItem } from '../../src/react/item-detail/item-detail';
import type { ShellActions } from '../../src/react/router/shell-actions';
import { click, pending } from './render';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
// The cold load of the full route tree is timed separately; interaction cases use the Vitest default timeout.
const REACT_IMPORT_TIMEOUT_MS = 60_000;

type ActFlag = { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

interface Mounted { video: HTMLVideoElement; item: ImmerseItem; session: string; dispose: ReturnType<typeof vi.fn> }

const player = vi.hoisted(() => ({
  mounted: [] as Mounted[],
  cancelled: [] as string[],
  sessions: 0,
  /** Each video's frame dimensions; unregistered ones are treated as portrait. */
  dims: new Map<number, [number, number]>(),
}));

/** A fake media element: readable duration, writable playback position, and play/pause toggling `paused`. */
function fakeMedia(video: HTMLVideoElement, [width, height]: [number, number]) {
  let time = 0, paused = true;
  Object.defineProperties(video, {
    readyState: { configurable: true, get: () => 4 },
    duration: { configurable: true, get: () => 100 },
    currentTime: { configurable: true, get: () => time, set: (value: number) => { time = value } },
    paused: { configurable: true, get: () => paused },
    videoWidth: { configurable: true, get: () => width },
    videoHeight: { configurable: true, get: () => height },
  });
  video.play = vi.fn(async () => { paused = false });
  video.pause = vi.fn(() => { paused = true });
}

vi.mock('../../src/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/player')>();
  return {
    ...actual,
    newStreamSession: () => `s${++player.sessions}`,
    cancelStreamSession: (session: string) => { player.cancelled.push(session) },
    streamSpeedBits: () => 0,
    mountPlayer: (video: HTMLVideoElement, options: { item: ImmerseItem; session: string; onLoaded?: () => void }) => {
      fakeMedia(video, player.dims.get(options.item.id) ?? [1080, 1920]);
      const dispose = vi.fn();
      player.mounted.push({ video, item: options.item, session: options.session, dispose });
      queueMicrotask(() => options.onLoaded?.());
      return dispose;
    },
  };
});

/* ── Fake server ── */

const row = (id: number, patch: Partial<ImmerseItem> = {}): ImmerseItem => ({
  id, name: `clip-${id}.mp4`, duration: 60, cost: 'free', location: 'local', width: 1080, height: 1920, ctx_orient: 'Portrait', ...patch,
});

const detail = (id: number, patch: Partial<DetailItem> = {}): DetailItem => ({
  ...row(id), performers: ['Alpha'], creator: '', entity_refs: { performer: [{ id: 90 + id, has_image: true }] },
  feedback: undefined, o_count: 2, ...patch,
} as DetailItem);

interface Server {
  /** The entries each `/api/items` batch returns, taken in request order, repeating the last batch once exhausted. */
  draws: ImmerseItem[][];
  details?: Record<number, Partial<DetailItem>>;
  /** A details entry let through by the use case. */
  hold?: Map<number, Promise<unknown>>;
}

function serve(server: Server) {
  let drawn = 0;
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => structuredClone(body) });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { id: number; kind?: string };
      if (url === '/api/feedback') {
        if (body.kind === 'o') return json({ feedback: null, o_count: 3 });
        return json({ feedback: body.kind, o_count: 2 });
      }
      return json({ ok: true });
    }
    if (url.startsWith('/api/items?')) {
      const items = server.draws[Math.min(drawn, server.draws.length - 1)]!;
      drawn += 1;
      return json({ items });
    }
    const id = Number(/^\/api\/item\?id=(\d+)/.exec(url)?.[1]);
    if (id) {
      await server.hold?.get(id);
      return json(detail(id, server.details?.[id]));
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

const gets = (fetcher: ReturnType<typeof serve>, prefix: string) =>
  fetcher.mock.calls.filter(([url, init]) => !init?.method && url.startsWith(prefix)).length;
const posts = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls
  .filter(([, init]) => init?.method === 'POST').map(([url, init]) => [url, JSON.parse(String(init!.body))]);

/* ── Host and page ── */

type HostMock = { [K in keyof ImmerseHost]: Mock<ImmerseHost[K]> };

function makeHost(): HostMock {
  return {
    filters: vi.fn<ImmerseHost['filters']>(() => ({ q: '', orient: 'portrait', thumb: '0' })),
    seekSeconds: vi.fn<ImmerseHost['seekSeconds']>(() => 10),
    sourceOffline: vi.fn<ImmerseHost['sourceOffline']>((location) => location === 'gone'),
    displayName: vi.fn<ImmerseHost['displayName']>((item) => `Title ${String(item.name)}`),
    route: vi.fn<ImmerseHost['route']>(),
    closed: vi.fn<ImmerseHost['closed']>(),
    openItem: vi.fn<ImmerseHost['openItem']>(),
    openEntity: vi.fn<ImmerseHost['openEntity']>(),
    openUnowned: vi.fn<ImmerseHost['openUnowned']>(),
    toast: vi.fn<ImmerseHost['toast']>(),
    warn: vi.fn<ImmerseHost['warn']>(),
    failure: vi.fn<ImmerseHost['failure']>(),
  };
}

/* The resident component adapter reads the config functions from the same package directly; tests only hook into this scenario's handle contract. */
type ShellIslands = { connectApplication(next: (actions: ShellActions) => void): () => void;
  loadImmerse(host: ImmerseHost): Promise<ImmerseApi>;
  immerseApi(): ImmerseApi | null;
  loadBatchDock(host: BatchDockHost): Promise<BatchDockApi>;
};
const ISLANDS_MODULE = '../../src/react/application-residents';

async function load() {
  vi.resetModules();
  window.history.replaceState(null, '', '/');
  const [history, router, routes, query, islands] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes'),
    import('../../src/react/query'), import(/* @vite-ignore */ ISLANDS_MODULE) as Promise<ShellIslands>,
  ]);
  return { ...history, ...router, ...routes, queryClient: query.queryClient, islands };
}
type Loaded = Awaited<ReturnType<typeof load>>;

function shellActions(): ShellActions {
  return {
    openItem: vi.fn(), openEntity: vi.fn(), openTag: vi.fn(), openTasteSignal: vi.fn(), navigate: vi.fn(),
    openManage: vi.fn(), managePath: vi.fn(() => ''), openFollow: vi.fn(), receipt: vi.fn(), toast: vi.fn(),
    failure: vi.fn(), revealSource: vi.fn(async () => ''), reopenTutorial: vi.fn(async () => {}),
    routeReview: vi.fn(),
    routeFollowManage: vi.fn(), saveFollowPreference: vi.fn(), srcBadge: () => '', routeIndex: vi.fn(),
    savePeopleLayout: vi.fn(), exitSelectMode: vi.fn(), personAvatar: vi.fn(() => ({ html: '', face: '' })),
    authorAvatar: vi.fn(() => ''), showIndexTags: vi.fn(), openFollowAuthor: vi.fn(), openFollowTag: vi.fn(),
    openPlaylist: vi.fn(), canFlip: vi.fn(() => true),
    surfaceChanged: vi.fn(), clearSearch: vi.fn(), openImmerse: vi.fn(), openOverlay: vi.fn(), closeStage: vi.fn(), grid: {} as ShellActions['grid'],
  };
}

const unmounts: Array<() => void> = [];

/** At shell startup the route tree paints first (the root's options are the same ones as `mountApplication`); attaching fetches is a separate step the test can defer. */
async function mountRouter(r: Loaded) {
  unmounts.push(r.islands.connectApplication(() => {}));
  const tree = createRoot(document.createElement('div'), r.ROUTER_ROOT_OPTIONS);
  await act(async () => { tree.render(<r.RouterRoot actions={shellActions()} />) });
  unmounts.push(() => tree.unmount());
}
async function connect(r: Loaded) {
  await act(async () => { r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute)) });
}

/** Accept every report; `console.error` is only muted, not counted. */
function watchReports() {
  const reported = vi.fn();
  vi.stubGlobal('reportError', reported);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return reported;
}

let host: ReturnType<typeof makeHost>;
let api: ImmerseApi;
let loaded: Loaded;
let queryClient: Loaded['queryClient'];

const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const root = () => q('[data-immerse]')!;
const track = () => q('[data-immerse-track]')!;
const meta = () => q('[data-immerse-author]>span')!.textContent;
const routed = () => host.route.mock.calls.map(([id]) => id);
const current = () => player.mounted.at(-1)!;

/** Wait for one thing to hold: switching items takes two animation frames plus a 210ms settle, all awaited inside act. */
async function until(condition: () => boolean, ms = 2_000) {
  await act(async () => {
    const deadline = Date.now() + ms;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for the condition');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
}
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) });

async function open(startId: number | null = null) {
  await act(async () => { await api.open(startId) });
}

const key = (name: string, target: EventTarget = document) => act(async () => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
});

/** The next item on screen: the address bar points at it, the loading toast collapses, and one cell remains. */
const shown = (id: number) => until(() => routed().at(-1) === id && !!q('[data-immerse-loader]')?.hidden
  && document.querySelectorAll('[data-immerse-slide]').length === 1 && current().item.id === id);

function touch(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = [{ clientX: x, clientY: y }];
  Object.defineProperties(event, {
    touches: { value: type === 'touchend' ? [] : point },
    changedTouches: { value: point },
  });
  return event;
}
const swipe = (...steps: [string, number, number][]) => act(async () => {
  for (const [type, x, y] of steps) track().dispatchEvent(touch(type, x, y));
});

/* Wire up along the shell's `openTok`: the route tree is already rendered and wired to fetching; it mounts on the first open of immersive mode and gets the handle. */
beforeEach(async () => {
  player.mounted = [];
  player.cancelled = [];
  player.dims.clear();
  // Shuffle identity: j always takes i, so the playlist order is exactly the order the server gave.
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  loaded = await load();
  queryClient = loaded.queryClient;
  await mountRouter(loaded);
  await connect(loaded);
  host = makeHost();
  await act(async () => { api = await loaded.islands.loadImmerse(host) });
});

afterEach(async () => {
  (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = true;
  act(() => api.close());
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
});

describe('Playlist and start playback', () => {
  it('Sampling drops the aspect, randomly takes 60 items with offset fixed at 0; continuation dedupes by id and appends', () => {
    const query = new URLSearchParams(immerseQuery({ q: '', orient: 'portrait', tag: 'Drama', jav: null }));
    expect(Object.fromEntries(query)).toEqual({ tag: 'Drama', sort: 'rand', limit: '60', offset: '0', thumb: '' });
    expect(extendList([row(1), row(2)], [row(2), row(3)]).map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('The playlist rejects videos that are metered by traffic, lack duration, or are offloaded from the source', async () => {
    const offline = (location: string) => location === 'gone';
    expect(playable(row(1), offline)).toBe(true);
    expect(playable(row(2, { cost: 'metered' }), offline)).toBe(false);
    expect(playable(row(3, { duration: 0 }), offline)).toBe(false);
    expect(playable(row(4, { location: 'gone' }), offline)).toBe(false);
    const rootOffline = (key: string) => key === 'root-offline';
    expect(playable(row(5, { location: 'local', root_id: 'root-offline' }), rootOffline)).toBe(false);
    expect(playable(row(6, { location: 'local', root_id: 'root-online' }), rootOffline)).toBe(true);
    serve({ draws: [[row(1, { location: 'gone' }), row(2)]] });
    await open();
    expect(current().item.id).toBe(2);
    expect(meta()).toBe('· 1:00 · Portrait · 1/1');
  });

  it('The starting item plays first within its batch, and details fetch only its own copy', async () => {
    const fetcher = serve({ draws: [[1, 2, 3, 4, 5, 6].map((id) => row(id))] });
    await open(3);
    expect(player.mounted.map((entry) => entry.item.id)).toEqual([3]);
    expect(routed()).toEqual([3]);
    expect(meta()).toBe('· 1:00 · Portrait · 3/6');
    expect(gets(fetcher, '/api/item?id=')).toBe(1);
  });

  it('With an empty title it reads "Untitled video"', async () => {
    serve({ draws: [[1, 2, 3].map((id) => row(id))] });
    host.displayName.mockImplementation(() => '');
    await open(1);
    expect(q('[data-immerse-title]')!.textContent).toBe('Untitled video');
  });

  it('The deep-linked item is not in this batch: its details are fetched and inserted first, and the URL falls back to the same item', async () => {
    const fetcher = serve({ draws: [[1, 2, 3, 4, 5, 6].map((id) => row(id))] });
    await open(42);
    expect(current().item.id).toBe(42);
    expect(routed()).toEqual([42]);
    expect(q('[data-immerse-title]')!.textContent).toBe('Title clip-42.mp4');
    expect(meta()).toBe('· 1:00 · Portrait · 1/7');
    // The copy fetched on insert is the copy read on removal; it is never fetched a second time.
    expect(gets(fetcher, '/api/item?id=42')).toBe(1);
  });

  it('Switching items and switching back each fetch details once, and every switch asks the shell to write the address once', async () => {
    const fetcher = serve({ draws: [[1, 2, 3, 4, 5, 6, 7, 8].map((id) => row(id))] });
    await open();
    await key('ArrowDown');
    await shown(2);
    await key('ArrowUp');
    await shown(1);
    expect(routed()).toEqual([1, 2, 1]);
    expect(gets(fetcher, '/api/item?id=1')).toBe(1);
    expect(gets(fetcher, '/api/item?id=2')).toBe(1);
    expect(gets(fetcher, '/api/items?')).toBe(1);
    // Count once at playback start: once per video entering the frame.
    expect(posts(fetcher).filter(([url]) => url === '/api/play').map(([, body]) => body.id)).toEqual([1, 2, 1]);
  });

  it('Fewer than three items from the end triggers another batch; counts update once it is appended', async () => {
    const fetcher = serve({ draws: [[row(1), row(2), row(3), row(4)], [row(3), row(4), row(5)]] });
    await open();
    await key('ArrowDown');
    await shown(2);
    expect(gets(fetcher, '/api/items?')).toBe(2);
    expect(meta()).toBe('· 1:00 · Portrait · 2/5');
  });

  it('Arrow keys inside the input never switch items', async () => {
    serve({ draws: [[1, 2, 3, 4, 5].map((id) => row(id))] });
    await open();
    const input = document.createElement('input');
    document.body.append(input);
    await key('ArrowDown', input);
    await wait(50);
    expect(routed()).toEqual([1]);
  });

  it('Nothing can play under the current filter: close with an audible warning', async () => {
    serve({ draws: [[row(1, { cost: 'metered' })]] });
    await open();
    expect(api.isOpen()).toBe(false);
    expect(host.warn).toHaveBeenCalledWith('Nothing directly playable under the current filter');
    expect(player.mounted).toEqual([]);
  });

  it('Only the loading note shows before the first frame paints: stage, author title, and progress bar stay hidden', async () => {
    const hold = pending<void>();
    serve({ draws: [[row(1), row(2)]], hold: new Map([[1, hold.answer]]) });
    let opening!: Promise<void>;
    await act(async () => { opening = api.open(null) });
    await until(() => !!q('[data-immerse-loader]') && !q('[data-immerse-loader]')!.hidden);
    expect(root().hasAttribute('data-idle')).toBe(true);
    expect(q('[data-immerse-loader]')!.textContent).toContain('Loading');
    expect(q('[data-immerse-loader]')!.textContent, 'The spinner is already moving and the text has no ellipsis').not.toContain('…');
    expect(document.body.hasAttribute('data-immerse-open')).toBe(true);
    await hold.release();
    await act(async () => { await opening });
    expect(root().hasAttribute('data-idle')).toBe(false);
    expect(q('[data-immerse-loader]')!.hidden).toBe(true);
  });
});

describe('Close and stream sessions', () => {
  it('The close key tears down each cell\'s player, unlocks scrolling, and hands back to the shell', async () => {
    serve({ draws: [[row(1), row(2)]] });
    await open();
    const first = current();
    await click(q('[data-immerse-close]'));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(api.isOpen()).toBe(false);
    expect(api.activeVideo()).toBeNull();
    expect(root().hidden).toBe(true);
    expect(document.body.hasAttribute('data-immerse-open')).toBe(false);
    expect(document.querySelectorAll('[data-immerse-slide]')).toHaveLength(0);
    expect(host.closed).toHaveBeenCalledTimes(1);
  });

  it('Switching items tears down the old cell, and leaving the page cancels open cells by session', async () => {
    serve({ draws: [[1, 2, 3, 4, 5, 6].map((id) => row(id))] });
    await open();
    const first = current();
    await key('ArrowDown');
    await shown(2);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(current().dispose).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event('pagehide')) });
    expect(player.cancelled).toEqual([current().session]);
  });

  it('After closing, the in-flight one never mounts a player', async () => {
    const hold = pending<void>();
    serve({ draws: [[row(1), row(2)]], hold: new Map([[1, hold.answer]]) });
    let opening!: Promise<void>;
    await act(async () => { opening = api.open(null) });
    await until(() => !!q('[data-immerse-loader]') && !q('[data-immerse-loader]')!.hidden);
    act(() => api.close());
    await hold.release();
    await act(async () => { await opening });
    expect(player.mounted).toEqual([]);
    expect(api.isOpen()).toBe(false);
  });
});

describe('Action button', () => {
  const grid = (): GridPage => ({ items: [{ id: 1, name: 'clip-1.mp4', feedback: null, o_count: 2 }], offset: 0 } as unknown as GridPage);
  const card = () => queryClient.getQueryData<{ pages: GridPage[] }>(catalogKey('q=', 0))!.pages[0]!.items[0]!;
  const action = (label: string) => q<HTMLButtonElement>(`[data-immerse-actions] button[aria-label="${label}"]`)!;

  it('Watched writes into the same details: the details cache and catalog card update together, and the pressed state and label follow', async () => {
    const fetcher = serve({ draws: [[row(1), row(2)]] });
    queryClient.setQueryData(catalogKey('q=', 0), { pages: [grid()], pageParams: [0] });
    await open();
    expect(action('Mark as watched').getAttribute('aria-pressed')).toBe('false');
    expect(action('Log a climax').hasAttribute('aria-pressed')).toBe(false);
    await click(action('Mark as watched'));
    await until(() => action('Mark as watched').getAttribute('aria-pressed') === 'true');
    expect(posts(fetcher).filter(([url]) => url === '/api/feedback')).toEqual([['/api/feedback', { id: 1, kind: 'seen' }]]);
    expect(queryClient.getQueryData<DetailItem>(itemKey(1))!.feedback).toBe('seen');
    expect(card()).toMatchObject({ feedback: 'seen' });
    expect(action('Mark as watched').closest('[data-immerse-action]')!.textContent).toBe('Watched');
    expect(host.toast).toHaveBeenCalledWith('Marked as watched', expect.objectContaining({ undo: expect.any(Function) }));
  });

  it('Climax counts update with receipts, matching the catalog card\'s number', async () => {
    serve({ draws: [[row(1), row(2)]] });
    queryClient.setQueryData(catalogKey('q=', 0), { pages: [grid()], pageParams: [0] });
    await open();
    expect(action('Log a climax').closest('[data-immerse-action]')!.textContent).toBe('Climaxes 2');
    await click(action('Log a climax'));
    await until(() => action('Log a climax').closest('[data-immerse-action]')!.textContent === 'Climaxes 3');
    expect(card()).toMatchObject({ o_count: 3 });
    expect(host.toast).toHaveBeenCalledWith('Climax recorded', expect.anything());
  });

  it('Undoing a climax sends o-undo exactly once and never touches the watched or disliked tiers', async () => {
    const fetcher = serve({ draws: [[row(1), row(2)]], details: { 1: { feedback: 'seen' } } });
    await open();
    await click(action('Log a climax'));
    await until(() => host.toast.mock.calls.length === 1);
    const { undo } = host.toast.mock.calls[0]![1] as { undo: () => Promise<void> };
    await act(async () => { await undo() });
    expect(posts(fetcher).filter(([url]) => url === '/api/feedback').map(([, body]) => body.kind))
      .toEqual(['o', 'o-undo']);
  });

  it('Undoing watched: it removes this entry first, then writes back the previous tier', async () => {
    const fetcher = serve({ draws: [[row(1), row(2)]], details: { 1: { feedback: 'dislike' } } });
    await open();
    await click(action('Mark as watched'));
    await until(() => host.toast.mock.calls.length === 1);
    const { undo } = host.toast.mock.calls[0]![1] as { undo: () => Promise<void> };
    await act(async () => { await undo() });
    expect(posts(fetcher).filter(([url]) => url === '/api/feedback').map(([, body]) => body.kind))
      .toEqual(['seen', 'seen', 'dislike']);
  });

  it('After a dislike lands it pauses before moving to the next', async () => {
    serve({ draws: [[1, 2, 3, 4, 5, 6].map((id) => row(id))] });
    await open();
    await click(action('Mark as disliked'));
    await shown(2);
    expect(host.toast).toHaveBeenCalledWith('Marked as not my taste', expect.anything());
  });

  it('Write failures hand errors to the shell, and the key never sticks busy', async () => {
    serve({ draws: [[row(1), row(2)]] });
    await open();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'The write cannot land' }) })));
    await click(action('Mark as watched'));
    await until(() => host.failure.mock.calls.length === 1);
    expect(host.failure.mock.calls[0]![0]).toBe('Update feedback');
    expect(action('Mark as watched').hasAttribute('aria-busy')).toBe(false);
  });
});

describe('Author and title', () => {
  it('Co-stars read the first three with a count for the rest; clicking the author closes first, then opens the profile page of the first person', async () => {
    serve({ draws: [[row(1), row(2)]], details: { 1: { performers: ['Alpha', 'Beta', 'Gamma', 'Delta'] } } });
    await open();
    const author = q<HTMLAnchorElement>('[data-immerse-author]>a')!;
    expect(author.textContent).toBe('Alpha、Beta、Gamma and 4 people');
    expect(q('[data-immerse-avatar] .ini')!.textContent).toBe('A');
    expect(q('[data-immerse-avatar] img')!.getAttribute('src')).toBe('/entity-image?kind=performer&id=91&thumb=1');
    await click(author);
    expect(host.closed).toHaveBeenCalledTimes(1);
    expect(host.openEntity).toHaveBeenCalledWith('performer', 'Alpha');
  });

  it('Without a credited person clicking the author closes first, then enters "Unattributed"', async () => {
    serve({ draws: [[row(1), row(2)]], details: { 1: { performers: [], creator: '', entity_refs: {} } } });
    await open();
    const author = q<HTMLAnchorElement>('[data-immerse-author]>a')!;
    expect(author.textContent).toBe('Unassigned');
    await click(author);
    expect(host.closed).toHaveBeenCalledTimes(1);
    expect(host.openEntity).not.toHaveBeenCalled();
    expect(host.openUnowned).toHaveBeenCalledTimes(1);
  });

  it('Without cast it reads the creator, and with neither it is unattributed', () => {
    expect(ownerOf({ performers: [], creator: 'Someone', entity_refs: {} })).toEqual({ who: 'Someone', kind: 'creator', name: 'Someone', ref: null });
    expect(ownerOf({ performers: [], creator: '', entity_refs: {} })).toEqual({ who: 'Unassigned', kind: '', name: 'Unassigned', ref: null });
  });

  it('Clicking the title closes first, then enters details', async () => {
    serve({ draws: [[row(1), row(2)]] });
    await open();
    await click(q('[data-immerse-title]'));
    expect(api.isOpen()).toBe(false);
    expect(host.closed).toHaveBeenCalledTimes(1);
    expect(host.openItem).toHaveBeenCalledWith(1);
  });
});

describe('Picture and stage', () => {
  it('Full display only past a 1.05 ratio difference: landscape in a portrait box and portrait on a taller phone are never cropped', () => {
    expect(FIT_TOLERANCE).toBe(1.05);
    expect(fitMode(1920, 1080, 9 / 19.5)).toBe('contain');
    expect(fitMode(1080, 1920, 9 / 19.5)).toBe('contain');
    expect(fitMode(1080, 1920, 9 / 16 * 1.02)).toBe('cover');
    expect(fitMode(0, 0, 1)).toBeNull();
    expect(isWide({ videoWidth: 0, videoHeight: 0 }, { width: 1920, height: 1080 })).toBe(true);
    expect(isWide({ videoWidth: 1080, videoHeight: 1920 }, { width: 1920, height: 1080 })).toBe(false);
  });

  it('When a landscape frame paints the stage turns landscape; rotation or window changes recompute the fill', async () => {
    const size = (width: number, height: number) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    };
    size(1024, 768);
    try {
      player.dims.set(1, [1920, 1080]);
      serve({ draws: [[row(1, { width: 1920, height: 1080 }), row(2)]] });
      await open();
      expect(q('[data-immerse-stage]')!.hasAttribute('data-wide')).toBe(true);
      expect(root().hasAttribute('data-wide')).toBe(true);
      expect(current().video.dataset.fit).toBe('contain');
      size(1600, 900);
      await act(async () => { window.dispatchEvent(new Event('resize')) });
      expect(current().video.dataset.fit).toBeUndefined();
    } finally {
      size(1024, 768);
    }
  });
});

describe('Gestures', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    serve({ draws: [[1, 2, 3, 4, 5, 6].map((id) => row(id))] });
  });

  it('A mouse click toggles playback on the spot; the synthetic click browsers fire after a touch lift does not toggle again', async () => {
    await open();
    const { video } = current();
    (video.pause as ReturnType<typeof vi.fn>).mockClear();
    (video.play as ReturnType<typeof vi.fn>).mockClear();
    await click(track());
    expect(video.pause).toHaveBeenCalledTimes(1);
    await swipe(['touchstart', 700, 400], ['touchend', 700, 400]);
    await click(track());
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('A single tap waits out the double-tap window before switching; two taps in the same half seek forward or back without switching playback', async () => {
    await open();
    const { video } = current();
    (video.pause as ReturnType<typeof vi.fn>).mockClear();
    await swipe(['touchstart', 700, 400], ['touchend', 700, 400]);
    expect(video.pause).not.toHaveBeenCalled();
    await wait(320);
    expect(video.pause).toHaveBeenCalledTimes(1);
    video.currentTime = 50;
    await swipe(['touchstart', 700, 400], ['touchend', 700, 400], ['touchstart', 705, 402], ['touchend', 705, 402]);
    expect(video.currentTime).toBe(60);
    await swipe(['touchstart', 200, 400], ['touchend', 200, 400], ['touchstart', 200, 400], ['touchend', 200, 400]);
    expect(video.currentTime).toBe(50);
    await wait(320);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it('Horizontal swipe maps to progress: while dragging it only paints progress and blocks page scroll, and seeks only on release', async () => {
    await open();
    const { video } = current();
    const bar = q('[data-immerse-bar]')!;
    await swipe(['touchstart', 500, 400]);
    const lock = touch('touchmove', 520, 402);
    await act(async () => { track().dispatchEvent(lock) });
    expect(bar.hasAttribute('data-scrubbing')).toBe(true);
    const drag = touch('touchmove', 600, 405);
    await act(async () => { track().dispatchEvent(drag) });
    expect(drag.defaultPrevented).toBe(true);
    expect(q('[data-immerse-bar] i')!.style.width).toBe('10.00%');
    expect(video.currentTime).toBe(0);
    await swipe(['touchend', 600, 405]);
    expect(video.currentTime).toBe(10);
    expect(bar.hasAttribute('data-scrubbing')).toBe(false);
    expect(routed()).toEqual([1]);
  });

  it('A vertical swipe past 60px switches items: up is next, down is previous', async () => {
    await open();
    await swipe(['touchstart', 500, 600], ['touchmove', 502, 500], ['touchend', 502, 400]);
    await shown(2);
    await swipe(['touchstart', 500, 300], ['touchmove', 500, 400], ['touchend', 500, 500]);
    await shown(1);
    // A vertical swipe under 60px does nothing.
    await swipe(['touchstart', 500, 300], ['touchmove', 500, 330], ['touchend', 500, 340]);
    await wait(50);
    expect(routed()).toEqual([1, 2, 1]);
  });

  it('The progress bar paints on press and tracks the drag; seeking happens on release', async () => {
    await open();
    const { video } = current();
    const bar = q('[data-immerse-bar]')!;
    bar.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 20, right: 1000, bottom: 20, x: 0, y: 0, toJSON() {} });
    bar.setPointerCapture = vi.fn();
    const pointer = (type: string, clientX: number) => act(async () => {
      bar.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX, pointerId: 1 }));
    });
    await pointer('pointerdown', 250);
    expect(bar.hasAttribute('data-scrubbing')).toBe(true);
    expect(q('[data-immerse-bar] i')!.style.width).toBe('25.00%');
    await pointer('pointermove', 400);
    expect(q('[data-immerse-bar] i')!.style.width).toBe('40.00%');
    expect(video.currentTime).toBe(0);
    await pointer('pointerup', 400);
    expect(video.currentTime).toBe(40);
    expect(bar.hasAttribute('data-scrubbing')).toBe(false);
  });

  it('The frame preview above the progress bar: shown on mouse hover or horizontal drag, dismissed on leaving or releasing', async () => {
    serve({ draws: [[row(1, { has_thumb: true })]], details: { 1: { has_thumb: true } } });
    await open();
    const bar = q('[data-immerse-bar]')!;
    bar.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 20, right: 1000, bottom: 20, x: 0, y: 0, toJSON() {} });
    const preview = () => q('[data-immerse-bar] [data-player-seek-preview]')!;
    expect(preview().hidden).toBe(true);
    await act(async () => { bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 300, pointerType: 'mouse' })) });
    const image = preview().querySelector('img')!;
    expect(preview().hidden).toBe(true);
    Object.defineProperties(image, { complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: 320 } });
    await act(async () => image.dispatchEvent(new Event('load')));
    expect(preview().hidden).toBe(false);
    expect(preview().querySelector('span')!.textContent).toBe('0:30');
    // React's onPointerLeave is synthesized from pointerout.
    await act(async () => {
      bar.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, clientX: 300, pointerType: 'mouse', relatedTarget: document.body }));
    });
    expect(preview().hidden).toBe(true);
    await swipe(['touchstart', 500, 400], ['touchmove', 520, 402], ['touchmove', 600, 405]);
    expect(preview().hidden).toBe(false);
    expect(preview().querySelector('span')!.textContent).toBe('0:10');
    await swipe(['touchend', 600, 405]);
    expect(preview().hidden).toBe(true);
  });
});

describe('Play button', () => {
  const media = (duration: number, currentTime: number, paused = true) => {
    const video = document.createElement('video');
    let time = currentTime;
    Object.defineProperties(video, {
      duration: { value: duration },
      paused: { value: paused },
      currentTime: { get: () => time, set: (value: number) => { time = value } },
    });
    video.play = vi.fn(async () => {});
    video.pause = vi.fn();
    return video;
  };

  it('Seeking clamps between 0 and the duration; without metadata (NaN duration) only the lower bound clamps', () => {
    const video = media(100, 95);
    seekVideoBy(video, 10);
    expect(video.currentTime).toBe(100);
    seekVideoBy(video, -200);
    expect(video.currentTime).toBe(0);
    const early = media(Number.NaN, 5);
    seekVideoBy(early, 30);
    expect(early.currentTime).toBe(35);
  });

  it('Paused plays, playing pauses; without a video it does nothing', () => {
    const paused = media(100, 0, true), playing = media(100, 0, false);
    toggleVideoPlayback(paused);
    toggleVideoPlayback(playing);
    toggleVideoPlayback(null);
    expect(paused.play).toHaveBeenCalledTimes(1);
    expect(playing.pause).toHaveBeenCalledTimes(1);
  });
});

describe('Resident components', () => {
  const immerseHostOf = (r: Loaded) => r.managedEntries().find((entry) => entry.path === 'immerse')?.container as HTMLElement;

  it('The handle is only handed out after painting; the host is [data-immerse-host] at the end of body, directly containing the hidden outer frame, not wrapped in .peach-react', async () => {
    const r = await load();
    await mountRouter(r);
    let loading: Promise<ImmerseApi> | null = null;
    await act(async () => { loading = r.islands.loadImmerse(makeHost()) });
    expect(r.islands.immerseApi(), 'The route tree has not attached fetching yet, so no handle hands over').toBeNull();
    expect(immerseHostOf(r), 'This side is not drawn yet').toBeUndefined();

    await connect(r);
    let handed: ImmerseApi | null = null;
    await act(async () => { handed = await loading });
    expect(r.islands.immerseApi()).toBe(handed);
    const container = immerseHostOf(r);
    expect(container.hasAttribute('data-immerse-host')).toBe(true);
    expect(container.parentElement).toBe(document.body);
    expect(document.body.lastElementChild).toBe(container);
    expect(container.children).toHaveLength(1);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.hasAttribute('data-immerse')).toBe(true);
    expect(frame.hidden, 'The outer frame exists, hidden, before the first open').toBe(true);
    expect(container.querySelector('.peach-react')).toBeNull();
    expect(container.closest('.peach-react')).toBeNull();
    expect(handed!.isOpen()).toBe(false);
  });

  it('Every paint inside open completes within the handle: the loading hint shows in the opening beat, and the first item is already on screen when it returns', async () => {
    serve({ draws: [[row(1), row(2)]] });
    /* No act wrapper: act defers flushSync to its end, which hides whether the handle flushed synchronously on its own. */
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    const opening = api.open(null);
    expect(root().hidden, 'The outer frame already shows within the sync phase').toBe(false);
    expect(root().hasAttribute('data-idle')).toBe(true);
    expect(q('[data-immerse-loader]')!.hidden).toBe(false);
    expect(q('[data-immerse-loader]')!.textContent).toContain('Load content');
    expect(document.body.hasAttribute('data-immerse-open')).toBe(true);
    await opening;
    expect(root().hasAttribute('data-idle'), 'On return it is already painted with no wait for the next render').toBe(false);
    expect(q('[data-immerse-loader]')!.hidden).toBe(true);
    expect(document.querySelectorAll('[data-immerse-track] > [data-immerse-slide]')).toHaveLength(1);
    expect(meta()).toBe('· 1:00 · Portrait · 1/2');
    expect(q('[data-immerse-title]')!.textContent).toBe('Title clip-1.mp4');
    expect(api.activeVideo()).toBe(current().video);
  });

  it('A throw unmounts only the component and the host stays, the open flag on body remains, and the batch bar still renders; afterwards the toggle does not throw and the arrow-key and page-leave listeners stay attached', async () => {
    const reported = watchReports();
    const dockRoot = document.createElement('div');
    dockRoot.setAttribute('data-batch-dock', '');
    document.body.append(dockRoot);
    let dock!: BatchDockApi;
    await act(async () => { dock = await loaded.islands.loadBatchDock({ root: dockRoot, run: vi.fn() }) });
    serve({ draws: [[1, 2, 3, 4, 5, 6].map((id) => row(id))] });
    const container = immerseHostOf(loaded);
    /* Thrown while the first item exits the wall and the author title row paints its title. */
    host.displayName.mockImplementation(() => { throw new Error('The title never paints') });

    await open();
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(expect.objectContaining({ message: 'The title never paints' }));
    expect(container.isConnected, 'The host never withdraws').toBe(true);
    expect(container.childNodes.length, 'Component unmounted').toBe(0);
    expect(loaded.managedTaken(container)).toBe(false);
    expect(loaded.managedEntries().map((entry) => entry.path), 'Other faces still drawn').toEqual(['batch-dock']);
    expect(document.body.hasAttribute('data-immerse-open'), 'Unmounting the component never clears the body\'s open flag').toBe(true);
    expect(api.isOpen()).toBe(true);

    /* Listeners on the module do not go away with the component: arrow keys keep swapping items (handing the address write to the shell), and leaving the page still cancels open cells per session. */
    const first = current();
    await key('ArrowDown');
    await until(() => routed().at(-1) === 2);
    await act(async () => { window.dispatchEvent(new Event('resize')) });
    await act(async () => { window.dispatchEvent(new Event('pagehide')) });
    expect(player.cancelled).toContain(first.session);

    act(() => { expect(() => api.close()).not.toThrow() });
    expect(api.isOpen()).toBe(false);
    expect(document.body.hasAttribute('data-immerse-open')).toBe(false);
    expect(host.closed).toHaveBeenCalledTimes(1);
    host.displayName.mockImplementation((item) => `Title ${String(item.name)}`);
    await open();
    expect(api.isOpen()).toBe(true);
    act(() => { expect(() => api.close()).not.toThrow() });
    expect(container.childNodes.length, 'Stays empty until refresh, no self-healing').toBe(0);
    expect(reported, 'The deterministic throw is reported only once').toHaveBeenCalledTimes(1);
    /* The batch bar is painted last: its entrance animation runs on motion's frame loop, so it finishes right after painting and leaves no in-flight animation when the tree unmounts. */
    await act(async () => { dock.render({ count: 2, context: 'catalog', junkDismissed: false }) });
    expect(dockRoot.querySelector('[data-selection-dock] [role="status"]')?.textContent).toBe('Selected 2 items');
  });
});
