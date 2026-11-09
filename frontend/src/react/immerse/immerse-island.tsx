/* Immersive mode (ADR-0031 step 11e): the fullscreen auto-advance player at `/immerse`. The queue, each slide's player,
 * loading indicators, gestures, action keys, author and title all live on this surface.
 *
 * Resident component `immerse` (the resident table in `router/managed-routes.tsx`): the route tree renders it into the resident
 * host `[data-immerse-host]` at the end of body, the host being that node itself. It is created by `loadImmerse` in
 * `application-residents.ts` the first time immersive mode opens and mounted into the document in the same task as the first
 * frame. The first frame is the hidden outer frame. The shell only gets the imperative entry `configureImmerse` provides:
 * immersive mode covers all pages, so the shell's keyboard, batch and playback shortcuts must be able to ask it at any moment
 * whether it is open and which video is current. The handle writes this module's store and notifies via `flushSync`; inside
 * `open(startId)` the skeleton, list and player renders all finish before it returns, so code that reads the DOM right after
 * reads freshly rendered structure.
 *
 * The outer frame, action column, author/title and progress bar are React-rendered; each slide (`[data-immerse-slide]` and the
 * `<video>` inside) is built and torn down imperatively by the controller in an empty track: Video.js needs to own that DOM,
 * the slide offset for vertical scrolling is written per frame to the slide's `style.transform`, and the progress bar width is
 * written on timeupdate. None of these three can wait for a re-render.
 *
 * The arrow-key, window-resize and page-leave listeners hang on the module, not the component: after an error boundary unmounts
 * this surface the shell can still open and close it, and slides still open on page leave are cancelled per session as before.
 *
 * The host is not wrapped in `.peach-react`: this fullscreen layer's typography has always been outside Preflight; buttons,
 * links and font sizes inherit the legacy layer's global rules, all styles live in `immerse.css`, no utility classes. */
