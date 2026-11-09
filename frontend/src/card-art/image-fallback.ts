/* Image fallback chain: templates only declare data; behavior belongs to the site-wide delegated listener in
   wireImageFallbacks(). Application and the React pages import the same module; candidates are tried in order and, when all
   fail, handled per data-drop.

   - `data-drop`: required, and the switch for the whole mechanism. `<img>` tags without it are ignored outright. The page
     also has images backed by CSS or a parent node (the label `.mk`), and deleting those would be wrong.
     `self` removes the `<img>` itself; `closest:<selector>` removes the nearest ancestor container; `initial` swaps in the
     initial-letter underlay.
   - `data-fallbacks`: optional, `|`-separated candidate srcs, tried in order before giving up. A bare `|` is not a legal URL
     character, so this separator cannot cut an address in the wrong place.
   - `data-drop-style`: optional switch; clears the inline style before moving to the next link. Face framing is computed for
     the current image; on a different photo the face is somewhere else.
   - `data-initial` / `data-drop-class`: used with `data-drop="initial"`.

   The last link of the fallback chain must actually remove the `<img>`: with a broken `<img>` left in place, `:has(img)`
   still matches, the initial-letter underlay never returns, and the browser paints the alt text.
   `onerror=null` only stops retries; it does not mean this link completed. */
import { esc } from '@peach/legacy/core';

const FALLBACK_SEPARATOR = '|';
const CLOSEST_PREFIX = 'closest:';

/* Fallback chain parsing. Strings in, arrays out, no DOM touched, testable on its own. */
export function parseFallbacks(value: unknown): string[] {
  return String(value ?? '')
    .split(FALLBACK_SEPARATOR)
    .map(part => part.trim())
    .filter(Boolean);
}

/* The `data-*` string from the template. Empty candidates are dropped outright, sparing every call site its own ternary. */
export function imageFallbackAttrs({
  drop = 'self', fallbacks = [], initial = '', dropClass = '', dropStyle = false,
}: {
  drop?: string; fallbacks?: string | readonly string[]; initial?: string; dropClass?: string; dropStyle?: boolean;
} = {}): string {
  const chain = (Array.isArray(fallbacks) ? fallbacks : [fallbacks]).filter(Boolean);
  return [
    `data-drop="${esc(drop)}"`,
    chain.length ? `data-fallbacks="${esc(chain.join(FALLBACK_SEPARATOR))}"` : '',
    initial ? `data-initial="${esc(initial)}"` : '',
    dropClass ? `data-drop-class="${esc(dropClass)}"` : '',
    dropStyle ? 'data-drop-style' : '',
  ].filter(Boolean).join(' ');
}

/* Each failure advances one step: with candidates left, swap the src; with none, finish per `data-drop`.
   Returns `retry`/`drop`/`''`; the last one means "this element is not registered, ignore it". */
export function advanceImageFallback(image: HTMLImageElement | null | undefined): '' | 'retry' | 'drop' {
  if (!image || !image.dataset || !image.dataset.drop) return '';
  const chain = parseFallbacks(image.dataset.fallbacks);
  if (chain.length) {
    const [next = '', ...rest] = chain;
    if ('dropStyle' in image.dataset) image.removeAttribute('style');
    /* The face box only describes the first ring's entity image. A fallback image is a different photo with the face somewhere
       else and a different size: keeping the box would make the next `load` use the previous image's face to compute this
       one's zoom factor.
       This one does not follow the `dropStyle` switch: the face box only ever held for the first ring, with no position where
       "keeping it would be right", while style has one (container-provided framing like `--face` must stay). */
    delete image.dataset.facebox;
    if (rest.length) image.dataset.fallbacks = rest.join(FALLBACK_SEPARATOR);
    else delete image.dataset.fallbacks;
    if (next === image.dataset.fallbackNoteSrc && image.dataset.fallbackNote) {
      image.title = image.dataset.fallbackNote;
      image.setAttribute('aria-label', image.dataset.fallbackNote);
    }
    image.src = next;
    return 'retry';
  }
  const drop = image.dataset.drop;
  if (drop.startsWith(CLOSEST_PREFIX)) {
    (image.closest(drop.slice(CLOSEST_PREFIX.length)) || image).remove();
    return 'drop';
  }
  if (drop === 'initial') {
    const span = document.createElement('span');
    span.className = image.dataset.dropClass || '';
    span.textContent = image.dataset.initial || '';
    image.replaceWith(span);
    return 'drop';
  }
  image.remove();
  return 'drop';
}

/* One listener site-wide is enough. `error` does not bubble, but it still passes through ancestors in the capture phase, so the capture listener on the root
   catches any descendant image; no need to attach one per `<img>`; binding each one means
   the profile page's external site roundels get rebound on every repaint.
   Only `<img>` counts: the same event name is also fired from `<video>`, `<source>`, and `<script>`. */
const fallbackRoots = new WeakSet<EventTarget>();
export function wireImageFallbacks(root: EventTarget): void {
  if (fallbackRoots.has(root)) return;
  fallbackRoots.add(root);
  root.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement) advanceImageFallback(event.target);
  }, true);
}
