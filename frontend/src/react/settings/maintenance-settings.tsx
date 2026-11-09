/* 「应用与维护」的后半段：存储空间、数据上传、运行信息、新手教程与卸载。少改的隐私开关和只读信息在后，
 * 卸载是不可逆动作，留在整组最后。 */
import { useState, type FormEvent } from 'react';
import { confirmModal } from '@peach/legacy/ui';

import { SettingsCard, SettingsRow } from '@/components/application/settings/settings-rows';
import { Button } from '@/components/base/buttons/button';
import { Select, SelectItem } from '@/components/base/select/select';
import { Switch } from '@/components/base/switch/switch';

import { apiSend } from '../../api';
import type {
  AutomaticUpdateState, ConfigurationFact, ConfigurationGroupProps, ConfigurationProps, UninstallState,
} from '../bundle';
import { PathLine } from '../components/path-line';
import { groupRoot } from './configuration-panel';
import { LedgerBackupSettings } from './ledger-backup-settings';
import { LibrarySharingSettings } from './library-sharing-settings';
import { RemoteReportingSettings } from './remote-reporting-settings';
import { Disclosure, ErrorText, ExternalLink, Fact, FactList, Footer, Help, Rows, Section, Stack } from './section';
import { StorageSettings } from './storage-settings';
import { busyProps, useAction } from './use-action';

const INTERVALS = [['6', 'Every 6 hours'], ['24', 'Daily'], ['168', 'Weekly']] as const;

export function MaintenanceSettings(
  { data, receipt, reopenTutorial, panel }: ConfigurationGroupProps & Pick<ConfigurationProps, 'reopenTutorial'>,
) {
  return (
    <div {...groupRoot(panel)}>
      {data.storage ? <StorageSettings initial={data.storage} receipt={receipt} /> : null}
      {data.storage ? <LedgerBackupSettings receipt={receipt} /> : null}
      {data.remote_reporting || data.library_sharing ? <Section id="librarySharing" guide="reporting" title="Data uploads">
        {data.remote_reporting ? <RemoteReportingSettings initial={data.remote_reporting} receipt={receipt} /> : null}
        {data.library_sharing ? <div className="border-t border-separator-border">
          <LibrarySharingSettings initial={data.library_sharing} receipt={receipt} />
        </div> : null}
      </Section> : null}
      <Facts facts={data.facts} receipt={receipt} />
      <TutorialSettings receipt={receipt} reopenTutorial={reopenTutorial} />
      {data.uninstall ? <UninstallSettings uninstall={data.uninstall} receipt={receipt} /> : null}
    </div>
  );
}

/** Restore the ledger's shared tutorial entry, keeping first-run setup and chapter progress. */
export function TutorialSettings({ reopenTutorial }: ConfigurationProps) {
  return (
    <section aria-label="Guided tour" className="w-full"><SettingsCard>
      <Rows><SettingsRow label="Guided tour" description="Brings the tour entry back to the top bar on every device and keeps your reading progress">
        <Button variant="secondary" onClick={() => void reopenTutorial()}>Reopen</Button>
      </SettingsRow></Rows>
    </SettingsCard></section>
  );
}

export function AutomaticUpdates({ initial, receipt }: { initial: AutomaticUpdateState; receipt(message: string): void }) {
  const [mode, setMode] = useState(initial.mode);
  const [hours, setHours] = useState(initial.interval_hours);
  const action = useAction(initial.error);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!initial.available) return;
    void action.run('save', (signal) => apiSend<AutomaticUpdateState>('/api/configuration/automatic-updates',
      { mode, interval_hours: hours }, 'POST', signal), () => receipt('Configuration saved'));
  };

  const help = !initial.available
    ? 'Auto-update needs the tray-managed service.'
    : initial.download_available
      ? 'After downloading, confirm the restart install here.'
      : undefined;
  return (
    <Section id="automaticUpdates" guide="automatic-updates" title="Auto-update" onSubmit={submit}>
      <Rows>
        <SettingsRow label="Automatically check for new versions">
          <Switch aria-label="Automatically check for new versions" isSelected={mode !== 'off'} isDisabled={!initial.available}
            onChange={(on) => setMode(on ? 'check' : 'off')} />
        </SettingsRow>
        <SettingsRow label="Download updates automatically" description="After finding a new version, it downloads first and asks before installing on the next restart.">
          <Switch aria-label="Download updates automatically" isSelected={mode === 'download'}
            isDisabled={!initial.available || !initial.download_available || mode === 'off'}
            onChange={(on) => setMode(on ? 'download' : 'check')} />
        </SettingsRow>
        <SettingsRow label="Check frequency" description={help}>
          <Select aria-label="Check frequency" selectedKey={String(hours)} isDisabled={!initial.available}
            onSelectionChange={(key) => { if (key !== null) setHours(Number(key)); }}>
            {INTERVALS.map(([key, name]) => <SelectItem key={key} id={key}>{name}</SelectItem>)}
          </Select>
        </SettingsRow>
      </Rows>
      {action.error ? <Stack divided><ErrorText>{action.error}</ErrorText></Stack> : null}
      <Footer>
        <Button type="submit" disabled={!initial.available} {...busyProps(action.busy === 'save')}>Save configuration</Button>
      </Footer>
    </Section>
  );
}

