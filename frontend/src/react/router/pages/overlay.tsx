/* The overlay group's elements (ADR-0031, "detail entries record which page they stack on"): video details, the four queues and
 * follow details each get one path (`OVERLAY_PATHS`); the overlay group matches on the real address, and on mount sends that
 * entry to the stage, tearing the stage down on unmount when the destination is not an overlay address.
 *
 * When they open:
 * - Startup (refresh, new tab, deep link): open at the moment the shell starts routing (`pageOpens` in `@peach/shell` goes
 *   from 0 to 1); if the router root installed after the shell started routing and the address still sits on the startup
 *   entry, open on mount. The startup entry reads no background; closing returns to each one's default origin.
 * - Unclaimed history changes (back/forward, addresses written directly by the React subtree or the shell via
 *   `peachHistory`): adopt the background the entry recorded (`adoptOverlayState`), then open. Elements key by navigation
 *   index; a back/forward that does not change the address (same entry replayed, empty `history.state`) still takes a new
 *   generation, remounts and opens again.
 * - Addresses the shell claimed writing: clicking a card hands the one-shot open request to the overlay element, which picks
 *   it up after mounting; after a queue finishes fetching, writing the address and switching the detail kind only change the
 *   entry. Opening and closing are handed to the shell (`ShellActions.openOverlay`, `closeStage`): fetching, origins and the
 *   stage handle all live in the shell.
 *
 * The page group side (`router.tsx`): with a background it matches on background and the background page is not remounted;
 * overlay addresses without a background also get a slot, where videos and queues backfill the catalog grid (the catalog
 * element) and follow details only yield `#stats` (`FollowDetailGround`) without rendering the list.
 *
 * Open, close and yield all queue into microtasks: the router root commits synchronously in the same call as the history
 * change, and the shell's stage open must render synchronously; rendering in the commit phase triggers flushSync warnings.
 * History notifications update the shell's title and sidebar synchronously; page fetching claims the current generation
 * afterwards. */
import { useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

import {
  adoptOverlayState, bootEntry, clearOverlayBackground, isOverlayPath, overlayTarget, peachHistory, type OverlayPath,
  settingsBackgroundOf, isPreferencePath,
} from '@peach/history';
import { pageOpens, queueOpens, subscribeShell } from '@peach/shell';

import { ShellActionsContext, useOpenEpoch } from '../router';

const readOpens = () => pageOpens;
const readQueueOpens = () => queueOpens;

/** The open intent from before the queue settles on an item: the route tree takes over and waits for the first screen to fix the real address; no temporary entries go into history. */
export function QueueRequests(): ReactNode {
  const actions = useContext(ShellActionsContext);
  const requests = useSyncExternalStore(subscribeShell, readQueueOpens);
  const opens = useSyncExternalStore(subscribeShell, readOpens);
  useEffect(() => {
    if (!requests || !opens) return;
    let live = true;
    queueMicrotask(() => { if (live) actions?.openQueueRequest?.() });
    return () => { live = false };
  }, [requests, opens, actions]);
  return null;
}

/** Whether and when a mounted cell should open by address. `run(boot)` runs once: `boot` true is the startup pass (when the shell starts routing,
 *  or when the route root mounts late and the address is still the startup one), false is a history change. `claimedOpens` allows claiming open requests that write the address.
 *  Overlay elements key by navigation sequence number; immersive elements key by page-open sequence number. */
export function useRouteOpen(run: (boot: boolean) => void, claimedOpens = false): void {
  const opens = useSyncExternalStore(subscribeShell, readOpens);
  const pending = useRef<'boot' | 'history' | null | undefined>(undefined);
  if (pending.current === undefined) {
    const { claimed } = peachHistory.navigation;
    pending.current = pageOpens === 0 || bootEntry() ? 'boot' : claimed && !claimedOpens ? null : 'history';
  }
  const latest = useRef(run);
  useEffect(() => { latest.current = run });
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false };
  }, []);
  useEffect(() => {
    const origin = pending.current;
    if (!origin || opens === 0) return;
    pending.current = null;
    queueMicrotask(() => { if (live.current) latest.current(origin === 'boot') });
  }, [opens]);
}

/* The element for an overlay URL: on mount it opens that target, and on unmount, when the destination is no longer an overlay URL, it collapses the stage (a video that is playing goes on into the mini player). */
function OverlayOpen() {
  const actions = useContext(ShellActionsContext);
  const latestActions = useRef(actions);
  useLayoutEffect(() => { latestActions.current = actions }, [actions]);
  useRouteOpen((boot) => {
    const location = peachHistory.navigation.location;
    const { pathname, search } = isPreferencePath(location.pathname) ? settingsBackgroundOf(location.state) || location : location;
    const target = overlayTarget(pathname, search);
    if (!actions || !target) return;
    clearOverlayBackground();
    if (!boot) adoptOverlayState(peachHistory.navigation.location.state);
    actions.openOverlay(target);
  }, true);
  useEffect(() => () => {
    queueMicrotask(() => {
      if (!isOverlayPath(peachHistory.navigation.location.pathname)) latestActions.current?.closeStage();
    });
  }, []);
  return null;
}

/** The overlay group's per-path element: mounted once per navigation, so replaying the same entry can open it again. */
export function OverlayMatch({ path }: { path: OverlayPath }): ReactNode {
  useOpenEpoch();
  const { location, seq, action } = peachHistory.navigation;
  const previous = isPreferencePath(location.pathname) ? settingsBackgroundOf(location.state) : null;
  const identity = (previous || location).pathname + (previous || location).search;
  const held = useRef({ identity, seq: previous?.seq ?? seq, navigationSeq: seq, settings: !!previous });
  if (previous) { held.current.settings = true; held.current.navigationSeq = seq }
  else if (held.current.settings && action === 'POP' && held.current.identity === identity) {
    held.current.settings = false; held.current.navigationSeq = seq;
  } else if (held.current.navigationSeq !== seq) held.current = { identity, seq, navigationSeq: seq, settings: false };
  return <OverlayOpen key={`${path} ${held.current.seq}`} />;
}

/* Follow detail without a background in the page group (deep links, refreshes, entries with no recorded background): draw no list and yield only to `#stats`; the list opens once the detail closes. */
function FollowGroundOpen() {
  const actions = useContext(ShellActionsContext);
  useRouteOpen(() => { actions?.follow?.ground() });
  return null;
}

/** Elements of the page group `/posts/:id`, keyed by page-open order. */
export function FollowDetailGround(): ReactNode {
  return <FollowGroundOpen key={useOpenEpoch()} />;
}
