/* The five index pages (performers, sellers, labels, agencies, tags) and their address parsing.
 *
 * The header can produce its final look right now: title, readout placeholder, layout switch, favorites entry, filter box,
 * page-level Tabs and local performers' identity filter; only the content below waits.
 * The React page swaps it wholesale once the first screen returns, with keys and text matching the page's own, so the swap
 * does not jump. Controls here are unwired: the skeleton only shows during fetching. Two places lay it: the shell lays it
 * once when a cold start lands on an index page (`renderInitialSurfaceLoading`), and the route tree's index element lays it
 * before each open; if the same skeleton is already on screen it is not re-laid.
 *
 * Layout preference is read by the caller and passed in: the shell and the React bundle each carry a copy of this module, and
 * the settings store can have only one. */
import { boardTabsHtml, fitSkeleton, iconSwitchHtml, indexSkeletonHtml } from '@peach/legacy/ui';
import { identityFilterSkeletonHtml } from './identity-filter';
import { islandButton, islandShortcutsEntry, islandSearchInput } from './island-skeleton';

export type IndexPageKind = 'performers' | 'creators' | 'studios' | 'agencies' | 'series' | 'tags';

/** The items on the address bar. */
export interface IndexParams {
  kind: IndexPageKind;
  q: string;
  scope: 'local' | 'online';
  view: 'alphabet' | 'cloud';
  category: string;
}

export const INDEX_TITLES: Readonly<Record<IndexPageKind, string>> = {
  performers: 'Artists', creators: 'Sellers', studios: 'Labels', agencies: 'Agency', series: 'Series', tags: 'Tags',
};

/* The performer index layout, same idea as JAV large images: column widths unchanged, only the image stretched from a circle to a vertical frame, so the people per screen stay the same while each face gets bigger; compact is
   the round-avatar screen. The profile page's roster reads the same settings value. */
const PEOPLE_LAYOUTS =[['big', 'Large · Portrait avatar', 'maximize'], ['compact', 'Compact · Round avatar', 'layout-grid']] as const;
/* The company cell shows a square mark instead of a face, so the wording changes with it; the tier is still the same setting value. */
const COMPANY_LAYOUTS = [['big', 'Large · Full logo', 'maximize'], ['compact', 'Compact · Round logo', 'layout-grid']] as const;
const SERIES_LAYOUTS = [['big', 'Large · Series images', 'maximize'], ['compact', 'Compact · Series images', 'layout-grid']] as const;
const MAKER_INDEX_KINDS = [['studios', 'Labels', 'clapperboard'], ['series', 'Series', 'file-stack'], ['agencies', 'Agency', 'briefcase']] as const;
const INDEX_SCOPES = [['local', 'Local', 'hard-drive'], ['online', 'Online', 'rss']] as const;
const PEOPLE_INDEX_TABS = [['performers', 'Artists', 'user-round'], ['creators', 'Sellers', 'user-round'], ['online', 'Online', 'rss']] as const;
const TAG_VIEWS = [['cloud', 'Tag cloud', 'tags'], ['alphabet', 'Alphabet', 'text-aa']] as const;

/** The stored layout preference; unrecognized values fall back to large images. */
export const peopleLayoutOf = (saved: unknown): 'big' | 'compact' => (saved === 'compact' ? 'compact' : 'big');

/** The items on the address bar. Scope and view accept only two values; type is checked by the page against this vocabulary, falling back to all when unrecognized. */
export function indexParams(kind: IndexPageKind, search: string): IndexParams {
  const params = new URLSearchParams(search);
  return {
    kind, q: params.get('q') || '', scope: params.get('scope') === 'online' ? 'online' : 'local',
    view: params.get('view') === 'cloud' ? 'cloud' : 'alphabet', category: params.get('category') || 'all',
  };
}

