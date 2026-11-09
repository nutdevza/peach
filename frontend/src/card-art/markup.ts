/* The card, avatar and cover HTML fragments: the shell's assembled HTML and each island's `dangerouslySetInnerHTML` read the
 * same copies.
 *
 * Strings, not React elements: these `<img>` tags keep being mutated in place by others after landing. The fallback chain
 * (`./image-fallback.ts`) swaps `src`, removes or swaps to the initial letter when an image fails, and framing
 * (`./framing.ts`) writes inline styles and class names onto the image after load. React cannot see those changes: if the
 * nodes belonged to it, one re-render would wash the framing away, and updating nodes the fallback chain removed would throw.
 */
import { esc, firstGrapheme } from '@peach/legacy/core';
import { entityDisplayName } from '../core/entity-names';

import { javImageKind } from '../jav-artwork';
import { imageFallbackAttrs } from './image-fallback';
import { representativeOf } from './representatives';

/** Face framing: `axis`/`pct` is the half that pans, `box` is the half that zooms (`avatar_focus` of `/api/entity`). */
export interface FaceFocus {
  axis?: string;
  pct?: number;
  box?: { cx: number; cy: number; faceW: number; imgW: number; imgH: number } | null;
}

/** Avatar references: entity id, whether an entity image exists, framing. Two version numbers join the URL's `&v=`; see `withVersion`.
 *  `avatar_stand_in` is the server saying "the representative image is not the person" (`attach_avatar_availability`). */
export interface FaceRef {
  id?: number | null; has_image?: boolean; image_version?: string; logo_version?: string; avatar_focus?: unknown;
  avatar_stand_in?: boolean;
  rep?: number | null;
  has_avatar?: boolean;
  identity_categories?: string[];
  source_avatar_url?: string;
  source_avatar_fallbacks?: string[];
}

/** The line read on hover and by screen readers when a signature work image fills the account's round frame. */
export const STAND_IN_TITLE = 'Representative work, not the performer';

/* Images replaced in place (entity images, covers, logos) all carry the server-issued content version (file mtime) in the address: avatar swaps, HD cover fills, and logo swaps overwrite the same file, and if the address does not change, the browser reuses the old in-memory image within the same page,
   and only a refresh shows the new one. */
export const withVersion = (url: string, version: string | null | undefined): string =>
  version ? `${url}&v=${encodeURIComponent(version)}` : url;

/** Cover derived tiers (`/cover?thumb=`): `1` is a 1600 long edge, `2` is 800; `0` is the original. */
export type CoverTier = 0 | 1 | 2;

/** Cover address. `thumb` is the derived tier, `true` meaning the 1600 tier; `upgradeCover` upgrades by display size, with the version number kept at the end. */
export const coverUrl = (item: { code?: string | null; cover_key?: string; cover_version?: string },
  thumb: boolean | CoverTier = false): string => {
  const tier = thumb === true ? 1 : thumb || 0;
  return withVersion(`/cover?code=${encodeURIComponent(item.cover_key || item.code || '')}${tier ? `&thumb=${tier}` : ''}`,
    item.cover_version);
};

/** The screen pixel density cap for the card grid starting at the 800 tier. */
export const CARD_COVER_SMALL_DPR = 1.5;

/* Which tier the card grid's covers start from. On a 1440-wide desktop, cards spread 168-360 CSS px; a 1x screen needs under 400
   device pixels, so the 800 tier suffices; denser screens start at the 1600 tier, so large covers need not be blurry-then-sharp with one extra download.
   Ones not sharp enough at the starting tier are upgraded by `upgradeCover` after measuring the display size. */
export const cardCoverUrl = (item: { code?: string | null; cover_key?: string; cover_version?: string }): string =>
  coverUrl(item, (window.devicePixelRatio || 1) <= CARD_COVER_SMALL_DPR ? 2 : 1);

/** Official covers for out-of-library videos: `/cover-image` looks up the address by code on the server and fetches the image through Peach's outbound network settings, so the browser never hits the image host directly. */
export const remoteCoverUrl = (item: { code?: string | null }): string =>
  `/cover-image?code=${encodeURIComponent(item.code || '')}`;

/** The label's logo address; `variant` follows the slot: large slots want the wordmark, small ones the square icon. */
export const logoUrl = (studio: string, variant: string, version?: string | null): string =>
  withVersion(`/logo?studio=${encodeURIComponent(studio)}&variant=${variant}`, version);