import { useLayoutEffect, useRef, useSyncExternalStore, type MouseEvent, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { avatarInner, representativeOf } from '@peach/card-art';
import { fmtDur, realDuration } from '@peach/legacy/core';
import { spinnerHtml } from '@peach/legacy/ui';

import { apiSend } from '../../api';
import {
  cancelStreamSession, createSeekPreview, fmtSpeed, mountPlayer, newStreamSession, seekVideoBy, streamSpeedBits,
  toggleVideoPlayback, type SeekPreview,
} from '../../player';
import { replaceCatalogItem } from '../catalog-grid/catalog-grid';
import {
  FEEDBACK_URL, feedbackReceipt, fetchItem, ItemGone, itemKey, type DetailItem,
} from '../item-detail/item-detail';
import { queryClient } from '../query';
import {
  AXIS_LOCK_PX, DISLIKE_ADVANCE_MS, DOUBLE_TAP_MS, READY_TIMEOUT_MS, SLIDE_MS, SWIPE_PX, SYNTHETIC_CLICK_MS,
  TAP_SLOP_PX, WHEEL_GAP_MS, ensureDetail, extendList, fetchImmerseList, fitMode, immerseListKey, immerseQuery,
  isWide, ownerOf, type ImmerseItem,
} from './immerse';
import type { ImmerseApi, ImmerseHost } from './immerse-api';

/* ── State ── */

interface Shown { item: ImmerseItem; index: number; length: number }

interface View {
  open: boolean;
  /** Before the first clip leaves the frame, only the loading hint remains: frame, action column, author title, and progress bar appear together in the shapes they have at exit, never laid out
   *  as portrait first and then jumping. The clip keeps buffering in the hidden stage as usual. */
  idle: boolean;
  /** The stage shape flips only when a clip truly leaves the frame. If it flipped early while the new clip preloads, the old clip still on screen would be squeezed into
   *  a frame of a different ratio. */
  wide: boolean;
  /** The full loading hint sentence (with read speed); null means collapsed. */
  loading: string | null;
  shown: Shown | null;
}

/** One cell: the outer layer handles vertical scrolling and the inner video is handed to Video.js. The current cell is held in a variable, not looked up by id: Video.js
 *  moves the video's id onto its wrapping div after mounting. */
interface Slide {
  el: HTMLDivElement;
  video: HTMLVideoElement;
  session: string;
  release: () => void;
  disposed: boolean;
  /** Settled on teardown: the step still waiting for the video source or for a picture stops waiting idly. */
  gone: Promise<void>;
  leave: () => void;
}

interface Dom { root: HTMLElement; track: HTMLElement; bar: HTMLElement; progress: HTMLElement }

const CLOSED: View = { open: false, idle: false, wide: false, loading: null, shown: null };

let host: ImmerseHost | null = null;
let dom: Dom | null = null;
let view: View = CLOSED;
const listeners = new Set<() => void>();
/* Each open and close bumps the epoch: fetches and waits returning with the wrong epoch are discarded. */
let generation = 0;
let seed = 0;
let draw = 0;
let query = '';
let list: ImmerseItem[] = [];
let index = 0;
let switching = false;
let extending = false;
let current: Slide | null = null;
const slides = new Set<Slide>();
let loadingLabel = '';
let loadingItem: ImmerseItem | null = null;
let ticker = 0;
/** Which cell a progress bar drag acts on; absent before the first item comes on screen and after closing. */
let scrubTarget: { video: HTMLVideoElement; duration: () => number } | null = null;
let scrubbing = false;
/** The frame preview above the progress bar, swapping with the current cell: same image-fetching and clamping as the detail player. */
let seekPreview: SeekPreview | null = null;

function immerseHost(): ImmerseHost {
  if (!host) throw new Error('Immersive mode is not wired to a host yet (configureImmerse)');
  return host;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/* By the time we return, rendering is done. Once this face throws and the error boundary unmounts it, nobody subscribes; `view` still lands in the store, drawn by no one, thrown from nowhere. */
function paint(): void {
  flushSync(notify);
}

/* ── Loading hint ── */

function loadingText(): string {
  const speed = loadingItem ? streamSpeedBits(loadingItem.id) : 0;
  return speed ? `${loadingLabel} · ${fmtSpeed(speed)}` : loadingLabel;
}

/** Opens and closes the loading hint. While open, refreshes the read speed every 500ms for the current item. */
function setLoading(label: string | null, item: ImmerseItem | null = null): void {
  clearInterval(ticker);
  ticker = 0;
  if (label === null) { view = { ...view, loading: null }; paint(); return }
  loadingLabel = label;
  loadingItem = item;
  view = { ...view, loading: loadingText() };
  paint();
  ticker = window.setInterval(() => {
    loadingItem = list[index] ?? null;
    view = { ...view, loading: loadingText() };
    paint();
  }, 500);
}

/* ── Each cell ── */

function createSlide(offset: number): Slide {
  const el = document.createElement('div');
  el.dataset.immerseSlide = '';
  if (offset) el.style.transform = `translateY(${offset}%)`;
  // The `video-js` class must be written on the video before mounting for Video.js to carry it onto the wrapping div.
  const video = document.createElement('video');
  video.className = 'video-js';
  video.playsInline = true;
  video.preload = 'auto';
  el.append(video);
  dom!.track.append(el);
  const session = newStreamSession();
  let leave = () => {};
  const gone = new Promise<void>((resolve) => { leave = resolve });
  const slide: Slide = { el, video, session, release: () => cancelStreamSession(session), disposed: false, gone, leave };
  slides.add(slide);
  return slide;
}

/** The player attached to this cell; it resolves once the stream is handed to video (or earlier, when torn down first). */
function loadSlide(slide: Slide, item: ImmerseItem): Promise<void> {
  return new Promise((resolve) => {
    slide.release = mountPlayer(slide.video, {
      kind: 'immerse', item, session: slide.session, onLoaded: resolve,
      onEnded: () => { if (view.open) void step(1) },
    });
    void slide.gone.then(resolve);
  });
}

/** Tear down one cell: cancel reads by session, dismantle the player, unmount the node. */
function disposeSlide(slide: Slide | null): void {
  if (!slide || slide.disposed) return;
  slide.disposed = true;
  slides.delete(slide);
  slide.leave();
  slide.release();
  slide.el.remove();
  if (current === slide) current = null;
}

const READY_EVENTS = ['loadeddata', 'canplay', 'error'] as const;

function waitReady(slide: Slide): Promise<void> {
  const { video } = slide;
  if (video.readyState >= 3) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      READY_EVENTS.forEach((event) => video.removeEventListener(event, done));
      resolve();
    };
    READY_EVENTS.forEach((event) => video.addEventListener(event, done, { once: true }));
    const timer = setTimeout(done, READY_TIMEOUT_MS);
    void slide.gone.then(done);
  });
}

