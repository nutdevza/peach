/* The column definitions for the JAV new-releases list and where local column preferences are stored. No React dependency: the route skeleton and the list read the same copy. */
import { tableSnapshot, type TableSnapshot } from '../catalog-grid/catalog-table-columns';
import type { ReleaseSort } from './discovery-sorts';

export const RELEASE_COLUMN_WIDTHS_KEY = 'peach.table.jav-releases.widths.v1';
export const RELEASE_COLUMN_VISIBILITY_KEY = 'peach.table.jav-releases.visibility.v1';

const sizes: Record<string, { width: number; min: number; max: number }> = {
  name: { width: 300, min: 240, max: 2000 },
  people: { width: 220, min: 160, max: 400 },
  studio: { width: 128, min: 112, max: 320 },
  tags: { width: 156, min: 144, max: 560 },
  release: { width: 112, min: 104, max: 240 },
  dur: { width: 88, min: 80, max: 200 },
  score: { width: 96, min: 96, max: 200 },
  actions: { width: 184, min: 184, max: 320 },
  code: { width: 128, min: 112, max: 320 },
};
const labels: Record<string, string> = { name: 'Videos', people: 'Artists', studio: 'Labels', tags: 'Tags', code: 'Code',
  dur: 'Duration', score: 'Source rating', release: 'Release date', actions: 'Actions' };

/** The header columns that are sortable map to the New Releases API's sort keys; the other columns aren't sortable. */
export const RELEASE_SORT_COLUMNS: Record<string, ReleaseSort> = { code: 'code', dur: 'duration', score: 'source_score', release: 'release_date' };

/* Column order: works, artists, labels, tags, then release date, duration, and source score (the most common sorts for new releases), with actions last; the code is already in the title,
 * so it is collapsed by default. The default columns fit exactly at 1440 width. */
export const releaseColumns = ['name', 'people', 'studio', 'tags', 'release', 'dur', 'score', 'actions', 'code']
  .map(id => ({ id, label: labels[id]!, ...sizes[id]!, flex: id === 'name', required: id === 'name', visible: id !== 'code' }));

export function releaseTableSnapshot(): TableSnapshot {
  return tableSnapshot(releaseColumns, RELEASE_COLUMN_WIDTHS_KEY, RELEASE_COLUMN_VISIBILITY_KEY);
}
