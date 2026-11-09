/* Image lightbox: one native modal dialog, with the main canvas and thumbnail strip each a Swiper.
 *
 * The host is a `.peach-react` container at the end of body with one resident root: on open a new lightbox copy mounts (`key`
 * increments each time, Swiper builds from scratch), and on close only the content renders empty while the root and container
 * stay for next time. It stays out of the route tree: that machinery is for the shell's page containers, which belong to the
 * shell and are rewritten wholesale on page change; the lightbox floats above all pages, openable from any page, sharing
 * neither birth nor death with any page container. */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { icon } from '@peach/legacy/core';
import { setActionBusy, spinnerHtml, wireContextCard } from '@peach/legacy/ui';

import { syncBoardRange } from '../../board-controls';
import {
  loadSwiper, photoMeta, photoTitle, photoZoom, PHOTO_ZOOM_MAX, PHOTO_ZOOM_MIN, PHOTO_ZOOM_STEP,
  type LightboxHost, type LightboxSlide, type PhotoZoom, type SwiperConstructor, type SwiperInstance,
} from './photo-lightbox';

let host: HTMLElement | null = null;
let root: Root | null = null;
let generation = 0;

function lightboxRoot(): Root {
  if (!root || !host?.isConnected) {
    root?.unmount();
    host = document.createElement('div');
    host.className = 'peach-react';
    host.dataset.photoLightboxHost = '';
    document.body.append(host);
    root = createRoot(host);
  }
  return root;
}

/** Views `slides` starting at `index`. When Swiper cannot be had, falls back to opening that one full-size image in a new tab. */
export async function openPhotoLightbox(index: number, slides: LightboxSlide[], actions?: LightboxHost): Promise<void> {
  if (!slides.length || index < 0 || index >= slides.length) return;
  let Swiper: SwiperConstructor;
  try {
    Swiper = await loadSwiper();
  } catch {
    window.open(slides[index].src, '_blank', 'noopener');
    return;
  }
  const at = lightboxRoot();
  flushSync(() => at.render(
    <PhotoLightbox key={++generation} slides={slides} index={index} Swiper={Swiper} host={actions ?? null} />,
  ));
}

export function closePhotoLightbox(): void {
  if (root) flushSync(() => root!.render(null));
}

interface Detail {
  dismiss(returnFocus?: boolean): void;
  /** Panel open and this click lands outside both the panel and the trigger: collapse the panel, and this click counts for nothing else. */
  dismissOutside(target: EventTarget | null): boolean;
  isOpen(): boolean;
}

