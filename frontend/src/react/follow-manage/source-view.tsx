/* A followed source's on-screen cells: site mark, avatar, status badge, source name.
 *
 * Creator cards, table view, and the alias list read the same copy, so these cells live here instead of being painted per view:
 * once one source's status wording diverges between the two views, the same row says "unchecked" on the card and "OK" in the table. */
import { useLayoutEffect, useRef, useState } from 'react';
import { RiExternalLinkLine } from '@remixicon/react';

import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';

import { MarkImage } from '../components/site-mark';

import {
  authorAvatar, authorInitial, errorHeadline, isBroken, sourceIconUrl, statusText,
  type FollowSource,
} from './follow-manage';

/** The followed source's site icon, same size and fallback as the scrape-source icon; the site name comes from adjacent text or the outer screen-reader text. */
export function SourceIcon({ provider }: { provider: string }) {
  return <MarkImage src={sourceIconUrl(provider)} />;
}

/** Creator round badges: the official source's avatar first, archive sources as fallback, and the initial when neither works.
 *
 * The initial comes from the creator's name, not from some source's tag; that would carve out lone characters unrelated to the creator. */
export function AuthorAvatar({ group, name }: { group: FollowSource[]; name: string }) {
  const { src, fallback } = authorAvatar(group);
  const [at, setAt] = useState(0);
  const chain = [src, fallback].filter(Boolean);
  const current = chain[at];
  if (!current) {
    return (
      <span title="No avatar available"
        className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-background-tertiary-default text-caption-1-semibold text-text-secondary">
        {authorInitial(name)}
      </span>
    );
  }
  return (
    <img src={current} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer"
      onError={() => setAt(at + 1)}
      className="size-8 shrink-0 rounded-full bg-background-tertiary-default object-cover" />
  );
}

/** Status badges. Three colors for three things: needs attention, normal, and no verdict yet. */
export function StatusBadge({ source }: { source: FollowSource }) {
  const color = !source.enabled || source.history_exhausted ? 'gray' : isBroken(source) ? 'rose'
    : source.enabled && source.last_status === 'ok' ? 'lime'
    : source.enabled ? 'yellow' : 'gray';
  return <Chip variant="caption" color={color}>{statusText(source)}</Chip>;
}

/** The source name links to the original page on the site, with an external-link glyph after the name. The new tab does not inherit this page's session, and the source URL does not carry Peach's own address along. */
export function SourceLink({ source }: { source: FollowSource }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" title="Open original source"
      className="max-w-full min-w-0 self-start text-body-medium wrap-anywhere text-text-primary underline-offset-2 hover:underline">
      {source.label}
      <RiExternalLinkLine aria-hidden className="size-(--icon-inline) shrink-0" />
    </a>
  );
}

/** An error entry: lists show one line (`errorHeadline`), truncated when it does not fit; beyond that line or when truncated, "View details" expands the full text in place.
 *  Sources' last check and JAV import's scraping failures use it; the backend often returns whole HTML pages or whole tracebacks. */
export function ErrorLine({ text, prefix = '', tone = 'error' }: { text: string; prefix?: string; tone?: 'error' | 'muted' }) {
  const line = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const head = errorHeadline(text);
  useLayoutEffect(() => {
    const node = line.current;
    if (!node || open) return undefined;
    const measure = () => setCut(node.scrollWidth > node.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [head, open]);
  const more = cut || head !== String(text || '').trim();
  return (
    <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5">
      <small ref={line} data-error-line=""
        className={`max-w-full text-caption-1-regular ${tone === 'error' ? 'text-text-error-primary' : 'text-text-secondary'} ${open ? 'whitespace-pre-line wrap-anywhere' : 'block truncate'}`}>
        {prefix}{open ? text : head}
      </small>
      {more ? (
        <Button variant="ghost" size="small" data-error-line-toggle="" data-error-details-toggle="" aria-expanded={open} className="-ml-2"
          onClick={() => setOpen(!open)}>
          {open ? 'Collapse details' : 'View details'}
        </Button>
      ) : null}
    </span>
  );
}
