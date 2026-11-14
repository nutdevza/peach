/* Sources and credentials: which sites need login, whether this computer has them filled in, and where to fetch them.
 *
 * Values are never echoed back. The server reports existence only, and the field is cleared after a successful save, leaving only the field name visible; a credential sitting
 * in the browser is one more copy waiting to be dug out. */
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { confirmModal } from '@peach/legacy/ui';

import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { Input } from '@/components/base/input/input';

import { errorMessage } from '../../api';
import { rememberShape } from '../../configuration-skeleton';
import { cardClass } from '../components/card';
import { EmptyState } from '../components/empty-state';
import { Note } from '../components/note';
import { PathLine } from '../components/path-line';
import { queryClient } from '../query';
import { busyProps } from '../settings/use-action';
import { Disclosure, ErrorText, ExternalLink, Help, Section, Stack } from '../settings/section';
import {
  CREDENTIAL_STATE, credentialDone, FOLLOW_CREDENTIALS_KEY, saveCredential,
  type CredentialData, type CredentialRow,
} from './follow-manage';
import { SourceIcon } from './source-view';
import { RiKey2Line } from '@remixicon/react';

const CLEAR_BODY = 'This will clear this source\'s login credentials on this machine and in shared copies.';
const WORLD_READABLE = 'Other system users can read this credentials file. On the Mac or Linux computer running Peach, set the file permissions so only the current user can read and write it (0600).';

/** A field's current state: backfilled from shared data, saved locally before, or never filled in. */
function fieldHint(row: CredentialRow, name: string): string {
  if ((row.shared_fields || []).includes(name)) return 'From sharing; leave empty to keep as is';
  return row.fields.includes(name) ? 'Saved; leave empty to keep as is' : 'Not filled in';
}

function StateChip({ row }: { row: CredentialRow }) {
  const done = credentialDone(row);
  if (done) return <Chip variant="caption" color="lime">Configured</Chip>;
  const color = row.requirement === 'required' ? 'yellow'
    : row.requirement === 'blocked' ? 'rose' : 'neutral';
  return <Chip variant="caption" color={color}>{CREDENTIAL_STATE[row.requirement] || ''}</Chip>;
}

