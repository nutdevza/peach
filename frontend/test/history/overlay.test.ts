/* The background of detail-class history entries (`src/history/overlay.ts`): when the shell decides to open details it
 * records the background and carries it into `usr` when pushing the details address; switching entries between details reuses
 * the previous entry's background, and closing details and other addresses carry none. This walks the shell's call order:
 * `holdOverlayBackground()` then `shellNavigate(details address, {state: overlayState(kind)})`.
 * When back/forward lands on a details entry the shell first clears, then `adoptOverlayState(usr)`, and wherever details were
 * opened takes the origin with `takeOverlayReturn()`; the startup call does not run `adoptOverlayState`, and when the overlay
 * element adopts backgrounds is covered in `test/react/pages/overlay.test.tsx`. */
import { beforeEach, expect, it } from 'vitest';

import * as overlay from '../../src/history/overlay';
import {
  adoptOverlayState, clearOverlayBackground, holdOverlayBackground, isOverlayPath, overlayState, peachHistory,
  shellNavigate, takeOverlayReturn,
} from '../../src/history';

beforeEach(() => {
  shellNavigate('/', { replace: true, state: null });
  clearOverlayBackground();
});

const usr = () => peachHistory.navigation.location.state;
const length = () => window.history.length;

/** The shell opens one details entry: record the background at the moment of decision, then push the details address. */
function open(path: string, overlay: 'item' | 'follow' = 'item') {
  holdOverlayBackground();
  shellNavigate(path, { state: overlayState(overlay) });
}

/** Go back `steps` entries in the browser and wait for that history change to finish dispatching. */
function back(steps = 1) {
  return new Promise<void>((resolve) => {
    const stop = peachHistory.listen(() => { stop(); resolve() });
    peachHistory.go(-steps);
  });
}

/** The shell's `restoreRoute('history')` lands on this one: clear first, then pick up the background the entry recorded itself. */
function revisit() {
  clearOverlayBackground();
  adoptOverlayState(usr());
}

it('The shared history entry and the overlay background module use the same binding', () => {
  expect(overlay.holdOverlayBackground).toBe(holdOverlayBackground);
  expect(overlay.overlayState).toBe(overlayState);
  expect(overlay.adoptOverlayState).toBe(adoptOverlayState);
  expect(overlay.takeOverlayReturn).toBe(takeOverlayReturn);
});

it('Overlay URLs are video details, the four queues, and follows details; pages and immersive do not count', () => {
  for (const path of ['/assets/7', '/assets/5?mix=4', '/assets/2?parts=1', '/assets/3?editions=3', '/assets/9?playlist=2', '/posts/3']) {
    expect([path, isOverlayPath(path)]).toEqual([path, true]);
  }
  for (const path of ['/', '/playlists', '/follow', '/performers/x', '/immerse', '/trash', '/stats']) {
    expect([path, isOverlayPath(path)]).toEqual([path, false]);
  }
});

it('Clicking into details from the page: push carries the address and query string from the moment of opening', () => {
  shellNavigate('/performers/x?sort=new');
  const before = length();
  open('/assets/7');
  expect(usr()).toEqual({ backgroundLocation: { pathname: '/performers/x', search: '?sort=new' }, overlay: 'item' });
  expect(length()).toBe(before + 1);
});

it('Entering details from data management and replaying entries both keep the query string and in-page hash', () => {
  shellNavigate('/data-cleanup?view=issues#libraryProcessing');
  open('/assets/11');
  const state = usr();
  expect(state).toEqual({ backgroundLocation: {
    pathname: '/data-cleanup', search: '?view=issues', hash: '#libraryProcessing',
  }, overlay: 'item' });
  clearOverlayBackground();
  adoptOverlayState(state);
  expect(takeOverlayReturn()).toBe('/data-cleanup?view=issues#libraryProcessing');
});

it('The queue URL is pushed only after data lands: the background is the URL at the moment of the decision, not at the moment of the push', () => {
  shellNavigate('/?tag=a');
  holdOverlayBackground();
  shellNavigate('/stats', { replace: true });
  shellNavigate('/assets/5?mix=4', { state: overlayState('item') });
  expect(usr()).toEqual({ backgroundLocation: { pathname: '/', search: '?tag=a' }, overlay: 'item' });
});

