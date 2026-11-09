/* Background job timing: when an old terminal state counts and when it does not.
 *
 * Failure modes listed first, one case each:
 * - The first screen reads the last run's terminal state and reports it as this run's receipt;
 * - Between clicking start and the reread returning, the last run's terminal state in cache stands in for this run;
 * - This run finishes before the first reread and its result is dropped;
 * - The same terminal state reported twice;
 * - When the cached thing is the whole card, swapping in the snapshot washes away the card's other fields;
 * - On a failed start, the old terminal state is taken as this run's result.
 *
 * The reread is held by a manually released `pending()`: if the fake fetch answered on the spot, the gap in between would not
 * exist and the first two could not be tested. */
import { act, type ReactElement } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { useBackgroundJob } from '../../src/react/background-job';
import { queryClient } from '../../src/react/query';
import { buttonNamed, click, mount, pending, settle } from './render';

afterEach(() => queryClient.clear());

/* Query dispatches updates via `setTimeout(0)` by default, which `settle()` cannot wait for since it only awaits microtasks; switch to immediate dispatch. */
notifyManager.setScheduler((notify) => notify());

interface Job { status: string; result?: string }
interface Card { name: string; job: Job }
type Answer<T> = T | Promise<T>;

const KEY = ['background-job-test'] as const;
const RUNNING: Job = { status: 'running' };
const STALE: Job = { status: 'complete', result: 'Last run' };

interface Hooks {
  start?: () => Promise<Job>;
  onFinish?: (job: Job) => void;
  onError?: (cause: unknown) => void;
}

const snapshot = (job: Job | undefined, outcome: Job | null, running: boolean) =>
  `job=${job ? `${job.status}:${job.result ?? ''}` : ''};`
  + `outcome=${outcome ? `${outcome.status}:${outcome.result ?? ''}` : ''};running=${running}`;

function Flat({ read, start = async () => RUNNING, onFinish, onError }: { read: () => Answer<Job> } & Hooks) {
  const task = useBackgroundJob<Job>({
    queryKey: KEY, queryFn: async () => read(), start, onFinish, onError,
  });
  return (
    <>
      <p>{snapshot(task.job, task.outcome, task.running)}</p>
      <button type="button" onClick={() => task.start.mutate()}>Start</button>
    </>
  );
}

function Nested({ read, onFinish }: { read: () => Answer<Card> } & Hooks) {
  const task = useBackgroundJob<Job, void, Card>({
    queryKey: KEY, queryFn: async () => read(), start: async () => RUNNING, onFinish,
    jobOf: (card) => card.job,
    withJob: (card, job) => card && { ...card, job },
  });
  return (
    <>
      <p>{`name=${task.query.data?.name ?? ''};${snapshot(task.job, task.outcome, task.running)}`}</p>
      <button type="button" onClick={() => task.start.mutate()}>Start</button>
    </>
  );
}

const open = async (element: ReactElement) => {
  const host = await mount(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  await settle();
  return host;
};

const reread = () => act(async () => { await queryClient.refetchQueries({ queryKey: KEY }) });

it('A prior run\'s terminal state read on the first screen sends no receipt and never becomes this run\'s result', async () => {
  const onFinish = vi.fn();
  const host = await open(<Flat read={() => STALE} onFinish={onFinish} />);
  expect(host.textContent).toContain('job=complete:Last run;outcome=;running=falseStart');
  await reread();
  expect(onFinish).not.toHaveBeenCalled();
});

it('The pass already running at first screen counts as the tracked one: it reports one receipt on completion', async () => {
  let answer: Job = RUNNING;
  const onFinish = vi.fn();
  const host = await open(<Flat read={() => answer} onFinish={onFinish} />);
  expect(host.textContent).toContain('running=true');

  answer = { status: 'complete', result: 'Named elsewhere' };
  await reread();
  await reread();
  expect(onFinish.mock.calls).toEqual([[{ status: 'complete', result: 'Named elsewhere' }]]);
  expect(host.textContent).toContain('job=complete:Named elsewhere;outcome=complete:Named elsewhere;running=falseStart');
});

it('Between pressing start and the refetch returning, the previous run\'s final state does not impersonate this one; a run finishing before the refetch is still handled', async () => {
  let answer: Answer<Job> = STALE;
  const onFinish = vi.fn();
  const host = await open(<Flat read={() => answer} onFinish={onFinish} />);
  const slow = pending<Job>();
  answer = slow.answer;
  await click(buttonNamed('Start', host));
  await settle();
  expect(onFinish).not.toHaveBeenCalled();
  expect(host.textContent).toContain('job=running:;outcome=;running=true');

  // By the time the refetch returns it has finished: a second running entry never appears in the cache.
  await slow.release({ status: 'complete', result: 'This run' });
  await settle();
  expect(onFinish.mock.calls).toEqual([[{ status: 'complete', result: 'This run' }]]);
  expect(host.textContent).toContain('job=complete:This run;outcome=complete:This run;running=falseStart');

  answer = { status: 'complete', result: 'This run' };
  await reread();
  expect(onFinish, 'The same final state is reported only once').toHaveBeenCalledTimes(1);
});

it('When the whole card is cached only the task cell swaps; other card fields persist until the refetch returns', async () => {
  let answer: Answer<Card> = { name: 'Pinned edition', job: STALE };
  const onFinish = vi.fn();
  const host = await open(<Nested read={() => answer} onFinish={onFinish} />);
  const slow = pending<Card>();
  answer = slow.answer;
  await click(buttonNamed('Start', host));
  await settle();
  expect(host.textContent).toContain('name=Pinned edition;job=running:;outcome=;running=true');
  expect(onFinish).not.toHaveBeenCalled();

  await slow.release({ name: 'Pinned edition', job: { status: 'failed', result: 'This run' } });
  await settle();
  expect(onFinish.mock.calls).toEqual([[{ status: 'failed', result: 'This run' }]]);
});

it('A rejected start goes to onError, and a stale terminal state is never treated as the result of this run', async () => {
  const onFinish = vi.fn();
  const onError = vi.fn();
  const refused = new Error('A round is already running');
  const host = await open(<Flat read={() => STALE} onFinish={onFinish} onError={onError}
    start={async () => { throw refused }} />);
  await click(buttonNamed('Start', host));
  await settle();
  expect(onError.mock.calls).toEqual([[refused]]);
  expect(onFinish).not.toHaveBeenCalled();
  expect(host.textContent).toContain('outcome=;running=false');
});
