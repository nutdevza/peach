/* Follow detail `/posts/:id`'s data and criteria (ADR-0031).
 *
 * This block is a child of the stage island's (`../stage/`) tree; the stage itself, enter/exit, mini player and Video.js
 * belong to the stage island (JAV details use them too). Entries belong here: it first scans the pages the follows page island
 * has cached (`findFollowItem`) and the details already fetched, fetching singly with `GET /api/follow?item=<id>` only when
 * the scan misses, with the response shaped like the list page and containing only the group this entry is in. */
import type { QueryKey } from '@tanstack/react-query';
import { apiGet } from '../../api';
import {
  FOLLOW_CREDENTIALS_KEY, collectionItems, fetchFollowCredentials, findFollowItem, videoItems,
  type FollowContext, type FollowFeedHelpers, type FollowGroup, type FollowItem, type FollowMedia,
  type FollowMediaItem, type FollowPage, type FollowSource,
} from '../follow-feed/follow-feed';
import type { LightboxSlide } from '../photo-lightbox/photo-lightbox';
import { queryClient } from '../query';

/* ---- API shapes (`src/peach/web_follow.py`) ---- */

/** One media file embedded in an entry: the details read name, byte size, type and cloud-drive grouping beyond what the card shows. */
export interface FollowDetailMedia extends FollowMediaItem {
  name?: string;
  size?: number;
  media_type?: string;
  resource_provider?: string;
  resource_group?: string;
  resource_group_label?: string;
}

/** Entry fields read by the details; the rest stay as-is in `FollowItem`'s index signature. */
export interface FollowDetailItem extends FollowItem {
  url?: string;
  summary?: string;
  author?: string;
  source_label?: string;
  media_type?: string;
  media_error?: string;
  media_needs_credential?: boolean;
  resource_urls?: string[];
  hidden_media?: FollowDetailMedia[];
  detail_tags?: string[];
  custom_tags?: string[];
  blocked_tags?: string[];
  variant_kind?: string;
  variant_label?: string;
  has_media?: boolean;
  media_items?: FollowDetailMedia[];
}

/** Everything one detail needs: the entry, its group, and the sources and aliases the credits read. */
export interface FollowDetailData {
  item: FollowDetailItem;
  group: FollowGroup | null;
  sources: FollowSource[];
  aliases: unknown[];
}

/* ── Fetching ── */

export const followItemKey = (id: number): QueryKey => ['follow-item', id];

export const FOLLOW_ITEM_URL = (id: number) => `/api/follow?item=${encodeURIComponent(id)}`;
export const FOLLOW_SAVE_URL = '/api/follow/save';
export const FOLLOW_MEDIA_HIDE_URL = '/api/follow/media/hide';

/** The entry no longer exists: a retry cannot bring it back, so the detail offers "Back to follows" instead of retry. */
export class FollowItemGone extends Error {
  constructor() { super('This followed content no longer exists') }
}

/** Single fetch: the response holds only the group this entry sits in. When the entry is gone the server answers with an empty group, reported here as `FollowItemGone`. */
export async function fetchFollowItem(id: number, signal?: AbortSignal): Promise<FollowDetailData> {
  const page = await apiGet<FollowPage>(FOLLOW_ITEM_URL(id), signal);
  for (const group of page.groups || []) {
    const item = collectionItems(group).find((member) => member.id === id);
    if (item) return { item: item as FollowDetailItem, group, sources: page.sources || [], aliases: page.author_aliases || [] };
  }
  throw new FollowItemGone();
}

/** Among already-fetched details, the one whose group contains this entry: when a compilation switches editions or multimedia switches to another entry in the group, the group is
 *  the one currently on stage, and the single entry fetched back is the same group anyway. */
function findDetailGroupItem(id: number): FollowDetailData | null {
  for (const [, data] of queryClient.getQueriesData<FollowDetailData>({ queryKey: ['follow-item'] })) {
    if (!data?.group) continue;
    const item = collectionItems(data.group).find((member) => member.id === id);
    if (item) return { ...data, item: item as FollowDetailItem };
  }
  return null;
}

