/* The "Scan and collect" card on the data management page.
 *
 * The card describes what that button is doing right now (progress or waiting dots); results and failures describe the run's
 * outcome and hang outside the card, written the same way as the link management and resource sync blocks.
 *
 * Writes are `useMutation`: the server returns this run's new snapshot, swapped into cache with `setQueryData`, then this key
 * rereads once immediately to join the polling rhythm. An old terminal state read on first screen does not masquerade as a
 * new result: jobs keep running after the page closes, and the state lies around holding the last run's receipt; criteria in
 * `use-library-processing.ts`. */
import { useEffect, useState } from 'react';
import { RiArrowRightLine } from '@remixicon/react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { Select, SelectItem } from '@/components/base/select/select';
import { Chip } from '@/components/base/badges/chip';

import { apiSend, errorMessage } from '../../api';
import { SCAN_CARD_TEXT, scanCardSkeletonHtml } from '../../management';
import type { LibraryProcessingProps } from '../bundle';
import { Fieldset, FieldsetTitle } from '../components/fieldset';
import { IssueRow } from '../components/issue-row';
import { Note } from '../components/note';
import { RetryNote } from '../components/grid-reveal';
import { SkeletonContent } from '../components/skeleton-content';
import { StatusLabel } from '../components/status-label';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import { PathLine } from '../components/path-line';
import { Disclosure } from '../settings/section';
import { queryClient } from '../query';
import {
  ALL_CONTENT_URL, busyText, DISCONNECTED_TEXT, issueDetails, LIBRARY_PROCESSING_KEY, LIBRARY_PROCESSING_URL, PARTIAL_RESULT_TEXT,
  notesLine, processingActive, processingHasPartialResult, remainingTime, slowItem, type LibraryProcessingCommand, type LibraryProcessingData,
} from './library-processing';
import { SlowItemNote } from './slow-item';
import { useLibraryProcessingJob } from './use-library-processing';
import { setProcessingNoticeVisible, useProcessingNoticeVisibility } from './processing-notice-visibility';
import { ProcessingActions } from './processing-actions';
import { ProcessingProgress } from './processing-line';
import { TrafficProgress } from './processing-traffic';
import { ProcessingControls } from './processing-controls';
import { downloadIssueList, exportProcessingIssues } from './issue-export';
import { busyProps, useAction } from '../settings/use-action';
import { SourceMark } from '../settings/section';
import { useLibraryTints, type LibraryTint } from '../components/library-tint';
import { useOrderedLibraries } from '../components/library-order';

const ALL_LIBRARIES = { id: '', name: 'All libraries', icon: 'database' };

function LibraryLabel({ library }: { library: Pick<LibraryTint, 'id' | 'name' | 'icon'> }) {
  return <span className="flex min-w-0 items-center gap-2">
    <span data-library={library.id} className="inline-flex shrink-0 text-(--library-color)">
      <SourceMark mark={library.icon} />
    </span>
    <span className="truncate">{library.name}</span>
  </span>;
}

/* Body text is kept in constants: text wrapped across JSX lines picks up an extra space at the seam, which shows in Chinese sentences.
   The card body and the first-screen skeleton share `SCAN_CARD_TEXT` (`management.ts`). */
const STALLED_TEXT = 'This one takes a while and has no fresh progress yet. After the task ends you can retry the unfinished parts.';
/* Filling in performer profiles is a step after database entry, and a run often has nothing to fill; in that case this line does not appear:
   with all four readouts at 0, a line like "0 aliases" leaves readers unable to tell whether there was nothing to fill or the step never ran. */
const profileText = (state: LibraryProcessingData) => {
  const aliases = state.performer_aliases || 0;
  const avatars = state.performer_avatars || 0;
  const conflicts = state.performer_profile_conflicts || 0;
  const failed = state.performer_profile_failed || 0;
  if (!aliases && !avatars && !conflicts && !failed) return '';
  const parts = [`Fill in performer profiles: ${aliases} aliases, ${avatars} avatars`];
  if (conflicts) parts.push(`${conflicts} profiles share a name and need confirmation they are the same person`);
  if (failed) parts.push(`${failed} avatars could not be fetched`);
  return `${parts.join(', ')}.`;
};

