/* Persistent notices beside fields, sections, and pages. Shared by the config page and the activity page.
 *
 * The registry has no inline Note: a `notification` entry is a floating toast with a close key and a timer. Here the tone picks a
 * `status-*` / `notification-*` token combination; differences are registered in `../boardui/ORIGIN.md`. */
import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

/** No password, save failure, missing database table: these are current states and do not share the gray small text of field
 *  descriptions.
 *
 *  `action` is the one thing this note asks to be done now; body and action sit side by side when they fit, and the below
 *  layout takes its own line.
 *  `extra` holds things beyond the conclusion (a collapsed problem list): they speak of the same matter, and outside the Note
 *  they would read as one sentence plus a block belonging to nobody.
 *  The body is a paragraph and cannot hold these block contents. */
export function Note(
  { tone, title, action, extra, children, actionLayout = 'inline', className }:
  { tone: Tone; title?: string; action?: ReactNode; extra?: ReactNode; children: ReactNode; actionLayout?: 'inline' | 'below'; className?: string },
) {
  const content = (
    <>
      <div data-note-layout="" className={cx('flex gap-3', actionLayout === 'inline'
        ? 'flex-wrap items-center justify-between' : 'flex-col items-start')}>
        <div className={cx('flex min-w-0 flex-auto flex-col justify-center gap-0.5', actionLayout === 'below' && 'w-full')}>
          {/* The body is often the server's own words: long URLs, stack traces and multi-line reasons wrap as-is and never stretch the card they sit in. */}
          {title ? <p className="text-body-medium wrap-anywhere">{title}</p> : null}
          <p className="whitespace-pre-line text-body-2-regular wrap-anywhere">{children}</p>
        </div>
        {action ? <div data-note-action="" className="max-w-full shrink-0">{action}</div> : null}
      </div>
      {extra}
    </>
  );
  switch (tone) {
    case 'info':
      return <div role="status" className={cx('@container flex flex-col gap-2 rounded-2lg bg-notification-information-background px-3 py-2 text-notification-information-foreground', className)}>{content}</div>;
    case 'success':
      return <div role="status" className={cx('@container flex flex-col gap-2 rounded-2lg bg-notification-success-background px-3 py-2 text-notification-success-foreground', className)}>{content}</div>;
    case 'warning':
      return <div role="note" className={cx('@container flex flex-col gap-2 rounded-2lg bg-status-yellow-background px-3 py-2 text-status-yellow-text', className)}>{content}</div>;
    case 'error':
      return <div role="alert" className={cx('@container flex flex-col gap-2 rounded-2lg bg-background-tertiary-error px-3 py-2 text-text-error-primary', className)}>{content}</div>;
    default:
      return <div role="note" className={cx('@container flex flex-col gap-2 rounded-2lg bg-background-tertiary-default px-3 py-2 text-text-secondary', className)}>{content}</div>;
  }
}
