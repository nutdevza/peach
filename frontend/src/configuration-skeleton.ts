/* The configuration page's skeleton: both the whole-page static skeleton (before the React bundle and `/api/configuration`
 * return) and each section's own skeleton while it fetches are assembled from the pieces here, drawn per the final structure:
 * lists as rows, forms as "label + input", switch rows as "title + description + switch", bottom bars with disabled keys.
 *
 * Row counts come two ways:
 * - Fixed by static registration in code (the source-credentials site list, each section's fixed setting rows and field
 *   names) render straight from the registration, with real names;
 * - Varying with this machine's configuration (media libraries and folders, indexer, cloud drive accounts, download channels,
 *   access password state and so on) render per the structure recorded the last time this machine drew: the record holds row
 *   counts and per-row expanded flags, that kind of structure, not heights. Without a record, render an empty set or a
 *   one-row minimum structure. */
import { esc } from '@peach/legacy/core';
import { islandButton, islandGlyph, islandSelect } from './island-skeleton';
import { appSettingsStore } from './appearance/settings';
import { NAVIGATION_GROUPS, normalizeNavigationOrder } from './navigation-order';
import { diagnosticsSkeleton } from './diagnostics-skeleton';
import { LIBRARY_FOLDER_HELP, POLICY_SUMMARY } from './react/settings/library-policy-copy';
import { ENTRY_LINKS_HELP, ENTRY_LINKS_HINT } from './configuration-copy';
import CREDENTIAL_REGISTRY from './react/follow-manage/credential-providers.json' with { type: 'json' };

export const CLOUD_PROXY_HELP = 'The API proxy lists directories and queries file info; the data proxy reads videos and companion files. After saving, other reads of the same cloud drive account in CloudDrive also use this setting.';

/* ---------- Structure recorded on this machine ---------- */

export interface MediaShape { folders: number[]; cloud: boolean }
export interface DiscoveryShape { enabled: boolean; watchLocal: boolean; cloud: boolean; webhook: boolean; prefixes: number }
export interface CredentialsShape { done: string[] }
/** One entry per indexer: whether it starts expanded (the one with no address yet starts expanded). */
export interface IndexersShape { open: boolean[] }
export interface JavBrowserShape { enabled: boolean; ready: boolean }
/** One entry per cloud drive account: [data proxy through the proxy, API proxy through the proxy]; when proxied, three extra rows appear for address, port, and auth. */
export interface CloudProxyShape { configured: boolean; accounts: [boolean, boolean][]; unlinked: number }
export interface DownloadsShape { cloud: boolean; has115: boolean; pikpak: boolean; pikpakRoots: boolean; pikpakLoggedIn: boolean; browserLogin: boolean }
export interface NetworkShape { port: boolean; addresses?: number; networkEditable?: boolean; lan?: boolean; proxyAddress: boolean; access: string; tunnelNamed: boolean; tunnelNamedMode: boolean; tunnelNote: boolean }
/** Signed-in devices: the row count, and whether the footer has “Sign out other devices”. */
export interface DevicesShape { rows: number; manageable: boolean }
export interface MaintenanceShape {
  releaseFacts: number; releaseNotes: number; autoUpdateHelp: boolean; startupNote: boolean; desktopNote: boolean;
  storageRows: number; storageNotes: number; reporting: boolean; reportingIdle: boolean; sharing: boolean;
  sharingNotice: boolean; sharingIdle: boolean; facts: string[]; uninstall: boolean; uninstallHelp: boolean;
}
export interface ConfigurationShape {
  media: MediaShape; discovery: DiscoveryShape; credentials: CredentialsShape; indexers: IndexersShape;
  javBrowser: JavBrowserShape; cloudProxy: CloudProxyShape; downloads: DownloadsShape; network: NetworkShape;
  devices: DevicesShape; maintenance: MaintenanceShape;
}
type Shapes = { [K in keyof ConfigurationShape]?: Partial<ConfigurationShape[K]> };

export const SHAPE_KEY = 'peach.configuration.shape.v1';

function shapes(): Shapes {
  try {
    const value = JSON.parse(localStorage.getItem(SHAPE_KEY) || '{}') as unknown;
    return value && typeof value === 'object' ? value as Shapes : {};
  } catch { return {} }
}

/** Record a section's structure as drawn this time; the next first-screen skeleton lays out against it. */
export function rememberShape<K extends keyof ConfigurationShape>(key: K, value: ConfigurationShape[K]): void {
  try {
    const all = shapes();
    if (JSON.stringify(all[key]) === JSON.stringify(value)) return;
    localStorage.setItem(SHAPE_KEY, JSON.stringify({ ...all, [key]: value }));
  } catch { /* Render with the minimal structure next time. */ }
}

