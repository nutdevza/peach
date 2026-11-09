import { cardIdentity, entityAvatar, type FaceRef, type IdentityItem } from '@peach/card-art';
import { entityDisplayName } from '../../core/entity-names';
import { followCompactWhen, followIdentity, followTitle } from '../follow-feed/follow-marks';
import { groupMediaKinds, itemForMedia, type FollowItem, type FollowPage } from '../follow-feed/follow-feed';
import type { OnlineAuthor } from '../follow/online-vocab';
import { onlineAuthorRingHtml } from '../index/index-controller';
import type { Discovery } from '../jav/jav';
import type { Recommendations, SuggestCard, SuggestGroup, SuggestItem } from './search';

type Request = (url: string) => Promise<any>;
type Latest = { id: number; code: string; release_date: string };

/** The recommendation bar's groups and order are fixed: a group not yet fetched still holds its slot (`pending`); each fetched group fills in as it arrives, and the bar's layout does not change.
 *  `size` is how many to show per page: three rows of people, five cells per row of works. */
const GROUPS = [
  { kind: 'performer', label: 'Performers and new releases', href: '/subscriptions?tab=add', action: 'Subscribe to new releases', size: 3 },
  { kind: 'author', label: 'Follow the author', href: '/subscriptions?tab=add', action: 'Add follow', size: 3 },
  { kind: 'asset', label: 'Video recommendations', href: '/', action: 'All videos', size: 5 },
  { kind: 'jav', label: 'JAV recommendations', href: '/jav?tab=discover', action: 'Discover JAV', size: 5 },
  { kind: 'post', label: 'Followed videos', href: '/follow', action: 'All followed videos', size: 5 },
  { kind: 'photo', label: 'Followed images', href: '/follow?media=images', action: 'All followed images', size: 5 },
  { kind: 'release', label: 'Subscribe to new releases', href: '/subscriptions', action: 'Manage subscriptions', size: 5 },
] as const;

/* Each group fetches one pool at a time (pool size set by `/api/search/recommendations`); "refresh" pages through the pool without another request.
   JAV recommendations rank by taste, followed new releases by release date, and the same request returns the same few works each time: fetching only one page would leave these two groups with nothing to swap in. */

/** The recommended bar before any group loads: the layout matches the loaded state. */
export function pendingRecommendations(): SuggestGroup[] {
  return GROUPS.map(group => ({ ...group, items: [], pending: true }));
}

/** This year's dates drop the year; earlier years keep it, matching the format used in the follow card list. */
const day = (date: string) => date.startsWith(String(new Date().getFullYear())) ? date.slice(5, 10) : date.slice(0, 10);

/** Credit only the first person; for co-starring, also show the total count, as on the work card. */
const byline = (names: string[], total = names.length) => total > 1 ? `${names[0]} and ${total} others` : names[0] || '';

/** The empty-search row: one request fetches everything (`/api/search/recommendations`), assembled here per each group's scope. When the server
 *  cannot fetch one, it is null, and only that group is missing. */
