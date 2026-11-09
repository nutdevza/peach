/* The byline, avatar, source icons and the marks around titles shared by the follows page's cards, rows and details.
 *
 * All are preassembled HTML strings, placed via `dangerouslySetInnerHTML` in cards and details. Fallbacks when images fail are
 * handled by the shell's `wireImageFallbacks()` delegated listener per the `data-drop` attribute family
 * (`frontend/src/card-art/image-fallback.ts`); this module only writes attributes. Creator name, initial and avatar choices
 * are the same copy as follow management (`follow-manage.ts`).
 *
 * Site icons, edition marks and see-also badges are recognized by `data-follow-*`, styled in `follow-feed.css`. The creator
 * ring still carries `favatar`: when the image breaks, the fallback script swaps in an initial-letter node carrying only the
 * class name and cannot honor attributes. */
import { api, esc, registerEntityLink } from '@peach/legacy/core';

import {
  authorAvatar, authorInitial, authorName, sourceIconUrl, type AliasGroup,
} from '../follow-manage/follow-manage';
import { localTime } from '../time';
import type { FollowContext, FollowGroup, FollowIdentity, FollowItem, FollowSource } from './follow-feed';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const aliasesOf = (context: FollowContext) => context.aliases as readonly AliasGroup[];

/** Sources with a site icon render one `<img>`; unregistered sites yield an empty string. Pass `label` when the icon stands for the site name on its own, so alt and
 *  title carry the site name; pass empty when the outer layer already shows the name and the image is purely decorative. On failure the image is removed and the outer text takes over. */
export function sourceIcon(provider: string, label = ''): string {
  const url = sourceIconUrl(provider);
  return url
    ? `<img data-follow-site-icon="" src="${url}" alt="${esc(label)}"${label ? ` title="${esc(label)}"` : ''} loading="lazy" data-drop="self">`
    : '';
}

/** For cells with only an icon and no text beside it: the filter bar's source key, the card corner's source badge, card faces without thumbnails.
 *  Sites without a registered icon fall back to the site name's initial; if the icon fails to load, the fallback script swaps in the same initial, so the cell is never empty.
 *  The name is conveyed by the outer `aria-label`/`title`; the text and image here are purely decorative. */
export function sourceMark(provider: string, label = ''): string {
  const initial = esc(authorInitial(label || provider));
  const url = sourceIconUrl(provider);
  return url
    ? `<img data-follow-site-icon="" src="${url}" alt="" loading="lazy" data-drop="initial" data-initial="${initial}" data-drop-class="follow-site-initial">`
    : `<span class="follow-site-initial" aria-hidden="true">${initial}</span>`;
}

/** When the title is empty, the card, details, and queue all use this sentence. */
export const FOLLOW_UNTITLED = 'Untitled content';
export const followTitle = (item: { title?: unknown }): string => text(item.title).trim() || FOLLOW_UNTITLED;

/** A creator's name in this version of the list (the post-merge umbrella name wins). */
export const followAuthorName = (sources: readonly FollowSource[], context: FollowContext): string =>
  authorName(sources, aliasesOf(context));

/** The author entry only accepts the single entity the source has already bound. */
export function followAuthorEntity(sources: readonly FollowSource[]): string {
  const bound = sources.filter((source) => source.entity_id && source.entity_name);
  const ids = new Set(bound.map((source) => source.entity_id));
  if (ids.size !== 1) return '';
  const source = bound[0]!;
  const name = text(source.entity_name);
  registerEntityLink('creator', name, source.entity_id);
  return name;
}

/** The creator circle's contents: official avatar first, archived sites as fallback, the initial when neither works. */
export function authorAvatarHtml(sources: readonly FollowSource[], name: string): string {
  const { src, fallback } = authorAvatar(sources);
  const initial = authorInitial(name);
  if (!src) return `<span class="favatar none" title="No avatar available">${esc(initial)}</span>`;
  const fallbacks = fallback ? ` data-fallbacks="${esc(fallback)}"` : '';
  return `<img class="favatar" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" `
    + `data-drop="initial"${fallbacks} data-initial="${esc(initial)}" data-drop-class="favatar none">`;
}

/** Card and details attribution. When the server recognizes a booru post's true poster (`item.credit`), name and avatar switch to the
 *  poster: if this person is also followed, use their source; otherwise only initials, never borrowing the followed person's avatar; the followed person demotes to one line
 *  "Attribution includes", explaining why this entry appears here. Unrecognized ones attribute the followed person as usual. */
export function followIdentity(item: FollowItem, authorSources: readonly FollowSource[],
  context: FollowContext): FollowIdentity {
  const aliases = aliasesOf(context);
  const credit = item.credit as { poster?: string; credited?: string } | undefined;
  const poster = credit?.poster;
  if (!poster) {
    const name = authorName(authorSources, aliases);
    return { author: name || text(item.author) || text(item.source_label) || 'Creator unfetched',
      avatar: authorAvatarHtml(authorSources, name), credited: '', entityName: followAuthorEntity(authorSources) };
  }
  const key = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const own = context.sources.find((row) => key(row.ref) === key(poster));
  const group = own?.author_key ? context.sources.filter((row) => row.author_key === own.author_key) : own ? [own] : [];
  const author = (group.length && authorName(group, aliases)) || poster;
  return { author, avatar: authorAvatarHtml(group, author), credited: credit.credited || '', entityName: followAuthorEntity(group) };
}

