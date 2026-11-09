/* Media library source colors: a color binds to `library_id`, stored in configuration's `media.library_catalog`
 * (ADR-0116), uncolored by default.
 * Cards and list rows only carry `data-library`; the color comes from a stylesheet injected here setting `--library-color`,
 * so each card need not re-render.
 *
 * The media library list comes from `library-catalog`: the shell fetches once per load and this module sends no requests of
 * its own; only where the shell is absent (tests, standalone islands) does displaying a media library name fetch by itself.
 * First screen colors from the machine's cached last colors.
 * Color values are not re-declared: each tier takes that `[data-accent-ball=...]` group's `--color-accent-500`, same source as
 * the settings panel's color balls. */
import { useSyncExternalStore } from 'react';
import { MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';
import { apiGet } from '../../api';
import { cachedLibraryColors, onLibraries, publishLibraries, publishedLibraries, type LibraryRow } from '../../library-catalog';

export interface LibraryTint { id: string; name: string; icon: string; location: string; color: string }

let tints: ReadonlyMap<string, LibraryTint> = new Map();
let requested = false;
const listeners = new Set<() => void>();

function accentValue(key: string): string {
  const probe = document.createElement('span');
  probe.setAttribute('data-accent-ball', key);
  probe.hidden = true;
  document.body.append(probe);
  const value = getComputedStyle(probe).getPropertyValue('--color-accent-500').trim();
  probe.remove();
  return value;
}

function paint(next: ReadonlyMap<string, LibraryTint>) {
  tints = next;
  let sheet = document.getElementById('peach-library-tints');
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = 'peach-library-tints';
    document.head.append(sheet);
  }
  sheet.textContent = [...tints.values()].filter(tint => tint.color)
    .map(tint => `[data-library="${CSS.escape(tint.id)}"]{--library-color:${accentValue(tint.color)}}`).join('\n');
}

function publish(next: ReadonlyMap<string, LibraryTint>) {
  paint(next);
  listeners.forEach(listener => listener());
}

// Icon names resolve through the same table as the sidebar's library switcher: source names take the source logo, the rest are sprite glyphs.
const fromRows = (rows: readonly LibraryRow[]) => new Map(rows.map(row => [row.id, {
  id: row.id, name: row.name, icon: MEDIA_SOURCE_ICONS[row.icon || ''] || row.icon || 'database',
  location: row.roots?.[0]?.location || '', color: row.color || '',
}]));

let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  onLibraries(rows => publish(fromRows(rows)));
  const known = publishedLibraries();
  if (known) { paint(fromRows(known)); return }
  const colors = Object.entries(cachedLibraryColors()).filter(([, color]) => color);
  if (colors.length) paint(new Map(colors.map(([id, color]) => [id, { id, name: '', icon: 'database', location: '', color }])));
}

function load() {
  if (requested || publishedLibraries()) return;
  requested = true;
  void apiGet<{ libraries?: LibraryRow[] }>('/api/libraries')
    .then(body => publishLibraries(body.libraries || []))
    .catch(() => { requested = false });
}

/** When changing color on the settings page, preview on this page first; after saving the server's color takes over. */
export function previewLibraryColor(id: string, color: string) {
  const current = tints.get(id) ?? { id, name: '', icon: 'database', location: '', color: '' };
  publish(new Map([...tints, [id, { ...current, color }]]));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

/** Reads source color by `library_id`. Pass `names` where the library name and site badge are shown; only fetch `/api/libraries` once when the shell supplied no list. */
export function useLibraryTints({ names = false }: { names?: boolean } = {}): ReadonlyMap<string, LibraryTint> {
  seed();
  if (names) load();
  return useSyncExternalStore(subscribe, () => tints, () => tints);
}
