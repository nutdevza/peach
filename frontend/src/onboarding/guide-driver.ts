import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { peachHistory } from '../history';
import { closeDrawerAfterNav } from '../application/layout';
import { disposeStage } from '../application/media';
import { beginPlayerGuidePreview } from '../player/guide-preview';
import type { GuideStep } from './guide-catalog';
export interface GuidePopoverProps {
  step: GuideStep; position: number; total: number; missing: boolean;
  invitation?: boolean;
  next(skipped?: boolean): void; previous(): void; close(): void;
}

function available(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  if (!node.isConnected || !rect.width || !rect.height || rect.right <= 0 || rect.left >= innerWidth
    || node.closest('[hidden],[inert],[data-skeleton]')) return false;
  for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
  }
  return ![...node.querySelectorAll<HTMLElement>('[data-skeleton]')].some(child => child.getBoundingClientRect().height > 0);
}

/** The same entry becomes a button on narrow screens; each time, select the actually visible candidate from the current DOM. */
export function resolveGuideTarget(selector?: string): HTMLElement | undefined {
  if (!selector) return undefined;
  const candidates = selector.split(',').flatMap(part => [...document.querySelectorAll<HTMLElement>(part.trim())]);
  const found = candidates.find(available);
  if (!found) return undefined;
  // Some IDs in the preferences belong to the toggle itself; box-select the whole row including the label so the explanation and control stay together.
  return found.closest<HTMLElement>('[data-setting-row], [data-setting-sort-controls]') || found;
}