it('Switching items in one queue keeps the previous item\'s background without making the previous details the background', () => {
  shellNavigate('/playlists');
  open('/assets/9?playlist=2');
  open('/assets/10?playlist=2');
  expect(usr()).toEqual({ backgroundLocation: { pathname: '/playlists', search: '' }, overlay: 'item' });
});

it('Switching items within a follow details group reuses the list\'s page (with filters)', () => {
  shellNavigate('/follow?view=saved');
  open('/posts/3', 'follow');
  open('/posts/4', 'follow');
  expect(usr()).toEqual({ backgroundLocation: { pathname: '/follow', search: '?view=saved' }, overlay: 'follow' });
});

it('The push that closes details carries no state, like other addresses; after clearing, entering details records it again', () => {
  shellNavigate('/trash');
  open('/assets/7');
  clearOverlayBackground();
  shellNavigate('/trash');
  expect(usr()).toBeNull();
  shellNavigate('/immerse');
  expect(usr()).toBeNull();
  open('/assets/8');
  expect(usr()).toEqual({ backgroundLocation: { pathname: '/immerse', search: '' }, overlay: 'item' });
});

it('The page never continues the old background: even uncleared, it re-records for this page', () => {
  shellNavigate('/');
  open('/assets/7');
  shellNavigate('/stats');
  open('/assets/8');
  expect(usr()).toEqual({ backgroundLocation: { pathname: '/stats', search: '' }, overlay: 'item' });
});

it('Landing on a details URL with no background (deep link, back): open another one without state; the details URL is not treated as a background', () => {
  shellNavigate('/assets/7');
  open('/assets/8');
  expect(usr()).toBeNull();
});

it('An asset jump to a follow entry replaces the current entry and keeps the background', () => {
  shellNavigate('/performers/x');
  open('/assets/7');
  const before = length();
  shellNavigate('/posts/9', { replace: true, state: overlayState('follow') });
  expect([location.pathname, length()]).toEqual(['/posts/9', before]);
  expect(usr()).toEqual({ backgroundLocation: { pathname: '/performers/x', search: '' }, overlay: 'follow' });
});

it('Back returns to the entry opened from the profile page: the origin is the profile page the entry recorded, not the page from opening other details later', async () => {
  shellNavigate('/performers/x?sort=new');
  open('/assets/7');
  clearOverlayBackground();
  shellNavigate('/performers/x?sort=new');
  shellNavigate('/');
  open('/assets/8');
  await back(3);
  expect(location.pathname).toBe('/assets/7');
  revisit();
  expect(takeOverlayReturn()).toBe('/performers/x?sort=new');
});

it('The origin is read once then cleared; when the entry records no background (page entry, deep link) it returns null and the shell applies its own default', () => {
  adoptOverlayState({ backgroundLocation: { pathname: '/trash', search: '' }, overlay: 'item' });
  expect([takeOverlayReturn(), takeOverlayReturn()]).toEqual(['/trash', null]);
  for (const state of [null, undefined, { from: 'router' }, { backgroundLocation: { search: '?q=1' } }]) {
    revisit();
    adoptOverlayState(state);
    expect([state, takeOverlayReturn(), overlayState('item')]).toEqual([state, null, undefined]);
  }
});

it('Clearing the background also clears any unclaimed origin with it', () => {
  adoptOverlayState({ backgroundLocation: { pathname: '/stats', search: '' }, overlay: 'item' });
  clearOverlayBackground();
  expect([takeOverlayReturn(), overlayState('item')]).toEqual([null, undefined]);
});

it('Follow details: Back returns to the details, and the origin preserves the list filters', async () => {
  shellNavigate('/follow?view=saved');
  open('/posts/3', 'follow');
  clearOverlayBackground();
  shellNavigate('/follow?view=saved');
  await back();
  expect(location.pathname).toBe('/posts/3');
  revisit();
  expect(takeOverlayReturn()).toBe('/follow?view=saved');
});

it('After going back into details then switching items: the new item keeps carrying the same background', async () => {
  shellNavigate('/playlists');
  open('/assets/9?playlist=2');
  open('/assets/10?playlist=2');
  shellNavigate('/stats');
  await back();
  expect(location.pathname + location.search).toBe('/assets/10?playlist=2');
  revisit();
  takeOverlayReturn();
  open('/assets/11?playlist=2');
  expect(usr()).toEqual({ backgroundLocation: { pathname: '/playlists', search: '' }, overlay: 'item' });
});