/* ── Fill or fit ── */

function fitVideo(video: HTMLVideoElement): void {
  const track = video.closest<HTMLElement>('[data-immerse-track]');
  const box = track && track.clientWidth && track.clientHeight
    ? track.clientWidth / track.clientHeight
    : window.innerWidth / window.innerHeight;
  const mode = fitMode(video.videoWidth, video.videoHeight, box);
  if (mode === 'contain') video.dataset.fit = 'contain';
  else if (mode) delete video.dataset.fit;
}

const fitAll = () => dom?.track.querySelectorAll('video').forEach(fitVideo);

function applyFit(video: HTMLVideoElement): void {
  delete video.dataset.fit;
  if (video.readyState >= 1) fitVideo(video);
  else video.addEventListener('loadedmetadata', () => fitVideo(video), { once: true });
}

/** Changing the stage shape re-runs the fill test for every video in the frame. */
function setStage(wide: boolean): void {
  view = { ...view, wide };
  paint();
  fitAll();
}

/* ── Playlist and entry switching ── */

const fetchDraw = (): Promise<ImmerseItem[]> => {
  const at = query;
  return queryClient.fetchQuery({
    queryKey: immerseListKey(at, seed, draw),
    queryFn: () => fetchImmerseList(at, immerseHost().sourceOffline),
    staleTime: Infinity,
  });
};

function wireProgress(video: HTMLVideoElement, item: ImmerseItem): void {
  const duration = () => realDuration(video.duration) || realDuration(item.duration);
  video.addEventListener('timeupdate', () => {
    const total = duration();
    if (total && dom) dom.progress.style.width = `${(video.currentTime / total * 100).toFixed(2)}%`;
  });
  scrubTarget = { video, duration };
  seekPreview?.dispose();
  // The progress bar spans the viewport; the preview leaves 12px on each end, at the same level as the close key's distance from the edge.
  seekPreview = dom ? createSeekPreview(dom.bar, item, { inset: 12 }) : null;
}

function showSeekPreview(ratio: number): void {
  const total = scrubTarget?.duration();
  if (!seekPreview || !total) return;
  seekPreview.prime();
  seekPreview.show(ratio, total);
}

async function show(direction = 0): Promise<void> {
  const item = list[index];
  if (!item || switching) return;
  const mine = generation;
  /* The current item is handed to the shell to write into the address bar: after swiping through ten items and refreshing, the same video should come back, not a freshly drawn batch. */
  immerseHost().route(item.id);
  switching = true;
  setLoading(direction ? 'Switching' : 'Loading', item);
  let incoming: Slide | null = null;
  try {
    // This entry was just deleted (the detail returns `{error}`) and still renders: the author and action buttons simply have nothing to draw.
    await ensureDetail(item.id).catch((error: unknown) => { if (!(error instanceof ItemGone)) throw error });
    if (mine !== generation) return;
    const old = current, sliding = !!(direction && old);
    if (!sliding) disposeSlide(old);
    const next = createSlide(sliding ? (direction > 0 ? 100 : -100) : 0);
    incoming = next;
    applyFit(next.video);
    await loadSlide(next, item);
    await waitReady(next);
    if (next.disposed) return;
    setStage(isWide(next.video, item));
    if (sliding && old) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        old.el.style.transform = `translateY(${direction > 0 ? -100 : 100}%)`;
        next.el.style.transform = '';
      }));
      await new Promise((resolve) => setTimeout(resolve, SLIDE_MS));
      // Even when no animation frame runs (the page is in the background), the card must land in place, or the new video stays off screen.
      disposeSlide(old);
      next.el.style.transform = '';
    }
    if (next.disposed) return;
    current = next;
    incoming = null;
    next.video.play()?.catch(() => {});
    view = { ...view, idle: false, shown: { item, index, length: list.length } };
    wireProgress(next.video, item);
    void apiSend('/api/play', { id: item.id }).catch(() => {});
    setLoading(null);
  } catch {
    disposeSlide(incoming);
    if (mine === generation) setLoading(null);
  } finally {
    if (mine === generation) switching = false;
  }
}

