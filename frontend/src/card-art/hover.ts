/* Card hover preview: only local files pull real video. Remote sources like 115 and PikPak only sweep the local contact
 * sheets, avoiding continued downloads or a filled cache after the page goes away.
 *
 * Cards come in two kinds: the shell-assembled `.card`, and `[data-media-card]`/`[data-mix-card]` in the React grid.
 * Hover state is written on the card as `data-previewing`/`data-longhover`: class names belong to React, so the shell adds
 * none.
 *
 * Whether to start a preview is decided in the shell (multi-select, occlusion, hover delay setting) and handed in via
 * `configureHoverPreview` as getter functions: the delay is read again inside the timer, so a mid-run setting change is read
 * on the next tick; a snapshot copy would go stale. Unconfigured is treated as "no blocking, no delay". */

/** The three things to ask the shell before starting a preview. All are getters, read fresh at each use. */
export interface HoverPreviewConfig {
  /** Multi-select mode is on: no preview in this state. */
  selecting(): boolean;
  /** Occlusion is on: no preview starts, and the already scheduled segment does not play when its time comes. */
  censored(): boolean;
  /** How many seconds of dwell trigger 'long hover' (the countdown completes and the three skip buttons appear); 0 disables it. */
  delaySeconds(): number;
}

/** The fields used on the card. */
export interface HoverItem { id: number; location?: string; has_thumb?: boolean }

type HoverCard = HTMLElement & { _stopHover?: () => void; _hoverEvents?: AbortController };
type HoverVideo = HTMLVideoElement & { _hop?: ReturnType<typeof setInterval> };

const HOVER_CARDS = '.card,[data-media-card],[data-mix-card]';

let config: HoverPreviewConfig = { selecting: () => false, censored: () => false, delaySeconds: () => 0 };

export function configureHoverPreview(next: HoverPreviewConfig): void {
  config = next;
}

const scrolling = () => !!(window as Window & { __scrolling?: unknown }).__scrolling;

/** Closes every hover preview under `root`, leaving out the `except` card. */
export function releaseHoverPreviews(root: ParentNode | null = document, except: Element | null = null): void {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll<HoverCard>(HOVER_CARDS).forEach(card => {
    if (card !== except && card._stopHover) card._stopHover();
  });
  root.querySelectorAll<HoverVideo>('video.hv').forEach(v => {
    if (v.closest(HOVER_CARDS) === except) return;
    if (v._hop) clearInterval(v._hop); v.pause(); v.removeAttribute('src'); v.load(); v.remove();
  });
  // The remote-source layer needs the same pass as the video: if the card was repainted, `_stopHover` on the old element
  // It has already gone with the old DOM; the earlier callback alone cannot receive the scan view it left on screen.
  root.querySelectorAll('img.ui-hvframes').forEach(im => {
    if (im.closest(HOVER_CARDS) === except) return;
    im.removeAttribute('src'); im.remove();
  });
}

/** Before a card is torn down: its own playing stream and every preview inside it close together. */
export function releaseHover(card: HTMLElement): void {
  (card as HoverCard)._stopHover?.();
  releaseHoverPreviews(card);
}

export function setHoverState(el: HTMLElement, name: 'previewing' | 'longhover', on: boolean): void {
  if (on) el.dataset[name] = ''; else delete el.dataset[name];
}

