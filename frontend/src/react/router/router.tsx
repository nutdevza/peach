/* Client-side navigation (ADR-0031, "React Router shell-stage takeover"): React Router's Declarative mode takes over history.
 * The management pages, the playlists and follows pages, the index and profile pages, the catalog grid and the junk queue, plus
 * the in-page components inside those pages (home filter bar, home new-releases row, top-bar search dropdown) and the resident
 * components (background tasks, bottom batch bar, sidebar color card, management header, immersive mode, settings panel,
 * sidebar, details stage) (`managed-routes.tsx`) are rendered by this tree. Every page, immersive mode and the details overlay
 * open by route match (the elements under `pages/`); the shell does no dispatching: it only subscribes to keep the title and
 * sidebar in sync with history and writes the address when the page changes.
 *
 * The low-level `<Router>` is used and history is the `@peach/history` instance: the address must be written at app startup,
 * while a history `<BrowserRouter>` builds itself only listens for `popstate` and never sees entries the shell pushes.
 * `unstable_HistoryRouter` is not used either: its updates are wrapped in `startTransition` by default, so two changes in a row
 * coalesce into one render and back/forward would open one step fewer.
 *
 * The page host is a sibling of the two `<Routes>` groups and lives for the whole session: rendered pages follow the entries
 * registered here (`@peach/history`'s `openManagedRoute`, one per container), and when the details stage stacks on top and the
 * address changes to `/assets/:id`, the page stays in place.
 *
 * Routes come in two groups: the page group matches on the background recorded by the entry itself (`usr.backgroundLocation`,
 * the startup entry does not read it), so the page the details stack on keeps matching and the background page is not
 * remounted; the overlay group matches the details and queue entries on the real address (`OVERLAY_PATHS`, `pages/overlay.tsx`).
 * In the page group, management, follows, index, profile, catalog and immersive each mount the element that opens that page by
 * address (`pages/managed.tsx`, `pages/follow.tsx`, `pages/index-entity.tsx`, `pages/catalog.tsx`, `pages/immerse.tsx`);
 * overlay addresses without a background also get a slot in the page group: videos and queues backfill the catalog grid, and
 * follow details only yield `#stats`. `path="*"` is an unrecognized address; nothing opens.
 *
 * One render error only takes down the surface that threw: each surface wraps its own error boundary (`SurfaceBoundary`), the
 * root has none, and the two `<Routes>` groups do not unmount because one surface did. Errors go through the root's
 * `onCaughtError` to `reportError`, one per occurrence. */
