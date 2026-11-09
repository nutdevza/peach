/* The page elements of the eleven management pages and `/resource-sync`: the page group mounts them on match, and mounting
 * opens that page (ADR-0031, "management pages open by route tree match").
 *
 * One open: wait for the shell to start routing (`pageOpens` in `@peach/shell` greater than 0), report `surfaceChanged` so the
 * shell tears down other surfaces and spreads management open, lay this page's skeleton (the same one the shell lays on cold
 * start; same key means no double render), ask `/healthz` once if needed, then go through `openManagedRoute` to fetch the
 * first screen and swap to the full page in the same task. First-frame props are computed by the element itself from the
 * address, preferences and shell state.
 *
 * Keyed by page-open epoch: each unclaimed history change is one open, so reopening the same path remounts and refetches;
 * claimed address writes (review page category change, follow management tab change) keep the generation and do not reopen.
 * With details stacked on top, the page group still matches this page: the key stays at the one from before the stack and the
 * page is not dismantled; elements mounted via background match (back/forward landing on details stacked over this page) do
 * not open right away, and open with the key of that generation's mount when details come down.
 *
 * On unmount, teardown happens only if this page is still rendered in `#stats` and the shell has not hidden it: when the
 * profile page or home stacks over, the shell only hides `#stats` and the page stays alive until the next surface claim.
 * Teardown queues into a microtask: unmount happens inside the router root's synchronous commit. */
import { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';

import { appSettingsStore } from '@peach/appearance';
import { followManageParams } from '../../follow-manage/manage-route';
import {
  isOverlayPath, managedEntry, openManagedRoute, peachHistory,
  configurationSection, isSettingsSectionPath, updateManagedRoute,
} from '@peach/history';
import { api, isAbort } from '@peach/legacy/core';
import {
  cameFromSetup, configurationRequestedSection, pageOpens, state, subscribeShell, writeShell,
} from '@peach/shell';

import { pageNavigationReady } from '../../../history/page-navigation';
import { managementSkeletonHtml, paintManagementPlaceholder } from '../../../management-placeholder';
import { isReviewCategory, reviewQueueOf } from '../../review/review';
import { javLibraryPath, javTab } from '../../jav/jav';
import { ShellActionsContext, useOpenEpoch } from '../router';
import type { ManagedOpenProps, ManagedPath, ShellActions } from '../shell-actions';

/** One open session's liveness: once the element unmounts it stops rendering, scrolling, and writing the address. */
interface Run {
  live: boolean;
  /** The epoch of the page once painted; 0 while the first screen is still being fetched. */
  revision: number;
  /** This round's read request (`/healthz`), aborted on unmount. */
  controller: AbortController;
}

/** This machine's write status (`/healthz`). */
interface Runtime {
  ledger_read_only?: boolean;
  ledger_read_only_message?: string;
  ledger_writer_origin?: string;
}

const readStarted = () => pageOpens > 0;
/** Whether the shell has started routing (`pageOpens` greater than 0). */
const useRoutingStarted = (): boolean => useSyncExternalStore(subscribeShell, readStarted);

const followLayout = (): string => (appSettingsStore().value.followLayout === 'table' ? 'table' : 'default');
const search = (): URLSearchParams => new URLSearchParams(window.location.search);

/** Read-only mode: an abort returns null, handled like defaults other than browse-only. */
function readRuntime(run: Run): Promise<Runtime | null> {
  return (api('/healthz', { signal: run.controller.signal }) as Promise<Runtime>)
    .catch((error: unknown) => { if (isAbort(error)) return null; throw error });
}

function writerProps(runtime: Runtime | null, path: string) {
  return {
    readOnly: !!runtime?.ledger_read_only,
    readOnlyMessage: runtime?.ledger_read_only_message || 'This device is browse-only',
    writerUrl: runtime?.ledger_writer_origin ? new URL(path, runtime.ledger_writer_origin).href : '',
  };
}

/** The values handed to the page for this open, computed from the URL, the preferences, and the shell's state. Returns null if the user leaves while `/healthz` is pending. */
async function openProps(path: ManagedPath, run: Run): Promise<object | null> {
  if (path === '/jav') {
    const runtime = await readRuntime(run);
    if (!run.live) return null;
    return { tab: javTab(search().get('tab')), readOnly: !!runtime?.ledger_read_only } satisfies ManagedOpenProps['/jav'];
  }
  if (path === '/stats') return {} satisfies ManagedOpenProps['/stats'];
  if (path === '/taste') {
    const onboarding = cameFromSetup;
    writeShell({ cameFromSetup: false });
    return { onboarding } satisfies ManagedOpenProps['/taste'];
  }
  if (isSettingsSectionPath(path)) {
    if (window.location.hash === '#peachProxy') writeShell({ configurationRequestedSection: 'Network & access' });
    const section = search().get('section') || configurationRequestedSection || configurationSection(path);
    return (section ? { section } : {}) satisfies ManagedOpenProps['/settings/library'];
  }
  if (path === '/review') {
    const category = search().get('category') || '';
    const runtime = await readRuntime(run);
    if (!run.live) return null;
    return { category: isReviewCategory(category) ? category : '', queue: reviewQueueOf(search().get('queue')),
      ...writerProps(runtime, '/review') } satisfies ManagedOpenProps['/review'];
  }
  if (path === '/subscriptions') {
    const route = followManageParams('?' + search().toString());
    const runtime = await readRuntime(run);
    if (!run.live) return null;
    const preferences = appSettingsStore().value;
    return {
      ...route, pageSize: Number(preferences.followPageSize) || 20, layout: followLayout(), ...writerProps(runtime, '/subscriptions'),
    } satisfies ManagedOpenProps['/subscriptions'];
  }
  return {};
}

async function openPage(path: ManagedPath, actions: ShellActions, run: Run): Promise<void> {
  const seq = peachHistory.navigation.seq;
  const isCurrent = () => run.live && peachHistory.navigation.seq === seq;
  if (path === '/jav' && javTab(search().get('tab')) === 'library') {
    peachHistory.replace(javLibraryPath(window.location.search)); return;
  }
  if (path === '/subscriptions' && search().get('tab') === 'wants') {
    peachHistory.replace('/jav?tab=wants'); return;
  }
  if (path === '/subscriptions' && search().get('tab') === 'source') {
    peachHistory.replace('/settings/subscriptions'); return;
  }
  const stats = document.getElementById('stats');
  if (!stats) return;
  actions.surfaceChanged('management', path);
  paintManagementPlaceholder(stats, managementSkeletonHtml(path, {
    followLayout: followLayout(), followSort: search().get('sort') || '', followDir: search().get('dir') || '',
  }));
  void pageNavigationReady(isCurrent, stats, { pending: true });
  if (path === '/taste') {
    writeShell({
      state: {
        ...state, creator: '', studio: '', tag: '', tag_match: 'all', len: '', dur_min: '', dur_max: '', orient: '',
        region: '', state: '', q: '', jav: '',
      },
    });
    actions.clearSearch();
  }
  const props = await openProps(path, run);
  if (!props) return;
  const opened = await openManagedRoute(path, props, { container: stats, isCurrent });
  if (opened) run.revision = managedEntry(stats)?.revision ?? 0;
  /* The settings page's selected tab is handed only to the painted instance: if it never painted (navigated away mid-fetch) it is saved for the next open. */
  if (isSettingsSectionPath(path) && opened) writeShell({ configurationRequestedSection: '' });
  if (opened && isCurrent()) {
    const { hash } = window.location;
    if (path === '/settings/library' && hash === '#libraryProcessing') {
      queueMicrotask(() => { if (isCurrent()) peachHistory.replace('/data-cleanup#libraryProcessing', null) });
    } else {
      void pageNavigationReady(isCurrent);
    }
  }
}

/** Elements of a page in the management area. */
export function ManagedMatch({ path }: { path: ManagedPath }) {
  const epoch = useOpenEpoch();
  // Every navigation rerenders once: the claim and address write made when a detail is torn down take no epoch, yet must still be visible.
  useLocation();
  const covered = isOverlayPath(peachHistory.navigation.location.pathname);
  const opening = useRef<number | null>(covered ? null : epoch);
  const wasCovered = useRef(covered);
  // An already-open background page keeps its epoch when details close; a background opened from a deep link waits for its first open.
  if (!covered && (!wasCovered.current || opening.current === null)) opening.current = epoch;
  wasCovered.current = covered;
  // The path is part of the key too: when a claimed address write moves from one page to another (settings rewriting to data management), the epoch stays and the page group swaps routes in the same place.
  const group = isSettingsSectionPath(path) ? '/settings/configuration' : path;
  return <ManagedPage key={`${group} ${opening.current ?? 'covered'}`} path={path} covered={opening.current === null} />;
}

function ManagedPage({ path, covered }: { path: ManagedPath; covered: boolean }) {
  const actions = useContext(ShellActionsContext);
  const started = useRoutingStarted();
  const run = useRef<Run | null>(null);
  useEffect(() => {
    if (isSettingsSectionPath(path)) {
      updateManagedRoute(document.getElementById('stats'), { section: configurationSection(path) });
    }
  }, [path]);
  useEffect(() => {
    if (covered || !actions || !started || run.current) return;
    const current: Run = { live: true, revision: 0, controller: new AbortController() };
    run.current = current;
    queueMicrotask(() => { if (current.live) void openPage(path, actions, current) });
    // Opens only once per mount: at the moment the shell starts routing, or it already started by mount time.
  }, [started]);
  useEffect(() => () => {
    const current = run.current;
    if (!current) return;
    current.live = false;
    current.controller.abort();
  }, []);
  return null;
}

/** 资源同步的旧直达地址转到二级页，不增加历史条目。 */
export function ResourceSyncRedirect() {
  const started = useRoutingStarted();
  const done = useRef(false);
  useEffect(() => {
    if (!started || done.current || isOverlayPath(peachHistory.navigation.location.pathname)) return undefined;
    done.current = true;
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      peachHistory.replace('/data-cleanup/resource-sync');
    });
    return () => { live = false };
  }, [started]);
  return null;
}
