/* The few cells shared between the works card (`./media-card.tsx`) and the follow card (`../follow-feed/follow-card.tsx`) text column: the name in the attribution,
 * the date, and the tag row. The two cards have different data and actions, so the whole card isn't merged; the structure, glyphs, and style hooks for these cells are written once,
 * with differences coming in via parameters — whether the name is wrapped in a button or a link is decided by the caller, and whether the tags are clickable is set by `readOnly`.
 * Geometry and colors are all on `data-media-*` in `./media-card.css`. */
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/** One glyph from the sprite, written like the legacy layer's `icon()`: size and stroke come from `./media-card.css` by position. */
export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}

/** The name in the attribution: a portrait glyph plus the name. The outer element (the data-media-who button, link, or plain text) belongs to the caller. */
export function WhoLabel({ name }: { name: ReactNode }) {
  return <><Icon name="user-round" /><span>{name}</span></>;
}

/** The date at the end of the attribution line: a calendar glyph plus the date, kept inside data-media-facts; on a narrow card it wraps to the next line with it. */
export function CardDate({ value, label, title }: { value: string; label: string; title?: string }) {
  return <time data-media-release="" dateTime={value} title={title || label}><Icon name="calendar" />{label}</time>;
}

/** The card's tag row: at most three. The clickable ones are filter keys (buttons, with `data-tag`); the read-only ones are text with the same face,
 * not disabled buttons — they were never actionable, so a screen reader should not announce "button, unavailable", nor should they be selected as controls. */
export function CardTags({ tags, label, readOnly = false, attrs, ...row }: {
  tags: readonly string[]; label(tag: string): string; readOnly?: boolean;
  /** Each additional attribute: the follow card writes the source type and its own selector hook. */
  attrs?(tag: string): Record<string, string | undefined>;
} & ComponentPropsWithoutRef<'div'>) {
  return (
    <div {...row} data-media-tags="">
      {tags.map((tag) => readOnly
        ? <span key={tag} data-media-tag="" {...attrs?.(tag)}>{label(tag)}</span>
        : <button key={tag} type="button" data-media-tag="" data-tag={tag} {...attrs?.(tag)}>{label(tag)}</button>)}
    </div>
  );
}
