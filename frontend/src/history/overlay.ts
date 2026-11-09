/* The background of detail-class history entries (ADR-0031, "overlay routing"): video details, the four queues and follow
 * details stack on top of a page, and their history entries record in `usr` which page they stack on (`backgroundLocation`),
 * so the entry states its own background.
 *
 * Write: the shell calls `holdOverlayBackground` the moment it decides to open details and carries it in `overlayState` when
 * pushing the details address; queue addresses wait to push until fetching completes, and the background is still the one from
 * the decision moment, not the address at push time. Switching entries between details reuses the previous entry's background
 * and does not nest; only path, query string and hash are stored, never DOM, objects or entry `key` (which would match no live
 * entry after refresh).
 *
 * Read: when back/forward lands on a details entry, the route tree's overlay element (`react/router/pages/overlay.tsx`) calls
 * `adoptOverlayState` to adopt the recorded background, and wherever the shell opened details uses `takeOverlayReturn` to get
 * the origin, returning to that page on close. Cold start (refresh, new tab, deep link) reads none: the entry keeps `usr`
 * across refresh but the page underneath was never rendered, so the page group backfills as if there were no background
 * (`/assets/:id` backfills the catalog grid), and closing returns to each one's default origin. */
import { matchPath } from 'react-router';
import { isPreferencePath } from './settings-route';

/** The addresses that overlay the page. They stay out of `isRoutedPath`: the page host does not paint them. */
export const OVERLAY_PATHS = [
  '/assets/:id',
  '/posts/:id',
  '/works/:code',
] as const;

export type OverlayPath = typeof OVERLAY_PATHS[number];

export type OverlayKind = 'item' | 'follow' | 'jav';

/** What an overlay URL opens: a video detail, a follow detail, or one of the four queues (`key` is the seed or the playlist). */
export type OverlayTarget =
  | { kind: 'jav'; code: string }
  | { kind: 'item' | 'follow'; id: number }
  | { kind: 'queue'; queue: 'mix' | 'parts' | 'editions' | 'playlist'; key: number; item: number };

const QUEUES = ['mix', 'parts', 'editions', 'playlist'] as const;

/** Which overlay path the address matches; local entries use a number, out-of-library videos use a valid code. */
export function overlayMatch(pathname: string, search = ''): { path: OverlayPath; target: OverlayTarget } | null {
  const address = new URL(pathname, 'https://peach.invalid');
  pathname = address.pathname;
  search ||= address.search;
  for (const path of OVERLAY_PATHS) {
    const match = matchPath(path, pathname);
    if (!match) continue;
    if (path === '/works/:code') {
      const code = match.params.code || '';
      return /^[A-Za-z0-9_-]{2,64}$/.test(code) ? { path, target: { kind: 'jav', code } } : null;
    }
    const values = Object.values(match.params);
    if (!values.every((value) => /^\d+$/.test(value ?? ''))) return null;
    const first = Number(values[0]);
    if (!Number.isSafeInteger(first) || first <= 0) return null;
    if (path === '/assets/:id') {
      const params = new URLSearchParams(search);
      const contexts = QUEUES.filter(queue => params.has(queue));
      if (contexts.length === 1) {
        const queue = contexts[0]!, value = params.get(queue)!;
        const key = Number(value);
        if (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(key)) {
          return { path, target: { kind: 'queue', queue, key, item: first } };
        }
      }
    }
    return { path, target: { kind: path === '/assets/:id' ? 'item' : 'follow', id: first } };
  }
  return null;
}

/** The overlay entry the address should open; null when the path or identity parameter is invalid. */
export const overlayTarget = (pathname: string, search = ''): OverlayTarget | null => overlayMatch(pathname, search)?.target ?? null;

export interface BackgroundLocation {
  pathname: string;
  search: string;
  hash?: string;
}

/** The detail entry's `usr`: which page it presses on, and which kind of detail is pressed. */
export interface OverlayState {
  backgroundLocation: BackgroundLocation;
  overlay: OverlayKind;
}

export const isOverlayPath = (pathname: string): boolean => (
  isPreferencePath(pathname.split(/[?#]/)[0]!) || OVERLAY_PATHS.some((pattern) => matchPath(pattern, pathname.split(/[?#]/)[0]!) !== null)
);

/** Background recorded on the entry: details and queue entries carry `{ backgroundLocation, overlay }` in `usr`; other entries do not. */
export function backgroundOf(state: unknown): BackgroundLocation | null {
  const background = (state as { backgroundLocation?: Partial<BackgroundLocation> } | null)?.backgroundLocation;
  if (typeof background?.pathname !== 'string') return null;
  return { pathname: background.pathname, search: typeof background.search === 'string' ? background.search : '',
    ...(typeof background.hash === 'string' && background.hash ? { hash: background.hash } : {}) };
}

let held: BackgroundLocation | null = null;
/* The origin of the entry back/forward landed on is taken once when details open and then cleared: it serves only the moment the entry itself opens, while later actions like switching entries, expanding the mini player,
 *  or reopening after returning from disk still follow the origin the shell recorded. */
let pendingReturn: string | null = null;

/** Decides the moment details open: when the current page is on screen, record it; already on a details URL (switching entries in the same queue, switching within a follow group,
 *  opening another entry from details) reuses the recorded background, and with none, records nothing, never treating a details URL as the background. */
export function holdOverlayBackground(): void {
  const { pathname, search, hash } = window.location;
  if (!isOverlayPath(pathname)) held = { pathname, search, ...(hash ? { hash } : {}) };
}

/** Cleared when truly leaving the detail: closing it, deleting the current entry, back and forward, and startup. */
export function clearOverlayBackground(): void {
  held = null;
  pendingReturn = null;
}

/** Back/forward landing on a history entry: if the entry recorded a background it reconnects, and from this details entry switching entries or expanding the mini player carries the same background;
 * the place that opened details takes it as the origin via `takeOverlayReturn`. Without a recorded background, do nothing. */
export function adoptOverlayState(state: unknown): void {
  const background = backgroundOf(state);
  if (!background) return;
  held = background;
  pendingReturn = background.pathname + background.search + (background.hash || '');
}

/** When a detail opens, takes the origin the back/forward stack carried in (path, query string, and hash), once, then clears it; null when there is none, and the shell uses its own default. */
export function takeOverlayReturn(): string | null {
  const path = pendingReturn;
  pendingReturn = null;
  return path;
}

/** The `usr` carried when pushing a detail address; omitted when there is no backdrop, same as page entries. */
export function overlayState(overlay: OverlayKind): OverlayState | undefined {
  return held ? { backgroundLocation: { ...held }, overlay } : undefined;
}
