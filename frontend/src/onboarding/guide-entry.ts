import { ROUTE_META } from '../history/route-meta';
import { PREFERENCE_SECTIONS, CONFIGURATION_SECTIONS } from '../history/settings-route';
import { JAV_TABS } from '../react/jav/jav-navigation';
import type { GuideStep } from './guide-catalog';

export interface GuideEntry { path: readonly string[]; hint?: string }
const sidebarHint = 'With the sidebar collapsed, tap the navigation button in the top-left first.';
const sidebar = (...path: string[]): GuideEntry => ({ path: ['Sidebar', ...path], hint: sidebarHint });
const preferences = (title: string): GuideEntry => ({ path: ['Settings at the bottom of the sidebar', title], hint: sidebarHint });

/** Describe the real click path; page and settings names reuse the app's definitions, and URLs aren't treated as operating instructions. */
export function guideEntry(step: GuideStep): GuideEntry | undefined {
  if (step.surface) {
    if (step.id === 'external') return { path: ['Title cards', 'Video details', 'External player'] };
    if (step.surface === 'subtitles') return { path: ['Title cards', 'The player\'s gear', 'Subtitles'] };
    if (step.surface === 'player') return { path: ['Title cards', 'The player\'s bottom control bar'] };
    return { path: ['Home', 'Click a title card', 'Video details'] };
  }
  if (!step.route) return undefined;
  const [pathname = '/', query = ''] = step.route.split('#')[0]!.split('?');
  const key = pathname.split('/')[2];
  if (pathname.startsWith('/settings/')) {
    const preference = PREFERENCE_SECTIONS[key as keyof typeof PREFERENCE_SECTIONS];
    if (preference) return preferences(preference);
    const configuration = CONFIGURATION_SECTIONS[key as keyof typeof CONFIGURATION_SECTIONS];
    if (configuration) return { path: ['Settings at the bottom of the sidebar', 'Peach configuration', configuration], hint: sidebarHint };
  }
  const params = new URLSearchParams(query);
  if (pathname === '/jav' || params.get('jav') === '1') {
    const tab = JAV_TABS.find(([id]) => id === (params.get('tab') || 'library'));
    return sidebar('JAV', tab?.[1] || JAV_TABS[0][1]);
  }
  if (pathname === '/') {
    switch (step.id) {
      case 'search': return { path: ['Top of the page', 'Search'], hint: 'On a phone tap the magnifier first, then type your keywords.' };
      case 'navigation': return { path: ['The navigation button in the top-left', 'Browsing entries in the sidebar'] };
      case 'library': return { path: ['Top of the sidebar', 'The library selector'], hint: sidebarHint };
      case 'preferences': return preferences(PREFERENCE_SECTIONS.appearance);
      case 'wall': return { path: ['Top of the page', 'The video-wall button'] };
      case 'immerse': return { path: ['Top of the page', 'The immersive-mode button'] };
      case 'cards': case 'detail': return { path: ['Home', 'Click a title card', 'Video details'] };
      case 'player': return { path: ['Home', 'Click a title card', 'Play entries'], hint: 'Once playback starts, pick subtitles and playback options in the player.' };
      case 'filter': return { path: ['Home', 'The filters and sorting above the list'], hint: 'More filters — source, duration, and friends — live in the sidebar.' };
    }
    return sidebar('Home');
  }
  if (['/review', '/quality-goals', '/trash'].includes(pathname)) {
    return sidebar('Manage', ROUTE_META['/data-cleanup']!.title!, ROUTE_META[pathname]!.title!);
  }
  const meta = ROUTE_META[pathname];
  if (meta?.nav && meta.title) {
    const entry = sidebar(meta.title);
    if (pathname === '/playlists') entry.hint = 'If the sidebar has no playlists, add one under Settings → Appearance and navigation → Navigation entries and order; expand the sidebar first on a phone.';
    return entry;
  }
  if (meta?.section && meta.title) return sidebar('Manage', meta.title);
  return undefined;
}
