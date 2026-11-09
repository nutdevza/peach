import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';
import { queryClient } from '../../src/react/query';
import { CustomSources } from '../../src/react/scraping/custom-sources';
import { click, mount, pending, settle, type } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => queryClient.clear());

it('Source disabling confirms via the server result, keeping the configuration for re-enabling', async () => {
  const row = { id: 'custom-1234567890abcdef', name: 'Example source', endpoint: 'https://example.com/{code}',
    fields: { code: 'id' }, content_types: ['censored'], enabled: true };
  const fetcher = vi.fn(async (_url, options) => ({ ok: true, status: 200,
    json: async () => ({ items: [{ ...row, enabled: options?.method === 'POST' ? false : true }] }) }));
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<QueryClientProvider client={queryClient}><CustomSources receipt={receipt} /></QueryClientProvider>);
  await settle();
  const disable = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Disabled');
  await click(disable!);
  await settle();
  expect(receipt).toHaveBeenCalledWith('Source disabled');
  expect(host.textContent).toContain('Disabled');
  const sent = JSON.parse(fetcher.mock.calls.find(([, options]) => options?.method === 'POST')?.[1].body);
  expect(sent).toMatchObject({ id: row.id, enabled: false, fields: { code: 'id' } });
});

it('After editing the configuration mid-probe, results from the old request never display', async () => {
  const row = { id: 'custom-1234567890abcdef', name: 'Example source', endpoint: 'https://example.com/{code}',
    fields: { code: 'id', title: 'title' }, content_types: ['censored'], enabled: false };
  const waiting = pending<{ ok: boolean; status: number; json(): Promise<unknown> }>();
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => options?.method === 'POST' ? waiting.answer
    : { ok: true, status: 200, json: async () => ({ items: [row] }) }));
  const host = await mount(<QueryClientProvider client={queryClient}><CustomSources receipt={() => {}} /></QueryClientProvider>);
  await settle();
  await click(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Edit'));
  const form = host.querySelector('form')!;
  const code = Array.from(form.querySelectorAll('input')).filter(input => input.type === 'text').at(-1)!;
  await type(code, 'ABW-032');
  await act(async () => { code.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) });
  await settle();
  await type(form.querySelector<HTMLInputElement>('input[placeholder="https://example.com/api/movies/{code}"]'), 'https://example.org/{code}');
  await waiting.release({ ok: true, status: 200, json: async () => ({ record: { title: 'Old request title' } }) });
  await settle();
  expect(host.querySelector('pre')).toBeNull();
  expect(host.textContent).not.toContain('Old request title');
});

it('Deleting a custom source uses the danger-styled confirm popover', async () => {
  const row = { id: 'custom-1234567890abcdef', name: 'Example source', endpoint: 'https://example.com/{code}',
    fields: { code: 'id' }, content_types: ['censored'], enabled: true };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [row] }) })));
  const modal = vi.spyOn(legacyUi, 'confirmModal').mockResolvedValue({ confirmed: false });
  const host = await mount(<QueryClientProvider client={queryClient}><CustomSources receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  await click(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Delete'));
  expect(modal.mock.calls[0]?.[0]).toMatchObject({ title: 'Delete custom sources', confirmLabel: 'Delete source', danger: true });
  modal.mockRestore();
});