/** The structure recorded last time; `undefined` when this machine has no record. Every field is validated on read, and bad data is treated as absent. */
export const rememberedShape = <K extends keyof ConfigurationShape>(key: K): Shapes[K] => shapes()[key];

const on = (value: unknown): boolean => value === true;
const count = (value: unknown, max: number): number => Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, max) : 0;
const list = <T>(value: unknown, max: number, item: (entry: unknown) => T): T[] => Array.isArray(value) ? value.slice(0, max).map(item) : [];

/* ---------- Building blocks: class names with the same geometry as the real components ---------- */

const wait = 'disabled data-skeleton-action';
const text = (width = '60%') => `<span class="skeleton skeleton-text" style="width:${width}"></span>`;
const input = (width = '100%') => `<span class="skeleton ui-configuration-skeleton-input" style="width:${width}"></span>`;
/** Fixed-size blocks like icons and badges: only ever placed inside flex rows. */
const block = (width: string, height: string) => `<span class="skeleton shrink-0" style="width:${width};height:${height}"></span>`;
const chip = (width = '3em') => block(width, '24px');
const icon = () => block('var(--icon-inline)', 'var(--icon-inline)');
const button = (label: string, variant: 'primary' | 'secondary' = 'primary', size: 'medium' | 'small' = 'medium') =>
  islandButton({ label, variant, size, attrs: wait });
const footer = (content: string, status = '') => `<div class="-ml-3 flex flex-wrap items-center justify-end gap-3 rounded-b-2xl border-t border-separator-border bg-card-footer px-3 py-3">${status ? `<div class="mr-auto min-w-0 text-body-2-regular text-text-secondary">${status}</div>` : ''}${content}</div>`;
const stack = (content: string, divided = false) => `<div class="flex flex-col gap-4 ${divided ? 'border-t border-separator-border ' : ''}py-4 pr-3">${content}</div>`;
const heading = (name: string, aside: string, mark: boolean) => {
  const label = `<p class="w-full px-3 text-body-2-medium text-text-secondary">${mark ? `<span class="inline-flex items-center gap-1.5">${icon()}${name}</span>` : name}</p>`;
  return aside ? `<div class="flex w-full flex-wrap items-center justify-between gap-2"><div class="min-w-40 flex-1">${label}</div><div class="flex min-w-0 max-w-full">${aside}</div></div>` : label;
};
const section = (name: string, content: string, actions = '', { aside = '', status = '', mark = false } = {}) =>
  `<section aria-label="${name}" class="flex w-full flex-col gap-2 wrap-anywhere">${heading(name, aside, mark)}<div class="flex w-full flex-col rounded-2xl bg-background-secondary-default pl-3">${content}${actions ? footer(actions, status) : ''}</div></section>`;
/** Same as BoardUI's SettingsRow; lead is the placeholder for the leading icon. */
const controlRow = (label: string, description: string, control: string, lead = '') => {
  const body = `<div class="flex min-w-0 flex-col"><p class="text-body-regular text-text-primary">${label}</p>${description ? `<p class="text-body-2-regular text-text-secondary">${description}</p>` : ''}</div>`;
  return `<div class="flex min-h-[52px] w-full items-center justify-between gap-4 py-2.5 pr-2.5 border-b border-separator-border last:border-b-0">${lead ? `<div class="flex min-w-0 items-center gap-3">${lead}${body}</div>` : body}${control}</div>`;
};
const row = (label: string, description = '', control = 'ui-configuration-skeleton-toggle') => controlRow(label, description, `<span class="skeleton ${control}"></span>`);
/* A row holding only a readout ("every 3 months"): the right side is a text-width placeholder, with row height matching the toggle rows. */
const valueRow = (label: string, description = '', width = '4em') => controlRow(label, description, text(width));
const help = (content: string) => `<p class="text-body-2-regular text-text-secondary">${content}</p>`;
const fieldLabel = (label: string) => `<p class="text-body-medium text-text-primary">${label}</p>`;
const inputField = (label: string, hint = '') => `<div class="flex w-full flex-col items-start gap-1"><span class="flex items-center gap-0.5 text-body-medium text-text-primary">${label}</span>${input()}${hint ? `<span class="pt-px text-caption-1-medium text-text-secondary">${hint}</span>` : ''}</div>`;
const selectField = (label: string) => `<div class="flex flex-col gap-1">${fieldLabel(label)}${islandSelect(text('8em'))}</div>`;
const check = (label: string) => `<span class="flex items-center gap-2 text-body-regular text-text-primary">${block('16px', '16px')}${label}</span>`;
const marked = (label: string) => `<span class="inline-flex items-center gap-1">${icon()}${label}</span>`;
/** The disclosure row (the `Disclosure` summary): arrow and name; the arrow turns down when expanded. */
const summary = (label: string, open = false) => `<span class="flex w-fit items-center gap-1 text-body-2-medium text-text-secondary">${islandGlyph('chevron-right', `size-(--icon-inline) shrink-0${open ? ' rotate-90' : ''}`)}${label}</span>`;
/* One stat per line; the FFmpeg and untrunc rows for missing tools are one explanation plus a download link, drawn as three lines of text. */
const DEPENDENCY_FACTS = new Set(['FFmpeg', 'untrunc']);
const facts = (terms: string[]) => `<dl class="ui-settings-facts flex flex-col">${terms.map(term => `<div class="flex min-h-11 items-center justify-between gap-4 border-b border-separator-border py-2.5 pr-3 last:border-b-0"><dt class="flex max-w-1/2 min-w-0 shrink-0 items-center gap-2 text-body-regular text-text-secondary">${term}</dt><dd class="flex min-w-0 flex-wrap items-center justify-end gap-2 text-body-regular text-text-primary">${DEPENDENCY_FACTS.has(term) ? text('100%') + text('80%') + text('6em') : text('6em')}</dd></div>`).join('')}</dl>`;