async function step(direction: number): Promise<void> {
  if (switching || !view.open) return;
  const mine = generation;
  index += direction;
  setLoading('Switching', list[index] ?? null);
  // Reaching the tail fetches the next batch: an infinite stream. Each round is a fresh random sample, deduplicated by id and appended.
  if (index >= list.length - 3 && !extending) {
    extending = true;
    try {
      draw += 1;
      const more = await fetchDraw();
      if (mine === generation) list = extendList(list, more);
    } catch {
      // If the next-page fetch fails, wrap around within the batch already loaded.
    } finally {
      extending = false;
    }
  }
  if (mine !== generation) return;
  if (index >= list.length) index = 0;
  if (index < 0) index = list.length - 1;
  await show(direction);
}

async function open(startId: number | null): Promise<void> {
  const mine = ++generation;
  teardown();
  seed += 1;
  draw = 0;
  query = immerseQuery(immerseHost().filters());
  queryClient.removeQueries({ queryKey: ['immerse-list'] });
  view = { ...view, open: true, idle: true, shown: null };
  document.body.setAttribute('data-immerse-open', '');
  setLoading('Load content');
  try {
    let next = await fetchDraw();
    if (startId && !next.some((item) => item.id === startId)) {
      const selected = await ensureDetail(startId).catch((error: unknown) => {
        if (error instanceof ItemGone) return null;
        throw error;
      });
      if (selected?.id) next = [selected as ImmerseItem, ...next.filter((item) => item.id !== startId)];
    }
    if (mine !== generation) return;
    list = next;
    if (!list.length) {
      close();
      immerseHost().warn('Nothing directly playable under the current filter');
      return;
    }
    index = Math.max(0, list.findIndex((item) => item.id === startId));
    await show();
  } catch {
    if (mine !== generation) return;
    setLoading(null);
    close();
  }
}

/** The intermediate state where all cells are torn down and hint and gestures are collapsed. */
function teardown(): void {
  clearInterval(ticker);
  ticker = 0;
  clearTap();
  touch = null;
  scrubTarget = null;
  scrubbing = false;
  seekPreview?.dispose();
  seekPreview = null;
  [...slides].forEach(disposeSlide);
  switching = false;
}

function close(): void {
  if (!view.open) return;
  generation++;
  teardown();
  view = CLOSED;
  document.body.removeAttribute('data-immerse-open');
  paint();
  immerseHost().closed();
}

/* -- Single tap, double tap, and touch gestures --
   On phones, vertical swipes slice and horizontal swipes scrub. Horizontal swipes may start anywhere; the progress bar along the screen's bottom edge is nearly untouchable on phones.
   Displacement converts by screen width into a relative amount of duration, so from any position "right = forward". */

let tapTimer = 0;
let lastTap: { side: number; at: number } | null = null;
let ignoreClickUntil = 0;
let touch: { x: number; y: number; axis: '' | 'x' | 'y'; from: number; to?: number } | null = null;
let lastWheel = 0;

function clearTap(): void {
  clearTimeout(tapTimer);
  tapTimer = 0;
  lastTap = null;
}

/** Left and right halves: two taps on the same side seek backward or forward, one tap toggles playback (applied only after the double-tap window closes). */
function handleTap(clientX: number): void {
  const video = current?.video;
  if (!video) return;
  const side = clientX < window.innerWidth / 2 ? -1 : 1;
  const now = Date.now();
  if (lastTap && lastTap.side === side && now - lastTap.at <= DOUBLE_TAP_MS) {
    clearTap();
    seekVideoBy(video, immerseHost().seekSeconds() * side);
    return;
  }
  // With taps in different halves, the first is still a complete single tap; apply it immediately, then wait out the current tap.
  if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; toggleVideoPlayback(video) }
  lastTap = { side, at: now };
  tapTimer = window.setTimeout(() => {
    tapTimer = 0;
    lastTap = null;
    if (view.open) toggleVideoPlayback(current?.video);
  }, DOUBLE_TAP_MS);
}

function clickTrack(): void {
  // On touch, the synthetic click follows right after touchend; that tap is already handled by the single/double tap logic and must not toggle again.
  if (Date.now() < ignoreClickUntil) return;
  toggleVideoPlayback(current?.video);
}

