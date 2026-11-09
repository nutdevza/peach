/* Framing after images land: avatars zoom by face, covers frame by face and front-cover box, undersized images place at
 * native size, and loading frames carry the shimmer.
 *
 * These images are all interpolated from template strings (`./markup.ts`) and cannot take per-image listeners, so
 * `installCardArt` hangs one group of capture listeners and one MutationObserver on the document to take over uniformly. The
 * listeners can have only one copy: Application and the React pages share this module's source, and startup installs once. */
import { gateSweep, releaseSweep, SKELETON_REVEAL_DELAY } from '@peach/legacy/ui';

import { PANEL_ASPECT, WIDE_PANEL_ASPECT, WIDE_SLEEVE_RATIO_MIN, WIDE_SLEEVE_RATIO_MAX, panelFrame, relayoutJavImages, type JavLayout } from '../jav-artwork';
import { faceFrame } from './face-frame';
import { faceSourceScale, markClamp, nativeImageFit } from './native-image';

const devicePixels = () => window.devicePixelRatio || 1;

/* The image in the round frame frames by face. Zooming changes the img's own size and offset instead of using transform:
   `object-position` can only pan within the part cover already crops, and a square image has nothing to pan, while a
   transform scale would enlarge the round frame's border too. The element stretches to "the image at cover scale times the
   factor", then negative offsets pull the face's center to the frame's center, with the frame's `overflow:hidden` doing the
   cropping: the same geometry as when not zoomed. */
export function avatarFrame(img: HTMLImageElement): void {
  const ring = img.parentElement;
  if (!ring) return;
  ['position', 'right', 'bottom', 'left', 'top', 'width', 'height', 'max-width', 'max-height']
    .forEach(name => img.style.removeProperty(name));
  // Appears only once framing is done (`09-skeleton.css`): this function writes the styles synchronously and marks it up front; the only path taken away is the wait-for-frame-layout one.
  img.dataset.faceFramed = '';
  if (ring.dataset.nativeSmall === 'true') return;
  const rect = ring.getBoundingClientRect();
  /* The frame not yet laid out when the image finishes loading is a whole real class of cases: hidden panel, a `display:none`
     tab, served straight from cache. At that moment the frame is 0×0, the computed factor can only be 1, and `load` will not
     come a second time, so the zoom silently never applies, indistinguishable on screen from "this image needs no zoom".
     Measured reproducing on the profile page: the frame already 160×160 and the image complete, yet the style held only the
     pan. So it computes once more when the frame has its size, and if that never comes, it stays unzoomed. */
  if (!(rect.width > 0 && rect.height > 0)) {
    if (typeof ResizeObserver !== 'function') return;
    // A 0x0 box would not be visible anyway; wait until it has a measured size and a finished crop before showing it.
    delete img.dataset.faceFramed;
    const watch = new ResizeObserver(() => {
      const now = ring.getBoundingClientRect();
      if (!(now.width > 0 && now.height > 0)) return;
      watch.disconnect();
      avatarFrame(img);
    });
    watch.observe(ring);
    return;
  }
  const [cx = NaN, cy = NaN, faceW = NaN, imgW = NaN, imgH = NaN] = String(img.dataset.facebox).split(' ').map(Number);
  /* The index page fetches derived copies of entity images, while the sidecar records the originals' pixels: proportionally scaled copies are still the same image, so
     converting by ratio lines up. Face centers are normalized and do not scale with the image; face boxes multiply with the image's pixels, so the
     lossless cap in `faceZoom` can then ask how many pixels this actual image has. A ratio of 0 means a different image was swapped in; fall back to geometric centering then. */
  const scale = faceSourceScale(img.naturalWidth, img.naturalHeight, imgW, imgH);
  if (!scale) {
    img.style.objectPosition = '50% 50%';
    return;
  }
  const frame = faceFrame({ cx, cy, faceW: faceW * scale, imgW: imgW * scale, imgH: imgH * scale },
    { w: rect.width, h: rect.height }, devicePixels());
  // When it cannot be enlarged, write nothing at all: what remains is the geometry in the CSS, and `object-position` keeps working as before.
  if (!frame) return;
  const s = img.style;
  // `inset:0` sets right/bottom, over-constrained against the left+width here; remove them explicitly instead of trusting the browser to pick.
  s.position = 'absolute'; s.right = 'auto'; s.bottom = 'auto';
  s.left = `${frame.left}%`; s.top = `${frame.top}%`;
  s.width = `${frame.width}%`; s.height = `${frame.height}%`;
  /* Width often exceeds the frame. React islands' Tailwind preflight gives every img `max-width:100%`, which clamps width to the frame while
     height still enlarges, pushing the face left and exposing backing on the right; remove it inline so no container needs its own patch. */
  s.maxWidth = 'none'; s.maxHeight = 'none';
}

