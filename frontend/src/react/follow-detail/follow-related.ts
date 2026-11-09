import type { InfiniteData } from '@tanstack/react-query';
import { apiGet } from '../../api';
import {
  FOLLOW_PAGE, collectionItems, entityFollowView, followPageUrl, groupMediaKinds, itemForMedia,
  type FollowGroup, type FollowItem, type FollowMedia, type FollowPage,
} from '../follow-feed/follow-feed';
import type { FollowDetailData } from './follow-detail';

export const followRelatedKey = (id: number, media: FollowMedia, limit: number) =>
  ['follow-feed', 'related', id, media, limit] as const;

/** Recommendations recognize the whole identity group, excluding the current group, watched and ignored; sorted by shared tags, ties keep the fetch order. */
export function followRelatedGroups(pages: readonly FollowPage[], current: FollowDetailData, media: FollowMedia, limit: number): FollowGroup[] {
  const excluded = new Set((current.group ? collectionItems(current.group) : [current.item]).map(item => item.id));
  const seen = new Set<number>();
  const tags = new Set(current.item.tags || []);
  const author = current.sources.find(source => source.id === current.item.source_id)?.author_key;
  const sources = new Map(pages.flatMap(page => page.sources || []).map(source => [source.id, source]));
  return pages.flatMap(page => page.groups || []).filter(group => {
    const members = collectionItems(group);
    if (members.some(item => excluded.has(item.id) || seen.has(item.id))) return false;
    if (!groupMediaKinds(group).has(media === 'images' ? 'image' : 'video')) return false;
    if (itemForMedia(group, media).status !== 'new') return false;
    members.forEach(item => seen.add(item.id));
    return true;
  }).map((group, order) => {
    const item = itemForMedia(group, media);
    const source = item.source_id === undefined ? undefined : sources.get(item.source_id);
    const sameAuthor = !!author && source?.author_key === author;
    const common = (item.tags || []).filter(tag => tags.has(tag)).length;
    return { group, order, sameAuthor, common };
  }).sort((a, b) => Number(b.sameAuthor) - Number(a.sameAuthor) || b.common - a.common || a.order - b.order)
    .slice(0, limit).map(row => row.group);
}

/** The "Continue watching" card's recommendation reason: same creator, plus tags shared with the current item. Tags sort by occurrence count across these pages, fewest to most,
 *  with the most distinctive for "why this one" up front; generic tags everyone has drop to the back, and get truncated if they don't fit a line. Sources marked metadata
 *  (duration, has audio, needs labeling) or artist (same creator already stated) don't count as reasons. */
const NOT_A_REASON = new Set(['metadata', 'artist']);
export function followRelatedReasons(pages: readonly FollowPage[], current: FollowDetailData, media: FollowMedia) {
  /* Compared is the full tag set from the detail copy: the content tags on the card only take the general ones the source classified; uncategorized posts have none. */
  const all = (row: FollowItem & { detail_tags?: string[] }) => row.detail_tags || row.tags || [];
  const mine = new Set(all(current.item));
  const author = current.sources.find(source => source.id === current.item.source_id)?.author_key;
  const sources = new Map(pages.flatMap(page => page.sources || []).map(source => [source.id, source]));
  const seen = new Map<string, number>();
  for (const group of pages.flatMap(page => page.groups || [])) {
    for (const tag of all(itemForMedia(group, media))) seen.set(tag, (seen.get(tag) || 0) + 1);
  }
  return (group: FollowGroup) => {
    const item = itemForMedia(group, media);
    const source = item.source_id === undefined ? undefined : sources.get(item.source_id);
    const tags = all(item).filter(tag => mine.has(tag) && !NOT_A_REASON.has(item.tag_types?.[tag] || ''))
      .sort((a, b) => (seen.get(a) || 0) - (seen.get(b) || 0) || a.localeCompare(b));
    return { reasons: author && source?.author_key === author ? ['Same creator'] : [], tags };
  };
}

/** Reuses follow pagination and the cache structure. At most three pages are read; when one author runs short, unseen items from the whole library fill in, so switching still hits the list cache directly. */
export async function fetchFollowRelated(current: FollowDetailData, media: FollowMedia, limit: number,
  signal: AbortSignal): Promise<InfiniteData<FollowPage>> {
  const author = current.sources.find(source => source.id === current.item.source_id)?.author_key || '';
  const view = { ...entityFollowView(author), status: 'new' as const, media, sort: 'rand' as const, seed: current.item.id };
  const pages: FollowPage[] = [];
  const read = async (author: string, offset: number) => {
    const page = await apiGet<FollowPage>(followPageUrl({ ...view, author }, offset), signal);
    pages.push(page);
    return page;
  };
  const first = await read(author, 0);
  if (followRelatedGroups(pages, current, media, limit).length < limit && first.has_more) await read(author, (first.offset || 0) + FOLLOW_PAGE);
  if (author && followRelatedGroups(pages, current, media, limit).length < limit) await read('', 0);
  return { pages, pageParams: pages.map(page => page.offset || 0) };
}
