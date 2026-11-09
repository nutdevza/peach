/* Cropping after images land: avatars scale by face, covers crop by face and front-cover box, undersized images sit at natural size, shimmer while loading.
 *
 * The test environment has no layout and does not decode images: frame sizes and image pixels are written directly on the elements. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  avatarFrame, coverAnchor, fitNativeImage, installCardArt, refitNativeImages, settleImage, upgradeCover,
  watchPendingImages,
} from '../../src/card-art/framing';

function sized(img: HTMLImageElement, width: number, height: number): HTMLImageElement {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: height });
  Object.defineProperty(img, 'complete', { configurable: true, value: true });
  return img;
}

function boxOf(el: Element, width: number, height: number): void {
  el.getBoundingClientRect = () => ({ width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) });
}

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('avatarFrame: the ring zooms to the face', () => {
  it('The image scales to cover times the factor, a negative offset pulls the face toward the box center, and the precheck width cap is removed', () => {
    const host = mount('<span class="ring"><img data-facebox="0.439 0.224 67 640 960"></span>');
    const img = sized(host.querySelector('img')!, 640, 960);
    boxOf(img.parentElement!, 160, 160);
    vi.stubGlobal('devicePixelRatio', 2);
    avatarFrame(img);
    vi.unstubAllGlobals();
    expect(img.dataset.faceFramed).toBe('');
    expect(img.style.position).toBe('absolute');
    expect(img.style.width).toBe('200%');
    expect(img.style.height).toBe('300%');
    expect(img.style.left).toBe('-37.8%');
    expect(img.style.top).toBe('-17.2%');
    expect(img.style.maxWidth).toBe('none');
  });

  it('Derived assets rescale the face box proportionally, falling back to geometric centering on a different image', () => {
    const host = mount('<span class="ring"><img data-facebox="0.439 0.224 67 640 960"></span>');
    const derived = sized(host.querySelector('img')!, 320, 480);
    boxOf(derived.parentElement!, 160, 160);
    avatarFrame(derived);
    expect(derived.style.width).not.toBe('');
    const other = mount('<span class="ring"><img data-facebox="0.439 0.224 67 640 960"></span>').querySelector('img')!;
    sized(other, 500, 500);
    boxOf(other.parentElement!, 160, 160);
    avatarFrame(other);
    expect(other.style.objectPosition).toBe('50% 50%');
    expect(other.style.width).toBe('');
  });

  it('Small images placed at native size never enlarge', () => {
    const host = mount('<span class="ring" data-native-small="true"><img data-facebox="0.439 0.224 67 640 960"></span>');
    const img = sized(host.querySelector('img')!, 640, 960);
    boxOf(img.parentElement!, 160, 160);
    avatarFrame(img);
    expect(img.dataset.faceFramed).toBe('');
    expect(img.style.width).toBe('');
  });

  it('The box stays hidden until laid out, framing once its size measures', () => {
    const observers: { fire(): void }[] = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: () => void) { observers.push({ fire: () => this.callback() }); }
      observe() {}
      disconnect() {}
    });
    const host = mount('<span class="ring"><img data-facebox="0.439 0.224 67 640 960"></span>');
    const img = sized(host.querySelector('img')!, 640, 960);
    boxOf(img.parentElement!, 0, 0);
    avatarFrame(img);
    expect(img.dataset.faceFramed).toBeUndefined();
    boxOf(img.parentElement!, 160, 160);
    observers[0]!.fire();
    vi.unstubAllGlobals();
    expect(img.dataset.faceFramed).toBe('');
    expect(img.style.width).not.toBe('');
  });
});

describe('coverAnchor: covers route by their own aspect ratio', () => {
  const cover = (src: string, width: number, height: number, attrs = '') => {
    const host = mount(`<div class="pic"><img class="poster cover front" src="${src}" style="--card-ratio:0.75" ${attrs}></div>`);
    return sized(host.querySelector('img')!, width, height);
  };

  it('Three forms: jacket, front cover, and stills; FC2 always counts as a full frame', () => {
    const sleeve = cover('/cover?code=SSIS-001', 800, 538);
    coverAnchor(sleeve);
    expect(sleeve.dataset.frame).toBe('sleeve');
    const front = cover('/cover?code=SSIS-002', 350, 500);
    coverAnchor(front);
    expect(front.dataset.frame).toBe('front');
    const still = cover('/cover?code=SSIS-003', 1600, 900);
    coverAnchor(still);
    expect(still.dataset.frame).toBe('still');
    const fc2 = cover('/cover?code=FC2-PPV-1', 800, 538);
    coverAnchor(fc2);
    expect(fc2.dataset.frame).toBe('still');
  });

  it('The face lands centered in the visible window: the anchor is (face − window/2) / (1 − window), clamped to 0–100%', () => {
    const img = cover('/cover?code=SSIS-003', 1600, 900, 'data-cx="0.6"');
    coverAnchor(img);
    const visible = 0.75 / (1600 / 900);
    expect(img.style.getPropertyValue('--cover-x')).toBe(`${Math.round((0.6 - visible / 2) / (1 - visible) * 100)}%`);
    const edge = cover('/cover?code=SSIS-004', 1600, 900, 'data-cx="0.95"');
    coverAnchor(edge);
    expect(edge.style.getPropertyValue('--cover-x')).toBe('100%');
    // The axis fully visible horizontally is not clipped; the anchor is a dead value there and is not written.
    expect(edge.style.getPropertyValue('--cover-y')).toBe('');
  });

  it('Cases without a border measure back from the right edge at front-cover proportions, and the front-cover edge is backed by a blurred cover', () => {
    const img = cover('/cover?code=SSIS-001&thumb=1', 800, 538);
    img.parentElement!.style.setProperty('--cover-blur', 'url("/cover?code=SSIS-001&thumb=1")');
    coverAnchor(img);
    expect(img.classList.contains('panel')).toBe(true);
    expect(img.style.getPropertyValue('--panel-clip')).toMatch(/^0% 0% 0% \d/);
    expect(img.style.getPropertyValue('--panel-height')).toBe('100%');
    expect(img.parentElement!.style.getPropertyValue('--cover-blur')).toContain('/cover?code=SSIS-001&thumb=1');
  });

  it('Full covers center on the subject\'s face, and reframing clears the front-cover box style', () => {
    const img = cover('/cover?code=SPONE-001', 2184, 1638, 'data-cx=".555" data-cy=".331"');
    coverAnchor(img);
    expect(img.classList.contains('panel')).toBe(true);
    img.dataset.coverLayout = 'still';
    coverAnchor(img);
    expect(img.dataset.frame).toBe('still');
    expect(img.classList.contains('panel')).toBe(false);
    expect(img.style.getPropertyValue('--panel-clip')).toBe('');
    expect(img.style.getPropertyValue('--cover-x')).toBe('63%');
    expect(img.parentElement!.style.getPropertyValue('--cover-blur')).toBe('');
  });

  it('Blu-ray and known wide cases frame by the wide front cover; FC2 keeps the full artwork', () => {
    const wide = cover('https://covers.example/MIDA.jpg', 800, 438, 'data-cover-code="MIDA-122" data-wide-sleeve="1"');
    coverAnchor(wide);
    expect(wide.dataset.frame).toBe('sleeve');
    expect(wide.style.getPropertyValue('--panel-clip')).toBe('0% 0% 0% 53.5%');
    expect(parseFloat(wide.style.getPropertyValue('--panel-height'))).toBeLessThan(100);
    const fc2 = cover('https://covers.example/fc2.jpg', 800, 438, 'data-cover-code="FC2-PPV-1" data-wide-sleeve="1"');
    coverAnchor(fc2);
    expect(fc2.dataset.frame).toBe('still');
    expect(fc2.classList.contains('panel')).toBe(false);
    const dvd = cover('/cover?code=MIDA-159', 800, 538, 'data-wide-sleeve="1"');
    coverAnchor(dvd);
    expect(dvd.style.getPropertyValue('--panel-height')).toBe('100%');
  });

  it('When the box describes a different image nothing is written at all; proportionally downscaled derived URLs still apply', () => {
    const derived = cover('/cover?code=SSIS-001&thumb=1', 800, 538, 'data-posterbox="842 1600 1076 0 1600 1076"');
    coverAnchor(derived);
    expect(derived.classList.contains('panel')).toBe(true);
    const img = cover('/cover?code=SSIS-001', 800, 538, 'data-posterbox="210 400 269 0 400 269"');
    coverAnchor(img);
    expect(img.classList.contains('panel')).toBe(false);
  });
});

describe('The wide front-cover box', () => {
  it('VR frames crop the 4:3 source image around the left-side face', () => {
    const host = mount('<div class="pic"><img class="poster cover front" src="/cover?code=MDVR-276" style="--card-ratio:.75" data-cover-layout="still" data-cx=".22" data-posterbox="380 800 600 0 800 600"></div>');
    const img = sized(host.querySelector('img')!, 800, 600);
    coverAnchor(img);
    expect(img.dataset.frame).toBe('still');
    expect(img.classList.contains('panel')).toBe(false);
    expect(img.style.getPropertyValue('--cover-x')).toBe('0%');
  });
  it('The source box keeps a full-width front cover independent of the title', () => {
    const host = mount('<div class="pic"><img class="poster cover front" src="/cover?code=MIDA-239" style="--card-ratio:.75" data-posterbox="428 800 438 0 800 438"></div>');
    const img = sized(host.querySelector('img')!, 800, 438);
    coverAnchor(img);
    expect(img.classList.contains('panel')).toBe(true);
    expect(parseFloat(img.style.getPropertyValue('--panel-height'))).toBeLessThan(100);
    expect(parseFloat(img.style.getPropertyValue('--panel-top'))).toBeGreaterThan(0);
  });
});

describe('upgradeCover: falls back to the original when the derived tier is not sharp enough', () => {
  it('The swap happens only when one source pixel spans more than one device pixel, and the blur base still takes the derived tier', () => {
    const host = mount('<div class="pic"><img class="poster cover" src="/cover?code=A&thumb=1"></div>');
    const img = sized(host.querySelector('img')!, 300, 200);
    boxOf(img, 600, 400);
    upgradeCover(img);
    expect(new URL(img.src).search).toBe('?code=A');
    expect(img.dataset.thumbSrc).toContain('/cover?code=A&thumb=1');
    const sharp = sized(mount('<img class="poster cover" src="/cover?code=B&thumb=1">').querySelector('img')!, 1200, 800);
    boxOf(sharp, 600, 400);
    upgradeCover(sharp);
    expect(sharp.getAttribute('src')).toBe('/cover?code=B&thumb=1');
  });

  it('When the 800 tier is not sharp enough, switch to the 1600 tier first and keep the version; the blurry base records the first derived tier', () => {
    const host = mount('<div class="pic"><img class="poster cover" src="/cover?code=A&thumb=2&v=9"></div>');
    const img = sized(host.querySelector('img')!, 800, 538);
    boxOf(img, 1000, 672);
    upgradeCover(img);
    expect(new URL(img.src).search).toBe('?code=A&thumb=1&v=9');
    sized(img, 1600, 1076);
    upgradeCover(img);
    expect(new URL(img.src).search).toBe('?code=A&thumb=1&v=9');
    expect(img.dataset.thumbSrc).toContain('/cover?code=A&thumb=2&v=9');
    const fits = sized(mount('<img class="poster cover" src="/cover?code=B&thumb=2">').querySelector('img')!, 800, 538);
    boxOf(fits, 333, 224);
    upgradeCover(fits);
    expect(fits.getAttribute('src')).toBe('/cover?code=B&thumb=2');
  });
});

describe('fitNativeImage: images smaller than the frame place at native size', () => {
  it('Small images are placed at source size and serve as their own blurred base; large enough ones fill the area', () => {
    const host = mount('<span data-fit-native><img src="/logo?studio=a"></span>');
    const box = host.querySelector<HTMLElement>('[data-fit-native]')!;
    Object.defineProperty(box, 'clientWidth', { value: 180 });
    Object.defineProperty(box, 'clientHeight', { value: 180 });
    const img = sized(box.querySelector('img')!, 42, 42);
    fitNativeImage(img);
    expect(box.dataset.nativeSmall).toBe('true');
    expect(box.style.getPropertyValue('--markw')).toBe('42px');
    expect(box.style.getPropertyValue('--markbg')).toContain('/logo?studio=a');
    sized(img, 1378, 1378);
    refitNativeImages(host);
    expect(box.dataset.nativeSmall).toBe('false');
    expect(box.style.getPropertyValue('--markw')).toBe('100%');
    expect(box.style.getPropertyValue('--markbg')).toBe('none');
  });

  it('Ultra-flat marks stretch their short edge to the minimum with no blur base; portrait boxes skip this rule', () => {
    const host = mount('<span data-fit-native="mark"><img src="/logo?studio=b"></span>'
      + '<span data-fit-native="portrait"><img src="/avatar?p=c"></span>');
    const [mark, portrait] = [...host.querySelectorAll<HTMLElement>('[data-fit-native]')];
    for (const box of [mark!, portrait!]) {
      Object.defineProperty(box, 'clientWidth', { value: 180 });
      Object.defineProperty(box, 'clientHeight', { value: 180 });
    }
    fitNativeImage(sized(mark!.querySelector('img')!, 1378, 42));
    expect(mark!.dataset.nativeClamp).toBe('true');
    expect(mark!.style.getPropertyValue('--markw')).toBe('180px');
    expect(mark!.style.getPropertyValue('--markh')).toBe('18px');
    expect(mark!.style.getPropertyValue('--markbg')).toBe('none');
    fitNativeImage(sized(portrait!.querySelector('img')!, 1378, 42));
    expect(portrait!.dataset.nativeClamp).toBe('false');
  });
});

describe('Loading shimmer', () => {
  it('An image not yet arrived when inserted marks the frame imgwait, and is removed directly once it waits too briefly', () => {
    const host = mount('<span class="ring"><img src="/a"></span>');
    const img = host.querySelector('img')!;
    Object.defineProperty(img, 'complete', { configurable: true, value: false });
    watchPendingImages(host);
    expect(img.parentElement!.classList.contains('imgwait')).toBe(true);
    settleImage(img);
    expect(img.parentElement!.classList.contains('imgwait')).toBe(false);
    expect(img.parentElement!.classList.contains('ui-imgdone')).toBe(false);
  });

  it('It waits out the threshold-crossing fade before removing, with a one-second fallback when no animation comes', () => {
    vi.useFakeTimers();
    const host = mount('<span class="ring"><img src="/a"></span>');
    const img = host.querySelector('img')!;
    Object.defineProperty(img, 'complete', { configurable: true, value: false });
    watchPendingImages(host);
    vi.advanceTimersByTime(500);
    settleImage(img);
    expect(img.parentElement!.classList.contains('ui-imgdone')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(img.parentElement!.classList.contains('ui-imgdone')).toBe(false);
  });
});

describe('installCardArt: one site-wide set of capture listeners', () => {
  it('Avatars frame to the face box once loaded; covers frame once loaded; an unfetchable image clears the shimmer', () => {
    installCardArt();
    installCardArt();
    const host = mount('<span class="ring"><img data-facebox="0.439 0.224 67 640 960"></span><div class="pic"><img class="poster cover" src="/cover?code=X" style="--card-ratio:0.75"></div><span class="ring imgwait"><img src="/gone"></span>');
    const face = sized(host.querySelector<HTMLImageElement>('.ring img')!, 640, 960);
    boxOf(face.parentElement!, 160, 160);
    face.dispatchEvent(new Event('load'));
    expect(face.dataset.faceFramed).toBe('');
    expect(face.style.width).not.toBe('');
    const cover = sized(host.querySelector<HTMLImageElement>('img.cover')!, 1600, 900);
    cover.dispatchEvent(new Event('load'));
    expect(cover.dataset.frame).toBe('still');
    const gone = host.querySelector<HTMLImageElement>('img[src="/gone"]')!;
    gone.dispatchEvent(new Event('error'));
    expect(gone.parentElement!.classList.contains('imgwait')).toBe(false);
  });
});
