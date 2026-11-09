/* Representatives table: performer and label names mapped to one video id whose avatar can be fetched.
 * Card bylines, Mix's stacked avatars and the immersive author read this table when an entity image is missing, falling back
 * to /avatar?id=.
 * catalog-bars.ts updates it after reading /api/tops through the shared QueryClient, and readers share one source instance.
 * Only videos with fetchable avatars are collected; has_avatar means the crop or contact sheet is usable and /avatar can
 * generate on demand. */

/** A round avatar from `/api/tops`: `k` is the name, `rep` the representative video id. */
export interface RepresentativeRow { k: string; rep?: number | null; has_avatar?: boolean }

const representatives = new Map<string, number>();

/** Records a batch of representative covers. Add-only: after a shuffle, the old cards on screen can still find their fallback. */
export function rememberRepresentatives(rows: readonly RepresentativeRow[] | null | undefined): void {
  (rows || []).forEach(row => { if (row.rep && row.has_avatar) representatives.set(row.k, row.rep); });
}

/** The representative video id for this name; `undefined` when not in the table. */
export function representativeOf(name: string): number | undefined {
  return representatives.get(name);
}
