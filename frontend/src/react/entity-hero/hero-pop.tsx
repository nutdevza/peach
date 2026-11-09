/* The top-layer popovers on the profile card: aliases' and tags' "+N", and the subscription explainer.
 *
 * All three are native `popover="manual"`: only the top layer escapes the profile card's `overflow:hidden` and the co-star
 * band pressing on the card's bottom. Position is computed from the viewport: 8px below the anchor by default, flipping above
 * when it does not fit below, clamped 8px inside left and right; while open, page scroll or a window resize recomputes, and
 * the listener removes itself on close. */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { Glyph } from './glyph';

/** Place `pop` below `anchor`, flipping above when it does not fit, clamped 8px inside the viewport horizontally. When neither side fits, place on the side with more
 *  space, compressing the height to what that side truly has left and scrolling within the overlay: the overlay never straddles the anchor, since covering the "+N" puts
 *  the pointer on the overlay and the button becomes unclickable. */
export function placePop(anchor: Element, pop: HTMLElement): void {
  pop.style.removeProperty('max-height');
  const at = anchor.getBoundingClientRect(), box = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(innerWidth - box.width - 8, at.left))}px`;
  const below = at.bottom + 8;
  const roomBelow = innerHeight - 8 - below, roomAbove = at.top - 16;
  const downward = box.height <= roomBelow || (box.height > roomAbove && roomBelow >= roomAbove);
  const room = Math.max(0, downward ? roomBelow : roomAbove);
  if (box.height > room) pop.style.maxHeight = `${room}px`;
  pop.style.top = `${downward ? below : at.top - 8 - Math.min(box.height, room)}px`;
}

const isOpen = (pop: HTMLElement | null) => !!pop?.isConnected && pop.matches(':popover-open');

/** While open, recompute position on scroll and window resize; listeners come off when `open` goes false or on unmount. */
function useFollow(open: boolean, anchor: RefObject<Element | null>, pop: RefObject<HTMLElement | null>, onLost: () => void) {
  const lost = useRef(onLost);
  lost.current = onLost;
  useEffect(() => {
    if (!open) return undefined;
    const follow = () => {
      if (anchor.current && isOpen(pop.current)) placePop(anchor.current, pop.current!);
      else lost.current();
    };
    addEventListener('scroll', follow, { capture: true, passive: true });
    addEventListener('resize', follow, { passive: true });
    return () => {
      removeEventListener('scroll', follow, true);
      removeEventListener('resize', follow);
    };
  }, [open, anchor, pop]);
}

/** The "+N" and its overlay.
 *
 *  Shows on pointer hover or keyboard focus and stays while the pointer moves onto the overlay to read names; a click pins it (the only path on touch),
 *  and a second click, a click elsewhere or Escape collapses it. */
export function MorePop({ id, rest, label, heading, hook, children }: {
  id: string;
  rest: number;
  /** The button's screen reader name: "N other aliases". */
  label: string;
  /** Overlay title: "7 aliases". */
  heading: string;
  /** The button's own style hooks: `alias` or `fact`. */
  hook: 'alias' | 'fact';
  children: ReactNode;
}) {
  const more = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const closing = useRef(0);

  const hide = () => {
    clearTimeout(closing.current);
    pinned.current = false;
    if (isOpen(pop.current)) pop.current!.hidePopover();
    setOpen(false);
  };
  const show = () => {
    clearTimeout(closing.current);
    if (!pop.current || !more.current || isOpen(pop.current)) return;
    pop.current.showPopover();
    placePop(more.current, pop.current);
    setOpen(true);
  };
  const later = () => {
    clearTimeout(closing.current);
    closing.current = window.setTimeout(() => {
      if (!pinned.current && !more.current?.matches(':hover,:focus-visible') && !pop.current?.matches(':hover')) hide();
    }, 150);
  };
  useFollow(open, more, pop, hide);
  // A click outside the button and the overlay closes it.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!more.current?.contains(target) && !pop.current?.contains(target)) hide();
    };
    addEventListener('pointerdown', outside, true);
    return () => removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => () => clearTimeout(closing.current), []);

  return (
    <>
      <button ref={more} type="button" data-hero-more={hook} aria-expanded={open} aria-controls={id}
        aria-label={label}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') show() }}
        onPointerLeave={later}
        onFocus={() => { if (more.current?.matches(':focus-visible')) show() }}
        onBlur={later}
        onClick={() => { if (pinned.current) hide(); else { show(); pinned.current = true } }}
        onKeyDown={(event) => { if (event.key === 'Escape' && isOpen(pop.current)) { event.preventDefault(); hide() } }}>
        +{rest}
      </button>
      <div ref={pop} id={id} popover="manual" role="group" aria-label={heading} data-hero-pop=""
        onPointerEnter={() => clearTimeout(closing.current)} onPointerLeave={later}>
        <p data-hero-pop-head="">{heading}</p>
        {children}
      </div>
    </>
  );
}

/** The "Subscribe to new releases" switch: an RSS icon with the switch itself hidden from screen readers and keyboard, and a tooltip shown on hover and keyboard focus.
 *
 *  Escape only dismisses it once; after the pointer leaves or focus moves away, the next hover shows it again as usual. */
export function FeedSwitch({ following, busy, onToggle, tip }: {
  following: boolean;
  busy: boolean;
  onToggle(on: boolean): void;
  tip: string;
}) {
  const label = useRef<HTMLLabelElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const dismissed = useRef(false);

  const hideTip = () => {
    if (isOpen(pop.current)) pop.current!.hidePopover();
    setOpen(false);
  };
  const showTip = () => {
    if (dismissed.current || !pop.current || !label.current || isOpen(pop.current)) return;
    pop.current.showPopover();
    placePop(label.current, pop.current);
    setOpen(true);
  };
  const restore = () => { dismissed.current = false; hideTip() };
  useFollow(open, label, pop, () => setOpen(false));
  // The caption changed (subscribe or cancel); while the overlay is open, re-layout once with the new width.
  useEffect(() => {
    if (label.current && isOpen(pop.current)) placePop(label.current, pop.current!);
  }, [tip]);

  return (
    <label ref={label} data-entry-feed="" onPointerEnter={showTip}
      onPointerLeave={() => { if (!input.current?.matches(':focus-visible')) restore() }}>
      <Glyph name="rss" />
      <input ref={input} type="checkbox" role="switch" aria-label="Subscribe to new releases" aria-describedby="entityFeedTip"
        data-entity-feed="" checked={following} aria-busy={busy || undefined} aria-disabled={busy || undefined}
        onChange={(event) => { if (!busy) onToggle(event.currentTarget.checked) }}
        onKeyDown={(event) => { if (event.key === 'Escape') { dismissed.current = true; hideTip() } }}
        onFocus={() => { if (input.current?.matches(':focus-visible')) showTip() }}
        onBlur={restore} />
      <span ref={pop} role="tooltip" id="entityFeedTip" popover="manual" data-entry-feed-tip="">{tip}</span>
    </label>
  );
}