/* ---------- Source credentials: the site roster is a static registry ---------- */

interface CredentialProvider { provider: string; label: string; requirement: string; fields?: string[]; why?: string; where?: string; howto?: string }
/** Matches the static part of `/api/follow/credentials`; verified against the endpoint by `tests/test_follow_web.py`. */
export const CREDENTIAL_PROVIDERS: readonly CredentialProvider[] = CREDENTIAL_REGISTRY;

export interface CredentialSkeletonRow extends CredentialProvider { done: boolean; open: boolean }

/** Each row in the skeleton: site, group, and required fields come from the registry; whether configured comes from the last record, and with no record treat as unconfigured.
 *  Same rule for expanded state and final state: required and not configured means expanded. */
export function credentialSkeletonRows(shape = rememberedShape('credentials')): CredentialSkeletonRow[] {
  const done = new Set(list(shape?.done, 64, String));
  return CREDENTIAL_PROVIDERS.map(entry => {
    const configured = done.has(entry.provider);
    return { ...entry, done: configured, open: entry.requirement === 'required' && !configured };
  });
}

function credentialRow(row: CredentialSkeletonRow): string {
  const fields = row.fields ?? [];
  const configurable = row.requirement !== 'none' && row.requirement !== 'blocked';
  /* Badge slots: one for status, plus one per missing field when setup is incomplete. */
  const chips = chip() + (configurable && !row.done ? fields.map(() => chip('4.5em')).join('') : '');
  const head = `<span class="flex min-w-0 flex-wrap items-center gap-2">${block('14px', '14px')}<b class="min-w-0 text-body-medium wrap-anywhere text-text-primary">${esc(row.label)}</b>${chips}</span>`;
  if (!configurable) {
    return `<div class="flex flex-wrap items-center gap-3 border-b border-separator-border px-6 py-5 last:border-b-0 max-sm:px-4">${head}${row.requirement === 'blocked' && row.why ? help(esc(row.why)) : ''}</div>`;
  }
  const form = row.open ? '<div class="flex flex-col gap-2 pt-3"><div class="flex flex-col gap-3">'
    + help(`${esc(row.why ?? '')}${row.where ? ' fetch credentials' : ''}`) + (row.howto ? help(esc(row.howto)) : '')
    + `<div class="flex w-full flex-col gap-3">${fields.map(name => inputField(esc(name))).join('')}</div>`
    + `<div class="flex flex-wrap items-center gap-2">${button('Save configuration')}</div>${summary('Credential file')}</div></div>` : '';
  return `<div class="flex flex-col gap-2 border-b border-separator-border px-6 py-5 last:border-b-0 max-sm:px-4">${head}<div>${summary(row.done ? 'Edit credentials' : 'Enter credentials', row.open)}${form}</div></div>`;
}

