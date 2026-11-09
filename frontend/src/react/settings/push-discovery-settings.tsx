/* "Push discovery": new files enter the database as they land, without waiting for the next full scan.
 *
 * One switch per channel. The local channel subscribes to filesystem events of this machine's folders; the cloud drive
 * channel waits for CloudDrive2 to push a notification to Peach, so it offers a TOML block that can be pasted whole into its
 * "config content", plus a mapping table of "cloud path prefix to media root". The periodic full scan is unaffected by this
 * page and remains the fallback for missed events.
 *
 * Address and secret are not listed as readouts: they are only useful inside that config block, and copying two places means
 * one gets missed. The block is assembled by the server (`peach.push_discovery.clouddrive_config`).
 *
 * Whether a prefix is legal and whether a root was already declared are likewise judged by the server; this page only shows
 * the reason text.
 *
 * The whole block has one row type: readouts are written into their own switch's description, the config is shown and copied
 * through the shared code block, and the prefix table comes last. Readouts and config collapse with their own switches: with
 * the cloud drive channel off, that config describes something that will not happen; with the master switch off, local
 * monitoring reads as "not running", unable to distinguish disabled from broken. */
import { useState, type FormEvent } from 'react';
import { RiDeleteBinLine } from '@remixicon/react';

import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '../components/select';
import { Switch } from '@/components/base/switch/switch';
import { StatusLabel } from '../components/status-label';