const setBarScrubbing = (on: boolean) => dom?.bar.toggleAttribute('data-scrubbing', on);

function paintProgress(ratio: number): void {
  if (dom) dom.progress.style.width = `${(ratio * 100).toFixed(2)}%`;
}

function onTouchStart(event: TouchEvent): void {
  const target = event.target as Element | null;
  if (event.touches.length !== 1 || !target?.closest('[data-immerse-track]')) { touch = null; return }
  const video = current?.video;
  touch = { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY, axis: '', from: video ? video.currentTime || 0 : 0 };
}

function onTouchMove(event: TouchEvent): void {
  if (!touch || event.touches.length !== 1) return;
  const dx = event.touches[0]!.clientX - touch.x, dy = event.touches[0]!.clientY - touch.y;
  if (!touch.axis) {
    if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
    touch.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (touch.axis === 'x') setBarScrubbing(true);
  }
  if (touch.axis !== 'x') return;
  const video = current?.video, total = video ? video.duration || 0 : 0;
  if (!total) return;
  event.preventDefault(); // Horizontal swipes go to the progress bar, not page scrolling
  touch.to = Math.min(total, Math.max(0, touch.from + dx / window.innerWidth * total));
  paintProgress(touch.to / total);
  showSeekPreview(touch.to / total);
}

function onTouchEnd(event: TouchEvent): void {
  if (!touch) return;
  const gesture = touch;
  touch = null;
  ignoreClickUntil = Date.now() + SYNTHETIC_CLICK_MS;
  setBarScrubbing(false);
  seekPreview?.hide();
  if (gesture.axis === 'x') {
    const video = current?.video;
    if (video && gesture.to != null) video.currentTime = gesture.to;
    return;
  }
  const end = event.changedTouches[0]!, dx = end.clientX - gesture.x, dy = gesture.y - end.clientY;
  if (Math.abs(dy) > SWIPE_PX) { clearTap(); void step(dy > 0 ? 1 : -1); return }
  if (Math.abs(dx) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX) {
    event.preventDefault();
    handleTap(end.clientX);
  }
}

function onTouchCancel(): void {
  touch = null;
  setBarScrubbing(false);
  seekPreview?.hide();
}

function onWheel(event: WheelEvent): void {
  const now = Date.now();
  if (now - lastWheel < WHEEL_GAP_MS) return;
  lastWheel = now;
  void step(event.deltaY > 0 ? 1 : -1);
}

/* Progress bar dragging. One pointer set covers mouse and touch, and after pointer capture a hand slipping off the bar does not break the drag. While dragging, only progress paints;
   seek happens on release; seeking every frame would keep rebuffering remote sources. A plain click without dragging takes the same path: pointerdown already
   painted progress, and pointerup lands it. */
function barRatio(event: PointerEvent): number {
  const box = dom!.bar.getBoundingClientRect();
  return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
}

function scrubStart(event: PointerEvent<HTMLDivElement>): void {
  if (!scrubTarget?.duration()) return;
  scrubbing = true;
  setBarScrubbing(true);
  event.currentTarget.setPointerCapture(event.pointerId);
  paintProgress(barRatio(event));
  showSeekPreview(barRatio(event));
  event.preventDefault();
}

/* The preview doesn't wait for a press: it shows on mouse hover; touch only produces pointermove while held and dragging. */
function scrubMove(event: PointerEvent): void {
  if (scrubbing) paintProgress(barRatio(event));
  showSeekPreview(barRatio(event));
}

function scrubEnd(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') seekPreview?.hide();
  if (!scrubbing) return;
  scrubbing = false;
  setBarScrubbing(false);
  const total = scrubTarget?.duration();
  if (scrubTarget && total) scrubTarget.video.currentTime = total * barRatio(event);
}

function scrubCancel(): void {
  scrubbing = false;
  setBarScrubbing(false);
  seekPreview?.hide();
}

function scrubLeave(): void {
  if (!scrubbing) seekPreview?.hide();
}

/* ── Action buttons ── */

type FeedbackKind = 'dislike' | 'seen' | 'o';
interface FeedbackResult { feedback?: string | null; disposal?: string | null; o_count?: number }