function PhotoLightbox({ slides, index, Swiper, host: actions }: {
  slides: LightboxSlide[]; index: number; Swiper: SwiperConstructor; host: LightboxHost | null;
}) {
  const many = slides.length > 1;
  const detailId = useId();
  const box = useRef<HTMLDialogElement>(null);
  const mainEl = useRef<HTMLDivElement>(null);
  const stripEl = useRef<HTMLDivElement>(null);
  const pagination = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const fwd = useRef<HTMLButtonElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const zoom = useRef<PhotoZoom | null>(null);
  const detail = useRef<Detail | null>(null);
  const [active, setActive] = useState(index);
  const [percent, setPercent] = useState(100);
  /* The large image's natural size, known only once it arrives: the panel's resolution reads it. The ones whose originals never come fall back to thumbnails. */
  const [natural, setNatural] = useState<Record<number, [number, number]>>({});
  const [broken, setBroken] = useState<ReadonlySet<number>>(() => new Set());
  /** The images where neither original nor thumbnail loads: show one placeholder block, never the browser's broken icon. */
  const [lost, setLost] = useState<ReadonlySet<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ at: number; text: string }>({ at: index, text: '' });

  useLayoutEffect(() => {
    const dialog = box.current!;
    dialog.showModal();
    document.body.classList.add('photolight-open');
    const strip = new Swiper(stripEl.current!, {
      slidesPerView: 'auto', spaceBetween: 8, freeMode: true, watchSlidesProgress: true,
      centeredSlides: true, slideToClickedSlide: true,
    });
    const centerThumb = (at: number, speed = 200) => strip.slideTo(at, speed);
    const main = new Swiper(mainEl.current!, {
      initialSlide: index, zoom: { minRatio: .01, maxRatio: 100 }, keyboard: { enabled: true }, lazyPreloadPrevNext: 1,
      // Vertical scrolling also pages: while viewing images the hand is on the wheel, and nobody reaches for arrow keys or buttons to see the next one.
      mousewheel: { enabled: true, forceToAxis: false },
      thumbs: { swiper: strip },
      pagination: {
        el: pagination.current, clickable: true, dynamicBullets: true, dynamicMainBullets: 3,
        renderBullet: (at: number, className: string) =>
          `<button type="button" class="${className}" aria-label="View image ${at + 1}"></button>`,
      },
      navigation: { prevEl: back.current, nextEl: fwd.current },
      on: {
        slideChange(this: SwiperInstance) {
          setActive(this.activeIndex);
          centerThumb(this.activeIndex);
        },
      },
    });
    centerThumb(index, 0);
    zoom.current = photoZoom(dialog, main, setPercent);
    const context = wireContextCard(dialog, toggle.current!, panel.current!);
    const dismiss = (returnFocus = false) => {
      context.hide();
      toggle.current?.setAttribute('aria-expanded', 'false');
      if (returnFocus && toggle.current && document.contains(toggle.current)) toggle.current.focus();
    };
    /* Ask the info card itself whether it is open: during the exit animation the panel is not hidden yet, and judging by hidden would call "closing"
       "open", so the second of two Escape presses would just close it again. */
    detail.current = {
      dismiss,
      dismissOutside: (target) => {
        const node = target instanceof Node ? target : null;
        if (!context.isOpen() || toggle.current!.contains(node) || panel.current!.contains(node)) return false;
        dismiss();
        return true;
      },
      isOpen: context.isOpen,
    };
    /* Swiper measures its container once, at construction. Resize the window (or let first-screen fonts and scrollbars settle after construction) and slides stay at the old width,
       large images scale against the wrong frame, and it reads as "partly cut off". */
    const resize = new ResizeObserver(() => { main.update(); strip.update(); zoom.current?.resize() });
    resize.observe(dialog);
    const keys = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (detail.current?.isOpen()) detail.current.dismiss(true);
      else closePhotoLightbox();
    };
    document.addEventListener('keydown', keys, true);
    return () => {
      document.removeEventListener('keydown', keys, true);
      dismiss();
      resize.disconnect();
      main.destroy(true, true);
      strip.destroy(true, true);
      zoom.current = null;
      detail.current = null;
      dialog.close();
      document.body.classList.remove('photolight-open');
    };
    // Every open gets a fresh one (`key`), so this section runs exactly once on mount and once on unmount.
  }, []);

  useLayoutEffect(() => { if (range.current) syncBoardRange(range.current) }, [percent]);

  const slide = slides[active];
  const asset = slide.asset ?? null;
  const reveal = async (button: HTMLButtonElement) => {
    if (!asset || !actions || button.getAttribute('aria-busy') === 'true') return;
    const at = active;
    setActionBusy(button);
    setBusy(true);
    setStatus({ at, text: '' });
    try {
      setStatus({ at, text: await actions.revealSource(asset.id) });
    } finally {
      setActionBusy(button, false);
      setBusy(false);
    }
  };
  const loaded = (at: number, img: HTMLImageElement) => {
    if (img.naturalWidth && img.naturalHeight && !natural[at]) {
      setNatural((prev) => ({ ...prev, [at]: [img.naturalWidth, img.naturalHeight] }));
    }
    zoom.current?.loaded(img);
  };
  // Falls back to this item's thumbnail when the original cannot be fetched: archive sites' original-file hosts block the proxy (pawchive's file.
  // subdomain hangs on ddos-guard), so thumbnails are read by the browser straight from the public host. Swap only once; if even the thumbnail cannot be fetched, show a placeholder.
  const failed = (at: number) => {
    if (broken.has(at) || !slides[at].thumb || slides[at].thumb === slides[at].src) {
      setLost((prev) => new Set(prev).add(at));
      return;
    }
    setBroken((prev) => new Set(prev).add(at));
  };
  const apply = (raw: number | 'fit') => zoom.current?.apply(raw);
  const revealLabel = '<span>Show in File Explorer</span>';

  return (
    <dialog ref={box} aria-label="Image browsing" data-photo-lightbox="" data-has-strip={many ? '' : undefined}
      onCancel={(event) => { event.preventDefault(); closePhotoLightbox() }}
      onClick={(event) => {
        // Once the main canvas fills the viewport, the black letterboxing belongs to the zoom container, not the outermost layer; both count as background.
        // Clicking the image, thumbnail strip, toolbar, and paging buttons still does not exit.
        const target = event.target as Element;
        if (detail.current?.dismissOutside(target)) return;
        if (target === box.current || target.classList.contains('swiper-zoom-container')) closePhotoLightbox();
      }}>
      <button type="button" data-photo-close="" aria-label="Close" onClick={closePhotoLightbox}
        dangerouslySetInnerHTML={{ __html: icon('x') }} />
      <div ref={mainEl} className="swiper" data-photo-main="" role="region" aria-roledescription="Carousel"
        aria-label="Image browsing">
        <div className="swiper-wrapper">
          {slides.map((item, at) => (
            <div key={at} className="swiper-slide">
              <div className="swiper-zoom-container">
                {lost.has(at)
                  ? <span data-photo-missing="">Image unavailable</span>
                  : <img src={broken.has(at) ? item.thumb : item.src} alt={item.name ?? ''} loading="lazy"
                    referrerPolicy="no-referrer" onLoad={(event) => loaded(at, event.currentTarget)}
                    onError={() => failed(at)} />}
              </div>
            </div>
          ))}
        </div>
        {/* Direction flips only the icon, not the whole button. Both render the left-pointing one; the right-pointing one rotates 180 degrees in the styles. */}
        <button ref={back} type="button" data-photo-nav="back" aria-label="Previous"
          dangerouslySetInnerHTML={{ __html: icon('chevron-left') }} />
        <button ref={fwd} type="button" data-photo-nav="fwd" aria-label="Next"
          dangerouslySetInnerHTML={{ __html: icon('chevron-left') }} />
      </div>
      <div data-photo-bar="">
        <button ref={toggle} type="button" data-photo-detail-toggle="" aria-expanded="false" aria-controls={detailId}
          aria-haspopup="dialog" aria-label="Image details" title="Image details" dangerouslySetInnerHTML={{ __html: icon('info') }} />
        <div>
          <div data-photo-count="" aria-live="polite">{`${active + 1} / ${slides.length}`}</div>
          {many ? <div ref={pagination} data-photo-pagination="" aria-label="Pick images" /> : null}
        </div>
        <div data-photo-zoom="">
          <button type="button" data-zoom-step="-1" aria-label="Zoom out"
            onClick={() => apply(percent - PHOTO_ZOOM_STEP)} dangerouslySetInnerHTML={{ __html: icon('zoom-out') }} />
          <input ref={range} type="range" min={PHOTO_ZOOM_MIN} max={PHOTO_ZOOM_MAX} step="1" value={percent}
            aria-label="Zoom" onChange={(event) => apply(Number(event.currentTarget.value))} />
          <button type="button" data-zoom-step="1" aria-label="Zoom in"
            onClick={() => apply(percent + PHOTO_ZOOM_STEP)} dangerouslySetInnerHTML={{ __html: icon('zoom-in') }} />
          <b data-photo-zoom-readout="">{`${percent}%`}</b>
          <button type="button" data-photo-scale="fit" aria-label="Fit to window" title="Fit to window"
            onClick={() => apply('fit')} dangerouslySetInnerHTML={{ __html: icon('maximize') }} />
          <button type="button" data-photo-scale="original" aria-label="Original size" title="Original size"
            onClick={() => apply(100)}>1:1</button>
        </div>
      </div>
      {/* Image details only show safe metadata, and locating only hands the asset id to the server: the ledger's local absolute paths must never
          reach the browser just to show a path. The title gets a fresh element per image: middle truncation (`src/ui-kit/middle-truncate.ts`)
          rewrites its text, and React writing text again on the same element would desync. */}
      <section ref={panel} id={detailId} data-photo-detail="" role="dialog" aria-modal="false"
        aria-labelledby={`${detailId}-title`} hidden>
        <div data-photo-detail-copy="">
          <h2 key={active} id={`${detailId}-title`} data-middle-truncate="" tabIndex={-1}>{photoTitle(slide)}</h2>
          <span data-photo-detail-meta="">{photoMeta(slide, natural[active])}</span>
        </div>
        <button type="button" data-photo-reveal="" hidden={!asset || !actions}
          onClick={(event) => void reveal(event.currentTarget)}
          dangerouslySetInnerHTML={{ __html: (busy ? spinnerHtml('Locating') : icon('folder-open')) + revealLabel }} />
        <span data-photo-status="" aria-live="polite">{status.at === active ? status.text : ''}</span>
      </section>
      <div ref={stripEl} className="swiper" data-photo-strip="">
        <div className="swiper-wrapper">
          {slides.map((item, at) => (
            <div key={at} className="swiper-slide">
              <img src={item.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