/* Official covers come in three shapes, measured: a full sleeve is about 1.48 (stills collage on the left, the front cover
   only on the right), a portrait front cover is about 0.70 (already the front cover, no left half to crop), and 16:9 official
   stills are about 1.78 (the whole frame is the picture, with no "front cover region" to infer). So framing cannot be
   hard-coded to "take the right"; it must branch by the image's own aspect ratio after load. The server does not store this
   ratio, nor should it store one more copy for this.
   Stills must be their own tier: folding 1.78 into front would cut the horizontal middle at the hard-coded 50%, cutting away
   a person standing off to one side entirely, and the large-image container is more portrait than every cover, so vertical
   anchoring does nothing there. */
export function coverAnchor(img: HTMLImageElement, ratio?: number): void {
  const r = img.naturalWidth / img.naturalHeight;
  /* Read the container ratio before writing any styles: writing first and reading after makes `getComputedStyle` recompute the just-dirtied styles on the spot.
     If the caller already has the number (the playback wall's each cell writes its own `--card-ratio`), pass it in and skip the read entirely. */
  const car = r ? ratio ?? coverRatio(img) : 0;
  img.closest<HTMLElement>('.pic,[data-media-pic]')?.style.removeProperty('--cover-blur');
  if (!r) return;
  img.classList.remove('panel');
  ['--panel-aspect', '--panel-clip', '--panel-left', '--panel-top', '--panel-height', '--cover-x', '--cover-y']
    .forEach(name => img.style.removeProperty(name));
  const code = img.dataset.coverCode || new URL(img.currentSrc || img.src, location.href).searchParams.get('code') || '';
  // FC2 covers are full-frame images with landscape framing following the face; the aspect ratio does not imply a DVD front cover.
  img.dataset.frame = img.dataset.coverLayout === 'still' || /^FC2(?:-PPV)?-/i.test(code) ? 'still' : wideSleeve(img) ? 'sleeve' : r >= 1.65 ? 'still' : r > 1.2 ? 'sleeve' : 'front';
  /* `object-position`'s percentages say "this point on the image aligns with the same percentage position of the visible
     window", not "this point lands in the window's center". So using the face center as the anchor as-is only guarantees the
     face stays in frame: a face at 0.81 would hug the window's right edge with a strip of image on the right never showing.
     When the visible window occupies w of the image, the anchor that centers the face is (face - w/2) / (1 - w). Clamping to
     0-1 exists because when the face is less than half a window from the image edge, the window has already hit the edge, and
     pushing further out would only bring what is outside the image in. */
  const center = (name: string, face: number | null, visible: number) => {
    // Compute only for the cropped axis. `object-fit:cover` crops one axis at a time; the other axis shows the full image
    // (visible>=1); the object-position there is a hard-coded value, so computing it has no effect.
    if (face == null || !(visible > 0 && visible < 1)) return;
    const pct = Math.min(1, Math.max(0, (face - visible / 2) / (1 - visible)));
    img.style.setProperty(name, `${Math.round(pct * 100)}%`);
  };
  center('--cover-x', coverFace(img, 'cx'), car / r);
  center('--cover-y', coverFace(img, 'cy'), r / car);
  posterPanel(img, car);
  // The traditional cover's full image and the portrait front cover stay intact, with the same image padding the mismatched ratio; the full-width large cover keeps a solid background.
  if (img.dataset.frame !== 'still' && (img.classList.contains('whole') || img.dataset.frame === 'front')
    && Math.abs(r / car - 1) > .02) coverBackdrop(img);
}

/* Only the front cover to the right of the fold goes into the card, with not one pixel of back cover showing. The fold position lives in `data-posterbox`,
   and the container ratio the conversion needs is known only to the page; the two meet here. */
