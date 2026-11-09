/* First half of "app and maintenance": version updates and auto-start on boot. Version status is looked at most, so it leads the group with the auto-update tier right behind it. */
import { useState, type FormEvent } from 'react';

import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Button } from '@/components/base/buttons/button';
import { Switch } from '@/components/base/switch/switch';

import { apiSend } from '../../api';
import type { ConfigurationGroupProps, StartupState } from '../bundle';
import { groupRoot } from './configuration-panel';
import { AutomaticUpdates } from './maintenance-settings';
import { ReleaseUpdates } from './release-updates';
import { UpgradeRepairs } from './upgrade-repairs';
import { ErrorText, Footer, Help, Rows, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

export function GeneralSettings({ data, receipt, panel }: ConfigurationGroupProps) {
  return (
    <div {...groupRoot(panel)}>
      {data.updates ? <ReleaseUpdates initial={data.updates} initialJob={data.update_job} /> : null}
      <UpgradeRepairs />
      {data.automatic_updates ? <AutomaticUpdates initial={data.automatic_updates} receipt={receipt} /> : null}
      {data.startup ? <StartupSettings startup={data.startup} receipt={receipt} /> : null}
    </div>
  );
}

export function StartupSettings({ startup, receipt }: { startup: StartupState; receipt(message: string): void }) {
  const [enabled, setEnabled] = useState(startup.enabled);
  const [silent, setSilent] = useState(startup.silent);
  const [desktop, setDesktop] = useState(startup.desktop);
  const action = useAction();
  // Desktop shortcuts exist only on Windows, and they stay put when another install's icon is already on the desktop; the backend explains both cases
  // in desktop_message, so disabled is judged by whether it has content, not by platform checks in the frontend.
  const desktopReady = startup.available && !startup.desktop_message;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!startup.available) return;
    void action.run('save', (signal) => apiSend('/api/configuration/startup', { enabled, silent, desktop }, 'POST', signal),
      () => receipt('Configuration saved'));
  };

  return (
    <Section guide="startup" title="Start at sign-in" onSubmit={submit}>
      <Rows>
        <SettingsRow label="Start Peach after sign-in">
          <Switch aria-label="Start Peach after sign-in" isSelected={enabled} isDisabled={!startup.available} onChange={setEnabled} />
        </SettingsRow>
        <SettingsRow label="Start the tray only, without opening the web app" description="Runs in the background at startup; open the page from the tray when needed.">
          <Switch aria-label="Start the tray only, without opening the web app" isSelected={silent} isDisabled={!startup.available || !enabled} onChange={setSilent} />
        </SettingsRow>
        <SettingsRow label="Create desktop shortcut" description={startup.desktop_message || undefined}>
          <Switch aria-label="Create desktop shortcut" isSelected={desktop} isDisabled={!desktopReady} onChange={setDesktop} />
        </SettingsRow>
      </Rows>
      {startup.message || action.error ? (
        <Stack divided>
          {startup.message ? <Help>{startup.message}</Help> : null}
          {action.error ? <ErrorText>{action.error}</ErrorText> : null}
        </Stack>
      ) : null}
      <Footer>
        <Button type="submit" disabled={!startup.available} {...busyProps(action.busy === 'save')}>Save configuration</Button>
      </Footer>
    </Section>
  );
}