export function credentialsSkeleton(): string {
  const rows = credentialSkeletonRows();
  const pending = rows.filter(row => row.requirement === 'required' && !row.done).length;
  const groups = [
    ['Configurable credentials', rows.filter(row => row.requirement !== 'none' && row.requirement !== 'blocked')],
    ['No credentials needed', rows.filter(row => row.requirement === 'none')],
    ['Not supported yet', rows.filter(row => row.requirement === 'blocked')],
  ] as const;
  const body = groups.filter(([, items]) => items.length).map(([name, items]) => `<div class="flex flex-col gap-2"><h4 class="text-body-medium text-text-secondary">${name}</h4><div class="min-w-0 border border-separator-border bg-background-primary-default rounded-surface flex flex-col overflow-hidden">${items.map(credentialRow).join('')}</div></div>`).join('');
  return section('Source credentials', stack(`<div class="flex flex-col gap-4">${body}</div>`), '', { aside: pending ? text('5em') : '' });
}

/* ---------- Resource search: the indexer count follows config ---------- */

export function indexersSkeleton(): string {
  const open = list(rememberedShape('indexers')?.open, 20, on);
  const rows = open.map(expanded => `<div class="min-w-0 border-t border-separator-border pt-2"><span class="flex w-full min-w-0 items-center gap-1 text-body-2-medium">${islandGlyph('chevron-right', `size-(--icon-inline) shrink-0 text-text-secondary${expanded ? ' rotate-90' : ''}`)}${text('6em')}${text('12em')}</span>`
    + (expanded ? `<div class="flex flex-col gap-2 pt-3"><div class="flex min-w-0 flex-col gap-4">${inputField('Name')}${inputField('Torznab URL')}${inputField('API key')}<div class="flex flex-wrap items-center gap-x-6 gap-y-2">${check('Enabled')}${button('Remove', 'secondary', 'small')}</div></div></div>` : '')
    + '</div>').join('');
  return section('Resource search', stack(`<div class="flex min-w-0 flex-col gap-4">${summary('Indexer connection help')}${rows}</div>`), button('Add indexer', 'secondary') + button('Save configuration'));
}

/* ---------- Add JAV via browser ---------- */

export function javBrowserSkeleton(): string {
  const shape = rememberedShape('javBrowser');
  const enabled = on(shape?.enabled);
  const status = '<div class="min-w-0 bg-background-primary-default rounded-2xl shadow-card p-5 border border-border-button-default flex flex-col gap-3">'
    + `<div class="flex flex-wrap items-center justify-between gap-3"><span class="text-body-medium text-text-primary">Peach userscript</span>${text('4em')}</div>`
    + `<div class="flex flex-wrap items-center justify-between gap-3"><span class="text-body-regular text-text-secondary">Added via browser</span>${chip()}</div>`
    + `<p class="text-caption-1-regular text-text-secondary">${text('70%')}</p>`
    + `<div class="flex flex-wrap items-center gap-2">${button('Check again', 'secondary')}</div></div>`;
  return section('Add JAV via browser', stack(`<div class="flex min-w-0 flex-col gap-4">${status}${selectField('Download channel added via browser')}`
    + `${on(shape?.ready) ? '' : help('Add a cloud drive that supports cloud download to the library, then configure the account and target directory.')}${inputField('Peach address')}</div>`),
  (enabled ? button('Turn off browser adding', 'secondary') : '') + button(enabled ? 'Update channels and tokens' : 'Enable and generate a token'));
}

/* ---------- CloudDrive proxies: account count follows the config ---------- */

const proxyEditor = (label: string, proxy: boolean) => `<div class="flex min-w-0 flex-col gap-3">${fieldLabel(label)}${islandSelect(text('6em'))}`
  + (proxy ? `<div class="flex flex-wrap gap-3"><div class="min-w-40 flex-1">${inputField(`${label} URL`)}</div><div class="w-full sm:w-28">${inputField(`${label} port`)}</div></div>${summary('Proxy authentication')}` : '') + '</div>';

export function cloudProxySkeleton(): string {
  const shape = rememberedShape('cloudProxy');
  const accounts = list(shape?.accounts, 12, entry => Array.isArray(entry) ? [on(entry[0]), on(entry[1])] as const : [false, false] as const);
  const unlinked = count(shape?.unlinked, 12);
  const body = accounts.length || unlinked
    ? Array.from({ length: unlinked }, () => `<div class="flex min-w-0 flex-col gap-1">${fieldLabel(marked(text('6em')))}${help(text('9em'))}</div>`).join('')
      + accounts.map(([data, api]) => `<div class="flex min-w-0 flex-col gap-4 border-t border-separator-border pt-4">${fieldLabel(marked(text('8em')))}${help(text('50%'))}${proxyEditor('Data proxy', data)}${proxyEditor('API proxy', api)}<div class="flex justify-end">${button('Save configuration')}</div></div>`).join('')
    : help(text('60%'));
  return section('CloudDrive proxy', stack(`${help(CLOUD_PROXY_HELP)}<div class="flex min-w-0 flex-col gap-4">${body}</div>`), button('Reload', 'secondary'));
}

