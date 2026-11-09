/* First-screen skeletons for React pages and cards: rendered inside `.peach-react`, with keys written to match the static
 * state Board UI `Button` renders.
 *
 * The skeleton runs before the React bundle loads and can only be HTML. Outside `.peach-react`, card face, text color and
 * keys would take the legacy layer's tokens, and at takeover the background, font size and key sizes would each jump a tier.
 * Class names take only the ones deciding geometry and color (the size / variant / icon / label tables in
 * `frontend/src/react/boardui/components/base/buttons/button.tsx`); hover, pressed and focus ring are left to the real keys
 * after takeover. */

import { esc } from '@peach/legacy/core';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'medium' | 'small';

const BASE = 'inline-flex items-center justify-center gap-0.5 whitespace-nowrap overflow-hidden font-sans';
const SIZE: Record<Size, string> = {
  medium: 'h-9 rounded-2lg p-2 text-body-medium',
  small: 'h-8 rounded-lg px-2 py-1.5 text-body-medium',
};
/* Small icon-only buttons in Board UI are forced to 32×32 with padding zeroed (`size-8 p-0`); medium icon-only keeps the base size. */
const ICON_ONLY: Record<Size, string> = { medium: SIZE.medium, small: 'size-8 rounded-lg p-0 text-body-medium' };
const ICON: Record<Size, string> = { medium: 'size-5 shrink-0', small: 'size-[18px] shrink-0' };
/* Labeled keys keep glyph and text on the same line, like `Button`'s `iconInline`: the frame scales with the text size it sits in. */
const ICON_INLINE = 'size-(--icon-inline) shrink-0';
const LABEL: Record<Size, string> = {
  medium: 'inline-flex items-center justify-center px-1 shrink-0',
  small: 'inline-flex items-center justify-center px-0.5 shrink-0',
};
const VARIANT: Record<Variant, string> = {
  primary: 'bg-button-primary text-text-white shadow-xs',
  secondary: 'bg-background-primary-default text-text-primary border border-border-button-default shadow-xs',
  ghost: 'bg-button-ghost-background text-button-ghost-foreground',
};

/** The island lacks the legacy global rule that strokes Lucide glyphs, so the stroke sits on the `svg` itself, same as on the React side. */
export const islandGlyph = (name: string, cls: string): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** The favorites entry keeps icon and size through the page's waiting phase, with interaction taken over by the ready page. The glass filter bar takes the compact tier,
 *  and the entity page title's right toolbar takes the default tier, matching the two tiers of `react/styles.css`'s `[data-filter-action]`. */
export function islandShortcutsEntry(size: 'compact' | 'default' = 'compact'): string {
  return `<span data-shortcuts-entry class="inline-flex flex-none"><button type="button" data-shortcuts-trigger data-filter-action data-skeleton-action disabled tabindex="-1" aria-label="My favorites" title="My favorites" class="inline-grid ${size === 'default' ? 'size-9' : 'size-8'} flex-none place-items-center rounded-(--control-radius) border border-(--border-10) bg-(--surface) text-(--muted)">${islandGlyph('star', 'size-4')}</button></span>`;
}

/** Uses the same geometry as Board Input's medium frame, prefix, and body. */
export function islandSearchInput(placeholder: string, value = '', label = placeholder): string {
  return `<div data-input-size="medium" class="group flex h-max w-full flex-col items-start gap-1"><div data-rac class="relative flex w-full items-center rounded-2lg bg-background-tertiary-default text-foreground-icon-tertiary ring-2 ring-inset ring-transparent p-2"><div class="flex w-full items-center gap-2 min-w-0"><div class="flex flex-1 items-center gap-0.5 min-w-0">${islandGlyph('search', 'size-5 shrink-0')}<input type="search" enterkeyhint="search" readonly tabindex="-1" aria-label="${esc(label)}" value="${esc(value)}" placeholder="${esc(placeholder)}" class="min-w-0 flex-1 bg-transparent border-0 outline-none p-0 m-0 font-sans text-body-regular text-text-primary pl-1 placeholder:text-text-tertiary"></div></div></div></div>`;
}

export interface IslandButton {
  variant?: Variant;
  size?: Size;
  glyph?: string;
  label?: string;
  /** Verbatim attributes appended onto the `<button>`, such as `aria-disabled`, `aria-pressed`, `aria-label`. */
  attrs?: string;
  /** This key's label collapses to a glyph on narrow tool rows, matching the React side's `iconOnly`, which switches on tool row width. */
  compact?: boolean;
}

