import { describe, expect, it } from 'vitest';
import { COVER_FRONT_RATIO } from '../src/appearance/layout';
import { javImageKind, normalizeJavImage, normalizeJavPreferences, panelFrame, relayoutJavImages, syncJavImages } from '../src/jav-artwork';

describe('JAV default cover', () => {
  const jav = { is_jav: true, code: 'TEST-001', has_cover: true, has_thumb: true };
  it('Official cover by default, with both tiers picking images by video identity', () => {
    expect(normalizeJavImage(undefined)).toBe('cover');
    expect(normalizeJavImage('invalid')).toBe('cover');
    expect(javImageKind(jav, 'cover')).toBe('cover');
    expect(javImageKind(jav, 'thumbnail')).toBe('thumbnail');
    expect(javImageKind({ ...jav, is_jav: false }, 'cover')).toBe('thumbnail');
  });
  it('Without an official cover or preview it uses whichever image exists, and with neither it stays empty', () => {
    expect(javImageKind({ ...jav, has_cover: false }, 'cover')).toBe('thumbnail');
    expect(javImageKind({ ...jav, code: '' }, 'cover')).toBe('thumbnail');
    expect(javImageKind({ ...jav, has_thumb: false }, 'thumbnail')).toBe('cover');
    expect(javImageKind({ ...jav, has_cover: false, has_thumb: false }, 'cover')).toBe('');
  });
  it('Updates images across several surfaces in place with switch-back, keeping the player and nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = '<video></video>' + ['big', 'small'].map(layout =>
      `<img data-jav-image="1" data-jav-cover="/cover?code=TEST-001" data-jav-thumb="/poster?id=1&c=4" data-jav-image-layout="${layout}" class="poster" src="/poster?id=1&c=4">`).join('');
    const images = [...root.querySelectorAll('img')];
    const video = root.querySelector('video');
    syncJavImages(root, 'cover');
    expect(images.every(img => img.classList.contains('cover'))).toBe(true);
    expect(images[0]?.classList.contains('front')).toBe(true);
    expect(images[1]?.classList.contains('whole')).toBe(true);
    syncJavImages(root, 'thumbnail');
    expect(images.every(img => img.getAttribute('src') === '/poster?id=1&c=4' && !img.classList.contains('cover'))).toBe(true);
    expect(root.querySelector('video')).toBe(video);
    expect([...root.querySelectorAll('img')]).toEqual(images);
  });
  it('Switching images clears framing computed from the previous one, and the blur background clears with it', () => {
    // The framing was computed from the previous image's crease and size; keeping it would place the front cover on a misaligned region.
    // The blurred background hangs on the card, which `removeAttribute('style')` cannot reach; it must be cleared separately.
    const root = document.createElement('div');
    root.innerHTML = '<div class="pic" style="--cover-blur:url(&quot;/cover?code=TEST-001&quot;)">'
      + '<img data-jav-image="1" data-jav-cover="/cover?code=TEST-001" data-jav-thumb="/poster?id=1&c=4"'
      + ' data-jav-image-layout="big" class="poster cover front panel"'
      + ' style="--panel-left:-101.3%;--panel-clip:52.63%" src="/cover?code=TEST-001"></div>';
    const pic = root.querySelector('.pic') as HTMLElement;
    const img = root.querySelector('img') as HTMLImageElement;
    syncJavImages(root, 'thumbnail');
    expect(img.classList.contains('panel')).toBe(false);
    expect(img.getAttribute('style')).toBeNull();
    expect(pic.style.getPropertyValue('--cover-blur')).toBe('');
  });
  it('Switching layout swaps the framing class on the same image; sources untouched, returning only the loaded ones that need an immediate recompute', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-media-pic="" style="--cover-blur:url(&quot;/cover?code=TEST-001&quot;)">'
      + '<img data-jav-image="1" data-jav-image-layout="big" class="poster cover front panel"'
      + ' style="--panel-left:-101.3%" src="/cover?code=TEST-001"></div>'
      + '<img data-jav-image="2" data-jav-image-layout="big" class="poster cover front" src="/cover?code=TEST-002">'
      + '<img data-jav-image="3" data-jav-image-layout="big" class="poster" src="/poster?id=3&c=4">';
    const [loaded, pending, thumb] = [...root.querySelectorAll('img')] as [HTMLImageElement, HTMLImageElement, HTMLImageElement];
    Object.defineProperty(loaded, 'naturalWidth', { value: 800 });
    Object.defineProperty(loaded, 'complete', { value: true });
    Object.defineProperty(pending, 'complete', { value: false });
    expect(relayoutJavImages(root, 'small')).toEqual([loaded]);
    expect([loaded.className, pending.className, thumb.className])
      .toEqual(['poster cover whole', 'poster cover whole', 'poster']);
    expect(loaded.getAttribute('style')).toBeNull();
    expect((root.firstElementChild as HTMLElement).style.getPropertyValue('--cover-blur')).toBe('');
    expect([loaded, pending, thumb].map(img => img.dataset.javImageLayout)).toEqual(['small', 'small', 'small']);
    expect(loaded.getAttribute('src')).toBe('/cover?code=TEST-001');
    // Repeating the same layout does nothing: the card asks on every redraw.
    expect(relayoutJavImages(root, 'small')).toEqual([]);
  });
  it.each(['big', 'small'])('%s keeps both cover sources and restores the same combination after saving', javLayout => {
    for (const javImage of ['cover', 'thumbnail']) {
      const settings = normalizeJavPreferences({ javLayout, javImage });
      expect(settings).toEqual({ javLayout, javImage });
      expect(normalizeJavPreferences(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
      expect(javImageKind(jav, settings.javImage)).toBe(javImage);
    }
  });
  it('Keeps the saved layout and preview image choice; unknown values fall back to defaults', () => {
    expect(normalizeJavPreferences({ javLayout: 'preview', javImage: 'cover' })).toEqual({ javLayout: 'small', javImage: 'thumbnail' });
    expect(normalizeJavPreferences({ javLayout: 'sleeve' })).toEqual({ javLayout: 'small', javImage: 'cover' });
    expect(normalizeJavPreferences({ javLayout: 'cover' })).toEqual({ javLayout: 'big', javImage: 'cover' });
    expect(normalizeJavPreferences({ javLayout: 'invalid', javImage: 'invalid' })).toEqual({ javLayout: 'big', javImage: 'cover' });
  });
});

