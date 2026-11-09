export type JavImagePreference = 'cover' | 'thumbnail';
export type JavLayout = 'big' | 'small';

export function normalizeJavLayout(value: unknown): JavLayout {
  return ['small', 'sleeve', 'preview'].includes(String(value)) ? 'small' : 'big';
}

export function normalizeJavPreferences(settings: { javLayout?: unknown; javImage?: unknown }) {
  return {
    javLayout: normalizeJavLayout(settings.javLayout),
    javImage: normalizeJavImage(settings.javLayout === 'preview' ? 'thumbnail' : settings.javImage),
  };
}

export function normalizeJavImage(value: unknown): JavImagePreference {
  return value === 'thumbnail' ? 'thumbnail' : 'cover';
}

export function javImageKind(item: { is_jav?: boolean; code?: string; has_cover?: boolean; has_thumb?: boolean }, preference: unknown): 'cover' | 'thumbnail' | '' {
  const cover = Boolean(item.is_jav && item.code && item.has_cover);
  if (cover && (normalizeJavImage(preference) === 'cover' || !item.has_thumb)) return 'cover';
  return item.has_thumb ? 'thumbnail' : '';
}

/** The front cover's aspect ratio matches `jav_poster_crop.PANEL_ASPECT`. Cover framing locks ratio by it; double-page covers without a sidecar measure the front cover's width back from the right edge by it;
 *  hugging the right edge, a 0.75 card is wider than the front cover, and without measuring a strip of spine gets pulled in. */
export const PANEL_ASPECT = 0.704;
// Shares dimensions with jav_poster_crop's wide sleeve template; enabled only for an explicit Blu-ray edition.
export const WIDE_PANEL_ASPECT = 0.85;
export const WIDE_SLEEVE_RATIO_MIN = 1.75;
export const WIDE_SLEEVE_RATIO_MAX = 1.85;

/** The shape of the endpoint's `poster_box`: `x0/y0/x1/y1` are source-image pixel coordinates, `px` the source image's
 *  size, and `method` records whether the box followed the fold (`fold`), the front-cover-aspect prior (`ratio`), or was
 *  boxed by hand on the details page (`manual`). The first two tiers are always full height pinned to the right edge with
 *  only `x0` live; a manual box can move on all four edges. Covers that must not be cropped, were never computed, or whose
 *  algorithm version has fallen behind get null. */
export interface PosterBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  method?: string;
  px: number[];
}

/** How the front cover sits inside the card. All four numbers are percentages: `clip` is how much to cut from each of the
 *  image's four edges (fed to `clip-path: inset()`), `left`/`top` are the image's top-left offset relative to the card, and
 *  `height` is the image's height relative to the card's height. Returns null without a box, and the caller falls back to the
 *  CSS default pinned to the right edge.
 *
 *  Scale is decided by the frame's height: the frame's block exactly fills the card height, so the image is sized to
 *  `source height / frame height` times the card height. The two computed frame tiers are already full height, so this is
 *  always 100% and not one pixel of zoom; only a manual frame cutting horizontally exceeds 100%.
 *
 *  Horizontally: the frame takes `frame width / frame height / container ratio` of the card's width. If it fits, center it and
 *  leave a strip on each side for the blurred background; if not, pin the frame's right edge to the card's right edge and cut
 *  from the left, because the title, performer name and badges all sit over the right side of the front cover. */
export function panelFrame(box: Partial<PosterBox> | null | undefined, ratio: number, contain = false): {
  clip: { top: number; right: number; bottom: number; left: number };
  left: number; top: number; height: number;
} | null {
  const width = Number(box?.px?.[0]);
  const height = Number(box?.px?.[1]);
  const x0 = Number(box?.x0);
  if (!(width > 0 && height > 0 && ratio > 0) || !Number.isFinite(x0)) return null;
  // Clamp back inside the image: a frame landing outside the image means bad data, and treating it as fully visible is safer than computing on with a negative width.
  // Missing `y0/y1/x1` is filled in as 'full height to the right edge'; the two computed frame tiers are exactly that shape.
  const span = (value: unknown, fallback: number, limit: number) =>
    Math.min(limit, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const left0 = span(x0, 0, width);
  const right = Math.max(left0, span(box?.x1, width, width));
  const top0 = span(box?.y0, 0, height);
  const bottom = Math.max(top0, span(box?.y1, height, height));
  const boxWidth = right - left0;
  const boxHeight = bottom - top0;
  if (!(boxWidth > 0 && boxHeight > 0)) return null;
  const visible = boxWidth / boxHeight / ratio;
  if (!(visible > 0)) return null;
  const scale = contain ? Math.min(1, 1 / visible) : 1;
  const offset = contain ? (1 - visible * scale) / 2 - left0 / boxHeight / ratio * scale : visible <= 1
    ? (1 - visible) / 2 - left0 / boxHeight / ratio
    : 1 - right / boxHeight / ratio;
  // `|| 0` folds -0 into 0: the two are identical once written into CSS, but differ when read back and compared.
  const percent = (value: number) => (Math.round(value * 10000) || 0) / 100;
  return {
    clip: {
      top: percent(top0 / height), right: percent(1 - right / width),
      bottom: percent(1 - bottom / height), left: percent(left0 / width),
    },
    left: percent(offset),
    top: percent((1 - scale) / 2 - top0 / boxHeight * scale),
    height: percent(height / boxHeight * scale),
  };
}

/** Swap the image in place, preserving list order, scroll position and the media now playing. */
export function syncJavImages(root: ParentNode, preference: unknown): void {
  root.querySelectorAll<HTMLImageElement>('img[data-jav-image]').forEach(img => {
    const cover = img.dataset.javCover || '';
    const thumb = img.dataset.javThumb || '';
    const useCover = Boolean(cover && (normalizeJavImage(preference) === 'cover' || !thumb));
    const src = useCover ? cover : thumb;
    img.classList.toggle('cover', useCover);
    img.classList.toggle('whole', useCover && img.dataset.javImageLayout !== 'big');
    img.classList.toggle('front', useCover && img.dataset.javImageLayout === 'big');
    /* The crop is computed against the previous image, so it is invalidated whenever the image changes; `coverAnchor` recomputes it once the new image loads.
       The blurred backdrop hangs on the card, not on the image, so `removeAttribute('style')` cannot reach it. */
    img.classList.remove('panel');
    img.removeAttribute('style');
    (img.closest('.pic,[data-media-pic]') as HTMLElement | null)?.style.removeProperty('--cover-blur');
    if (src && img.getAttribute('src') !== src) img.src = src;
  });
}

/** Large/small image swap in place: the same image only changes its framing class, with source and swapped-back originals kept, no re-decode.
 *  Framing computed for the previous layout is voided wholesale; return the ones already loaded that must recompute framing immediately for the new card ratio,
 *  and the not-yet-arrived ones compute on their own `load`. */
export function relayoutJavImages(root: ParentNode, layout: JavLayout): HTMLImageElement[] {
  const ready: HTMLImageElement[] = [];
  root.querySelectorAll<HTMLImageElement>('img[data-jav-image]').forEach(img => {
    if (img.dataset.javImageLayout === layout) return;
    img.dataset.javImageLayout = layout;
    if (!img.classList.contains('cover')) return;
    img.classList.toggle('whole', layout !== 'big');
    img.classList.toggle('front', layout === 'big');
    img.classList.remove('panel');
    img.removeAttribute('style');
    (img.closest('.pic,[data-media-pic]') as HTMLElement | null)?.style.removeProperty('--cover-blur');
    if (img.complete && img.naturalWidth) ready.push(img);
  });
  return ready;
}
