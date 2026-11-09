/* 'Ledger backup': list recoverable backups and their sources; immediate backup goes into task progress; restore requires a second confirmation first, stating it will replace the current ledger;
 * the read-only side cannot restore. */
import { expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import {
  LedgerBackupSettings, type LedgerBackupJob, type LedgerBackupState,
} from '../../src/react/settings/ledger-backup-settings';
import { buttonNamed, click, mount, settle } from './render';

const idle: LedgerBackupJob = { status: 'idle' };
const listed: LedgerBackupState = {
  backups: [
    { id: 'database/ledger.pre-manual-20261104-101500.db', name: 'ledger.pre-manual-20261104-101500.db',
      bytes: 120 * 2 ** 20, modified_at: 1_793_000_000, source: 'manual', purpose: 'Manual backup' },
    { id: 'database/ledger.pre-migrate-20261103-090000.db', name: 'ledger.pre-migrate-20261103-090000.db',
      bytes: 118 * 2 ** 20, modified_at: 1_792_900_000, source: 'auto', purpose: 'Before migration' },
  ],
  backup: idle, restore: idle, writer: true, writer_reason: '', last_restore: null,
};

type Confirmation = Parameters<typeof legacyUi.confirmModal>[0];

function confirmWith(answer: boolean) {
  const seen: Confirmation[] = [];
  vi.spyOn(legacyUi, 'confirmModal').mockImplementation((async (options: Confirmation) => {
    seen.push(options);
    if (answer) await options.onConfirm?.();
    return { confirmed: answer };
  }) as typeof legacyUi.confirmModal);
  return seen;
}

/** GET returns the list, POST returns the given status by address; record each POST's address and body. */
function server(get: LedgerBackupState, posts: Record<string, LedgerBackupState> = {}) {
  const sent: [string, unknown][] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    if (method !== 'GET') sent.push([url, JSON.parse(String(init?.body))]);
    const body = method === 'GET' ? get : posts[url.split('/').pop()!] ?? get;
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetcher);
  return sent;
}

const rows = (host: HTMLElement) => [...host.querySelectorAll('[data-ledger-backups] p.text-body-2-regular')]
  .map((node) => node.textContent);

it('List restorable backups, labeling manual vs. auto and the purpose of auto backups', async () => {
  server(listed);
  const host = await mount(<LedgerBackupSettings receipt={vi.fn()} />);
  await settle();

  expect(rows(host)).toEqual(['Manual · 120 MB', 'Auto · Before migration · 118 MB']);
  expect(host.textContent).toContain('Ledger backupThe ledger stores all resources, watch records, and review conclusions. Manual backups and pre-write automatic backups are kept together, retaining the most recent 5 and backups within 24 hours.26/10/2569 14:33:20Manual · 120 MBRestore25/10/2569 10:46:40Auto · Before migration · 118 MBRestoreA total of 2 restorable backupsBack up now');
  expect([...host.querySelectorAll('button')].filter((button) => button.textContent === 'Restore')
    .every((button) => !button.disabled)).toBe(true);
});

it('Restore confirms first; the dialog states it will replace the current ledger and save a copy first; canceling sends no request', async () => {
  const seen = confirmWith(false);
  const sent = server(listed);
  const host = await mount(<LedgerBackupSettings receipt={vi.fn()} />);
  await settle();

  await click([...host.querySelectorAll('button')].filter((button) => button.textContent === 'Restore')[1]);
  await settle();
  expect(seen[0]!.danger).toBe(true);
  expect(seen[0]!.confirmLabel).toBe('Replace current ledger');
  expect(String(seen[0]!.body)).toContain('Auto · Before migration · 118 MB');
  expect(String(seen[0]!.body)).toContain('Before replacing, save the current ledger as a backup');
  expect(sent).toEqual([]);
});

it('After confirming, send the restore; while restoring disable all buttons and show progress; when done, the receipt names the separately saved file', async () => {
  confirmWith(true);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const receipt = vi.fn();
  const restoring = { ...listed, restore: { status: 'running', stage: 'Copy backup', done: 3, total: 10 } as LedgerBackupJob };
  const sent = server(listed, { restore: restoring });
  const host = await mount(<LedgerBackupSettings receipt={receipt} />);
  await settle();

  await click([...host.querySelectorAll('button')].find((button) => button.textContent === 'Restore'));
  await settle();
  expect(sent).toEqual([['/api/configuration/ledger-backups/restore',
    { id: 'database/ledger.pre-manual-20261104-101500.db', confirm: true }]]);
  const bar = host.querySelector('[role="progressbar"]')!;
  expect([bar.getAttribute('aria-label'), bar.getAttribute('aria-valuenow')]).toEqual(['Restore progress', '3']);
  expect(host.textContent).toContain('Copy backup');
  expect(buttonNamed('Back up now', host)!.disabled).toBe(true);
  expect([...host.querySelectorAll('button')].filter((button) => button.textContent === 'Restore')
    .every((button) => button.disabled)).toBe(true);

  try {
    server({ ...listed, restore: { status: 'complete', saved: 'ledger.pre-restore-20261104-102000.db' } });
    await vi.advanceTimersByTimeAsync(1600);
    await settle();
  } finally {
    vi.useRealTimers();
  }
  expect(receipt).toHaveBeenCalledWith(expect.stringContaining('ledger.pre-restore-20261104-102000.db'));
});

it('Back up now sends the request; the failure reason stays in the panel', async () => {
  const failed = { ...listed, backup: { status: 'failed', error: 'Backup failed the integrity check: page 3' } as LedgerBackupJob };
  const sent = server(listed, { backup: failed });
  const host = await mount(<LedgerBackupSettings receipt={vi.fn()} />);
  await settle();

  await click(buttonNamed('Back up now', host));
  await settle();
  expect(sent.map(([url]) => url)).toEqual(['/api/configuration/ledger-backups/backup']);
  expect(host.querySelector('[role="alert"]')!.textContent).toBe('Backup failed the integrity check: page 3');
});

it('The read-only end can view the list and back up, but not restore, with the reason stated; the handling result of the last interrupted restore displays as usual', async () => {
  server({
    ...listed, writer: false, writer_reason: 'This computer is a read-only client',
    last_restore: { state: 'interrupted', outcome: 'rolled-back', message: 'The last restore from backup was interrupted; rolled back to the pre-restore ledger', finished_at: 1 },
  });
  const host = await mount(<LedgerBackupSettings receipt={vi.fn()} />);
  await settle();

  expect(host.textContent).toContain('Ledger backupThe ledger stores all resources, watch records, and review conclusions. Manual backups and pre-write automatic backups are kept together, retaining the most recent 5 and backups within 24 hours.This computer is not the ledger write client; restore is only possible on the write client:This computer is a read-only clientThe last restore from backup was interrupted; rolled back to the pre-restore ledger26/10/2569 14:33:20Manual · 120 MBRestore25/10/2569 10:46:40Auto · Before migration · 118 MBRestoreA total of 2 restorable backupsBack up now');
  expect([...host.querySelectorAll('button')].filter((button) => button.textContent === 'Restore')
    .every((button) => button.disabled)).toBe(true);
  expect(buttonNamed('Back up now', host)!.disabled).toBe(false);
  expect(host.querySelector('[role="alert"]')!.textContent).toBe('The last restore from backup was interrupted; rolled back to the pre-restore ledger');
});
