import { useState } from 'react';

import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Switch } from '@/components/base/switch/switch';
import { StatusLabel } from '../components/status-label';

import { apiSend } from '../../api';
import { Disclosure, ErrorText, Help, Rows, Stack } from './section';
import { busyProps, useAction } from './use-action';

export interface RemoteReportingState {
  usage: boolean; errors: boolean; available: boolean;
  fields: { usage: string; errors: string }; notice: string;
  delivery?: Partial<Record<'usage' | 'errors', { status: string; at?: string; last_sent_at?: string; reason?: string }>>;
}

export function ReportingChoices({ value, onChange, busy = false }: {
  value: RemoteReportingState; onChange(value: RemoteReportingState): void; busy?: boolean;
}) {
  return <>
    <Rows>
      <SettingsRow label="Send version statistics and error diagnostics (recommended)" description="Uploads version, system info, failure type, code location, and occurrence count.">
        <Switch aria-label="Send version statistics and error diagnostics (recommended)" isSelected={value.usage && value.errors}
          onChange={(enabled) => onChange({ ...value, usage: enabled, errors: enabled })} {...busyProps(busy)} />
      </SettingsRow>
    </Rows>
    {!value.available ? <Stack divided><span className="self-start"><StatusLabel>Upload service not configured</StatusLabel></span></Stack> : null}
  </>;
}

export function RemoteReportingSettings({ initial, receipt }: {
  initial: RemoteReportingState; receipt(message: string): void;
}) {
  const [value, setValue] = useState(initial);
  const action = useAction();
  const sentDates = Object.values(value.delivery ?? {}).flatMap(delivery =>
    delivery.last_sent_at ? [Date.parse(delivery.last_sent_at)] : []).filter(Number.isFinite);
  const lastSent = sentDates.length ? Math.max(...sentDates) : null;
  return <>
    <ReportingChoices value={value} busy={action.busy === 'save'} onChange={(next) => {
      void action.run('save', (signal) => apiSend<RemoteReportingState>('/api/configuration/remote-reporting',
      { usage: next.usage, errors: next.errors }, 'POST', signal), (saved) => {
      setValue(saved); receipt('Diagnostic options saved');
    });
    }} />
    <Stack divided>
      <Disclosure summary="Statistics fields and sending rules">
        <Help>{value.fields.usage}</Help>
        <Help>{value.fields.errors}</Help>
        <Help>{value.notice}</Help>
      </Disclosure>
      {lastSent !== null ? <Help>Last sent: {new Date(lastSent).toLocaleDateString()}</Help> : null}
    </Stack>
    {action.error ? <Stack divided><ErrorText>{action.error}</ErrorText></Stack> : null}
  </>;
}