/* ---------- Libraries and adding to library ---------- */

const field = (label: string, control: string, className: string) =>
  `<div class="flex min-w-0 flex-col gap-1 ${className}"><span class="flex items-center gap-0.5 text-body-medium text-text-primary" aria-hidden="true">${label}</span>${control}</div>`;
const folderRow = (libraries: number) => `<div data-folder-row class="@container flex flex-col gap-2 rounded-2lg border border-separator-border bg-background-primary-default p-3">
    <div class="flex items-start gap-2"><span class="min-w-0 flex-1">${input()}</span>${islandButton({ glyph: 'folder-search', variant: 'secondary', attrs: wait })}</div>
    <div class="flex flex-wrap items-end gap-2"><div class="flex w-full flex-wrap items-start gap-2">${field('Source', islandSelect(text('6em')), 'w-full @lg:w-60')}${field('Read policy', islandSelect(text('4em')), 'w-full @lg:w-32')}${libraries > 1 ? field('Move to library', islandSelect(text('4em')), 'w-full @lg:w-48') : ''}</div></div>
  </div>`;
/* The library card shares its class list with `cardClass({ variant: 'raised', padding: 'none' })`. */
const libraryBlock = (folders: number, libraries: number) => `<div data-library-block class="min-w-0 bg-background-primary-default rounded-2xl shadow-card flex flex-col p-2">
    <div data-library-head>${islandButton({ label: 'Auto-detect', variant: 'secondary', attrs: wait })}${input()}<span class="skeleton ui-configuration-skeleton-input" style="width:136px"></span>${islandSelect(text('4em'), { prefix: 'Handling' })}</div>
    <div data-library-folders>${folderRow(libraries).repeat(folders)}<div class="flex">${islandButton({ label: 'Add folder', variant: 'secondary', attrs: wait })}</div></div></div>`;
/* The explainer is fixed text: the always-visible sentence is verbatim, the comparison table stays collapsed, and only its expand row renders. */
const legend = `<div data-policy-legend class="flex flex-col gap-1"><p class="text-body-2-regular text-text-secondary">${POLICY_SUMMARY}</p>`
  + '<span class="flex items-center gap-1 text-body-2-medium text-text-secondary">Comparison of the three handling options</span></div>';
const cloudHelp = '<p class="text-body-2-regular text-text-secondary">When the read policy is set to "Proxy protection", automatic video reading is restricted.</p>'
  + '<div class="flex flex-col gap-3"><span class="flex items-center gap-1 text-body-2-medium text-text-secondary">CloudDrive settings help</span></div>';

/** How many folders per library: the value recorded last time; one folder per group when there is none. */
export function mediaSkeletonShape(shape = rememberedShape('media')): MediaShape {
  const folders = list(shape?.folders, 12, entry => count(entry, 50)).filter(Boolean);
  return folders.length ? { folders, cloud: on(shape?.cloud) } : { folders: [1], cloud: false };
}

/** Auto-discovery of new files: the three toggle rows are fixed; the description when enabled, the Webhook row and the prefix table follow the config. */
export function discoverySkeleton(): string {
  const shape = rememberedShape('discovery');
  const enabled = on(shape?.enabled);
  const cloud = enabled && on(shape?.cloud);
  const webhook = cloud && on(shape?.webhook);
  const prefixRow = `<div class="flex items-start gap-2"><span class="min-w-0 flex-1">${input()}</span>${islandSelect(text('4em'), { prefix: 'Target directory' })}${islandButton({ glyph: 'trash', variant: 'secondary', attrs: wait })}</div>`;
  return section('Auto-discover new files', stack(`<div class="flex flex-wrap items-center gap-2"><span class="text-body-regular text-text-secondary">Local monitoring</span>${chip()}</div>`)
    + row('Auto-intake after finding new files', enabled ? text('10em') : '') + row('Watch local folders', enabled && on(shape?.watchLocal) ? text('12em') : '')
    + row('Receive CloudDrive2 notifications', 'When a cloud-drive directory changes, CloudDrive2 pushes the change over.') +(cloud ? controlRow('Webhook configuration', text('20em'), '') : '')
    + (webhook ? stack(summary('View configuration'), true) : '')
    + (cloud ? stack(`<div class="flex flex-col gap-3">${fieldLabel('Cloud path prefix')}<div class="flex flex-col gap-3">${prefixRow.repeat(count(shape?.prefixes, 20))}</div><div>${button('Add prefix', 'secondary')}</div></div>`, true) : ''),
  (webhook ? button('Rotate the key', 'secondary') : '') + button('Save configuration'));
}

