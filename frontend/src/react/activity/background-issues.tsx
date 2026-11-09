/* The task center's leading "Needs attention": problems the background services have right now, one line per item.
 *
 * These are persistent states (scheduling failing repeatedly, public entry down, network unreachable), not a round that ran,
 * so they stay out of the task table; data comes from `/api/background-issues`, with the server reading each service's
 * snapshot fresh every time, and the line disappears when the problem does. A line states only what it is and since when,
 * plus a link naming where to go (copy provided by the server); the cause is explained only at the settings location the link
 * points to, never restated here. Ones a re-run might fix in place (network, scheduling, the amane bridge) also get a "Retry
 * now"; ones needing settings or credentials get only the link. Link on the left, retry on the right: the in-place fix is the
 * line's primary action and sits far right like the section's bottom action bar; lines without retry put the link in the same
 * spot.
 *
 * Two time forms: services that record their own start write "since ..."; services that do not record failure time write
 * "detected at ...", the moment this run first read it; never mixed. With no problems the whole section is not rendered, and
 * fetch failure does not render it either: when the service is unreachable, the page top already has a fetch-failed line. */
import { useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RiArrowRightLine } from '@remixicon/react';

import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';

import { apiGet, apiSend, errorMessage } from '../../api';
import { Note } from '../components/note';
import { busyProps } from '../settings/use-action';
import { momentText } from './tasks';

export const BACKGROUND_ISSUES_URL = '/api/background-issues';
export const BACKGROUND_ISSUES_KEY = ['background-issues'] as const;

export interface BackgroundIssue {
  key: string;
  title: string;
  href: string;
  /** Link copy naming a concrete destination, such as "Open notification settings". */
  link_label: string;
  /** The starting point each service records itself; null for services that do not record one. */
  since: string | null;
  /** The moment this item was first read in this run. */
  noticed_at: string;
  retry: string | null;
  retry_available: boolean;
}

export function BackgroundIssues() {
  const id = useId();
  const query = useQuery({
    queryKey: BACKGROUND_ISSUES_KEY,
    queryFn: ({ signal }) => apiGet<{ issues: BackgroundIssue[] }>(BACKGROUND_ISSUES_URL, signal),
    refetchInterval: 30_000,
  });
  const issues = query.data?.issues || [];
  if (!issues.length) return null;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h3 id={id} className="text-title-2-medium text-text-primary">Needs attention</h3>
      <ul className="flex min-w-0 flex-col gap-3">
        {issues.map((issue) => <li key={issue.key}><IssueRow issue={issue} /></li>)}
      </ul>
    </section>
  );
}

function IssueRow({ issue }: { issue: BackgroundIssue }) {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: () => apiSend(issue.retry!, {}),
    onSuccess: () => { void client.invalidateQueries({ queryKey: BACKGROUND_ISSUES_KEY }) },
  });
  const moment = issue.since ? `Since ${momentText(issue.since)}` : `Noticed at ${momentText(issue.noticed_at)}`;
  return (
    <Note tone="error" title={issue.title} action={
      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={issue.href} size="small" trailingIcon={RiArrowRightLine}>{issue.link_label}</LinkButton>
        {issue.retry
          ? <Button variant="secondary" size="small" disabled={!issue.retry_available}
              {...busyProps(retry.isPending)} onClick={() => retry.mutate()}>Retry now</Button>
          : null}
      </div>
    }>
      {retry.error ? `${moment}\nNot retried: ${errorMessage(retry.error)}` : moment}
    </Note>
  );
}
