/* The JAV userscript's default download channel and dedicated token. */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { apiGet, apiSend, errorMessage } from '../../api';
import { javBrowserSkeleton, rememberShape } from '../../configuration-skeleton';
import { SourceLabel } from '../components/source-label';
import { ErrorText, FieldLabel, Footer, Help, Section, SectionSkeleton, Stack } from './section';
import { busyProps, useAction } from './use-action';
import { UserscriptStatus } from './userscript-status';

const URL = '/api/configuration/jav-browser';
interface State {
  enabled: boolean; provider: string; available: boolean; token?: string;
  active_provider?: string; problems?: string[];
  userscript: { version: string; minimum_version: string; install_url: string };
  providers: { key: string; label: string; configured: boolean; target: string }[];
}

export function JavBrowserSettings({ receipt, refreshKey }: { receipt(message: string): void; refreshKey: string }) {
  const query = useQuery({ queryKey: ['jav-browser-settings', refreshKey],
    queryFn: ({ signal }) => apiGet<State>(URL, signal), refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
  if (query.error && !query.data) return <ErrorText>{errorMessage(query.error)}</ErrorText>;
  if (query.isFetching && !query.data) return <SectionSkeleton label="Reading browser add settings" html={javBrowserSkeleton} />;
  return query.data ? <BrowserForm initial={query.data} receipt={receipt} /> : null;
}

function BrowserForm({ initial, receipt }: { initial: State; receipt(message: string): void }) {
  const [state, setState] = useState(initial);
  const [provider, setProvider] = useState(initial.provider);
  const [token, setToken] = useState('');
  const action = useAction();
  useEffect(() => {
    /* Enabled or not decides the bottom bar's keys, channel readiness decides whether that line exists: the next skeleton draws by this structure. */
    rememberShape('javBrowser', { enabled: initial.enabled,
      ready: initial.providers.some(item => item.key === initial.provider && item.configured && item.target) });
    setState(initial);
    setProvider(current => initial.providers.some(item => item.key === current) ? current : initial.provider);
    if (!initial.enabled) setToken('');
  }, [initial]);
  const save = (kind: 'enable' | 'rotate' | 'disable') => {
    void action.run(kind, signal => apiSend<State>(URL, { action: kind, provider }, 'POST', signal), result => {
      const { token: issued = '', ...settings } = result;
      setState(settings);
      setProvider(settings.provider);
      setToken(issued);
      receipt(kind === 'disable' ? 'Browser adding turned off' : 'Dedicated token generated');
    });
  };
  const ready = state.providers.some(item => item.key === provider && item.configured && item.target);
  return <Section guide="browser" title="Add JAV via browser">
    <Stack>
      <div className="flex min-w-0 flex-col gap-4">
      <UserscriptStatus enabled={state.enabled} release={state.userscript} />
      <div className="flex flex-col gap-1"><FieldLabel>Browser-added download channels</FieldLabel>
      <Select aria-label="Browser-added download channels" selectedKey={provider || null} placeholder="'No channels available yet'"
        onSelectionChange={key => { if (key !== null) setProvider(String(key)); }}
        isDisabled={!state.providers.length || Boolean(action.busy)}>
        {state.providers.map(item => <SelectItem key={item.key} id={item.key} textValue={item.label}>
          <SourceLabel source={item.key} label={item.label} />
        </SelectItem>)}
      </Select></div>
      {!ready ? <Help>Add a cloud-download-capable drive in the library and configure its account and target folder.</Help> : null}
      {state.problems?.map(problem => <Help key={problem}>{problem}</Help>)}
      {state.enabled && state.active_provider && !state.providers.some(item => item.key === state.active_provider)
        ? <Help>The enabled download channel is unavailable; choose a channel and update the token.</Help> : null}
      <Input label="Peach address" value={window.location.origin} isReadOnly autoComplete="off" />
      {token ? <>
        <Input label="Dedicated token for browser adds" type="password" value={token} isReadOnly autoComplete="new-password" />
        <div><Button variant="secondary" type="button" onClick={() => {
          void action.run('copy', async () => navigator.clipboard.writeText(JSON.stringify({
            peach_pairing: 1, base: window.location.origin, token,
          })), () => receipt('Pairing info copied'));
        }} {...busyProps(action.busy === 'copy')}>Copy the pairing info</Button></div>
        <Help>Paste the pairing info into "Peach address" in the userscript settings to fill in the address and token.</Help>
      </> : null}
      </div>
      {action.error ? <ErrorText>{action.error}</ErrorText> : null}
    </Stack>
    <Footer>
      {state.enabled ? <Button variant="secondary" type="button" disabled={Boolean(action.busy)}
        onClick={() => save('disable')}>Close browser add</Button> : null}
      <Button type="button" disabled={!state.available || !ready || Boolean(action.busy)}
        onClick={() => save(state.enabled ? 'rotate' : 'enable')}
        {...busyProps(action.busy === 'enable' || action.busy === 'rotate')}>
        {state.enabled ? 'Update channels and tokens' : 'Enable and generate a token'}
      </Button>
    </Footer>
  </Section>;
}
