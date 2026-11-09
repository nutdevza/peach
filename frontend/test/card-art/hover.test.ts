/* Card hover preview: whether to start, when long hover begins, and how to wind it down. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureHoverPreview, releaseHover, releaseHoverPreviews, wireHover } from '../../src/card-art/hover';

const settings = { hoverDelaySeconds: 0, selecting: false, censored: false };

function card(): HTMLElement {
  const el = document.createElement('div');
  el.dataset.mediaCard = '';
  el.innerHTML = '<div data-media-pic=""></div>';
  document.body.append(el);
  return el;
}

const enter = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseenter'));
const leave = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseleave'));

beforeEach(() => {
  Object.assign(settings, { hoverDelaySeconds: 0, selecting: false, censored: false });
  configureHoverPreview({
    selecting: () => settings.selecting,
    censored: () => settings.censored,
    delaySeconds: () => settings.hoverDelaySeconds,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('Hover zoom setting', () => {
  it('Off, no timer starts; on, it enlarges after the delay', () => {
    const el = card();
    wireHover(el, { id: 7, location: 'pikpak', has_thumb: true });
    enter(el);
    vi.advanceTimersByTime(10000);
    expect(el.hasAttribute('data-previewing')).toBe(false);
    leave(el);
    settings.hoverDelaySeconds = 3;
    enter(el);
    expect(el.hasAttribute('data-previewing')).toBe(false);
    el.querySelector('img.ui-hvframes')!.dispatchEvent(new Event('load'));
    expect(el.hasAttribute('data-previewing')).toBe(true);
    vi.advanceTimersByTime(2999);
    expect(el.hasAttribute('data-longhover')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(el.hasAttribute('data-longhover')).toBe(true);
    leave(el);
    expect(el.hasAttribute('data-previewing')).toBe(false);
    expect(el.hasAttribute('data-longhover')).toBe(false);
  });

  it('Closing during the countdown never enters the enlarged state: the setting is read again when the timer fires', () => {
    settings.hoverDelaySeconds = 3;
    const el = card();
    wireHover(el, { id: 7, location: 'pikpak', has_thumb: true });
    enter(el);
    el.querySelector('img.ui-hvframes')!.dispatchEvent(new Event('load'));
    settings.hoverDelaySeconds = 0;
    vi.advanceTimersByTime(3000);
    expect(el.hasAttribute('data-longhover')).toBe(false);
  });
});

describe('Remote source only scans contact prints', () => {
  it('It overlays a scanning view without touching the cover image, withdrawing when the pointer moves off', () => {
    const el = card();
    el.querySelector('[data-media-pic]')!.innerHTML = '<img class="poster cover" src="/cover?code=A">';
    wireHover(el, { id: 7, location: 'pikpak', has_thumb: true });
    expect(el.dataset.hoverMode).toBe('frames');
    enter(el);
    const layer = el.querySelector<HTMLImageElement>('img.ui-hvframes');
    expect(layer?.getAttribute('src')).toBe('/poster?id=7&c=4');
    expect(layer?.hidden).toBe(true);
    layer?.dispatchEvent(new Event('load'));
    expect(layer?.hidden).toBe(false);
    expect(el.querySelector('img.cover')?.getAttribute('src')).toBe('/cover?code=A');
    leave(el);
    expect(el.querySelector('img.ui-hvframes')).toBeNull();
  });

  it('The next cell loads its image before swapping in; if not loaded it stays on the current cell, and the gate opens on image failure too', () => {
    const preloads: HTMLImageElement[] = [];
    const RealImage = globalThis.Image;
    vi.stubGlobal('Image', class { constructor() { const img = new RealImage(); preloads.push(img); return img; } });
    const el = card();
    wireHover(el, { id: 7, location: 'pikpak', has_thumb: true });
    enter(el);
    const layer = el.querySelector<HTMLImageElement>('img.ui-hvframes')!;
    vi.advanceTimersByTime(430);
    expect(preloads).toHaveLength(0);
    layer.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(430);
    expect(preloads.map(img => img.getAttribute('src'))).toEqual(['/poster?id=7&c=5']);
    vi.advanceTimersByTime(430);
    expect(preloads).toHaveLength(1);
    expect(layer.getAttribute('src')).toBe('/poster?id=7&c=4');
    preloads[0]!.onload!(new Event('load'));
    expect(new URL(layer.src).search).toBe('?id=7&c=5');
    vi.advanceTimersByTime(430);
    expect(preloads[1]!.getAttribute('src')).toBe('/poster?id=7&c=6');
    preloads[1]!.onerror!(new Event('error'));
    vi.advanceTimersByTime(430);
    expect(preloads[2]!.getAttribute('src')).toBe('/poster?id=7&c=6');
    vi.unstubAllGlobals();
  });

  it('Without a contact sheet no preview mounts', () => {
    const el = card();
    wireHover(el, { id: 7, location: 'pikpak', has_thumb: false });
    enter(el);
    expect(el.querySelector('img.ui-hvframes')).toBeNull();
  });

  it('When the first image fails it removes the layer and countdown and keeps the cover; re-entering can fetch again', () => {
    settings.hoverDelaySeconds = 3;
    const el = card();
    el.querySelector('[data-media-pic]')!.innerHTML = '<img class="cover" src="/cover?id=7">';
    wireHover(el, { id: 7, location: '115', has_thumb: true });
    enter(el);
    el.querySelector('img.ui-hvframes')!.dispatchEvent(new Event('error'));
    vi.advanceTimersByTime(5000);
    expect(el.querySelector('img.ui-hvframes')).toBeNull();
    expect(el.hasAttribute('data-previewing')).toBe(false);
    expect(el.hasAttribute('data-longhover')).toBe(false);
    expect(el.querySelector('img.cover')?.getAttribute('src')).toBe('/cover?id=7');
    leave(el); enter(el);
    expect(el.querySelector('img.ui-hvframes')).not.toBeNull();
  });

  it('After a card changes resources it removes the old layer, timer and listeners and requests only the current resource', () => {
    settings.hoverDelaySeconds = 3;
    const el = card();
    wireHover(el, { id: 7, location: '115', has_thumb: true });
    enter(el);
    const old = el.querySelector('img.ui-hvframes')!;
    wireHover(el, { id: 8, location: '115', has_thumb: false });
    old.dispatchEvent(new Event('load'));
    enter(el); vi.advanceTimersByTime(5000);
    expect(el.querySelector('img.ui-hvframes')).toBeNull();
    expect(el.hasAttribute('data-longhover')).toBe(false);
    wireHover(el, { id: 9, location: '115', has_thumb: true });
    enter(el);
    expect(el.querySelectorAll('img.ui-hvframes')).toHaveLength(1);
    expect(el.querySelector('img.ui-hvframes')?.getAttribute('src')).toBe('/poster?id=9&c=4');
  });

  it('Never fires during multi-select or overlays', () => {
    const el = card();
    wireHover(el, { id: 7, location: 'pikpak', has_thumb: true });
    settings.selecting = true;
    enter(el);
    expect(el.querySelector('img.ui-hvframes')).toBeNull();
    settings.selecting = false;
    settings.censored = true;
    enter(el);
    expect(el.querySelector('img.ui-hvframes')).toBeNull();
  });
});

describe('Local files pull the real video', () => {
  it('It waits 340ms before starting a muted video, keeping only one at a time', () => {
    const first = card();
    const second = card();
    wireHover(first, { id: 1, location: 'local' });
    wireHover(second, { id: 2, location: 'local' });
    expect(first.dataset.hoverMode).toBe('video');
    enter(first);
    vi.advanceTimersByTime(339);
    expect(first.querySelector('video.hv')).toBeNull();
    vi.advanceTimersByTime(1);
    const video = first.querySelector<HTMLVideoElement>('video.hv');
    expect(video?.getAttribute('src')).toBe('/stream?id=1');
    expect(video?.muted).toBe(true);
    enter(second);
    vi.advanceTimersByTime(340);
    expect(first.querySelector('video.hv')).toBeNull();
    expect(second.querySelector('video.hv')).not.toBeNull();
  });

  it('The cover is replaced only after the preview video\'s first frame arrives', () => {
    const el = card();
    wireHover(el, { id: 1, location: 'local' });
    enter(el);
    vi.advanceTimersByTime(340);
    const video = el.querySelector<HTMLVideoElement>('video.hv')!;
    let frame: (() => void) | undefined;
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: (done: () => void) => { frame = done; return 1 } });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.hasAttribute('data-playing')).toBe(false);
    video.dispatchEvent(new Event('loadeddata'));
    expect(video.hasAttribute('data-playing')).toBe(false);
    frame?.();
    expect(video.hasAttribute('data-playing')).toBe(true);
    leave(el);
    expect(el.querySelector('video')).toBeNull();
  });

  it('Cards scrolled past never trigger, and a fire time during scrolling holds', () => {
    const scrolling = window as unknown as { __scrolling?: boolean };
    const el = card();
    wireHover(el, { id: 1, location: 'local' });
    scrolling.__scrolling = true;
    enter(el);
    vi.advanceTimersByTime(340);
    expect(el.querySelector('video.hv')).toBeNull();
    scrolling.__scrolling = false;
    enter(el);
    scrolling.__scrolling = true;
    vi.advanceTimersByTime(340);
    expect(el.querySelector('video.hv')).toBeNull();
    delete scrolling.__scrolling;
  });

  it('An overlay opened during the debounce window never releases at fire time', () => {
    const el = card();
    wireHover(el, { id: 1, location: 'local' });
    enter(el);
    settings.censored = true;
    vi.advanceTimersByTime(340);
    expect(el.querySelector('video.hv')).toBeNull();
  });
});

describe('Withdraw the preview', () => {
  it('releaseHover clears the own preview of this card; releaseHoverPreviews keeps every card except the given one', () => {
    const kept = card();
    const dropped = card();
    wireHover(kept, { id: 1, location: 'pikpak', has_thumb: true });
    wireHover(dropped, { id: 2, location: 'pikpak', has_thumb: true });
    enter(kept);
    enter(dropped);
    releaseHoverPreviews(document, kept);
    expect(kept.querySelector('img.ui-hvframes')).not.toBeNull();
    expect(dropped.querySelector('img.ui-hvframes')).toBeNull();
    releaseHover(kept);
    expect(kept.querySelector('img.ui-hvframes')).toBeNull();
  });

  it('The card repainted and the callback followed the old element, yet the sweep view left on screen still collapses', () => {
    const el = card();
    el.querySelector('[data-media-pic]')!.innerHTML = '<img class="ui-hvframes" src="/poster?id=1&c=4">';
    releaseHoverPreviews();
    expect(el.querySelector('img.ui-hvframes')).toBeNull();
  });
});
