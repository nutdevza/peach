/* The site-wide browser history (`src/history/`): the shell writes the URL through `shellNavigate`, and back/forward as well as writes from the React subtree
 *  all dispatch from this one object. */
import { afterEach, beforeEach, expect, it } from 'vitest';

import * as sharedHistory from '@peach/history';
import { peachHistory, routeMetaOf, shellNavigate, type Navigation } from '../../src/history';

let seen: Navigation[] = [];
let stop = () => {};
beforeEach(() => {
  shellNavigate('/', { replace: true });
  seen = [];
  stop = peachHistory.listen((navigation) => { seen.push(navigation) });
});
afterEach(() => stop());

/** The browser's own back and forward: the address changes first, then `popstate` fires. */
function pop(path: string) {
  window.history.replaceState(window.history.state, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

it('The shared history entry and the real browser history module share one binding', () => {
  expect(sharedHistory.peachHistory).toBe(peachHistory);
  expect(sharedHistory.shellNavigate).toBe(shellNavigate);
});

it('push adds a history entry, replace does not', () => {
  const length = window.history.length;
  shellNavigate('/stats');
  expect([location.pathname, window.history.length]).toEqual(['/stats', length + 1]);
  shellNavigate('/taste', { replace: true });
  expect([location.pathname, window.history.length]).toEqual(['/taste', length + 1]);
  expect(seen.map((n) => n.action)).toEqual(['PUSH', 'REPLACE']);
});

it('Paths resolve against the current address per pushState rules: query-only or hash-only inputs keep the rest of the address', () => {
  shellNavigate('/performers?q=a');
  shellNavigate('?q=b');
  expect(location.pathname + location.search).toBe('/performers?q=b');
  shellNavigate('#top');
  expect(location.pathname + location.search + location.hash).toBe('/performers?q=b#top');
  shellNavigate(`${location.origin}/tags`);
  expect(location.pathname).toBe('/tags');
});

it('Cleaning the address carries the current entry\'s state over as-is', () => {
  peachHistory.push('/follow', { from: 'router' });
  const state = peachHistory.navigation.location.state;
  shellNavigate('/follow?onboarding=1', { replace: true, state });
  expect(peachHistory.navigation.location.state).toEqual({ from: 'router' });
  shellNavigate('/data-cleanup#libraryProcessing', { replace: true, state: null });
  expect(peachHistory.navigation.location.state).toBeNull();
});

it('Every change claims an increasing sequence number, back/forward included', () => {
  shellNavigate('/stats');
  pop('/');
  peachHistory.push('/tags');
  expect(seen.map((n) => n.action)).toEqual(['PUSH', 'POP', 'PUSH']);
  const [first, second, third] = seen.map((n) => n.seq);
  expect([second! - first!, third! - second!]).toEqual([1, 1]);
  expect(peachHistory.navigation).toBe(seen.at(-1));
  expect(seen[1]!.location.pathname).toBe('/');
});

it('The page-open counter increments only on unclaimed changes: shell-claimed address writes do not claim one, while back/forward and router push and replace each claim one', () => {
  const start = peachHistory.navigation.openEpoch;
  shellNavigate('/stats');
  shellNavigate('/stats?tab=1', { replace: true });
  pop('/');
  peachHistory.push('/tags');
  peachHistory.replace('/follow');
  expect(seen.map((n) => n.openEpoch - start)).toEqual([0, 0, 1, 2, 3]);
});

it('The top bar shuffle behavior is registered in route metadata: follows and follow management pages skip, taste and playlist pages reopen, and the stats page is not registered', () => {
  expect(routeMetaOf('/follow')?.refresh).toBe('skip');
  expect(routeMetaOf('/subscriptions')?.refresh).toBe('skip');
  expect(routeMetaOf('/playlists')?.refresh).toBe('reopen');
  expect(routeMetaOf('/taste')?.refresh).toBe('reopen');
  expect(routeMetaOf('/stats')?.refresh).toBeUndefined();
});

it('Object-style navigation uses canonical paths and preserves query, hash, and state', () => {
  const state = { from: 'react' };
  peachHistory.push({ pathname: '/item/12', search: '?t=93', hash: '#media' }, state);
  expect(location.pathname + location.search + location.hash).toBe('/assets/12?t=93#media');
  expect(peachHistory.navigation.location.state).toEqual(state);
  peachHistory.replace({ pathname: '/configuration', search: '?tab=source' }, state);
  expect(location.pathname + location.search).toBe('/settings/library?tab=source');
});

it('Back/forward compatibility URLs notify only once and keep the original history entry', () => {
  const state = { ...window.history.state, usr: { backgroundLocation: { pathname: '/jav', search: '?scope=library' }, overlay: 'item' } };
  const epoch = peachHistory.navigation.openEpoch;
  window.history.replaceState(state, '', '/parts/7/12?t=93#media');
  window.dispatchEvent(new PopStateEvent('popstate', { state }));
  expect(location.pathname + location.search + location.hash).toBe('/assets/12?t=93&parts=7#media');
  expect(window.history.state).toEqual(state);
  expect(seen).toHaveLength(1);
  expect(seen[0]!.action).toBe('POP');
  expect(seen[0]!.openEpoch).toBe(epoch + 1);
});