/** Libraries and catalog: the legend, each library's header row, folder rows with their own add keys, and at the very bottom the add-library control and footer actions. */
const media = () => {
  const shape = mediaSkeletonShape();
  return section('Library and catalog', stack(`${legend}<div class="flex flex-col gap-4">${shape.folders.map(folders => libraryBlock(folders, shape.folders.length)).join('')}</div>
  <div class="self-start">${button('Add media library', 'secondary')}</div>
  <p class="text-body-2-regular text-text-secondary">${LIBRARY_FOLDER_HELP}</p>
  ${shape.cloud ? cloudHelp : ''}<span class="text-body-medium text-text-primary">${text('15em')}</span>`),
  button('Save configuration'), { status: 'Peach will restart after saving.' })
  + (shape.cloud ? cloudProxySkeleton() : '')
  + discoverySkeleton()
  + section('Code detection rules', stack(`${text('90%')}${text('60%')}<span class="skeleton ui-configuration-skeleton-input" style="width:100%;height:88px"></span>`), button('Save configuration'))
  + section('Video previews', row('Generate video previews', 'Generates the nine-grid and timeline previews for local videos.')
    + row('Timeline preview', 'Extracts frames at the selected interval; only processes videos on local disk.', 'ui-configuration-skeleton-select')
    + row('Frame extraction decode method', 'Used to generate covers, contact sheets, and timelines.', 'ui-configuration-skeleton-select'));
};

/* ---------- Sources and subscriptions ---------- */

const subscriptions = () => `<div>${button('Collect sources and login status', 'secondary')}</div>`
  + credentialsSkeleton()
  + section('Follows scrape', controlRow('Automatically check for updates', '', `<span class="flex items-center gap-2"><span class="skeleton ui-configuration-skeleton-toggle"></span><span class="skeleton ui-configuration-skeleton-input" style="width:96px"></span></span>`)
    + valueRow('Follow source fetching') + row('First scrape scope', 'How far back a newly followed source looks on its first pass.', 'ui-configuration-skeleton-select')
    + valueRow('Avatar refresh', 'Re-fetch the followed creators\' avatars.') + valueRow('Favicon refresh', 'Re-fetch the source site\'s icon.'))
  + indexersSkeleton()
  + section('Video profile sites', stack(`<p class="text-body-2-regular text-text-secondary">${ENTRY_LINKS_HELP}</p>${inputField(marked('JavDB URL'), ENTRY_LINKS_HINT)}${inputField(marked('MISSAV URL'), ENTRY_LINKS_HINT)}`), button('Save configuration'));

/* ---------- Download channels: the cloud download and PikPak blocks appear with the cloud drives in the library ---------- */

const downloads = () => {
  const shape = rememberedShape('downloads');
  const pikpak = on(shape?.pikpak);
  const roots = on(shape?.pikpakRoots) ? selectField(marked('Media folder matching the PikPak root'))
    : `<div class="flex flex-col gap-1">${fieldLabel(marked('Media folder for the PikPak root'))}${help('First add the PikPak mount folder under "Media library and import".')}</div>`;
  const cloud = on(shape?.cloud) ? section('Cloud download', stack(inputField('CloudDrive2 address') + inputField('CloudDrive2 API token', 'Offline task permission required.')
    + (on(shape?.has115) ? inputField(marked('115 target folder'), 'Should sit inside the auto-intake cloud path prefix.') : '')
    + (pikpak ? inputField(marked('PikPak target folder'), 'The folder must already exist.') + roots : '')
    + inputField('Wait cap (hours)', text('14em'))), button('Check connection', 'secondary') + button('Save configuration')) : '';
  const loggedIn = on(shape?.pikpakLoggedIn);
  const account = pikpak ? section('PikPak account', loggedIn ? facts(['Account', text('4em')]) : stack(inputField('Account') + inputField('Password') + check('Saves the password to re-sign-in automatically when the session expires')),
    loggedIn ? button('Sign out', 'secondary') : (on(shape?.browserLogin) ? button('Sign in with the browser', 'secondary') : '') + button('Log in'), { aside: chip(), mark: true }) : '';
  return cloud + account + javBrowserSkeleton();
};

/* ---------- Network and access ---------- */