/** The label saying "which edition this entry is", placed before the title, the same control as the edition label in the home title. WIP speaks about
 *  this entry, not this group: when the group has another `[WIP]`, it reads "includes WIP". The audio edition speaks about the card face's entry:
 *  dubbed colored, silent weakened with a dashed frame. */
export function followTitleMarks(group: FollowGroup, shown: FollowItem = group.primary): string {
  const marks: string[] = [];
  const mark = (edition: string, label: string) =>
    `<small class="javedition" data-follow-edition="${edition}">${label}</small>`;
  if (group.primary.variant_kind === 'wip') marks.push(mark('wip', 'WIP'));
  else if (group.has_wip) marks.push(mark('has-wip', 'Has WIP'));
  const version = text(group.primary.version);
  if (version) marks.push(mark('version', esc(version)));
  const audio = text(shown.audio);
  const label = audio === 'voiced' ? 'Dubbed version' : audio === 'silent' ? 'Silent version' : '';
  if (label) marks.push(mark(audio, label));
  return marks.join('');
}

/** "See also" sites are listed with site icons, the site name landing in the icon's alt and the badge's title; sites without a registered icon show their name as text.
 *  "See also" is relative to the entry shown on the card (`shown`): when the card shows a different site from the group, the main entry's site is the see-also. */
export function followBadges(group: FollowGroup, shown: FollowItem = group.primary): string {
  const sites = new Map([group.primary, ...group.variants, ...group.duplicates]
    .filter((member) => member.provider !== shown.provider)
    .map((member) => [member.provider, member.provider_label || member.provider] as const));
  if (!sites.size) return '';
  const marks = [...sites].map(([provider, label]) => sourceIcon(provider, label) || `<span>${esc(label)}</span>`).join('');
  return `<span data-follow-seealso="" title="See also ${esc([...sites.values()].join(', '))}"><span data-follow-seealso-label="">See also</span> ${marks}</span>`;
}

/** The "Media not obtained" sentence; an empty string when there is none. */
export function followMediaIssue(item: FollowItem, context: FollowContext): string {
  const error = text(item.media_error);
  if (error) return `Media not fetched: ${error}`;
  if (item.media_needs_credential && context.credentialsReady !== false && !context.credentials.has(item.provider)) {
    return item.playable ? 'Some media not fetched: F95 login session required for parsing' : 'Media not fetched: an F95 sign-in session is needed to resolve';
  }
  return '';
}

/** A publish time more than a day ahead of now: the source's clock or timezone is wrong, so flag it as-is instead of treating it as a normal latest entry. */
const FUTURE_SLACK_MS = 24 * 3600_000;
const isFuture = (iso: string, now: number): boolean => {
  const at = new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  return Number.isFinite(at) && at - now > FUTURE_SLACK_MS;
};

/** The publish time's three segments: precision prefix, the time written in the viewer's timezone, and the later-than-now marker. When the source only gave a relative time
 *  (`published_precision` is `approximate`, converted from something like "3 years ago"), write down to the day and prefix "about";
 *  hours and minutes are converted, and writing them out is false precision. */
function whenParts(item: FollowItem, now: number) {
  const iso = text(item.published_at);
  if (!iso) return null;
  const approximate = item.published_precision === 'approximate';
  const full = localTime(iso);
  return {
    prefix: approximate ? '~' : '',
    full: approximate ? full.slice(0, 10) : full,
    suffix: isFuture(iso, now) ? ' · ahead of now' : '',
  };
}

/** Release time, shown in the viewer's time zone; when the source gives none, say so. */
export function followWhen(item: FollowItem, now = Date.now()): string {
  const parts = whenParts(item, now);
  return parts ? `${parts.prefix}${parts.full}${parts.suffix}` : 'Time not fetched';
}

/** List timestamps go down to the day only: this year's drop the year, earlier years keep it. Hovering reads the full `followWhen` formatting. */
export function followCompactWhen(item: FollowItem, now = Date.now()): string {
  const parts = whenParts(item, now);
  if (!parts) return 'Time not fetched';
  if (!/^\d{4}-/.test(parts.full)) return `${parts.prefix}${parts.full}${parts.suffix}`;
  const day = parts.full.startsWith(String(new Date(now).getFullYear())) ? parts.full.slice(5, 10) : parts.full.slice(0, 10);
  return `${parts.prefix}${day}${parts.suffix}`;
}

/* Images already written back this session, keyed `entry:media index`. Write-back only fills gaps and the server ignores entries that already have dimensions,
   but resending the same batch on every rerender is wasted work. Batch every 800ms, at most 200 per batch. */
interface DimsEntry { item: number; width: number; height: number; media?: number }
const reported = new Set<string>();
let queue: DimsEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flushDims() {
  timer = null;
  if (!queue.length) return;
  const entries = queue.splice(0, 200);
  /* Silent: this is opportunistic learning, not a user action; neither reader-side 409s nor network jitter should raise a toast. */
  (api('/api/follow/image-dims', { method: 'POST', body: JSON.stringify({ entries }) }) as Promise<unknown>)
    .catch(() => {});
  if (queue.length) timer = setTimeout(flushDims, 800);
}

/** When a card image without dimensions finishes loading in the image view, writes its intrinsic size back to its owner (`/api/follow/image-dims`). */
export function learnFollowDims(item: number, media: number | null, width: number, height: number): void {
  const key = `${item}:${media ?? ''}`;
  if (reported.has(key)) return;
  reported.add(key);
  queue.push(media === null ? { item, width, height } : { item, width, height, media });
  if (!timer) timer = setTimeout(flushDims, 800);
}
