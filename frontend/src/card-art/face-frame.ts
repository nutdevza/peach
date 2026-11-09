/* Face framing for round avatars: from how many pixels the face occupies in the source image, compute how far it can zoom.
 *
 * When only panning and never zooming, "the face is too small" cannot be solved: `object-fit:cover` scaling is fixed by the
 * ratio of frame to image, so whatever share of the image the face occupies is what it occupies in the frame. Measured on 539
 * entity images, the median face width as a share of frame width is 44%. Three quarters of avatars are already close-ups and
 * zooming would only crop the top of the head and the chin; only 29 are genuinely small, almost all full-body standing shots
 * where the face sits in a small patch of the upper half of the frame.
 *
 * So the zoom factor can neither be hard-coded nor computed once on the server: the constraint is "how many pixels the face
 * has in the source" versus "how many pixels this frame displays", and the latter depends on the frame's actual size and the
 * device pixel ratio. The same 640×960 image with a 67 px wide face (`performer-8711`) hits the source's 1:1 at 2x zoom in the
 * profile page's 160 px round frame, and beyond that it is upsampling; on the top bar's 64 px frame, 3x still has headroom.
 * Same criteria, conclusions a factor apart; only computable on the page side, once the frame's real size is known.
 *
 * The clamp order is fixed: first compute "how big to be legible and well-centered", rein in with the composition ceiling, and
 * finally pin down with "how big until it blurs". When `zoom` is 1 it only pans, and the 395 images that are already large
 * enough take exactly this path.
 *
 * None of the limits is a multiplier: a multiplier answers none of the questions. The same 3x turns a close-up into a giant
 * face while a distant full-body shot's face is still 6 px. The questions are how big the face ends up (`FACE_CEILING`) and
 * how many pixels the source has left (the lossless ceiling); both need the frame's real size and the device pixel ratio, so
 * both can only be computed on the page side. */

/** A face box width of this fraction of the frame's short side counts as recognizing who it is; no zooming past that.
 *
 *  Detection boxes cover eyes, nose, and mouth only, not hair or the jaw's outer edge; at 32% the whole head is about seventy percent, still loose.
 *  Raising it would let already-tight close-ups get "rescued" into zoom by this tier, which those images do not need. */
export const FACE_TARGET = 0.32;

/** The face box must be at least this many CSS pixels wide inside the frame.
 *
 *  A ratio tier cannot answer the small round badges' question: 32% is a 38 px face in the profile page's 120 px frame but
 *  only 9 px in a 28 px tag badge, and a 9 px eyes-nose-mouth is unrecognizable, while recognizing the tag at a glance is the
 *  whole reason this row of badges exists. The pixel floor takes over only when the frame is small enough that the ratio falls
 *  short (a 28 px frame needs 46%; a 48 px frame computing below 32% still rides the ratio tier), and not one number moves on
 *  large frames. */
export const MIN_FACE_PX = 13;

/** The composition ceiling: the face box takes at most this share of the frame's short side.
 *
 *  The face box covers only eyes, nose and mouth: at 60% the whole head just fills the frame, and beyond that the top of the
 *  head and the chin start cropping.
 *
 *  This asks "how big is the face after placement", not "how many times zoomed": a multiplier answers no composition
 *  question. The same 3x turns a close-up into a giant face while a distant full-body shot's face is still 6 px.
 *  Measured on that 16:9 `Clair Obscur` cover: the face takes 4.5% of frame width, so covered into a 28 px circle only
 *  2.2 px remain, and it needs 5.8x to be legible while the lossless ceiling already has 5.1x of headroom. */
export const FACE_CEILING = 0.6;

/** Whether the face data is complete. Missing any piece means no computation, and the caller pans without zooming.
 *
 *  `faceW` is the face box width in **source-image pixels**, not normalized: the lossless cap asks "how many pixels are available",
 *  and a normalized value yields ratios but not pixels; the conversion must happen on the side that has the original dimensions. */
export interface FaceBox { cx: number; cy: number; faceW: number; imgW: number; imgH: number }

/** The frame's size in CSS pixels. */
export interface FrameSize { w: number; h: number }

