import { expect, it, vi } from 'vitest';

import { UserscriptStatus, userscriptVersionSupported } from '../../src/react/settings/userscript-status';
import { useUserscriptProbe } from '../../src/react/settings/userscript-probe';
import { linkNamed, mount } from './render';

vi.mock('../../src/react/settings/userscript-probe', () => ({ useUserscriptProbe: vi.fn() }));
const release = { version: '0.8.0', minimum_version: '0.6.0', install_url: '/peach.user.js' };

async function render(version: string) {
  vi.mocked(useUserscriptProbe).mockReturnValue({
    frame: { current: null }, attempt: 0, status: { version, paired: true }, retry: vi.fn(),
  });
  return mount(<UserscriptStatus enabled release={release} />);
}

it('Scripts compatible but below the latest version get an update link and an updatable status', async () => {
  const host = await render('0.7.0');
  expect(host.textContent).toContain('Updatable');
  expect(host.textContent).toContain('Peach userscriptUpdatableUserscript v0.7.0Add browserEnabledUser script v0.8.0 can be updated.Update the userscriptDetect again');
  expect(host.textContent).not.toContain('Needs update');
  expect(linkNamed('Update the userscript', host)?.getAttribute('href')).toBe(release.install_url);
  expect(host.querySelector('[data-copy-key="userscript.available.message"]')).not.toBeNull();
});

it('Scripts below the minimum compatible version are marked as needing an update, with the minimum version shown', async () => {
  const host = await render('0.5.0');
  expect(host.textContent).toContain('Needs update');
  expect(host.textContent).toContain('Please update to v0.6.0 or later.');
  expect(linkNamed('Update the userscript', host)).not.toBeNull();
});

it.each(['0.8.0', '0.9.0'])('Version %s keeps the connection state while satisfying the current release', async (version) => {
  const host = await render(version);
  expect(host.textContent).toContain('Connected');
  expect(linkNamed('Update the userscript', host)).toBeNull();
});

it('Compatibility ranges compare per version segment', () => {
  expect(userscriptVersionSupported('0.10.0', '0.9.0')).toBe(true);
  expect(userscriptVersionSupported('0.8.0', '0.8.1')).toBe(false);
});
