import { describe, expect, it } from 'vitest';

import {
  boxPercent, centeredBox, clampBox, defaultPanelBox, frameWithin, handleOutside, HANDLE_ROOM, MIN_CROP_EDGE, moveBox,
  previewStyle, resizeFromCorner, scaleBox, toNatural, windowStyle,
} from '../src/crop-geometry';

/** The most common cover size on this machine. */
const SLEEVE = { width: 800, height: 538 };
/** The front cover's aspect ratio, the same number as `PANEL_ASPECT` in `src/peach/jav_poster_crop.py`. */
const PANEL_ASPECT = 0.704;

describe('Default frame', () => {
  it('Boxes center on the short edge, and avatar boxes keep both edges equal', () => {
    expect(centeredBox(SLEEVE, 1)).toEqual({ x0: 131, y0: 0, x1: 669, y1: 538 });
  });

  it('Without aspect lock the default box covers the whole image', () => {
    expect(centeredBox(SLEEVE, null)).toEqual({ x0: 0, y0: 0, x1: 800, y1: 538 });
  });

  it('The front cover\'s default frame is full height at the right edge; only the fold edge needs moving', () => {
    // 538×0.704≈379, and measuring back from the right edge at 800 gives 421, matching the number the algorithm returns when it finds no crease.
    expect(defaultPanelBox(SLEEVE, PANEL_ASPECT)).toEqual({ x0: 421, y0: 0, x1: 800, y1: 538 });
  });

  it('When the proportional width exceeds the image width it falls back to the whole image', () => {
    expect(defaultPanelBox({ width: 300, height: 538 }, PANEL_ASPECT))
      .toEqual({ x0: 0, y0: 0, x1: 300, y1: 538 });
  });

  it('It never computes before the size is measured', () => {
    expect(centeredBox({ width: 0, height: 0 }, 1)).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  });
});

describe('Framed around the framing area', () => {
  it('In the square face image a square crop is the image itself; a 3:4 crop trims the sides and keeps the top and bottom', () => {
    const face = { x0: 592, y0: 114, x1: 688, y1: 210 };
    expect(frameWithin(face, SLEEVE, 1)).toEqual(face);
    expect(frameWithin(face, SLEEVE, 3 / 4)).toEqual({ x0: 604, y0: 114, x1: 676, y1: 210 });
  });

  it('For a tall front cover the square frame sizes by its width, centered and kept clear of the spine', () => {
    const panel = { x0: 421, y0: 0, x1: 800, y1: 538 };
    expect(frameWithin(panel, SLEEVE, 1)).toEqual({ x0: 421, y0: 80, x1: 800, y1: 459 });
  });

  it('A crop box outside the image is pulled back in first', () => {
    expect(frameWithin({ x0: 700, y0: -40, x1: 900, y1: 160 }, SLEEVE, 1))
      .toEqual({ x0: 600, y0: 0, x1: 800, y1: 200 });
  });

  it('The whole image is absolutely positioned so the boxed region exactly fills a same-ratio cell', () => {
    expect(windowStyle({ x0: 200, y0: 100, x1: 400, y1: 300 }, { width: 800, height: 600 })).toEqual({
      left: '-100%', top: '-50%', width: '400%', height: '300%',
    });
  });
});

describe('The box always stays inside the image', () => {
  it('Out-of-bounds boxes stop at the edge without shrinking', () => {
    expect(clampBox({ x0: 700, y0: 400, x1: 900, y1: 600 }, SLEEVE))
      .toEqual({ x0: 600, y0: 338, x1: 800, y1: 538 });
  });

  it('Boxes smaller than the minimum edge stretch back to it', () => {
    const box = clampBox({ x0: 10, y0: 10, x1: 12, y1: 12 }, SLEEVE);
    expect(box.x1 - box.x0).toBe(MIN_CROP_EDGE);
    expect(box.y1 - box.y0).toBe(MIN_CROP_EDGE);
  });

  it('With ratio locked the other edge fills proportionally, and when it cannot fit the sizing switches edges', () => {
    expect(clampBox({ x0: 0, y0: 0, x1: 400, y1: 100 }, SLEEVE, 1))
      .toEqual({ x0: 0, y0: 0, x1: 400, y1: 400 });
    // A box 700 wide does not fit in a 538-tall image, so the height sets the size instead.
    expect(clampBox({ x0: 0, y0: 0, x1: 700, y1: 100 }, SLEEVE, 1))
      .toEqual({ x0: 0, y0: 0, x1: 538, y1: 538 });
  });
});