/** Writes one feedback, and the receipt is swapped into `['item', id]`, so the same card in the catalog updates with it. */
export async function sendFeedback(id: number, kind: string): Promise<FeedbackResult> {
  const result = await apiSend<FeedbackResult>(FEEDBACK_URL, { id, kind });
  const before = queryClient.getQueryData<DetailItem>(itemKey(id));
  if (!before) {
    replaceCatalogItem(id, { feedback: result.feedback ?? undefined, o_count: result.o_count });
    return result;
  }
  const next: DetailItem = { ...before, feedback: result.feedback ?? undefined, o_count: result.o_count };
  queryClient.setQueryData(itemKey(id), next);
  replaceCatalogItem(id, {
    feedback: next.feedback, disposal: next.disposal, watch_later: next.watch_later, rating: next.rating, o_count: next.o_count,
  });
  return result;
}

const ACTIONS: { kind: FeedbackKind; glyph: string; label: string }[] = [
  { kind: 'dislike', glyph: 'thumbs-down', label: 'Mark as disliked' },
  { kind: 'seen', glyph: 'eye', label: 'Mark as watched' },
  { kind: 'o', glyph: 'heart', label: 'Log a climax' },
];

/** Details for the item currently leaving the frame: fetched before exit (`ensureDetail`); this only reads the cache and re-renders along with the write-back. */
function useDetail(id: number | null) {
  return useQuery({
    queryKey: itemKey(id ?? 0),
    queryFn: ({ signal }) => fetchItem(id!, signal),
    enabled: id != null,
    staleTime: Infinity,
  }).data;
}

function ImmerseAction({ kind, glyph, label, id }: { kind: FeedbackKind; glyph: string; label: string; id: number | null }) {
  const full = useDetail(id);
  const mutation = useMutation({
    mutationFn: async (target: number) => {
      const before = queryClient.getQueryData<DetailItem>(itemKey(target))?.feedback || null;
      return { result: await sendFeedback(target, kind), before };
    },
    onSuccess: ({ result, before }, target) => {
      immerseHost().toast(feedbackReceipt(kind, result), {
        undo: async () => {
          if (kind === 'o') await sendFeedback(target, 'o-undo');
          else {
            if (result.feedback) await sendFeedback(target, result.feedback);
            if (before) await sendFeedback(target, before);
          }
        },
      });
      if (kind === 'dislike' && result.feedback === 'dislike') setTimeout(() => { void step(1) }, DISLIKE_ADVANCE_MS);
    },
    onError: (error) => immerseHost().failure('Update feedback', error),
  });
  const busy = mutation.isPending;
  const pressed = kind !== 'o' && full ? (full.feedback === kind ? 'true' : 'false') : undefined;
  return (
    <div data-immerse-action="">
      <button type="button" data-immerse-circle="" title={label} aria-label={label} aria-pressed={pressed}
        {...(busy ? { 'aria-busy': true, 'aria-disabled': true } as const : {})}
        onClick={() => { if (id != null && !mutation.isPending) mutation.mutate(id) }}>
        <svg viewBox="0 0 24 24"><use href={`#i-${glyph}`} /></svg>
      </button>
      <span data-immerse-label="">
        {kind === 'dislike' ? 'Dislike' : null}
        {kind === 'seen' ? (full?.feedback === 'seen' ? 'Watched' : 'Watched') : null}
        {kind === 'o' ? <>Climaxes <b>{full?.o_count || 0}</b></> : null}
      </span>
    </div>
  );
}

/* ── Author and title ── */

