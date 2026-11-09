/* The read and state-transition judgment shared by the card and the tasks surface.
 *
 * Both read the same `queryKey`, with polling synthesized into one Query; here we additionally watch "whether this run finished in front of
 * our eyes". Tasks keep running with the page closed, and the state holds the previous run's receipt year-round: a first-screen read of a terminal state has no
 * prior state, so it is not treated as just-finished and sends no receipt. */
import { useEffect, useRef, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { LibraryProcessingProps } from '../bundle';
import {
  announceCompletion, fetchLibraryProcessing, LIBRARY_PROCESSING_KEY, pollInterval,
  processingActive, type LibraryProcessingData,
} from './library-processing';

export interface LibraryProcessingJob {
  job: UseQueryResult<LibraryProcessingData>;
  /** The run watched to completion this session. The stale final state read on first screen never gets here. */
  settled: LibraryProcessingData | null;
  /** Another run has started: the previous run's conclusions no longer stay on screen. */
  forget(): void;
}

export function useLibraryProcessingJob(
  { toast, mode, monitor }: LibraryProcessingProps,
): LibraryProcessingJob {
  const watching = mode === 'notice' || !!monitor;
  const job = useQuery({
    queryKey: LIBRARY_PROCESSING_KEY,
    queryFn: ({ signal }) => fetchLibraryProcessing(signal),
    refetchInterval: (query) => pollInterval(query.state.data, watching),
  });
  const [settled, setSettled] = useState<LibraryProcessingData | null>(null);
  const previous = useRef<string | undefined>(undefined);
  const state = job.data;
  useEffect(() => {
    if (!state) return;
    const was = previous.current;
    previous.current = state.status;
    const witnessed = !!was && ['running', 'pausing', 'paused', 'stopping'].includes(was) && !processingActive(state);
    if (witnessed) setSettled(state);
    /* The task panel must also recognize "just finished": the first-run onboarding pass usually finishes before jumping to the catalog page, so it never saw
       "running". The card only accepts the pass it watched finish. */
    if (witnessed || mode === 'notice') announceCompletion(state, toast, witnessed);
  }, [state, mode, toast]);

  return { job, settled, forget: () => setSettled(null) };
}