/* 缺的媒体工具在能装的平台上带「安装」：下载、校验、解压都在那一次请求里做完，回来的运行信息整块
 * 替换，刚装好的那一行直接写着版本。其余平台没有发布的工具包，仍是官方下载外链。 */
function Facts({ facts: loaded, receipt }: { facts: ConfigurationFact[]; receipt(message: string): void }) {
  const [installed, setInstalled] = useState<ConfigurationFact[] | null>(null);
  const facts = installed ?? loaded;
  const action = useAction();
  const install = (tool: string) => void action.run(tool, (signal) => apiSend<{ message: string; facts: ConfigurationFact[] }>(
    '/api/configuration/media-tools', { tool }, 'POST', signal), (result) => {
    setInstalled(result.facts);
    receipt(result.message);
  });
  return (
    <Section guide="facts" title="Runtime info">
      <FactList>
        {facts.map(({ term, value, install_tool: tool, download_url: url, download_label: label }) => (
          <Fact key={term} term={term}>
            {/* 「安装」钉在说明右边：说明在自己那一栏里折行，按钮不被挤到下一行。 */}
            {tool ? <span className="flex min-w-0 items-center gap-3">
              <span className="min-w-0">{value}</span>
              <Button size="small" className="shrink-0" onClick={() => install(tool)}
                {...busyProps(action.busy === tool)}>Install</Button>
            </span> : <>
              {value}
              {url ? <ExternalLink href={url}>{label}</ExternalLink> : null}
            </>}
          </Fact>
        ))}
      </FactList>
      {action.error ? <ErrorText>{action.error}</ErrorText> : null}
    </Section>
  );
}

export function UninstallSettings(
  { uninstall, receipt }: { uninstall: UninstallState; receipt(message: string): void },
) {
  const [removeData, setRemoveData] = useState(false);
  const [accepted, setAccepted] = useState('');
  const remove = () => void confirmModal({
    title: 'Uninstall Peach',
    danger: true,
    body: removeData
      ? 'This quits Peach and removes the program, autostart, desktop icons, settings, the local database, watch history, credentials, and caches. Original media files are kept.'
      : 'Will quit Peach and remove the program, launch at startup and desktop icons. Settings, local database, watch history and cache are kept.',
    confirmLabel: 'Uninstall Peach',
    onConfirm: async () => {
      const result = await apiSend<{ message: string }>('/api/configuration/uninstall', { delete_data: removeData, confirmation: 'Uninstall Peach' });
      setAccepted(result.message);
    },
  });
  // The bottom bar's left line says what this button means right now: the reasons uninstall is blocked (source install, an update still running) and what pressing it
  // The later receipts all answer 'can this button be pressed right now'; placed at the end of the body, they can only be found after reading the whole explanation.
  const status = accepted || uninstall.message;
  const paths = [...new Set([uninstall.data_root, ...uninstall.directories])];
  return (
    <Section id="uninstallPeach" guide="uninstall" title="Uninstall Peach">
      {uninstall.available ? <Stack><Help>Uninstalling removes the Peach program itself; original media files are kept.</Help></Stack> : null}
      <Rows>
        <SettingsRow label="Full uninstall" description="Also delete settings, the local database, watch history, credentials, and caches">
          <Switch aria-label="Full uninstall" isSelected={removeData} isDisabled={!uninstall.full_available || Boolean(accepted)} onChange={setRemoveData} />
        </SettingsRow>
      </Rows>
      <Stack divided>
        <Disclosure summary="Data directory">
          {paths.map((path) => (
            <PathLine key={path} path={path} className="text-body-2-regular text-text-secondary" onRevealed={receipt} />
          ))}
        </Disclosure>
      </Stack>
      <Footer status={status ? <p role={accepted ? 'status' : undefined}>{status}</p> : null}>
        <Button variant="danger" disabled={!uninstall.available || Boolean(accepted)} onClick={remove}>Uninstall Peach</Button>
      </Footer>
    </Section>
  );
}
