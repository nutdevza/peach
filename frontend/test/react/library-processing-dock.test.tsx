import { act } from 'react';
import { QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '../../src/react/query';
import { LIBRARY_PROCESSING_KEY, type LibraryProcessingData } from '../../src/react/library-processing/library-processing';
import { LibraryProcessingDock } from '../../src/react/library-processing/library-processing-dock';
import { setProcessingNoticeVisible } from '../../src/react/library-processing/processing-notice-visibility';
import { mount } from './render';

const sonner = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: sonner }));
notifyManager.setScheduler(notify => notify());
beforeEach(() => { sonner.custom.mockClear(); sonner.dismiss.mockClear() });
afterEach(() => { queryClient.clear(); localStorage.clear(); sessionStorage.clear() });

async function open(state: LibraryProcessingData) {
  queryClient.setQueryData(LIBRARY_PROCESSING_KEY, state);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => state })));
  await mount(<QueryClientProvider client={queryClient}><LibraryProcessingDock toast={vi.fn()} /></QueryClientProvider>);
}

it('Historical failures on page open stay in data management without auto-popping a task card', async () => {
  await open({ status: 'failed', job_id: 'old', issue_count: 7276,
    completed_at: Date.now() / 1000 - 4 * 86400, error: '7276 items need processing' });
  expect(sonner.custom).not.toHaveBeenCalled();
  expect(sonner.dismiss).not.toHaveBeenCalled();
});

it('No collapse is sent before task status returns; a task card that has painted collapses only when its task ends', async () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  await mount(<QueryClientProvider client={queryClient}><LibraryProcessingDock toast={vi.fn()} /></QueryClientProvider>);
  expect(sonner.dismiss).not.toHaveBeenCalled();
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { status: 'paused', job_id: 'current' }) });
  expect(sonner.custom).toHaveBeenCalled();
  expect(sonner.dismiss).not.toHaveBeenCalled();
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { status: 'complete', job_id: 'current' }) });
  expect(sonner.dismiss).toHaveBeenCalledWith('peach-library-processing');
});

it('Task failures observed this session stay visible and remain collapsed after being dismissed', async () => {
  await open({ status: 'running', job_id: 'current' });
  sonner.custom.mockClear();
  const failed = { status: 'failed', job_id: 'current', completed_at: Date.now() / 1000 - 600 };
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, failed) });
  expect(sonner.custom).toHaveBeenCalled();
  const options = sonner.custom.mock.calls.at(-1)?.[1] as { onDismiss(): void };
  await act(async () => options.onDismiss());
  sonner.custom.mockClear();
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { ...failed, issue_count: 1 }) });
  expect(sonner.custom).not.toHaveBeenCalled();
});

it('A just failed short task can still be shown', async () => {
  await open({ status: 'failed', job_id: 'fresh', completed_at: Date.now() / 1000 - 10 });
  expect(sonner.custom).toHaveBeenCalled();
});

it('Hidden running tasks keep status updates hidden, showing current progress on restore', async () => {
  await open({ status: 'running', job_id: 'hide-current', checked: 1 });
  const options = sonner.custom.mock.calls.at(-1)?.[1] as { onDismiss(): void; dismissible: boolean };
  expect(options.dismissible).toBe(false);
  await act(async () => options.onDismiss());
  sonner.custom.mockClear();
  for (const status of ['running', 'pausing', 'paused', 'running', 'failed']) {
    await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY,
      { status, job_id: 'hide-current', checked: 9 }) });
    expect(sonner.custom).not.toHaveBeenCalled();
  }
  expect(queryClient.getQueryData<LibraryProcessingData>(LIBRARY_PROCESSING_KEY)?.checked).toBe(9);
  await act(async () => setProcessingNoticeVisible('hide-current', true));
  expect(sonner.custom).toHaveBeenCalled();
});

it('On mount it reads current tasks\' hidden choices, while new tasks display normally', async () => {
  setProcessingNoticeVisible('saved', false);
  await open({ status: 'running', job_id: 'saved' });
  expect(sonner.custom).not.toHaveBeenCalled();
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { status: 'running', job_id: 'next' }) });
  expect(sonner.custom).toHaveBeenCalled();
});

it('Hidden tasks still give one completion receipt when they finish', async () => {
  const receipt = vi.fn();
  const state = { status: 'running', job_id: 'hidden-completion' };
  queryClient.setQueryData(LIBRARY_PROCESSING_KEY, state);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => state })));
  setProcessingNoticeVisible(state.job_id, false);
  await mount(<QueryClientProvider client={queryClient}><LibraryProcessingDock toast={receipt} /></QueryClientProvider>);
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { ...state, status: 'complete' }) });
  expect(receipt).toHaveBeenCalledTimes(1);
  expect(sonner.custom).not.toHaveBeenCalled();
});