function Caption({ shown }: { shown: Shown | null }) {
  const item = shown?.item ?? null;
  const full = useDetail(item?.id ?? null);
  const owner = full ? ownerOf(full) : null;
  const helpers = immerseHost();
  /* Clicking the author or avatar: close first, then open the profile page of the first featured performer (or the creator if there is none). */
  const openOwner = (event: MouseEvent) => {
    event.preventDefault();
    if (!full) return;
    close();
    if (full.performers?.[0]) helpers.openEntity('performer', full.performers[0]);
    else if (full.creator) helpers.openEntity('creator', full.creator);
    else helpers.openUnowned();
  };
  /* The title opens the details page. In immersive mode only the filename is visible; to see tags, related recommendations, or edit anything, one must exit first and find it again
     in the list. Same path as the author link beside it: close first, then open. */
  const openTitle = () => {
    if (!item) return;
    close();
    helpers.openItem(item.id);
  };
  const avatar = owner ? avatarInner(owner.name, owner.ref, representativeOf(owner.name), owner.kind || 'performer') : '';
  return (
    <div data-immerse-ui="">
      <div data-immerse-author="">
        <button type="button" data-immerse-avatar="" aria-label="Open details" onClick={openOwner}
          dangerouslySetInnerHTML={{ __html: avatar }} />
        <a href="#" onClick={openOwner}>{owner?.who ?? ''}</a>
        <span>{shown && item ? `· ${fmtDur(item.duration)} · ${item.ctx_orient || ''} · ${shown.index + 1}/${shown.length}` : ''}</span>
      </div>
      <button type="button" data-immerse-title="" onClick={openTitle}>{item ? helpers.displayName(item).trim() || 'Untitled video' : ''}</button>
    </div>
  );
}

/* ── Outer frame ── */

const SPINNER = { __html: spinnerHtml('Loading media') };

function ImmerseView({ view: at }: { view: View }) {
  const frame = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = frame.current!;
    dom = { root: el, track: track.current!, bar: bar.current!, progress: progress.current! };
    /* Horizontal swipes need `preventDefault`; React's touch and wheel listeners on the root are passive and cannot stop page scroll: these few attach directly
       on the node. */
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      el.removeEventListener('wheel', onWheel);
      dom = null;
    };
  }, []);
  const id = at.shown?.item.id ?? null;
  const flag = (on: boolean) => (on ? '' : undefined);
  return (
    <div ref={frame} data-immerse="" data-idle={flag(at.idle)} data-wide={flag(at.wide)} hidden={!at.open}>
      <div data-immerse-stage="" data-wide={flag(at.wide)}>
        <div ref={track} data-immerse-track="" onClick={clickTrack} />
        <div data-immerse-actions="">
          {ACTIONS.map((action) => <ImmerseAction key={action.kind} {...action} id={id} />)}
        </div>
      </div>
      <div data-immerse-loader="" role="status" aria-live="polite" hidden={at.loading === null}>
        <span data-immerse-spinner="" dangerouslySetInnerHTML={SPINNER} />
        <span>{at.loading ?? ''}</span>
      </div>
      <button type="button" data-immerse-close="" title="Close" aria-label="Close" onClick={close}>
        <svg viewBox="0 0 24 24"><use href="#i-x" /></svg>
      </button>
      <div ref={bar} data-immerse-bar="" onPointerDown={scrubStart} onPointerMove={scrubMove}
        onPointerUp={scrubEnd} onPointerCancel={scrubCancel} onPointerLeave={scrubLeave}>
        <i ref={progress} />
      </div>
      <Caption shown={at.shown} />
    </div>
  );
}

/* ── Entry points into the shell ── */

const api: ImmerseApi = {
  open,
  close,
  isOpen: () => view.open,
  activeVideo: () => (view.open ? current?.video ?? null : null),
};

function onKeyDown(event: KeyboardEvent): void {
  if (!view.open) return;
  // Typing contexts do not steal keys: presses inside the search box, the tag dialog, and any editable area belong to those.
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Vertical slices, keeping the gesture direction consistent with portrait short videos.
  if (event.key === 'ArrowDown') void step(1);
  if (event.key === 'ArrowUp') void step(-1);
}

/** Attach the host the shell provides and get back immersive mode's imperative handle. Called once; the shell's `loadImmerse` then opens this surface in the router tree,
 *  handing over the handle only after the hidden outer frame is drawn, so it exists before the first open. */
export function configureImmerse(next: ImmerseHost): ImmerseApi {
  const first = !host;
  host = next;
  if (first) {
    document.addEventListener('keydown', onKeyDown);
    // After rotating the phone or resizing the window, the cover-fit vs full-display verdict for the same video can flip.
    addEventListener('resize', () => { if (view.open) fitAll() });
    addEventListener('pagehide', () => { slides.forEach((slide) => cancelStreamSession(slide.session)) });
  }
  return api;
}

/** The resident table's face: reads this module's store and renders nothing until the host is attached. */
export function ImmerseSurface() {
  const at = useSyncExternalStore(subscribe, () => view);
  return host ? <ImmerseView view={at} /> : null;
}
