/* The index page's data contract: performers, creators, labels, agencies, series rosters and the tag vocabulary.
 *
 * The local tier reads `/api/index?kind=` (`q_index` in `src/peach/web_entity.py`); the online tier reads the two vocabularies
 * on the follow sources (`../follow/online-vocab.ts`). The four shapes are alike: `items` plus `has_more`, paged by
 * `limit`/`offset`; tags replace per page, people rosters append on "load more".
 *
 * The index page never calls `/api/items` itself: clicking a tag, or showing results for the selected tags, means returning
 * to the catalog filtered by them, and that fetch belongs to the legacy shell's catalog grid. */
import type { InfiniteData, QueryKey } from '@tanstack/react-query';

import { firstGrapheme } from '@peach/legacy/core';

import { apiGet } from '../../api';
import { TAG_PAGE_SIZE } from '../../tag-skeleton';
import { IDENTITY_CATEGORIES } from '../../identity-filter';
import {
  fetchOnlineAuthors, fetchOnlineTags, onlineAuthorsKey, onlineTagsKey,
  type OnlineAuthor, type OnlineTag,
} from '../follow/online-vocab';
import { queryClient } from '../query';

export type IndexKind = 'performers' | 'creators' | 'studios' | 'agencies' | 'series' | 'tags';
export type IndexScope = 'local' | 'online';
export type TagView = 'alphabet' | 'cloud';
export type PeopleLayout = 'big' | 'compact';

export const INDEX_URL = '/api/index';

/** The page header title and the roster basis. */
export const INDEX_TITLES: Record<IndexKind, string> = {
  performers: 'Artists', creators: 'Sellers', studios: 'Labels', agencies: 'Agency', series: 'Series', tags: 'Tags',
};

/** The entity type the index cell maps to; the profile page and the image fetch chain both branch on it. */
export const ENTITY_KINDS: Record<Exclude<IndexKind, 'tags'>, string> = {
  performers: 'performer', creators: 'creator', studios: 'studio', agencies: 'agency', series: 'series',
};

/** The nine local tag categories. Their order is the order of the popover's top pill row. */
export const TAG_CATEGORIES: readonly (readonly [string, string])[] = [
  ['all', 'All'], ['meta', 'Video properties'], ['relationship', 'Relationships'], ['role', 'Character roles'],
  ['appearance', 'Looks and body'], ['scene', 'Settings and places'], ['story', 'Story and plot'], ['position', 'Sex positions'],
  ['general', 'Other content'],
];

/** Online tag categories come from the upstream booru's tag_type. */
export const ONLINE_TAG_CATEGORIES: readonly (readonly [string, string])[] = [
  ['all', 'All'], ['general', 'General'], ['artist', 'Creators'], ['character', 'Roles'],
  ['copyright', 'Videos'], ['metadata', 'Metadata'],
];
/** Identity categories for the local performer roster; the seller roster has none. The term list shares one copy with the shell's skeleton. */
export { IDENTITY_CATEGORIES };

/** Default page size for roster batches and tags. */
export const PAGE_SIZE = { people: 120, tags: TAG_PAGE_SIZE } as const;

export const isPeople = (kind: IndexKind): kind is Exclude<IndexKind, 'tags'> => kind !== 'tags';
export const isCompany = (kind: IndexKind) => kind === 'studios' || kind === 'agencies';

/** One cell of the local roster. Fields follow `q_index`; companies carry a logo, agencies a member count. */
export interface IndexPerson {
  entity_kind?: string;
  identity_labels?: string[];
  following?: boolean;
  entity_id?: number;
  id?: number;
  k: string;
  n: number;
  rep?: number | null;
  has_image?: boolean;
  image_version?: string;
  has_avatar?: boolean;
  avatar_stand_in?: boolean;
  avatar_focus?: unknown;
  has_logo?: boolean;
  members?: number;
  mark?: number | null;
}

export interface IndexTag {
  id?: string;
  aliases?: string[];
  hidden?: boolean;
  entity_id?: number;
  favorite?: boolean;
  k: string;
  n: number;
  cat?: string;
}

export interface IndexPage<T> {
  items: T[];
  has_more: boolean;
  total?: number;
  /** Hit counts per category; the filter bar shows only categories with content. */
  categories?: Record<string, number>;
}

/** The items on the address bar. The page changes them only through `IndexProps.route`, and the shell builds the address from this. */
export interface IndexRoute {
  kind: IndexKind;
  q: string;
  scope: IndexScope;
  view: TagView;
  category: string;
}