const receiptText = (state: LibraryProcessingData) =>
  state.requested_stage === 'previews' ? `Generated ${state.previews || 0} video previews.`
  : `Scanned ${state.scanned || 0} files, identified ${state.identified || 0} codes, `
  + `Fetched ${state.candidates || 0} sets of video details, auto-saved ${state.auto_applied || 0}.`
  + (state.previews ? `Generated previews for ${state.previews} videos.` : '')
  + profileText(state);

/** The block outside the card: what happened in this run. Per-item details load on expand; the full list is in the log file the status names. */
function Outcome(
  { state, problem, settled, onRetry, toast }:
  {
    state: LibraryProcessingData; problem: string;
    settled: LibraryProcessingData | null; onRetry(): void; toast(message: string): void;
  },
) {
  const details = issueDetails(state);
  const exporter = useAction();
  const archive = useAction();
  /* The 'Archived' line is shown only to someone who just tapped archive, with an undo; after refresh the server only has archived, so the whole block no longer appears. */
  const [archivedHere, setArchivedHere] = useState('');
  const active = processingActive(state);
  const retryable = state.status === 'failed' && !!state.retryable_asset_ids?.length;
  const notes = notesLine(state.notes || {});
  const failed = !!problem || (!state.archived && state.status === 'failed');
  const partial = !problem && !state.archived && processingHasPartialResult(state);
  /* This run's question is kept in one block: the conclusion, "Don't ask again for 7 days", the list, and the log. Splitting it into several same-colored hints makes
     it unclear to the reader which line goes with which button. */
  const issues = failed || (!state.archived && !active && (!!notes || !!state.issue_count));
  const archivable = !active && !!state.job_id && !state.archived;
  const log = state.issues_log || '';
  const slow = slowItem(state);
  /* The manifest is the only self-scrolling block on this page, so its native scrollbar is just a plain system-gray column. */
  const list = useOverlayScrollbar<HTMLUListElement>();
  const setArchived = (archived: boolean) => void archive.run(archived ? 'archive' : 'unarchive',
    signal => apiSend<LibraryProcessingData>(LIBRARY_PROCESSING_URL,
      { action: archived ? 'archive' : 'unarchive', job_id: state.job_id }, 'POST', signal),
    next => {
      queryClient.setQueryData(LIBRARY_PROCESSING_KEY, next);
      setArchivedHere(archived ? state.job_id! : '');
    });
  const exportButton = state.issue_count && !active
    ? <Button variant="secondary" size="small" {...busyProps(!!exporter.busy)} onClick={() => void exporter.run('export',
        signal => exportProcessingIssues(state, signal), contents => {
          downloadIssueList(state.job_id!, contents); toast('Issue list exported');
        })}>Export the full issue list</Button>
    : null;
  const body = failed
    ? [problem || state.error || 'Processing not completed, please retry', partial ? PARTIAL_RESULT_TEXT : '', notes].filter(Boolean).join('\n')
    : notes || `This trip has ${(state.issue_count || 0).toLocaleString()} issues.`;
  return (
    /* Collapse the whole block when empty: the `aria-live` container would otherwise leave an empty track and add a phantom gap under the card. */
    <div aria-live="polite" className="flex flex-col gap-4 empty:hidden">
      {slow
        ? <SlowItemNote state={state} slow={slow} />
        : state.status === 'running' && state.stalled
        ? <Note tone="warning" title="'Processing slowly'">{STALLED_TEXT}</Note>
        : null}
      {settled?.status === 'complete'
        ? <Note tone="success" title="Processing finished">{receiptText(settled)}</Note>
        : null}
      {/* Cancellation isn't just the click right in front of you: those from the command line, the task center, and ones only read after reopening the page all leave this one line. */}
      {(settled ?? state).status === 'cancelled' && !state.archived ? <Note tone="neutral" title="Previous task cancelled">
        The retrieved resources and previews are preserved; this round will not continue automatically; re-sync when needed.
      </Note> : null}
      {issues
        ? <Note tone={!failed ? 'neutral' : partial ? 'warning' : 'error'} className="gap-0 p-3"
            title={!failed ? undefined : partial ? 'Processing ended, some items still need work' : 'Processing unfinished'}
            action={<div className="flex flex-wrap items-center gap-2">
              {partial ? <LinkButton href={ALL_CONTENT_URL} size="small" trailingIcon={RiArrowRightLine}>View all content</LinkButton> : null}
              {retryable ? <Button variant="secondary" size="small" aria-label="Retry unfinished items now" onClick={onRetry}>Retry now</Button> : null}
              {archivable ? <Button variant="secondary" size="small" aria-label="Archive notice" {...busyProps(!!archive.busy)}
                onClick={() => setArchived(true)}>Archive</Button> : null}
            </div>}
            extra={<>
              {/* Three layers stacked in the same notice block: a concluding line, a list, and a log address. Between each of them
                  runs a hairline in its own color, so the reader can tell where a section ends — on spacing alone,
                  dozens of detail lines of similar length would blur into one. */}
              {details ? <div className="-mx-3 mt-3 border-t border-current/20 px-3 pt-3">
                  <Disclosure summary={details.label} contentClassName="gap-0">
                    {/* The track is a sibling of the scroll container, so it needs a positioned ancestor wrapping only the manifest to anchor to. */}
                    <div className="relative -mr-3">
                      <ul ref={list} className="max-h-96 overflow-y-auto">
                        {details.items.map((item) => (
                          <IssueRow key={item.key} title={item.label} href={item.href}>
                            <span className="text-caption-1-regular">{item.note}</span>
                            {item.hint ? <code className="text-caption-1-regular break-all">{item.hint}</code> : null}
                          </IssueRow>
                        ))}
                      </ul>
                    </div>
                  </Disclosure>
                </div> : null}
              {/* The log address and divider use the secondary text color; export reads the same record and is placed next to “open location”. */}
              {log ? <div className="-mx-3 mt-3 border-t border-current/20 px-3 pt-3 text-text-secondary">
                  <PathLine path={log} prefix="Full log:" className="text-caption-1-regular"
                    action={exportButton} onRevealed={toast} />
                </div>
              : exportButton ? <div className="-mx-3 mt-3 flex justify-end border-t border-current/20 px-3 pt-3">{exportButton}</div>
              : null}
            </>}>
            {body}
          </Note>
        : null}
      {state.archived && archivedHere === state.job_id && !problem
        ? <Note tone="neutral" action={<Button variant="secondary" size="small" {...busyProps(!!archive.busy)}
              onClick={() => setArchived(false)}>Undo</Button>}>
            Archived the previous run's issue prompt; the full record is still kept.
          </Note>
        : null}
      {exporter.error || archive.error ? <Note tone="warning">{exporter.error || archive.error}</Note> : null}
    </div>
  );
}

