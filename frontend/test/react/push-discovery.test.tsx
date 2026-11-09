import { expect, it, vi } from 'vitest';

import { PushDiscoveryForm } from '../../src/react/settings/push-discovery-settings';
import type { PushDiscoveryState } from '../../src/react/bundle';
import { buttonNamed, click, fetchMock, mount, settle, switches } from './render';

const TOML = '[global_params]\nbase_url = "https://192.0.2.10"\n';

const state = (patch: Partial<PushDiscoveryState> = {}): PushDiscoveryState => ({
  enabled: true, watch_local: true, cloud: true, prefixes: [{ prefix: '/115', root: 'B:\\' }],
  available: true, secret: 'tok', secret_set: true, endpoint: '/api/inbox/clouddrive',
  local_running: true, local_message: '', local_roots: ['R:\\media'],
  queue: { pending: 0, submitted: 3, ingested: 3, missing: 0, dropped: 0, timed_out: 0, failed: 0 },
  media_roots: ['B:\\', 'R:\\media'], origin: 'https://192.0.2.10', config_toml: TOML, ...patch,
});

const clipboard = () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
};

it.each(['https://192.0.2.10', 'http://192.0.2.10:38473'])(
  'The %s config block displays and copies the full server-generated configuration', async (origin) => {
  // Address and key are no longer listed as separate stats: copying two spots means missing one, and CloudDrive2 needs the whole string anyway.
  const writeText = clipboard();
  const receipt = vi.fn();
  const toml = TOML.replace('https://192.0.2.10', origin);
  const host = await mount(<PushDiscoveryForm initial={state({ origin, config_toml: toml })} receipt={receipt} />);
  // The card itself is `secondary`, so a code block at the same tier is no block at all: its background must be one step brighter to be visible.
  expect(host.querySelector('[data-code-block]')?.className).toContain('bg-background-tertiary-default');
  expect(host.querySelector('pre')?.textContent).toBe(toml);
  expect(host.textContent).not.toContain('Shared secret');
  expect(host.textContent).not.toContain('"Notification address');
  await click(buttonNamed('Copy configuration', host));
  await settle();
  expect(writeText).toHaveBeenCalledWith(toml);
  expect(receipt).toHaveBeenCalledWith('CloudDrive2 configuration copied');
});

it('Config blocks are collapsed by default; horizontal scrolling uses the site-wide overlay scrollbar', async () => {
  /* People copying it need not read it: of thirty lines only address and key relate to this machine, and both are already filled in.
     No vertical cap because this page already lives in the settings panel's scroll area; one more layer would make the wheel's landing layer
     depend on where the pointer rests. Without the overlay-style scrollbar, Windows shows a system scrollbar one column wide,
     covering the right rounded corner exactly. */
  const host = await mount(<PushDiscoveryForm initial={state()} receipt={vi.fn()} />);
  const pre = host.querySelector('pre')!;
  const fold = pre.closest('details');
  expect(fold?.open).toBe(false);
  expect(fold?.querySelector('summary')?.textContent).toContain('View configuration');
  expect(pre.className).not.toContain('max-h');
  expect(pre.dataset.overlayScrollbar).toBe('true');
  expect(pre.parentElement?.querySelector('.ovtrack')).not.toBeNull();
});

it('Without a LAN address this machine explains what generates one', async () => {
  const host = await mount(
    <PushDiscoveryForm initial={state({ origin: '', config_toml: '' })} receipt={vi.fn()} />);
  expect(host.querySelector('pre')).toBeNull();
  expect(buttonNamed('Copy configuration', host)).toBeNull();
  expect(host.textContent).toContain('"Discover new files automaticallyWatch this machineRunningAuto-intake after finding new files3 files added to libraryWatch local foldersWatching R:\\mediaReceive CloudDrive2 notificationsWhen a cloud-drive directory changes, CloudDrive2 pushes the change over.Webhook configurationA LAN address CloudDrive2 can reach must exist before this can be generated.Cloud path prefixMatching foldersB:\\ B:\\R:\\mediaAdd prefixSave configuration"');
});

it('The configuration block follows the saved switch; a flick alone does not count', async () => {
  /* If the fields collapse as soon as the switch flips, what is written is still the last saved address and key, which does not apply to
     the state now on screen, yet still looks directly copyable. */
  const host = await mount(<PushDiscoveryForm initial={state()} receipt={vi.fn()} />);
  await click(switches(host)[2]);
  expect(host.querySelector('pre')?.textContent).toBe(TOML);
});

it('After a key change the configuration block swaps to the new section', async () => {
  const next = state({ secret: 'new', config_toml: '[global_params]\nbase_url = "https://h"\n' });
  vi.stubGlobal('fetch', fetchMock(200, next));
  const host = await mount(<PushDiscoveryForm initial={state()} receipt={vi.fn()} />);
  await click(buttonNamed('Rotate the key', host));
  await settle();
  expect(host.querySelector('pre')?.textContent).toBe(next.config_toml);
});

it('When intake fails it shows the server-recorded reason and failure count, and appears not at all when nothing failed', async () => {
  const queue = { ...state().queue, failed: 2, last_error: 'database is locked' };
  const failing = await mount(<PushDiscoveryForm initial={state({ queue })} receipt={vi.fn()} />);
  const alert = failing.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain('The most recent intake failure');
  expect(alert?.textContent).toContain('database is locked');
  expect(failing.textContent).toContain('Intaked 3 files, 2 failed intake');

  const healthy = await mount(<PushDiscoveryForm initial={state()} receipt={vi.fn()} />);
  expect(healthy.querySelector('[role="alert"]')).toBeNull();
  expect(healthy.textContent).not.toContain('Failed to add to library');

  const disabled = await mount(<PushDiscoveryForm initial={state({ enabled: false, queue })} receipt={vi.fn()} />);
  expect(disabled.querySelector('[role="alert"]')).toBeNull();
});
