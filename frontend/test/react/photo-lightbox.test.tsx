/* Photo lightbox: loads Swiper on demand, starts from the clicked image, paging and thumbnail strip follow, zoom bar, info panel, and close.
 *
 * Swiper is replaced with an accounting double: what is tested here is what the lightbox hands it and what it listens to; the carousel's own panning, keyboard, and wheel
 * are exercised by e2e in a real browser with real Swiper (`e2e/photo-lightbox.test.ts`). */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LightboxHost, LightboxSlide } from '../../src/react/photo-lightbox/photo-lightbox';
import { photoMeta, photoZoom, type SwiperInstance } from '../../src/react/photo-lightbox/photo-lightbox';
import { closePhotoLightbox, openPhotoLightbox } from '../../src/react/photo-lightbox/photo-lightbox-dialog';
import { click, settle, type } from './render';

type Handler = (swiper: SwiperInstance, ...args: number[]) => void;
class FakeSwiper {
  static made: FakeSwiper[] = [];
  activeIndex: number;
  destroyed = false;
  handlers: Record<string, Handler[]> = {};
  zoom = { in: vi.fn(), out: vi.fn() };
  slideTo = vi.fn();
  update = vi.fn();
  destroy = vi.fn(() => { this.destroyed = true });
  constructor(public el: HTMLElement, public options: Record<string, any>) {
    this.activeIndex = options.initialSlide ?? 0;
    FakeSwiper.made.push(this);
  }
  get slides() { return [...this.el.querySelector('.swiper-wrapper')!.children] as HTMLElement[] }
  on(event: string, handler: Handler) { (this.handlers[event] ??= []).push(handler) }
  emit(event: string, ...args: number[]) {
    if (event === 'slideChange') this.options.on?.slideChange?.call(this);
    for (const handler of this.handlers[event] ?? []) handler(this as unknown as SwiperInstance, ...args);
  }
  /** Moves to slide `at`, in Swiper's order: update `activeIndex` first, then emit `slideChange`. */
  go(at: number) { return act(async () => { this.activeIndex = at; this.emit('slideChange') }) }
}
const strip = () => FakeSwiper.made.at(-2)!;
const main = () => FakeSwiper.made.at(-1)!;

let observed: (() => void)[] = [];
const disconnected = vi.fn();
beforeEach(() => {
  FakeSwiper.made = [];
  observed = [];
  (window as { Swiper?: unknown }).Swiper = FakeSwiper;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { observed.push(callback) }
    observe() {}
    disconnect() { disconnected() }
  });
  /* happy-dom has no native popover: top-layer open state is recorded in an attribute, which `:popover-open` reads. */
  const proto = HTMLElement.prototype as HTMLElement & Record<string, unknown>;
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
    return selector === ':popover-open' ? this.hasAttribute('data-test-popover-open') : matches.call(this, selector);
  });
  proto.showPopover = function (this: HTMLElement) { this.setAttribute('data-test-popover-open', '') };
  proto.hidePopover = function (this: HTMLElement) { this.removeAttribute('data-test-popover-open') };
});
afterEach(async () => {
  await act(async () => closePhotoLightbox());
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  delete proto.showPopover;
  delete proto.hidePopover;
  disconnected.mockClear();
});

const frame = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
/** When the loader has not fetched the stylesheet yet, the injected link does not enter the document (in happy-dom it would really fetch `/vendor/`),
 *  and load is resolved on the spot; once fetched, it opens directly. */
async function open(index: number, slides: LightboxSlide[], host?: LightboxHost) {
  const append = vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    for (const node of nodes) if (node instanceof HTMLLinkElement) queueMicrotask(() => node.dispatchEvent(new Event('load')));
  });
  try {
    await act(async () => { await openPhotoLightbox(index, slides, host) });
  } finally {
    append.mockRestore();
  }
  await frame();
  return document.querySelector<HTMLDialogElement>('dialog[data-photo-lightbox]')!;
}

