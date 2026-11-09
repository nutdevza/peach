/* Which container a popover should mount into.
 *
 * The default one at the end of `body` (`overlayContainer` in `providers.tsx`) is enough for whole-page islands. The details
 * popover is not: the stage opens a native `<dialog>` with `showModal()`, and top-layer elements rank above all z-indexes.
 * A popover landing on `body` is covered entirely by the details page, and no z-index beats the top layer, while the covered
 * look and "the popover did not render" are indistinguishable on screen. So popovers mount into that open dialog; falling
 * back to `body` when not found. The stage provides this container uniformly for its layer (`UNSAFE_PortalProvider` in
 * `stage.tsx`), so popovers, dropdowns and tooltips inside details need no wrapper of their own.
 *
 * Tokens, Preflight and focus rules all apply on `.peach-react`, so the container carries that class itself.
 * Each dialog reuses one container; after a popover closes it stays there and need not be rebuilt next time.
 */
function hostIn(parent: HTMLElement): HTMLElement {
  const existing = parent.querySelector<HTMLElement>(':scope > [data-react-overlays]');
  if (existing) return existing;
  const host = parent.ownerDocument.createElement('div');
  host.className = 'peach-react';
  host.dataset.reactOverlays = '';
  parent.append(host);
  return host;
}

/** The popover container that the layer containing `node` should use. */
export function overlayHost(node: Element | null | undefined): HTMLElement {
  const document = node?.ownerDocument ?? globalThis.document;
  const modal = node?.closest('dialog[open]');
  return hostIn((modal as HTMLElement | null) ?? document.body);
}

const LAYER = '[role="dialog"],[role="listbox"],[role="menu"]';

/** The dialog, list or menu of the topmost popover layer inside `modal`; `null` when no layer is open.
 *  The container also holds focus-trap sentinels and other non-popover nodes; take the last child that is a layer or contains one, scanning backward. */
export function topOverlay(modal: HTMLElement): HTMLElement | null {
  const host = modal.querySelector(':scope > [data-react-overlays]');
  for (let node = host?.lastElementChild; node; node = node.previousElementSibling) {
    const layer = node.matches(LAYER) ? node as HTMLElement : node.querySelector<HTMLElement>(LAYER);
    if (layer) return layer;
  }
  return null;
}

/** The site-wide Toast stack (`#toasts`) follows modal dialogs in and out: pass the open dialog and it moves in; pass `null`
 *  and it returns to `body`.
 *  Left on `body`, the stack is covered entirely by the top-layer details popover and receipts would go unseen; moved into the
 *  dialog it sits above it and stays out of the inert region outside the modal dialog, so "Undo" stays clickable. It must be
 *  returned before the dialog unmounts, or the stack leaves the document with the dialog. */
export function adoptToasts(modal: HTMLDialogElement | null): void {
  const host = document.getElementById('toasts');
  const parent = modal?.open ? modal : document.body;
  if (host && host.parentElement !== parent) parent.append(host);
}
