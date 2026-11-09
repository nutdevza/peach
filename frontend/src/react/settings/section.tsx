/* Shared building blocks across the configuration page's sections.
 *
 * The frame takes BoardUI's settings overlay's `SettingsSectionLabel` + `SettingsCard`, with switch rows using `SettingsRow`
 * directly. The registry has no collapse, so it is composed from BoardUI tokens, differences registered in
 * `boardui/ORIGIN.md`. Hints and progress bars have another page-shared copy in `../components/`. */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType, FormEvent, MouseEvent, ReactNode } from 'react';
import { RiArrowRightLine, RiArrowRightSLine, RiExternalLinkLine } from '@remixicon/react';
import { setCollapseOpen } from '@peach/legacy/ui';

import { SettingsCard, SettingsSectionLabel } from '@/components/application/settings/settings-rows';
import { LinkButton } from '@/components/base/buttons/link-button';
import { cx } from '@/utils/cx';

interface SectionProps {
  title: string;
  /** The tour follows the component identity, not editable title text. */
  guide?: string;
  icon?: ReactNode;
  id?: string;
  /** Secondary content that follows the title (an external link to the source site). The title takes the remaining width; this sits on the right. */
  aside?: ReactNode;
  /** When provided, render as a form: Enter submits, and the submit button lives in the `Footer`. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

/* Sections' descriptions, errors, and readings often carry long URLs, stacks, and spaceless paths: the whole section breaks in place with
   `overflow-wrap:anywhere` (the property inherits, so inline descriptions, Help, and readings follow), without stretching cards into horizontal scroll. */
export function Section({ title, guide, icon, id, aside, onSubmit, children }: SectionProps) {
  const label = icon ? <span className="inline-flex items-center gap-1.5">{icon}{title}</span> : title;
  const body = (
    <>
      {aside
        /* The title keeps at least 10rem: when space runs out the external link wraps to the next line rather than squeezing the title to one character per line. */
        ? <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="min-w-40 flex-1"><SettingsSectionLabel>{label}</SettingsSectionLabel></div>
            <div className="flex min-w-0 max-w-full">{aside}</div>
          </div>
        : <SettingsSectionLabel>{label}</SettingsSectionLabel>}
      <SettingsCard>{children}</SettingsCard>
    </>
  );
  return onSubmit
    ? <form id={id} data-guide-target={guide} aria-label={title} noValidate onSubmit={onSubmit} className="flex w-full flex-col gap-2 wrap-anywhere">{body}</form>
    : <section id={id} data-guide-target={guide} aria-label={title} className="flex w-full flex-col gap-2 wrap-anywhere">{body}</section>;
}

/** Settings row groups: rows draw their own dividers inside, and shared styles fill the boundaries between neighboring groups. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="ui-settings-rows flex flex-col empty:hidden">{children}</div>;
}

/** The card only manages left padding and background color; content that isn't a `SettingsRow` gets its line spacing and top/bottom/right padding from this layer.
 *  `divided` when placed after `Rows` or `FactList`, adding a divider between it and the group of rows above.
 *  A `FactList` nested inside falls back to this layer's right padding: the row lines reach the card edge on the right, just like the settings rows elsewhere,
 *  while the readout is still aligned by each row's own right padding. */
export function Stack({ divided = false, children }: { divided?: boolean; children: ReactNode }) {
  return divided
    ? <div className="flex flex-col gap-4 border-t border-separator-border py-4 pr-3 empty:hidden [&>.ui-settings-facts]:-mr-3">{children}</div>
    : <div className="flex flex-col gap-4 py-4 pr-3 empty:hidden [&>.ui-settings-facts]:-mr-3">{children}</div>;
}

/** A section's first fetch: paint this section's skeleton copy from `configuration-skeleton.ts`, the same structure as this block in the whole-page skeleton,
 *  so the whole-page skeleton stays in place when handed to React. Fetch once on mount; do not recompute with renders before the read-back. The status name is for assistive tech only. */
export function SectionSkeleton({ label, html }: { label: string; html: () => string }) {
  const [markup] = useState(html);
  return <div className="contents" data-skeleton="" aria-busy="true" aria-label={label} dangerouslySetInnerHTML={{ __html: markup }} />;
}

/** Bottom bar: a sentence on the left saying what the button means right now, the button on the right.
 *
 *  The background is a touch darker than the card face and runs to the card's left and right edges (the old `.geist-fieldset-footer`'s `--board-card-foot`):
 *  the card's left padding lives on the card itself, so this strip must offset it and then add its own back. */
export function Footer({ status, children }: { status?: ReactNode; children?: ReactNode }) {
  return (
    <div className="-ml-3 flex flex-wrap items-center justify-end gap-3 rounded-b-2xl border-t border-separator-border bg-card-footer px-3 py-3 empty:hidden">
      {status ? <div className="mr-auto min-w-0 text-body-2-regular text-text-secondary">{status}</div> : null}
      {children}
    </div>
  );
}

export function Help({ role, children }: { role?: 'status'; children: ReactNode }) {
  return <p role={role} className="text-body-2-regular text-text-secondary">{children}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-body-2-regular text-text-error-primary">{children}</p>;
}

/** 设置页做不了、要在宿主机上照抄执行的几步：每步一句说明加一条命令（容器的迁移与更新）。 */
export function CommandSteps({ label, steps }: { label: string; steps: { text: string; command: string }[] }) {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-body-2-regular text-text-secondary" aria-label={label}>
      {steps.map((step) => (
        <li key={step.command}>
          {step.text}
          <code className="mt-1 block rounded-md bg-background-tertiary-default px-2 py-1 text-caption-1-regular break-all text-text-primary">
            {step.command}
          </code>
        </li>
      ))}
    </ol>
  );
}