import { apiSend, errorMessage } from '../../api';
import type { PushDiscoveryPrefix, PushDiscoveryState } from '../bundle';
import { CodeBlock } from '../components/code-block';
import { Note } from '../components/note';
import { Disclosure, ErrorText, FieldLabel, Footer, Help, Rows, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

const SAVE_URL = '/api/configuration/push-discovery';
const SECRET_URL = '/api/configuration/push-discovery/secret';

export function PushDiscoveryForm({ initial, receipt }: {
  initial: PushDiscoveryState;
  receipt(message: string): void;
}) {
  const [state, setState] = useState(initial);
  const [rows, setRows] = useState<PushDiscoveryPrefix[]>(initial.prefixes);
  const [failure, setFailure] = useState('');
  const action = useAction();
  const roots = state.media_roots;
  /* The readings say what the server is running right now, so they expand and collapse with the saved switch: if they appeared the moment the switch flipped,
     the written state would still be the previous one, and "local folder watch · not running" would read as "turning it on is useless".
     What needs filling (the prefix table) follows the toggle the other way, otherwise it could only be filled after one save. */
  const [live, setLive] = useState(initial);

  const settle = (next: PushDiscoveryState, message: string) => {
    setState(next);
    setLive(next);
    setRows(next.prefixes);
    setFailure('');
    receipt(message);
  };

  const edit = (index: number, patch: Partial<PushDiscoveryPrefix>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = {
      enabled: state.enabled, watch_local: state.watch_local, cloud: state.cloud, prefixes: rows,
    };
    void action.run('save', (signal) => apiSend<PushDiscoveryState>(SAVE_URL, body, 'POST', signal),
      (next) => settle(next, 'Configuration saved'), (cause) => setFailure(errorMessage(cause)));
  };

  const rotate = () => {
    void action.run('secret', (signal) => apiSend<PushDiscoveryState>(SECRET_URL, {}, 'POST', signal),
      (next) => settle(next, 'Shared secret rotated'), (cause) => setFailure(errorMessage(cause)));
  };

  const ingested = `${live.queue.ingested} files added to library`
    + (live.queue.failed ? `, ${live.queue.failed} failed intake` : '')
    + (live.queue.pending ? `, ${live.queue.pending} more in the queue` : '');
  const watching = live.local_running
    ? `Watching ${live.local_roots.join(', ')}` : live.local_message || 'Not running';

  return (
    <Section id="pushDiscovery" guide="discovery" title="Discover new files automatically" onSubmit={submit}>
      <Stack>
        <div className="flex flex-wrap items-center gap-2"><span className="text-body-regular text-text-secondary">Watch this machine</span>
          <StatusLabel tone={!live.enabled || !live.watch_local ? 'neutral' : live.local_running ? 'progress' : 'warning'}>{!live.enabled || !live.watch_local ? 'Not enabled' : live.local_running ? 'Running' : 'Not running'}</StatusLabel></div>
      </Stack>
      <Rows>
        <SettingsRow label="Auto-intake after finding new files" description={live.enabled ? ingested : undefined}>
          <Switch aria-label="Auto-intake after finding new files" isSelected={state.enabled} isDisabled={!state.available}
            onChange={(enabled) => setState({ ...state, enabled })} />
        </SettingsRow>
        <SettingsRow label="Watch local folders" description={live.enabled && live.watch_local ? watching : undefined}>
          <Switch aria-label="Watch local folders" isSelected={state.watch_local}
            isDisabled={!state.available || !state.enabled}
            onChange={(watchLocal) => setState({ ...state, watch_local: watchLocal })} />
        </SettingsRow>
        <SettingsRow label="Receive CloudDrive2 notifications" description="When a cloud-drive directory changes, CloudDrive2 pushes the change over.">
          <Switch aria-label="Receive CloudDrive2 notifications" isSelected={state.cloud}
            isDisabled={!state.available || !state.enabled}
            onChange={(cloud) => setState({ ...state, cloud })} />
        </SettingsRow>
        {live.enabled && live.cloud ? (
          <SettingsRow label="Webhook configuration" description={live.config_toml
            ? 'Paste into CloudDrive2 "Settings → Webhooks"; membership required. Paste again after changing the key.'
            : live.origin
              ? 'No shared secret yet; it generates after saving the configuration.'
              : 'A LAN address CloudDrive2 can reach must exist before this can be generated.'}>
          </SettingsRow>
        ) : null}
      </Rows>
      {/* The reason is the last ingestion exception recorded by the server, cleared when the next file is added to library successfully; the missed file is picked up by
          the periodic full scan, so this only reports the reason and offers no retry. */}
      {live.enabled && live.queue.last_error ? (
        <Stack divided>
          <Note tone="error" title="The most recent intake failure">{live.queue.last_error}</Note>
        </Stack>
      ) : null}
      {live.enabled && live.cloud && live.config_toml ? (
        <Stack divided>
          <div className="flex flex-col gap-3">
            {/* It stays collapsed because the person copying it does not need to read it: of the thirty lines only the address and the key concern this machine,
                and both are already filled in. Expanding is for the one time someone verifies where things were pushed. */}
            <Disclosure summary="View configuration">
              <CodeBlock code={live.config_toml} language="toml" label="CloudDrive2 configuration" bounded={false} copyLabel="Copy configuration"
                onCopy={() => receipt('CloudDrive2 configuration copied')} />
              <Help>When the Windows desktop version shows "Invalid" after pasting, save this as a .toml file and put it in the
                %LOCALAPPDATA%\CloudDrive.WinUI\webhooks\ directory.</Help>
            </Disclosure>
          </div>
        </Stack>
      ) : null}
      {state.enabled && state.cloud ? (
        <Stack divided>
          <div className="flex flex-col gap-3">
            <FieldLabel>Cloud path prefix</FieldLabel>
            <div role="group" aria-label="Cloud path prefix" className="flex flex-col gap-3">
              {rows.map((row, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Input className="min-w-0 flex-1" aria-label={`Cloud path prefix ${index + 1}`}
                    placeholder="/115" autoComplete="off" maxLength={200} value={row.prefix}
                    onChange={(prefix) => edit(index, { prefix })} />
                  <Select aria-label={`Media root for prefix ${index + 1}`} prefix="Matching folders" selectedKey={row.root}
                    onSelectionChange={(key) => { if (key !== null) edit(index, { root: String(key) }); }}>
                    {roots.map((root) => <SelectItem key={root} id={root}>{root}</SelectItem>)}
                  </Select>
                  <Button variant="danger" iconOnly leadingIcon={RiDeleteBinLine} aria-label="Remove this entry"
                    onClick={() => setRows((list) => list.filter((_row, i) => i !== index))} />
                </div>
              ))}
            </div>
            <div>
              <Button variant="secondary"
                onClick={() => setRows((list) => [...list, { prefix: '', root: roots[0] ?? '' }])}>
                Add prefix
              </Button>
            </div>
          </div>
        </Stack>
      ) : null}
      {/* The save-failure reason belongs to this block and does not collapse with the prefix table: when the domain or prefix is written badly, that table may not be
          on screen at all, while what failed is the "Save configuration" button just pressed. */}
      {failure || action.error
        ? <Stack divided><ErrorText>{failure || action.error}</ErrorText></Stack> : null}
      <Footer>
        {live.enabled && live.cloud && live.config_toml ? (
          <Button variant="secondary" onClick={rotate} disabled={!state.available}
            {...busyProps(action.busy === 'secret')}>Rotate the key</Button>
        ) : null}
        <Button type="submit" disabled={!state.available} {...busyProps(action.busy === 'save')}>
          Save configuration
        </Button>
      </Footer>
    </Section>
  );
}