const focusOf = (value: unknown): FaceFocus | null =>
  value && typeof value === 'object' ? value as FaceFocus : null;

/** "Performer" applies only to code releases. People appearing in amateur, creator-made and influencer content are entertainers; applying JAV's industry
 *  term is both inaccurate and confusing next to creator identity. The backend's `is_jav` decides. */
export function performerLabel(item: { is_jav?: boolean } | null | undefined): string {
  return item && item.is_jav ? 'Performers' : 'Artists';
}

/* The entity's face: the canonical entity image first, falling back to the representative-work avatar, and if neither is
   available, not a single `<img>` is emitted. Four positions share this one source (top-bar round avatar, card byline,
   co-performers, the large profile page slot).

   Emitting an image unconditionally and waiting for the 404 to strip it costs this: one video details page makes 9 such 404s
   (1 label entity image, 4 person entity images, 4 avatars), and the home page makes 2 at mobile viewport; the 404s of
   `/entity-image` and `/avatar` carry no cache headers, so every re-render fires the whole round again. `hasImage` arrives
   with the profile from `/api/tops`, `/api/items`, `/api/item` and `/api/entity`, judged by the same function that picks the
   image.

   The `rep` side carries no flag: what callers pass in should already be a "fetchable representative" (the top bar filtered
   when filling the representatives table, see `./representatives.ts`). `/avatar` is generated on demand; an image not yet
   cropped but with the contact sheet still present also counts as fetchable. That one-click path must not be closed off.

   The last link of the fallback chain must actually remove the `<img>` (`data-drop="self"`): leaving a broken `<img>` keeps
   `:has(img)` matching, the initial-letter underlay never comes back, and the browser paints the alt text.

   `thumb` wants the entity image scaled to a 640 long edge and takes it by default: the top bar, card bylines, co-performer
   rings and the identity cell are all round frames within 70 CSS px, and 640 has headroom even on 3x screens. Only the large
   profile page slot passes `false` to get the original: that spot exists to be seen clearly, and a zoomed face needs the
   original's pixels.

   `version` is the server's `image_version` sent alongside `has_image`, and `logoVersion` is `logo_version`.

   `standIn` is the server's `avatar_stand_in`: the account has no identity of its own, and the representative image in the
   round frame is only standing in. When the representative avatar is shown, the image carries a `title` and `aria-label`
   saying so; the entity image does not, and the labels are added when a failed entity image falls back to it. */
