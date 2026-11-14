import { useMemo, useState } from 'react';

import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Switch } from '@/components/base/switch/switch';

import { apiGet, apiSend } from '../../api';
import { CodeBlock } from '../components/code-block';
import { StatusLabel, type StatusTone } from '../components/status-label';
import { Disclosure, ErrorText, Fact, FactList, Footer, Help, Rows, Stack } from './section';
import { busyProps, useAction } from './use-action';

export interface LibrarySharingState {
  enabled: boolean; available: boolean; schema: number; fields: string[]; notice: string;
  last_sent_at?: string | null;
  last_attempt?: { period?: string; status?: string; reason?: string; attempted?: boolean };
  consent_state?: 'enabled' | 'disabled' | 'needs-consent' | 'not-selected';
  participation?: { status: string; pending_state?: 'enabled' | 'disabled' | null;
    state?: 'enabled' | 'disabled'; last_seen?: string; reason?: string };
}
interface Preview { data: { library: unknown[]; preferences: unknown; coverage: { uncoded_items: number } }; bytes: number; token: string; schema: number }

export function LibrarySharingSettings({ initial, receipt }: {
  initial: LibrarySharingState; receipt(message: string): void;
}) {
  const [value, setValue] = useState(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const previewText = useMemo(() => preview ? JSON.stringify(preview.data, null, 2) : '', [preview]);
  const action = useAction();
  const participation = value.participation;
  const deliveryNames: Record<string, string> = {
    'not-attempted': 'Not sent yet', queued: 'Waiting to send', accepted: 'Sent',
    failed: 'Send failed', unknown: 'Results not obtained', blocked: 'Blocked',
  };
  const participationTones: Record<string, StatusTone> = {
    queued: 'progress', accepted: 'success', failed: 'error', unknown: 'warning', blocked: 'warning',
  };
  const save = (enabled: boolean) => void action.run('save', (signal) =>
    apiSend<LibrarySharingState>('/api/configuration/library-sharing', {
      enabled, schema: value.schema, consent: accepted, preview_token: preview?.token,
    }, 'POST', signal), (saved) => {
    setValue(saved); setPreview(null); setAccepted(false); setReviewing(false); receipt('Saved library and taste upload options');
  });
  const downloadPreview = () => {
    const url = URL.createObjectURL(new Blob([previewText], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'peach-library-taste-preview.json';
    document.body.append(anchor);
    try { anchor.click() } finally {
      anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  return <>
    <Rows><SettingsRow label="Upload library and taste details" description="Shares library, preference and capacity statistics weekly; preview and agree first.">
      <Switch aria-label="Upload library and taste details" isSelected={value.enabled}
        onChange={(enabled) => enabled ? setReviewing(true) : save(false)}
        {...busyProps(action.busy === 'save')} />
    </SettingsRow></Rows>
    {!value.available ? <Stack divided><span className="self-start"><StatusLabel>Upload service not configured</StatusLabel></span></Stack> : null}
    {value.consent_state === 'needs-consent' ? <Stack divided>
      <span className="self-start"><StatusLabel tone="warning">Needs re-agreement</StatusLabel></span>
      <Help>Fields updated; preview and agree again.</Help>
    </Stack> : null}
    <Stack divided><Disclosure summary="Library statistics fields and sending rules">
      <ul className="list-disc space-y-2 pl-5">{value.fields.map(field => <li key={field}><Help>{field}</Help></li>)}</ul>
      <Help>{value.notice}</Help>
    </Disclosure></Stack>
    {participation ? <Stack divided>
      <FactList><Fact term="Participation state"><StatusLabel aria-label="Participation state"
        tone={participation.pending_state ? 'progress' : participationTones[participation.status] || 'neutral'}>
        {participation.pending_state
        ? `About to send the ${participation.pending_state === 'disabled' ? 'off' : 'on'} state`
        : deliveryNames[participation.status] || 'Results not obtained'}</StatusLabel></Fact></FactList>
      {value.last_sent_at ? <Help>Last sent: {new Date(value.last_sent_at).toLocaleDateString()}</Help> : null}
    </Stack> : null}
    {value.enabled && value.last_attempt?.status === 'failed'
      ? <Stack divided><span className="self-start"><StatusLabel tone={value.last_attempt.attempted ? 'error' : 'warning'}>{value.last_attempt.attempted ? 'Upload failed' : 'Pending re-prep'}</StatusLabel></span><ErrorText>{value.last_attempt.attempted
        ? 'Library and taste uploads failed; nothing more sends this week.' : 'Library and taste uploads did not finish and will re-prepare automatically.'}</ErrorText></Stack> : null}
    {value.enabled && value.last_attempt?.status === 'waiting-data'
      ? <Stack divided><span className="self-start"><StatusLabel>Waiting for data</StatusLabel></span><Help>Waiting for library or preference data to analyze.</Help></Stack> : null}
    {value.enabled && value.last_attempt?.status === 'unknown'
      ? <Stack divided><span className="self-start"><StatusLabel tone="warning">Result not fetched</StatusLabel></span><Help>No upload result received; not sending again this week.</Help></Stack> : null}
    {preview ? <Stack divided>
      <Help>The preview includes {preview.data.library.length} works and {preview.data.coverage.uncoded_items} unnumbered summaries, about {(preview.bytes / 1024).toFixed(1)} KiB.</Help>
      <Help>The random ID deduplicates instances. State goes out once a day; after turning it off only one closing state is sent.</Help>
      <Disclosure summary="Upload data preview" defaultOpen>
        <CodeBlock code={previewText} language="json" label="Library and taste upload preview" maxCharacters={24000} />
      </Disclosure>
      {previewText.length > 24000 ? <Help>Showing the first 24,000 characters; download to view the full content.</Help> : null}
      <Button variant="secondary" onClick={downloadPreview}>Download the full preview</Button>
      {!value.enabled ? <Checkbox isSelected={accepted} onChange={setAccepted}>I reviewed the upload preview and consent to uploading library and taste details</Checkbox> : null}
    </Stack> : null}
    {action.error ? <Stack divided><ErrorText>{action.error}</ErrorText></Stack> : null}
    <Footer>
      {reviewing && !value.enabled ? <Button variant="secondary" onClick={() => {
        setReviewing(false); setPreview(null); setAccepted(false);
      }}>Cancel</Button> : null}
      {participation ? <Button variant="secondary" onClick={() => void action.run('refresh',
        async signal => {
          const data = await apiGet<{ library_sharing?: LibrarySharingState }>('/api/configuration', signal);
          if (!data.library_sharing) throw new Error('Library upload state not obtained');
          return data.library_sharing;
        }, setValue)} {...busyProps(action.busy === 'refresh')}>Refresh the send state</Button> : null}
      <Button variant="secondary" onClick={() => { setReviewing(true); void action.run('preview',
        (signal) => apiGet<Preview>('/api/configuration/library-sharing/preview', signal),
        (data) => { setPreview(data); setAccepted(false) }) }}
        {...busyProps(action.busy === 'preview')}>Preview the upload contents</Button>
      {!value.enabled && preview ? <Button variant="primary" disabled={!accepted} onClick={() => save(true)}
        {...busyProps(action.busy === 'save')}>Agree and enable upload</Button> : null}
    </Footer>
  </>;
}
