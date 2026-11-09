/* The avatar's face zoom: the multiplier clamped between "legible", "well placed", "no head crop", and "no upsampling".
 *
 *  Expected values follow `faceZoom`'s formulas step by step, not numeric literals: hand-copying a rounded number turns the assertion into
 *  "same as last run", hiding which cap is speaking. */
import { describe, expect, it } from 'vitest';

import { faceFrame, faceZoom, hasFaceBox } from '../../src/card-art/face-frame';

/** The smallest face in the library: `performer-8711` is a 640×960 full-body standing shot with a face box only 67 px wide.
 *  It is the baseline because only at this scale does zooming hit all three caps at once. */
const SMALL_FACE = { cx: 0.439, cy: 0.224, faceW: 67, imgW: 640, imgH: 960 };
/** Three quarters of the 539 look like this: the face box already takes over 40% of the frame width, and zooming in crops off the top of the head. */
const CLOSE_UP = { cx: 0.5, cy: 0.42, faceW: 280, imgW: 640, imgH: 896 };
/** Representative image for the genre badges on the follows page, the copy saved by `/work-icon`: 512 px square, face box 170 px.
 *  For the `Final Fantasy` one the face sits at 0.211 from the top of the frame; half the image is below the face. */
const WORK_ICON = { cx: 0.508, cy: 0.211, faceW: 170, imgW: 512, imgH: 512 };
/** The `Tekken` one: the face is squeezed into the top right corner, close to the edge on both axes. */
const WORK_ICON_CORNER = { cx: 0.889, cy: 0.134, faceW: 110, imgW: 512, imgH: 512 };

const ring = (side: number) => ({ w: side, h: side });

describe('faceZoom', () => {
  it('A 28 px round badge needs a larger ratio to meet the pixel floor; the 48 px author avatar still uses the ratio tier', () => {
    // Both faces sit dead center, so the 'straighten' tier computes to exactly 1x: only the minimum and the ratio are left competing.
    const icon = { ...WORK_ICON, cx: 0.5, cy: 0.5 };
    const mid = { cx: 0.5, cy: 0.5, faceW: 187, imgW: 640, imgH: 960 };
    expect(faceZoom(icon, ring(28), 2)).toBeCloseTo((13 / 28) * 28 / (170 * Math.max(28 / 512, 28 / 512)), 10);
    expect(faceZoom(mid, ring(48), 2)).toBeCloseTo(0.32 * 48 / (187 * Math.max(48 / 640, 48 / 960)), 10);
  });

  it('When the face sits off-center it zooms until the box center is reachable, then the composition cap stops it', () => {
    const ceiling = (face: typeof WORK_ICON) => 0.6 * 28 / (face.faceW * Math.max(28 / 512, 28 / 512));
    expect(faceZoom(WORK_ICON, ring(28), 2)).toBeCloseTo(ceiling(WORK_ICON), 10);
    // When both axes hit their edges, take the tighter one. This one needs 4.5x to sit right, so the framing limit arrives first.
    expect(faceZoom(WORK_ICON_CORNER, ring(28), 2)).toBeCloseTo(ceiling(WORK_ICON_CORNER), 10);
    // A close-up already centered does not move a single pixel.
    expect(faceZoom(CLOSE_UP, ring(160), 2)).toBe(1);
  });

  it('Whichever limit is hit first is the one that reports', () => {
    const wanted = (side: number) => 0.32 * side / (67 * Math.max(side / 640, side / 960));
    // Profile page 160 px round frame on a 2x screen: the lossless cap is hit first, and a 67 px face can still afford 2x.
    expect(faceZoom(SMALL_FACE, ring(160), 2)).toBeCloseTo(2, 10);
    // The same image moves into the top bar's 64 px circle: the lossless cap rises to 5x, and the target ratio now decides.
    expect(faceZoom(SMALL_FACE, ring(64), 2)).toBeCloseTo(wanted(64), 10);
    // A 1x display needs half the device pixels, so the lossless cap doubles to 4, still held down by the target ratio.
    expect(faceZoom(SMALL_FACE, ring(160), 1)).toBeCloseTo(wanted(160), 10);
    expect(faceZoom(CLOSE_UP, ring(160), 2)).toBe(1);
    expect(faceFrame(CLOSE_UP, ring(160), 2)).toBeNull();
  });

  it('Wide full-body shots zoom past 5x; only the lossless limit caps them', () => {
    // The `Clair Obscur: Expedition 33` 16:9 cover, where a face takes 4.5% of the frame width.
    const far = { cx: 0.532, cy: 0.196, faceW: 0.045 * 512, imgW: 512, imgH: 288 };
    const lossless = far.faceW / (far.faceW * Math.max(28 / 512, 28 / 288) * 2);
    expect(faceZoom(far, ring(28), 2)).toBeCloseTo(lossless, 10);
  });
});

describe('faceFrame', () => {
  it('The enlarged image fills the box, pulling the face center toward the box center', () => {
    // The face sits at 0.181 from the top of the frame: zoomed until the face center just reaches the frame center, `top` lands exactly at 0.
    expect(faceFrame({ cx: 0.736, cy: 0.181, faceW: 234, imgW: 2184, imgH: 1468 }, ring(160), 2))
      .toEqual({ zoom: 2.762, width: 410.98, height: 276.24, left: -252.48, top: 0 });
    expect(faceFrame(SMALL_FACE, ring(160), 2))
      .toEqual({ zoom: 2, width: 200, height: 300, left: -37.8, top: -17.2 });
    // After zooming, the square image is larger than the frame and can finally move vertically.
    expect(faceFrame({ cx: 0.5, cy: 0.3, faceW: 150, imgW: 1000, imgH: 1000 }, ring(160), 2))
      .toEqual({ zoom: 2.133, width: 213.33, height: 213.33, left: -56.67, top: -14 });
    // The 3:4 frame: cover's base scale follows the tighter side, with each axis clamped on its own.
    expect(faceFrame(SMALL_FACE, { w: 150, h: 200 }, 2))
      .toEqual({ zoom: 2.133, width: 213.33, height: 240, left: -43.65, top: -3.76 });
  });
});

describe('Without data it falls back to shifting without zooming', () => {
  const noPixels = { cx: 0.4, cy: 0.2 };
  it('Missing face-box pixels, zero width, or an absent box all count as no face box; a face center of 0 is a real composition', () => {
    expect(hasFaceBox(SMALL_FACE)).toBe(true);
    expect(hasFaceBox(noPixels)).toBe(false);
    expect(hasFaceBox({ cx: 0.4, cy: 0.2, faceW: 0, imgW: 640, imgH: 960 })).toBe(false);
    expect(hasFaceBox(null)).toBe(false);
    expect(hasFaceBox({ cx: 0, cy: 0, faceW: 67, imgW: 640, imgH: 960 })).toBe(true);
  });

  it('When the multiplier cannot compute it is 1x with no framing result', () => {
    expect(faceZoom(noPixels, ring(160), 2)).toBe(1);
    expect(faceFrame(noPixels, ring(160), 2)).toBeNull();
    // Width and height are 0 when the box has no layout yet (skeleton screens, display:none).
    expect(faceZoom(SMALL_FACE, { w: 0, h: 0 }, 2)).toBe(1);
  });
});