export function entityFaceImg({
  kind = 'performer', id = null, hasImage = false, version = '', rep = null, mark = null, logo = '',
  logoVersion = '', logoVariant = 'logo', alt = '', lazy = true, style = '', dropStyle = false, focus = null, thumb = true,
  standIn = false,
}: {
  kind?: string; id?: number | null | undefined; hasImage?: boolean | undefined; version?: string | null | undefined;
  rep?: number | null | undefined; mark?: number | null | undefined; logo?: string;
  logoVersion?: string | null | undefined; logoVariant?: string; alt?: string;
  lazy?: boolean; style?: string; dropStyle?: boolean; focus?: unknown; thumb?: boolean;
  standIn?: boolean | undefined;
} = {}): string {
  const useEntity = !!(id && hasImage);
  const entitySrc = useEntity ? withVersion(`/entity-image?kind=${kind}&id=${id}${thumb ? '&thumb=1' : ''}`, version) : '';
  // Whether `rep` has a value is decided by the server's has_avatar; without it this ring is not rendered.
  const avatarSrc = rep ? `/avatar?id=${rep}` : '';
  /* A studio's face is its own logo, not video screenshots; those are one film's frames, telling someone else's story.
     Studios go through `/logo`: `logo` only has a value when the caller asked `has_logo`. The variant follows position:
     large slots want a wordmark, small slots a square icon. Agencies without a logo file use the site roundel `mark` from the official site link. */
  const useLogo = !!logo;
  const src = useLogo ? logoUrl(logo, logoVariant, logoVersion)
    : (entitySrc || avatarSrc || (mark ? `/link-mark?id=${mark}` : ''));
  if (!src) return '';
  const fallbacks = useLogo ? [entitySrc, avatarSrc].filter(Boolean)
    : (useEntity && avatarSrc ? [avatarSrc] : []);
  // The face framing is computed from the entity image, but the fallback image is a different photo with the face elsewhere: attach it to the first ring only.
  const framed = useEntity && !useLogo;
  const faceBox = framed ? faceBoxAttrs(focus) : '';
  /* Panning and zooming are two halves of the same sidecar; this fills in the panning half for call sites: those given `focus` but
     not `style` compute it themselves with the same conversion. When passed separately, a missing `style` neither errors nor shows;
     the image still comes out, just geometrically centered, and those with faces near the top of the frame lose their heads to the crop. */
  const framedStyle = style || facePos(focus);
  /* Once a face frame is applied, the style must be removable: the zoom is written into the img's inline style by avatarFrame, and if the fallback
     does not remove it, those percentages get applied to this image sized against the previous one. Call sites need not remember to flip this switch;
     the cost of forgetting is one visibly misaligned image on the page, and it only surfaces when a fallback happens. */
  /* `decoding="async"` moves decoding off the main thread: when dozens of images land at once, synchronous decoding stalls scrolling
     and clicks together, and none of these images participate in first-screen layout anyway, since CSS fixes the frame sizes. */
  const note = standIn && src === avatarSrc ? ` title="${STAND_IN_TITLE}" aria-label="${STAND_IN_TITLE}"` : '';
  const fallbackNote = standIn && fallbacks.includes(avatarSrc)
    ? ` data-fallback-note-src="${esc(avatarSrc)}" data-fallback-note="${STAND_IN_TITLE}"` : '';
  return `<img src="${src}" width="128" height="128" alt="${alt}"${note}${fallbackNote}${lazy ? ' loading="lazy"' : ''} decoding="async"${framed ? framedStyle : ''} `
    + `${faceBox}${imageFallbackAttrs({
      dropStyle: (dropStyle || !!faceBox || !!framedStyle) && framed,
      fallbacks,
    })}>`;
}

/* The avatar's inner layer: lay the initial first, then stack the real image.
 *
 * A missing `has_image` is treated as "no image", matching entityFaceImg's default: every call site's ref arrives with the
 * flag from the server (card bylines, index pages, taste ranking, review cards, immersive mode); being lenient about the
 * missing flag would only let the next endpoint that forgets it quietly return to "emit unconditionally, strip on 404".
 *
 * Framing is the reverse: when not passed, read from the ref. It comes from the same delivery as `has_image`; passing it
 * separately would cost seven call sites each remembering once, and forgetting would neither error nor drop the image, only
 * center the geometry, the kind of mistake only visible by staring at the page cell by cell. The company cell wants
 * "explicitly no framing" and passes `null` to override. */
export function avatarInner(name: string, ref: FaceRef | null | undefined, repId: number | null | undefined,
  kind = 'performer', markId: number | null = null, logoName = '', logoVariant = 'icon',
  focus: unknown = undefined, thumb = true): string {
  // This layer is mostly small round avatars and narrow cells, where a label mark needs a square icon rather than a horizontal wordmark; the index page's
  // The label's large cell is the one exception in the same template, requested by the caller naming `large`.
  const hint = focus === undefined ? (ref && ref.avatar_focus) || null : focus;
  const sourceFace = !ref?.has_image && !logoName && ref?.source_avatar_url
    ? `<img src="${esc(ref.source_avatar_url)}" width="128" height="128" alt="" loading="lazy" decoding="async" ${
      imageFallbackAttrs({ fallbacks: ref.source_avatar_fallbacks || [] })}>` : '';
  return `<span class="ini">${esc(firstGrapheme(entityDisplayName(kind, name, ref?.id)))}</span>`
    + (sourceFace || entityFaceImg({
      kind, id: ref && ref.id, hasImage: !!(ref && ref.has_image), version: ref && ref.image_version,
      rep: ref?.has_avatar && ref.rep ? ref.rep : repId, mark: markId,
      logo: logoName, logoVersion: ref && ref.logo_version, logoVariant, focus: hint, thumb,
      standIn: !!(ref && ref.avatar_stand_in),
    }));
}

/** Card bylines, Mix stacked avatars and the immersive author cell: `avatarInner` reads the reference or the top bar's representatives table. Empty `kind` means
 *  "no named person"; it does not fall back to representatives and shows an initial via the performer tier. */
