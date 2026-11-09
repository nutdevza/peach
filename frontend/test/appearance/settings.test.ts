/* Startup normalization of UI preferences and reconciliation of the page-level store with the database (`src/appearance/settings.ts`). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ACCENT, DEFAULT_HOME_GLOW } from '../../src/appearance/home-glow';
import {
  applySyncedSettings, DEFAULT_SETTINGS, normalizeAppSettings, readAppSettings, SETTINGS_KEY, type AppSettings,
} from '../../src/appearance/settings';
import { createSettingsStore } from '../../src/settings-store';
import { DEFAULT_SIDEBAR_ORDER } from '../../src/sidebar';

beforeEach(() => localStorage.clear());

describe('Start normalization', () => {
  it('With nothing stored you get the factory set, and booleans each carry their own default', () => {
    const { settings, migrated } = normalizeAppSettings({});
    expect(migrated).toBe(false);
    expect(settings).toMatchObject({
      ...DEFAULT_SETTINGS, sidebarOrder: [...DEFAULT_SIDEBAR_ORDER], homeGlow: DEFAULT_HOME_GLOW, accent: DEFAULT_ACCENT,
      followInitialDays: 30, detailAutoplay: true, uiSounds: true, feedAutoScroll: true,
      feedHideGroupCompilations: true, feedHideSoloCompilations: false, feedHideExcerpts: true,
      /* JAV layouts and the performer index default to large images; the photo wall shows dozens per set, so it uses small ones to show the whole picture first. */
      homeLayout: 'small', javLayout: 'big', peopleLayout: 'big', photoSize: 'small',
      ambientMode: true, miniplayer: true, theaterMode: false, theme: 'system', groupCollapse: true,
    });
  });

  it('An unrecognized entry falls back to the factory tier while the rest stay', () => {
    const { settings } = normalizeAppSettings({
      batchSize: 0, defaultSort: 'nope', hoverDelaySeconds: 61, seekSeconds: 2.5, searchHistoryLimit: 51, relatedLimit: -1,
      feedLimit: 101, theme: 'sepia', followInitialDays: 14, metadataRefreshDays: '7', accent: 'teal', homeLayout: 'big', ambientMode: 0,
      theaterMode: 'yes', miniplayer: false, feedHideSoloCompilations: 'true',
    });
    expect(settings).toMatchObject({
      batchSize: 60, defaultSort: 'seed', hoverDelaySeconds: 5, seekSeconds: 10, searchHistoryLimit: 10, relatedLimit: 20,
      feedLimit: 12, theme: 'system', followInitialDays: 30, accent: 'teal', homeLayout: 'big', ambientMode: true,
      theaterMode: false, miniplayer: false, feedHideSoloCompilations: false,
    });
  });

  it('Keys the UI no longer has never linger on the object', () => {
    const { settings } = normalizeAppSettings({ rotateMinutes: 5, loginDays: 30, metadataRefreshDays: 7, followImagesOnly: true });
    expect('metadataRefreshDays' in settings).toBe(false);
    expect(['rotateMinutes' in settings, 'loginDays' in settings, settings.followImagesOnly]).toEqual([false, false, true]);
  });

  it('A default sort stored by an older version is remapped to the current key and reports one persist; a user-chosen one is untouched', () => {
    expect(normalizeAppSettings({ defaultSort: 'new', sortDefaultsVersion: 1 })).toMatchObject(
      { settings: { defaultSort: 'seed', sortDefaultsVersion: 3 }, migrated: true });
    expect(normalizeAppSettings({ defaultSort: 'long', sortDefaultsVersion: 2 })).toMatchObject(
      { settings: { defaultSort: 'dur' }, migrated: true });
    expect(normalizeAppSettings({ defaultSort: 'new', sortDefaultsVersion: 3 })).toMatchObject(
      { settings: { defaultSort: 'new' }, migrated: false });
    /* The version is already 3 yet an old key survives, meaning the origin is not one migration recognizes: fall back to random per the whitelist, without rewriting it into another column. */
    expect(normalizeAppSettings({ defaultSort: 'long', sortDefaultsVersion: 3 })).toMatchObject(
      { settings: { defaultSort: 'seed' }, migrated: false });
  });

  it('The JAV layout\'s old value merges into the current two tiers; the "preview" tier brings switching the default cover to the preview image', () => {
    expect(normalizeAppSettings({ javLayout: 'preview' }).settings).toMatchObject({ javLayout: 'small', javImage: 'thumbnail' });
    expect(normalizeAppSettings({ javLayout: 'sleeve', javImage: 'bogus' }).settings).toMatchObject({ javLayout: 'small', javImage: 'cover' });
  });

  it('Anything that is not valid JSON counts as nothing stored', () => {
    const storage = { getItem: (key: string) => (key === SETTINGS_KEY ? '{broken' : null) };
    expect(readAppSettings(storage).settings).toMatchObject({ batchSize: 60, theme: 'system' });
  });
});

describe('The whole-page store', () => {
  it('The first read loads and normalizes, later reads get the same object; rewriting a legacy key persists once, on the spot', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ defaultSort: 'short', sortDefaultsVersion: 2, theme: 'dark' }));
    vi.resetModules();
    const { appSettingsStore } = await import('../../src/appearance/settings');
    const store = appSettingsStore();
    expect(appSettingsStore()).toBe(store);
    expect(store.value).toMatchObject({ defaultSort: 'dur', theme: 'dark' });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({ defaultSort: 'dur', sortDefaultsVersion: 3 });
  });
});

