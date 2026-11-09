/* A stack of videos' card: each list on the playlists page, the same thing as the home Mix card.
 *
 * Two layers of paper edges press behind the cover, saying it is a stack; on hover the images in the stack flip one by one
 * (`use-stack-flip.ts`). The cover's bottom-right holds a count badge, below it a row of the members who appear most in the
 * stack, then title and one line of sources, with a cell left at the far right for the secondary action (kebab menu). The
 * whole cover is the "open" click area, and each avatar leads to its profile page.
 *
 * The card is a media card, not a Board filled card: transparent base, no padding, the face exists only on the cover. Paper
 * edges, flipping, badge base and the yield geometry of stacked avatars live in `../styles.css`'s `[data-mix-*]` rule group:
 * pseudo-elements, `color-mix` and adjacent-sibling selectors cannot be written in utility classes. */
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { avatarInner, representativeOf } from '@peach/card-art';
import { firstGrapheme } from '@peach/legacy/core';

import { ArtSlot } from './art-slot';
import { spriteGlyph } from './sprite-glyph';
import { useStackFlip } from './use-stack-flip';

export { MIX_FLIP_FACES, MIX_FLIP_LEAD_MS, MIX_FLIP_MS } from './use-stack-flip';

const PLAY = spriteGlyph('play');

/** One entry in the byline row. `kind` is `performer`/`creator`. */
export interface MixCardFace {
  kind: string;
  id: number;
  name: string;
  has_image?: boolean;
  image_version?: string;
  avatar_focus?: unknown;
}

export interface MixCardProps {
  /** The title, which is also the name inside the click target's and the menu's accessible names. */
  name: string;
  /** The line under the title: where this stack came from. */
  caption: ReactNode;
  /** The count on the badge. */
  count: number;
  /** The still cover's URL. When there is none, "No preview" is written. */
  poster: string | null;
  /** The addresses of the images cycled through on hover, in order; at most the first `MIX_FLIP_FACES`. */
  flipImages(): Promise<readonly string[]>;
  /** Whether flipping is allowed right now (shell multi-select, occlusion, reduced motion, mid-scroll). */
  canFlip(): boolean;
  /** People on the byline row, at most five; when there are none, render the title's first character. */
  faces: readonly MixCardFace[];
  /** Click the avatar: go to this person's profile page. */
  onOpenEntity(kind: string, name: string): void;
  /** Clicks the cover. Leave it out when this stack has nowhere to go (empty list) and the click area is inert. The argument is the card itself; the shell uses
   *  it as the origin of the open animation. */
  onOpen?: (card: HTMLElement) => void;
  /** The cover click area's accessible name, for example 'Open playlist Weekend Slow Watch'. */
  openLabel: string;
  /** The rightmost cell on the byline row: the secondary actions menu. */
  menu?: ReactNode;
  /** The cover cell's aspect ratio. Defaults to 16:9; the home page's one follows this screen's card layout. */
  ratio?: number;
  /** The static cover switches to the image HTML the legacy layer assembles (the crop pipeline for code titles needs to take it over), and the cover cell also carries the video card's
   *  cover cell hook (`data-media-pic`), so blurred backing and cropping follow the same path as video cards. */
  artwork?: { kind: string; html: string };
  /** The still cover's identity once the layout is stripped, and swapping the layout in place; see `./art-slot.tsx`. */
  artworkIdentity?: string;
  relayoutArt?(root: HTMLElement): void;
  /** Each paging frame is also drawn in HTML, looking the same as the still cover; the argument is the URL handed over by `flipImages`. */
  faceHtml?(src: string): string;
  /** The text on the badge. When not given, "N videos". */
  badge?: string;
  /** The byline row becomes a play glyph and no avatar is drawn: the home Mix card means "similar videos seeded by it". */
  glyph?: boolean;
  /** The whole card is the click target (the home page one). Without it only the cover is clickable, and each byline avatar leads to its own profile page. */
  wholeCard?: boolean;
}

/** The still cover. When unavailable, remove the image leaving only the black base, same as the legacy layer's `data-drop="self"`. */
function Poster({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img data-mix-poster="" src={src} width={640} height={360} alt="" loading="lazy" onError={() => setBroken(true)}
      className="absolute inset-0 block size-full object-contain" />
  );
}

/** The round frame set shared everywhere: a 38px perfect circle, image covering, initial centered. */
const RING = 'relative inline-grid size-9.5 flex-none place-items-center overflow-hidden rounded-full'
  + ' bg-background-secondary-default text-body-2-regular text-text-secondary'
  + ' [&_img]:absolute [&_img]:inset-0 [&_img]:block [&_img]:size-full [&_img]:object-cover';

