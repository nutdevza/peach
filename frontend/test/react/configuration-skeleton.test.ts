import { afterEach, describe, expect, it } from 'vitest';
import {
  CREDENTIAL_PROVIDERS, configurationContentSkeleton, credentialSkeletonRows, rememberShape, SHAPE_KEY,
} from '../../src/configuration-skeleton';
import { downloadsShape, maintenanceShape, networkShape } from '../../src/react/settings/configuration-shape';
import type { ConfigurationData } from '../../src/react/bundle';

const draw = (section: string) => {
  const root = document.createElement('div');
  root.innerHTML = configurationContentSkeleton(section);
  return root;
};
const sections = (root: ParentNode) => [...root.querySelectorAll('section[aria-label]')]
  .filter(node => !node.parentElement?.closest('section[aria-label]')).map(node => node.getAttribute('aria-label'));
const card = (root: ParentNode, name: string) => root.querySelector(`section[aria-label="${name}"]`)!;

afterEach(() => localStorage.clear());

describe('Source credentials skeleton', () => {
  it('Site rows come from static registration with real names; with no record it counts as unconfigured, and required ones expand', () => {
    const credentials = card(draw('Sources and subscriptions'), 'Source credentials');
    const names = [...credentials.querySelectorAll('b')].map(node => node.textContent);
    const configurable = CREDENTIAL_PROVIDERS.filter(row => row.requirement === 'required' || row.requirement === 'optional');
    const none = CREDENTIAL_PROVIDERS.filter(row => row.requirement === 'none');
    expect(names).toEqual([...configurable, ...none].map(row => row.label));
    expect([...credentials.querySelectorAll('h4')].map(node => node.textContent)).toEqual(['Configurable credentials', 'No credentials needed']);
    const required = CREDENTIAL_PROVIDERS.filter(row => row.requirement === 'required');
    expect(credentialSkeletonRows().filter(row => row.open).map(row => row.provider)).toEqual(required.map(row => row.provider));
    // The expanded rows each render the fields they need filled.
    const fields = [...credentials.querySelectorAll('span.text-body-medium')].map(node => node.textContent);
    for (const row of required) expect(fields).toEqual(expect.arrayContaining(row.fields!));
  });

  it('Sources noted configured last time collapse, with the rest archiving as registered', () => {
    const [first] = CREDENTIAL_PROVIDERS.filter(row => row.requirement === 'required');
    rememberShape('credentials', { done: [first!.provider] });
    const rows = credentialSkeletonRows();
    expect(rows.find(row => row.provider === first!.provider)).toMatchObject({ done: true, open: false });
    expect(rows.map(row => row.provider)).toEqual(CREDENTIAL_PROVIDERS.map(row => row.provider));
  });
});

