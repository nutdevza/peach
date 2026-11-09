import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { LibraryProcessingProps } from '../bundle';
import { errorMessage } from '../../api';
import { DISCONNECTED_TEXT, freshProcessingResult, processingActive } from './library-processing';
import { ProcessingNoticePanel } from './library-processing-notice';
import { useLibraryProcessingJob } from './use-library-processing';
import { setProcessingNoticeVisible, useProcessingNoticeVisibility } from './processing-notice-visibility';

const TASK_TOAST = 'peach-library-processing';

/** The router root keeps observing, and job popovers do not unmount on page change; ordinary receipts use the stack with its
 *  own target.
 *
 *  Only a card this rendered that is still in the stack is dismissed. Sonner's dismissal arrives in two steps: register
 *  first, then the stack marks the id for deletion the next frame. When a page just opened and job state has not returned,
 *  dismissing a nonexistent card would, if the stack's frame lands after the update that draws the job card during main-thread
 *  busyness, take the freshly appeared job card with it, and with the state unchanged it would never come back. */
export function LibraryProcessingDock({ toast: receipt }: Pick<LibraryProcessingProps, 'toast'>) {
  const { job, settled } = useLibraryProcessingJob({ toast: receipt, mode: 'notice' });
  const shown = useRef(false);
  const state = job.data;
  const key = state?.job_id || 'unavailable';
  const { hidden, requested } = useProcessingNoticeVisibility(key);
  const problem = job.isError ? state ? DISCONNECTED_TEXT : errorMessage(job.error) : '';
  useEffect(() => {
    const active = processingActive(state);
    const currentFailure = state?.status === 'failed'
      && (settled?.job_id === state.job_id || freshProcessingResult(state));
    if (hidden || (state?.archived && !problem) || (!active && !problem && !currentFailure && !(requested && state?.status === 'failed'))) {
      if (shown.current) toast.dismiss(TASK_TOAST);
      shown.current = false;
      return;
    }
    toast.custom(() => <div className="peach-react"><ProcessingNoticePanel state={state} problem={problem} measure
      onHide={() => setProcessingNoticeVisible(key, false)} /></div>, {
      id: TASK_TOAST, toasterId: 'processing', duration: Infinity, dismissible: false,
      closeButton: false, className: 'processing-task-toast',
      onDismiss: () => { setProcessingNoticeVisible(key, false); shown.current = false },
    });
    shown.current = true;
  }, [state, problem, settled, key, hidden, requested]);
  useEffect(() => () => {
    if (shown.current) toast.dismiss(TASK_TOAST);
    shown.current = false;
  }, []);
  return null;
}