/** The HTML inside the round frame is assembled by `avatarInner`: image when there is one, initials otherwise, and top-work avatars look up the same top-works table. */
function Avatars({ faces, fallback, onOpenEntity }: {
  faces: readonly MixCardFace[]; fallback: string; onOpenEntity: MixCardProps['onOpenEntity'];
}) {
  if (!faces.length) {
    return <span data-mix-initial="" aria-hidden className={`${RING} mt-0.5`}>{fallback}</span>;
  }
  return (
    <div data-mix-avatars="">
      {faces.slice(0, 5).map((face) => (
        <button key={`${face.kind}:${face.id}`} type="button" title={`Open profile: ${face.name}`}
          aria-label={`Open profile: ${face.name}`} onClick={() => onOpenEntity(face.kind, face.name)}
          className={`${RING} cursor-pointer outline-none`}
          dangerouslySetInnerHTML={{ __html: avatarInner(face.name, face, representativeOf(face.name), face.kind) }} />
      ))}
    </div>
  );
}

export function MixCard({
  name, caption, count, poster, flipImages, canFlip, faces, onOpenEntity, onOpen, openLabel, menu,
  ratio, artwork, artworkIdentity, relayoutArt, faceHtml, badge, glyph, wholeCard,
  ...data
}: MixCardProps & Record<`data-${string}`, string>) {
  const flip = useStackFlip({ load: flipImages, canFlip });
  /* On scroll, page change, and opening multi-select the shell kills all hover effects via `_stopHover`, and this card's page flip is among them. */
  const stop = useRef(flip.onPointerLeave);
  stop.current = flip.onPointerLeave;
  const card = useRef<HTMLElement | null>(null);
  const attach = useCallback((el: (HTMLElement & { _stopHover?: () => void }) | null) => {
    card.current = el;
    if (el) el._stopHover = () => stop.current();
  }, []);
  const open = onOpen ? () => { if (card.current) onOpen(card.current) } : undefined;
  const cover = artwork !== undefined || ratio !== undefined;
  return (
    <article {...data} ref={attach} data-mix-card="" onMouseEnter={flip.onPointerEnter}
      onMouseLeave={flip.onPointerLeave} onClick={wholeCard ? open : undefined}
      className="relative flex min-w-0 cursor-pointer flex-col gap-2">
      <div data-mix-stack="" className="relative isolate rounded-surface">
        <div data-mix-cover="" data-media-pic={cover ? '' : undefined}
          style={ratio !== undefined ? { '--card-ratio': String(ratio) } as CSSProperties : undefined}
          className="relative z-1 flex aspect-video items-center justify-center overflow-hidden">
          {artwork?.html
            ? <ArtSlot artwork={artwork} identity={artworkIdentity} relayout={relayoutArt} />
            : poster
              ? <Poster key={poster} src={poster} />
              : <span className="text-caption-1-regular tracking-caps text-text-secondary uppercase">No preview</span>}
          <div data-mix-faces="" hidden={!flip.faces.length}>
            {flip.faces.map((src, index) => (
              <div key={src} data-mix-face={index === flip.current ? 'on' : index === flip.leaving ? 'off' : ''}>
                {faceHtml
                  ? <span data-media-art="" dangerouslySetInnerHTML={{ __html: faceHtml(src) }} />
                  : <img src={src} alt="" loading="eager" />}
              </div>
            ))}
          </div>
          <button type="button" data-mix-open="" aria-label={openLabel} disabled={!onOpen} onClick={wholeCard ? undefined : open}
            className="absolute inset-0 z-1 cursor-pointer rounded-surface outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring disabled:cursor-default" />
          <span data-mix-badge=""
            className="absolute right-2.25 bottom-2.25 z-6 flex min-h-7 items-center gap-1.5 rounded-2lg px-2.25 py-1 text-caption-1-semibold text-text-white">
            <PLAY aria-hidden className="size-(--icon-inline)" />
            {badge ?? `${count.toLocaleString()} videos`}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 items-start gap-2.25">
        {glyph
          ? <span data-mix-glyph="" aria-hidden><PLAY /></span>
          : <Avatars faces={faces} fallback={firstGrapheme(name)} onOpenEntity={onOpenEntity} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <b data-mix-title="" className="truncate text-body-bold text-text-primary">{name}</b>
          <span data-mix-caption="" className="mt-0.5 truncate text-caption-1-regular text-text-secondary">{caption}</span>
        </div>
        {menu}
      </div>
    </article>
  );
}