/** First screen: use the list cache when it has the data (returning from details to the list does not refetch); when this entry was fetched before, or is already in the group on stage,
 *  the server is not asked again, so there is no wait between clicking and switching. Only otherwise fetch the single entry; credentials are fetched only when never fetched. */
export async function prefetchFollowDetail(props: { id: number }, signal: AbortSignal): Promise<void> {
  const key = followItemKey(props.id);
  const hit = findFollowItem(props.id);
  const credentials = queryClient.getQueryData(FOLLOW_CREDENTIALS_KEY)
    ? null
    : queryClient.fetchQuery({ queryKey: FOLLOW_CREDENTIALS_KEY, queryFn: () => fetchFollowCredentials(signal) });
  const cached = hit ? { ...hit, item: hit.item as FollowDetailItem }
    : queryClient.getQueryData<FollowDetailData>(key) ?? findDetailGroupItem(props.id);
  if (cached) queryClient.setQueryData<FollowDetailData>(key, cached);
  else await queryClient.fetchQuery({ queryKey: key, queryFn: () => fetchFollowItem(props.id, signal) });
  await credentials;
}

/* ── The pieces the shell hands in ── */

export interface FollowDetailActions {
  /** Close details and return to where you came from (the shell's `closeDetail`: exit animation, stage teardown, push back to the list address). */
  close(): void;
  /** Switch to another item in the group: the address changes through the shell (`preserveReturn` semantics) and the stage swaps content in place. */
  openItem(id: number, mediaIndex?: number | null): void;
  openAuthor(name: string): void;
  /** Click a tag in details: the shell switches to that one filter and returns to the list carrying it. */
  openTag(tag: string): void;
  /** This item and media are now rendered: from this the shell updates mini player metadata, the sidebar's tag drawer, and the stage's ambient light and theater mode. */
  present(item: FollowDetailItem, kind: string): void;
  /** Hands the media frame to the stage to attach a player (same as video details: the stage builds the `<video>` inside the frame). `onError` is a source error,
   *  which details use to explain that this copy would not play. The returned cleanup runs when this media area unmounts. */
  mountPlayer(frame: HTMLElement, item: FollowDetailItem, media: FollowDetailMedia | null,
    options: { onError(): void }): () => void;
  /** Action receipt; when `undo` is given it carries an undo button. Failures go through `failure`. */
  toast(message: string, options?: { undo?: () => Promise<void> }): void;
  failure(action: string, error: unknown): void;
  /** Whether a stack in the continue-watching list can flip on hover: the same criterion as the following list (multi-select, occlusion, reduced motion, and scrolling all return false). */
  canFlip(): boolean;
}

export interface FollowDetailProps {
  id: number;
  /** The media to show on entry (`media_items[].index`); when empty, pick the first one for the current view. */
  mediaIndex: number | null;
  /** Whether the list rests on video or image: a multi-media post picks that media first. */
  mediaView: FollowMedia;
  relatedLimit: number;
  helpers: FollowFeedHelpers;
  actions: FollowDetailActions;
}

/* ── Media decisions ── */

export interface DetailMedia {
  embedded: FollowDetailMedia[];
  selected: FollowDetailMedia | null;
  kind: string;
  images: FollowDetailMedia[];
  /** The current item's position within the images; -1 when it is not an image. */
  position: number;
  carousel: boolean;
  /** Multiple media items and not a pure image carousel: the multimedia queue goes on the right. */
  embeddedQueue: boolean;
  /** The entry has no embedded media of its own while its group holds playable videos: the compilation queue goes on the right. */
  collection: FollowGroup | null;
  /** The frame ratio follows the whole image set, not the current image: details do not jump in height when images change, and space is held before images finish loading.
   *  Take the tallest image among those with dimensions (smallest aspect ratio); with none, the carousel uses a square frame and a single image sizes itself. */
  frameRatio: number;
  /** The feature stream address (`/follow-stream`); an empty string when the entry is not playable. */
  src: string;
}

