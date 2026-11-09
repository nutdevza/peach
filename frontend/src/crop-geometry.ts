/* The crop box's coordinates in the source image. Pure arithmetic, touches no DOM, knows no React.
 *
 * Everything is in **source-image pixels** with a bottom-right-open interval: the box written to disk, the box sent to the
 * backend, and the `poster_box` field all use this set (the `projection` docstring in `src/peach/jav_poster_crop.py`).
 * What is measured on screen is display pixels, converted once on entering and once on leaving this layer: with both sides
 * computing in their own coordinates, a non-integer scale would put the box off by a pixel or two, invisible on screen and
 * only surfacing later when the numbers fail to reconcile.
 */

export interface CropSize {
  width: number;
  height: number;
}

export interface CropBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The box's minimum side length, in source pixels. Anything smaller boxes noise, not content. */
export const MIN_CROP_EDGE = 16;

function whole(size: CropSize): CropBox {
  return { x0: 0, y0: 0, x1: size.width, y1: size.height };
}

function round(box: CropBox): CropBox {
  return {
    x0: Math.round(box.x0), y0: Math.round(box.y0),
    x1: Math.round(box.x1), y1: Math.round(box.y1),
  };
}

export function isUsableSize(size: CropSize | null | undefined): size is CropSize {
  return Boolean(size) && Number.isFinite(size!.width) && Number.isFinite(size!.height)
    && size!.width > 0 && size!.height > 0;
}

/** The largest box that fits, centered by `aspect` (width/height); when `aspect` is null it is the whole image.
 *
 *  The front-cover path's default box has its own rules; see `defaultPanelBox`. */