export function posterPanel(img: HTMLImageElement, ratio: number): void {
  if (img.dataset.frame === 'front' || img.dataset.coverLayout === 'still') return;
  let [x0 = NaN, imgW = NaN, imgH = NaN, y0 = NaN, x1 = NaN, y1 = NaN] = String(img.dataset.posterbox || '').split(' ').map(Number);
  /* A frameless double-page sleeve is measured back from the right edge by prior, matching the ratio frame the server uses when it cannot find the crease. */
  if (!img.dataset.posterbox && img.dataset.frame === 'sleeve') {
    imgW = img.naturalWidth; imgH = img.naturalHeight;
    x0 = Math.round(imgW - (wideSleeve(img) ? WIDE_PANEL_ASPECT : PANEL_ASPECT) * imgH); y0 = 0; x1 = imgW; y1 = imgH;
  }
  /* The frame is computed against that edition's source pixels, but the cover gets atomically replaced by a larger one. A size mismatch means
     the frame describes another image, and landing on this one is a misaligned region; and misalignment is indistinguishable on the page from
     "framed that way on purpose", so falling back to the default is the safer call. */
  // Cards first take the proportionally downscaled derived tier, and frame percentages stay constant under proportional scaling, so only the downscaled image is recognized, not any other.
  if (!faceSourceScale(img.naturalWidth, img.naturalHeight, imgW, imgH)) return;
  const panelAspect = (x1 - x0) / (y1 - y0);
  const sourceAspect = imgW / imgH;
  const widePanel = sourceAspect >= WIDE_SLEEVE_RATIO_MIN && sourceAspect < WIDE_SLEEVE_RATIO_MAX
    && Math.abs(panelAspect - WIDE_PANEL_ASPECT) <= .02;
  const frame = panelFrame({ x0, y0, x1, y1, px: [imgW, imgH] }, ratio, wideSleeve(img) || widePanel);
  if (!frame) return;
  img.style.setProperty('--panel-aspect', `${img.naturalWidth} / ${img.naturalHeight}`);
  img.classList.add('panel');
  img.style.setProperty('--panel-clip',
    `${frame.clip.top}% ${frame.clip.right}% ${frame.clip.bottom}% ${frame.clip.left}%`);
  img.style.setProperty('--panel-left', `${frame.left}%`);
  img.style.setProperty('--panel-top', `${frame.top}%`);
  img.style.setProperty('--panel-height', `${frame.height}%`);
  if (img.dataset.frame !== 'still' && img.classList.contains('front')
    && Math.abs(panelAspect / ratio - 1) > .02) coverBackdrop(img);
}