export function detailMedia(item: FollowDetailItem, group: FollowGroup | null, mediaIndex: number | null, view: FollowMedia): DetailMedia {
  const embedded = item.media_items || [];
  const preferredKind = view === 'images' ? 'image' : 'video';
  const preferred = embedded.find((media) => media.media_kind === preferredKind) || embedded[0];
  const selected = embedded.length
    ? embedded.find((media) => media.index === (mediaIndex ?? preferred!.index)) || preferred!
    : null;
  const images = embedded.filter((media) => media.media_kind === 'image');
  const position = images.findIndex((media) => media.index === selected?.index);
  const carousel = images.length > 1 && position >= 0;
  const embeddedQueue = embedded.length > 1 && !carousel;
  const collection = !embedded.length && group && videoItems(group).length > 1 ? group : null;
  const kind = selected?.media_kind || item.media_kind || '';
  const owners = (carousel ? [...images, item] : [selected, item])
    .filter((owner): owner is FollowDetailMedia | FollowDetailItem => !!owner && (owner.width || 0) > 0 && (owner.height || 0) > 0);
  const frameRatio = kind !== 'image' ? 0
    : owners.length ? Math.min(...owners.map((owner) => owner.width! / owner.height!)) : carousel ? 1 : 0;
  const src = item.playable ? `/follow-stream?id=${item.id}${selected ? `&media=${selected.index}` : ''}` : '';
  return { embedded, selected, kind, images, position, carousel, embeddedQueue, collection, frameRatio, src };
}

/** The entry in the group with grouped cloud drive media attached: the compilation queue lists its media instead of replies. */
export const groupedMediaOwner = (group: FollowGroup): FollowDetailItem | undefined =>
  collectionItems(group).find((item) => ((item as FollowDetailItem).media_items || [])
    .some((media) => media.resource_group)) as FollowDetailItem | undefined;

/* ── Copy ── */

const RESOURCE_HOSTS: Record<string, string> = {
  'gofile.io': 'Gofile', 'pixeldrain.com': 'Pixeldrain', 'mega.nz': 'MEGA', 'mega.io': 'MEGA',
  'mediafire.com': 'MediaFire', 'drive.google.com': 'Google Drive',
};
const RESOURCE_PROVIDERS: Record<string, string> = {
  gofile: 'Gofile', pixeldrain: 'Pixeldrain', mega: 'MEGA', mediafire: 'MediaFire', google_drive: 'Google Drive',
};

/** The site names in the external files page's row: recognized cloud drives show their brand name, everything else shows the hostname. */
export function resourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return RESOURCE_HOSTS[host] || host;
  } catch {
    return 'External files page';
  }
}

/** The source line in the lightbox corner: media from cloud drive groups say cloud drive, the rest name the source site. */
export function mediaSourceLabel(media: FollowDetailMedia | null | undefined, item: FollowDetailItem): string {
  return RESOURCE_PROVIDERS[media?.resource_provider || ''] || item.provider_label || item.provider || 'Online images';
}

/** Leading marker and body of a compilation queue row. The thread title must not masquerade as each reply's body; the lead explains its relation to the main entry;
 *  publish time is shown separately and can no longer pose as an edition or type label. */
export function collectionCopy(group: FollowGroup, item: FollowDetailItem, mark = ''): { label: string; title: string } {
  let label = mark;
  if (!label && group.is_release) label = item.variant_label || item.variant_kind || '';
  if (!label) label = item.variant_kind === 'wip' ? 'WIP' : (item.variant_label || item.variant_kind || 'Videos');
  const body = group.is_release ? (item.summary || (item.has_media ? '(attachments only)' : '(no body)')) : item.title;
  return { label, title: group.is_release && item.author ? `${item.author}: ${body}` : body };
}