/** One avatar cell: the HTML inside the round frame and the face framing's `object-position`. */
export interface PersonAvatar {
  html: string;
  /** The result of `faceOrigin()`; an empty string when no face is detected, keeping geometric centering. */
  face: string;
}

/** Index page. The address bar is the single source of truth: `kind`, `q`, `scope`, `view`, `category` are read from the address by the shell,
 *  `layout` is read from this browser's preference; all serve only as initial values, and page state changes write them back via `route` and `savePreference`.
 *  Image fetching, the fallback chain, and destinations remain the legacy layer's single copy, passed in via props. */
export interface IndexProps extends IndexRoute {
  layout: PeopleLayout;
  /** Writes back to the address bar. `replace` suits type-to-filter, which rewrites all along and must not stuff history with a trail of entries. */
  route(params: IndexRoute, options?: { replace?: boolean }): void;
  /** The layout preference changed: storage belongs to the shell (`appSettings.peopleLayout`), and the profile page's roster reads the same value. */
  savePreference(patch: { layout: PeopleLayout }): void;
  /** State of the top bar's selection key. Only meaningful in the local tab: the selected tags compose a catalog filter. The shell owns the key; on close
   *  it pushes `false` in through `updateManagedRoute`, and the page clears its selection accordingly. */
  selectMode: boolean;
  /** The two places a page exits selection mode on its own: showing results for the selected tag, and the performer page switching to the online roster. */
  exitSelectMode(): void;
  /** The avatar in a local roster cell (the `avatarInner` fallback chain of `card-art`). */
  personAvatar(item: IndexPerson, entityKind: string, big: boolean): PersonAvatar;
  /** The online creator cell's avatar: homepage avatar first, archive as fallback, landing back on the initial when neither is available. */
  authorAvatar(author: OnlineAuthor): string;
  tagLabel(tag: string): string;
  /** Open the profile page. */
  openEntity(entityKind: string, name: string): void;
  /** Back to the catalog, filtered by this one or these local tags. */
  showTags(tags: string[], match: 'any' | 'all'): void;
  /** Go to the follows page filtered to updates from this creator or this online tag only. */
  openFollowAuthor(key: string): void;
  openFollowTag(tag: string): void;
  /** This machine can edit configuration: the empty state offers "Add content". */
  configurable: boolean;
}

/** The address bar's type may be hand-typed or misspelled: unrecognized falls back to "All", never queried against the backend.
 *  Only the performers and tags pages split local and online. Animation authors are a category of the performer roster,
 *  and the sellers roster's `category=animation` link redirects there. */
export function indexRoute(route: IndexRoute): IndexRoute {
  if (route.kind === 'creators' && route.category === 'animation') {
    return indexRoute({ ...route, kind: 'performers', scope: 'local' });
  }
  const scope = route.kind === 'tags' || route.kind === 'performers' ? route.scope : 'local';
  const categories = route.kind === 'tags' ? (scope === 'online' ? ONLINE_TAG_CATEGORIES : TAG_CATEGORIES)
    : route.kind === 'performers' && scope === 'local' ? IDENTITY_CATEGORIES : [];
  const known = categories.some(([key]) => key === route.category);
  return { ...route, scope, category: known ? route.category : 'all' };
}

/** Which source a given state reads: local roster, local term list, online creator, or online tag. */
export type IndexSource =
  | { what: 'people'; kind: Exclude<IndexKind, 'tags'>; q: string; category?: string }
  | { what: 'tags'; q: string; category: string }
  | { what: 'online-authors'; q: string }
  | { what: 'online-tags'; q: string; category: string };

export function indexSource(route: Pick<IndexRoute, 'kind' | 'q' | 'scope' | 'category'>): IndexSource {
  const { kind, q, scope, category } = route;
  if (kind === 'tags') return scope === 'online' ? { what: 'online-tags', q, category } : { what: 'tags', q, category };
  if (kind === 'performers' && scope === 'online') return { what: 'online-authors', q };
  return { what: 'people', kind, q, ...(category && category !== 'all' ? { category } : {}) };
}

export const indexKey = (kind: IndexKind, q: string, category = 'all') =>
  ['index', kind, q, ...(kind === 'tags' || category !== 'all' ? [category] : [])] as const;

export function indexUrl(kind: IndexKind, q: string, category: string, limit: number, offset: number): string {
  const params = new URLSearchParams({ kind, limit: String(limit), offset: String(offset) });
  if (q) params.set('q', q);
  if (category !== 'all') params.set('category', category);
  return `${INDEX_URL}?${params}`;
}

