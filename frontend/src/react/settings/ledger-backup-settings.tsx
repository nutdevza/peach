/* "Ledger backup": back up the current ledger immediately, or restore from a backup (ADR-0138).
 *
 * The list is every restorable backup in the two backup directories, newest first: manual backups and pre-write automatic backups share the same retention rules.
 * Both backup and restore are server-side background tasks; while in progress, status is polled every 1.5 seconds, and progress also feeds the task center.
 * Restore replaces the current ledger; the confirm dialog states this clearly; the read-only client only views the list and can't restore. */
import { useEffect, useRef, useState } from 'react';
import { confirmModal } from '@peach/legacy/ui';
import { fmtSize } from '@peach/legacy/core';

import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Button } from '@/components/base/buttons/button';

import { apiGet, apiSend } from '../../api';
import { LoadingDots } from '../components/loading-dots';
import { Progress } from '../components/progress';
import { ErrorText, Footer, Help, Rows, Section, Stack, TaskCenterLink } from './section';
import { busyProps, useAction } from './use-action';

export const LEDGER_BACKUPS_URL = '/api/configuration/ledger-backups';
const POLL_MS = 1500;

export interface LedgerBackup {
  id: string;
  name: string;
  bytes: number;
  modified_at: number;
  source: 'manual' | 'auto';
  purpose: string;
}

export interface LedgerBackupJob {
  status: 'idle' | 'running' | 'complete' | 'failed' | 'cancelled';
  stage?: string;
  done?: number;
  total?: number;
  error?: string;
  name?: string;
  saved?: string;
}

export interface LedgerBackupState {
  backups: LedgerBackup[];
  backup: LedgerBackupJob;
  restore: LedgerBackupJob;
  writer: boolean;
  writer_reason: string;
  last_restore: { state: 'interrupted' | 'failed'; outcome: string; message: string; finished_at: number } | null;
}

const when = (backup: LedgerBackup) => new Date(backup.modified_at * 1000).toLocaleString();

function describe(backup: LedgerBackup) {
  return [backup.source === 'manual' ? 'Manual' : `Auto · ${backup.purpose}`, fmtSize(backup.bytes)].join(' · ');
}

/** The one task in progress: if the page count is known, draw a progress bar; otherwise just state which step is running. */
function Running({ job, label }: { job: LedgerBackupJob; label: string }) {
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      {job.total
        ? <Progress label={label} value={job.done || 0} max={job.total} />
        : <LoadingDots label={label} />}
      <Help>{job.stage || label}</Help>
      <TaskCenterLink />
    </div>
  );
}

export function LedgerBackupSettings({ receipt }: { receipt(message: string): void }) {
  const [state, setState] = useState<LedgerBackupState | null>(null);
  const [loadError, setLoadError] = useState('');
  const action = useAction();
  const backingUp = state?.backup.status === 'running';
  const restoring = state?.restore.status === 'running';
  const running = backingUp || restoring;
  const reported = useRef({ backup: false, restore: false });

  useEffect(() => {
    const controller = new AbortController();
    apiGet<LedgerBackupState>(LEDGER_BACKUPS_URL, controller.signal)
      .then(setState, (cause) => { if (!controller.signal.aborted) setLoadError(String(cause?.message || cause)); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiGet<LedgerBackupState>(LEDGER_BACKUPS_URL, controller.signal).then(setState, () => {
        if (!controller.signal.aborted) setState((current) => current && { ...current });
      });
    }, POLL_MS);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [state]);

  // A round ends: successful receipts go through a Toast, failure reasons stay in the section. Only report the round that appears to have started on this page.
  useEffect(() => {
    if (!state) return;
    for (const key of ['backup', 'restore'] as const) {
      const job = state[key];
      if (job.status === 'running') { reported.current[key] = true; continue; }
      if (!reported.current[key]) continue;
      reported.current[key] = false;
      if (job.status !== 'complete') continue;
      receipt(key === 'backup'
        ? `Ledger backed up: ${job.name}`
        : `The ledger has been restored from backup; the pre-restore ledger is saved separately as ${job.saved}. Refresh the page to view the restored profile`);
    }
  }, [state]);

  if (!state) {
    return (
      <Section id="ledgerBackups" guide="ledger-backups" title="Ledger backup">
        <Stack>{loadError ? <ErrorText>{loadError}</ErrorText> : <LoadingDots label="Loading backup list" />}</Stack>
      </Section>
    );
  }

  const backup = () => void action.run('backup', (signal) =>
    apiSend<LedgerBackupState>(`${LEDGER_BACKUPS_URL}/backup`, {}, 'POST', signal), setState);

  const restore = (item: LedgerBackup) => void confirmModal({
    title: 'Restore ledger from backup',
    danger: true,
    body: `The backup from ${when(item)} (${describe(item)}) will replace the current ledger; metadata, watch history, and review conclusions from that point on revert to their state at backup time.`
      + 'Before replacing, save the current ledger as a backup; no new task can start during a restore.',
    confirmLabel: 'Replace current ledger',
    onConfirm: async () => {
      reported.current.restore = true;
      setState(await apiSend<LedgerBackupState>(`${LEDGER_BACKUPS_URL}/restore`, { id: item.id, confirm: true }));
    },
  });

  const failed = [state.backup, state.restore].find((job) => job.status === 'failed');
  const last = state.last_restore;
  const status = backingUp ? 'Backing up…' : restoring ? 'Restoring…'
    : state.backups.length ? `A total of ${state.backups.length} restorable backups` : 'No backup yet';
  return (
    <Section id="ledgerBackups" guide="ledger-backups" title="Ledger backup">
      <Stack>
        <Help>The ledger stores all resources, watch records, and review conclusions. Manual backups and pre-write automatic backups are kept together, retaining the most recent 5 and backups within 24 hours.</Help>
        {!state.writer ? <Help>This computer is not the ledger write client; restore is only possible on the write client:{state.writer_reason}</Help> : null}
        {backingUp ? <Running job={state.backup} label="Backup progress" /> : null}
        {restoring ? <Running job={state.restore} label="Restore progress" /> : null}
        {failed ? <ErrorText>{failed.error || 'Task not finished'}</ErrorText> : null}
        {last ? (last.outcome === 'kept' || last.outcome === 'completed'
          ? <Help>{last.message}</Help> : <ErrorText>{last.message}</ErrorText>) : null}
        {action.error ? <ErrorText>{action.error}</ErrorText> : null}
      </Stack>
      {state.backups.length
        ? <div className="border-t border-separator-border" data-ledger-backups="">
            <Rows>
              {state.backups.map((item) => (
                <SettingsRow key={item.id} label={when(item)} description={describe(item)}>
                  <Button variant="secondary" disabled={!state.writer || running}
                    onClick={() => restore(item)}>Restore</Button>
                </SettingsRow>
              ))}
            </Rows>
          </div>
        : null}
      <Footer status={<p>{status}</p>}>
        <Button disabled={running} onClick={backup}
          {...busyProps(action.busy === 'backup' || backingUp)}>Back up now</Button>
      </Footer>
    </Section>
  );
}