/** Attach a hover preview to a card. The picture cell is the card's `[data-media-pic]`; skip when it is absent. */
export function wireHover(el: HTMLElement, it: HoverItem): void {
  const card = el as HoverCard;
  card._hoverEvents?.abort(); card._stopHover?.(); delete card._stopHover;
  const pic = el.querySelector('[data-media-pic]'); if (!pic) return;
  const events = new AbortController(); card._hoverEvents = events;
  el.dataset.hoverMode = it.location === 'local' ? 'video' : 'frames';
  let longTimer: ReturnType<typeof setTimeout> | undefined;
  const armLong = () => {
    clearTimeout(longTimer); if (!config.delaySeconds()) return; setHoverState(el, 'previewing', true);
    longTimer = setTimeout(() => { if (config.delaySeconds()) setHoverState(el, 'longhover', true); }, config.delaySeconds() * 1000);
  };
  const clearLong = () => { clearTimeout(longTimer); setHoverState(el, 'previewing', false); setHoverState(el, 'longhover', false); };
  if (it.location !== 'local') {        // Remote source: pan only between contact sheet cells, zero network traffic
    /* The scan view is a new layer stacked over the picture, never rewriting any existing `<img>`'s src. In the JAV large-image
       and small-image layouts the picture is the cover itself (`.poster.cover`), and changing its src would swap the cover on
       the spot; excluding the cover by class name would leave these two layouts without hover preview entirely, not even
       entering `data-longhover`, and the rewind and fast-forward three would never appear. An added layer is one path for all
       three layouts.
       The layer uses contain over a black base: the large-image layout's container is a 0.75 portrait ratio, so the 16:9
       contact-sheet cell centers inside with black above and below, the same basis as local videos' `.hv`. */
    if (!it.has_thumb) return;        // No contact sheet means no cells to scan
    let t: ReturnType<typeof setInterval> | undefined, i = 4, layer: HTMLImageElement | null = null, loading = false;
    el.addEventListener('mouseenter', () => {
      if (config.selecting() || config.censored()) return;
      if (!layer) {
        layer = document.createElement('img');
        layer.className = 'ui-hvframes'; layer.alt = '';
        const pending = layer;
        pending.hidden = true;
        pending.addEventListener('load', () => {
          if (layer !== pending) return;
          pending.hidden = false; armLong();
          clearInterval(t);
          t = setInterval(() => {
            if (layer !== pending || loading) return;
            const next = (i + 1) % 9, pre = new Image(); loading = true;
            pre.onload = () => { if (layer === pending) { layer.src = pre.src; i = next; } loading = false; };
            pre.onerror = () => { loading = false; };
            pre.src = `/poster?id=${it.id}&c=${next}`;
          }, 430);
        }, { once: true });
        pending.addEventListener('error', () => { if (layer === pending) stop() });
        layer.src = `/poster?id=${it.id}&c=${i}`;
        pic.appendChild(layer);
      }
    }, { signal: events.signal });
    const stop = () => {
      clearLong(); clearInterval(t); t = undefined; loading = false;
      if (layer) { layer.remove(); layer = null; } i = 4;
    };
    card._stopHover = stop; el.addEventListener('mouseleave', stop, { signal: events.signal });
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined, v: HoverVideo | null = null;
  el.addEventListener('mouseenter', () => {
    if (config.selecting() || config.censored() || scrolling()) return;   // No preview while multi-selecting, occluded, or scrolling
    timer = setTimeout(() => {
      if (scrolling() || config.censored()) return;
      releaseHoverPreviews(document, el);   // Keep only one local video preview at a time
      const video = document.createElement('video') as HoverVideo;
      v = video;
      video.className = 'hv'; video.muted = true; video.playsInline = true; video.loop = true; video.preload = 'metadata';
      video.src = '/stream?id=' + it.id;
      // Segmented skipping: play each segment for 1.4 seconds then jump to the next, sweeping the whole video instead of playing continuously from one point
      const SEG = [0.08, 0.22, 0.36, 0.50, 0.64, 0.78, 0.90]; let si = 0;
      const seek = () => { try { video.currentTime = (video.duration || 0) * (SEG[si] ?? 0); } catch { /* Metadata has not arrived yet */ } };
      video.addEventListener('loadedmetadata', () => {
        seek();
      }, { once: true });
      video.addEventListener('loadeddata', () => {
        if (v !== video) return;
        const reveal = () => {
          if (v !== video) return;
          video.classList.add('on'); video.dataset.playing = ''; armLong();
        };
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
        else video.addEventListener('playing', reveal, { once: true });
        video._hop = setInterval(() => { si = (si + 1) % SEG.length; seek(); }, 1400);
      }, { once: true });
      pic.appendChild(video); video.play().catch(() => {});
    }, 340);                         // 340ms debounce so hovering does not trigger it
  }, { signal: events.signal });
  const stop = () => {
    clearLong();
    clearTimeout(timer); timer = undefined;
    if (v) { if (v._hop) clearInterval(v._hop); v.pause(); v.removeAttribute('src'); v.load(); v.remove(); v = null; }
  };
  card._stopHover = stop; el.addEventListener('mouseleave', stop, { signal: events.signal });
}
