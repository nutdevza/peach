import { QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { queryClient } from '../../src/react/query';
import { MediaProcessingSettings } from '../../src/react/settings/media-processing-settings';
import { click, mount, pending, settle } from './render';

notifyManager.setScheduler((notify) => notify());
afterEach(() => queryClient.clear());

it('Reads the saved mode and updates switches and receipts only after the server save completes', async () => {
  const saved = pending<{ metadata_only: boolean }>();
  const receipt = vi.fn();
  const requests: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      requests.push(JSON.parse(String(init.body)));
      return { ok: true, json: () => saved.answer };
    }
    return { ok: true, json: async () => ({ metadata_only: false }) };
  }));
  const host = await mount(<QueryClientProvider client={queryClient}><MediaProcessingSettings receipt={receipt} /></QueryClientProvider>);
  await settle();
  const control = host.querySelector<HTMLInputElement>('input[role="switch"]') || host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  expect(control).not.toBeNull();
  await click(control);
  await settle();
  expect(requests).toEqual([{ metadata_only: true }]);
  expect(receipt).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Saving');
  await saved.release({ metadata_only: true });
  await settle();
  expect(receipt).toHaveBeenCalledWith('Video preview generation disabled');
  expect(control?.checked).toBe(false);
});

it('Save failure keeps the current mode and shows a recoverable error', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: init?.method !== 'POST', status: init?.method === 'POST' ? 400 : 200,
    json: async () => init?.method === 'POST' ? { error: 'Settings could not be saved' } : { metadata_only: true },
  })));
  const receipt = vi.fn();
  const host = await mount(<QueryClientProvider client={queryClient}><MediaProcessingSettings receipt={receipt} /></QueryClientProvider>);
  await settle();
  const control = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  await click(control);
  await settle();
  expect(control?.checked).toBe(false);
  expect(host.textContent).toContain('Video previewsGenerate video previewsGenerates the nine-grid and timeline previews for local videos.Timeline previewExtract frames at the chosen interval, processing only videos on local disks.Off OffOne per 10 secondsOne per 30 secondsFrame extraction decoderUsed to generate covers, contact sheets, and timelines.Automatic (hardware first) Automatic (hardware first)Software decodeThe submission was invalid; check the input and retry.');
  expect(receipt).not.toHaveBeenCalled();
});
