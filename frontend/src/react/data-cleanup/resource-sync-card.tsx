/* "Resource sync" on the data management page: per library record, look up the file on local disks and cloud drives, list the
 * records whose files are gone, empty folders and no-longer-referenced cache, and after confirmation clear them together
 * (ADR-0080). Stale records come in two tiers: those with personal records are marked vanished and the record stays
 * (ADR-0087), while the rest are permanently deleted and never enter trash, so the run key is the danger tier and the
 * confirmation states which tier is irreversible.
 *
 * Scan and cleanup are two background jobs, both through `useBackgroundJob`. The scan's conclusion is that job's terminal
 * state, so the results area renders the current snapshot: what the last scan found is still waiting to be cleaned. Once
 * that run has cleaned (`applied`), the readout is no longer the current state, and the results area switches to the most
 * recent cleanup receipt the server kept. */
import { confirmModal, MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';
import { fmtSize } from '@peach/legacy/core';

import { Button } from '@/components/base/buttons/button';

import { errorMessage } from '../../api';
import { RESOURCE_SYNC_TEXT } from '../../cleanup-tool-skeletons';
import { useBackgroundJob } from '../background-job';
import { Fieldset, FieldsetTitle } from '../components/fieldset';
import { Note } from '../components/note';
import { ConnectionStatus } from '../components/connection-status';
import { StatusLabel } from '../components/status-label';
import { TaskProgress } from '../components/task-progress';
import { spriteGlyph } from '../components/sprite-glyph';
import { PlainStat, plainStatClass } from '../components/stat-card';
import { queryClient } from '../query';
import { SourceMark } from '../settings/section';
import { busyProps } from '../settings/use-action';
import { TRASH_KEY } from './data-cleanup';
import {
  applyConfirmText, applyLeftovers, applyPlanText, applyText, fetchResourceApply, fetchResourceScan, hasChanges,
  purgeCount, RESOURCE_APPLY_KEY, RESOURCE_SCAN_KEY, scanLine, SOURCE_LABELS, sourceMeta, startResourceApply, startResourceScan,
  type ResourceApplyState, type ResourceScanState,
} from './resource-sync';
import { t } from '../../i18n';

const COMPARE = spriteGlyph('git-compare');
const AGAIN = spriteGlyph('rotate-cw');
const DISCONNECTED = t('cleanup:shared.reconnecting');
const APPLY_LABEL = t('cleanup:resourceSync.cleanUpDead');

/* The two result readout rows each split evenly by card count: no half-row wraps regardless of source count. When narrow they wrap like the top readout row, to two columns then one. */
const RESULT_ROW = 'inline-grid w-full grid-flow-col auto-cols-fr gap-4 max-plain-stat-pair:grid-flow-row'
  + ' max-plain-stat-pair:grid-cols-2 max-plain-stat-single:grid-cols-1';

const count = (value: number | undefined) => Number(value || 0).toLocaleString();

/** The result of one scan: a source row, one stat card per source, and one row for the three things to clean. */
function ScanResult({ scan, partial = false }: { scan: ResourceScanState; partial?: boolean }) {
  const cache = scan.cache ?? { files: 0, bytes: 0 };
  return (
    <>
      <div className={RESULT_ROW}>
        {(scan.sources ?? []).map((source) => (
          <article key={source.location} className={plainStatClass()}>
            <PlainStat label={SOURCE_LABELS[source.location] || t('cleanup:resourceSync.storageFallback')}
              mark={<SourceMark mark={MEDIA_SOURCE_ICONS[source.location] ?? 'database'} />}
              aside={<ConnectionStatus online={source.online}>{source.online ? t('cleanup:resourceSync.online') : t('cleanup:resourceSync.offline')}</ConnectionStatus>}
              figure={source.online ? t('cleanup:resourceSync.missingCount', { count: Number(source.missing || 0) }) : '—'}
              meta={source.online ? sourceMeta(source) : t('cleanup:resourceSync.skipped', { summary: sourceMeta(source) })} wrapMeta />
            {source.online && source.unreadable > 0
              ? <span className="self-start"><StatusLabel tone="warning">{count(source.unreadable)} {t('cleanup:resourceSync.unreadableDirs')}</StatusLabel></span> : null}
          </article>
        ))}
      </div>
      {!partial && <div className={RESULT_ROW}>
        <article className={plainStatClass()}>
          <PlainStat label={t('cleanup:resourceSync.toPurge')} figure={t('cleanup:resourceSync.purgeCount', { count: Number(purgeCount(scan) || 0) })} meta={t('cleanup:resourceSync.purgeHint')} />
        </article>
        <article className={plainStatClass()}>
          <PlainStat label={t('cleanup:resourceSync.toVanish')} figure={t('cleanup:resourceSync.vanishCount', { count: Number(scan.vanish || 0) })} meta={t('cleanup:resourceSync.vanishHint')} />
        </article>
        <article className={plainStatClass()}>
          <PlainStat label={t('cleanup:resourceSync.emptyDirs')} figure={t('cleanup:resourceSync.emptyDirCount', { count: Number(scan.empty || 0) })} meta={t('cleanup:resourceSync.emptyDirsHint')} />
        </article>
        <article className={plainStatClass()}>
          <PlainStat label={t('cleanup:resourceSync.cache')} figure={t('cleanup:resourceSync.cacheCount', { count: Number(cache.files || 0) })}
            meta={cache.files ? fmtSize(cache.bytes) : ''} />
        </article>
      </div>}
    </>
  );
}

export function ResourceSyncCard(
  { toast }: { toast(message: string, options?: { warning?: boolean }): void },
) {
  const apply = useBackgroundJob<ResourceApplyState, string>({
    queryKey: RESOURCE_APPLY_KEY,
    queryFn: ({ signal }) => fetchResourceApply(signal),
    start: startResourceApply,
    onFinish: (out) => {
      /* Stale records in the trash are deleted along with it: the trash stat card at the top refetches accordingly. The check request carries `applied`. */
      void queryClient.invalidateQueries({ queryKey: TRASH_KEY, exact: true });
      void queryClient.invalidateQueries({ queryKey: RESOURCE_SCAN_KEY, exact: true });
      if (out.status !== 'complete') return;
      /* What remains undeleted is what this round left behind; the deletable ones are gone: report the warning tier, write completion and the unprocessed count, and do not call it failure. */
      const { done, left } = applyLeftovers(out);
      if (left) toast(t('cleanup:resourceSync.applyLeftovers', { done: count(done), count: Number(left || 0) }), { warning: true });
      else toast(t('cleanup:resourceSync.cleaned'));
    },
  });
  const scan = useBackgroundJob<ResourceScanState>({
    queryKey: RESOURCE_SCAN_KEY,
    queryFn: ({ signal }) => fetchResourceScan(signal),
    start: startResourceScan,
    /* Another scan ran: the previous cleanup's receipt describes the old list. */
    onStarted: () => apply.dismiss(),
  });

  const state = scan.job;
  const scanning = scan.running || scan.start.isPending;
  const cleaning = apply.running || apply.start.isPending;
  const actionsReady = !!scan.job && !!apply.job;
  const scanned = state?.status === 'complete' || state?.status === 'failed';
  const label = scanning ? t('cleanup:resourceSync.scanning') : scanned ? t('cleanup:resourceSync.scanAgain') : t('cleanup:resourceSync.checkFiles');

  /* The execution step only accepts this check's candidates, each reviewed again before deleting; there is no undo after deletion. */
  const runApply = (payload: ResourceScanState) => void confirmModal({
    title: APPLY_LABEL,
    body: applyConfirmText(payload),
    confirmLabel: APPLY_LABEL,
    danger: true,
    onConfirm: () => apply.start.mutateAsync(payload.scan_id || ''),
  });

  const done = apply.outcome;
  const receipt = (out: ResourceApplyState) => {
    const partial = applyLeftovers(out).left > 0;
    return (
      <Note tone={partial ? 'warning' : 'success'} title={partial ? t('cleanup:shared.partiallyCompleted') : t('cleanup:resourceSync.cleanupResult')}>
        {applyText(out, fmtSize)}
      </Note>
    );
  };
  let progress = null;
  let result = null;
  if (done?.status === 'failed') {
    result = <Note tone="error" title={t('cleanup:resourceSync.cleanupIncomplete')}>{done.error || t('cleanup:shared.checkTaskLogFiles')}</Note>;
  } else if (done) {
    result = receipt(done);
  } else if (apply.running) {
    progress = <TaskProgress embedded label={apply.job?.message || t('cleanup:resourceSync.applying')} />;
  } else if (scan.start.isError) {
    result = <Note tone="error" title={t('cleanup:resourceSync.scanFailed')}>{errorMessage(scan.start.error)}</Note>;
  } else if (scan.query.isError && state) {
    result = <Note tone="neutral" title={t('cleanup:shared.taskStatus')}>{DISCONNECTED}</Note>;
  } else if (state?.status === 'running') {
    const line = scanLine(state);
    progress = (
      <TaskProgress embedded label={line} value={state.completed_sources} total={state.total_sources} />
    );
    if (state.sources?.length) result = <ScanResult scan={state} partial />;
  } else if (state?.status === 'failed') {
    result = <>
      {state.sources?.length ? <ScanResult scan={state} partial /> : null}
      <Note tone="error" title={t('cleanup:resourceSync.scanFailed')}>{state.error || t('cleanup:resourceSync.backgroundScanFailed')}</Note>
    </>;
  } else if (state?.status === 'complete' && state.applied) {
    result = apply.job?.status === 'complete'
      ? receipt(apply.job)
      : <Note tone="neutral" title={t('cleanup:resourceSync.cleanupResult')}>{t('cleanup:resourceSync.alreadyCleaned')}</Note>;
  } else if (state?.status === 'complete') {
    const changes = hasChanges(state);
    result = (
      <>
        <ScanResult scan={state} />
        {changes
          ? <Note tone="neutral" title={t('cleanup:resourceSync.toClean')} action={
              <Button variant="danger" disabled={!actionsReady} {...busyProps(cleaning)} onClick={() => { if (actionsReady) runApply(state) }}>
                {cleaning ? t('cleanup:resourceSync.applyingButton') : APPLY_LABEL}
              </Button>
            }>{applyPlanText(state)}</Note>
          : <p className="mr-auto text-body-regular text-notification-success-foreground">
              {t('cleanup:resourceSync.nothingToClean')}
            </p>}
      </>
    );
  }
  if (apply.start.isError && !done) {
    result = <>{result}<Note tone="error" title={t('cleanup:resourceSync.cleanupFailed')}>{errorMessage(apply.start.error)}</Note></>;
  }

  return (
    <section id="resource-sync" aria-labelledby="resource-sync-title" className="flex scroll-mt-20 flex-col gap-4">
      <Fieldset layout="split" labelledBy="resource-sync-title" footer={
        <Button data-resource-scan leadingIcon={scanned && !scanning ? AGAIN : COMPARE} disabled={!actionsReady} {...busyProps(scanning)}
          onClick={() => { if (actionsReady && !scanning) scan.start.mutate() }}>{label}</Button>
      }>
        <FieldsetTitle id="resource-sync-title" gap="small">{t('cleanup:tools.resourceSync')}</FieldsetTitle>
        {scan.query.isPending || apply.query.isPending ? <div role="status" aria-label={t('cleanup:resourceSync.statusLoading')} data-skeleton="" className="skeleton-sheen h-6 rounded-md" /> : null}
        {!scan.job && scan.query.isError ? <Note tone="error">{t('cleanup:resourceSync.scanStatusUnavailable')}</Note> : null}
        {!apply.job && apply.query.isError ? <Note tone="error">{t('cleanup:resourceSync.applyStatusUnavailable')}</Note> : null}
        <p className="max-w-190 text-body-2-regular leading-5 text-text-secondary">
          {RESOURCE_SYNC_TEXT}
        </p>
        <div aria-live="polite" className="mt-4 empty:hidden">{progress}</div>
      </Fieldset>
      <div aria-live="polite" className="flex flex-col gap-4 empty:hidden">{result}</div>
    </section>
  );
}