const ACCESS_HELP: Record<string, string> = {
  legacy: 'A system-generated access passphrase is in use. Set your own password, or turn off the sign-in requirement.',
  locked: 'Access settings could not be read; check the configuration file on this machine.',
  password: 'A password is set. New devices need to sign in; checking "Keep me signed in" keeps the session for 30 days.',
};
const TUNNEL_HELP = {
  quick: 'For temporary preview only; the address is random and changes after restart. Set an access password before starting.',
  named: 'Uses the fixed domain you bound on Cloudflare. Set an access password before starting.',
};

function accessBody(mode: string): string {
  const pair = mode === 'locked' ? '' : inputField(mode === 'password' ? 'New access password *' : 'Set access password *', 'At least 8 characters. After saving, other devices must sign in again.')
    + inputField(mode === 'password' ? 'Confirm new access password *' : 'Confirm access password *');
  return (ACCESS_HELP[mode] ? help(ACCESS_HELP[mode]) : '') + (mode === 'open' ? block('100%', '64px') : '')
    + (mode === 'password' || mode === 'legacy' ? check('Disable access password') : '')
    + (mode === 'password' ? inputField('Current access password *') : '') + pair;
}

/** Logged-in devices: draw this when the section fetches its own data too. With no record, draw a single row (this device). */
export function devicesSkeleton(): string {
  const shape = rememberedShape('devices');
  const rows = Array.from({ length: Math.max(1, count(shape?.rows, 8)) }, () => controlRow(text('8em'), text('14em'), text('3em'), block('20px', '20px'))).join('');
  return section('Signed-in devices', rows, on(shape?.manageable) ? button('Sign out other devices', 'secondary') : '',
    on(shape?.manageable) ? { status: 'Changing the access password signs out every device.' } : {});
}

const network = () => {
  const shape = rememberedShape('network');
  /* With no record, render the server's default state: no access settings file means `legacy` (a system-generated password). */
  const mode = typeof shape?.access === 'string' && shape.access ? shape.access : 'legacy';
  const named = on(shape?.tunnelNamed);
  const tunnel = (named && on(shape?.tunnelNamedMode)
    ? help(TUNNEL_HELP.named) + inputField('Public hostname', 'The hostname in Cloudflare Zero Trust that points at this computer.') + inputField('Tunnel token', text('16em'))
    : help(TUNNEL_HELP.quick)) + (on(shape?.tunnelNote) ? block('100%', '64px') : '');
  const addresses = count(shape?.addresses, 3);
  const addressFields = Array.from({ length: addresses }, (_, i) => `<div class="flex min-w-0 flex-wrap items-end gap-2"><div class="min-w-0 flex-1">${inputField(['Local address', 'Phone connection address', 'Backup IP address'][i]!)}</div>${button('Copy address', 'secondary')}</div>`).join('');
  return (addresses || on(shape?.port) ? section('Access address', stack(addressFields + (addresses ? block('100%', '40px') : '')
      + (on(shape?.networkEditable) ? `<div class="flex flex-col gap-1.5">${fieldLabel('Who can access')}${block('min(100%, 20em)', '36px')}</div>` + (on(shape?.lan) ? inputField('LAN access address') : '') : '')
      + (on(shape?.port) ? inputField('Port') : '')), on(shape?.port) ? button('Save configuration') : '',
      on(shape?.port) ? { status: 'Peach will restart after saving and jump to the new address.' } : {}) : '')
    + section('Access password', stack(accessBody(mode)), mode === 'locked' ? '' : button('Save configuration'))
    + (mode === 'password' || mode === 'legacy' ? devicesSkeleton() : '')
    + section('Cloudflare public entry', stack((named ? block('10.5em', '36px') : '') + tunnel),
      button('Start the public entry point', named ? 'secondary' : 'primary') + (named ? button('Save configuration') : ''), { aside: chip() })
    + section('Peach proxy', row('Connection method', 'Used when Peach reaches the internet and collects sources.', 'ui-configuration-skeleton-select') + (on(shape?.proxyAddress) ? stack(inputField('Proxy address'), true) : ''), button('Save configuration'));
};

/* ---------- App and maintenance ---------- */

/** The rows always present in runtime info; a row for missing FFmpeg or untrunc appears only then, per the last recorded state. */
const RUNTIME_FACTS = ['Editions', 'Operating system', 'Data directory', 'Settings files', 'Log folder'];

