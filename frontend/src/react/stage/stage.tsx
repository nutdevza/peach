/* The stage (ADR-0031 step 11a): the details popover `<dialog id="stage">`, its enter/exit transitions, skeleton and reveal,
 * the two details, the player and the mini player all live on this surface.
 *
 * Resident component `stage` (the resident table in `router/managed-routes.tsx`): the route tree renders it into the resident
 * host `[data-stage-host]` at the end of body, the host being that node itself and not wrapped in `.peach-react`. It is
 * created by `loadStage` in `application-residents.ts` the first time details open and mounted into the document in the same
 * task as the mini player node. The stage covers all pages and the mini player must keep playing across page changes, so the
 * host is not tied to a page. The shell only gets the imperative entry `configureStage` provides: the handle writes this
 * module's store and notifies via `flushSync`; every render inside `open` (including in-place item change), `update` and
 * `dispose` finishes before they return, so code that reads the DOM right after (the skeleton measuring sizes, `showModal`,
 * the title reveal, focus moving to the close button) reads freshly rendered structure.
 *
 * Every `open` mints a new `generation`; fetches returning with the wrong generation are discarded; on reopen the dialog
 * rebuilds by it, and an in-place item change reuses the open one. The two details are child components of this surface and
 * share the route tree's QueryClient (`providers.tsx`). When the details render, the `present` they report to the shell queues
 * into a microtask: on receiving it the shell renders the sidebar and top bar, and those resident components' handles
 * `flushSync` internally, which cannot render inside the route tree's commit phase. Microtasks finish before the browser
 * paints; if the entry has already moved on (in-place change or reopen) or the stage has closed, it does not report. */
