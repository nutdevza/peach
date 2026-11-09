/* The image fallback chain: on failure move to the next image, and when all fail end via `data-drop`. */
import { describe, expect, it } from 'vitest';

import { advanceImageFallback, imageFallbackAttrs, parseFallbacks, wireImageFallbacks } from '../../src/card-art/image-fallback';

function image(attrs: string): HTMLImageElement {
  const box = document.createElement('div');
  box.className = 'ring';
  box.innerHTML = `<img src="/first" ${attrs}>`;
  document.body.append(box);
  return box.querySelector('img')!;
}

describe('Statement', () => {
  it('Drop empty candidates, escape URLs into attributes', () => {
    expect(imageFallbackAttrs({ fallbacks: ['', '/a?x="1"', '/b'] }))
      .toBe('data-drop="self" data-fallbacks="/a?x=&quot;1&quot;|/b"');
    expect(imageFallbackAttrs({ fallbacks: '' })).toBe('data-drop="self"');
    expect(imageFallbackAttrs({ drop: 'initial', initial: 'A', dropClass: 'ini', dropStyle: true }))
      .toBe('data-drop="initial" data-initial="A" data-drop-class="ini" data-drop-style');
  });

  it('Parsing drops empty segments and whitespace', () => {
    expect(parseFallbacks(' /a | |/b ')).toEqual(['/a', '/b']);
    expect(parseFallbacks(undefined)).toEqual([]);
  });
});

describe('Advance', () => {
  it('Images without a registered data-drop are never touched', () => {
    const img = image('');
    expect(advanceImageFallback(img)).toBe('');
    expect(img.isConnected).toBe(true);
  });

  it('It cycles candidates in order before closing, with the final link removing the image', () => {
    const img = image('data-drop="self" data-fallbacks="/second|/third"');
    expect(advanceImageFallback(img)).toBe('retry');
    expect(img.getAttribute('src')).toBe('/second');
    expect(img.dataset.fallbacks).toBe('/third');
    expect(advanceImageFallback(img)).toBe('retry');
    expect(img.getAttribute('src')).toBe('/third');
    expect(img.dataset.fallbacks).toBeUndefined();
    expect(advanceImageFallback(img)).toBe('drop');
    expect(img.isConnected).toBe(false);
  });

  it('Moving to the next link clears framing computed from the previous image; face boxes clear whether the switch is on or off', () => {
    const framed = image('style="object-position:50% 12%" data-facebox="1 2 3 4 5" data-drop="self" data-drop-style data-fallbacks="/b"');
    advanceImageFallback(framed);
    expect(framed.hasAttribute('style')).toBe(false);
    expect(framed.dataset.facebox).toBeUndefined();
    const kept = image('style="--face:1" data-facebox="1 2 3 4 5" data-drop="self" data-fallbacks="/b"');
    advanceImageFallback(kept);
    expect(kept.getAttribute('style')).toBe('--face:1');
    expect(kept.dataset.facebox).toBeUndefined();
  });

  it('closest strips the nearest container; initial swaps in the first letter', () => {
    const inBox = image('data-drop="closest:.ring"');
    const ring = inBox.parentElement!;
    advanceImageFallback(inBox);
    expect(ring.isConnected).toBe(false);
    const initial = image('data-drop="initial" data-initial="A" data-drop-class="ini"');
    const parent = initial.parentElement!;
    advanceImageFallback(initial);
    expect(parent.innerHTML).toBe('<span class="ini">A</span>');
  });
});

describe('Delegated listeners', () => {
  it('error does not bubble, so the capture phase catches descendant <img> elements', () => {
    const root = document.createElement('section');
    document.body.append(root);
    wireImageFallbacks(root);
    root.innerHTML = '<div><img src="/x" data-drop="self"></div>';
    const img = root.querySelector('img')!;
    img.dispatchEvent(new Event('error'));
    expect(img.isConnected).toBe(false);
  });
});