/** A resting-state button matching Board UI's `Button` in size and variant. Text-only, icon-only, and both are each laid out like the original component. */
export function islandButton(
  { variant = 'primary', size = 'medium', glyph, label, attrs = '', compact = false }: IslandButton,
): string {
  const shape = label ? SIZE[size] : ICON_ONLY[size];
  /* `compact`'s keys carry text (collapsed by styles in narrow rows); sort by the labeled version. */
  const icon = glyph ? islandGlyph(glyph, label ? ICON_INLINE : ICON[size]) : '';
  const text = label ? `<span class="${LABEL[size]}"${compact ? ' data-compact-label' : ''}>${label}</span>` : '';
  return `<button type="button" class="${BASE} ${shape} ${VARIANT[variant]}"${attrs ? ` ${attrs}` : ''}>${icon}${text}</button>`;
}

type SelectSize = 'md' | 'sm';
const SELECT: Record<SelectSize, { box: string; value: string; chevron: string }> = {
  md: { box: 'gap-1.5 px-2.5 py-2 text-body-medium', value: 'gap-[5px]', chevron: 'size-4' },
  sm: { box: 'gap-1 px-[7px] py-1 text-body-2-medium', value: 'gap-1', chevron: 'size-3.5' },
};

/** Board UI `Select`'s static state: an outer `group flex flex-col` with one trigger key carrying `aria-haspopup="listbox"`
 *  inside. Height is unified per this marker by `react/styles.css`, and the skeleton must use the same element and marker to
 *  receive that rule.
 *  `label` may be a data-waiting placeholder bar; `className` lands on the outer element, in the same position as the
 *  component's `className`. */
export function islandSelect(
  label: string, { size = 'md', className = '', attrs = '', prefix = '' }:
  { size?: SelectSize; className?: string; attrs?: string; prefix?: string } = {},
): string {
  const shape = SELECT[size];
  /* `prefix` matches the component's same-named prop: the light-colored name before the value. */
  const value = `<span class="flex min-w-0 items-center truncate ${shape.value}">${label}</span>`;
  const body = prefix
    ? `<span class="flex min-w-0 items-center ${size === 'sm' ? 'gap-1.5' : 'gap-2'}"><span aria-hidden="true" class="shrink-0 text-text-tertiary">${prefix}</span>${value}</span>`
    : value;
  return `<div class="group flex flex-col${className ? ` ${className}` : ''}"><button type="button" aria-haspopup="listbox"${attrs ? ` ${attrs}` : ''} class="flex w-full items-center justify-between rounded-2lg border border-border-button-default bg-background-primary-default shadow-xs text-text-primary ${shape.box}">${body}${islandGlyph('chevron-down', `shrink-0 text-text-secondary ${shape.chevron}`)}</button></div>`;
}

/* The class names below are copied from the waiting state of `react/components/collection-summary.tsx` and matched verbatim by the test. */
const SUMMARY_CLASS = 'flex items-end justify-between gap-4 rounded-surface bg-background-secondary-default px-6 py-5 '
  + 'max-compact:flex-col max-compact:items-start max-compact:gap-3 max-compact:p-4 dark:bg-background-primary-default';
const SUMMARY_TERMS = 'flex min-w-0 flex-col gap-2';
const SUMMARY_LABEL = 'text-body-regular text-text-secondary';
const SUMMARY_FIGURE = 'text-display-4-medium tabular-nums text-text-primary';
const SUMMARY_PENDING = 'relative inline-block h-8 w-24 rounded-2lg align-middle skeleton-sheen';

/** The `CollectionSummary` variant with `flush` while waiting for data: the label is there right away, and the big number cell is a shimmer placeholder. */
export function islandSummary(label: string): string {
  return `<div data-collection-summary="" class="${SUMMARY_CLASS}"><div class="${SUMMARY_TERMS}">`
    + `<span class="${SUMMARY_LABEL}">${label}</span>`
    + `<strong class="${SUMMARY_FIGURE}"><span data-skeleton="count" aria-hidden="true" class="${SUMMARY_PENDING}"></span></strong>`
    + `</div></div>`;
}
