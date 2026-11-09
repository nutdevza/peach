/* A filename or title in a list that points to a work: inherits the color of the surrounding text, medium weight, underline only on hover.
 * A name is content, not an action, so no blue LinkButton; the data-management issue list and the task card share this treatment. */
import type { AnchorHTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

export function NameLink({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} className={cx('text-body-2-medium underline-offset-4 hover:underline', className)} />;
}
