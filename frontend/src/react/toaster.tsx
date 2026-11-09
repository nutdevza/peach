/* Site-wide Toast: Sonner's stack, mounted at `#toasts` (directly under body, so the legacy layer's whole-page re-renders
 * cannot wash it away).
 *
 * The legacy shell's `toast()` and every island's `toast` prop end at `showToast`. Stacking, hover expand, swipe dismiss and
 * hover-pause follow Sonner; face, border, radius and shadow take Board's overlay set, written in the `#toasts` section of
 * `web/css/17-overlay.css`. The host carries no `.peach-react`: that layer's Preflight would strip Sonner's own button styles,
 * and the Board tokens used here already hang on `:root`. */
import type { CSSProperties } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Toaster, toast } from 'sonner';

import type * as Bundle from './bundle';
import { Providers } from './providers';

/* The success check draws itself in (`src/ui-kit/motion.css`'s `[data-toast-glyph=draw]`); the failure one does not draw:
   errors need to be legible immediately. The glyph comes from the legacy layer's `icon()`, the same stroke set as the rest of the site's icons. */
const glyph = (html: string, draw: boolean) => (
  <span data-toast-glyph={draw ? 'draw' : 'still'} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
);

let mounted: { host: Element; root: Root } | null = null;
/* Agent Progress's rounded-2xl frame reuses the existing radius tokens and stays confined to the notification stack. */
const FRAME = { '--floating-radius': 'var(--radius-2xl)' } as CSSProperties;
/* Bottom edge of the notification stack: the bottom-docked multi-select action bar and the small window parked in the corner each write down the height they occupy (spacing included), and the stack sits above the tallest of them;
   when neither is present, it is just the default margin. */
const floor = (edge: number) => `max(${edge}px, var(--selection-dock-space, 0px), var(--miniplayer-space, 0px))`;

/** On app unmount, tears down Sonner's subscription and timers; the same host can be remounted afterwards. */
export function unmountToaster(): void {
  const current = mounted;
  mounted = null;
  current?.root.unmount();
}

export const mountToaster: typeof Bundle.mountToaster = (host, icons) => {
  if (mounted?.host === host) return;
  unmountToaster();
  const root = createRoot(host);
  mounted = { host, root };
  /* All bottom-right overlays go into these two columns: the background task card lands on the bottom edge, and the receipt and toast stack presses above its top edge
     (`--processing-toast-space` is written by the task card based on its own height), laid out vertically so they don't overlap. To toast in the bottom-right elsewhere,
     go through `toast` into the stack; don't pin another `position: fixed`. The stack leaves room for long receipts; each receipt's width is determined by its content. */
  root.render(
    <Providers><Toaster id="receipts" position="bottom-right" closeButton gap={8}
      style={{ ...FRAME, '--width': 'min(560px, calc(100vw - 48px))' } as CSSProperties}
      offset={{ right: 24, bottom: `calc(${floor(24)} + var(--processing-toast-space, 0px))` }}
      mobileOffset={{ right: 16, left: 16, bottom: `calc(${floor(16)} + var(--processing-toast-space, 0px))` }}
      toastOptions={{ closeButtonAriaLabel: 'Dismiss the note' }} containerAriaLabel="Notifications"
      icons={{ success: glyph(icons.success, true), error: glyph(icons.error, false) }} />
      <Toaster id="processing" position="bottom-right" gap={8} expand
        style={{ ...FRAME, '--width': 'min(400px, calc(100vw - 32px))' } as CSSProperties}
        offset={{ right: 24, bottom: floor(24) }}
        mobileOffset={{ right: 16, left: 16, bottom: floor(16) }}
        toastOptions={{ closeButtonAriaLabel: 'Dismiss the task note' }} containerAriaLabel="Background tasks" />
    </Providers>,
  );
};

/* Calling with the same `id` again rewrites that toast: the undo result writes back into the original receipt instead of starting a new one, so the bottom-aligned stack does not hop one row in and out.
   On rewrite `action` is explicitly given `undefined`; Sonner merges by id, and without this the old "Undo" key would remain next to "Undone". */
/** Dwell time when no duration is given or the value is not positive, same as the legacy shell's `toast()` default. Pass `Infinity` explicitly to keep it up. */
const DEFAULT_TIMEOUT = 6000;

export const showToast: typeof Bundle.showToast = (id, request) => {
  /* A toast with no text is just a blank strip; do not pop it. */
  if (!String(request.html ?? '').trim()) return;
  const show = request.alert ? toast.error : toast.success;
  const action = request.action;
  show(<span dangerouslySetInnerHTML={{ __html: request.html }} />, {
    id,
    toasterId: 'receipts',
    duration: request.timeout > 0 ? request.timeout : DEFAULT_TIMEOUT,
    action: action ? {
      label: action.label,
      // Clicking does not close it: the result has to be written back to this entry. What closes it is the rewrite timer that follows.
      onClick: (event) => { event.preventDefault(); action.run(event.currentTarget) },
    } : undefined,
  });
};
