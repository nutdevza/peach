import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import type { ConfigurationData, ReleaseState } from '../../src/react/bundle';
import {
  AutomaticUpdates, MaintenanceSettings, TutorialSettings, UninstallSettings,
} from '../../src/react/settings/maintenance-settings';
import { ReleaseUpdates } from '../../src/react/settings/release-updates';
import { actionOrder, buttonNamed, choose, click, fetchMock, mount, section, sentBody, settle, submit, switches } from './render';

const automatic = { mode: 'off', interval_hours: 24, available: true, download_available: true };
const release: ReleaseState = {
  current_version: '0.9.0', latest_version: null, channel: 'Beta', installation: 'Standalone test package', in_app_update: true,
  state: 'unchecked', message: 'Not checked yet', release_url: 'https://github.com/peach-mitao/peach/releases',
};
const uninstall = { available: true, full_available: true, message: '', data_root: 'fixture', directories: ['fixture', 'fixture/cache'] };

it('Sections run runtime info, guided tour, uninstall; runtime info missing a dependency carries a download link', async () => {
  const data: ConfigurationData = {
    editable: true, notice: '', revision: 'r', media_dirs: [], library_count: 0, port: 9123,
    automatic_updates: automatic, updates: release, uninstall,
    facts: [
      { term: 'Editions', value: '0.7.25' },
      { term: 'FFmpeg', value: 'FFmpeg not found', download_url: 'https://ffmpeg.org/download.html', download_label: 'Download FFmpeg' },
    ],
  };
  const host = await mount(<MaintenanceSettings data={data} receipt={vi.fn()} reopenTutorial={vi.fn()} />);
  expect([...host.firstElementChild!.children].map((node) => node.getAttribute('aria-label')))
    .toEqual(['Runtime info', 'Guided tour', 'Uninstall Peach']);
  const facts = section(host, 'Runtime info')!;
  expect([...facts.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Editions', 'FFmpeg']);
  const link = facts.querySelector('a[href="https://ffmpeg.org/download.html"]');
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.textContent).toBe('Download FFmpeg');
});

it('Installable missing tools get "Install"; after installing the row is replaced with the runtime info the server returned and a receipt shows', async () => {
  const data: ConfigurationData = {
    editable: true, notice: '', revision: 'r', media_dirs: [], library_count: 0, port: 9123,
    facts: [{ term: 'untrunc', value: 'Not installed; MP4s with missing indexes cannot be repaired without it.', install_tool: 'untrunc' }],
  };
  const fetcher = fetchMock(200, { message: 'untrunc installed (9d86ec9)', facts: [{ term: 'untrunc', value: 'Installed, version 9d86ec9' }] });
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<MaintenanceSettings data={data} receipt={receipt} reopenTutorial={vi.fn()} />);
  const facts = section(host, 'Runtime info')!;
  expect(facts.querySelector('a[target="_blank"]')).toBeNull();
  await click(buttonNamed('Install', facts));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/media-tools');
  expect(sentBody(fetcher)).toEqual({ tool: 'untrunc' });
  expect(facts.querySelector('dd')?.textContent).toBe('Installed, version 9d86ec9');
  expect(buttonNamed('Install', facts)).toBeNull();
  expect(receipt).toHaveBeenCalledWith('untrunc installed (9d86ec9)');
});

