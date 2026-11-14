/* The seam between the settings panel (resident component `settings-panel`) and the shell: each change persists once and
 * reports only its own effect name; slider drags only schedule re-renders and persist on release; the panel DOM is built
 * once; plus its behavior as a resident component (`RESIDENT_ROUTES['settings-panel']`) in the route tree: the host
 * `[data-settings-host]` is placed at the end of body on first open and not wrapped in `.peach-react`, the handle is handed
 * over only after rendering, the panel is rendered by the time `open` returns, and a thrown error unmounts only the
 * component. Open/close motion, focus ring, write endpoints and pixels are verified in a real browser, see
 * `e2e/settings-panel.test.ts` and `e2e/design-*.test.ts`. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { notifyManager } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { normalizeHomeGlow } from '@peach/appearance';

import type { BatchDockApi, BatchDockHost } from '../../src/react/batch-dock/batch-dock-api';
import type { ShellActions } from '../../src/react/router/shell-actions';
import type {
  PanelSettings, SettingsEffect, SettingsPanelApi, SettingsPanelHost,
} from '../../src/react/settings-panel/settings-panel-api';
import { createSettingsStore } from '../../src/settings-store';
import { DEFAULT_SFW_SHORTCUT, parseShortcut, type Shortcut } from '../../src/keyboard-shortcut';
import { FOLLOW_INITIAL_RANGE_OPTIONS } from '../../src/application/initial-follow-ranges';

import { click, pending, settle } from './render';

notifyManager.setScheduler((notify) => notify());

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

type ActFlag = { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

/* The left column's section glyphs get a wrapper that decides on the spot whether to throw: a test flips `glyph.broken` mid-case, meaning "throw on the next render". */
const glyph = vi.hoisted(() => ({ broken: false }));
vi.mock(import('../../src/react/settings-panel/icon'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    RemixIcon: (props: Parameters<typeof actual.RemixIcon>[0]) => {
      if (glyph.broken) throw new Error('The settings panel never paints');
      return actual.RemixIcon(props);
    },
  };
});

/* The resident component adapter reads the config functions from the same package directly; tests only hook into this scenario's handle contract. */
type ShellIslands = { connectApplication(next: (actions: ShellActions) => void): () => void;
  loadSettingsPanel(host: SettingsPanelHost): Promise<SettingsPanelApi>;
  settingsPanelApi(): SettingsPanelApi | null;
  loadBatchDock(host: BatchDockHost): Promise<BatchDockApi>;
};
const ISLANDS_MODULE = '../../src/react/application-residents';

async function load() {
  vi.resetModules();
  window.history.replaceState(null, '', '/');
  const [history, router, routes, query, islands] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes'),
    import('../../src/react/query'), import(/* @vite-ignore */ ISLANDS_MODULE) as Promise<ShellIslands>,
  ]);
  return { ...history, ...router, ...routes, queryClient: query.queryClient, islands };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
beforeEach(() => {
  /* No animation: closing collapses on the spot. */
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {},
  }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});