/** The whitespace beside a traditional full cover is filled with a blur of the same image, preferring an already-loaded derivative. */
function coverBackdrop(img: HTMLImageElement): void {
  const src = (img.dataset.thumbSrc || img.currentSrc || img.src).replace(/"/g, '%22');
  img.closest<HTMLElement>('.pic,[data-media-pic]')?.style.setProperty('--cover-blur', `url("${src}")`);
}

function wideSleeve(img: HTMLImageElement): boolean {
  const code = img.dataset.coverCode || new URL(img.currentSrc || img.src, location.href).searchParams.get('code') || '';
  const ratio = img.naturalWidth / img.naturalHeight;
  return !/^FC2(?:-PPV)?-/i.test(code)
    && (img.dataset.wideSleeve === '1' || /^(CWPBD|SMBD)-/i.test(code))
    && ratio >= WIDE_SLEEVE_RATIO_MIN && ratio < WIDE_SLEEVE_RATIO_MAX;
}

/* Cards fetch the cover's derived tier first (`/cover?thumb=2` or `thumb=1`, see `cardCoverUrl`): decoding one HD original
 * costs 38 MB, and dozens on a page would blow the decode cache; scrolling away gets them evicted and scrolling back re-decodes
 * on the spot, a stretch of blank. After framing settles, measure how large this image spreads on screen: when one source
 * pixel must cover more than one device pixel, this tier is not sharp enough, so step up: 800 becomes 1600, 1600 becomes the
 * original. The swapped image is measured again once it loads. Single column and large images, the places that genuinely use
 * the pixels, end at the original; with multiple columns the screen cannot hold that many pixels anyway.
 * `thumbSrc` records only the first derived tier: the blur underlay reuses the small image already at hand. */
export function upgradeCover(img: HTMLImageElement): void {
  const tier = /[?&]thumb=([12])(?=&|$)/.exec(img.src)?.[1];
  if (!tier || !img.naturalWidth) return;
  const { width, height } = img.getBoundingClientRect();
  const pick = getComputedStyle(img).objectFit === 'contain' ? Math.min : Math.max;
  const scale = pick(width / img.naturalWidth, height / img.naturalHeight) * devicePixels();
  if (!(scale > 1.01)) return;
  img.dataset.thumbSrc ||= img.src;
  img.src = tier === '2'
    ? img.src.replace(/([?&])thumb=2(?=&|$)/, '$1thumb=1')
    : img.src.replace(/[?&]thumb=1(?=&|$)/, '');
}

/* Only `.pic`'s `--card-ratio` knows the container ratio: the portrait switch, JAV large-image and normal cards each write
   one value, and recomputing it here per layout would fork from it sooner or later. Custom properties inherit, so read it
   straight off the image; `aspect-ratio` allows forms like `16/9`, so both spellings must be recognized.
   When the card frame's own inline style carries the value, read inline: no ratio is set on the layer between frame and
   image, so the read is the computed value, and `getComputedStyle` on freshly inserted cards would first recalculate the
   whole style tree. Only when the frame has none (the ratio written on an outer grid) does it read computed styles. */
export function coverRatio(img: HTMLImageElement): number {
  const inline = img.closest<HTMLElement>('.pic,[data-media-pic]')?.style.getPropertyValue('--card-ratio').trim();
  const parts = (inline || getComputedStyle(img).getPropertyValue('--card-ratio').trim()).split('/').map(Number);
  const r = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(parts[0]);
  return Number.isFinite(r) && r > 0 ? r : 16 / 9;
}

export function coverFace(img: HTMLImageElement, axis: 'cx' | 'cy'): number | null {
  const face = parseFloat(img.dataset[axis] ?? '');
  return Number.isFinite(face) ? face : null;
}

/* Loading states for covers and avatars, same shape as the avatar-swap cell: while the image is in flight a shimmer coats the
   frame, and on arrival it fades out and blurs away (`.imgwait` in `09-skeleton.css`). Images are interpolated from template
   strings, so per-image listeners are impossible; instead each insertion is inspected: images already `complete` (the
   cache-decoded kind) are marked nothing, so no re-render flashes the shimmer. Once marked, `load` is guaranteed to arrive,
   because the image is already in the document and capture-phase listeners receive it; a failed `error` also wraps up, so the
   shimmer never covers the initial letter. After wrapping up the class names come off together: images that arrived before
   the threshold are stripped directly, ones that faded wait for the fade to finish, and covers keep no `::after` layer in
   normal state. The avatar frames of the React index page (`[data-person-ring]`) and the profile card's large slot and
   co-performers (`[data-entity-portrait]`, `[data-hero-ring]`) assemble their images through this layer too and are likewise
   seen at insertion. */
const PENDING_IMAGES = '.pic>img.poster,[data-media-art]>img,.ring>img,[data-tier-ring]>img,[data-person-ring]>img,[data-entity-portrait]>img,[data-hero-ring]>img';
const pendingSince = new WeakMap<Element, number>();

/** An image not yet in hand when inserted into the page is marked `imgwait` on the frame. */
export function watchPendingImages(node: Element): void {
  const found = node.matches(PENDING_IMAGES) ? [node] : node.querySelectorAll(PENDING_IMAGES);
  for (const img of found) {
    if (!(img as HTMLImageElement).complete && img.parentElement) {
      img.parentElement.classList.add('imgwait'); pendingSince.set(img.parentElement, performance.now());
      gateSweep(img.parentElement);
    }
  }
}

/** The image arrived or failed to load: take the shimmer off the frame. If it has not been up long enough, remove it right away; otherwise remove it after the fade-out completes. */
export function settleImage(img: HTMLImageElement): void {
  const box = img.parentElement;
  if (!box?.classList.contains('imgwait')) return;
  releaseSweep(box);
  if (performance.now() - (pendingSince.get(box) ?? NaN) < SKELETON_REVEAL_DELAY) { box.classList.remove('imgwait'); return; }
  box.classList.replace('imgwait', 'ui-imgdone');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drop = (event?: Event) => {
    if (event && (event.target !== box || (event as TransitionEvent).pseudoElement !== '::after')) return;
    box.removeEventListener('transitionend', drop); clearTimeout(timer); box.classList.remove('ui-imgdone');
  };
  box.addEventListener('transitionend', drop);
  // Fallback: `transitionend` never arrives when the panel is hidden in a background tab or animations are zeroed out.
  timer = setTimeout(drop, 1000);
}

/* A cached image paints in the very first frame it is inserted, but `load` queues into the next task: without framing here first, that frame
   is either hidden (`09-skeleton.css`) or geometrically centered. The observation callback is a microtask, beating paint.
   Not limited to the `PENDING_IMAGES` frame types: face-framed avatars are scattered across pages, and they all need framing first wherever they are. */
export function frameCachedImages(node: Element): void {
  const framed = 'img.cover,img[data-facebox]';
  const found = node.matches(framed) ? [node] : node.querySelectorAll(framed);
  for (const el of found) {
    const img = el as HTMLImageElement;
    if (!(img.complete && img.naturalWidth)) continue;
    if (img.classList.contains('cover')) coverAnchor(img);
    else { fitNativeImage(img); avatarFrame(img); }
  }
}

/* Images smaller than the frame are no longer stretched: placed centered at native size, with an enlarged, blurred copy of
 * the same image filling the empty ring.
 *
 * Label logos measured from 42 px to 1378 px. `/logo?variant=large` already picked the sharpest copy for this label; what
 * remains are labels with no large image at all: stretching a 112 px image across a 180 px cell only magnifies the blur,
 * while at native size it is at least crisp.
 *
 * Measuring can only happen after `load`: before the image finishes, `naturalWidth` reads 0. After a fallback image swaps in,
 * `load` fires again, and the `currentSrc` read here is then whichever image is actually displayed.
 * Moderate upscaling is allowed; only clearly undersized images get the native-size underlay. */
export function fitNativeImage(img: HTMLImageElement): void {
  const box = img.closest<HTMLElement>('[data-fit-native]');
  if (!box || !img.naturalWidth) return;
  /* Extremely flat or extremely tall logos take another path: the short edge stretched to its floor and the long edge cropped at both ends (`[data-native-clamp]` switches to cover),
     with no backing; the blur would magnify a single line into one big smear. */
  const clamp = box.dataset.fitNative === 'mark'
    ? markClamp(img.naturalWidth, img.naturalHeight, box.clientWidth, box.clientHeight) : null;
  box.dataset.nativeClamp = String(!!clamp);
  if (clamp) {
    box.dataset.nativeSmall = 'false';
    box.style.setProperty('--markw', clamp.width + 'px');
    box.style.setProperty('--markh', clamp.height + 'px');
    box.style.setProperty('--markbg', 'none');
    return;
  }
  // Layout switches change the frame size, so re-evaluate by device pixel ratio every time.
  const { small, width, height } = nativeImageFit(img.naturalWidth, img.naturalHeight, box.clientWidth, box.clientHeight, devicePixels());
  box.dataset.nativeSmall = String(small);
  box.style.setProperty('--markw', small ? width + 'px' : '100%');
  box.style.setProperty('--markh', small ? height + 'px' : '100%');
  const src = (img.currentSrc || img.src).replace(/"/g, '%22');
  box.style.setProperty('--markbg', small ? `url("${src}")` : 'none');
}

/** An already-loaded image will not fire `load` again, so a resized container has to measure itself once more. */
export function refitNativeImages(root?: ParentNode | null): void {
  (root || document).querySelectorAll<HTMLImageElement>('[data-fit-native] img').forEach(img => {
    fitNativeImage(img);
    if (img.dataset.facebox) avatarFrame(img);
  });
}

/** Cover cell layout switch: the code cover in the cell swaps its framing class in place, covers already in hand are reframed to the new card ratio, and a
 *  derived tier that is not sharp enough falls back to the original. */
export function relayoutCovers(root: ParentNode, layout: JavLayout): void {
  for (const img of relayoutJavImages(root, layout)) { coverAnchor(img); upgradeCover(img); }
}

let installed = false;

/** The site-wide listeners for framing and shimmer. Called once at shell startup; repeat calls never mount a second copy. */
export function installCardArt(): void {
  if (installed) return;
  installed = true;
  /* Covers are assembled from template strings, so listeners cannot be attached per image; an inline `onload` attribute can only call global functions, and
     the module's framing function is unreachable there; the page would report a ReferenceError per image and every cover would frame by fallback.
     `load` does not bubble, but the capture phase still receives it. */
  document.addEventListener('load', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    settleImage(img);
    fitNativeImage(img);
    if (img.classList.contains('cover')) { coverAnchor(img); upgradeCover(img); }
    // Avatars take the same path for the same reason: the factor is only computable once both image and box have landed.
    else if (img.dataset.facebox) avatarFrame(img);
  }, true);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes)
      if (node.nodeType === Node.ELEMENT_NODE) { watchPendingImages(node as Element); frameCachedImages(node as Element); }
  }).observe(document.body, { childList: true, subtree: true });
  // Mounted on document, so it receives the event before the fallback chain on body: the frame is still findable before the image is removed. The fallback chain also has
  // The shimmer stays while the next image loads; clear it only when the replacement arrives.
  document.addEventListener('error', event => {
    const img = event.target;
    if (img instanceof HTMLImageElement && !img.dataset.fallbacks) settleImage(img);
  }, true);
}