/** A route has a target only after it loads; closing early or changing steps cancels the wait. */
export async function findGuideTarget(selector: string | undefined, signal: AbortSignal, timeout = 4000): Promise<Element | undefined> {
  if (!selector) return undefined;
  const start = Date.now();
  while (!signal.aborted) {
    const found = resolveGuideTarget(selector);
    if (found) return found;
    if (Date.now() - start >= timeout) return undefined;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  return undefined;
}

export interface GuideSession {
  show(step: GuideStep, position: number, total: number): Promise<void>;
  stop(): void;
}

export function createGuideSession(options: {
  mountPopover(wrapper: HTMLElement, arrow: HTMLElement, props: GuidePopoverProps): () => void;
  navigate(path: string): void; next(skipped?: boolean): void; previous(): void; close(): void; leave?(): void;
  invitation?: boolean;
}): GuideSession {
  let active: Driver | null = null;
  let controller: AbortController | null = null;
  let navigating = false;
  let disposed = false;
  let unmount: (() => void) | undefined;
  let tracking = 0;
  let mediaId: number | undefined;
  let releasePlayer: (() => void) | undefined;
  const closePlayer = () => {
    if (!releasePlayer) return;
    disposeStage(false, false, { miniplayer: false });
    releasePlayer(); releasePlayer = undefined;
  };
  const origin = document.activeElement as HTMLElement | null;
  const navigate = (route: string) => {
    const target = new URL(route, location.origin);
    const changed = location.pathname !== target.pathname
      || (Boolean(target.search) && location.search !== target.search) || (Boolean(target.hash) && location.hash !== target.hash);
    if (!changed) return;
    if (new URLSearchParams(location.search).has('edit')) target.searchParams.set('edit', '');
    navigating = true;
    try { options.navigate(`${target.pathname}${target.search}${target.hash}`) }
    finally { navigating = false }
  };
  const keyboard = (event: KeyboardEvent) => {
    // Enter / Escape in edit mode are handled by the in-place text editor.
    if (event.target instanceof Element && event.target.closest('[data-copy-inline], [data-copy-input]')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); options.close(); return }
    const panel = document.querySelector<HTMLElement>('.peach-guide-popover');
    if (!panel) return;
    const onEntry = options.invitation && event.target instanceof Element && event.target.closest('#tutorialBtn');
    if (!panel.contains(event.target as Node) && !onEntry && event.key !== 'Tab') { event.preventDefault(); event.stopImmediatePropagation(); return }
    if (event.key !== 'Tab') return;
    const buttons = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href], [tabindex="0"]')].filter(node => node.offsetWidth && node.offsetHeight);
    const entry = options.invitation ? document.getElementById('tutorialBtn') : null;
    if (entry) buttons.unshift(entry);
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    event.preventDefault(); event.stopImmediatePropagation();
    buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  };
  window.addEventListener('keydown', keyboard, true);
  window.addEventListener('resize', closeDrawerAfterNav);
  const unlisten = peachHistory.listen(() => { if (!navigating) (options.leave || options.close)() });
  const clear = () => {
    controller?.abort(); cancelAnimationFrame(tracking);
    unmount?.(); unmount = undefined; active?.destroy(); active = null;
  };
  return {
    async show(step, position, total) {
      clear();
      closeDrawerAfterNav();
      const current = new AbortController(); controller = current;
      const menu = document.querySelector<HTMLButtonElement>('#stage .vjs-peach-settings-toggle[aria-expanded="true"]');
      menu?.click();
      let route: string | undefined = step.route;
      if (!step.surface) closePlayer();
      if (step.surface) {
        if (!mediaId) {
          navigate('/');
          const card = await findGuideTarget('[data-guide-video][data-id]', current.signal);
          const id = Number((card as HTMLElement | undefined)?.dataset.id);
          if (Number.isSafeInteger(id) && id > 0) mediaId = id;
        }
        if (disposed || current.signal.aborted) return;
        if (mediaId) {
          releasePlayer ||= beginPlayerGuidePreview();
          route = `/assets/${mediaId}`;
        }
      }
      if (route) navigate(route);
      if (step.surface === 'subtitles' && mediaId) {
        const toggle = await findGuideTarget('#stage .vjs-peach-settings-toggle', current.signal);
        if (!current.signal.aborted && toggle?.getAttribute('aria-expanded') !== 'true') (toggle as HTMLButtonElement | undefined)?.click();
      }
      let element = await findGuideTarget(step.target, current.signal);
      if (disposed || current.signal.aborted) return;
      let missing = !element;
      active = driver({
        animate: false, smoothScroll: false, disableActiveInteraction: !options.invitation, allowKeyboardControl: false,
        allowClose: true, overlayClickBehavior: () => options.close(), stagePadding: 6,
        stageRadius: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-radius')) || 8,
        popoverClass: 'peach-react peach-guide-popover', showButtons: [],
        onPopoverRender(popover) {
          unmount?.();
          // The native detail dialog sits in the top layer, so the explanation and overlay must be in the same layer.
          const dialog = document.querySelector<HTMLDialogElement>('#stage[open]');
          if (step.surface && dialog) {
            dialog.append(popover.wrapper);
            const overlay = document.querySelector('.driver-overlay');
            if (overlay) dialog.append(overlay);
          }
          popover.wrapper.setAttribute('role', 'dialog');
          popover.wrapper.setAttribute('aria-modal', 'true');
          unmount = options.mountPopover(popover.wrapper, popover.arrow, { step, position, total, missing, ...options });
        },
        onNextClick: () => options.next(missing), onDoneClick: () => options.next(missing),
        onPrevClick: () => options.previous(), onCloseClick: () => options.close(),
      });
      const highlight = () => active?.highlight({ ...(element ? { element } : {}), popover: {
        // Content is rendered by Peach's React components; positioning, edge avoidance, and arrows reuse Driver.
        side: 'bottom', align: 'center', showButtons: [],
      } });
      highlight();
      let previous = '';
      // Only track geometry while this step is alive. Ancestor transform animations, internal scrolling, async content, and breakpoint switches
      // All of these change position; Driver's built-in window scroll/resize can't cover these cases.
      const track = () => {
        if (disposed || current.signal.aborted) return;
        // Driver creates the overlay after onPopoverRender; the next frame also moves it into the native popover.
        const dialog = step.surface ? document.querySelector('#stage[open]') : null;
        const overlay = document.querySelector('.driver-overlay');
        if (dialog && overlay && overlay.parentElement !== dialog) dialog.append(overlay);
        const next = resolveGuideTarget(step.target);
        if (next !== element) {
          element = next; missing = !next; highlight(); previous = '';
        }
        const rect = element?.getBoundingClientRect();
        const viewport = window.visualViewport;
        const geometry = `${rect?.x}:${rect?.y}:${rect?.width}:${rect?.height}:${innerWidth}:${innerHeight}:${viewport?.height}:${viewport?.offsetTop}`;
        if (geometry !== previous) { previous = geometry; active?.refresh() }
        tracking = requestAnimationFrame(track);
      };
      tracking = requestAnimationFrame(track);
      queueMicrotask(() => { if (!current.signal.aborted) document.querySelector<HTMLButtonElement>('.peach-guide-popover [data-guide-next]')?.focus() });
    },
    stop() {
      disposed = true; clear(); unlisten(); closePlayer(); window.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('resize', closeDrawerAfterNav);
      if (origin?.isConnected && origin.getBoundingClientRect().width) origin.focus();
    },
  };
}
