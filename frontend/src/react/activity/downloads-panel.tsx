/* The activity page's "Cloud download" section: offline download jobs that were submitted. Submission happens in the in-place
 * popover on each page (`cloud-download-dialog.tsx`).
 *
 * The job table is `/api/downloads`' own copy, not merged into `/api/tasks`: offline jobs run on the cloud drive side, take
 * hours to days, and are a submission record with a remote id, not a batch round on this computer. So this section fetches
 * and polls on its own: every five seconds while a job is running or waiting to land remotely, every thirty seconds when
 * everything is terminal. The background reconciliation cadence is set by the server (about ten seconds after submission,
 * then backing off); this page only reads out what it found.
 *
 * With no jobs at all the section is not rendered. Failed jobs show the reason text; failed, cancelled and stalled ones can
 * be resubmitted, and ones flagged as violations cannot (the server would refuse too). Every card can copy its magnet link:
 * when the endpoint breaks, fall back to manual adding. */
import { useId, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { showToast } from '../toaster';

import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';

import { apiGet, apiSend, errorMessage } from '../../api';
import { javTitleParts } from '../../core/jav-title';
import { entityDisplayName } from '../../core/entity-names';
import { useEntityNames } from '../use-entity-names';
import type { DownloadsSnapshot, DownloadTask } from '../bundle';
import { cardClass } from '../components/card';
import { Note } from '../components/note';
import { Progress } from '../components/progress';
import { DataTableFooter } from '../components/table-controls';
import { CollapseRegion } from '../components/collapse-region';
import { ErrorText } from '../settings/section';
import { busyProps, useAction } from '../settings/use-action';
import { momentText } from './tasks';
import { SourceLabel } from '../components/source-label';
import { ArtSlot } from '../components/art-slot';
import { avatarInner, coverImage, relayoutCovers } from '@peach/card-art';
import { entityPath } from '@peach/legacy/core';
import { COVER_FRONT_RATIO } from '@peach/appearance';

export const DOWNLOADS_URL = '/api/downloads';
export const DOWNLOADS_KEY = ['downloads'] as const;
const CANCEL_URL = '/api/downloads/cancel';
const POSTPROCESS_URL = '/api/downloads/postprocess';

export const downloadPollInterval = (data: DownloadsSnapshot | undefined) =>
  data?.tasks.some((task) => task.cancellable || task.postprocess_active) ? 5_000 : 30_000;

const STATE_COLORS: Record<string, 'lime' | 'rose' | 'yellow' | 'blue' | 'neutral'> = {
  ingested: 'lime', failed: 'rose', cancelled: 'neutral', stalled: 'yellow',
  remote_running: 'blue', remote_done: 'lime', landed: 'lime', submitted: 'neutral', submit_pending: 'yellow',
};

const taskName = (task: DownloadTask) => {
  const code = task.display_code || task.code || '';
  const { title } = javTitleParts({
    is_jav: Boolean(code), code, name: task.display_title ?? task.title ?? task.display_name ?? task.remote_name,
  });
  return [code, title].filter(Boolean).join(' · ') || `Magnet ${task.info_hash?.slice(0, 8) ?? task.id}`;
};

export const failureText = (task: DownloadTask) =>
  task.failure_label ? [task.failure_label, task.failure_detail].filter(Boolean).join(': ') : '';

const postprocessDetail = (task: DownloadTask) => (task.postprocess_detail || '')
  .replace('Main video linked', 'Confirmed the video matching the main video')
  .replace('Organize skipped:', 'Unorganized files:');

export function DownloadsPanel() {
  const id = useId();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const query = useQuery({
    queryKey: [...DOWNLOADS_KEY, 'page', page, pageSize],
    queryFn: ({ signal }) => apiGet<DownloadsSnapshot>(`${DOWNLOADS_URL}?limit=${pageSize}&page=${page}`, signal),
    refetchInterval: (state) => downloadPollInterval(state.state.data),
    placeholderData: (previous) => previous,
  });
  const [lastData, setLastData] = useState(query.data);
  if (query.data && query.data !== lastData) setLastData(query.data);
  const data = query.data || lastData;
  const tasks = data?.tasks || [];
  if (!tasks.length && !query.error) return null;
  return (
    <section id="cloudDownloads" aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h3 id={id} className="text-title-2-medium text-text-primary">Cloud download</h3>
      {query.error ? <Note tone="error">{errorMessage(query.error)}</Note> : null}
      {tasks.length
        ? <ul aria-live="polite" className="flex min-w-0 flex-col gap-3">
            {tasks.map((task) => <TaskCard key={task.id} task={task} writable={data?.available ?? false} />)}
          </ul>
        : null}
      <DataTableFooter label="Cloud download" total={data?.total ?? tasks.length}
        pagination={{ pageIndex: (data?.page || page) - 1, pageSize }}
        onChange={(next) => {
          if (next.pageIndex + 1 === page && next.pageSize === pageSize) void query.refetch();
          else { setPage(next.pageIndex + 1); setPageSize(next.pageSize) }
        }} />
    </section>
  );
}

function TaskCard({ task, writable }: { task: DownloadTask; writable: boolean }) {
  useEntityNames();
  const client = useQueryClient();
  const action = useAction();
  const [fullTitle, setFullTitle] = useState(false);
  const titleId = useId();
  /* Jobs still reconciling have no failure category: transient faults only record the cause and retry after backoff, and the bottom bar still reads them out. */
  const reason = failureText(task)
    || (task.cancellable && task.failure_detail ? `Will retry automatically · ${task.failure_detail}` : '');
  const artwork = task.artwork;
  const people = artwork?.performer_entities || [];
  const detailHref = task.state === 'ingested' && task.asset_id ? `/assets/${task.asset_id}` : undefined;
  const failed = task.state === 'failed' || task.postprocess_state === 'failed';
  const meta = [task.display_code || task.code ? '' : 'Code not recognized', task.target, momentText(task.submitted_at)]
    .filter(Boolean).join(' · ');
  const refresh = () => { void client.invalidateQueries({ queryKey: DOWNLOADS_KEY }) };

  const cancel = () => {
    void action.run('cancel', (signal) => apiSend(CANCEL_URL, { id: task.id }, 'POST', signal), refresh);
  };
  const resubmit = () => {
    const body = { magnet: task.source_uri, provider: task.provider, target: task.target,
      code: task.code, title: task.title, origin: task.origin };
    void action.run('resubmit', (signal) => apiSend(DOWNLOADS_URL, body, 'POST', signal), refresh);
  };
  const copy = () => {
    void navigator.clipboard.writeText(task.source_uri).then(
      () => showToast(`download-copy-${task.id}`, { html: 'Magnet link copied', alert: false, timeout: 4000, action: null }),
      () => showToast(`download-copy-${task.id}`, { html: 'Copy failed; check clipboard permissions', alert: true, timeout: 6000, action: null }));
  };
  const retryPostprocess = () => {
    void action.run('postprocess', (signal) => apiSend(
      POSTPROCESS_URL, { id: task.id }, 'POST', signal), refresh);
  };

  return (
    <li data-download-state={task.state} data-download-id={task.id}
      className={cardClass({
        padding: 'none', bordered: failed ? 'error' : undefined, className: 'flex flex-col',
      })}>
      <div className="flex items-stretch gap-3 px-5 pt-5 pb-4">
        <div data-download-cover="" data-media-pic=""
          style={{ '--card-ratio': String(COVER_FRONT_RATIO) } as CSSProperties}
          className="w-20 shrink-0 self-start text-caption-1-regular text-text-secondary sm:w-32">
          {!artwork?.has_cover ? <span data-media-nopic="">No cover</span> : null}
          {artwork?.has_cover ? <ArtSlot artwork={{ kind: 'cover', html: coverImage(artwork, 'big') }}
            relayout={(root) => relayoutCovers(root, 'big')} /> : null}
          {detailHref ? <a data-download-cover-link="" href={detailHref} aria-label={`Opening video details: ${taskName(task)}`}
            className="absolute inset-0 z-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring" /> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
          <strong className="min-w-0 w-full flex-1 truncate text-title-1-medium text-text-primary sm:w-auto" title={taskName(task)}>
            {detailHref ? <a data-download-title-link="" href={detailHref}
              className="block truncate rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring">{taskName(task)}</a> : taskName(task)}
          </strong>
          <div className="flex shrink-0 items-center gap-2">
            <Chip color={STATE_COLORS[task.state] ?? 'neutral'}>{task.state_label}</Chip>
            {task.state === 'ingested'
            ? <Chip color={task.postprocess_state === 'complete' ? 'lime'
              : task.postprocess_state === 'failed' ? 'rose' : task.postprocess_state === 'running' ? 'blue' : 'neutral'}>{task.postprocess_label}</Chip>
            : null}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-caption-1-regular text-text-secondary"><span className="flex shrink-0"><SourceLabel source={task.provider} label={task.provider_label} /></span><span className="min-w-0 truncate" title={meta}>{meta}</span></div>
        {people.length ? <div className="flex min-w-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            {people.slice(0, 3).map((person) => <a key={person.id || person.name} data-media-avatar=""
              href={entityPath('performer', person.name, person.id)} aria-label={`Open performer page: ${entityDisplayName('performer', person.name, person.id)}`} title={entityDisplayName('performer', person.name, person.id)}
              dangerouslySetInnerHTML={{ __html: avatarInner(person.name, person, null) }} />)}
          </div>
          <span className="min-w-0 truncate text-caption-1-regular text-text-secondary"
            title={people.map((person) => entityDisplayName('performer', person.name, person.id)).join('、')}>{people.map((person) => entityDisplayName('performer', person.name, person.id)).join('、')}{(artwork?.performer_total || 0) > people.length ? ` and ${artwork!.performer_total} people` : ''}</span>
        </div> : null}
        {task.state === 'remote_running' && task.progress != null
          ? <Progress label="Remote download progress" value={Math.round(task.progress * 100)} max={100} />
          : null}
        {task.ledger_path
          ? <p className="min-w-0 truncate text-caption-1-regular text-text-secondary" title={task.ledger_path}>{task.ledger_path}</p>
          : null}
        {action.error ? <ErrorText>{action.error}</ErrorText> : null}
        {/* Auxiliary actions (view title, copy magnet link) go left, actions that modify this job go right, and the far right is the card's primary action right now. */}
        <div data-download-actions="" className="flex flex-wrap items-center gap-2 pt-1 sm:mt-auto">
          <Button variant="ghost" size="small" aria-expanded={fullTitle} aria-controls={titleId}
            onClick={() => setFullTitle(!fullTitle)}>{fullTitle ? 'Collapse title' : 'Expand title'}</Button>
          <Button variant="ghost" size="small" onClick={copy}>Copy magnet</Button>
          {writable && (task.cancellable || task.resubmittable || task.postprocess_retryable)
            ? <div className="ml-auto flex flex-wrap items-center gap-2">
                {task.cancellable
                  ? <Button variant="secondary" size="small" {...busyProps(action.busy === 'cancel')} onClick={cancel}>Cancel</Button>
                  : null}
                {task.resubmittable
                  ? <Button variant="secondary" size="small" {...busyProps(action.busy === 'resubmit')} onClick={resubmit}>Submit again</Button>
                  : null}
                {task.postprocess_retryable
                  ? <Button variant="secondary" size="small" {...busyProps(action.busy === 'postprocess')}
                      onClick={retryPostprocess}>Retry organize after import</Button>
                  : null}
              </div>
            : null}
        </div>
        </div>
      </div>
      <CollapseRegion open={fullTitle} id={titleId}>
        <p data-download-title-full className="wrap-anywhere px-5 pb-4 text-body-2-regular text-text-secondary">{taskName(task)}</p>
      </CollapseRegion>
      {reason || task.postprocess_detail
        ? <div className="flex min-h-14 flex-col justify-center rounded-b-2xl border-t border-separator-border bg-card-footer px-5 py-3">
            <p className="wrap-anywhere text-caption-1-regular text-text-secondary">{reason || postprocessDetail(task)}</p>
          </div>
        : null}
    </li>
  );
}