type Choices = readonly (readonly [string, string, string])[];
const tabs = (items: Choices, active: string, label: string) => boardTabsHtml(
  items.map(([value, text, symbol]) => ({ value, label: text, symbol })), { active, label, className: 'indextabs' });

/* Below the tags page's Tabs sits another two-row filter glass (React's `FilterGlassRows`): pills by type on top, readout,
   jump-by-initial and view switch below. Which pills exist, the readout and which initials there are all wait for data,
   while the view switch is final right now; the block's height and bottom margin match the legacy `.board-filter-frame`, so
 * when the page lands it swaps in place for the real one and the content below does not jump. */
const tagFilterSkeletonHtml = (view: string) => `<div class="peach-react contents"><div data-filter-glass data-glass-pane class="sticky top-topbar z-10 mb-5.5 flex flex-col">
    <div class="flex h-12 min-w-0 items-center gap-1.75 overflow-x-auto overscroll-x-contain px-3 py-2" data-filter-row="top" data-skeleton-tier="filter-pill" aria-label="Tag types"></div>
    <div class="flex min-h-11.5 min-w-0 items-center gap-3 px-3 py-2" data-filter-row="bottom"><span class="countskeleton"></span>
      <span class="ml-auto">${iconSwitchHtml('tag-view', 'Tag view', TAG_VIEWS, view, { className:'tag-skeleton-view' })}</span></div></div></div>`;

export function indexPlaceholderHtml({ kind, q, scope, view, category }: IndexParams, layout: 'big' | 'compact'): string {
  const title = INDEX_TITLES[kind] || 'Tags', people = kind !== 'tags', company = kind === 'studios' || kind === 'agencies' || kind === 'series';
  const switcher = people
    ? iconSwitchHtml('people-layout', title + 'Index layout', kind === 'series' ? SERIES_LAYOUTS : company ? COMPANY_LAYOUTS : PEOPLE_LAYOUTS, layout) : '';
  return `<div class="ihead peach-react" data-index-head>
      <h2 class="disp indexheading">${title}</h2>
      ${people ? '<span class="mono" id="indexCount"><span class="countskeleton"></span></span>' : ''}${switcher}
      ${islandShortcutsEntry('default')}
      ${kind === 'tags' ? islandButton({variant: 'ghost', glyph: 'pencil', attrs: 'data-tag-mode data-skeleton-action disabled tabindex="-1" aria-label="Manage tags"'}) : ''}
      <div data-index-search class="ml-auto min-w-0 max-w-80 flex-1">${islandSearchInput('', q, 'Filter ' + title)}</div>
    </div>
    ${kind === 'tags' ? tabs(INDEX_SCOPES, scope, 'Vocabulary') : kind === 'performers' || kind === 'creators'
      ? tabs(PEOPLE_INDEX_TABS, kind === 'performers' && scope === 'online' ? 'online' : kind, 'People roster')
      : company ? tabs(MAKER_INDEX_KINDS, kind, 'Profile types') : ''}
    ${kind === 'tags' ? tagFilterSkeletonHtml(view) : ''}
    ${kind === 'performers' && scope !== 'online' ? identityFilterSkeletonHtml(category) : ''}
    ${indexSkeletonHtml({ kind, layout, mode: view })}`;
}

const skeletonKeyOf = (html: string) => html.match(/data-skeleton="([^"]*)"/)?.[1] || '';

/** Lays this page's skeleton into the container. If the same skeleton is already on screen, do not redraw: on a deep-link cold start the first-screen skeleton has already played, and swapping
 *  new nodes via innerHTML would replay the shimmer from the top. */
export function paintIndexSkeleton(container: HTMLElement, params: IndexParams, layout: 'big' | 'compact'): void {
  const placeholder = indexPlaceholderHtml(params, layout);
  if (container.querySelector<HTMLElement>('[data-skeleton]')?.dataset.skeleton !== skeletonKeyOf(placeholder)) {
    container.innerHTML = placeholder;
    fitSkeleton(container);
  }
}