const maintenance = () => {
  const shape = rememberedShape('maintenance');
  const releaseFacts = ['Current version', 'Install method', 'Update channel', 'Latest version', 'Download contents'].slice(0, Math.max(4, count(shape?.releaseFacts, 5)));
  const releaseNotes = count(shape?.releaseNotes, 4);
  const storageRows = count(shape?.storageRows, 12);
  const storageNotes = count(shape?.storageNotes, 3);
  const runtime = list(shape?.facts, 12, entry => esc(String(entry)));
  const idle = `<span class="self-start">${chip('6em')}</span>`;
  /* The server always provides the data upload and uninstall blocks; they render even without records, only without the status-dependent notices. */
  const given = (value: unknown) => shape ? on(value) : true;
  const reporting = given(shape?.reporting) ? row('Send version statistics and error diagnostics (recommended)', 'Uploads version, system info, failure type, code location, and occurrence count.') + (on(shape?.reportingIdle) ? stack(idle, true) : '') : '';
  const sharing = given(shape?.sharing) ? `<div class="border-t border-separator-border">${row('Upload library and taste details', on(shape?.sharingNotice) ? text('12em') : '')}${on(shape?.sharingIdle) ? stack(idle, true) : ''}${footer(button('Preview upload', 'secondary'))}</div>` : '';
  return section('Check for updates', facts(releaseFacts) + (releaseNotes ? stack(help(text('50%')).repeat(releaseNotes), true) : ''),
    button('Check for updates'), { aside: chip('4em'), status: text('5em') })
    + section('Auto-update', row('Auto-check for new versions') + row('Automatically download updates', 'After finding a new version, it downloads first and asks before installing on the next restart.') +row('Check frequency', on(shape?.autoUpdateHelp) ? text('12em') : '', 'ui-configuration-skeleton-select'), button('Save configuration'))
    + section('Start at sign-in', row('Start Peach after sign-in') + row('Start the tray only, without opening the web app', 'Runs in the background at startup; open the page from the tray when needed.') +row('Create desktop shortcut', on(shape?.desktopNote) ? text('12em') : '')
      + (on(shape?.startupNote) ? stack(help(text('60%')), true) : ''), button('Save configuration'))
    + section('Video playback', row('Transcode method', 'Used for video transcoding during playback.', 'ui-configuration-skeleton-select'))
    + section('Storage', facts(['Data directory', 'Hosting disk'])
      + (storageRows ? Array.from({ length: storageRows }, () => controlRow(text('6em'), '', text('4em'))).join('') : stack(help('After stats it shows usage per data kind, with cleanup for caches and old backups.'), true))
      + (storageNotes ? stack(help(text('80%')).repeat(storageNotes), true) : ''),
    button('Change location', 'secondary') + button(storageRows ? 'Re-measure' : 'Measure usage'))
    + (reporting || sharing ? section('Data upload', reporting + sharing) : '')
    + section('Runtime info', facts(runtime.length ? runtime : RUNTIME_FACTS))
    + `<section aria-label="Guided tour" class="w-full"><div class="flex w-full flex-col rounded-2xl bg-background-secondary-default pl-3">${controlRow('Guided tour', 'Brings the tour entry back to the top bar on every device and keeps your reading progress', button('Reopen', 'secondary'))}</div></section>`
    + (given(shape?.uninstall) ? section('Uninstall Peach', (on(shape?.uninstallHelp) ? stack(help('Uninstalling removes the Peach program itself; original media files are kept.')) : '')
      + row('Full uninstall', 'Also delete settings, the local database, watch history, credentials, and caches') + stack(summary('Data directory'), true), button('Uninstall Peach'), { status: text('16em') }) : '');
};

/** Each section reuses the real form's Section, Stack and SettingsRow geometry. */
export function configurationContentSkeleton(chosen: string): string {
  switch (chosen) {
    case 'System diagnostics': return diagnosticsSkeleton();
    case 'Sources and subscriptions': return subscriptions();
    case 'Download channels': return downloads();
    case 'Network & access': return network();
    case 'App and maintenance': return maintenance();
    default: return media();
  }
}

export function configurationSkeleton(chosen = 'Library and imports'): string {
  const titles = normalizeNavigationOrder('configuration', appSettingsStore().value.navigationOrders.configuration)
    .map(key => NAVIGATION_GROUPS.configuration.items.find(([id]) => id === key)![1]);
  const nav = `<div class="ui-board-local-nav" data-section-nav data-section-items>${titles.map(title => `<button type="button" tabindex="-1" aria-selected="${title === chosen}">${title}</button>`).join('')}</div>`;
  return `<div class="peach-react"><div class="ui-configpage">${nav}<div class="flex min-w-0 flex-col gap-6">${configurationContentSkeleton(chosen)}</div></div></div>`;
}