/** The name of a multimedia queue row: follow media is not JAV, so only trim surrounding whitespace (same as the non-JAV branch of the legacy layer's `javDisplayName`). */
export const mediaName = (media: FollowDetailMedia) => String(media.name || '').trim();

/** The tag type the source recorded; unrecorded ones are `unknown` and keep the neutral color. Guessing the type from word shape is off limits by design for follow tags. */
export const tagType = (item: FollowDetailItem, tag: string) => item.tag_types?.[tag] || 'unknown';

/** The tag coloring tier (`data-tag-cat`, palette in `../styles.css`): the five types the source recognizes each have a color, untyped ones are neutral,
 *  and the remaining types (the booru sites' extras) color as general. */
const COLORED_TYPES = new Set(['artist', 'character', 'copyright', 'metadata', 'unknown']);
export function tagCategory(item: FollowDetailItem, tag: string): string {
  const type = tagType(item, tag);
  return `r34-${COLORED_TYPES.has(type) ? type : 'general'}`;
}

/* Detail tags are grouped in the type order of the rule34.xxx post page's `#tag-sidebar`, ascending by name within a group; evidence in
   docs/reference-snapshots/rule34-follow-tags-and-collections.md; missing types are skipped without leaving a slot.
   The card only consumes the general projection; details keep all types of the source record. */
const TAG_ORDER = ['copyright', 'character', 'artist', 'general', 'metadata'];
export function detailTags(item: FollowDetailItem, label: (tag: string) => string): string[] {
  const tags = item.detail_tags || item.tags || [];
  const rank = (tag: string) => {
    const at = TAG_ORDER.indexOf(tagType(item, tag));
    return at < 0 ? TAG_ORDER.length : at;
  };
  return [...tags].sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)));
}

/** The credited group of sources: all sources of the same creator, or just this one source of its own when the creator cannot be recognized. */
export function authorSources(item: Pick<FollowItem, 'source_id'>, sources: readonly FollowSource[]): FollowSource[] {
  const source = sources.find((row) => row.id === item.source_id);
  const group = sources.filter((row) => source?.author_key && row.author_key === source.author_key);
  if (!group.length && source) group.push(source);
  return group;
}

export const detailContext = (data: FollowDetailData, credentials: ReadonlySet<string>): FollowContext => ({
  sources: data.sources, aliases: data.aliases, credentials,
});

/* -- Lightbox --
   Clicking an image in details opens the large view, the same lightbox as the performer page. With multiple images, hand over the whole set so paging through shows every image in a post;
   when originals are unavailable, fall back to thumbnails; a small image beats a click that does nothing. */
const sized = (media: FollowDetailMedia | null) => (media?.size ? { size: media.size } : {});

export function detailSlides(item: FollowDetailItem, media: DetailMedia): LightboxSlide[] {
  const { images, kind, src, selected } = media;
  if (images.length) {
    return images.map((image) => ({
      src: `/follow-stream?id=${item.id}&media=${image.index}`,
      thumb: image.thumb_url || item.thumb_url || `/follow-stream?id=${item.id}&media=${image.index}`,
      name: image.name || item.title, source: mediaSourceLabel(image, item), ...sized(image),
    }));
  }
  if (kind === 'image' && src) {
    return [{ src, thumb: item.thumb_url || src, name: item.title, source: mediaSourceLabel(selected, item),
      ...sized(selected) }];
  }
  return item.thumb_url ? [{ src: item.thumb_url, thumb: item.thumb_url, name: item.title,
    source: item.provider_label || item.provider || 'Online images' }] : [];
}

/* ── After writing ── */

/** The wording of status receipts and undo: anything saved into the database offers no undo; that is a different matter. */
export const statusReceipt = (to: string) => (to === 'seen' ? 'Marked as watched' : 'Follow state updated');