export function centeredBox(size: CropSize, aspect: number | null): CropBox {
  if (!isUsableSize(size)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  if (aspect == null || !(aspect > 0)) return whole(size);
  let width = size.width;
  let height = width / aspect;
  if (height > size.height) {
    height = size.height;
    width = height * aspect;
  }
  const left = (size.width - width) / 2;
  const top = (size.height - height) / 2;
  return round({ x0: left, y0: top, x1: left + width, y1: top + height });
}

/** The front cover's default frame: full height, width by ratio, hugging the right edge.
 *
 *  A landscape cover is "back | spine | front", front on the right, so the default frame is "measuring back from the right edge one front cover's width".
 *  What people usually change is just which column the fold falls on; the default frame gets the other three edges right first,
 *  saving three drags. If it does not fit, fall back to the whole image. */
export function defaultPanelBox(size: CropSize, aspect: number): CropBox {
  if (!isUsableSize(size) || !(aspect > 0)) return whole(size);
  const width = Math.min(size.width, size.height * aspect);
  return round({ x0: size.width - width, y0: 0, x1: size.width, y1: size.height });
}

/** The largest frame that fits inside `focus` by `aspect`, centered on `focus`'s center.
 *
 *  `focus` is the region the backend says should be framed (a square around the face or the front cover), and its shape need
 *  not match `aspect`. Take what fits, not what encloses: enclosing the tall front cover would bring in the spine, and a 3:4
 *  frame enclosing the face's square would bring in a stretch of chest, while this region was measured precisely to fill an
 *  avatar exactly. */
export function frameWithin(focus: CropBox, size: CropSize, aspect: number): CropBox {
  if (!isUsableSize(size) || !(aspect > 0)) return whole(size);
  const inside = clampBox(focus, size);
  const box = centeredBox({ width: inside.x1 - inside.x0, height: inside.y1 - inside.y0 }, aspect);
  return {
    x0: inside.x0 + box.x0, y0: inside.y0 + box.y0,
    x1: inside.x0 + box.x1, y1: inside.y0 + box.y1,
  };
}

/** Pull the frame back inside the source image while keeping it a valid frame.
 *
 *  With `aspect` given, lock the ratio: size along the `anchor` side first, switch to the other side when it does not fit, and
 *  if it still does not fit, shrink against the image's edge. After all four corners are clamped, width and height are both at least `MIN_CROP_EDGE`. */
export function clampBox(box: CropBox, size: CropSize, aspect: number | null = null,
                         anchor: 'width' | 'height' = 'width'): CropBox {
  if (!isUsableSize(size)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  const floor = Math.min(MIN_CROP_EDGE, size.width, size.height);
  let width = Math.max(floor, Math.min(box.x1 - box.x0, size.width));
  let height = Math.max(floor, Math.min(box.y1 - box.y0, size.height));
  if (aspect != null && aspect > 0) {
    if (anchor === 'width') {
      height = width / aspect;
      if (height > size.height) { height = size.height; width = height * aspect; }
    } else {
      width = height * aspect;
      if (width > size.width) { width = size.width; height = width / aspect; }
    }
    if (width > size.width) { width = size.width; height = width / aspect; }
  }
  const left = Math.max(0, Math.min(box.x0, size.width - width));
  const top = Math.max(0, Math.min(box.y0, size.height - height));
  return round({ x0: left, y0: top, x1: left + width, y1: top + height });
}

/** Translates the whole frame by `(dx, dy)` source-image pixels, size unchanged, stopping at the edges. */
export function moveBox(box: CropBox, dx: number, dy: number, size: CropSize): CropBox {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const left = Math.max(0, Math.min(box.x0 + dx, size.width - width));
  const top = Math.max(0, Math.min(box.y0 + dy, size.height - height));
  return round({ x0: left, y0: top, x1: left + width, y1: top + height });
}

/** Scales around the frame's center. `factor` above 1 widens the frame (more content visible). */
export function scaleBox(box: CropBox, factor: number, size: CropSize,
                         aspect: number | null = null): CropBox {
  if (!isUsableSize(size) || !(factor > 0)) return box;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const width = (box.x1 - box.x0) * factor;
  const height = (box.y1 - box.y0) * factor;
  return clampBox({
    x0: cx - width / 2, y0: cy - height / 2,
    x1: cx + width / 2, y1: cy + height / 2,
  }, size, aspect);
}

/** Dragging the bottom-right corner: the top-left corner stays pinned, the bottom-right follows the pointer. */
export function resizeFromCorner(box: CropBox, x: number, y: number, size: CropSize,
                                 aspect: number | null = null): CropBox {
  const next = { x0: box.x0, y0: box.y0, x1: Math.max(box.x0 + 1, x), y1: Math.max(box.y0 + 1, y) };
  const anchor: 'width' | 'height' = (next.x1 - next.x0) / Math.max(1, next.y1 - next.y0)
    > (aspect ?? 1) ? 'height' : 'width';
  return clampBox(next, size, aspect, anchor);
}

/** Source image pixel box to overlay percentage position. Display size plays no part: percentages are relative to the image itself. */
export function boxPercent(box: CropBox, size: CropSize): {
  left: number; top: number; width: number; height: number;
} {
  if (!isUsableSize(size)) return { left: 0, top: 0, width: 0, height: 0 };
  return {
    left: (box.x0 / size.width) * 100,
    top: (box.y0 / size.height) * 100,
    width: ((box.x1 - box.x0) / size.width) * 100,
    height: ((box.y1 - box.y0) / size.height) * 100,
  };
}

/** The `background-size` / `background-position` for that region filling a container on its own.
 *
 *  The preview does not fetch the image again: the same address as a background image uses the same cached bytes.
 *  `background-position`'s percentage measures "the part the image exceeds the container by", so when the region exactly
 *  equals the whole image the denominator is 0 and the position is 0: image and container the same size, placement makes no
 *  difference. */
export function previewStyle(box: CropBox, size: CropSize): {
  size: string; position: string;
} {
  if (!isUsableSize(size)) return { size: 'cover', position: '50% 50%' };
  const width = Math.max(1, box.x1 - box.x0);
  const height = Math.max(1, box.y1 - box.y0);
  const spare = (offset: number, whole: number, part: number) =>
    whole - part > 0 ? (offset / (whole - part)) * 100 : 0;
  return {
    size: `${(size.width / width) * 100}% ${(size.height / height) * 100}%`,
    position: `${spare(box.x0, size.width, width)}% ${spare(box.y0, size.height, height)}%`,
  };
}

/** Where to place and how large to draw the whole `<img>` when that region fills a same-ratio container, as absolute
 *  positioning.
 *
 *  The same math as `previewStyle`, given as an image element rather than a background: only an image element has a `load`
 *  event to attach, and the fade-in waits for it. `left`/`width` percentages measure container width and `top`/`height`
 *  measure container height; container and region share a ratio, so each axis converts by its own edge. */
export function windowStyle(box: CropBox, size: CropSize): {
  left: string; top: string; width: string; height: string;
} {
  const width = Math.max(1, box.x1 - box.x0);
  const height = Math.max(1, box.y1 - box.y0);
  return {
    left: `${(-box.x0 / width) * 100}%`,
    top: `${(-box.y0 / height) * 100}%`,
    width: `${(size.width / width) * 100}%`,
    height: `${(size.height / height) * 100}%`,
  };
}

/** Display pixels to source image pixels. `rendered` is the CSS pixel size the `<img>` currently occupies. */
export function toNatural(value: number, rendered: number, natural: number): number {
  if (!(rendered > 0)) return 0;
  return (value * natural) / rendered;
}

/** When the box's short side on screen is smaller than this many CSS pixels, the resize handle moves outside the box. The handle is 12px; with the box only a little
 *  bigger, the handle covers the whole thing, so pressing resizes but cannot drag. */
export const HANDLE_ROOM = 36;

/** Whether the corner handle may sit outside the box: `rect` is the percentage of `boxPercent`, and `shown` is the image's current display size.
 *  Do not move while the display size has not been measured yet. */
export function handleOutside(
  rect: { width: number; height: number }, shown: CropSize | null,
): boolean {
  if (!shown || !(shown.width > 0) || !(shown.height > 0)) return false;
  return Math.min((rect.width / 100) * shown.width, (rect.height / 100) * shown.height) < HANDLE_ROOM;
}