import {
  Component, createContext, memo, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
  type RefObject,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { RootOptions } from 'react-dom/client';
import { Route, Router, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router';

import {
  failManagedRoute, listenManagedEntry, managedEntries, navigationBackground, OVERLAY_PATHS, peachHistory,
  PREFERENCE_PATHS, isPreferencePath, settingsBackgroundOf, bootEntry,
  type ManagedEntry, type Navigation,
} from '@peach/history';

import { Providers } from '../providers';
import { LibraryProcessingDock } from '../library-processing/library-processing-dock';
import { NetworkBanner } from '../network-banner';
import { TutorialCenter } from '../onboarding/tutorial-center';
import { ClientUpdateBanner } from '../client-updates';
import { ReleaseNotice } from '../release-notice';
import { SettingsMatch } from './pages/settings';
import { CatalogChrome } from './pages/catalog';
import {
  BROWSE_ROUTES, CATALOG_PATHS, CATALOG_ROUTES, ENTITY_ROUTES, IMMERSE_ROUTES, INDEX_ROUTES, MANAGED_ROUTES, REDIRECT_ROUTES,
  isManagedPath, isRoutedPath, managedPage,
} from './managed-routes';
import { FollowDetailGround, OverlayMatch, QueueRequests } from './pages/overlay';
import type { ShellActions } from './shell-actions';

/* Page-open sequence number (`@peach/history`'s `openEpoch`): unclaimed history changes each take one; claimed address writes take none. A `popstate` with an unchanged address
 * (the same entry replayed) does not change the Router's location, but the generation still changes, and elements keyed by it still reopen. */
const OpenEpoch = createContext(0);

/** How many times this page has been opened: page elements key on it, so a reopen remounts; claimed address writes (in-page replace of params) do not remount. */
export const useOpenEpoch = (): number => useContext(OpenEpoch);

/** Capabilities handed in by the shell; the admin pages go back to the shell through them. */
export const ShellActionsContext = createContext<ShellActions | null>(null);

/** The route root commits synchronously in the same call as the history change (`flushSync`): by the time `shellNavigate` and back/forward return, both sets of `<Routes>`
 *  have matched against the new address and the previous page's elements are unmounted, so the shell writing a skeleton into the same container will not tear nodes React still manages.
 *  Element opens do not run inside this commit; each queues into the microtask after the commit. */
export function PeachRouter({ children }: { children: ReactNode }) {
  const [navigation, setNavigation] = useState<Navigation>(() => peachHistory.navigation);
  useLayoutEffect(() => {
    /* If anything changed between reading the initial value and subscribing here, apply the latest one. */
    setNavigation(peachHistory.navigation);
    return peachHistory.listen((next) => { flushSync(() => setNavigation(next)) });
  }, []);
  return (
    <OpenEpoch.Provider value={navigation.openEpoch}>
      <Router location={navigation.location} navigationType={navigation.action} navigator={peachHistory}>
        {children}
      </Router>
    </OpenEpoch.Provider>
  );
}

/* The only cell that rerenders with the URL: it hands the current `navigate` to the manage area host, and the host and page do not rerender on navigation. */
function NavigateInto({ target }: { target: RefObject<NavigateFunction | null> }) {
  const navigate = useNavigate();
  useLayoutEffect(() => { target.current = navigate });
  return null;
}

/** Navigation inside managed-area pages: paths landing on managed pages go to React Router, everything else goes to `actions.navigate`. Neither path claims it, so
 *  each gets its own page-open sequence number; open counts match back/forward. */
export function managedGo(path: string, actions: ShellActions, navigate: NavigateFunction): void {
  const target = new URL(path, window.location.href);
  if (!isManagedPath(target.pathname)) { actions.navigate(path); return }
  void navigate(`${target.pathname}${target.search}${target.hash}`);
}

/** The page host: renders the page the shell registered in each container (`#stats`, `#index`, `#grid` and one per in-page
 *  component's container, never tearing each other down).
 *
 *  Page changes and teardown are notified synchronously by `@peach/history`, and this renders to completion with `flushSync`
 *  on the spot: the shell just swapped the host in (or just withdrew it) within the same task, and rendering a beat later would
 *  be a blank frame. Each open takes a generation, pages remount per generation, and the first screen reads the just-fetched
 *  cache. In-place updates (`updateManagedRoute`) only swap that page's props with the generation unchanged and queue into the
 *  next render as usual: the shell's toggles may be pushed from the page's own effect, where `flushSync` is not allowed. */
function ManagedSurface() {
  const actions = useContext(ShellActionsContext);
  const [entries, setEntries] = useState<readonly ManagedEntry[]>(managedEntries);
  const navigate = useRef<NavigateFunction | null>(null);
  useLayoutEffect(() => {
    setEntries(managedEntries());
    return listenManagedEntry((next, sync) => {
      if (sync) flushSync(() => setEntries(next));
      else setEntries(next);
    });
  }, []);
  const go = useMemo(() => (path: string) => {
    if (actions && navigate.current) managedGo(path, actions, navigate.current);
  }, [actions]);
  return (
    <>
      <NavigateInto target={navigate} />
      {actions ? entries.map((entry) => (
        <SurfaceBoundary key={entry.revision} entry={entry}>
          <ManagedPortal entry={entry} actions={actions} go={go} />
        </SurfaceBoundary>)) : null}
    </>
  );
}

/** A one-surface-per-layer error boundary. Once caught, that surface paints empty and its registration and host are withdrawn (`failManagedRoute`), reopening the next time the shell opens it;
 *  keyed by generation, so a reopen is a fresh boundary instance. Reporting is not here: the root's `onCaughtError` already reported once. */
class SurfaceBoundary extends Component<{ entry: ManagedEntry; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    failManagedRoute(this.props.entry.container, this.props.entry.revision);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const ManagedPortal = memo(function ManagedPortal(
  { entry, actions, go }: { entry: ManagedEntry; actions: ShellActions; go: (path: string) => void },
) {
  if (!isRoutedPath(entry.path)) return null;
  return createPortal(managedPage(entry.path, entry.props, actions, go), entry.host, String(entry.revision));
});

/* The page group's `location` is always given (current address when there is no background): without it `<Routes>` wraps an extra `LocationContext`,
 * and toggling back and forth would tear down and remount page elements. The background reads the current entry (`navigationBackground`); the startup entry counts as none.
 * The two groups are segmented by page, with a few blank lines between segments. */
function RouteGroups({ children }: { children?: ReactNode }) {
  const location = useLocation();
  // Replaying the same entry keeps the URL unchanged and `useLocation` silent, yet the epoch still changes: after the startup entry replays, background reading has to begin.
  useOpenEpoch();
  const background = navigationBackground();
  const settingsBackground = isPreferencePath(location.pathname) && !bootEntry() ? settingsBackgroundOf(location.state) : null;
  return (
    <>
      <Routes location={background ?? location}>
        {/* ── Management area ── */}
        {Object.entries(MANAGED_ROUTES).map(([path, route]) => <Route key={path} path={path} element={route.element} />)}
        {/* 资源同步的旧直达地址转到数据管理下的二级页。 */}
        {Object.entries(REDIRECT_ROUTES).map(([path, route]) => <Route key={path} path={path} element={route.element} />)}



        {/* ── Follows ── */}
        {Object.entries(BROWSE_ROUTES).map(([path, route]) => <Route key={path} path={path} element={route.element} />)}



        {/* ── Index ── */}
        {Object.entries(INDEX_ROUTES).map(([path, route]) => <Route key={path} path={path} element={route.element} />)}



        {/* ── Profile ── */}
        {Object.entries(ENTITY_ROUTES).map(([path, route]) => <Route key={path} path={path} element={route.element} />)}



        {/* ── Catalog ── six paths mount the same element (`pages/catalog.tsx`); switching paths does not remount, and the element keys by page itself. */}
        {CATALOG_PATHS.map((path) => <Route key={path} path={path} element={CATALOG_ROUTES['/'].element} />)}



        {/* ── Immersive ── */}
        {Object.entries(IMMERSE_ROUTES).map(([path, route]) => <Route key={path} path={path} element={route.element} />)}



        {/* ── Overlay addresses with no background ── video and queue mount on the catalog element and paint the grid back in; follow details only yields `#stats`. */}
        {OVERLAY_PATHS.map((path) => (
          <Route key={path} path={path} element={path === '/works/:code' ? null
            : path === '/posts/:id' ? <FollowDetailGround /> : CATALOG_ROUTES['/'].element} />
        ))}
        {PREFERENCE_PATHS.map(path => <Route key={path} path={path} element={null} />)}



        {/* An unrecognized address. `children` is for tests only. */}
        <Route path="*" element={children} />
      </Routes>



      {/* ── Overlay ── */}
      <Routes location={settingsBackground ?? location}>
        {OVERLAY_PATHS.map((path) => <Route key={path} path={path} element={<OverlayMatch path={path} />} />)}
        <Route path="*" element={null} />
      </Routes>
      <Routes>
        {PREFERENCE_PATHS.map(path => <Route key={path} path={path} element={<SettingsMatch />} />)}
        <Route path="*" element={null} />
      </Routes>
    </>
  );
}

/** The whole route tree. `children` renders inside the page group's `path="*"` element, for tests only: mounting once along with it proves the element was not remounted. */
export function RouterRoot({ children, actions = null, background, processing = false }:
  { children?: ReactNode; actions?: ShellActions | null; background?: ReactNode; processing?: boolean }) {
  return (
    <Providers>
      {background}
      <ShellActionsContext.Provider value={actions}>
        <PeachRouter>
          <ManagedSurface />
          <CatalogChrome />
          <QueueRequests />
          {processing && actions ? <LibraryProcessingDock toast={actions.toast} /> : null}
          {processing && actions ? <NetworkBanner /> : null}
          {processing && actions ? <ClientUpdateBanner navigate={actions.navigate} /> : null}
          {processing && actions ? <TutorialCenter actions={actions} /> : null}
          {processing && actions ? <ReleaseNotice navigate={actions.navigate} /> : null}
          <RouteGroups>{children}</RouteGroups>
        </PeachRouter>
      </ShellActionsContext.Provider>
    </Providers>
  );
}

/** The route tree root's options. Errors caught by the error boundary go to the global `reportError`, the same path as React's uncaught report,
 *  seen once each by the console and window's `error` event. `reportError` is fetched at runtime: the test environment may not have it. */
export const ROUTER_ROOT_OPTIONS: RootOptions = {
  onCaughtError: (error) => { globalThis.reportError?.(error) },
};