export function entityAvatar(name: string, ref: FaceRef | null | undefined, kind: string): string {
  return avatarInner(name, ref, kind ? representativeOf(name) : null, kind || 'performer');
}

/* Face framing: the profile page's round frame frames by the detected face center (`avatar_focus` of /api/entity).
   Undetected or never computed returns the empty string and keeps geometric centering; it must be removed when falling back
   to another image, because that is a different photo with the face somewhere else, see the large profile card image's
   `data-drop-style`.
 *
   The conversion has one home. The profile page writes it into the img's style; the index page's large-image layout must hand
   it to a CSS variable on the round frame, since the img there is assembled by the shared `avatarInner` and the only container
   the layout can change is the frame. */
export function faceOrigin(value: unknown): string {
  const f = focusOf(value);
  return f && f.axis === 'x' ? `${f.pct}% 50%`
    : f && f.axis === 'y' ? `50% ${f.pct}%`
      : '';
}

export function facePos(value: unknown): string {
  const origin = faceOrigin(value);
  return origin ? ` style="object-position:${origin}"` : '';
}

/* Face zoom: hand the face box's pixel size to the page; the factor is computed after the image loads, from the frame's real
   size.

   Panning alone cannot fix "the face is too small": cover's scaling is fixed by the frame-to-image ratio, so whatever share
   the face has in the image is what it has in the frame. Of 539 images, 29 are full-body standing shots with the face in a
   small patch of the upper half; even centered, that is an unrecognizable head. The zoom factor is clamped by `./face-frame.ts`
   between "legible", "no upsampling" and "no head cropping"; the server cannot compute it: it does not know how big the frame
   is or how many pixels per inch this screen has.

   An attribute, not style: the factor can only be computed once image and frame have both landed, the same path as the
   cover's `data-cx`/`coverAnchor`. Sidecars missing `box` (computed before the field was added) do not get the attribute;
   those images keep panning without zooming.

   Five numbers packed into one attribute so the fallback only has to strip one thing: the face box only describes the first
   ring's entity image, and switching to the `/avatar` image invalidates it wholesale, see advanceImageFallback in
   `./image-fallback.ts`. */
export function faceBoxAttrs(value: unknown): string {
  const b = focusOf(value)?.box;
  if (!b) return '';
  return ` data-facebox="${[b.cx, b.cy, b.faceW, b.imgW, b.imgH].map(Number).join(' ')}"`;
}

/** The fields the cover image needs. */
export interface CoverItem {
  id?: number;
  code?: string;
  cover_key?: string;
  is_jav?: boolean;
  has_cover?: boolean;
  cover_version?: string;
  has_thumb?: boolean;
  has_local_poster?: boolean;
  cover_frame?: { cx?: number | null; cy?: number | null; layout?: string } | null;
  poster_box?: { x0?: number; y0?: number; x1?: number; y1?: number; px?: number[]; method?: string } | null;
  [field: string]: unknown;
}

/* The official cover's `<img>`. Face position is handed to the page as-is; the anchor is computed by `coverAnchor` after load: which axis gets cropped and
   how far to push can only be known with both the image's and the container's ratios. People's positions in frames vary widely, and a hardcoded anchor would
   crop some videos' chins or cut them out of frame entirely; without a face, fall back to fixed framing. */
export function coverImage(item: CoverItem, layout: 'big' | 'small', eager = false): string {
  const src = cardCoverUrl(item);
  const wide = /ブルーレイ|blu[\s-]?ray/i.test(String(item.title || item.display_title || item.name || ''));
  const f = item.cover_frame || {};
  const still = item.poster_box?.method !== 'manual' && (f.layout === 'still'
    || /^(IENEE|IENFE|SDHS)-/i.test(String(item.code || ''))
    || /(?:【|\[|\(|（)\s*(?:[48]K\s*)?VR\s*(?:】|\]|\)|）)/i.test(String(item.title || item.display_title || item.name || '')));
  const faceY = f.cy == null ? null : still ? Math.min(1, Math.max(0, f.cy)) : Math.min(0.6, Math.max(0.05, f.cy));
  const face = [f.cx != null ? ` data-cx="${f.cx}"` : '',
    faceY != null ? ` data-cy="${faceY}"` : ''].join('');
  /* The front cover's crop box: source-image pixel coordinates plus source dimensions, which `posterPanel` converts to
     percentages after load. `map(Number)` is both validation and escaping: only numbers make it into the attribute. */
  const pb = item.poster_box;
  const box = pb ? ` data-posterbox="${[pb.x0, (pb.px || [])[0], (pb.px || [])[1], pb.y0, pb.x1, pb.y1].map(Number).join(' ')}"` : '';
  // The small view shows the whole image (including the stills collage); the large view takes only the front cover on the right.
  return `<img class="poster cover ${layout === 'small' ? 'whole' : 'front'}" src="${src}"
    width="640" height="360" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async" data-cover-code="${esc(item.code || '')}"${wide ? ' data-wide-sleeve="1"' : ''}${still ? ' data-cover-layout="still"' : ''}${face}${box} data-drop="self">`;
}

