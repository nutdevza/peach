/* The junk files queue's (`/junk-files`) routing and count-row skeleton.
 *
 * Which category is viewed, and whether pending or excluded, is all decided by the address: category links are deep-linkable
 * `<a href>` and restore as-is after refresh. The shell (`Application`) and the junk queue page read the same function group,
 * so it lives on the island layer, without depending on React.
 *
 * The count-row skeleton is the version the shell lays before the React bundle loads, rendered inside `.peach-react`, with
 * structure, `data-*` hooks and class names matching item-for-item what the page renders while waiting (`junk-queue/junk-count.tsx`,
 * a case compares the two), so the takeover moment does not jump. Category and view have answers right now; only the readout
 * and the categories' count badges wait for data. */
import { esc } from '@peach/legacy/core';

import { islandSummary } from './island-skeleton';
import { t } from './i18n';

export type JunkView = 'pending' | 'dismissed';
export type JunkKind = '' | 'video' | 'image' | 'archive' | 'audio' | 'url' | 'other';

export interface JunkRoute { kind: JunkKind; view: JunkView }

/** The entries on the category bar: key, label, and sprite glyph. Keys map one to one onto the values of `/api/ads?kind=`. */
export const JUNK_KIND_OPTIONS: readonly (readonly [JunkKind, string, string])[] = [
  ['', t('cleanup:shared.all'), 'layout-grid'], ['video', t('cleanup:junk.kindVideos'), 'play'], ['image', t('cleanup:junk.kindImages'), 'pics'],
  ['archive', t('cleanup:junk.kindArchives'), 'file-archive'], ['audio', t('cleanup:junk.kindAudio'), 'file-audio'], ['url', t('cleanup:junk.kindUrls'), 'globe'],
  ['other', t('cleanup:junk.kindOther'), 'hard-drive'],
];

/** Unrecognized categories always fall back to "All". */
export const cleanJunkKind = (value: string | null | undefined): JunkKind =>
  JUNK_KIND_OPTIONS.find(([key]) => key === value)?.[0] ?? '';

/** The category and view in the address query string. */
export function junkRoute(search: string): JunkRoute {
  const params = new URLSearchParams(search);
  return { kind: cleanJunkKind(params.get('type')), view: params.get('view') === 'dismissed' ? 'dismissed' : 'pending' };
}

/** The address for one category and one view. The default tier (all, undecided) is not written into the query string. */
export function junkPath(kind: JunkKind = '', view: JunkView = 'pending'): string {
  const params = new URLSearchParams();
  if (kind) params.set('type', kind);
  if (view === 'dismissed') params.set('view', 'dismissed');
  const query = params.toString();
  return `/junk-files${query ? `?${query}` : ''}`;
}

/** The last item on the category bar: when undecided it goes to "Excluded", when excluded it returns to "Undecided". */
export function junkViewLink(view: JunkView): { view: JunkView; label: string; glyph: string; href: string } {
  return view === 'dismissed'
    ? { view: 'pending', label: t('cleanup:junk.backToUndecided'), glyph: 'rotate-ccw', href: junkPath('', 'pending') }
    : { view: 'dismissed', label: t('cleanup:junk.excluded'), glyph: 'eye-off', href: junkPath('', 'dismissed') };
}

export const junkSummaryLabel = (view: JunkView) => (view === 'dismissed' ? t('cleanup:junk.excluded') : t('cleanup:junk.undecided'));

const glyph = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

/** The count row the shell lays before the React bundle loads: summary face and category bar, readings and count badge empty. The sliding glass is placed measured by the island;
 *  in this version it is collapsed, and the current category backs itself with same-material glass (`junk-queue.css`). */
export function junkCountSkeletonHtml({ kind, view }: JunkRoute): string {
  const links = JUNK_KIND_OPTIONS.map(([key, label, icon]) =>
    `<a href="${junkPath(key, view)}" data-junk-kind-link="${key}"${key === kind ? ' aria-current="page"' : ''}>${glyph(icon)}${esc(label)}</a>`).join('');
  const other = junkViewLink(view);
  return `<div class="peach-react" data-junk-count-skeleton=""><div data-junk-count="">`
    + `<div data-junk-summary="" aria-live="polite">${islandSummary(junkSummaryLabel(view))}</div>`
    + `<div data-junk-filters-frame="" data-filter-glass="" data-glass-pane=""><span data-view-glide="" aria-hidden="true" hidden></span>`
    + `<nav data-junk-filters="" aria-label="${esc(t('cleanup:junk.categories'))}">${links}<i data-junk-divider="" aria-hidden="true"></i>`
    + `<a href="${other.href}" data-junk-view-link="${other.view}"${view === 'dismissed' ? ' aria-current="page"' : ''}>${glyph(other.glyph)}${other.label}</a>`
    + `</nav></div></div></div>`;
}
