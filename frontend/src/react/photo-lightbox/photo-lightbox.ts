/* The image lightbox (ADR-0031 step 10f): data shapes, Swiper's lazy loading and the zoom slider's conversion.
 *
 * The lightbox serves the profile page's photo wall (local images and code stills) and the follows page's online image sets.
 * Each caller converts its shape into `LightboxSlide` and hands it in; the three sides share the info panel with different
 * actions: local images can locate the source file by asset id, while stills and online images only show source, index, size
 * and fetchable size. */
import { fmtSize, LOC } from '@peach/legacy/core';

/** The fields a local image keeps in the database. Locating hands only the `id` to the server; paths never enter the browser. */
export interface LightboxAsset {
  id: number;
  name?: string;
  location?: string;
  size?: number;
  [field: string]: unknown;
}

/** One slide in the lightbox. `src` is the large image and `thumb` is the thumbnail strip cell; the large image also falls back to it when unavailable. */
export interface LightboxSlide {
  src: string;
  thumb: string;
  name?: string;
  /** Only local images have it; only with it does "Show in Explorer" appear. */
  asset?: LightboxAsset | null;
  /** The info panel's first line when there is no asset: the site name or "official samples", defaulting to "online images". */
  source?: string;
  size?: number;
}

/** What the lightbox asks the shell to do. A successful locate gets its receipt from the shell; failure returns a one-line reason shown under the button. */
export interface LightboxHost {
  revealSource(id: number): Promise<string>;
}

/* -- Swiper --
 * The large-image carousel, bottom thumbnail strip, and keyboard arrows are all Swiper's built-in modules; no need to rewrite them. But it is only
 * useful when viewing photos and should not enter the first screen. Only its core API is used, not its React wrapper: that layer brings its own
 * rendering, which does not fit the division of labor here of "DOM painted by React, Swiper only owning panning and state classes". */

/** The slice of the Swiper instance API that is used. */
export interface SwiperInstance {
  activeIndex: number;
  destroyed: boolean;
  slides: HTMLElement[];
  zoom: { in(ratio?: number): void; out(): void };
  on(event: string, handler: (swiper: SwiperInstance, ...args: number[]) => void): void;
  slideTo(index: number, speed?: number): void;
  update(): void;
  destroy(deleteInstance?: boolean, cleanStyles?: boolean): void;
}
export type SwiperConstructor = new (el: HTMLElement, options: Record<string, unknown>) => SwiperInstance;

const SWIPER = '/vendor/swiper/14.4.0/';
let loader: Promise<SwiperConstructor> | null = null;

/** Styles and script wait together: if the styles arrive a beat late, every slide paints at once as plain block elements. */
export const loadSwiper = (): Promise<SwiperConstructor> => loader ??= Promise.all([
  new Promise<void>((resolve, reject) => {
    const href = `${SWIPER}swiper-bundle.min.css`;
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
    if (existing?.sheet) { resolve(); return }
    const style = existing ?? document.createElement('link');
    style.rel = 'stylesheet';
    style.href = href;
    style.addEventListener('load', () => resolve(), { once: true });
    style.addEventListener('error', () => reject(new Error('swiper styles unavailable')), { once: true });
    if (!existing) document.head.append(style);
  }),
  new Promise<SwiperConstructor>((resolve, reject) => {
    const loaded = (window as { Swiper?: SwiperConstructor }).Swiper;
    if (loaded) { resolve(loaded); return }
    const script = document.createElement('script');
    script.src = `${SWIPER}swiper-bundle.min.js`;
    script.onload = () => resolve((window as { Swiper?: SwiperConstructor }).Swiper!);
    script.onerror = () => reject(new Error('swiper unavailable'));
    document.head.append(script);
  }),
]).then(([, Swiper]) => Swiper).catch((error: unknown) => { loader = null; throw error });

/* -- Zoom bar --
 * Shows the percentage relative to the original image's pixels, not the transform multiplier relative to "fit to window". So a large image may start at 34%,
 * with original size at 100%; Swiper 14's zoom.in(number) accepts the target multiplier directly, below or above 1. */
export const PHOTO_ZOOM_MIN = 10;
export const PHOTO_ZOOM_MAX = 400;
export const PHOTO_ZOOM_STEP = 10;

export interface PhotoZoom {
  /** `'fit'` means fit to window; a number is the target percentage, clamped between the bounds. */
  apply(raw: number | 'fit'): void;
  /** The lightbox has measured once: recompute from the previous target. */
  resize(): void;
  /** A large image arrived: if it is the current one, recompute against the target; the fit-to-window percentage must wait for its natural size. */
  loaded(img: HTMLImageElement): void;
}

/** `box` is the lightbox itself; once it is out of the document (already closed) this does nothing. `show` hands the percentage to the readout and the slider. */
export function photoZoom(box: Element, main: SwiperInstance, show: (percent: number) => void): PhotoZoom {
  let target: number | 'fit' = 'fit';
  const image = () => main.slides?.[main.activeIndex]?.querySelector('img');
  const fitPercent = () => {
    const img = image();
    if (!img?.naturalWidth || !img.naturalHeight) return 100;
    return Math.min(100, img.offsetWidth / img.naturalWidth * 100, img.offsetHeight / img.naturalHeight * 100);
  };
  const apply = (raw: number | 'fit') => {
    if (main.destroyed || !box.isConnected) return;
    const fit = fitPercent();
    const percent = raw === 'fit' ? fit : Math.min(PHOTO_ZOOM_MAX, Math.max(PHOTO_ZOOM_MIN, Number(raw) || fit));
    target = raw === 'fit' ? 'fit' : percent;
    show(Math.round(percent));
    const ratio = percent / fit;
    if (Math.abs(ratio - 1) < .001) main.zoom.out();
    else main.zoom.in(ratio);
  };
  const reset = () => requestAnimationFrame(() => apply('fit'));
  main.on('slideChange', reset);
  main.on('zoomChange', (_swiper, scale) => { if (scale) show(Math.round(fitPercent() * scale)) });
  reset();
  return {
    apply,
    resize: () => apply(target),
    loaded: (img) => { if (img === image()) apply(target) },
  };
}

/* ── Info panel ── */

/** Writes 1 KB even below a thousand bytes; a non-breaking space sits between the number and the unit, so it never splits into two lines in a narrow panel. */
export const fmtPhotoSize = (raw: unknown): string => {
  const size = Number(raw) || 0;
  if (!size) return 'Unknown size';
  return (size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : fmtSize(size)).replace(' ', ' ');
};

export const photoTitle = (slide: LightboxSlide): string => (slide.asset?.name || slide.name) || 'Untitled image';

/** The panel's second row. Local images show source and size; the others show source, resolution (only once the full image arrives), and size. Which image it is exists only as the single counter in the bottom bar. */
export function photoMeta(slide: LightboxSlide, natural: readonly [number, number] | undefined): string {
  const asset = slide.asset;
  if (asset) return [LOC[asset.location ?? ''] || asset.location || 'Source unknown', fmtPhotoSize(asset.size)].join(' · ');
  const resolution = natural?.[0] && natural[1] ? `${natural[0]} × ${natural[1]}` : '';
  return [slide.source || 'Online images', resolution, slide.size ? fmtPhotoSize(slide.size) : '']
    .filter(Boolean).join(' · ');
}
