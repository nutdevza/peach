/* Quality upgrade targets page: the videos marked in the database as "should still have a better version".
 *
 * One screen answers two things: how many are owed, and where each one falls short. So the card carries, besides the title,
 * only source, duration, size and the judgment reason: deciding whether to go find a better version looks at exactly these.
 *
 * Code titles and source badges arrive as HTML strings from the legacy layer: they are the only implementation of the site's
 * semantic contract, and rewriting them here would drift. Duration, size and source names go through `src/core/index.ts`'s
 * formatting, for the same reason. */
import { useState } from 'react';
import { RiSparklingLine } from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';

import { LOC, fmtDur, fmtSize } from '@peach/legacy/core';

import { Button } from '@/components/base/buttons/button';

import { errorMessage } from '../../api';
import { CloudDownloadDialog, type DownloadPrefill } from '../activity/cloud-download-dialog';
import type { QualityGoalsProps } from '../bundle';
import { cardClass } from '../components/card';
import { CollectionSummary } from '../components/collection-summary';
import { EmptyState } from '../components/empty-state';
import { Note } from '../components/note';
import { Page } from '../components/page';
import {
  fetchQualityGoals, previewUrl, QUALITY_GOALS_KEY, type QualityGoal,
} from './quality-goals';

/** One card per video pending upgrade. */
function GoalCard({ item, openItem, searchResources, javTitleHtml, javDisplayName, srcBadge }: { item: QualityGoal }
  & Omit<QualityGoalsProps, 'toast'> & { searchResources(prefill: DownloadPrefill): void }) {
  const open = () => openItem(item.id);
  return (
    <li data-goal-id={item.id}
      className={cardClass({ padding: 'none', className: 'flex flex-col gap-3 p-3' })}>
      <div className="flex min-w-0 gap-4">
        {/* The centered placeholder sentence uses `inline-grid`: in the old stylesheet `.grid` is the poster wall's rule with column widths and
            gaps, and coming after `peach-app.css` it would win. This button is a flex child, so an inline grid gets blockified; computed it is still `display:grid`. */}
        <button type="button" onClick={open} aria-label={`Open ${javDisplayName(item)}`}
          className="relative inline-grid w-card-cover shrink-0 self-start aspect-card-cover cursor-pointer place-items-center overflow-hidden rounded-2lg bg-background-tertiary-default">
          {/* This is what shows when the image cannot load (onError removes the img). */}
          <span className="text-caption-1-regular text-text-secondary">No preview yet</span>
          <img src={previewUrl(item)} alt="" loading="lazy"
            onError={(event) => event.currentTarget.remove()}
            className="absolute inset-0 size-full object-contain" />
        </button>
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* The title starts with the code and wraps to a second line before tail-truncating: middle truncation would cut the code and the title off together. */}
          <h3 className="text-headline-medium text-text-primary">
            <button type="button" onClick={open} title={javDisplayName(item)}
              className="line-clamp-2 w-full cursor-pointer text-left wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: javTitleHtml(item) }} />
          </h3>
          <p className="flex flex-wrap items-center gap-2 text-body-2-regular text-text-secondary">
            {/* Injecting raw HTML needs a host element, but in the legacy version the source badge is a direct
                child of this flex container. `contents` removes the host from layout, keeping the badge's alignment and spacing unchanged. */}
            <span className="contents" dangerouslySetInnerHTML={{ __html: srcBadge(item.location, item.cost) }} />
            <span>{LOC[item.location] ?? item.location}</span>
            <span>{fmtDur(item.duration)}</span>
            <span>{Number(item.size) > 0 ? fmtSize(Number(item.size)) : 'Unknown size'}</span>
          </p>
          {item.reason
            ? <p className="border-t border-separator-border pt-3 text-body-2-regular text-text-secondary wrap-anywhere">
                {item.reason}
              </p>
            : null}
        </div>
      </div>
      <footer className="flex flex-wrap justify-end gap-2">
        {item.code ? <Button variant="secondary" size="small" onClick={() => searchResources({
          code: item.code!, title: javDisplayName(item), origin: `asset:${item.id}`, searchReason: item.reason || '',
          duration: item.duration, cover: previewUrl(item),
        })}>Find resources</Button> : null}
        <Button variant="secondary" size="small" onClick={open}>View editions</Button>
      </footer>
    </li>
  );
}

export function QualityGoalsPage({ toast, ...props }: QualityGoalsProps) {
  const [download, setDownload] = useState<DownloadPrefill | null>(null);
  const goals = useQuery({ queryKey: QUALITY_GOALS_KEY, queryFn: ({ signal }) => fetchQualityGoals(signal) });
  const data = goals.data;
  if (!data) {
    return (
      <Page>
        <Note tone="error" title="HD edition target fetch failed">{goals.error ? errorMessage(goals.error) : 'The HD edition target could not be fetched; refresh the page and retry.'}</Note>
      </Page>
    );
  }
  const items = data.items || [];
  if (!items.length) {
    return (
      <Page>
        <EmptyState icon={RiSparklingLine} title="No HD target is being marked">
          Existing editions already meet the conditions, or nothing has been added to tracking yet.
        </EmptyState>
      </Page>
    );
  }
  return (
    <Page>
      {/* Take the total from the server's `total` rather than this page's row count: when `limit` truncates, the two are not the same number,
          and this line answers "how many videos are still missing in total". */}
      <CollectionSummary label="Needs upgrade" figure={`${Number(data.total || 0).toLocaleString()} videos`} flush />
      <ul className="card-grid-cover gap-5">
        {items.map((item) => <GoalCard key={item.id} item={item} {...props} searchResources={setDownload} />)}
      </ul>
      {/* The list takes only the first 200 videos; when the total is larger, say plainly that this page is not everything. */}
      {Number(data.total || 0) > items.length
        ? <p className="mt-6 text-center text-caption-1-regular text-text-secondary">
            {`Showing the first ${items.length.toLocaleString()} videos of ${Number(data.total).toLocaleString()}.`}
          </p>
        : null}
      <CloudDownloadDialog prefill={download} close={() => setDownload(null)} receipt={toast} />
    </Page>
  );
}