describe('The database copy lands in the local cache', () => {
  const stage = (patch: Partial<AppSettings> = {}) => {
    const store = createSettingsStore(SETTINGS_KEY, { ...normalizeAppSettings({}).settings, ...patch });
    const changed = vi.fn();
    return { store, changed, save: vi.spyOn(store, 'save') };
  };

  it('Valid values are persisted and unrecognized ones are untouched; only when the search history count changes does the shell push to the search island', () => {
    const { store, changed } = stage();
    applySyncedSettings({
      followInitialDays: 7, feedHideSoloCompilations: true, feedHideExcerpts: 'no',
      searchHistoryLimit: 25, sidebarOrder: ['jav', ''],
    }, changed, store);
    expect(store.value).toMatchObject({
      followInitialDays: 7, feedHideSoloCompilations: true, feedHideExcerpts: true,
      searchHistoryLimit: 25, sidebarOrder: ['jav', ''],
    });
    expect(changed.mock.calls).toEqual([['searchHistoryLimit']]);
    changed.mockClear();
    applySyncedSettings({ searchHistoryLimit: 25, followInitialDays: 3 }, changed, store);
    expect([changed.mock.calls.length, store.value.followInitialDays]).toEqual([0, 7]);
  });

  it('While the database has no count yet, the number this device changed is uploaded once; an unchanged one is not sent', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetch);
    applySyncedSettings({ searchHistoryLimit: null }, vi.fn(), stage().store);
    expect(fetch).not.toHaveBeenCalled();
    applySyncedSettings({ searchHistoryLimit: null }, vi.fn(), stage({ searchHistoryLimit: 3 }).store);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect([path, init.method, JSON.parse(String(init.body))]).toEqual(['/api/settings', 'POST', { searchHistoryLimit: 3 }]);
    vi.unstubAllGlobals();
  });

  it('Name preference defers to the database and only updates the local cache and display when the value changes', () => {
    const { store, changed, save } = stage({ performerNameLanguage: 'ja' });
    applySyncedSettings({ performerNameLanguage: 'zh-CN' }, changed, store);
    expect(store.value.performerNameLanguage).toBe('zh-CN');
    expect(save).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls).toEqual([['performerNameLanguage']]);
    applySyncedSettings({ performerNameLanguage: 'zh-CN' }, changed, store);
    applySyncedSettings({ performerNameLanguage: 'unsupported' }, changed, store);
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.value.performerNameLanguage).toBe('zh-CN');
  });

  it('The interface language follows the database, is written to disk only when changed and handed to the shell to reload, and unknown values are dropped', () => {
    const { store, changed, save } = stage({ interfaceLanguage: 'zh-CN' });
    applySyncedSettings({ interfaceLanguage: 'en' }, changed, store);
    expect([store.value.interfaceLanguage, save.mock.calls.length, changed.mock.calls]).toEqual(['en', 1, [['interfaceLanguage']]]);
    applySyncedSettings({ interfaceLanguage: 'en' }, changed, store);
    applySyncedSettings({ interfaceLanguage: 'fr' }, changed, store);
    expect([store.value.interfaceLanguage, save.mock.calls.length]).toEqual(['en', 1]);
    expect(normalizeAppSettings({ interfaceLanguage: 'fr' }).settings.interfaceLanguage).toBe('auto');
    expect(normalizeAppSettings({}).settings.interfaceLanguage).toBe('auto');
  });

  it('The system language reported by the server is cached locally; when it changes the shell also decides whether to reload', () => {
    const { store, changed, save } = stage({ interfaceLanguage: 'auto' });
    applySyncedSettings({ interfaceLanguage: 'auto', systemLanguage: 'zh-TW' }, changed, store);
    expect([store.value.systemLanguage, save.mock.calls.length, changed.mock.calls]).toEqual(['zh-CN', 1, [['interfaceLanguage']]]);
    applySyncedSettings({ interfaceLanguage: 'auto', systemLanguage: 'zh-CN' }, changed, store);
    applySyncedSettings({ interfaceLanguage: 'auto' }, changed, store);
    expect([store.value.systemLanguage, save.mock.calls.length]).toEqual(['zh-CN', 1]);
    applySyncedSettings({ interfaceLanguage: 'auto', systemLanguage: null }, changed, store);
    expect([store.value.systemLanguage, save.mock.calls.length]).toEqual([null, 2]);
  });

  it('An unchanged sidebar order never persists', () => {
    const { store, save, changed } = stage();
    applySyncedSettings({ sidebarOrder: [...store.value.sidebarOrder] }, changed, store);
    applySyncedSettings({ sidebarOrder: [] }, changed, store);
    applySyncedSettings(null, changed, store);
    expect(save).not.toHaveBeenCalled();
  });

  it('New clients and existing caches both adopt the navigation and library order saved by the instance', () => {
    const fresh = stage();
    const cached = stage({ navigationOrders: { tags: ['local', 'online'] }, libraryOrder: ['a', 'b'] });
    const instance = { navigationOrders: { tags: ['online', 'local'] }, libraryOrder: ['b', 'a'] };
    for (const client of [fresh, cached]) {
      applySyncedSettings(instance, client.changed, client.store);
      expect(client.store.value.navigationOrders.tags).toEqual(['online', 'local']);
      expect(client.store.value.libraryOrder).toEqual(['b', 'a']);
      applySyncedSettings({ navigationOrders: { tags: ['local', 'online'] }, libraryOrder: [] }, client.changed, client.store);
      expect(client.store.value.navigationOrders.tags).toEqual(['local', 'online']);
      expect(client.store.value.libraryOrder).toEqual([]);
    }
  });
});