import { useLayoutEffect, useRef, useSyncExternalStore, type MouseEvent, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { UNSAFE_PortalProvider } from 'react-aria';

import { detailPosterUrl, releaseHoverPreviews } from '@peach/card-art';
import { fitSkeleton, revealTexts } from '@peach/legacy/ui';

import { detailSkeletonBody } from '../../board-skeleton';
import { applyTheaterMode, closePlayerMenu, type PlayerResume } from '../../player';
import { adoptToasts, overlayHost, topOverlay } from '../components/overlay-host';
import { followItemKey, prefetchFollowDetail, type FollowDetailActions, type FollowDetailProps } from '../follow-detail/follow-detail';
import { FollowDetailPage } from '../follow-detail/follow-detail-page';
import { chooseItem, itemKey, prefetchItemDetail, queueKey, type DetailQueue, type ItemDetailActions, type ItemDetailProps } from '../item-detail/item-detail';
import { ItemDetailPage } from '../item-detail/item-detail-page';
import { javDetailKey, prefetchJavDetail, type JavDetailProps } from '../jav-detail/jav-detail';
import { queryClient } from '../query';
import { JavDetailPage } from '../jav-detail/jav-detail-page';
import { Miniplayer } from './miniplayer';
import * as player from './stage-player';
import type { StageApi, StageHost, StagePatch, StageRequest } from './stage-api';

type Phase = 'skeleton' | 'reveal' | 'content';

type Content =
  | { kind: 'item'; props: ItemDetailProps }
  | { kind: 'jav'; props: JavDetailProps }
  | { kind: 'follow'; props: FollowDetailProps };

interface View {
  generation: number;
  request: StageRequest;
  content: Content;
  /* Skeleton, then fade out (the skeleton lifts into a `[data-stage-fade]` layer while the content comes into focus at the same time), then content. When data arrives faster than the visibility threshold, skip
     the middle step: a skeleton that never showed should not play an exit. */
  phase: Phase;
}

let host: StageHost | null = null;
let view: View | null = null;
let pageReturn: { left:number; top:number; anchor:HTMLElement } | null = null;
const listeners = new Set<() => void>();
let generation = 0;
let controller: AbortController | null = null;
/* Close button, Escape, clicking outside the overlay, and native `cancel` may each arrive within the same moment: requesting another close during the exit animation
   would make the second close skip the animation and tear down directly. */
let closeRequested = false;
/* Whether the press happened outside the overlay. In details the seek bar, volume bar and queue all drag, and dragging off a control's edge before releasing also delivers
   a click on the dialog; that is a drag finishing, not a request to close. */
let dismissArmed = false;

const stageDialog = (): HTMLDialogElement | null => {
  const el = document.getElementById('stage');
  return el instanceof HTMLDialogElement ? el : null;
};

function stageHost(): StageHost {
  if (!host) throw new Error('The stage has no host attached yet (configureStage)');
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

function StageTree({ view: current }: { view: View | null }) {
  return (
    <>
      {current ? <StageDialog key={current.generation} view={current} /> : null}
      <Miniplayer />
    </>
  );
}

const DetailSkeleton = () => (
  <div data-skeleton="detail" role="status" aria-label="Reading video details" dangerouslySetInnerHTML={{ __html: detailSkeletonBody() }} />
);

/* Clicking outside the popover exits. Inside a native modal, "outside" is still this dialog itself: the mask belongs to it,
   and an event landing on the mask has the dialog as its target, so the criterion takes coordinates, not the target: judging
   by target, any part of the popover that is not content would count as an outside click. Coordinates alone are not enough
   either: after the player goes fullscreen it covers the whole viewport while the popover's rectangle is still the details
   layout's block, so clicking the progress bar's far end or the bottom control bar would land outside the rectangle. Both
   must hold: the target is the dialog itself and the coordinates are outside the popover. */
function outside(event: MouseEvent | PointerEvent): boolean {
  const dialog = event.currentTarget as HTMLElement;
  if (event.target !== dialog) return false;
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}

function requestEscape(): void {
  const dialog = stageDialog();
  const layer = dialog && topOverlay(dialog);
  if (!layer) { requestClose(); return }
  layer.focus({ preventScroll: true });
  layer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

function StageDialog({ view: current }: { view: View }) {
  const ref = useRef<HTMLDialogElement>(null);
  /* The global keyboard entry and overlays share requestEscape, calling preventDefault on keydown, so focus on body cannot bypass the popover check.
     Native cancel is reserved for other close requests; a non-cancelable event cannot stop the browser from closing the overlay. */
  useLayoutEffect(() => {
    const dialog = ref.current!;
    // The file picker's cancel bubbles; details only handle their own close requests.
    const cancel = (event: Event) => {
      if (event.target !== dialog) return;
      event.preventDefault();
      requestEscape();
    };
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, []);
  const { phase, content } = current;
  /* Switching entries in place rebuilds follow details per entry: the selected media, and the busy and failure states of write operations, all belong to the previous entry. Video details
     swap the `Detail` key per entry themselves, and the queue fetch stays in the outer layer, not restarted. */
  const body = content.kind === 'item'
    ? <ItemDetailPage {...content.props} />
    : content.kind === 'jav' ? <JavDetailPage key={content.props.code} {...content.props} />
    : <FollowDetailPage key={content.props.id} {...content.props} />;
  return (
    <dialog ref={ref} id="stage" data-stage="" data-stage-kind={content.kind} aria-label="Video details"
      onKeyDown={(event) => {
        /* The inner popovers (tag search box, context menu) handle Escape first and call `preventDefault`, so it no longer closes the overlay. */
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        requestEscape();
      }}
      onPointerDown={(event) => { dismissArmed = outside(event) }}
      onClick={(event) => { if (dismissArmed && outside(event)) requestClose() }}>
      {phase === 'skeleton' ? <DetailSkeleton key="skeleton" /> : null}
      {phase === 'reveal' ? <div key="fade" data-stage-fade="" aria-hidden="true"><DetailSkeleton /></div> : null}
      {phase === 'skeleton' ? null : (
        /* On narrow screens the scrolling is `[data-stage-scroll]`, and the site-wide overlay scrollbar hangs at its sibling position
           (`<dialog>` is top-layer; a track hung outside it would land under the mask); "Continue watching" is a sibling of
           `[data-stage-grid]` and must be included too. The inner `.peach-react` takes no box, and tokens and Preflight start
           applying from it.
           Popovers, dropdowns and tooltips opened inside details (find sources, crop cover, recommendation reason) all mount
           into this dialog: landing on `body` would be covered entirely by the top-layer popover, criteria in
           `overlay-host.ts`. */
        <div key="content" data-stage-scroll=""><div className="peach-react">
          <UNSAFE_PortalProvider getContainer={() => overlayHost(ref.current)}>{body}</UNSAFE_PortalProvider>
        </div></div>
      )}
    </dialog>
  );
}

function requestClose(): void {
  if (!view || closeRequested) return;
  closeRequested = true;
  view.request.actions.close();
}

function toggleStageModes(ambient: boolean, theater: boolean): void {
  const dialog = stageDialog();
  dialog?.toggleAttribute('data-ambient', ambient);
  dialog?.toggleAttribute('data-theater', theater);
}

/* Both details surfaces wrap their actions through the stage: closing goes through `requestClose`; at render time the stage registers mini player metadata and switches ambient glow and theater
   mode; the media frame is handed to the stage's player. The resume position is given only to the entry mounted the first time. */
function contentFor(request: StageRequest): Content {
  if (request.kind === 'jav') return { kind: 'jav', props: { code: request.code, readOnly: request.readOnly,
    actions: { ...request.actions, close: requestClose } } };
  let resume: PlayerResume | null = request.resume ?? null;
  const takeResume = (id: number) => {
    const hit = resume && (request.id == null || request.id === id) ? resume : null;
    resume = null;
    return hit;
  };
  const settings = () => stageHost().player.settings();
  /* In-place entry swaps reuse the generation from when the overlay opened (the dialog is not rebuilt), so recognize by this open's request: swapping entries and reopening each get a fresh one. */
  const live = () => view?.request === request;
  if (request.kind === 'item') {
    const { kind: _kind, resume: _resume, actions: base, ...props } = request;
    const actions: ItemDetailActions = {
      ...base,
      close: requestClose,
      present: (item, queue) => {
        const performers = item.performers as string[] | undefined;
        player.setStageMeta({ kind: 'item', item, title: String(item.title || item.name || ''),
          sub: String(performers?.[0] || item.creator || 'Unassigned') });
        toggleStageModes(settings().ambientMode, settings().theaterMode);
        queueMicrotask(() => { if (live()) base.present(item, queue) });
      },
      mountPlayer: (frame, item, _media, options) => player.attachStagePlayer(frame, {
        kind: 'item', item, autoplay: options?.autoplay, resume: takeResume(item.id), id: 'vid',
      }),
    };
    return { kind: 'item', props: { ...props, actions } };
  }
  const { kind: _kind, resume: _resume, actions: base, ...props } = request;
  const actions: FollowDetailActions = {
    ...base,
    close: requestClose,
    present: (item, kind) => {
      player.setStageMeta({ kind: 'follow', item, title: item.title || '', sub: item.author || item.source_label || '' });
      toggleStageModes(kind === 'video' && settings().ambientMode, kind === 'video' && settings().theaterMode);
      queueMicrotask(() => { if (live()) base.present(item, kind) });
    },
    mountPlayer: (frame, item, media, options) => player.attachStagePlayer(frame, {
      kind: 'follow', item, media, poster: item.thumb_url || undefined, onError: options.onError, resume: takeResume(item.id),
    }),
  };
  return { kind: 'follow', props: { ...props, actions } };
}

/* The skeleton lifts into a fade-out layer while the content sharpens out of blur; once done (or at the 1 s fallback) the layer is removed. */
function startReveal(dialog: HTMLDialogElement, mine: number): void {
  const fade = dialog.querySelector<HTMLElement>(':scope > [data-stage-fade]');
  dialog.setAttribute('data-stage-reveal', '');
  dialog.getBoundingClientRect();
  dialog.setAttribute('data-stage-revealing', '');
  let timer = 0;
  const drop = () => {
    clearTimeout(timer);
    fade?.removeEventListener('transitionend', done);
    dialog.removeAttribute('data-stage-reveal');
    dialog.removeAttribute('data-stage-revealing');
    if (view?.generation === mine && view.phase === 'reveal') { view = { ...view, phase: 'content' }; paint() }
  };
  const done = (event: Event) => { if (event.target === fade) drop() };
  fade?.addEventListener('transitionend', done);
  timer = window.setTimeout(drop, 1000);
}

/** The floating window shows the same kind of detail and is not exiting: switching entries swaps content in place instead of tearing down the window. */
function swappable(kind: StageRequest['kind']): HTMLDialogElement | null {
  const dialog = stageDialog();
  if (!view || view.content.kind !== kind || closeRequested || !dialog?.open || dialog.hasAttribute('data-closing')) return null;
  return dialog;
}

async function open(request: StageRequest): Promise<void> {
  if (!pageReturn && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    pageReturn = { left:window.scrollX, top:window.scrollY, anchor:document.activeElement };
  }
  const current = swappable(request.kind);
  if (current) { await swap(request, current); return }
  if (view) dispose({ miniplayer: false });
  const mine = ++generation;
  const abort = new AbortController();
  controller = abort;
  closeRequested = false;
  dismissArmed = false;
  if (request.kind === 'jav') player.closeMiniplayer();
  else player.prepareStageFor(request.kind, request.id ?? Number.NaN);
  const content = contentFor(request);
  view = { generation: mine, request, content, phase: 'skeleton' };
  const waiting = content.kind === 'item' ? prefetchItemDetail(content.props, abort.signal)
    : content.kind === 'jav' ? prefetchJavDetail(content.props, abort.signal)
    : prefetchFollowDetail(content.props, abort.signal);
  if (mine !== generation || view?.request !== request) { await waiting.catch(() => {}); return }
  const cached = cachedContent(content);
  view = { ...view, phase: cached ? 'content' : 'skeleton' };
  paint();
  const dialog = stageDialog();
  if (!dialog) { await waiting.catch(() => {}); return }
  if (!cached) fitSkeleton(dialog);
  document.body.setAttribute('data-detail-open', '');
  if (!dialog.open) dialog.showModal();
  adoptToasts(dialog);
  try {
    await waiting;
  } catch {
    // Aborting means the user has walked away. Other failures render as usual: the reason and retry cadence stay in the detail's hands.
    if (abort.signal.aborted) return;
  }
  if (mine !== generation || !view) return;
  if (cached) return;
  /* It finished before reaching the visibility threshold: content lands directly, and the hidden placeholder is never seen. */
  const direct = !!dialog.querySelector('.skeleton-awaiting');
  view = { ...view, phase: direct ? 'content' : 'reveal' };
  paint();
  if (!direct) startReveal(dialog, mine);
  /* The two title lines in the overlay are revealed again by this repaint. It must dodge the layer still fading out: the skeleton is drawn to the final structure and also contains
     a `[data-stage-side-content]`, which is what a document-order search would pick up. */
  revealTexts(dialog, ':scope>:not([data-stage-fade]) [data-reveal-line]');
  /* The skeleton has no focusable element, so `showModal()` can only give focus to the dialog itself; once content arrives it moves to the close key. */
  const active = document.activeElement;
  if (active === dialog || !dialog.contains(active)) dialog.querySelector<HTMLElement>('#closeStage')?.focus();
}

/** Details that can render fully right away reuse the query cache; refreshing only updates content. */
function cachedContent(content: Content): boolean {
  if (content.kind === 'jav') return !!queryClient.getQueryData(javDetailKey(content.props.code));
  if (content.kind === 'follow') return !!queryClient.getQueryData(followItemKey(content.props.id));
  const { queue: ref, id } = content.props;
  const queue = ref ? queryClient.getQueryData<DetailQueue>(queueKey(ref)) : null;
  if (ref && !queue) return false;
  const current = queue ? chooseItem(queue, id) : id;
  return current != null && !!queryClient.getQueryData(itemKey(current));
}

/* Switching to another entry of the same kind while details is open (queue volume change, compilation edition change, related videos, back/forward): the overlay, scrim, and entrance do not
   replay, nor return to skeleton. First fetch the new entry fully; during that stretch the previous one keeps playing; on arrival swap the content, the media frame unmounts by item,
   and the previous entry's player is torn down with it (not into the mini player). */
async function swap(request: StageRequest, dialog: HTMLDialogElement): Promise<void> {
  const mine = ++generation;
  controller?.abort();
  const abort = new AbortController();
  controller = abort;
  dismissArmed = false;
  const content = contentFor(request);
  try {
    if (content.kind === 'item') await prefetchItemDetail(content.props, abort.signal);
    else if (content.kind === 'jav') await prefetchJavDetail(content.props, abort.signal);
    else await prefetchFollowDetail(content.props, abort.signal);
  } catch {
    if (abort.signal.aborted) return;
  }
  if (mine !== generation || !view || swappable(request.kind) !== dialog) return;
  if (request.kind === 'jav') player.closeMiniplayer();
  else player.prepareStageFor(request.kind, request.id ?? Number.NaN);
  releaseHoverPreviews(dialog);
  closePlayerMenu();
  view = { ...view, request, content, phase: 'content' };
  paint();
  /* The row changed before the first reveal finished: the fade layer is already unmounted and its transitionend never comes, so the blur has to be removed on the spot. */
  dialog.removeAttribute('data-stage-reveal');
  dialog.removeAttribute('data-stage-revealing');
  dialog.querySelector<HTMLElement>(':scope > [data-stage-scroll]')?.scrollTo({ top: 0 });
  revealTexts(dialog, ':scope>:not([data-stage-fade]) [data-reveal-line]');
  /* The row that was clicked unmounted with the details rebuild and focus fell back to body: hand it to the queue's new current row, or to the close key when there is no queue. */
  const active = document.activeElement;
  if (active === dialog || !dialog.contains(active)) {
    (dialog.querySelector<HTMLElement>('[data-mix-item][aria-current="true"]')
      || dialog.querySelector<HTMLElement>('#closeStage'))?.focus({ preventScroll: true });
  }
}

/* The details overlay's exit follows the settings modal's path: `data-closing` lets `board-dialog-out` and the scrim fade play out before teardown. Waiting has
   a cap: when `animation` is turned off by another rule, animationend never comes. */
function exit(): Promise<void> {
  /* The exit animation's opacity would fade the Toast inside the dialog along with it; put it back into body first, so it shows through as the overlay fades out. */
  adoptToasts(null);
  const dialog = stageDialog();
  if (!dialog?.open || dialog.hasAttribute('data-closing') || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return Promise.resolve();
  }
  dialog.setAttribute('data-closing', '');
  return new Promise((resolve) => {
    let timer = 0;
    const done = () => { clearTimeout(timer); dialog.removeEventListener('animationend', onEnd); resolve() };
    // Controls inside the floating window also bubble animationend; accept only the event whose target is the stage itself.
    const onEnd = (event: Event) => { if (event.target === dialog) done() };
    dialog.addEventListener('animationend', onEnd);
    timer = window.setTimeout(done, 380);
  });
}

function dispose({ miniplayer = true }: { miniplayer?: boolean } = {}): void {
  generation++;
  controller?.abort();
  controller = null;
  /* A video still playing when detail closes is not destroyed: the whole player moves into the mini player and keeps going. The move must happen before the media frame unmounts. */
  player.handOffStage(miniplayer);
  if (!view) return;
  const dialog = stageDialog();
  // Collapse the hover previews mounted in the stage before tearing the stage down (the cards in the 'Keep watching' row).
  if (dialog) releaseHoverPreviews(dialog);
  // The context menu moved into the stage while open, and the toast stack moved in when opened: put them back on body first so they are not unmounted along with the overlay.
  closePlayerMenu();
  adoptToasts(null);
  if (dialog?.open) dialog.close();
  view = null;
  closeRequested = false;
  dismissArmed = false;
  paint();
  player.setStageMeta(null);
  document.body.removeAttribute('data-detail-open');
  const returning = pageReturn;
  pageReturn = null;
  const restorePosition = () => {
    if (!view && returning?.anchor.isConnected && returning.anchor.getClientRects().length) {
      window.scrollTo({ left:returning.left, top:returning.top, behavior:'instant' });
    }
  };
  restorePosition();
  // After the background list takes over the layout, scroll anchoring also returns to where it was when the detail opened.
  requestAnimationFrame(restorePosition);
}

function update(patch: StagePatch): void {
  if (!view) return;
  view = { ...view, content: view.content.kind === 'item'
    ? { kind: 'item', props: { ...view.content.props, ...patch } }
    : view.content.kind === 'jav' ? view.content
    : { kind: 'follow', props: { ...view.content.props,
      ...(patch.relatedLimit === undefined ? {} : { relatedLimit: patch.relatedLimit }) } } };
  paint();
}

function repaintPoster(): void {
  const meta = player.stageMeta();
  const item = meta?.kind === 'item' ? meta.item : null;
  const poster = item ? detailPosterUrl(item, stageHost().player.settings().javImage) : '';
  if (!poster) return;
  const current = player.stagePlayer();
  if (current) current.poster(poster);
  else document.getElementById('vid')?.setAttribute('poster', poster);
}

const api: StageApi = {
  open, update, exit, dispose, requestClose, requestEscape, repaintPoster,
  isOpen: () => !!view,
  showing: () => (view && swappable(view.content.kind) ? view.content.kind : null),
  activeVideo: () => player.activeStageVideo(),
  mountWallPlayer: player.mountWallPlayer,
  toggleTheater: () => { if (view) applyTheaterMode(!stageHost().player.settings().theaterMode) },
  toggleMiniplayer: () => player.toggleMiniplayer(),
  closeMiniplayer: () => player.closeMiniplayer(),
  miniplayerActive: () => player.miniplayerActive(),
  miniplayerTakesCard: (item) => player.miniplayerTakesCard(item),
  miniplayerPlay: (id) => { void player.miniplayerPlay(id) },
};

/** Attach the shell's host and take back the stage's imperative entry. Attach the player first; the mini player's node renders when the route tree opens this panel, so it exists
 *  before the first entry into the mini player. */
export function configureStage(next: StageHost): StageApi {
  host = next;
  player.configureStagePlayer(next, { isOpen: () => !!view, requestClose });
  return api;
}

/** The component of the resident `stage` component: subscribes to this module's store. The mini player node renders unconditionally, and the player moves in and out imperatively inside it. */
export function StageSurface() {
  const at = useSyncExternalStore(subscribe, () => view);
  return host ? <StageTree view={at} /> : null;
}
