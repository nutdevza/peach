/* Background jobs: one click starts one run, the server runs it in the background, the page polls by state, and on terminal
 * state one receipt is reported.
 *
 * Two timings are fixed here so pages need not each write their own:
 * - **An old terminal state read on first screen does not masquerade as a new result.** Jobs keep running after the page
 *   closes, and the state lies around holding the last run's receipt; only when started this time, or seen running this time,
 *   does the terminal state reach `onFinish` and land in `outcome`.
 * - **On a successful start, first swap the `running` snapshot the start request returned into cache, then reread.** Only
 *   rereading would let the previous run's terminal state in cache stand in for this run's receipt until the reread returns;
 *   and when this run finishes before the reread, its result would be displaced too. */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, type QueryKey } from '@tanstack/react-query';

import { queryClient } from './query';

export interface JobState { status?: string }

/** Every two seconds while running, the same cadence as the activity page. */
export const JOB_RUNNING_POLL_MS = 2000;

export interface BackgroundJobOptions<Job extends JobState, Args, Data> {
  queryKey: QueryKey;
  queryFn: (context: { signal: AbortSignal }) => Promise<Data>;
  start: (args: Args) => Promise<Job>;
  /** When the cache holds the whole card and the task occupies one cell: which cell the task is in, and how the new snapshot is swapped in. */
  jobOf?: (data: Data) => Job | undefined;
  withJob?: (data: Data | undefined, job: Job) => Data | undefined;
  /** How often to poll while idle. Needed only where jobs may have been started from another page or a page left over from the last session; defaults to not polling. */
  idlePollMs?: number;
  onStarted?: (started: Job) => void;
  onError?: (cause: unknown) => void;
  /** The followed run has reached its terminal state; called only once. */
  onFinish?: (job: Job) => void;
}

const itself = <Job, Data>(data: Data) => data as unknown as Job;
const replaced = <Job, Data>(_data: Data | undefined, job: Job) => job as unknown as Data;

export function useBackgroundJob<Job extends JobState, Args = void, Data = Job>(
  options: BackgroundJobOptions<Job, Args, Data>,
) {
  const { queryKey, jobOf = itself<Job, Data>, withJob = replaced<Job, Data>, idlePollMs } = options;
  /** Whether this session is following a run: it was started here, or seen running during this session. */
  const [tracking, setTracking] = useState(false);
  /** The run followed to completion this session. The stale final state read on first screen does not count; it never reaches here. */
  const [outcome, setOutcome] = useState<Job | null>(null);
  /* The page recreates the callback on every render and stores it in a ref to read the latest one: putting it into effect dependencies would rerun the effect on every render. */
  const hooks = useRef(options);
  useEffect(() => { hooks.current = options });

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => hooks.current.queryFn({ signal }),
    refetchInterval: (current) => {
      const data = current.state.data;
      return data !== undefined && jobOf(data)?.status === 'running' ? JOB_RUNNING_POLL_MS : (idlePollMs ?? false);
    },
  });
  const start = useMutation({
    mutationFn: (args: Args) => hooks.current.start(args),
    onSuccess: (started) => {
      setTracking(true);
      setOutcome(null);
      hooks.current.onStarted?.(started);
      queryClient.setQueryData<Data>(queryKey, (data) => withJob(data, started));
      /* `exact`: other keys may start with the same segment, and prefix invalidation would knock them all over and refetch. */
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
    onError: (cause) => hooks.current.onError?.(cause),
  });

  const job = query.data === undefined ? undefined : jobOf(query.data);
  const running = job?.status === 'running';
  useEffect(() => {
    if (!job) return;
    if (job.status === 'running') {
      if (!tracking) setTracking(true);
      return;
    }
    if (!tracking) return;
    setTracking(false);
    setOutcome(job);
    hooks.current.onFinish?.(job);
  }, [job, tracking]);

  /** Collapse this run's results, for example the user closed the result card, or the results are fully registered. */
  const dismiss = () => setOutcome(null);

  return { query, job, running, outcome, start, dismiss };
}
