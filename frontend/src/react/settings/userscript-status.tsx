/* The userscript reports its version and the pairing state of the current address through the same-origin bridge page. */
import { Button } from '@/components/base/buttons/button';
import { cardClass } from '../components/card';
import { ConnectionStatus } from '../components/connection-status';
import { StatusLabel } from '../components/status-label';
import { ExternalLink } from './section';
import { busyProps } from './busy-props';
import { useUserscriptProbe } from './userscript-probe';

export function userscriptVersionSupported(version: string, minimumVersion: string) {
  const current = version.split('.').map(Number);
  const minimum = minimumVersion.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (current[index] !== minimum[index]) return current[index]! > minimum[index]!;
  }
  return true;
}

export function UserscriptStatus({ enabled, release }: {
  enabled: boolean; release: { version: string; minimum_version: string; install_url: string };
}) {
  const { frame, attempt, status, retry } = useUserscriptProbe();
  const installed = typeof status === 'object';
  const required = installed && !userscriptVersionSupported(status.version, release.minimum_version);
  const update = installed && !userscriptVersionSupported(status.version, release.version);
  const tone = status === 'checking' ? 'progress' : status === 'missing' ? 'neutral'
    : required || update || !status.paired ? 'warning' : 'success';
  const label = status === 'checking' ? 'Detecting' : status === 'missing' ? 'Not detected'
    : required ? 'Needs update' : update ? 'Updatable' : status.paired ? 'Connected' : 'Pending pairing';
  const copyState = status === 'checking' ? 'checking' : status === 'missing' ? 'missing'
    : required ? 'required' : update ? 'available' : status.paired ? enabled ? 'enabled' : 'disabled' : 'unpaired';
  return <>
    <iframe ref={frame} key={attempt} title="Peach userscript detection" hidden src="/integrations/peach-userscript-bridge" />
    <div aria-live="polite" data-userscript-status="" className={cardClass({ variant: 'raised', bordered: 'line', className: 'flex flex-col gap-3' })}>
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-body-medium text-text-primary">Peach userscript</span>
        <ConnectionStatus tone={tone}><span data-copy-key={`userscript.${copyState}.status`}>{label}</span></ConnectionStatus></div>
      {installed ? <p data-copy-key="userscript.installed.version" className="text-body-regular text-text-secondary">Userscript v{status.version}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-body-regular text-text-secondary">Add browser</span>
        <StatusLabel tone={enabled ? 'success' : 'neutral'}><span data-copy-key={`userscript.adding.${enabled ? 'enabled' : 'disabled'}`}>{enabled ? 'Enabled' : 'Not enabled'}</span></StatusLabel></div>
      <p data-copy-key={`userscript.${copyState}.message`} className="text-caption-1-regular text-text-secondary">{status === 'checking' ? 'Detecting the userscript in the current browser.' : status === 'missing'
        ? 'Confirm the script is enabled and updated to the latest version. On Chrome, also enable "Allow user scripts" or developer mode in the Tampermonkey extension details, and allow access to the current Peach site; refresh the page and check again.'
        : required ? `Please update to v${release.minimum_version} or later.`
        : update ? `User script v${release.version} can be updated.`
        : status.paired ? enabled ? 'Supported sites can add directly to your Peach library.' : 'With browser adding enabled, you can add to the Peach library directly on supported sites.'
        : 'Generate a token, copy the pairing info, then paste and save it in the userscript settings.'}</p>
      <div className="flex flex-wrap items-center gap-2">
        {status === 'missing' || required || update ? <ExternalLink href={release.install_url}><span data-copy-key={`userscript.${status === 'missing' ? 'install' : 'update'}.action`}>{required || update ? 'Update the userscript' : 'Install the Peach userscript'}</span></ExternalLink> : null}
        {status === 'missing' ? <ExternalLink href="https://www.tampermonkey.net/faq.php#Q209">Tampermonkey permission setup notes</ExternalLink> : null}
        <Button variant="secondary" type="button" {...busyProps(status === 'checking')}
          onClick={retry}>Detect again</Button>
      </div>
    </div>
  </>;
}