function CredentialForm({ row, readOnly, toast }:
{ row: CredentialRow; readOnly: boolean; toast(message: string): void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');
  const done = credentialDone(row);

  const write = useMutation({
    mutationFn: (next: Record<string, string>) => saveCredential(row.provider, next),
    onSuccess: (result, next) => {
      /* When the shared drive is absent the backend only removed the local copy, and the user must see it: he thinks it was cleaned up, then the key gets synced back
         once the drive returns. */
      if (result.note) { setProblem(result.note); return }
      setProblem('');
      setValues({});
      void queryClient.invalidateQueries({ queryKey: FOLLOW_CREDENTIALS_KEY, exact: true });
      toast(Object.keys(next).length ? 'Source credentials saved' : 'Source credentials cleared');
    },
    onError: (cause) => setProblem(errorMessage(cause)),
  });

  const save = () => {
    const filled = Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, value.trim()]).filter(([, value]) => value));
    if (!Object.keys(filled).length) { setProblem('Nothing was filled in'); return }
    write.mutate(filled);
  };

  return (
    <div className="flex flex-col gap-3">
      <Help>
        {row.why}
        {/* "Go fetch" jumps to the site's own page and leaves Peach, so it carries an external link mark. */}
        {row.where ? <> <ExternalLink href={row.where}>Get credentials</ExternalLink></> : null}
      </Help>
      {row.howto ? <Help>{row.howto}</Help> : null}
      <div className="flex w-full flex-col gap-3">
        {(row.needs || []).map((name) => (
          <Input key={name} type="password" label={name} placeholder={fieldHint(row, name)}
            autoComplete="off" spellCheck="false" isDisabled={readOnly}
            value={values[name] || ''} onChange={(value) => setValues({ ...values, [name]: value })}
            className="w-full min-w-0" />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {done ? (
          <Button variant="danger" disabled={readOnly} {...busyProps(write.isPending)}
            onClick={() => void confirmModal({
              title: 'Clear source credentials', body: CLEAR_BODY, confirmLabel: 'Clear source credentials', danger: true,
              onConfirm: () => write.mutateAsync({}),
            })}>Clear</Button>
        ) : null}
        <Button variant="primary" disabled={readOnly} {...busyProps(write.isPending)}
          onClick={save}>Save configuration</Button>
      </div>
      {problem ? <ErrorText>{problem}</ErrorText> : null}
      {(row.shared_fields || []).length
        ? <Help>{`${row.shared_fields!.join(', ')} use login information from the shared copy; this machine keeps no separate copy. Clearing deletes the login information on both this machine and the shared copy.`}</Help>
        : null}
      {row.path
        ? <Disclosure summary="Credentials file"><PathLine path={row.path} className="font-mono text-caption-1-regular text-text-tertiary" onRevealed={toast} /></Disclosure>
        : null}
    </div>
  );
}

function CredentialSection({ row, readOnly, toast }:
{ row: CredentialRow; readOnly: boolean; toast(message: string): void }) {
  const head = (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        <SourceIcon provider={row.provider} />
      </span>
      <b className="min-w-0 text-body-medium wrap-anywhere text-text-primary">{row.provider_label}</b>
      <StateChip row={row} />
      {/* One chip per missing field: two missing makes two chips, and filling one removes its chip. */}
      {row.missing.map(field => <Chip key={field} variant="caption" color="rose">{`Missing ${field}`}</Chip>)}
    </span>
  );
  if (row.requirement === 'none' || row.requirement === 'blocked') {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-separator-border px-6 py-5 last:border-b-0 max-sm:px-4">
        {head}
        {row.requirement === 'blocked' ? <Help>{row.why}</Help> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-b border-separator-border px-6 py-5 last:border-b-0 max-sm:px-4">
      {head}
      <Disclosure summary={credentialDone(row) ? 'Edit credentials' : 'Fill in credentials'}
        defaultOpen={row.requirement === 'required' && !credentialDone(row)}>
        <CredentialForm row={row} readOnly={readOnly} toast={toast} />
      </Disclosure>
      {row.world_readable ? <Note tone="error" title="The credentials file permissions are too broad">{WORLD_READABLE}</Note> : null}
    </div>
  );
}

export function Credentials(
  { data, readOnly, toast, embedded = false }:
  { data: CredentialData; readOnly: boolean; toast(message: string): void; embedded?: boolean },
) {
  const rows = data.providers || [];
  const pending = rows.filter((row) => row.requirement === 'required' && !credentialDone(row));
  /* Records which sources are configured: the settings page skeleton uses it to draw each row's badge slot and expanded state (the site list itself is a static registry). */
  useEffect(() => { rememberShape('credentials', { done: rows.filter(credentialDone).map(row => row.provider) }) }, [data]);
  if (!rows.length) {
    return <EmptyState size="compact" icon={RiKey2Line} title="No configurable sources">Connected sites and their credential states show here.</EmptyState>;
  }
  const pendingLabel = pending.length ? <span className="text-body-2-regular text-text-error-primary">{`${pending.length} ${pending.length === 1 ? 'item' : 'items'} to configure`}</span> : null;
  const groups = <>{[
        { title: 'Configurable credentials', rows: rows.filter((row) => row.requirement !== 'none' && row.requirement !== 'blocked') },
        { title: 'No credentials needed', rows: rows.filter((row) => row.requirement === 'none') },
        { title: 'Not supported yet', rows: rows.filter((row) => row.requirement === 'blocked') },
      ].filter((group) => group.rows.length).map((group) => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
          <h4 className="text-body-medium text-text-secondary">{group.title}</h4>
          <div className={cardClass({ variant: 'outlined', padding: 'none', className: 'flex flex-col overflow-hidden' })}>
            {group.rows.map((row) => (
              <CredentialSection key={row.provider} row={row} readOnly={readOnly} toast={toast} />
            ))}
          </div>
        </section>
      ))}</>;
  return embedded ? <Section guide="credentials" title="Source credentials" aside={pendingLabel || undefined}>
    <Stack><div className="flex flex-col gap-4">{groups}</div></Stack>
  </Section> :
    <div className={cardClass({ padding: 'none', className: 'flex flex-col gap-4 px-6 py-5 max-sm:px-4' })}>
      <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-title-2-medium text-text-primary">Source credentials</h3>{pendingLabel}</div>
      {groups}
    </div>;
}