type AnyItem = IndexPerson | IndexTag | OnlineAuthor | OnlineTag;

export interface IndexQuery {
  queryKey: QueryKey;
  queryFn(context: { pageParam: number; signal?: AbortSignal }): Promise<IndexPage<AnyItem>>;
  initialPageParam: number;
  getNextPageParam(last: IndexPage<AnyItem>, pages: IndexPage<AnyItem>[]): number | undefined;
}

/** Four datasets share one pagination set: the next page's offset is the number of items already fetched. */
export function indexQuery(source: IndexSource, pageSize: number = PAGE_SIZE.tags): IndexQuery {
  const limit = source.what === 'people' || source.what === 'online-authors' ? PAGE_SIZE.people : pageSize;
  const next = (last: IndexPage<AnyItem>, pages: IndexPage<AnyItem>[]) =>
    last.has_more ? pages.reduce((sum, page) => sum + page.items.length, 0) : undefined;
  const base = { initialPageParam: 0, getNextPageParam: next };
  switch (source.what) {
    case 'people':
      return { ...base, queryKey: indexKey(source.kind, source.q, source.category || 'all'),
        queryFn: ({ pageParam, signal }) => apiGet(indexUrl(source.kind, source.q, source.category || 'all', limit, pageParam), signal) };
    case 'tags':
      return { ...base, queryKey: indexKey('tags', source.q, source.category),
        queryFn: ({ pageParam, signal }) => apiGet(indexUrl('tags', source.q, source.category, limit, pageParam), signal) };
    case 'online-authors':
      return { ...base, queryKey: onlineAuthorsKey(source.q),
        queryFn: ({ pageParam, signal }) => fetchOnlineAuthors(source.q, limit, pageParam, signal) };
    case 'online-tags':
      return { ...base, queryKey: onlineTagsKey(source.q, source.category),
        queryFn: ({ pageParam, signal }) => fetchOnlineTags(source.q, source.category, limit, pageParam, signal) };
  }
}

/** The first screen is prefetched before the page commits; visited collections reuse the pagination within the same tab. */
export async function prefetchIndex(props: IndexRoute, signal: AbortSignal) {
  const query = indexQuery(indexSource(indexRoute(props)));
  await queryClient.fetchInfiniteQuery({
    queryKey: query.queryKey,
    queryFn: ({ pageParam }) => query.queryFn({ pageParam: pageParam as number, signal }),
    initialPageParam: 0,
    getNextPageParam: query.getNextPageParam,
    staleTime: Infinity,
  });
}

export const flatItems = <T>(data: InfiniteData<IndexPage<T>> | undefined): T[] =>
  data ? data.pages.flatMap((page) => page.items) : [];

/** The count: how many were fetched, with a plus sign when more follow. */
export const countText = (count: number, more: boolean) => `${count.toLocaleString()}${more ? '+' : ''} items`;

/** A tag's type color key (`../styles.css`'s `[data-tag-cat]`). The online set takes the upstream tag_type,
 *  with an `r34-` prefix separating it from local classes of the same name: local `artist` is orange, online red. */
export const tagColorKey = (online: boolean, cat: string | undefined) =>
  online ? `r34-${cat || 'unknown'}` : cat || 'general';

/** The readout under each cell. Agencies count people: their videos are shot by members, so reporting only video counts would erase the one readout unique to them.
 *  Every number carries a unit so a row of cells reads as people or videos, and a bare "0" no longer looks like a missing label. */
export const personReadout = (kind: IndexKind, item: IndexPerson) =>
  kind === 'agencies' ? `${(item.members || 0).toLocaleString()} people` : `${(item.n || 0).toLocaleString()} videos`;

const COLLATOR = { numeric: true, sensitivity: 'base' } as const;

/** Alphabet grouping: by the first character of the display name into A–Z, `#` (digits), `chinese`, or `other`; sorted by name within each group. */
export function tagGroups<T extends { k: string }>(items: T[], label: (tag: string) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.k.localeCompare(b.k, 'zh-CN', COLLATOR))) {
    const first = firstGrapheme(label(item.k).normalize('NFKC'), '').toUpperCase();
    const key = /[A-Z]/.test(first) ? first : /[0-9]/.test(first) ? '#' : /[㐀-鿿]/.test(first) ? 'Chinese' : 'Other';
    const group = groups.get(key);
    if (group) group.push(item); else groups.set(key, [item]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'));
}
