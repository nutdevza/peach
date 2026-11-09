/* The two vocabularies on follow sources: the creators that appeared in the sources, and the tags upstream booru gave the
 * entries.
 *
 * Both belong to the follows side: they count online updates not yet added to the library, and clicking through goes to the
 * follows page. The performer and tag index pages merely lay them out as a roster and an alphabet, so the keys are built here
 * rather than in the index module: the day the follows page also lays out the same vocabulary, it reads the same `queryKey`.
 *
 * Pagination follows `/api/index`'s shape: `limit`/`offset` paging with `has_more` in the response. */
import { apiGet } from '../../api';

export const FOLLOW_AUTHORS_URL = '/api/follow/authors';
export const FOLLOW_TAGS_URL = '/api/follow/tags';

/** One creator on a source. `key` is the follows page filter's creator keys: profiled ones are `entity:<id>`,
 *  unprofiled ones group by name. `held_by` is the same-named creator in the database, bound once the user confirms on that page. */
export interface OnlineAuthor {
  k: string;
  key: string;
  n: number;
  entity_id: number | null;
  held_by: string;
  /** The avatar on the official profile page; an empty string when unavailable. */
  avatar: string;
  /** The archive site's avatar, used when the profile page one fails. */
  avatar_fallback: string;
  providers: string[];
  /** The latest item's publish time; if the source gives none, use the indexing time. */
  latest?: string;
}

export interface OnlineAuthorsPage {
  items: OnlineAuthor[];
  has_more: boolean;
  total?: number;
}

/** A tag from the upstream booru. `cat` is the upstream tag_type (general/artist/character/copyright/metadata). */
export interface OnlineTag {
  favorite?: boolean;
  id?: string;
  aliases?: string[];
  hidden?: boolean;
  k: string;
  n: number;
  cat: string;
}

export interface OnlineTagsPage {
  items: OnlineTag[];
  has_more: boolean;
  total?: number;
  categories?: Record<string, number>;
}

export const onlineAuthorsKey = (q: string) => ['follow', 'authors', q] as const;
export const onlineTagsKey = (q: string, type: string) => ['follow', 'tags', q, type] as const;

export function onlineAuthorsUrl(q: string, limit: number, offset: number): string {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set('q', q);
  return `${FOLLOW_AUTHORS_URL}?${params}`;
}

/** Omitted when `type` is `all`: the server's default already means every type. */
export function onlineTagsUrl(q: string, type: string, limit: number, offset: number): string {
  const params = new URLSearchParams({ types: 'all', limit: String(limit), offset: String(offset) });
  if (type && type !== 'all') params.set('type', type);
  if (q) params.set('q', q);
  return `${FOLLOW_TAGS_URL}?${params}`;
}

export const fetchOnlineAuthors = (q: string, limit: number, offset: number, signal?: AbortSignal) =>
  apiGet<OnlineAuthorsPage>(onlineAuthorsUrl(q, limit, offset), signal);

export const fetchOnlineTags = (q: string, type: string, limit: number, offset: number, signal?: AbortSignal) =>
  apiGet<OnlineTagsPage>(onlineTagsUrl(q, type, limit, offset), signal);
