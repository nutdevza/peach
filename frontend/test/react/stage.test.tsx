/* The details stage's behavior as a resident component (`RESIDENT_ROUTES.stage`) in the route tree: the host is
 * `[data-stage-host]` at the end of body, the handle is handed over only after rendering, the mini player node is already
 * rendered when the handle arrives, the renders inside `open` complete synchronously, switching details does not switch hosts,
 * and a thrown error unmounts only the component while the handle keeps working without throwing.
 *
 * Every case walks the app startup order: reload the modules, render the route tree, connect fetching, then take the handle
 * via `application-residents`' `loadStage`. The player is swapped for a bookkeeping double: what is tested here is how this
 * stage surface renders and when it hands over the handle; real Video.js, enter/exit and the mini player handoff are walked in
 * the browser by e2e (`e2e/stage.test.ts`), and the player's handoff between the two positions in `stage-player.test.ts`. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { BatchDockApi, BatchDockHost } from '../../src/react/batch-dock/batch-dock-api';
import type { DetailItem, ItemDetailHelpers, ItemDetailProps } from '../../src/react/item-detail/item-detail';
import type { ShellActions } from '../../src/react/router/shell-actions';
import type { StageApi, StageHost, StageItemRequest } from '../../src/react/stage/stage-api';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

type ActFlag = { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

const player = vi.hoisted(() => ({ mounted: [] as HTMLVideoElement[] }));

vi.mock('../../src/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/player')>();
  return {
    ...actual,
    cancelDetailStream: vi.fn(),
    mountPlayer: (video: HTMLVideoElement) => {
      player.mounted.push(video);
      return () => {};
    },
  };
});

/* ── Fake server ── */

const detail = (id: number): DetailItem => ({
  id, name: `sample_${id}.mp4`, title: `Video ${id}`, location: 'local', cost: 'free', size: 1024, duration: 3600,
  rating: 60, performers: ['七海ひな'], tags: [{ k: 'Drama' }],
} as DetailItem);