export function LibraryProcessingCard(props: LibraryProcessingProps) {
  const { toast, onComplete } = props;
  const [libraryId, setLibraryId] = useState('');
  const tints = useLibraryTints({ names: true });
  const libraries = useOrderedLibraries([...tints.values()].filter(library => library.name), library => library.id);
  const selectedLibrary = libraryId
    ? tints.get(libraryId) || { id: libraryId, name: 'The library no longer exists', icon: 'database' }
    : ALL_LIBRARIES;
  const { job, settled, forget } = useLibraryProcessingJob(props);
  const start = useMutation({
    mutationFn: (command: LibraryProcessingCommand) =>
      apiSend<LibraryProcessingData>(LIBRARY_PROCESSING_URL, command),
    onSuccess: (next) => {
      forget();
      // The response is this round's fresh snapshot, just swap it into the cache; the cadence belongs to this key, so have it refetch once immediately to catch up.
      queryClient.setQueryData(LIBRARY_PROCESSING_KEY, next);
      void queryClient.invalidateQueries({ queryKey: LIBRARY_PROCESSING_KEY });
    },
  });
  // When this run finishes, have the legacy layer repaint the data management page counters: the review and candidate readings change with it.
  useEffect(() => { if (settled) onComplete?.() }, [settled, onComplete]);

  const state = job.data ?? { status: 'idle' };
  const noticeKey = state.job_id || 'unavailable';
  const { hidden } = useProcessingNoticeVisibility(noticeKey);
  const problem = start.error ? errorMessage(start.error)
    : job.isError ? (job.data ? DISCONNECTED_TEXT : errorMessage(job.error))
    : '';
  const busy = start.isPending || processingActive(state);

  const run = async (command: LibraryProcessingCommand) => {
    if (busy) return;
    start.reset();
    await start.mutateAsync(command);
  };
  const retry = () => {
    if (!state.job_id || !state.retryable_asset_ids?.length) return;
    void run({ job_id: state.job_id, retry: state.retryable_asset_ids }).catch(() => {});
  };

  if (!job.data) return job.isError
    ? <RetryNote message={errorMessage(job.error)} onRetry={() => { void job.refetch() }} />
    : <SkeletonContent pending skeletonHtml={scanCardSkeletonHtml}>{null}</SkeletonContent>;

  return (
    <div className="flex flex-col gap-4">
      <Fieldset layout="stack" label="Scan and scrape" footer={
        <>
          <LinkButton href="/sources" size="small" trailingIcon={RiArrowRightLine}>Sources and credentials</LinkButton>
          <LinkButton href="/settings/diagnostics" size="small" trailingIcon={RiArrowRightLine}>Diagnostics and logs</LinkButton>
          {state.candidates
            ? <LinkButton href="/review" size="small" trailingIcon={RiArrowRightLine}>Review details</LinkButton>
            : null}
          {/* Daily sync keeps its own entry; the original task's targeted retry handles only that task's failed items. */}
          <ProcessingActions scan libraryId={libraryId} libraryName={libraryId ? selectedLibrary.name : undefined} busy={start.isPending} occupied={processingActive(state)} metadataOnly={state?.metadata_only}
            speedMode={state.speed_mode} pendingCount={state.new_asset_count} onRun={run} onOccupied={() => toast(busyText(state))} />
        </>
      }>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <FieldsetTitle>Scan and collect</FieldsetTitle>
              {state.new_asset_count ? <Chip variant="caption" color="blue">
                <span className="tabular-nums">{libraryId ? 'All libraries · ' : ''}{state.new_asset_count.toLocaleString()} videos to complete</span>
              </Chip> : null}
            </div>
            {hidden && (processingActive(state) || state.status === 'failed' || job.isError)
              ? <Button variant="secondary" size="small" onClick={() => setProcessingNoticeVisible(noticeKey, true)}>
                  Show progress window
                </Button> : null}
          </div>
          <p className="text-body-2-regular text-text-secondary">{SCAN_CARD_TEXT}</p>
          <div className="w-full max-w-80">
            <p id="processingLibraryLabel" className="mb-1 text-body-2-medium text-text-secondary">媒体库</p>
            <Select aria-labelledby="processingLibraryLabel" selectedKey={libraryId || 'all'} isDisabled={start.isPending || !libraries.length}
              renderValue={<LibraryLabel library={selectedLibrary} />}
              onSelectionChange={key => { if (key !== null) setLibraryId(key === 'all' ? '' : String(key)) }}>
              <SelectItem id="all" textValue="All libraries"><LibraryLabel library={ALL_LIBRARIES} /></SelectItem>
              {libraries.map(library => <SelectItem id={library.id} key={library.id} textValue={library.name}>
                <LibraryLabel library={library} />
              </SelectItem>)}
            </Select>
          </div>
          {processingActive(state) && state.library_name ? <p className="text-body-2-regular text-text-secondary">Current task library:{state.library_name}
          </p> : null}
          {state.status === 'paused' && !state.total
            ? <span className="self-start"><StatusLabel>Paused</StatusLabel></span>
            : processingActive(state)
            ? <ProcessingProgress state={state} />
            : null}
          {processingActive(state) ? <p className="text-body-2-regular text-text-secondary tabular-nums" data-processing-eta="">
            {remainingTime(state)}
          </p> : null}
          {processingActive(state) ? <TrafficProgress traffic={state.traffic} /> : null}
          {processingActive(state) ? <ProcessingControls state={state} /> : null}
        </div>
      </Fieldset>
      <Outcome state={state} problem={problem} settled={settled} onRetry={retry} toast={toast} />
    </div>
  );
}
