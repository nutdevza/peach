/* Column definitions for the video list and where local column preferences are stored. No React dependency: the shell's first-screen skeleton and the list island read the same copy. */

export const CATALOG_COLUMN_WIDTHS_KEY = 'peach.catalog-column-widths.v1';
export const CATALOG_COLUMN_VISIBILITY_KEY = 'peach.catalog-column-visibility.v1';

export const columnSizes: Record<string, { width: number; min: number; max: number }> = {
  select: { width: 48, min: 48, max: 48 },
  name: { width: 300, min: 240, max: 2000 },
  people: { width: 220, min: 160, max: 400 },
  library: { width: 112, min: 96, max: 320 },
  tags: { width: 156, min: 144, max: 560 },
  dur: { width: 88, min: 80, max: 240 },
  rating: { width: 168, min: 168, max: 320 },
  plays: { width: 96, min: 96, max: 240 },
  new: { width: 152, min: 144, max: 320 },
  release: { width: 120, min: 112, max: 320 },
  played: { width: 152, min: 144, max: 320 },
  o: { width: 96, min: 96, max: 240 },
  resolution: { width: 120, min: 112, max: 320 },
  size: { width: 96, min: 88, max: 240 },
  code: { width: 144, min: 112, max: 400 },
};

/* By default shows what browsing usually looks at: work, artist, library, tags, duration, rating, view count, added time — just fits at 1440 wide;
 * release time, watched time, climax count, resolution, size, and catalog number (already in the title) are collapsed by default; open them in "Show columns".
 * Column order follows this same order; the table and skeleton both lay out per `catalogColumns`. */
export const defaultColumnVisibility: Record<string, boolean> = { release: false, played: false, o: false, resolution: false, size: false, code: false };
const labels: Record<string, string> = { select: 'Select', name: 'Videos', dur: 'Duration', size: 'Size', resolution: 'Resolution',
  rating: 'Rating', o: 'Climax count', plays: 'Watch count', new: 'Date added', played: 'Watch time', release: 'Release date', code: 'Code', tags: 'Tags',
  library: 'Media library', people: 'Artists' };
export const catalogColumns = ['select', 'name', 'people', 'library', 'tags', 'dur', 'rating', 'plays', 'new', 'release', 'played', 'o', 'resolution', 'size', 'code']
  .map(id => ({ id, label: labels[id]!, ...columnSizes[id]!, flex: id === 'name', required: id === 'select' || id === 'name', visible: defaultColumnVisibility[id] !== false }));

function stored(key: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {} }
}

export interface SnapshotColumn { id: string; label: string; width: number; min: number; max: number; flex: boolean; required: boolean; visible: boolean }
export type TableSnapshot = { id: string; label: string; width: number | null; min: number }[];

/** The first-screen skeleton lays out by the current column preference: it reads only stored widths and visibility, matching the table's resolution rules;
 *  a column with empty `width` is the one absorbing leftover space, and `min` is the width it will not shrink below. The checkbox column exists only in selection mode and is not drawn. */
export function catalogTableSnapshot(): TableSnapshot {
  return tableSnapshot(catalogColumns, CATALOG_COLUMN_WIDTHS_KEY, CATALOG_COLUMN_VISIBILITY_KEY);
}

/** Same as above, but fetch one for another table (the JAV New Releases list) using its own column definitions and preference key. */
export function tableSnapshot(columns: readonly SnapshotColumn[], widthsKey: string, visibilityKey: string): TableSnapshot {
  const widths = stored(widthsKey);
  const shown = stored(visibilityKey);
  return columns
    .filter(column => column.id !== 'select'
      && (column.required || (typeof shown[column.id] === 'boolean' ? shown[column.id] === true : column.visible)))
    .map(column => {
      const saved = widths[column.id];
      const custom = typeof saved === 'number' && Number.isFinite(saved) && !(column.flex && saved === column.width);
      return {
        id: column.id, label: column.label, min: column.width,
        width: custom ? Math.max(column.min, Math.min(column.max, saved)) : column.flex ? null : column.width,
      };
    });
}
