/* An error block in a list: normally one line shows (`errorHeadline`), and "View details" expands the full text.
 *
 * The backend often returns a whole traceback or a whole HTML page, and laying it out would stretch a card to several screens tall; showing one line hides the full text,
 * so the full text lives behind the key, and when expanded it keeps the original line breaks, breaks long URLs in place, and scrolls in its own box when too long. */
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/base/buttons/button';

import { readableErrorHeadline } from './tasks';
import { cardClass } from '../components/card';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';

/** The full error shares the max-height container and the overlay scrollbar. */
export function ErrorDetails({ children, label, id }: { children: ReactNode; label: string; id?: string }) {
  const scroll = useOverlayScrollbar<HTMLDivElement>();
  return <div data-error-details="" className={cardClass({ bordered: 'soft', radius: 'surface', padding: 'none',
    className: 'relative w-full min-w-0 overflow-hidden bg-background-tertiary-default' })}>
    <div ref={scroll} id={id} role="region" aria-label={label} tabIndex={0}
      className="max-h-80 overflow-y-auto overscroll-contain p-3 text-body-2-regular whitespace-pre-line wrap-anywhere text-text-primary">
      {children}
    </div>
  </div>;
}

export function ErrorExcerpt({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const full = String(text || '').trim();
  const head = readableErrorHeadline(full);
  if (!head) return null;
  const more = head !== full;
  return (
    <div data-error-excerpt="" className={`flex min-w-0 max-w-full flex-col items-start gap-1 ${className}`}>
      {open
        ? <ErrorDetails id={id} label="Full error details">{full}</ErrorDetails>
        : <p className="w-full wrap-anywhere">{head}</p>}
      {more
        ? <Button variant="ghost" size="small" data-error-details-toggle="" className="-ml-2" aria-expanded={open} aria-controls={open ? id : undefined}
            onClick={() => setOpen(!open)}>
            {open ? 'Collapse details' : 'View details'}
          </Button>
        : null}
    </div>
  );
}