/** The name above a field, styled like BoardUI's `Label`; the control's own accessible name comes from `aria-label`. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-body-medium text-text-primary">{children}</p>;
}

/** External links opened in a new window, with an external-link glyph at the end. Write both `rel` items: the new tab does not inherit this page's session,
 *  and the referrer does not carry Peach's own address away. */
export function ExternalLink({ href, children, leadingIcon }: {
  href: string; children: ReactNode;
  leadingIcon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}) {
  return (
    <LinkButton href={href} target="_blank" rel="noopener noreferrer" size="small"
      leadingIcon={leadingIcon} trailingIcon={RiExternalLinkLine} className="min-w-0 max-w-full">
      <span className="min-w-0 whitespace-normal break-all">{children}</span>
    </LinkButton>
  );
}

/** Background task progress lives in the task center: this chip follows the description sentence and jumps there in-app on click. */
export function TaskCenterLink() {
  return (
    <LinkButton href="/tasks" size="small" trailingIcon={RiArrowRightLine} className="self-start">
      View progress in the task center
    </LinkButton>
  );
}

/** Read-only labels and readouts, one pair per row, with the row spacing and separators of `SettingsRow`. */
export function FactList({ children }: { children: ReactNode }) {
  return <dl className="ui-settings-facts flex flex-col empty:hidden">{children}</dl>;
}

/* The label sizes to content, at most half the row, wrapping within its own half when longer; the count right-aligns, and when wrapped the text left-aligns so it reads
   as a sentence rather than a wall of right-aligned words. */
export function Fact({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-separator-border py-2.5 pr-3 last:border-b-0">
      <dt className="flex max-w-1/2 min-w-0 shrink-0 items-center gap-2 text-body-regular text-text-secondary">{term}</dt>
      <dd className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-left text-body-regular break-all text-text-primary">{children}</dd>
    </div>
  );
}

/** Expandable body. Native `details` gives keyboard and a11y semantics; open/close goes through the shared Collapse's `setCollapseOpen`,
 *  which attaches `ui-kit/collapse.css`'s `.ui-fcollapse` to the body's outer wrapper for the height transition. Padding goes on the inner layer so height can reach 0. */
export function Disclosure(
  { summary, defaultOpen = false, isOpen, children, trailing = false, row = false, onOpenChange, contentClassName }:
  { summary: ReactNode; defaultOpen?: boolean; isOpen?: boolean; children: ReactNode; trailing?: boolean; row?: boolean; onOpenChange?(open: boolean): void; contentClassName?: string },
) {
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const primed = useRef(false);
  const [open, setOpen] = useState(isOpen ?? defaultOpen);
  useLayoutEffect(() => {
    if (isOpen === undefined || isOpen === open || !details.current || !body.current) return;
    setCollapseOpen(details.current, body.current, isOpen);
    setOpen(isOpen);
  }, [isOpen, open]);
  const toggle = (event: MouseEvent) => {
    event.preventDefault();
    if (!details.current || !body.current) return;
    setCollapseOpen(details.current, body.current, !open);
    setOpen(!open);
    onOpenChange?.(!open);
  };
  /* Expansion is handed back to `setCollapseOpen` after the first time: if `open` were a React controlled prop, the collapsing
     transition would be re-rendered back open. This only writes the initial state to the DOM on first mount. */
  const attach = (node: HTMLDetailsElement | null) => {
    details.current = node;
    if (node && (isOpen ?? defaultOpen) && !primed.current) {
      primed.current = true;
      node.open = true;
    }
  };
  return (
    <details ref={attach}>
      <summary aria-expanded={open} aria-controls={id} onClick={toggle}
        className={cx('flex w-full cursor-pointer list-none items-center gap-1 rounded-sm text-body-2-medium text-text-secondary outline-none select-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring', row && 'px-5 py-2.5')}>
        {!trailing ? <RiArrowRightSLine aria-hidden className={open ? 'size-(--icon-inline) shrink-0 rotate-90 transition-transform' : 'size-(--icon-inline) shrink-0 transition-transform'} /> : null}
        {summary}
        {trailing ? <RiArrowRightSLine aria-hidden className={open ? 'ml-auto size-(--icon-inline) shrink-0 -rotate-90 transition-transform' : 'ml-auto size-(--icon-inline) shrink-0 rotate-90 transition-transform'} /> : null}
      </summary>
      <div ref={body} id={id} inert={!open}>
        <div className={cx('flex flex-col gap-2', row ? 'px-5 pt-0.5' : 'pt-3', contentClassName)}>{children}</div>
      </div>
    </details>
  );
}

/** Glyphs from the legacy sprite (the `#i-*` symbols in `web/index.html`). Library icon values are exactly these names. */
export function SpriteIcon({ name }: { name: string }) {
  return (
      <svg aria-hidden data-source-mark={name} viewBox="0 0 24 24" fill="none" className="size-(--icon-inline) shrink-0 stroke-current stroke-2">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** Source marks: cloud drive site badges are inline PNGs, the rest are sprite glyphs (`src/ui-kit/media-source-icons.ts`). */
export function SourceMark({ mark }: { mark: string }) {
  return mark.startsWith('data:image/png;base64,')
    ? <img src={mark} alt="" width={16} height={16} className="size-(--icon-inline) shrink-0" />
    : <SpriteIcon name={mark} />;
}