/* The container ratio for the large-image layout takes exactly the value the layout layer (`src/appearance/layout.ts`) would actually use;
   the 0.75 written in the formula below is it. */
const BIG_LAYOUT_RATIO = COVER_FRONT_RATIO;

/** The two computed frame tiers are always full height and flush right, so the two vertical axes are constant 0 and 100. */
const fullHeight = (left: number) => ({ top: 0, right: 0, bottom: 0, left });

describe('The front-cover framing box converts to its position in the card', () => {
  it('A fitting front cover centers with equal whitespace on both sides', () => {
    // On a 1600×1000 jacket the front cover right of the fold starts at 887. With the image filled to the card's height the width is
    // The card is 1.6/0.75≈2.1333x; the front cover takes up (1−0.554375)×2.1333≈0.9507 card widths of it,
    // It fits: (1−0.9507)/2≈0.0247 is left on each side, pushing the image's left edge to −1.158.
    const fold = { x0: 887, y0: 0, x1: 1600, y1: 1000, method: 'fold', px: [1600, 1000] };
    expect(panelFrame(fold, BIG_LAYOUT_RATIO))
      .toEqual({ clip: fullHeight(55.44), left: -115.8, top: 0, height: 100 });
    // Changing the container's ratio changes the image's rendered width: a position computed for one frame must move with it.
    expect(panelFrame(fold, 0.5))
      .toEqual({ clip: fullHeight(55.44), left: -220, top: 0, height: 100 });
  });

  it('The right-half centered frame follows the same arithmetic; the method only marks where it came from', () => {
    // 800×538 is the most common jacket size on this machine; when no fold is found the front starts at 421 in the right half, with a box 379 wide.
    const half = { x0: 421, y0: 0, x1: 800, y1: 538, method: 'ratio', px: [800, 538] };
    expect(panelFrame(half, BIG_LAYOUT_RATIO))
      .toEqual({ clip: fullHeight(52.63), left: -101.3, top: 0, height: 100 });
  });

  it('A front cover wider than the card hugs the right edge, cropping from the left', () => {
    // An 800×500 front cover has an aspect of 0.800, the widest tier on this machine, 6.7% wider than the 0.75 container.
    // Centering crops both sides at once, while the title, performer name, and corner mark all sit on the right, so the right edge must align instead.
    expect(panelFrame({ x0: 400, px: [800, 500] }, BIG_LAYOUT_RATIO))
      .toEqual({ clip: fullHeight(50), left: -113.33, top: 0, height: 100 });
  });

  it('All four edges of a manual box count, so a horizontal slice means zoom in and shift up', () => {
    // Frames (200,50) to (600,450) out of 800×538: the frame is wider than the container, so it hugs the right edge and crops from the left; the frame height is only the source image's
    // 400/538: the image must be sized to 134.5% of the card height for the frame to fill, with the excess at the top pulled up via top.
    const manual = { x0: 200, y0: 50, x1: 600, y1: 450, method: 'manual', px: [800, 538] };
    expect(panelFrame(manual, BIG_LAYOUT_RATIO)).toEqual({
      clip: { top: 9.29, right: 25, bottom: 16.36, left: 25 },
      left: -100, top: -12.5, height: 134.5,
    });
  });

  it('Without a box it returns null, and callers fall back to right-edge framing', () => {
    // Of the 1014 covers on this machine, 331 were judged no-crop and the API sends null, so this path cannot produce a number.
    expect(panelFrame(null, BIG_LAYOUT_RATIO)).toBeNull();
    expect(panelFrame(undefined, BIG_LAYOUT_RATIO)).toBeNull();
    expect(panelFrame({ x0: 421 }, BIG_LAYOUT_RATIO)).toBeNull();
    expect(panelFrame({ x0: Number.NaN, px: [800, 538] }, BIG_LAYOUT_RATIO)).toBeNull();
    expect(panelFrame({ x0: 421, px: [0, 0] }, BIG_LAYOUT_RATIO)).toBeNull();
    expect(panelFrame({ x0: 421, px: [800, 538] }, 0)).toBeNull();
  });

  it('The fold is clamped back inside the image; a frame that cuts off the whole picture has no front cover to place', () => {
    // Bad data is treated as fully visible; that is safer than computing on with a negative width.
    expect(panelFrame({ x0: -40, px: [1600, 1000] }, BIG_LAYOUT_RATIO))
      .toEqual({ clip: fullHeight(0), left: -113.33, top: 0, height: 100 });
    // The crease lands on the image's right edge: not a single pixel remains to its right, so there is no front cover to place.
    expect(panelFrame({ x0: 1600, px: [1600, 1000] }, BIG_LAYOUT_RATIO)).toBeNull();
  });
});
