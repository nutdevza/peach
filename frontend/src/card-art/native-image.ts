/** How much the image at hand is scaled down relative to the sidecar's source; if a different image took its place, it is 0.
 *
 *  The index page fetches the entity image's derived copy scaled to a 640 long edge, while the face sidecar still records the
 *  original's pixels. Framing geometry is invariant under uniform scaling, except "how big until it blurs", which asks how
 *  many pixels there really are: applying the original's numbers to the derived copy computes exactly the factor that blurs
 *  the image. So the face box is converted to the image at hand by this ratio.
 *
 *  Both axes are computed once and compared: uniform scaling differs only by rounding, and a large difference means this is a
 *  different image entirely. Only shrinking counts: anything larger than the source cannot be its scaled copy. */
export function faceSourceScale(width: number, height: number, sourceWidth: number, sourceHeight: number) {
  if (!(width > 0 && height > 0 && sourceWidth > 0 && sourceHeight > 0)) return 0;
  const byWidth = width / sourceWidth, byHeight = height / sourceHeight;
  if (byWidth > 1.001 || byHeight > 1.001) return 0;
  if (Math.abs(byWidth - byHeight) > Math.max(byWidth, byHeight) * .01) return 0;
  return byWidth;
}

/** Avatars under 64 px count as small icons; large images and the 70 px compact avatar use source pixels to decide whether to add a backing. */
export function nativeImageFit(width: number, height: number, frameWidth: number, frameHeight: number, dpr = 1) {
  const density = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  width /= density;
  height /= density;
  const valid = [width, height, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0);
  const small = valid && Math.min(frameWidth, frameHeight) >= 64
    && (width < frameWidth * .4 || height < frameHeight * .4);
  const scale = valid ? Math.min(1, frameWidth / width, frameHeight / height) : 1;
  return { small, width: width * scale, height: height * scale };
}

/** After the mark is contained to the box, the short edge must occupy at least this share of the box's short edge. A 10:1 wordmark in a square box lands exactly on this line. */
export const MARK_MIN_SHORT = 0.1;

/** Extremely flat or extremely tall logos (measured 1378x42, 42x600) reduce to a line under contain-to-frame: the short side stretches to `MARK_MIN_SHORT`,
 *  the long side still fits the frame, placed with cover, cropping the long side's two ends. Normally-proportioned logos return `null` and contain as usual. */
export function markClamp(width: number, height: number, frameWidth: number, frameHeight: number) {
  if (![width, height, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(frameWidth / width, frameHeight / height);
  const shownWidth = width * scale, shownHeight = height * scale;
  const floor = Math.min(frameWidth, frameHeight) * MARK_MIN_SHORT;
  if (Math.min(shownWidth, shownHeight) >= floor) return null;
  return shownHeight < shownWidth ? { width: shownWidth, height: floor } : { width: floor, height: shownHeight };
}
