/* Cloudflare Tunnel: temporary links show the random entry the service actually returned, and named tunnels show the
 * configured public hostname.
 *
 * Temporary links have no stable domain or identity layer of their own, and the server refuses to start in `open` mode.
 * Named tunnels carry one more tunnel token: it only travels to the server, the answer back is only "saved or not", and the
 * token itself is never displayed here. The mode choice only appears in the source dev environment; the standalone bundle
 * receives `named_available` as false. */
import { useEffect, useState, type FormEvent } from 'react';
import { Radio } from 'react-aria-components';

import { Button } from '@/components/base/buttons/button';
import { StatusLabel } from '../components/status-label';
import { Input } from '@/components/base/input/input';

import { ApiError, apiSend, errorMessage } from '../../api';
import type { ConfigurationData, TunnelState } from '../bundle';
import { Note } from '../components/note';
import { queryClient } from '../query';
import { SEGMENT, SEGMENTED_TRACK, SegmentedRadioGroup as RadioGroup } from '../components/segmented';
import { CONFIGURATION_KEY, fetchConfiguration } from './configuration';
import { ExternalLink, ErrorText, Footer, Help, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

/** The connection handshake runs server-side; the page re-asks at a fixed interval until it gets an entry point or a failure reason. */
const POLL_INTERVAL = 2000;

const MODES: [TunnelState['mode'], string][] = [['quick', 'Temporary link'], ['named', 'Named tunnel']];

const HELP: Record<TunnelState['mode'], string> = {
  quick: 'For temporary preview only; the address is random and changes after restart. Set an access password before starting.',
  named: 'Uses the fixed domain you bound on Cloudflare. Set an access password before starting.',
};

type FieldErrors = Partial<Record<'hostname' | 'mode', string>>;

export function TunnelSettings({ revision: initialRevision, initial, receipt }: {
  revision: string;
  initial: TunnelState;
  receipt(message: string): void;
}) {
  const [state, setState] = useState(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [mode, setMode] = useState<TunnelState['mode']>(initial.mode);
  const [hostname, setHostname] = useState(initial.hostname);
  const [token, setToken] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const action = useAction();
  const active = state.state === 'starting' || state.state === 'running';
  const named = state.named_available && mode === 'named';

  useEffect(() => {
    if (state.state !== 'starting') return undefined;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void fetchConfiguration(controller.signal)
        .then((next: ConfigurationData) => {
          if (controller.signal.aborted || !next.tunnel) return;
          // What comes back is the whole config, swapped into the page's single key: one source of truth on screen.
          queryClient.setQueryData(CONFIGURATION_KEY, next);
          setState(next.tunnel);
          setRevision(next.revision);
        })
        .catch(() => undefined);
    }, POLL_INTERVAL);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [state.state]);

  /** The toggle and save hit the same endpoint: shape and toggle state are submitted together, and the server builds the startup plan from them. */
  const send = (key: 'save' | 'toggle', enabled: boolean, done: (next: TunnelState) => void) => {
    setFields({});
    void action.run(key, (signal) => apiSend<TunnelState & { revision: string }>(
      '/api/configuration/tunnel',
      { revision, enabled, mode, hostname, token }, 'POST', signal,
    ), (next) => {
      setState(next);
      setRevision(next.revision);
      setMode(next.mode);
      setHostname(next.hostname);
      // The draft is cleared once the token is submitted: no plaintext stays on the page, and what comes back is only whether it saved.
      setToken('');
      done(next);
    }, (cause) => {
      const payload = cause instanceof ApiError
        ? cause.body as { errors?: FieldErrors; detail?: { errors?: FieldErrors } } : null;
      const errors = payload?.errors || payload?.detail?.errors;
      if (errors) setFields(errors); else action.setError(errorMessage(cause));
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send('save', active, () => receipt('Configuration saved'));
  };

  const toggle = () => send('toggle', !active, (next) => receipt(
    next.enabled ? 'Public entry point started' : 'Public entry point stopped',
  ));

  return (
    <Section id="tunnel" guide="tunnel" title="Cloudflare public entry" onSubmit={submit} aside={<StatusLabel tone={state.error ? 'error' : active ? 'progress' : 'neutral'}>
      {state.error ? 'Connection failed' : state.state === 'running' ? 'Running' : state.state === 'starting' ? 'Connecting' : 'Stopped'}</StatusLabel>}>
      <Stack>
        {state.named_available
          ? <RadioGroup aria-label="Public entry form (pick one of two)" value={mode} isDisabled={active}
              onChange={(next) => setMode(next as TunnelState['mode'])} className={SEGMENTED_TRACK}>
              {MODES.map(([value, label]) => (
                <Radio key={value} value={value} className={SEGMENT}>{label}</Radio>
              ))}
            </RadioGroup>
          : null}
        <Help>{HELP[named ? 'named' : 'quick']}</Help>
        {named ? <>
          <Input id="tunnel-hostname" label="Public hostname" autoComplete="off" maxLength={253}
            value={hostname} onChange={setHostname} isDisabled={active} validationBehavior="aria"
            isInvalid={Boolean(fields.hostname)}
            hint={fields.hostname || 'The hostname in Cloudflare Zero Trust that points at this computer.'} />
          <Input id="tunnel-token" type="password" label="Tunnel token" autoComplete="off" maxLength={2048}
            value={token} onChange={setToken} isDisabled={active} validationBehavior="aria"
            hint={state.token_set
              ? 'Saved. Leave blank to keep unchanged.'
              : 'Copy it from the tunnel details page in Cloudflare Zero Trust.'} />
        </> : null}
        {!state.available
          ? <Note tone="warning" title="Could not find cloudflared">Install the official cloudflared, or specify a path via tunnel.binary in the settings file and PEACH_CLOUDFLARED.</Note>
          : null}
        {state.state === 'running' && state.url
          ? <Note tone="info" title="Public address"><ExternalLink href={state.url}>{state.url}</ExternalLink></Note>
          : null}
        {state.state === 'starting' ? <Note tone="info" title="Connecting">Waiting for cloudflared to connect to the Cloudflare edge.</Note> : null}
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
        {action.error ? <ErrorText>{action.error}</ErrorText> : null}
      </Stack>
      <Footer>
        <Button variant={state.named_available ? 'secondary' : 'primary'} onClick={toggle} {...busyProps(action.busy === 'toggle')}>
          {active ? 'Stop the public entry' : 'Start the public entry point'}
        </Button>
        {state.named_available
          ? <Button type="submit" {...busyProps(action.busy === 'save')}>Save configuration</Button>
          : null}
      </Footer>
    </Section>
  );
}
