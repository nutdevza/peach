/* The seam between the settings panel (resident component `settings-panel`, `settings-panel.tsx`) and the shell.
 *
 * UI preferences have one copy: the `appSettings` normalized by the shell at startup, passed in via `createSettingsStore`
 * (`frontend/src/settings-store.ts`). The panel reads `store.value`, mutates fields in place, persists with `store.save()`,
 * and uses `changed(effect)` to tell the shell what this change requires: re-rendering the grid, refetching the catalog,
 * switching themes, all still the shell's business; sidebar order does not go through it, the sidebar subscribes to this
 * store itself. The items that follow the database (sidebar order, compilation switch, first-collection scope, avatar
 * refresh, search history count) are written by the panel through `/api/settings`, and on success land in the same object. */
import type { InterfaceLanguage, InterfaceLanguageChoice } from '../../i18n';
import type { HomeGlow } from '@peach/appearance';

import type { SettingsStore } from '../../settings-store';
import type { Shortcut } from '../../keyboard-shortcut';
import type { SyncedSettings } from './settings-data';

/** The items the panel reads and writes; the object has other fields the panel never touches. */
export interface PanelSettings {
  theme: string;
  uiSounds: boolean;
  homeGlow: HomeGlow;
  /** Picking a preset swatch also switches the accent color (`chooseGlowPreset` in `@peach/appearance`). */
  accent: string;
  sidebarOrder: string[];
  batchSize: number;
  defaultSort: string;
  defaultSortDirection: string;
  groupCollapse: boolean;
  javImage: string;
  performerNameLanguage: 'zh-CN' | 'ja';
  interfaceLanguage: InterfaceLanguageChoice;
  systemLanguage: InterfaceLanguage | null;
  feedAutoScroll: boolean;
  feedLimit: number;
  feedHideGroupCompilations: boolean;
  feedHideSoloCompilations: boolean;
  feedHideExcerpts: boolean;
  hoverDelaySeconds: number;
  detailAutoplay: boolean;
  miniplayer: boolean;
  seekSeconds: number;
  relatedLimit: number;
  searchHistoryLimit: number;
  followInitialDays: number;
  avatarRefreshDays: number;
  faviconRefreshDays: number;
}

/** What the shell must do after one setting changes, one name per item; persisting to disk is already handled by the panel. */
export type SettingsEffect =
  | 'theme' | 'uiSounds'
  /** Each step of dragging the glow slider: schedule one repaint of the sidebar layer only, never touching the root. */
  | 'glowFrame'
  /** The glow's toggle, color, reset to default, and release: the sidebar layer, the other glass surfaces and the sidebar color button all align together. */
  | 'glow'
  | 'batchSize' | 'defaultSort' | 'sortDirection' | 'hoverDelay' | 'seekSeconds'
  | 'groupCollapse' | 'feedAutoScroll' | 'feedLimit' | 'feedCompilations' | 'miniplayer' | 'javImage'
  | 'searchHistoryLimit' | 'performerNameLanguage';

/** `[value, display name, glyph]`, the same shape as every option table in the shell. */
export type Choice = readonly [value: string, label: string, icon?: string];

export interface SettingsPanelHost {
  selectSection?(section: string): void;
  closed?(): void;
  store: SettingsStore<PanelSettings>;
  changed(effect: SettingsEffect): void;
  sound(name: 'whoosh' | 'toggle-on'): void;
  /** Every entry the sidebar can hold, `[key, name, glyph]`; the home item's key is an empty string. */
  navCatalog: readonly Choice[];
  themeOptions: readonly Choice[];
  videoLayouts: readonly Choice[];
  followInitialRanges: readonly Choice[];
  /** The video cover's default size follows the current page (home and JAV each store one), and the shell owns both reads and writes. */
  videoLayout(): string;
  setVideoLayout(layout: string): void;
  /** SFW and increased contrast each have their own keys and are not in `appSettings`; after a change the shell calls `store.notify()`. */
  censored(): boolean;
  setCensored(on: boolean): void;
  /** The SFW toggle key, stored locally, not synced; pass null to restore the default. After changing, the shell calls store.notify(). */
  sfwShortcut(): Shortcut;
  setSfwShortcut(shortcut: Shortcut | null): void;
  highContrast(): boolean;
  setHighContrast(on: boolean): void;
  receipt(message: string): void;
  failure(message: string, error: unknown): void;
  /** The database copy is reconciled against the local cache (`applySyncedSettings` in the shell); at startup the shell itself walks this same path. */
  syncRemote(remote: SyncedSettings): void;
  openConfiguration(): void;
  /** The panel enters the DOM for the first time: the left column's glass needs its refraction texture attached. */
  attached(panel: HTMLElement): void;
  /** Whether this device allows config changes (`configurable` from `/healthz`); null when it cannot be fetched. */
  configurable(): Promise<boolean | null>;
}

export interface SettingsPanelApi {
  /** Open the panel; when `section` names an area ("appearance and navigation", "browsing and playback", ...), land directly on that page. */
  open(section?: string): void;
  close(notify?: boolean): void;
  isOpen(): boolean;
  /** When already open, scroll a given section into view (the color popover's "Advanced settings" lands on the glow parameters). */
  reveal(selector: string): void;
}