function serve() {
  const fetcher = vi.fn(async (url: string) => {
    const id = Number(/^\/api\/item\?id=(\d+)/.exec(url)?.[1]);
    if (id) return { ok: true, status: 200, json: async () => detail(id) };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

/* ── Host and requests ── */

function makeHost(): StageHost {
  const settings = {
    ambientMode: false, theaterMode: false, seekSeconds: 10, miniplayer: true, detailAutoplay: false, javImage: 'cover',
  };
  return {
    player: {
      settings: () => settings, saveSettings: vi.fn(), toast: vi.fn(), loadSourceStatus: vi.fn(async () => ({})),
      offlineReason: () => 'The drive is not mounted',
    },
    sourceOffline: () => false,
    expand: vi.fn(),
    openItem: vi.fn(),
  };
}

function helpers(patch: Partial<ItemDetailHelpers> = {}): ItemDetailHelpers {
  return {
    badgeHtml: () => '', titleHtml: (shown) => String(shown.name), displayName: (shown) => String(shown.name),
    javImage: () => 'cover',
    tagLabel: (tag) => tag, isDurationTag: () => false, tagCandidates: () => [], sourceOffline: () => false,
    offlineReason: () => 'The drive is not mounted', relatedSkeletonHtml: () => '', mixRelated: async () => [], wireDrag: vi.fn(),
    wireDragReorder: vi.fn(), ...patch,
  };
}

type RequestActions = StageItemRequest['actions'];
function actions(): { [K in keyof RequestActions]: Mock<RequestActions[K]> } {
  return {
    close: vi.fn(), present: vi.fn(), redirect: vi.fn(), openQueueItem: vi.fn(), reopen: vi.fn(),
    checkSource: vi.fn(async () => false), openSavedFollow: vi.fn(), openEntity: vi.fn(), openUnowned: vi.fn(), openRegion: vi.fn(),
    openTag: vi.fn(), addToPlaylist: vi.fn(), saveMix: vi.fn(), editPlaylist: vi.fn(), openPlaylists: vi.fn(),
    reveal: vi.fn(async () => ''), sync: vi.fn(async () => ({ text: '', removed: [] })), trashChanged: vi.fn(async () => {}),
    toast: vi.fn(), failure: vi.fn(),
  };
}

function request(id: number, patch: Partial<StageItemRequest> = {}): StageItemRequest {
  return {
    kind: 'item', id, queue: null, relatedLimit: 0, helpers: helpers(), actions: actions(),
    grid: { helpers: {} as ItemDetailProps['grid']['helpers'], actions: {} as ItemDetailProps['grid']['actions'] },
    layout: {} as ItemDetailProps['layout'], selectMode: false, selected: new Set(), seekSeconds: 10, ...patch,
  };
}

/* The resident component adapter reads the config functions from the same package directly; tests only hook into this scenario's handle contract. */
type ShellIslands = { connectApplication(next: (actions: ShellActions) => void): () => void;
  loadStage(host: StageHost): Promise<StageApi>;
  stageApi(): StageApi | null;
  loadBatchDock(host: BatchDockHost): Promise<BatchDockApi>;
};
const ISLANDS_MODULE = '../../src/react/application-residents';

async function load() {
  vi.resetModules();
  window.history.replaceState(null, '', '/');
  const [history, router, routes, islands] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes'),
    import(/* @vite-ignore */ ISLANDS_MODULE) as Promise<ShellIslands>,
  ]);
  return { ...history, ...router, ...routes, islands };
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

const stageHostOf = (r: Loaded) => r.managedEntries().find((entry) => entry.path === 'stage')?.container as HTMLElement;
const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);

let loaded: Loaded;
let api: StageApi;

/* Wire up along the shell's `openItem`: the route tree is already rendered and wired to fetching; it mounts on the first details open and gets the handle. */
beforeEach(async () => {
  player.mounted = [];
  loaded = await load();
  await mountRouter(loaded);
  await connect(loaded);
  await act(async () => { api = await loaded.islands.loadStage(makeHost()) });
});

afterEach(async () => {
  (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = true;
  act(() => api.dispose({ miniplayer: false }));
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.replaceChildren();
});

describe('Resident components', () => {
  it('Escape commands and native cancel close the inner layer first; with no popover open they close the details', async () => {
    serve();
    const opened = request(1);
    await act(async () => { await api.open(opened) });
    const dialog = q<HTMLDialogElement>('#stage')!;
    const { overlayHost } = await import('../../src/react/components/overlay-host');
    const host = overlayHost(dialog);
    const inner = document.createElement('div');
    inner.setAttribute('role', 'dialog');
    inner.tabIndex = -1;
    const close = vi.fn((event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation(); inner.remove();
    });
    inner.addEventListener('keydown', close);
    const sentinel = document.createElement('span');
    sentinel.hidden = true;
    sentinel.dataset.focusScopeEnd = '';
    host.append(inner, sentinel);
    act(() => api.requestEscape());
    expect(close).toHaveBeenCalledTimes(1);
    expect(opened.actions.close).not.toHaveBeenCalled();
    host.insertBefore(inner, sentinel);
    act(() => { dialog.dispatchEvent(new Event('cancel', { cancelable: true })) });
    expect(close).toHaveBeenCalledTimes(2);
    expect(opened.actions.close).not.toHaveBeenCalled();
    act(() => api.requestEscape());
    expect(opened.actions.close).toHaveBeenCalledTimes(1);
  });

  it('The handle is only handed out after painting; the host is [data-stage-host] at the end of body, directly containing the hidden mini player, not wrapped in .peach-react', async () => {
    const r = await load();
    await mountRouter(r);
    let loading: Promise<StageApi> | null = null;
    await act(async () => { loading = r.islands.loadStage(makeHost()) });
    expect(r.islands.stageApi(), 'The route tree has not attached fetching yet, so no handle hands over').toBeNull();
    expect(stageHostOf(r), 'This side is not drawn yet').toBeUndefined();

    await connect(r);
    let handed: StageApi | null = null;
    await act(async () => { handed = await loading });
    expect(r.islands.stageApi()).toBe(handed);
    const container = stageHostOf(r);
    expect(container.hasAttribute('data-stage-host')).toBe(true);
    expect(container.parentElement).toBe(document.body);
    expect(document.body.lastElementChild).toBe(container);
    expect([...container.children].map((el) => el.id), 'When the handle hands over the mini window node exists but the stage has not opened').toEqual(['miniplayer']);
    expect((container.firstElementChild as HTMLElement).hidden).toBe(true);
    expect(container.querySelector('.peach-react')).toBeNull();
    expect(container.closest('.peach-react')).toBeNull();
    expect(handed!.isOpen()).toBe(false);
  });

  it('Every paint inside open completes within the handle: during the sync phase the skeleton and popover are already up, on return the content is painted and focus sits on the close button; switching details keeps the host', async () => {
    serve();
    const container = stageHostOf(loaded);
    const first = request(1);
    /* No act wrapper: act defers flushSync to its end, which hides whether the handle flushed synchronously on its own. */
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    const opening = api.open(first);
    const dialog = q<HTMLDialogElement>('#stage')!;
    expect(dialog.parentElement, 'Floating window rendered directly in the host').toBe(container);
    expect(dialog.open, 'showModal already ran within the sync phase').toBe(true);
    expect(dialog.querySelector(':scope > [data-skeleton="detail"]'), 'Skeleton rendered in the synchronous section').not.toBeNull();
    expect(document.body.hasAttribute('data-detail-open')).toBe(true);
    expect(api.isOpen()).toBe(true);
    await opening;
    expect(dialog.querySelector('[data-stage-scroll] > .peach-react'), 'On return the content is already painted with no wait for the next render').not.toBeNull();
    expect(q('#vid'), 'The media box goes to the stage\'s player').toBe(player.mounted.at(-1));
    expect(document.activeElement?.id).toBe('closeStage');
    expect(first.actions.present, 'The rendered row is reported to the shell').toHaveBeenCalledTimes(1);
    expect(first.actions.present).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), null);

    const second = request(2);
    await api.open(second);
    expect(q('#stage'), 'With the same kind of details open, items swap in place and the popover never rebuilds').toBe(dialog);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[data-stage-scroll] > .peach-react'), 'On return the new entry is already painted').not.toBeNull();
    expect(second.actions.present, 'The swapped in place entry is reported to the shell too').toHaveBeenCalledTimes(1);
    expect(second.actions.present).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), null);
    expect(first.actions.present, 'The swapped-away row is no longer reported').toHaveBeenCalledTimes(1);
    expect(stageHostOf(loaded)).toBe(container);
    expect(document.querySelectorAll('[data-stage-host]')).toHaveLength(1);
    expect([...container.children].map((el) => el.id)).toEqual(['stage', 'miniplayer']);

    api.dispose({ miniplayer: false });
    expect(q('#stage'), 'When dispose returns the popover is already torn down').toBeNull();
    expect(document.body.hasAttribute('data-detail-open')).toBe(false);
    expect([...container.children].map((el) => el.id), 'The mini window node stays').toEqual(['miniplayer']);

    await api.open(request(3));
    expect(q('#stage'), 'Reopening after teardown rebuilds the popover under a new generation').not.toBe(dialog);
    expect(stageHostOf(loaded), 'Reopening uses the same host').toBe(container);
    expect([...container.children].map((el) => el.id)).toEqual(['stage', 'miniplayer']);
  });

  it('Re-entering a read video shows cache immediately, and background refresh never covers the content', async () => {
    serve();
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    await api.open(request(1));
    api.dispose({ miniplayer: true });
    let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/library-processing'
      ? Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'idle' }) })
      : url === '/api/local-players' ? Promise.resolve({ ok: true, status: 200, json: async () => ({ players: [] }) })
      : new Promise(resolve => { finish = resolve })));
    const opening = api.open(request(1));
    const dialog = q<HTMLDialogElement>('#stage')!;
    expect(dialog.querySelector('[data-skeleton="detail"]')).toBeNull();
    expect(dialog.querySelector('[data-item-side]')).not.toBeNull();
    finish({ ok: true, status: 200, json: async () => detail(1) });
    await opening;
    expect(dialog.querySelector('[data-skeleton="detail"]')).toBeNull();
  });

  it('An empty cached queue leaving details leaves no stage or waiting state', async () => {
    serve();
    const { queryClient } = await import('../../src/react/query');
    const { queueKey } = await import('../../src/react/item-detail/item-detail');
    const queue = { kind: 'parts' as const, seedId: 1 };
    queryClient.setQueryData(queueKey(queue), { ...queue, title: 'Sample volume group', items: [] });
    const props = request(1, { id: null, queue });
    vi.mocked(props.actions.redirect).mockImplementation(() => api.dispose({ miniplayer: false }));
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    await api.open(props);
    expect(props.actions.redirect).toHaveBeenCalledWith({ kind: 'gone' });
    expect(api.isOpen()).toBe(false);
    expect(q('#stage')).toBeNull();
  });

  it('On throw only the component unmounts, the host stays, the open marker on body remains and the batch bar still paints; afterwards each handle member can be called without throwing', async () => {
    const reported = watchReports();
    const dockRoot = document.createElement('div');
    dockRoot.setAttribute('data-batch-dock', '');
    document.body.append(dockRoot);
    let dock!: BatchDockApi;
    await act(async () => { dock = await loaded.islands.loadBatchDock({ root: dockRoot, run: vi.fn() }) });
    serve();
    const container = stageHostOf(loaded);
    /* Thrown when the content is drawn and the sidebar draws its tags. */
    const broken = request(1, { helpers: helpers({ tagLabel: () => { throw new Error('The tag never paints') } }) });

    await act(async () => { await api.open(broken) });
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(expect.objectContaining({ message: 'The tag never paints' }));
    expect(container.isConnected, 'The host never withdraws').toBe(true);
    expect(container.childNodes.length, 'When the component unmounts the popover goes with it').toBe(0);
    expect(q('#stage')).toBeNull();
    expect(loaded.managedTaken(container)).toBe(false);
    expect(loaded.managedEntries().map((entry) => entry.path), 'Other faces still drawn').toEqual(['batch-dock']);
    expect(document.body.hasAttribute('data-detail-open'), 'Unmounting the component never clears the body\'s open flag').toBe(true);
    expect(broken.actions.present, 'The unrendered row is not reported').not.toHaveBeenCalled();

    act(() => {
      expect(api.isOpen()).toBe(true);
      expect(api.showing(), 'The floating window unmounts with the component; there is no variant that swaps items in place').toBeNull();
      expect(api.activeVideo()).toBeNull();
      expect(() => api.update({ selectMode: true })).not.toThrow();
      expect(() => api.toggleTheater()).not.toThrow();
      expect(() => api.toggleMiniplayer()).not.toThrow();
      expect(() => api.closeMiniplayer()).not.toThrow();
      expect(api.miniplayerActive()).toBe(false);
      expect(api.miniplayerTakesCard(detail(2))).toBe(false);
      expect(() => api.repaintPoster()).not.toThrow();
      expect(() => api.requestClose()).not.toThrow();
    });
    expect(broken.actions.close, 'Close requests still go to the details\' own close').toHaveBeenCalledTimes(1);
    await act(async () => { await expect(api.exit()).resolves.toBeUndefined() });
    act(() => { expect(() => api.dispose({ miniplayer: false })).not.toThrow() });
    expect(api.isOpen()).toBe(false);
    expect(document.body.hasAttribute('data-detail-open')).toBe(false);
    await act(async () => { await expect(api.open(request(2))).resolves.toBeUndefined() });
    expect(api.isOpen()).toBe(true);
    act(() => { expect(() => api.miniplayerPlay(3)).not.toThrow() });
    act(() => { expect(() => api.dispose({ miniplayer: false })).not.toThrow() });
    expect(container.childNodes.length, 'Stays empty until refresh, no self-healing').toBe(0);
    expect(reported, 'The deterministic throw is reported only once').toHaveBeenCalledTimes(1);
    /* The batch bar is painted last: its entrance animation runs on motion's frame loop, so it finishes right after painting and leaves no in-flight animation when the tree unmounts. */
    await act(async () => { dock.render({ count: 2, context: 'catalog', junkDismissed: false }) });
    expect(dockRoot.querySelector('[data-selection-dock] [role="status"]')?.textContent).toBe('Selected 2 items');
  });
});