const local = (id: number, extra: Record<string, unknown> = {}): LightboxSlide => ({
  src: `/photo?id=${id}`, thumb: `/photo-thumb?id=${id}`, name: `${id}.jpg`,
  asset: { id, name: `${id}.jpg`, location: 'local', size: 2 * 1024 * 1024, ...extra },
});
const sample = (n: number): LightboxSlide => ({
  src: `/sample-image?code=SSIS-057&n=${n}`, thumb: `/sample-thumb?code=SSIS-057&n=${n}`,
  name: `SSIS-057 sample ${n}`, asset: null, source: 'DMM',
});
const WALL = [sample(1), sample(2), local(100), local(101), local(102)];

const q = <T extends Element = HTMLElement>(box: Element, selector: string) => box.querySelector<T>(selector)!;
const labelled = (box: Element, label: string) => q<HTMLButtonElement>(box, `[aria-label="${label}"]`);
const escape = () => act(async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
});

describe('Open', () => {
  it('Swiper is fetched on demand at a pinned version, building the carousel only once both styles and scripts arrive; if it cannot be fetched, the full image opens in a new tab', async () => {
    delete (window as { Swiper?: unknown }).Swiper;
    /* The element records it but does not enter the document: once in the document, happy-dom would actually fetch `/vendor/`; load and error are dispatched from here. */
    const appended: Element[] = [];
    const append = vi.spyOn(document.head, 'append').mockImplementation((...nodes) => { appended.push(...nodes as Element[]) });
    const link = () => appended.filter((node) => node instanceof HTMLLinkElement).at(-1) as HTMLLinkElement;
    const script = () => appended.filter((node) => node instanceof HTMLScriptElement).at(-1) as HTMLScriptElement;
    const opener = vi.spyOn(window, 'open').mockImplementation(() => null);
    await act(async () => {
      const opened = openPhotoLightbox(1, WALL);
      link().dispatchEvent(new Event('load'));
      script().onerror!(new Event('error'));
      await opened;
    });
    expect(opener).toHaveBeenCalledWith('/sample-image?code=SSIS-057&n=2', '_blank', 'noopener');
    expect(document.querySelector('dialog')).toBeNull();

    await act(async () => {
      const opened = openPhotoLightbox(0, WALL);
      expect(link().getAttribute('href')).toBe('/vendor/swiper/14.4.0/swiper-bundle.min.css');
      expect(script().getAttribute('src')).toBe('/vendor/swiper/14.4.0/swiper-bundle.min.js');
      (window as { Swiper?: unknown }).Swiper = FakeSwiper;
      script().onload!(new Event('load'));
      await Promise.resolve();
      expect(FakeSwiper.made).toHaveLength(0);
      link().dispatchEvent(new Event('load'));
      await opened;
    });
    append.mockRestore();
    opener.mockRestore();
    expect(document.querySelector('dialog[data-photo-lightbox]')).not.toBeNull();
    expect(FakeSwiper.made).toHaveLength(2);
  });

  it('Starts from the clicked image: the modal opens, the page number reads "n / N" and is announced to screen readers, and the thumbnail strip centers on it immediately', async () => {
    const box = await open(2, WALL);
    expect(box.open).toBe(true);
    expect(box.getAttribute('aria-label')).toBe('Image browsing');
    expect(box.hasAttribute('data-has-strip')).toBe(true);
    expect(document.body.classList.contains('photolight-open')).toBe(true);
    expect(box.closest('.peach-react')?.parentElement).toBe(document.body);
    const count = q(box, '[data-photo-count]');
    expect(count.textContent).toBe('3 / 5');
    expect(count.getAttribute('aria-live')).toBe('polite');
    expect(main().options.initialSlide).toBe(2);
    expect(strip().slideTo).toHaveBeenCalledWith(2, 0);
    const images = [...q(box, '[data-photo-main]').querySelectorAll('img')];
    expect(images.map((img) => img.getAttribute('src'))).toEqual(WALL.map((slide) => slide.src));
    expect(images.every((img) => img.getAttribute('loading') === 'lazy'
      && img.getAttribute('referrerpolicy') === 'no-referrer')).toBe(true);
    expect([...q(box, '[data-photo-strip]').querySelectorAll('img')].map((img) => img.getAttribute('src')))
      .toEqual(WALL.map((slide) => slide.thumb));
  });

  it('The main canvas has zoom, keyboard, wheel paging, thumbnail sync, dynamic page dots and arrow keys; the thumbnail strip drags freely and clicking any thumbnail centers it', async () => {
    const box = await open(0, WALL);
    const options = main().options;
    expect(options).toMatchObject({
      zoom: { minRatio: .01, maxRatio: 100 }, keyboard: { enabled: true }, lazyPreloadPrevNext: 1,
      mousewheel: { enabled: true, forceToAxis: false },
      pagination: { clickable: true, dynamicBullets: true, dynamicMainBullets: 3 },
    });
    expect(options.thumbs.swiper).toBe(strip());
    expect(options.pagination.el).toBe(q(box, '[data-photo-pagination]'));
    expect(options.pagination.el.getAttribute('aria-label')).toBe('Pick images');
    expect(options.pagination.renderBullet(1, 'swiper-pagination-bullet'))
      .toBe('<button type="button" class="swiper-pagination-bullet" aria-label="View image 2"></button>');
    expect(options.navigation).toEqual({ prevEl: labelled(box, 'Previous'), nextEl: labelled(box, 'Next') });
    expect(strip().options).toEqual({
      slidesPerView: 'auto', spaceBetween: 8, freeMode: true, watchSlidesProgress: true,
      centeredSlides: true, slideToClickedSlide: true,
    });
  });

  it('With a single image neither the thumbnail strip nor page dots render', async () => {
    const box = await open(0, [local(7)]);
    expect(box.hasAttribute('data-has-strip')).toBe(false);
    expect(box.querySelector('[data-photo-pagination]')).toBeNull();
    expect(q(box, '[data-photo-count]').textContent).toBe('1 / 1');
  });

  it('Do not open when the index is out of range or there are no images', async () => {
    await act(async () => { await openPhotoLightbox(5, WALL) });
    await act(async () => { await openPhotoLightbox(0, []) });
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('Only one exists at a time: opening again tears down the previous pair of carousels first', async () => {
    await open(0, WALL);
    const [firstStrip, firstMain] = FakeSwiper.made;
    await open(1, [local(9), local(10)]);
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
    expect(firstMain.destroy).toHaveBeenCalledWith(true, true);
    expect(firstStrip.destroy).toHaveBeenCalledWith(true, true);
    expect(q(document.body, '[data-photo-count]').textContent).toBe('2 / 2');
  });
});

describe('Paging', () => {
  it('Switching images: the pager follows, the thumbnail strip slides to it, and the info panel swaps to it', async () => {
    const box = await open(2, WALL);
    await main().go(3);
    expect(q(box, '[data-photo-count]').textContent).toBe('4 / 5');
    expect(strip().slideTo).toHaveBeenLastCalledWith(3, 200);
    expect(q(box, '[data-photo-detail] h2').textContent).toBe('101.jpg');
  });

  it('If the original fails to load, swap in its thumbnail once; if the thumbnail also fails, swap in a placeholder', async () => {
    const box = await open(0, WALL);
    const slide = q(box, '[data-photo-main] .swiper-slide');
    const img = q<HTMLImageElement>(slide, 'img');
    await act(async () => { img.dispatchEvent(new Event('error')) });
    expect(img.getAttribute('src')).toBe('/sample-thumb?code=SSIS-057&n=1');
    await act(async () => { img.dispatchEvent(new Event('error')) });
    expect(slide.querySelector('img')).toBeNull();
    expect(slide.querySelector('[data-photo-missing]')?.textContent).toBe('Image unavailable');
  });

  it('When the lightbox measures a new size both carousels re-measure, and zoom recomputes from the previous target', async () => {
    await open(0, WALL);
    main().zoom.out.mockClear();
    observed.forEach((callback) => callback());
    expect(main().update).toHaveBeenCalled();
    expect(strip().update).toHaveBeenCalled();
    expect(main().zoom.out).toHaveBeenCalled();
  });
});

describe('Zoom bar', () => {
  /* The test environment has no layout, so the fit-to-window ratio cannot be measured: an image with no natural size counts as 100%, so the percentage here is a multiplier. */
  it('Stepper keys move ten percentage points at a time, 1:1 returns to original pixels, and the slider takes the target directly; readout and slider follow along', async () => {
    const box = await open(0, WALL);
    const readout = q(box, '[data-photo-zoom-readout]');
    const range = q<HTMLInputElement>(box, '[data-photo-zoom] input[type=range]');
    expect([range.min, range.max, range.getAttribute('aria-label')]).toEqual(['10', '400', 'Zoom']);
    expect(readout.textContent).toBe('100%');
    await click(labelled(box, 'Zoom in'));
    expect(main().zoom.in).toHaveBeenLastCalledWith(1.1);
    expect([readout.textContent, range.value]).toEqual(['110%', '110']);
    await click(labelled(box, 'Original size'));
    expect(readout.textContent).toBe('100%');
    expect(main().zoom.out).toHaveBeenCalled();
    await click(labelled(box, 'Zoom out'));
    expect(main().zoom.in).toHaveBeenLastCalledWith(.9);
    await type(range, '250');
    expect(main().zoom.in).toHaveBeenLastCalledWith(2.5);
    expect(readout.textContent).toBe('250%');
    main().zoom.out.mockClear();
    await click(labelled(box, 'Fit to window'));
    expect(main().zoom.out).toHaveBeenCalledTimes(1);
    expect(readout.textContent).toBe('100%');
  });

  it('The end stepper keys draw magnifier plus and minus icons, not text glyphs', async () => {
    const box = await open(0, WALL);
    expect(labelled(box, 'Zoom out').innerHTML).toContain('href="#i-zoom-out"');
    expect(labelled(box, 'Zoom in').innerHTML).toContain('href="#i-zoom-in"');
    expect(labelled(box, 'Fit to window').innerHTML).toContain('href="#i-maximize"');
    expect(labelled(box, 'Original size').textContent).toBe('1:1');
  });

  it('Pinch or double click changes the zoom level; the readout converts back to source pixels', async () => {
    const box = await open(0, WALL);
    await act(async () => main().emit('zoomChange', 3));
    expect(q(box, '[data-photo-zoom-readout]').textContent).toBe('300%');
  });
});

describe('Zoom conversion', () => {
  const fixture = (natural: [number, number], shown: [number, number]) => {
    const box = document.createElement('div');
    box.innerHTML = '<div class="swiper-slide"><img></div>';
    document.body.append(box);
    const img = box.querySelector('img')!;
    Object.defineProperties(img, {
      naturalWidth: { value: natural[0] }, naturalHeight: { value: natural[1] },
      offsetWidth: { value: shown[0] }, offsetHeight: { value: shown[1] },
    });
    const handlers: Record<string, Handler> = {};
    const swiper = {
      activeIndex: 0, destroyed: false, slides: [box.firstElementChild as HTMLElement],
      zoom: { in: vi.fn(), out: vi.fn() }, on: (event: string, handler: Handler) => { handlers[event] = handler },
      slideTo: vi.fn(), update: vi.fn(), destroy: vi.fn(),
    };
    const show = vi.fn();
    return { box, img, swiper, show, handlers, zoom: photoZoom(box, swiper, show) };
  };

  it('Percentages are relative to original pixels: the fit-to-window tier is exactly the ratio of display size to original, capped at 100%', () => {
    const { swiper, show, zoom } = fixture([2000, 1000], [500, 250]);
    zoom.apply('fit');
    expect(show).toHaveBeenLastCalledWith(25);
    expect(swiper.zoom.out).toHaveBeenCalled();
    zoom.apply(100);
    expect(swiper.zoom.in).toHaveBeenLastCalledWith(4);
    zoom.apply(1000);
    expect(show).toHaveBeenLastCalledWith(400);
    zoom.apply(1);
    expect(show).toHaveBeenLastCalledWith(10);
    expect(swiper.zoom.in).toHaveBeenLastCalledWith(.4);
  });

  it('Both the measured size and the arriving large image recompute against the last target; an image that is not the current one does not count', () => {
    const { img, swiper, zoom } = fixture([2000, 1000], [500, 250]);
    zoom.apply(200);
    swiper.zoom.in.mockClear();
    zoom.resize();
    expect(swiper.zoom.in).toHaveBeenLastCalledWith(8);
    zoom.loaded(document.createElement('img'));
    expect(swiper.zoom.in).toHaveBeenCalledTimes(1);
    zoom.loaded(img);
    expect(swiper.zoom.in).toHaveBeenCalledTimes(2);
  });

  it('Lightbox already closed or Swiper already torn down: late size and load callbacks do nothing and throw no errors', () => {
    const { box, img, swiper, zoom } = fixture([2000, 1000], [500, 250]);
    swiper.destroyed = true;
    expect(() => { zoom.resize(); zoom.loaded(img) }).not.toThrow();
    swiper.destroyed = false;
    box.remove();
    expect(() => { zoom.resize(); zoom.loaded(img) }).not.toThrow();
    expect(swiper.zoom.out).not.toHaveBeenCalled();
    expect(swiper.zoom.in).not.toHaveBeenCalled();
  });

  it('Pinch zoom folds back to original pixels through the fit-to-window tier', () => {
    const { show, handlers } = fixture([2000, 1000], [500, 250]);
    handlers.zoomChange({} as SwiperInstance, 2);
    expect(show).toHaveBeenLastCalledWith(50);
  });
});

describe('Info panel', () => {
  it('Local images carry source and size, and locating hands only the asset id to the shell; the path never enters the page', async () => {
    const revealSource = vi.fn(async () => '');
    const slides = [local(100, { path: 'R:\\media\\secret\\100.jpg' })];
    const box = await open(0, slides, { revealSource });
    const panel = q(box, '[data-photo-detail]');
    expect(q(panel, 'h2').textContent).toBe('100.jpg');
    expect(q(panel, 'h2').getAttribute('tabindex')).toBe('-1');
    expect(q(panel, '[data-photo-detail-meta]').textContent).toBe('Local · 2\u00a0MB');
    const reveal = q<HTMLButtonElement>(panel, '[data-photo-reveal]');
    expect(reveal.hidden).toBe(false);
    expect(reveal.textContent).toBe('Show in File Explorer');
    await click(reveal);
    expect(revealSource).toHaveBeenCalledWith(100);
    expect(document.body.innerHTML).not.toContain('secret');
  });

  it('While locating waits for a reply the button is busy and repeat presses do not resend; the failure reason sits under the button and clears when another image is picked', async () => {
    let release!: (text: string) => void;
    const revealSource = vi.fn(() => new Promise<string>((done) => { release = done }));
    const box = await open(0, [local(100), local(101)], { revealSource });
    const reveal = q<HTMLButtonElement>(box, '[data-photo-reveal]');
    await click(reveal);
    expect(reveal.getAttribute('aria-busy')).toBe('true');
    expect(reveal.querySelector('[role=status]')?.getAttribute('aria-label')).toBe('Locating');
    await click(reveal);
    expect(revealSource).toHaveBeenCalledTimes(1);
    await act(async () => release('The source file is not on this machine'));
    await settle();
    expect(reveal.hasAttribute('aria-busy')).toBe(false);
    expect(reveal.textContent).toBe('Show in File Explorer');
    const status = q(box, '[data-photo-status]');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('The source file is not on this machine');
    await main().go(1);
    expect(status.textContent).toBe('');
  });

  it('Samples and online images have no locate key: they show the source, add resolution once the full image arrives, and the index comes only from the bottom bar; unnamed ones read "Untitled image"', async () => {
    const box = await open(0, [sample(1), { src: '/follow-stream?id=5&media=0', thumb: '/t.jpg', size: 3000 }]);
    const meta = q(box, '[data-photo-detail-meta]');
    expect(q<HTMLButtonElement>(box, '[data-photo-reveal]').hidden).toBe(true);
    expect(meta.textContent).toBe('DMM');
    expect(q(box, '[data-photo-count]').textContent).toBe('1 / 2');
    const img = q<HTMLImageElement>(box, '[data-photo-main] img');
    Object.defineProperties(img, { naturalWidth: { value: 1600 }, naturalHeight: { value: 1200 } });
    await act(async () => { img.dispatchEvent(new Event('load')) });
    expect(meta.textContent).toBe('DMM · 1600 × 1200');
    await main().go(1);
    expect(q(box, '[data-photo-detail] h2').textContent).toBe('Untitled image');
    expect(meta.textContent).toBe('Online images · 3\u00a0KB');
  });

  it('Local images without a locator get no locate key from the shell either', async () => {
    const box = await open(0, [local(100)]);
    expect(q<HTMLButtonElement>(box, '[data-photo-reveal]').hidden).toBe(true);
  });

  it('The circled i opens the panel; clicking outside collapses the panel without closing the lightbox; Escape collapses the panel first, then closes the lightbox', async () => {
    const box = await open(0, WALL);
    const toggle = labelled(box, 'Image details');
    const panel = q(box, '[data-photo-detail]');
    expect(toggle.getAttribute('aria-haspopup')).toBe('dialog');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.hidden).toBe(true);
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    await click(box);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(box.isConnected).toBe(true);
    await click(toggle);
    await escape();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(box.isConnected).toBe(true);
    await escape();
    expect(box.isConnected).toBe(false);
  });
});

describe('Off', () => {
  it('Close button: tears down both carousels, removes the page scroll lock, stops measuring, and Escape is no longer handled by it', async () => {
    const box = await open(0, WALL);
    const [s, m] = [strip(), main()];
    await click(labelled(box, 'Close'));
    expect(box.isConnected).toBe(false);
    expect(m.destroy).toHaveBeenCalledWith(true, true);
    expect(s.destroy).toHaveBeenCalledWith(true, true);
    expect(disconnected).toHaveBeenCalled();
    expect(document.body.classList.contains('photolight-open')).toBe(false);
    const later = vi.fn();
    document.addEventListener('keydown', later);
    await escape();
    document.removeEventListener('keydown', later);
    expect(later).toHaveBeenCalled();
  });

  it('Clicking the black or the padding around the image closes it, while the image, toolbar, and thumbnails never do', async () => {
    let box = await open(0, WALL);
    await click(q(box, '[data-photo-main] img'));
    await click(q(box, '[data-photo-bar]'));
    await click(q(box, '[data-photo-strip] img'));
    expect(box.isConnected).toBe(true);
    await click(q(box, '.swiper-zoom-container'));
    expect(box.isConnected).toBe(false);
    box = await open(0, WALL);
    await click(box);
    expect(box.isConnected).toBe(false);
  });

  it('The browser\'s own cancel (Escape closing the modal) is intercepted first, then the same close path runs', async () => {
    const box = await open(0, WALL);
    const cancel = new Event('cancel', { cancelable: true });
    await act(async () => { box.dispatchEvent(cancel) });
    expect(cancel.defaultPrevented).toBe(true);
    expect(box.isConnected).toBe(false);
  });
});

it('Second line of the panel convention: local images without a source read "Unknown source", without a size read "Unknown size", and anything under a thousand bytes still reads 1 KB', () => {
  expect(photoMeta({ src: '', thumb: '', asset: { id: 1 } }, undefined)).toBe('Source unknown · Unknown size');
  expect(photoMeta({ src: '', thumb: '', asset: { id: 1, location: 'pikpak', size: 10 } }, undefined)).toBe('PikPak · 1\u00a0KB');
});
