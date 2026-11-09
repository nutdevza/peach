/* The offline banner appears only after the server confirms it cannot reach the internet, renders into the node the shell provides, and disappears once connectivity returns. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { NETWORK_STATUS_KEY, NetworkBanner, networkPollInterval } from '../../src/react/network-banner';
import { queryClient } from '../../src/react/query';
import { mount, settle } from './render';

afterEach(() => queryClient.clear());
notifyManager.setScheduler((notify) => notify());

function answer(state: string) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ state, checked_at: 1 }) })));
}

async function render() {
  const slot = document.createElement('div');
  slot.setAttribute('data-network-banner', '');
  document.body.append(slot);
  await mount(<QueryClientProvider client={queryClient}><NetworkBanner /></QueryClientProvider>);
  await settle();
  return slot;
}

it('When the server confirms offline, the banner and proxy settings entry paint inside the shell node', async () => {
  answer('offline');
  const slot = await render();
  const banner = slot.querySelector('[data-network-offline]');
  expect(banner?.getAttribute('role')).toBe('status');
  expect(banner?.querySelector('a')?.getAttribute('href')).toBe('/settings/network#peachProxy');
});

it.each(['online', 'checking', 'unknown'])('No banner paints at %s', async (state) => {
  answer(state);
  const slot = await render();
  expect(slot.childElementCount).toBe(0);
});

it('Banner disappears after reconnecting', async () => {
  answer('offline');
  const slot = await render();
  expect(slot.querySelector('[data-network-offline]')).not.toBeNull();
  answer('online');
  await queryClient.refetchQueries({ queryKey: NETWORK_STATUS_KEY });
  await settle();
  expect(slot.childElementCount).toBe(0);
});

it('Slow down rechecks while online; the other states read at the server\'s error cadence', () => {
  expect(networkPollInterval({ state: 'online', checked_at: 1 })).toBe(120_000);
  expect(networkPollInterval({ state: 'offline', checked_at: 1 })).toBe(30_000);
  expect(networkPollInterval(undefined)).toBe(30_000);
});