describe('Configuration-dependent sections paint by the last recorded structure', () => {
  it('Resource search: no indexer row when there are no records; with records it follows the count and expanded state', () => {
    const empty = card(draw('Sources and subscriptions'), 'Resource search');
    expect(empty.querySelectorAll('.border-t.pt-2')).toHaveLength(0);
    expect([...empty.querySelectorAll('button')].map(key => [key.textContent, key.disabled])).toEqual([['Add indexer', true], ['Save configuration', true]]);
    rememberShape('indexers', { open: [true, false, false] });
    const recorded = card(draw('Sources and subscriptions'), 'Resource search');
    expect(recorded.querySelectorAll('.border-t.pt-2')).toHaveLength(3);
    expect([...recorded.querySelectorAll('span.text-body-medium')].map(node => node.textContent)).toEqual(['Name', 'Torznab address', 'API key']);
  });

  it('Libraries: one folder per library when there are no records, otherwise the count follows each library\'s folder count', () => {
    const first = card(draw('Library and imports'), 'Library and catalog');
    expect(first.querySelectorAll('[data-library-block]')).toHaveLength(1);
    expect(first.querySelectorAll('[data-folder-row]')).toHaveLength(1);
    rememberShape('media', { folders: [3, 1], cloud: true });
    const root = draw('Library and imports');
    expect([...card(root, 'Library and catalog').querySelectorAll('[data-library-block]')].map(block => block.querySelectorAll('[data-folder-row]').length)).toEqual([3, 1]);
    expect(sections(root)).toEqual(['Library and catalog', 'CloudDrive proxy', 'Auto-discover new files', 'Code detection rules', 'Video previews']);
  });

  it('Download channels: with no records only browser add appears; with records, cloud download and PikPak render per cloud drive', () => {
    expect(sections(draw('Download channels'))).toEqual(['Add JAV via browser']);
    rememberShape('downloads', { cloud: true, has115: true, pikpak: true, pikpakRoots: false, pikpakLoggedIn: false, browserLogin: true });
    const root = draw('Download channels');
    expect(sections(root)).toEqual(['Cloud download', 'PikPak account', 'Add JAV via browser']);
    expect([...card(root, 'PikPak account').querySelectorAll('button')].map(key => key.textContent)).toEqual(['Sign in with the browser', 'Log in']);
  });

  it('CloudDrive proxy: one entry per account, and the proxied route carries an extra address and port', () => {
    rememberShape('media', { folders: [1], cloud: true });
    expect(card(draw('Library and imports'), 'CloudDrive proxy').querySelectorAll('.border-t.pt-4')).toHaveLength(0);
    rememberShape('cloudProxy', { configured: true, unlinked: 0, accounts: [[true, false], [false, false]] });
    const proxy = card(draw('Library and imports'), 'CloudDrive proxy');
    expect(proxy.querySelectorAll('.border-t.pt-4')).toHaveLength(2);
    expect([...proxy.querySelectorAll('span.text-body-medium')].map(node => node.textContent)).toEqual(['Data proxy address', 'Data proxy port']);
  });

  it('Bad records treated as no records', () => {
    localStorage.setItem(SHAPE_KEY, JSON.stringify({ media: { folders: 'x' }, indexers: { open: 3 }, downloads: null }));
    const root = draw('Library and imports');
    expect(card(root, 'Library and catalog').querySelectorAll('[data-folder-row]')).toHaveLength(1);
    expect(sections(draw('Download channels'))).toEqual(['Add JAV via browser']);
    expect(card(draw('Sources and subscriptions'), 'Resource search').querySelectorAll('.border-t.pt-2')).toHaveLength(0);
  });

  it('The skeleton never recorded the body height in pixels', () => {
    rememberShape('indexers', { open: [false] });
    for (const name of ['Library and imports', 'Sources and subscriptions', 'Download channels', 'Network & access', 'App and maintenance']) {
      expect(configurationContentSkeleton(name)).not.toMatch(/--skeleton-h|--remembered-h/);
    }
    expect(Object.keys(localStorage)).toEqual([SHAPE_KEY]);
  });
});

describe('The structure recorded in full-page config', () => {
  const data = {
    editable: true, port_editable: false, notice: '', revision: '', media_dirs: [], library_count: 1, port: 8900,
    facts: [{ term: 'Editions', value: '1' }, { term: 'FFmpeg', value: 'Not found' }],
    access: { mode: 'password', revision: 'r' },
    tunnel: { enabled: false, state: 'stopped', url: '', error: '', available: true, mode: 'named', hostname: '', token_set: false, named_available: true },
    peach_proxy: { mode: 'proxy', proxy_saved: true, needs_selection: false },
    downloads: { media_sources: ['local', 'pikpak'], pikpak_roots: ['/'], pikpak: { logged_in: true }, pikpak_browser: { available: false } },
  } as unknown as ConfigurationData;

  it('Derives blocks and form kinds from the configuration with no values included', () => {
    expect(downloadsShape(data)).toEqual({ cloud: true, has115: false, pikpak: true, pikpakRoots: true, pikpakLoggedIn: true, browserLogin: false });
    expect(networkShape(data)).toEqual({ port: false, addresses: 0, networkEditable: false, lan: false,
      proxyAddress: true, access: 'password', tunnelNamed: true, tunnelNamedMode: true, tunnelNote: false });
    expect(maintenanceShape(data)).toMatchObject({ facts: ['Editions', 'FFmpeg'], reporting: false, uninstall: false, storageRows: 0 });
  });

  it('Network & access renders the access password form from the record; without one it shows the server\'s default system passphrase', () => {
    const fresh = card(draw('Network & access'), 'Access password');
    expect([...fresh.querySelectorAll('span.text-body-medium')].map(node => node.textContent)).toEqual(['Set access password *', 'Confirm access password *']);
    rememberShape('network', networkShape(data));
    const root = draw('Network & access');
    expect(sections(root)).toEqual(['Access password', 'Signed-in devices', 'Cloudflare public entry', 'Peach proxy']);
    expect([...card(root, 'Access password').querySelectorAll('span.text-body-medium')].map(node => node.textContent))
      .toEqual(['Current access password *', 'New access password *', 'Confirm new access password *']);
  });
});
