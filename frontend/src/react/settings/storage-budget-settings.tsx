import { useEffect, useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Switch } from '@/components/base/switch/switch';
import { Input } from '@/components/base/input/input';
import { ConfigurationInput } from '../components/configuration-fields';
import { apiGet, apiSend, errorMessage } from '../../api';
import type { StoragePolicy, StorageState } from '../bundle';
import { ErrorText, Footer, Help, Rows, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

const NUMBERS = [
  ['minimum_free_gib', 'Disk reserved space', 'Left empty, 5% is kept automatically, at least 1 GiB and at most 40 GiB'],
  ['data_max_gib', 'Peach data limit', 'Over the limit it pauses scraping and repairs without affecting playback'],
  ['cache_max_gib', 'Peach cache limit', 'Playback, network media and thumbnail caches'],
] as const;

export function StorageBudgetSettings({ initial, after, receipt }: {
  initial: NonNullable<StorageState['budget']>;
  after(storage: StorageState): void;
  receipt(message: string): void;
}) {
  const [policy, setPolicy] = useState(initial.policy);
  const action = useAction(initial.error);
  const [cacheRead, setCacheRead] = useState('');
  useEffect(() => {
    if (!policy?.enabled || initial.policy?.external_cache_path) return;
    const controller = new AbortController();
    setCacheRead('Reading the CloudDrive cache directory…');
    void apiGet<{ path?: string; configured?: boolean }>('/api/configuration/storage/external-cache', controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const path = result.path;
      if (!path) {
        setCacheRead('CloudDrive not configured; the cache directory can be filled by hand');
        return;
      }
      setPolicy(current => current && !current.external_cache_path ? { ...current, external_cache_path: path } : current);
      setCacheRead('Read automatically; takes effect after saving the configuration');
    }).catch(cause => {
      if (!controller.signal.aborted) setCacheRead(`${errorMessage(cause)}; can be filled by hand.`);
    });
    return () => controller.abort();
  }, [policy?.enabled, initial.policy?.external_cache_path]);
  const update = <K extends keyof StoragePolicy>(key: K, value: StoragePolicy[K]) =>
    setPolicy(current => current ? { ...current, [key]: value } : current);
  const check = initial.last_check;
  if (!policy) return <Section title="Capacity protection"><Stack><ErrorText>{action.error || 'Capacity settings not obtained'}</ErrorText></Stack></Section>;

  return <Section id="storageBudgetSettings" title="Capacity protection" onSubmit={event => {
    event.preventDefault();
    void action.run('save', signal => apiSend<StorageState>('/api/configuration/storage/policy', policy, 'POST', signal),
      result => { setCacheRead(''); after(result); receipt('Saved capacity protection settings'); });
  }}>
    <Rows>
      <SettingsRow label="Enable capacity protection" description="Over the limit it clears old caches first; still over the limit it only pauses background tasks; playback is affected only when disk space runs low.">
        <Switch aria-label="Enable capacity protection" isSelected={policy.enabled} isDisabled={Boolean(action.busy)}
          onChange={value => update('enabled', value)} />
      </SettingsRow>
      {policy.enabled ? <>
      {NUMBERS.map(([key, label, description]) => <SettingsRow key={key} label={label} description={description}>
        <ConfigurationInput aria-label={`${label} (GiB)`} unit="GiB" inputMode="numeric" pattern="[0-9]*" size="small"
          className="w-32 shrink-0" placeholder={key === 'minimum_free_gib' ? 'Auto' : 'Any'}
          value={policy[key] ? String(policy[key]) : ''} onChange={value => update(key, Number(value))}
          isDisabled={Boolean(action.busy)} />
      </SettingsRow>)}
      <SettingsRow label="Clear caches automatically" description="Clears the playback cache and thumbnails starting from the oldest">
        <Switch aria-label="Clear caches automatically" isSelected={policy.auto_clean} isDisabled={Boolean(action.busy)}
          onChange={value => update('auto_clean', value)} />
      </SettingsRow>
      </> : null}
    </Rows>
    {policy.enabled ? <Stack divided>
        <Input label="External cache directory" hint={cacheRead || 'Reads the CloudDrive of this machine automatically; can also be filled by hand; no automatic clearing'}
          value={policy.external_cache_path} size="small" className="w-full" placeholder="Not set"
          onChange={value => update('external_cache_path', value)} isDisabled={Boolean(action.busy)} />
    </Stack> : null}
    {policy.enabled && policy.external_cache_path ? <Rows>
      <SettingsRow label="External cache limit"
        description="Over the limit it pauses repairs; left empty it only checks free disk space">
        <ConfigurationInput aria-label="External cache limit (GiB)" unit="GiB" size="small" className="w-32 shrink-0" placeholder="Unlimited"
          inputMode="numeric" pattern="[0-9]*" value={policy.external_cache_max_gib ? String(policy.external_cache_max_gib) : ''}
          onChange={value => update('external_cache_max_gib', Number(value))} isDisabled={Boolean(action.busy)} />
      </SettingsRow>
    </Rows> : null}
    <Stack divided>
      {policy.enabled ? <Help>Recommended values come once usage data exists. An empty limit means unlimited; in-flight tasks may exceed it.</Help> : null}
      {policy.enabled && check?.paused ? <ErrorText>{check.reasons.join('; ')}. After adjusting or clearing, retry repairs in the task center.</ErrorText> : null}
      {action.error ? <ErrorText>{action.error}</ErrorText> : null}
    </Stack>
    <Footer><Button type="submit" {...busyProps(action.busy === 'save')}>Save configuration</Button></Footer>
  </Section>;
}
