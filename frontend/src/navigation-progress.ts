/* Page-change progress bar: a 2px thin strip along the top edge of the page, standing in for the browser's own loading bar.
 *
 * Page changes go through pushState, so the browser no longer lights its loading bar; the skeleton is laid within 100ms, but when the server is slow the skeleton can stall for over ten seconds,
 * and the user can't tell whether they're waiting or it's frozen. This bar only answers "still fetching"; it reports no percentage: there's no trustworthy total for the fetch, and a progress that grows by elapsed time
 * would be made up (component contract "waiting and acknowledgment").
 *
 * The trigger has two paths: the shell is fetching the first screen of some page (`managedLoading`), or a component on screen is waiting for its first data — the query has observers,
 * has never fetched yet, and is fetching now (when changing a filter the list keeps its old rows, and the fetch for the new condition is this one). Background refetches that already have data,
 * polling after a failure, and prefetches nobody is watching don't count; otherwise polling would make it flicker every few seconds.
 *
 * A cached page change paints within 200ms, so the bar doesn't appear; once it appears it stops for at least 400ms, fills to full at the end, then fades out,
 * rather than flashing and vanishing. */
import type { Query } from '@tanstack/query-core';

import { listenManagedLoading, managedLoading } from './history/managed';
import { queryClient } from './query';

const SHOW_DELAY = 200;
const MIN_SHOWN = 400;
const FADE = 240;

/** Mount the progress bar and return an unmount function. */
export function installNavigationProgress(): () => void {
  const bar = document.createElement('div');
  bar.className = 'navprogress';
  bar.setAttribute('aria-hidden', 'true');
  bar.append(document.createElement('i'));
  document.body.append(bar);

  const waiting = new Set<Query>();
  let showTimer = 0;
  let hideTimer = 0;
  let shownAt = 0;
  let queued = false;

  const busy = () => managedLoading() || waiting.size > 0;
  const settle = () => {
    if (busy()) {
      clearTimeout(hideTimer);
      hideTimer = 0;
      if (bar.dataset.state) {
        bar.dataset.state = 'running';
        return;
      }
      showTimer ||= window.setTimeout(() => {
        showTimer = 0;
        shownAt = performance.now();
        bar.dataset.state = 'running';
      }, SHOW_DELAY);
      return;
    }
    clearTimeout(showTimer);
    showTimer = 0;
    if (bar.dataset.state !== 'running' || hideTimer) return;
    hideTimer = window.setTimeout(() => {
      bar.dataset.state = 'done';
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        delete bar.dataset.state;
      }, FADE);
    }, Math.max(0, MIN_SHOWN - (performance.now() - shownAt)));
  };
  /* When the shell switches pages, it first aborts the previous trip, then registers this one; within the same task it's fake first, then real; batch until the microtask before reading, so this doesn't count as the end. */
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      settle();
    });
  };

  /* When a no-data query refetches, Query reverts the status to pending; polling after failure looks like the first fetch; a failed one doesn't count as the first fetch. */
  const track = (query: Query) => {
    const { status, fetchStatus, errorUpdateCount } = query.state;
    if (status === 'pending' && fetchStatus === 'fetching' && !errorUpdateCount && query.getObserversCount() > 0) {
      waiting.add(query);
    }
    else waiting.delete(query);
  };
  const stopQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'removed') waiting.delete(event.query);
    else track(event.query);
    schedule();
  });
  const stopManaged = listenManagedLoading(schedule);
  for (const query of queryClient.getQueryCache().getAll()) track(query);
  schedule();

  return () => {
    stopQueries();
    stopManaged();
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    bar.remove();
  };
}
