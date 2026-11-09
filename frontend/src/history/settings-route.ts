export const PREFERENCE_SECTIONS = {
  appearance: 'Appearance & navigation', playback: 'Browsing & playback', jav: 'JAV & new releases', search: 'Search & recommendations', content: 'Content display',
} as const;
export const CONFIGURATION_SECTIONS = {
  library: 'Library and imports', subscriptions: 'Sources and subscriptions', downloads: 'Download channels', network: 'Network & access', maintenance: 'App and maintenance',
  diagnostics: 'System diagnostics',
} as const;
export type ConfigurationPath = `/settings/${keyof typeof CONFIGURATION_SECTIONS}`;
/** 「应用与维护」之下的子页：升级后的修复与迁移。不进配置分区页签，从「自动修复」进入，页头画面包屑。 */
export const REPAIR_CENTER_PATH = '/settings/maintenance/repairs' as const;
/** 设置分区那一层的地址（`/settings/<分区>`）；分区之下的子页不算。 */
export const isSettingsSectionPath = (path: string): boolean => /^\/settings\/[^/]+$/.test(path);
export function configurationSection(path: string): string {
  return CONFIGURATION_SECTIONS[path.split('/')[2] as keyof typeof CONFIGURATION_SECTIONS] || CONFIGURATION_SECTIONS.library;
}
export const PREFERENCE_PATHS = ['/settings', ...Object.keys(PREFERENCE_SECTIONS).map(key => `/settings/${key}`)];
export const isPreferencePath = (path: string): boolean => PREFERENCE_PATHS.includes(path);
export function preferenceSection(path: string): string {
  return PREFERENCE_SECTIONS[path.split('/')[2] as keyof typeof PREFERENCE_SECTIONS] || PREFERENCE_SECTIONS.appearance;
}
export function settingsPath(title: string): string {
  const key = Object.entries({ ...PREFERENCE_SECTIONS, ...CONFIGURATION_SECTIONS }).find(([, value]) => value === title)?.[0];
  return `/settings/${key || 'appearance'}`;
}
export interface SettingsBackground {
  pathname: string; search: string; state: unknown; seq: number;
}
export const settingsBackgroundOf = (state: unknown): SettingsBackground | null => {
  const background = (state as { settingsBackground?: SettingsBackground } | null)?.settingsBackground;
  return background && typeof background.pathname === 'string' ? background : null;
};
