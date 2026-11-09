import { describe, expect, it } from 'vitest';
import { markClamp, MARK_MIN_SHORT, nativeImageFit, faceSourceScale } from '../../src/card-art/native-image';

it('A 544x724 legacy portrait cannot use the 2184x1468 cover\'s focus', () => {
  expect(faceSourceScale(544, 724, 2184, 1468)).toBe(0);
  expect(faceSourceScale(544, 724, 544, 724)).toBe(1);
  expect(faceSourceScale(0, 0, 0, 0)).toBe(0);
});

describe('Derivative scale relative to the sidecar source image', () => {
  it('The original itself is 1', () => {
    expect(faceSourceScale(1200, 1600, 1200, 1600)).toBe(1);
  });
  it('The copy downscaled to a 640 long edge reports its scale factor', () => {
    expect(faceSourceScale(480, 640, 1200, 1600)).toBeCloseTo(0.4, 6);
  });
  it('Rounding\'s half-pixel error still counts as the same image', () => {
    expect(faceSourceScale(481, 640, 1203, 1600)).toBeGreaterThan(0);
  });
  it('A different ratio means a different image', () => {
    expect(faceSourceScale(544, 724, 2184, 1468)).toBe(0);
  });
  it('Something larger than the source image can never be its downscale', () => {
    expect(faceSourceScale(2400, 3200, 1200, 1600)).toBe(0);
  });
  it('Never frames without dimensions', () => {
    expect(faceSourceScale(0, 0, 1200, 1600)).toBe(0);
    expect(faceSourceScale(480, 640, 0, 0)).toBe(0);
  });
});

describe('Avatar and mark thumbnails carry backing', () => {
  it('Low-resolution images in a large box center at native size', () => {
    expect(nativeImageFit(64, 64, 180, 240)).toEqual({ small: true, width: 64, height: 64 });
  });
  it('The 70px compact avatar applies, and 32px icons get no backing', () => {
    expect(nativeImageFit(16, 16, 70, 70).small).toBe(true);
    expect(nativeImageFit(16, 16, 32, 32).small).toBe(false);
  });
  it('Wide wordmarks keep their ratio and stay inside the container', () => {
    expect(nativeImageFit(400, 40, 180, 180)).toEqual({ small: true, width: 180, height: 18 });
  });
  it('On high-density screens the 64px square mark may enlarge in compact mode', () => {
    expect(nativeImageFit(64, 64, 70, 70, 2)).toEqual({ small: false, width: 32, height: 32 });
    expect(nativeImageFit(64, 64, 32, 32, 2).small).toBe(false);
  });
  it('Sharp images and ones needing slight enlargement fill', () => {
    expect(nativeImageFit(300, 400, 180, 240).small).toBe(false);
    expect(nativeImageFit(350, 350, 369, 369, 2).small).toBe(false);
    expect(nativeImageFit(150, 200, 180, 240).small).toBe(false);
    expect(nativeImageFit(0, 0, 180, 240).small).toBe(false);
  });
});

describe('Ultra-flat and ultra-tall marks stretch to the minimum short edge', () => {
  it('A 1378x42 bar stretches its short edge to the frame\'s short-edge minimum while the long edge follows the frame', () => {
    expect(markClamp(1378, 42, 180, 180)).toEqual({ width: 180, height: 180 * MARK_MIN_SHORT });
  });
  it('A 42x600 vertical strip widens the same way', () => {
    expect(markClamp(42, 600, 180, 180)).toEqual({ width: 180 * MARK_MIN_SHORT, height: 180 });
  });
  it('10:1 wordmarks and square marks still contain as usual', () => {
    expect(markClamp(400, 40, 180, 180)).toBeNull();
    expect(markClamp(120, 120, 180, 180)).toBeNull();
  });
  it('Never moves before the size measures', () => {
    expect(markClamp(0, 0, 180, 180)).toBeNull();
    expect(markClamp(1378, 42, 0, 0)).toBeNull();
  });
});