describe('Auto-update', () => {
  it('The two switches constrain each other, receipts wait for server success, and turning off also saves', async () => {
    const fetcher = fetchMock(200, automatic);
    vi.stubGlobal('fetch', fetcher);
    const receipt = vi.fn();
    const host = await mount(<AutomaticUpdates initial={automatic} receipt={receipt} />);
    expect(switches(host)[1]!.disabled).toBe(true);
    await click(switches(host)[0]);
    expect(switches(host)[1]!.disabled).toBe(false);
    await click(switches(host)[1]);
    await choose(host.querySelector('[aria-haspopup="listbox"]'), 'Weekly');
    await submit(host.querySelector('form'));
    await settle();
    expect(sentBody(fetcher)).toEqual({ mode: 'download', interval_hours: 168 });
    expect(receipt).toHaveBeenCalledWith('Configuration saved');
    await click(switches(host)[0]);
    await submit(host.querySelector('form'));
    await settle();
    expect(sentBody(fetcher, 1)).toEqual({ mode: 'off', interval_hours: 168 });
    expect(receipt).toHaveBeenCalledTimes(2);
  });

  it('Running from source locks auto-download; the check frequency row has no caption; failure reasons stay in the section and success is not reported', async () => {
    vi.stubGlobal('fetch', fetchMock(400, { detail: 'Settings are saving' }));
    const receipt = vi.fn();
    const host = await mount(<AutomaticUpdates initial={{ ...automatic, mode: 'check', download_available: false }} receipt={receipt} />);
    expect(switches(host)[1]!.disabled).toBe(true);
    const interval = [...host.querySelectorAll('p')].find((p) => p.textContent === 'Check frequency');
    expect(interval?.nextElementSibling).toBeNull();
    await submit(host.querySelector('form'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('The submission was invalid; check the input and retry.');
    expect(receipt).not.toHaveBeenCalled();
  });
});

describe('Check for updates', () => {
  it('States the app update package size and when tools download separately', async () => {
    const host = await mount(<ReleaseUpdates initial={{ ...release, state: 'available', latest_version: '1.0.0',
      package_kind: 'update', asset_size: 12 * 1048576 }} />);
    expect(host.textContent).toContain('Check updatesUpdate availableCurrent version0.9.0Install methodStandalone test packageUpdate channelBetaLatest version1.0.0Download contentsApply update · 12.0 MBThe app update package reuses installed tools; missing, damaged, or changed-version tools are downloaded separately as needed.Update availableNot checked yetOfficial siteGitHubView release page\'Release notes for this version\'Check updatesDownload and install');
    expect(host.textContent).toContain('Check updatesUpdate availableCurrent version0.9.0Install methodStandalone test packageUpdate channelBetaLatest version1.0.0Download contentsApply update · 12.0 MBThe app update package reuses installed tools; missing, damaged, or changed-version tools are downloaded separately as needed.Update availableNot checked yetOfficial siteGitHubView release page\'Release notes for this version\'Check updatesDownload and install');
    expect(host.textContent).not.toContain('First install');
    expect([...host.querySelectorAll('a')].some((a) => a.textContent === 'Full installer')).toBe(false);
  });

  it('The not-yet-checked state shows only once, and the latest version stays unfetched', async () => {
    vi.stubGlobal('fetch', fetchMock(200, { state: 'idle', progress: 0 }));
    const host = await mount(<ReleaseUpdates initial={release} />);
    expect(host.textContent?.split('Not checked yet')).toHaveLength(2);
  });

  it('After refresh it continues with the prepared update, shows the restart confirmation once, and sends no restart before confirmation', async () => {
    vi.useFakeTimers();
    const modal = vi.spyOn(legacyUi, 'confirmModal');
    const fetcher = fetchMock(200, { state: 'restarting', progress: 0 });
    vi.stubGlobal('fetch', fetcher);
    const host = await mount(<ReleaseUpdates initial={release} initialJob={{ state: 'ready', progress: 100, version: '0.10.0' }} />);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(modal).toHaveBeenCalledTimes(1);
    expect(modal.mock.calls[0]?.[0]).toMatchObject({
      title: 'The update is ready', body: 'Peach 0.10.0 will be installed after restart.', confirmLabel: 'Restart now', cancelLabel: 'Later',
    });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { await modal.mock.calls[0]?.[0].onConfirm?.(); });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/configuration/update-restart']);
  });

  it('Explicit queries update, rapid clicks send once, failures can retry, and focus stays put', async () => {
    const host = await mount(<ReleaseUpdates initial={release} />);
    const updates = section(host, 'Check for updates')!;
    const check = buttonNamed('Check for updates', updates)!;
    expect(updates.textContent).toContain('Current version 0.9.0');
    const fetcher = fetchMock(200, { ...release, latest_version: '0.10.0', state: 'available', message: 'A new version is available for download.' });
    vi.stubGlobal('fetch', fetcher);
    check.focus();
    await act(async () => { check.click(); check.click(); });
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/updates');
    expect(updates.textContent).toContain('Latest version 0.10.0');
    expect(updates.querySelector('[role="status"]')?.textContent).toContain('Update available');
    expect(buttonNamed('Download and install', updates)).not.toBeNull();
    expect(actionOrder(check.parentElement)).toEqual(['Official site', 'GitHub', 'View release page', 'Release notes for this version', 'Check for updates', 'Download and install']);
    expect([...updates.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')]))
      .toEqual([
        ['Official site', 'https://peach.video/#download'],
        ['GitHub', 'https://github.com/peach-mitao/peach'],
        ['View release page', 'https://github.com/peach-mitao/peach/releases'],
      ]);
    expect(updates.textContent).not.toContain('Cannot update yet');
    expect(document.activeElement).toBe(check);
    vi.stubGlobal('fetch', fetchMock(503, { detail: 'Connection failed' }));
    await click(check);
    await settle();
    expect(updates.querySelector('[role="alert"]')?.textContent).toBe('Connection failed');
    expect(updates.textContent).not.toContain('0.10.0');
    expect(check.disabled).toBe(false);
  });

  it('The macOS standalone package has no in-app install; the download button serves the install image for this machine\'s architecture', async () => {
    const dmg = 'https://github.com/peach-mitao/peach/releases/download/v1.0.0/Peach-1.0.0-macos-arm64.dmg';
    const host = await mount(<ReleaseUpdates initial={{ ...release, in_app_update: false, state: 'available',
      latest_version: '1.0.0', message: 'A new version is available for download.', package_kind: 'installer', asset_url: dmg, asset_size: 300 * 1048576 }} />);
    const updates = section(host, 'Check for updates')!;
    expect(updates.textContent).toContain('macOS install image · 300.0 MB');
    expect(updates.textContent).toContain('Drag Peach into Applications');
    expect(buttonNamed('Download and install', updates)).toBeNull();
    const link = [...updates.querySelectorAll('a')].find((a) => a.textContent === 'Download the new version');
    expect(link?.getAttribute('href')).toBe(dmg);
  });

  it('When the Docker image has a new version it lists the two-step commands for the host machine, with no download or install button', async () => {
    const steps = [{ text: '拉取新镜像', command: 'docker compose pull' }, { text: '重建容器', command: 'docker compose up -d' }];
    const docker = { ...release, installation: 'Docker 镜像', in_app_update: false, steps };
    const host = await mount(<ReleaseUpdates initial={{ ...docker, state: 'available', latest_version: '1.0.0', message: '有新镜像可拉取。' }} />);
    const updates = section(host, 'Check for updates')!;
    expect(updates.textContent).toContain('Docker 镜像');
    const list = updates.querySelector('ol[aria-label="Update on the host machine"]');
    expect([...list!.querySelectorAll('code')].map((code) => code.textContent)).toEqual(['docker compose pull', 'docker compose up -d']);
    expect(buttonNamed('Download and install', updates)).toBeNull();
    expect([...updates.querySelectorAll('a')].some((a) => a.textContent === 'Download the new version')).toBe(false);
    const current = await mount(<ReleaseUpdates initial={{ ...docker, state: 'current', latest_version: '0.9.0', message: 'Already the latest beta.' }} />);
    expect(current.querySelector('ol[aria-label="Update on the host machine"]')).toBeNull();
  });

  it('Already up to date shows no available-update note and no install key', async () => {
    const current = await mount(<ReleaseUpdates initial={{ ...release, latest_version: '0.9.0', state: 'current', message: 'Already the latest beta.' }} />);
    expect(current.textContent).not.toContain('Update available');
    expect(current.textContent).toContain('Already the latest beta.');
    expect(buttonNamed('Download and install', current)).toBeNull();
  });
});

it('Uninstall keeps data by default; after checking full uninstall the confirmation names what will be deleted, and the dialog locks once accepted', async () => {
  const modal = vi.spyOn(legacyUi, 'confirmModal');
  const fetcher = fetchMock(200, { message: 'Peach will exit and uninstall in a few seconds.' });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<UninstallSettings uninstall={uninstall} receipt={vi.fn()} />);
  const area = host.querySelector('#uninstallPeach')!;
  expect(area.textContent).toContain('Uninstall PeachUninstalling removes the Peach program itself; original media files are kept.Full uninstallAlso delete settings, the local database, watch history, credentials, and cachesData directoryfixturefixture/cacheUninstall Peach');
  const full = area.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(full.checked).toBe(false);
  expect([...area.querySelectorAll('details p')].map(p => p.textContent)).toEqual(['fixture', 'fixture/cache']);
  // Each path carries its own open button: glancing once beats tracing each path back through the tree to see which directories get deleted.
  expect([...area.querySelectorAll('details button[aria-label="Show in Explorer"]')]).toHaveLength(2);
  await click(buttonNamed('Uninstall Peach', area));
  expect(modal.mock.calls[0]?.[0]).toMatchObject({ title: 'Uninstall Peach', danger: true, confirmLabel: 'Uninstall Peach' });
  expect(String(modal.mock.calls[0]?.[0].body)).toContain('Settings, the local database, watch history, and caches are kept');
  expect(fetcher).not.toHaveBeenCalled();
  await click(full);
  await click(buttonNamed('Uninstall Peach', area));
  const options = modal.mock.calls[1]![0];
  expect(String(options.body)).toContain('Credentials and cache');
  await act(async () => { await options.onConfirm?.(); });
  expect(sentBody(fetcher)).toEqual({ delete_data: true, confirmation: 'Uninstall Peach' });
  expect(area.querySelector('[role="status"]')?.textContent).toBe('Peach will exit and uninstall in a few seconds.');
  expect(buttonNamed('Uninstall Peach', area)?.disabled).toBe(true);
});

describe('Guided tour', () => {
  it('Opening the tour only calls the entry; it sends no write requests or operation receipts', async () => {
    const reopenTutorial = vi.fn(async () => {});
    const receipt = vi.fn();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const host = await mount(<TutorialSettings receipt={receipt} reopenTutorial={reopenTutorial} />);
    await click(buttonNamed('Reopen', host));
    expect(reopenTutorial).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(receipt).not.toHaveBeenCalled();
  });

  it('Reopening repeatedly re-enters the same tour entry', async () => {
    const receipt = vi.fn();
    const reopenTutorial = vi.fn(async () => {});
    const host = await mount(<TutorialSettings receipt={receipt} reopenTutorial={reopenTutorial} />);
    await click(buttonNamed('Reopen', host));
    await click(buttonNamed('Reopen', host));
    expect(reopenTutorial).toHaveBeenCalledTimes(2);
    expect(receipt).not.toHaveBeenCalled();
  });
});