export async function searchRecommendations(request: Request): Promise<Recommendations> {
  const bundle = await request('/api/search/recommendations') as {
    items?: { items?: SuggestCard[] } | null; jav?: { items?: Discovery[] } | null; follow?: FollowPage | null;
    feeds?: { items?: Discovery[] } | null; authors?: { items?: OnlineAuthor[] } | null;
    latest?: Record<string, Latest>; words?: string[];
  };
  const work = (card: SuggestCard, href: string | undefined, who: string, whoAvatarHtml = ''): SuggestItem => ({
    value: String(card.code || card.display_title || card.title || card.name || 'Untitled video'),
    id: card.id, code: card.code, title: String(card.display_title || card.title || ''),
    who, whoAvatarHtml, card, href,
  });
  const library = (card: SuggestCard) => {
    const { kind, name, coStarred, refs, total } = cardIdentity(card as IdentityItem);
    if (!kind) return work(card, undefined, '');
    const ref = kind === 'performer' ? refs[0] : (card as IdentityItem).creator_entity;
    const shown = entityDisplayName(kind, name, ref?.id);
    return work(card, undefined, coStarred ? byline([shown], total) : shown, entityAvatar(name, ref ?? null, kind));
  };
  const discovered = (card: Discovery, href: string) => {
    const refs = card.performer_refs || [];
    const names = refs.length ? refs.map(ref => ref.name)
      : String(card.performers || '').split(/[,，、;/]/).map(name => name.trim()).filter(Boolean);
    const avatar = names[0] ? entityAvatar(names[0], (refs[0] as FaceRef | undefined) ?? null, 'performer') : '';
    return work(card as unknown as SuggestCard, href, byline(names), avatar);
  };
  const pools: Record<string, SuggestItem[] | null> = {};
  pools.asset = bundle.items ? (bundle.items.items || []).map(library) : null;

  const jav: Discovery[] | null = bundle.jav ? bundle.jav.items || [] : null;
  pools.jav = jav && jav.map(card => discovered(card, `/assets/${card.asset_id || card.id}`));
  const people = new Map<string, SuggestItem>();
  for (const card of jav || []) {
    for (const ref of card.performer_refs || []) {
      if (!ref.id || people.has(ref.name)) continue;
      const found = bundle.latest?.[String(ref.id)];
      people.set(ref.name, { value: ref.name, entity_id: ref.id, has_image: ref.has_image,
        href: `/performers/${ref.id}`,
        image_version: ref.image_version, avatar_focus: ref.avatar_focus, rep: ref.has_avatar ? ref.rep : null,
        works: [card as unknown as SuggestCard],
        subtitle: found ? `Latest release ${found.code || 'No code'} · ${day(found.release_date)}` : 'Latest work unavailable',
      });
    }
  }
  pools.performer = jav && [...people.values()];

  const follow = bundle.follow;
  if (follow) {
    const posts: SuggestItem[] = [];
    const photos: SuggestItem[] = [];
    const context = { sources: follow.sources || [], aliases: follow.author_aliases || [], credentials: new Set<string>() };
    for (const group of follow.groups || []) {
      const kinds = groupMediaKinds(group);
      for (const media of ['videos', 'images'] as const) {
        if (media === 'images' ? !kinds.has('image') : kinds.size && !kinds.has('video')) continue;
        const item = itemForMedia(group, media);
        const source = context.sources.find(source => source.id === item.source_id);
        const sources = source?.author_key ? context.sources.filter(row => row.author_key === source.author_key) : source ? [source] : [];
        const identity = followIdentity(item, sources, context);
        const image = media === 'images' ? item.media_items?.find(entry => entry.media_kind === 'image') : undefined;
        (media === 'images' ? photos : posts).push({ value: followTitle(item), id: item.id, who: identity.author,
          whoAvatarHtml: identity.avatar, href: `/posts/${item.id}`, followMedia: media, mediaIndex: image?.index ?? null,
          card: { id: item.id, thumb_url: image?.thumb_url || item.thumb_url },
        });
      }
    }
    pools.post = posts;
    pools.photo = photos;
  }
  pools.release = bundle.feeds ? (bundle.feeds.items || []).filter(card => card.code)
    .map(card => discovered({ ...card, sourceWork: true } as Discovery, `/works/${encodeURIComponent(card.code)}`)) : null;
  // The avatar and update time both use that row's own from the roster: the avatar prefers the official, with the archive as fallback, same “online” tier as the artist page.
  pools.author = bundle.authors ? (bundle.authors.items || []).map(row => ({
    value: row.k, href: row.entity_id ? `/creators/${row.entity_id}` : `/follow?author=${encodeURIComponent(row.key)}`,
    avatarHtml: onlineAuthorRingHtml(row),
    subtitle: row.latest ? `Latest updated at ${followCompactWhen({ published_at: row.latest } as FollowItem)}` : 'Updated at unavailable',
  })) : null;

  const groups = GROUPS.map(group => {
    const pool = pools[group.kind] ?? [];
    return { ...group, items: pool.slice(0, group.size), pool, offset: 0 };
  });
  return { groups, words: (bundle.words || []).map(String) };
}