afterEach(async () => {
  (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = true;
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  document.body.className = '';
  document.documentElement.style.overflow = '';
  glyph.broken = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function shellActions(): ShellActions {
  return {
    openItem: vi.fn(), openEntity: vi.fn(), openTag: vi.fn(), openTasteSignal: vi.fn(), navigate: vi.fn(),
    openManage: vi.fn(), managePath: vi.fn(() => ''), openFollow: vi.fn(), receipt: vi.fn(), toast: vi.fn(),
    failure: vi.fn(), revealSource: vi.fn(async () => ''), reopenTutorial: vi.fn(async () => {}),
    routeReview: vi.fn(),
    routeFollowManage: vi.fn(), saveFollowPreference: vi.fn(), srcBadge: () => '', routeIndex: vi.fn(),
    savePeopleLayout: vi.fn(), exitSelectMode: vi.fn(), personAvatar: vi.fn(() => ({ html: '', face: '' })),
    authorAvatar: vi.fn(() => ''), showIndexTags: vi.fn(), openFollowAuthor: vi.fn(), openFollowTag: vi.fn(),
    openPlaylist: vi.fn(), canFlip: vi.fn(() => true),
    surfaceChanged: vi.fn(), clearSearch: vi.fn(), openImmerse: vi.fn(), openOverlay: vi.fn(), closeStage: vi.fn(), grid: {} as ShellActions['grid'],
  };
}

/** At shell startup the route tree paints first (the root's options are the same ones as `mountApplication`); attaching fetches is a separate step the test can defer. */
async function mountRouter(r: Loaded) {
  unmounts.push(r.islands.connectApplication(() => {}));
  const root = createRoot(document.createElement('div'), r.ROUTER_ROOT_OPTIONS);
  await act(async () => { root.render(<r.RouterRoot actions={shellActions()} />) });
  unmounts.push(() => root.unmount());
  unmounts.push(() => r.queryClient.clear());
}
async function connect(r: Loaded) {
  await act(async () => { r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute)) });
}

const settings = (): PanelSettings => ({
  theme: 'system', uiSounds: true, homeGlow: { ...normalizeHomeGlow(null), on: true, preset: 'ash' }, accent: 'blue',
  sidebarOrder: [''], batchSize: 60, defaultSort: 'seed', defaultSortDirection: '', groupCollapse: true,
  javImage: 'cover', performerNameLanguage: 'zh-CN', interfaceLanguage: 'zh-CN', systemLanguage: null, feedAutoScroll: true, feedLimit: 12, feedHideGroupCompilations: true, feedHideSoloCompilations: false,
  feedHideExcerpts: true, hoverDelaySeconds: 5, detailAutoplay: false, miniplayer: true, seekSeconds: 10,
  relatedLimit: 24, searchHistoryLimit: 10, followInitialDays: 30, avatarRefreshDays: 90, faviconRefreshDays: 365,
});

/** The copy the shell hands in via `settingsHost()`. */
function panelHost() {
  const value = settings();
  const store = createSettingsStore('peach.settings.v1', value);
  const save = vi.spyOn(store, 'save') as unknown as Mock<() => void>;
  const changed = vi.fn<(effect: SettingsEffect) => void>();
  const setHighContrast = vi.fn<(on: boolean) => void>();
  const setSfwShortcut = vi.fn<(shortcut: Shortcut | null) => void>();
  const attached = vi.fn<(panel: HTMLElement) => void>();
  const host: SettingsPanelHost = {
    store, changed, sound: () => {},
    navCatalog: [['', 'Home', 'house']],
    themeOptions: [['system', 'Follow system', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']],
    videoLayouts: [['small', 'small'], ['large', 'large']],
    followInitialRanges: FOLLOW_INITIAL_RANGE_OPTIONS,
    videoLayout: () => 'small', setVideoLayout: () => {},
    censored: () => false, setCensored: () => {}, highContrast: () => false, setHighContrast,
    sfwShortcut: () => parseShortcut(DEFAULT_SFW_SHORTCUT)!, setSfwShortcut,
    receipt: () => {}, failure: () => {}, syncRemote: () => {}, openConfiguration: () => {}, attached,
    configurable: async () => false,
  };
  return { host, value, save, changed, setHighContrast, setSfwShortcut, attached };
}

/** Wire up along the shell's `openSettings`: the route tree is already rendered at startup, and it mounts on the first gear click. */
async function setup() {
  const r = await load();
  await mountRouter(r);
  await connect(r);
  const shell = panelHost();
  let api!: SettingsPanelApi;
  await act(async () => { api = await r.islands.loadSettingsPanel(shell.host) });
  return { r, api, ...shell };
}
type Stage = Awaited<ReturnType<typeof setup>>;

const effects = (changed: Stage['changed']) => changed.mock.calls.map(([effect]) => effect);
const settingsRoot = () => document.querySelector<HTMLElement>('[data-settings-host]');

async function open(current: Stage, section?: string): Promise<HTMLElement> {
  await act(async () => current.api.open(section));
  await settle();
  return document.querySelector<HTMLElement>('#settingsPanel')!;
}

async function close(current: Stage): Promise<void> {
  await act(async () => current.api.close());
  await settle();
}

/** Accept every report; `console.error` is only muted, not counted. */
function watchReports() {
  const reported = vi.fn();
  vi.stubGlobal('reportError', reported);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return reported;
}

describe('Seam between the settings panel and the shell', () => {
  it.each([true, false])('The name preference waits for the database receipt and updates the global display only on save success=%s', async (success) => {
    const answer = pending<{ ok: boolean; status: number; json(): Promise<unknown> }>();
    const writes: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.body) { writes.push(JSON.parse(init.body)); return answer.answer }
      return { ok: true, status: 200, json: async () => ({ performerNameLanguage: 'zh-CN' }) };
    }));
    const current = await setup();
    const names = await import('../../src/core/entity-names');
    names.setNameLanguage('zh-CN');
    const failure = vi.fn();
    current.host.failure = failure;
    current.host.syncRemote = (saved) => {
      const language = saved.performerNameLanguage;
      if (language === 'zh-CN' || language === 'ja') {
        current.value.performerNameLanguage = language;
        names.setNameLanguage(language);
      }
    };
    const panel = await open(current, 'JAV & new releases');
    const field = panel.querySelector<HTMLElement & { value: string }>('#performerNameLanguageSetting > div')!;
    expect(field.value).toBe('zh-CN');
    await act(async () => { field.value = 'ja'; field.dispatchEvent(new Event('change', { bubbles: true })) });
    expect(writes).toEqual([{ performerNameLanguage: 'ja' }]);
    expect(names.nameLanguage()).toBe('zh-CN');
    expect(current.value.performerNameLanguage).toBe('zh-CN');
    await answer.release({ ok: success, status: success ? 200 : 500,
      json: async () => success ? { performerNameLanguage: 'ja' } : { error: 'Save failed' } });
    await settle();
    expect(names.nameLanguage()).toBe(success ? 'ja' : 'zh-CN');
    expect(current.value.performerNameLanguage).toBe(success ? 'ja' : 'zh-CN');
    expect(field.value).toBe(success ? 'ja' : 'zh-CN');
    expect(failure).toHaveBeenCalledTimes(success ? 0 : 1);
  });
  it.each([true, false])('The interface language goes into the database; the shell reconciles only when saving succeeds=%s', async (success) => {
    const answer = pending<{ ok: boolean; status: number; json(): Promise<unknown> }>();
    const writes: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.body) { writes.push(JSON.parse(init.body)); return answer.answer }
      return { ok: true, status: 200, json: async () => ({ interfaceLanguage: 'zh-CN' }) };
    }));
    const current = await setup();
    const synced: unknown[] = [];
    current.host.syncRemote = (saved) => { synced.push(saved.interfaceLanguage) };
    const failure = vi.fn();
    current.host.failure = failure;
    const panel = await open(current, 'Appearance & navigation');
    const field = panel.querySelector<HTMLElement & { value: string }>('#interfaceLanguageSetting > div')!;
    expect(field.value).toBe('zh-CN');
    synced.length = 0; // 打开面板时的那一次对账不算
    await act(async () => { field.value = 'en'; field.dispatchEvent(new Event('change', { bubbles: true })) });
    expect(writes).toEqual([{ interfaceLanguage: 'en' }]);
    expect(synced).toEqual([]);
    await answer.release({ ok: success, status: success ? 200 : 500,
      json: async () => success ? { interfaceLanguage: 'en' } : { error: 'Save failed' } });
    await settle();
    expect(synced).toEqual(success ? ['en'] : []);
    expect(failure).toHaveBeenCalledTimes(success ? 0 : 1);
  });
  it('Five sections are organized by use case, and the Peach configuration entry respects device permissions', async () => {
    const current = await setup();
    const openConfiguration = vi.fn();
    current.host.openConfiguration = openConfiguration;
    const panel = await open(current, 'JAV & new releases');
    expect([...panel.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent))
      .toEqual(['Appearance & navigation', 'Browsing & playback', 'JAV & new releases', 'Search & recommendations', 'Content display']);
    expect(panel.querySelector('#javImageSetting')?.closest('section')?.hidden).toBe(false);
    expect(panel.querySelector('#detailAutoplaySetting')?.closest('section')?.hidden).toBe(true);
    expect(panel.querySelector('#videoThumbnailSetting')).toBeNull();
    expect(panel.querySelector('#followScheduleSetting')).toBeNull();
    /* Volume and edition collapsing applies on both the home and profile page grids, under "browsing and playback"; the new release count goes under "JAV and new releases". */
    const group = (selector: string) => panel.querySelector(selector)?.closest('[data-setting-group]')?.id;
    expect([group('#groupCollapseSetting'), group('#hoverDelaySetting'), group('#feedLimitSetting')])
      .toEqual(['settings-group-1', 'settings-group-1', 'settings-group-2']);
    const headings = (index: number) => [...panel.querySelectorAll(`#settings-group-${index} [data-settings-subheading]`)]
      .map((node) => node.textContent);
    expect([headings(1), headings(2)]).toEqual([['Video list', 'Playback'], ['Video display', 'New releases']]);
    /* The transcode method is service configuration on the machine running Peach and lives in the Peach config; this dialog has no row for it (ADR-0103). */
    expect(panel.querySelector('#playbackAccelerationSetting')).toBeNull();
    const entry = panel.querySelector<HTMLButtonElement>('[data-settings-service] button')!;
    expect(entry.disabled).toBe(true);
    await click(entry);
    expect(openConfiguration).not.toHaveBeenCalled();
    await close(current);
    current.host.configurable = async () => true;
    await open(current);
    await settle();
    expect(panel.querySelector('#playbackAccelerationSetting')).toBeNull();
    expect(entry.disabled).toBe(false);
    await click(entry);
    await settle();
    expect(openConfiguration).toHaveBeenCalledTimes(1);
    expect(panel.hidden).toBe(true);
  });

  it('Each toggle persists to disk once and reports only its own effect name', async () => {
    const current = await setup();
    const panel = await open(current);
    for (const [id, field, effect] of [
      ['uiSoundsSetting', 'uiSounds', 'uiSounds'], ['groupCollapseSetting', 'groupCollapse', 'groupCollapse'],
      ['miniplayerSetting', 'miniplayer', 'miniplayer'], ['feedAutoScrollSetting', 'feedAutoScroll', 'feedAutoScroll'],
    ] as const) {
      current.changed.mockClear();
      current.save.mockClear();
      await click(panel.querySelector(`#${id}`));
      expect([current.value[field], current.save.mock.calls.length, effects(current.changed)], id)
        .toEqual([false, 1, [effect]]);
    }
    /* Detail autoplay has nothing for the shell side to follow up on: it only persists, without reporting an effect. */
    current.changed.mockClear();
    await click(panel.querySelector('#detailAutoplaySetting'));
    expect([current.value.detailAutoplay, effects(current.changed)]).toEqual([true, []]);

    current.changed.mockClear();
    await click(panel.querySelector('#themeSetting input[value="dark"]'));
    expect([current.value.theme, effects(current.changed)]).toEqual(['dark', ['theme']]);
    await close(current);
  });

  it('New release count: committing on blur persists once, reports feedLimit, and out-of-range values are not committed', async () => {
    const current = await setup();
    const panel = await open(current, 'JAV & new releases');
    const input = panel.querySelector<HTMLInputElement>('#feedLimitSetting input[type=number]')!;
    const commit = (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    current.changed.mockClear();
    current.save.mockClear();
    await commit('101');
    expect([current.value.feedLimit, current.save.mock.calls.length, effects(current.changed)]).toEqual([12, 0, []]);
    await commit('30');
    expect([current.value.feedLimit, current.save.mock.calls.length, effects(current.changed)]).toEqual([30, 1, ['feedLimit']]);
    await close(current);
  });

  it('"Increase contrast" is a switch: pressing hands to the shell to flip the solid background', async () => {
    const current = await setup();
    const panel = await open(current);
    const contrast = panel.querySelector<HTMLInputElement>('#glassContrastSetting')!;
    expect([contrast.getAttribute('role'), panel.querySelector('label[for="glassContrastSetting"] b')?.textContent])
      .toEqual(['switch', 'Increase contrast']);
    await click(contrast);
    expect(current.setHighContrast.mock.calls).toEqual([[true]]);
    await close(current);
  });

  it('SFW shortcut is recorded by physical key position: pressing only a modifier key still waits, a missing modifier key explains why, the keypress doesn\'t land on the page, and Esc cancels', async () => {
    const current = await setup();
    const panel = await open(current, 'Content display');
    const row = [...panel.querySelectorAll<HTMLElement>('[data-setting-row]')].find((node) => node.textContent?.includes('SFW shortcut'))!;
    // Normally it is a single capsule; while recording it becomes a row of keycaps, each carrying its own state.
    const pill = () => row.querySelector('[data-shortcut-keys]')?.textContent;
    const caps = () => [...row.querySelectorAll<HTMLElement>('[data-keycap]')]
      .map((cap) => `${cap.textContent}:${cap.dataset.state}`);
    expect(pill()).toBe('Shift+S');
    expect(caps()).toEqual([]);
    const reachedPage = vi.fn();
    document.addEventListener('keydown', reachedPage);
    const press = async (init: KeyboardEventInit, type = 'keydown') => {
      await act(async () => { document.body.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })) });
    };
    const change = [...row.querySelectorAll('button')].find((button) => button.textContent === 'Change')!;
    await click(change);
    expect(caps()).toEqual(['Modifier key:slot', '键:slot']);
    // While a modifier is held, the keycap sinks in real time; release reverts it; leave a placeholder if the main key hasn't been pressed yet.
    await press({ code: 'ControlLeft', key: 'Control', ctrlKey: true });
    await press({ code: 'ShiftLeft', key: 'Shift', ctrlKey: true, shiftKey: true });
    expect(caps()).toEqual(['Ctrl:down', 'Shift:down', '键:slot']);
    expect(row.querySelector('small')?.textContent).toBe('Press a new key combo, Esc to cancel');
    await press({ code: 'ControlLeft', key: 'Control', shiftKey: true }, 'keyup');
    expect(caps()).toEqual(['Shift:down', '键:slot']);
    await press({ code: 'ShiftLeft', key: 'Shift' }, 'keyup');
    expect(caps()).toEqual(['Modifier key:slot', '键:slot']);
    await press({ code: 'KeyS', key: 's' });
    expect(caps()).toEqual(['S:invalid']);
    expect(row.querySelector('small')?.textContent).toContain('Include at least one modifier key');
    // On Mac, Option+S types out 'ß', but what's recorded is still KeyS; the recorded set flashes a success color briefly.
    await press({ code: 'KeyS', key: 'ß', altKey: true });
    expect(current.setSfwShortcut.mock.calls).toEqual([[{ code: 'KeyS', ctrl: false, alt: true, shift: false, meta: false }]]);
    expect(caps()).toEqual(['Alt:done', 'S:done']);
    expect(row.querySelector('small')?.textContent).toBe('Changed to Alt+S');
    expect(reachedPage).not.toHaveBeenCalled();
    await click([...row.querySelectorAll('button')].find((button) => button.textContent === 'Change')!);
    await press({ code: 'Escape', key: 'Escape' });
    expect(current.setSfwShortcut).toHaveBeenCalledTimes(1);
    expect([...row.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Change']);
    document.removeEventListener('keydown', reachedPage);
    await close(current);
  });

  it('Dragging the glow slider: each step only asks the shell to schedule one repaint frame and nothing persists; persistence happens only on release', async () => {
    const current = await setup();
    const panel = await open(current);
    const root = panel.querySelector<HTMLElement>('[data-glow-dial="strength"]')!;
    const slider = root.querySelector<HTMLElement>('[data-dial-slider]')!;
    root.querySelector<HTMLElement>('.ui-dial-track')!.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 10, width: 100, height: 10, x: 0, y: 0, toJSON: () => ({}) });
    current.changed.mockClear();
    current.save.mockClear();
    const pointer = (type: string, clientX: number) =>
      slider.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 }));
    await act(async () => {
      pointer('pointerdown', 10);
      pointer('pointermove', 20);
      pointer('pointermove', 30);
    });
    expect(current.save).not.toHaveBeenCalled();
    expect(effects(current.changed)).toEqual(['glowFrame', 'glowFrame', 'glowFrame']);
    expect(current.value.homeGlow.strength).toBe(30);
    await act(async () => { pointer('pointerup', 30) });
    expect(current.save).toHaveBeenCalledTimes(1);
    expect(effects(current.changed)).toEqual(['glowFrame', 'glowFrame', 'glowFrame']);
    await close(current);
  });

  it('Closing and reopening gets the same panel tree: the DOM is built once and the glow parameters area never rebuilds', async () => {
    const current = await setup();
    const panel = await open(current);
    const glow = panel.querySelector('#homeGlowControls');
    const dial = panel.querySelector('[data-glow-dial="speed"]');
    await close(current);
    expect(panel.hidden).toBe(true);
    const again = await open(current, 'Browsing & playback');
    expect(document.querySelectorAll('[data-settings-host]')).toHaveLength(1);
    expect(again).toBe(panel);
    expect(again.querySelector('#homeGlowControls')).toBe(glow);
    expect(again.querySelector('[data-glow-dial="speed"]')).toBe(dial);
    await close(current);
  });
});