export function hasFaceBox(face: Partial<FaceBox> | null | undefined): face is FaceBox {
  if (!face) return false;
  // A face center can be 0: images with a face flush against the left edge or top edge really exist; that is not missing data.
  return Number.isFinite(face.cx) && Number.isFinite(face.cy)
    && Number(face.faceW) > 0 && Number(face.imgW) > 0 && Number(face.imgH) > 0;
}

/** How many times to zoom. `frame` is the frame's CSS pixel size, `dpr` the device pixel ratio.
 *
 *  Pushing it up: the face must be big enough (`wanted`) and well placed (`centred`);
 *  holding it down: after placement the face must not exceed the composition cap, and the source's remaining pixels must not be upsampled. */
export function faceZoom(face: Partial<FaceBox> | null | undefined, frame: FrameSize | null | undefined, dpr = 1,
                         target = FACE_TARGET, ceiling = FACE_CEILING): number {
  if (!hasFaceBox(face) || !(frame && frame.w > 0 && frame.h > 0)) return 1;
  const ratio = dpr > 0 ? dpr : 1;
  // cover's base scaling: scale the image until it just covers the frame; the tighter side decides.
  const base = Math.max(frame.w / face.imgW, frame.h / face.imgH);
  const shown = face.faceW * base;
  if (!(shown > 0)) return 1;
  const side = Math.min(frame.w, frame.h);
  // Of the two tiers, take the wider one: the ratio governs large boxes, and the pixel floor governs boxes too small for the ratio to help.
  const wanted = Math.max(target, MIN_FACE_PX / side) * side / shown;
  /* Straightening also means zooming. Pulling the face center to the frame center assumes the image exceeds the frame by enough; no white may show, and when the image is not big enough the face can only
     be pinned against the frame's edge, measuring as big enough but looking "small and off-center". The closer the face is to the image edge, the more zoom pulling it to
     frame center needs, so the criterion is "the nearer side's distance to the centerline", computed per axis, taking the tighter one. */
  const centred = Math.max(
    frame.w / (2 * Math.min(face.cx, 1 - face.cx) * face.imgW * base),
    frame.h / (2 * Math.min(face.cy, 1 - face.cy) * face.imgH * base));
  // The face's source pixels divided by the device pixels the current frame needs. At 1 it is already 1:1; anything larger is upsampling.
  const lossless = face.faceW / (shown * ratio);
  return Math.max(1, Math.min(
    Math.max(wanted, Math.min(centred, ceiling * side / shown)),
    lossless));
}

/** Framing result; all four values are percentages relative to the frame.
 *
 *  Percentages, not pixels: the index page's large-image layout frame width follows column width and must change with the viewport,
 *  and percentages let CSS follow by itself. `zoom` only needs computing once against the frame size at load; a larger frame only makes
 *  the zoom factor conservative, never suddenly past the lossless cap. */
export function faceFrame(face: Partial<FaceBox> | null | undefined, frame: FrameSize | null | undefined, dpr = 1,
                          target = FACE_TARGET, ceiling = FACE_CEILING):
  { zoom: number; width: number; height: number; left: number; top: number } | null {
  const zoom = faceZoom(face, frame, dpr, target, ceiling);
  // A factor above 1 means the box was measurable; checking again here is only for type narrowing.
  if (zoom <= 1 || !hasFaceBox(face) || !frame) return null;
  const scale = Math.max(frame.w / face.imgW, frame.h / face.imgH) * zoom;
  const width = face.imgW * scale;
  const height = face.imgH * scale;
  // Face center on frame center, then clamp back so no white shows. `zoom >= 1` with a cover base, so the image is always larger than the frame,
  // This range is never empty.
  const left = Math.min(0, Math.max(frame.w - width, frame.w / 2 - face.cx * width));
  const top = Math.min(0, Math.max(frame.h - height, frame.h / 2 - face.cy * height));
  const pct = (value: number, span: number) => Math.round(value / span * 1e4) / 100;
  return {
    zoom: Math.round(zoom * 1000) / 1000,
    width: pct(width, frame.w), height: pct(height, frame.h),
    left: pct(left, frame.w), top: pct(top, frame.h),
  };
}