describe('Dragging, zooming, and corner handles', () => {
  it('Panning keeps the size and stops at the edges', () => {
    const box = { x0: 100, y0: 100, x1: 300, y1: 300 };
    expect(moveBox(box, 50, -40, SLEEVE)).toEqual({ x0: 150, y0: 60, x1: 350, y1: 260 });
    expect(moveBox(box, 9999, 9999, SLEEVE)).toEqual({ x0: 600, y0: 338, x1: 800, y1: 538 });
  });

  it('The wheel zooms around the box center', () => {
    expect(scaleBox({ x0: 300, y0: 200, x1: 500, y1: 400 }, 1.5, SLEEVE))
      .toEqual({ x0: 250, y0: 150, x1: 550, y1: 450 });
  });

  it('Dragging the bottom right corner pins the top left', () => {
    expect(resizeFromCorner({ x0: 100, y0: 100, x1: 200, y1: 200 }, 460, 380, SLEEVE))
      .toEqual({ x0: 100, y0: 100, x1: 460, y1: 380 });
    // A ratio-locked box: when dragging right outpaces dragging down, the height sets the size so the box never runs past the image's bottom.
    expect(resizeFromCorner({ x0: 100, y0: 100, x1: 200, y1: 200 }, 700, 300, SLEEVE, 1))
      .toEqual({ x0: 100, y0: 100, x1: 300, y1: 300 });
  });
});

describe('The box converts into styles', () => {
  it('Overlay percentages are relative to the image itself, independent of display size', () => {
    expect(boxPercent({ x0: 200, y0: 0, x1: 600, y1: 538 }, SLEEVE))
      .toEqual({ left: 25, top: 0, width: 50, height: 100 });
  });

  it('Circular preview fills the container with the boxed region', () => {
    expect(previewStyle({ x0: 200, y0: 138, x1: 600, y1: 538 }, SLEEVE))
      .toEqual({ size: '200% 134.5%', position: '50% 100%' });
  });

  it('When the box equals the whole image the position is 0: image and container match, so placement is irrelevant', () => {
    expect(previewStyle({ x0: 0, y0: 0, x1: 800, y1: 538 }, SLEEVE))
      .toEqual({ size: '100% 100%', position: '0% 0%' });
  });

  it('Pixels measured on screen convert back to source-image pixels', () => {
    expect(toNatural(100, 400, 800)).toBe(200);
    // The image has no layout yet and the divisor is 0: return 0 instead of Infinity.
    expect(toNatural(100, 0, 800)).toBe(0);
  });
});

describe('Where the corner handle goes', () => {
  it('When the box is large enough on screen the corner handles sit on its corners', () => {
    expect(handleOutside({ width: 50, height: 50 }, { width: 400, height: 400 })).toBe(false);
  });
  it('A 4000×200 image is only 20px tall; the frame is barely larger than the corner handles, which move outside the frame', () => {
    // The square box fills the image height: 20×20 on screen.
    expect(handleOutside({ width: 5, height: 100 }, { width: 400, height: 20 })).toBe(true);
  });
  it('Only the short edge matters: even a very long strip must shift', () => {
    expect(handleOutside({ width: 100, height: 100 }, { width: 600, height: HANDLE_ROOM - 1 })).toBe(true);
  });
  it('Do not move until the image display size is measured', () => {
    expect(handleOutside({ width: 5, height: 5 }, null)).toBe(false);
    expect(handleOutside({ width: 5, height: 5 }, { width: 0, height: 0 })).toBe(false);
  });
});
