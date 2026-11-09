/* One entry in the issues list: a single-level title (13px medium weight; what's clickable is the work link), with the reason and path and other details below.
 * The data-management issues list and the task card's issue details share this same hierarchy. The line between entries is drawn on each entry itself, not using `divide-y`:
 * that family's selectors are wrapped in `:where()` with no specificity, can't override the preflight rule at the end of the in-island `@scope` that zeroes all element borders,
 * so the line would silently vanish. The line uses a `currentColor` blend, so in a yellow callout or a gray detail box it follows whatever text color is there. */
import type { ReactNode } from 'react';
import { NameLink } from './name-link';

export function IssueRow({ title, href, children }: { title: ReactNode; href?: string; children?: ReactNode }) {
  return <li className="flex min-w-0 flex-col gap-1 border-b border-current/15 py-2 pr-6 wrap-anywhere first:pt-0 last:border-b-0 last:pb-0">
    {href ? <NameLink href={href}>{title}</NameLink> : <span className="text-body-2-medium">{title}</span>}
    {children}
  </li>;
}
