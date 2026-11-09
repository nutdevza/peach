/* The modal popover's shell: mask, the overlay-tier surface and radius, and one React Aria `Dialog` inside.
 *
 * The registry has no modal popover, so React Aria's `Modal` is composed and the difference is registered in
 * `../boardui/ORIGIN.md`. The layer takes the legacy shell's `--layer-dialog` (`z-dialog`): top bar and sidebar each have
 * their own z-index above Tailwind's `z-50` tier, the mask cannot cover them, and those two areas stay lit while the popover
 * is open.
 *
 * Width takes one tier per purpose: avatar swap fits four candidates in a row, cover crop fits the whole sleeve, and forms
 * match `ui-kit/modal.css`'s `.ui-geist-modal` at 540px.
 *
 * The 56px icon block on the header's left is here too (`ModalGlyph`): it is part of the popover header, not a card. */
import type { ReactNode } from 'react';
import { useFocusVisible } from 'react-aria';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { cx } from '@/utils/cx';

const WIDTH = {
  'avatar-picker': 'max-w-avatar-picker',
  'cover-crop': 'max-w-cover-crop',
  form: 'max-w-form-modal',
  collections: 'max-w-4xl',
  tutorial: 'max-w-2xl',
} as const;

export function ModalFrame({ isOpen, onOpenChange, width, label, children, surfaceClassName = '' }: {
  isOpen: boolean;
  onOpenChange(open: boolean): void;
  width: keyof typeof WIDTH;
  /** The accessible name when the popover has no `Heading slot="title"`. */
  label?: string;
  surfaceClassName?: string;
  children: ReactNode;
}) {
  const { isFocusVisible } = useFocusVisible();
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable
      data-modal-motion="" data-modal-kind={width} data-motion-instant={isFocusVisible || undefined}
      className="fixed inset-0 z-dialog flex items-center justify-center bg-scrim p-4">
      <Modal data-modal-surface="" data-modal-width={width} className={cx('flex max-h-full w-full flex-col overflow-hidden rounded-2-5xl border border-separator-border bg-background-full shadow-dropdown', WIDTH[width], surfaceClassName)}>
        {/* When the caller's own body scroll area fits, this layer does not scroll; in short viewports even the header plus buttons cannot fit, so the whole block scrolls,
            keeping the close button always reachable. */}
        <Dialog aria-label={label} className="flex min-h-0 flex-col overflow-y-auto overscroll-contain outline-none">{children}</Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** The square icon slot on the popover header's left; the glyph comes from the caller (`size-6`). */
export function ModalGlyph({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-separator-border bg-background-secondary-default text-foreground-icon-secondary">
      {children}
    </span>
  );
}