/** The cover cell's two images: the official jacket (framing link owns it) or a preview image. An empty string means this item has no usable image. */
export type ArtworkKind = 'cover' | 'thumb' | '';

export interface Artwork {
  kind: ArtworkKind;
  html: string;
}

const NO_ARTWORK: Artwork = { kind: '', html: '' };

/** Covers for code titles: per "JAV default cover", fetch the official sleeve or the preview image, both attached to the element,
 *  so changing the setting swaps images in place via `syncJavImages`. Crop data travels with the element, so switching from preview back to cover still finds the box. */
export function javArtwork(item: CoverItem, layout: 'big' | 'small', eager: boolean, javImage: unknown): Artwork {
  const kind = javImageKind(item, javImage);
  if (!kind) return NO_ARTWORK;
  const cover = item.has_cover && item.code ? cardCoverUrl(item) : '';
  const thumb = item.has_thumb || item.has_local_poster ? `/poster?id=${item.id}&c=4` : '';
  const coverMarkup = coverImage(item, layout, eager);
  const frame = (coverMarkup.match(/ data-(?:c[xy]|posterbox)="[^"]*"/g) || []).join('');
  const image = kind === 'cover'
    ? coverMarkup
    : `<img class="poster" src="${thumb}" width="640" height="360" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${frame}>`;
  return {
    kind: kind === 'cover' ? 'cover' : 'thumb',
    html: image.replace('<img ', `<img data-jav-image="${item.id}" data-jav-cover="${esc(cover)}" data-jav-thumb="${esc(thumb)}" data-jav-image-layout="${layout}" `),
  };
}

/** A video card's cover. Code titles take the path above; follow-source entries use the source's own thumbnail; the rest take the local
 *  preview cell. `size` is this screen's large/small image and applies only to code titles. */
export function cardArtwork(item: CoverItem & { follow_thumb_url?: string | null }, size: 'big' | 'small',
  eager: boolean, javImage: unknown): Artwork {
  if (item.is_jav) return javArtwork(item, size, eager, javImage);
  if (item.follow_thumb_url) {
    return {
      kind: 'thumb',
      html: `<img class="poster" src="${esc(item.follow_thumb_url)}" width="640" height="360" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">`,
    };
  }
  return mixFace(item, size, eager, javImage);
}

/** One Mix frame; the small image on every play queue row is it too: coded videos follow the cover chain, the rest use the local preview frame, so the same entry
 *  looks the same in both places. `size` applies only to coded videos. */
export function mixFace(item: CoverItem, size: 'big' | 'small', eager: boolean, javImage: unknown): Artwork {
  if (item.is_jav) return javArtwork(item, size, eager, javImage);
  if (item.has_cover && item.cover_key) return { kind: 'cover', html: coverImage(item, size, eager) };
  return frameArtwork(item, eager);
}

/** The video's own picture: frame grabs cut from the local preview cell. Without one it is empty and the card writes "No preview".
 *  Portrait cells (the portrait strip and the portrait-filtered grid) only show portrait-ratio videos, and code videos use only this there, never borrowing the code's official
 *  cover: the cover is the whole video's promo art, mostly landscape, not the same picture as this portrait-ratio volume. */
export function frameArtwork(item: CoverItem, eager: boolean): Artwork {
  if (!item.has_thumb && !item.has_local_poster) return NO_ARTWORK;
  return { kind: 'thumb', html: `<img class="poster" src="/poster?id=${item.id}&c=4" width="640" height="360" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async">` };
}

/** The thumbnail in a play queue row: Mix faces take the small image, and with none available a "no preview" placeholder fills the cell. */
export function queueThumbHtml(item: CoverItem, javImage: unknown): string {
  return mixFace(item, 'small', false, javImage).html || '<span class="nopic">No preview</span>';
}

/* The poster slot the details opening gives the player: while video.js's script is still downloading and the stream source not yet attached, the frame shows the local
   cover, leaving no black block. Which image follows the same criterion as the card, and code videos follow the "JAV default cover" setting;
   official cover or preview; other media fall back to the local preview cell. An empty return means this entry has no usable local image,
   and the player still starts from black. */
export function detailPosterUrl(item: CoverItem, javImage: unknown): string {
  const thumb = item.has_thumb || item.has_local_poster ? `/poster?id=${item.id}&c=4` : '';
  if (!item.is_jav) return item.has_cover && item.cover_key ? coverUrl(item) : thumb;
  return javImageKind(item, javImage) === 'cover'
    ? coverUrl(item) : thumb;
}

/** The fields the card byline needs. */
export interface IdentityItem {
  is_jav?: boolean;
  creator?: string;
  performers?: string[];
  performer_entities?: (FaceRef | null)[];
  performer_total?: number;
  creator_entity?: FaceRef | null;
  entity_refs?: Partial<Record<'performer' | 'creator' | 'studio' | 'series', FaceRef[]>>;
  studio?: string;
  code?: string;
  tags?: string[];
}

/* Which identity the card byline lands on. Video cards, edition queues and "Continue watching" must share one derivation:
 * computing separately would fork on the 35 same-named creator/performer pairs, one video pointing at two entities in two
 * places.
 *
 * Legacy code projections often stuff the performer's romaji into `asset.creator` too. Once the canonical performer entity is
 * localized, the legacy flat field must not steal the byline and link; non-code creator videos still prefer creator.
 *
 * Co-starred videos hint at multiple people with avatars but keep only the first name in text, plus the total count. Two long
 * names plus metadata would wrap a normal card to three lines; "first + N more" still conveys identity and scale. */
export function cardIdentity(item: IdentityItem): {
  kind: '' | 'creator' | 'performer'; name: string; coStarred: boolean; performers: string[];
  refs: (FaceRef | null)[]; total: number;
} {
  const performers = item.performers || [];
  const refs = item.performer_entities ?? item.entity_refs?.performer ?? [];
  const performer = performers[0] || '';
  const primaryCreator = item.is_jav && performer ? '' : item.creator || '';
  const kind = primaryCreator ? 'creator' : performer ? 'performer' : '';
  return {
    kind, name: primaryCreator || performer || 'Unassigned',
    coStarred: performers.length > 1 && !primaryCreator, performers, refs,
    total: item.performer_total || performers.length,
  };
}

/* The avatar in a play-queue row. The whole row is a <button>, and nesting a <button> inside gets split apart by the browser,
   throwing the avatar and title out of the row, so this always emits a `<span>` and is not clickable.
 *
 * Avatar and name must land on one identity. If each picked its own kind (avatar checking performer first, name checking
 * creator first), the 35 same-named creator/performer duplicate pairs in the database would have one jump to
 * `/performers/x` and the other to `/creators/x`: two entries on one card going two places. */
export function queueAvatarHtml(item: IdentityItem): string {
  const { kind, name, coStarred, performers, refs } = cardIdentity(item);
  if (coStarred) {
    return `<div class="mavstack">${performers.slice(0, 5)
      .map((nm, i) => `<span class="mav">${avatarInner(nm, refs[i], representativeOf(nm))}</span>`)
      .join('')}</div>`;
  }
  const ref = kind === 'performer' ? refs[0] : item.creator_entity ?? item.entity_refs?.creator?.[0];
  return `<span class="mav">${avatarInner(name, ref, kind ? representativeOf(name) : null, kind || 'performer')}</span>`;
}

/** Mix attribution: coded videos credit the performer first, the rest credit the creator first. */
export function mixLabel(item: IdentityItem, tagLabel: (tag: string) => string): string {
  const performer = (item.performers || [])[0];
  if (item.is_jav && performer) return entityDisplayName('performer', performer);
  if (item.creator) return entityDisplayName('creator', item.creator);
  return (performer ? entityDisplayName('performer', performer) : '') || item.studio || item.code
    || tagLabel((item.tags || [])[0] || '') || 'Recommended for you';
}