describe('Resident components', () => {
  it('First load: no host and a null handle before painting; after painting the host sits at the end of body, not wrapped in .peach-react, with the panel collapsed, and only then is the handle handed out', async () => {
    const r = await load();
    await mountRouter(r);
    const shell = panelHost();
    let loaded: Promise<SettingsPanelApi> | null = null;
    await act(async () => { loaded = r.islands.loadSettingsPanel(shell.host) });
    expect(settingsRoot(), 'The route tree has not attached fetching yet and the host is not in the document').toBeNull();
    expect(r.islands.settingsPanelApi()).toBeNull();

    await connect(r);
    let api: SettingsPanelApi | null = null;
    await act(async () => { api = await loaded });
    expect(r.islands.settingsPanelApi()).toBe(api);
    const host = settingsRoot()!;
    expect(host.parentElement).toBe(document.body);
    expect(document.body.lastElementChild).toBe(host);
    expect(r.managedEntry(host)?.path).toBe('settings-panel');
    expect(host.querySelector(':scope > .peach-react')).toBeNull();
    const panel = host.querySelector<HTMLElement>(':scope > section#settingsPanel')!;
    expect(panel.hidden).toBe(true);
    expect(api!.isOpen()).toBe(false);
    expect(shell.attached.mock.calls, 'The left column\'s glass attaches once when the panel first enters the DOM').toEqual([[panel]]);
  });

  it('When open returns the panel is painted, isOpen is true, and the page is locked; focus lands on the close button within the same microtask, and closing returns it to the element focused before opening', async () => {
    const current = await setup();
    const trigger = document.createElement('button');
    document.body.prepend(trigger);
    trigger.focus();
    /* No act wrapper: act defers flushSync to its end, which hides whether the handle flushed synchronously on its own. */
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    current.api.open('Browsing & playback');
    const panel = document.querySelector<HTMLElement>('#settingsPanel')!;
    expect([panel.hidden, panel.querySelector('#settingsTitle')?.textContent, current.api.isOpen()])
      .toEqual([false, 'Browsing & playback', true]);
    expect([document.documentElement.style.overflow, document.body.classList.contains('settings-open')])
      .toEqual(['hidden', true]);
    expect(document.activeElement).toBe(trigger);
    await Promise.resolve();
    expect(document.activeElement?.id).toBe('settingsClose');

    current.api.close();
    expect([panel.hasAttribute('data-closing'), current.api.isOpen()]).toEqual([true, true]);
    await Promise.resolve();
    expect([panel.hidden, current.api.isOpen(), document.documentElement.style.overflow,
      document.body.classList.contains('settings-open')]).toEqual([true, false, '', false]);
    expect(document.activeElement).toBe(trigger);
    await settle();
  });

  it('A throw unmounts only the component and the host stays, so the batch bar still renders; the handle stays callable and does not throw, reporting once', async () => {
    const reported = watchReports();
    const current = await setup();
    const host = settingsRoot()!;
    const dockRoot = document.createElement('div');
    dockRoot.setAttribute('data-batch-dock', '');
    document.body.append(dockRoot);
    let dock!: BatchDockApi;
    await act(async () => { dock = await current.r.islands.loadBatchDock({ root: dockRoot, run: vi.fn() }) });

    glyph.broken = true;
    await act(async () => { current.api.open() });
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(expect.objectContaining({ message: 'The settings panel never paints' }));
    expect(host.isConnected, 'The host never withdraws').toBe(true);
    expect(host.childNodes.length, 'Component unmounted').toBe(0);
    expect(current.r.managedTaken(host)).toBe(false);
    expect(current.r.managedEntries().map((entry) => entry.path), 'Other faces still drawn').toEqual(['batch-dock']);
    await act(async () => { dock.render({ count: 2, context: 'catalog', junkDismissed: false }) });
    expect(dockRoot.querySelector('[data-selection-dock] [role="status"]')?.textContent).toBe('Selected 2 items');

    /* The shell still collapses via Escape and opens via the gear: no throw, no reopen, no further reports. */
    await act(async () => { expect(() => current.api.close()).not.toThrow() });
    await settle();
    glyph.broken = false;
    await act(async () => { expect(() => current.api.open('Browsing & playback')).not.toThrow() });
    await settle();
    expect(reported, 'The deterministic throw is reported only once').toHaveBeenCalledTimes(1);
    expect(host.childNodes.length, 'Stays empty until refresh, no self-healing').toBe(0);
    await act(async () => { current.api.close() });
    await settle();
  });
});
