import { useRef } from 'react';
import { Button } from '@/components/base/buttons/button';
import { RiPauseLine, RiPlayLine, RiStopLine } from '@remixicon/react';
import { confirmModal } from '@peach/legacy/ui';

import { apiSend } from '../../api';
import { ProcessingMode } from './processing-effort';
import { queryClient } from '../query';
import { busyProps, useAction } from '../settings/use-action';
import {
  LIBRARY_PROCESSING_KEY, LIBRARY_PROCESSING_URL, processingActive,
  type LibraryProcessingData, type ProcessingControlCommand,
} from './library-processing';

/** The control acts only on task ids in the snapshot; state is handed to all entry points once the server confirms.
 * Same action as cancel in the task center: same icon, same wording, confirm before sending. */
export function ProcessingControls({ state, disabled = false }: {
  state: LibraryProcessingData; disabled?: boolean;
}) {
  const action = useAction();
  const confirming = useRef(false);
  const active = processingActive(state);
  const stopping = state.status === 'stopping';
  const controlLabel = state.status === 'paused' ? 'Continue' : state.status === 'pausing' ? 'Pausing' : 'Paused';
  const cancelLabel = stopping ? 'Cancelling' : 'Cancel task';
  const change = (command: ProcessingControlCommand) => {
    if (disabled || action.busy) return;
    void action.run(command.action, signal =>
      apiSend<LibraryProcessingData>(LIBRARY_PROCESSING_URL, command, 'POST', signal), next => {
        queryClient.setQueryData(LIBRARY_PROCESSING_KEY, next);
        void queryClient.invalidateQueries({ queryKey: LIBRARY_PROCESSING_KEY });
      });
  };
  const cancel = () => {
    const jobId = state.job_id;
    if (!jobId || disabled || action.busy || confirming.current) return;
    confirming.current = true;
    void confirmModal({
      title: 'Cancel task “Scan and collect”',
      body: 'This will stop the remaining processing for this round. Already-registered videos, retrieved resources, and previews are preserved. This round cannot continue after cancellation; re-sync when needed.',
      confirmLabel: 'Cancel task',
      danger: true,
    }).then(({ confirmed }) => { if (confirmed) change({ action: 'cancel', job_id: jobId }) })
      .finally(() => { confirming.current = false });
  };
  return <div className="flex min-w-0 flex-col gap-2" data-processing-controls="">
    <div className="flex flex-wrap items-center gap-2">
      <ProcessingMode value={state.speed_mode || 'standard'} busy={disabled || !!action.busy || stopping}
        animate={state.status !== 'paused' && state.status !== 'pausing'}
        onChange={speed_mode => change({ action: 'set_speed', speed_mode, ...(active ? { job_id: state.job_id } : {}) })} />
      {active ? <Button size="small" variant="secondary" iconOnly
        leadingIcon={state.status === 'paused' ? RiPlayLine : RiPauseLine}
        aria-label={controlLabel} title={controlLabel}
        disabled={disabled || !state.job_id || state.status === 'pausing' || stopping}
        {...busyProps(action.busy === 'pause' || action.busy === 'resume')}
        onClick={() => {
          if (state.job_id) change({ action: state.status === 'paused' ? 'resume' : 'pause', job_id: state.job_id });
        }} /> : null}
      {active ? <Button size="small" variant="secondary" iconOnly leadingIcon={RiStopLine}
        aria-label={cancelLabel} title={cancelLabel} disabled={disabled || !state.job_id || stopping}
        {...busyProps(action.busy === 'cancel')} onClick={cancel} /> : null}
    </div>
    {action.error ? <p role="alert" className="text-caption-1-regular text-text-error-primary">{action.error}</p> : null}
  </div>;
}
