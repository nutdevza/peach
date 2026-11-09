/* A card on the follows page: one post, with this site's alt and WIP marks plus cross-site "see also" folded inside.
 *
 * Shape matches the library video card (`../components/media-card.tsx`): cover cell on top, then a row of avatars, two lines of
 * title, one line of byline and time, then tags and "media not fetched". Top-left of the cover cell holds source and
 * see-also badges, bottom-right the duration, top-right the merge count; the save, watched and ignore round buttons appear in
 * the count's spot on hover or keyboard focus while the count fades, and on touch screens they are always visible side by
 * side below the count.
 *
 * Structure and style hooks reuse the video card's `data-media-*` (geometry, hover face, selection outline and check circle
 * all live in `../components/media-card.css`); the few cells the follow card adds use `data-follow-*`, written in
 * `./follow-feed.css`. The edition mark before the title, see-also badges, avatar rings and source icons are HTML strings
 * assembled by `./follow-marks.ts`, class names following the legacy stylesheet; details use the same ones, and React does not
 * own the nodes inside that cell.
 *
 * A stack (`isMix`) flips through the group's differing images one by one on hover, timing and thresholds same as the Mix card
 * (`../components/use-stack-flip.ts`). What flips are the thumbnails already at hand when the card rendered; hovering makes no
 * new requests; the first one is the static cover itself. */
import { memo, useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef, type MouseEvent } from 'react';
import { esc, fmtDur, icon, entityPath } from '@peach/legacy/core';
import { tagLabel } from '@peach/legacy/tags';
import { CardDate, CardTags, WhoLabel } from '../components/card-meta';
import { RecommendationReason } from '../components/recommendation-reason';

import { suppressShiftTextSelection } from '../components/row-click';
import { MIX_FLIP_FACES, useStackFlip } from '../components/use-stack-flip';
import {
  followStack, itemForMedia, videoItems, type FollowContext, type FollowFeedActions,
  type FollowGroup, type FollowMedia, type FollowSource,
} from './follow-feed';
import {
  followBadges, followCompactWhen, followIdentity, followMediaIssue, followTitle, followTitleMarks, followWhen,
  learnFollowDims, sourceMark,
} from './follow-marks';

/** Duration is written only when real: missing from the source, 0, or an obvious placeholder number all leave this cell out. */
const realDuration = (value: unknown) => Number(value) > 0;

export function FollowAuthorLink({ name, actions, children, ...attrs }: {
  name: string; actions: Pick<FollowFeedActions, 'openAuthor'>;
} & Omit<ComponentPropsWithoutRef<'a'>, 'href' | 'onClick'>) {
  return <a {...attrs} href={entityPath('creator', name)} onClick={(event) => {
    event.stopPropagation();
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    actions.openAuthor(name);
  }}>{children}</a>;
}

export interface FollowCardProps {
  variant?: 'grid' | 'next';
  retryKey?: number;
  group: FollowGroup;
  /** The sources under this card's creator: the avatar and byline read from it. */
  authorSources: readonly FollowSource[];
  media: FollowMedia;
  context: FollowContext;
  selected: boolean;
  selectMode: boolean;
  /** The write currently in progress on this card (status or save), and the sentence left on the card when the write fails. */
  busy: string;
  failure: string;
  actions: Pick<FollowFeedActions, 'openDetail' | 'openAuthor' | 'canFlip'> & Partial<Pick<FollowFeedActions, 'toggleSelection'>>;
  onStatus?(id: number, to: string): void;
  onSave?(id: number): void;
  /** The recommendation reason for the continue-watching row (variant="next"): replaces the tag row, the same as the continue-watching in the work detail. */
  reason?: { reasons: readonly string[]; tags: readonly string[] };
}

/** The cell shown when a card face has no image: the source's site logo centered, identical to cards that never got a thumbnail. */
const NoThumb = ({ provider }: { provider: string }) => (
  <span data-follow-nothumb="" dangerouslySetInnerHTML={{ __html: sourceMark(provider) }} />
);

/** When the card image fails, try the original-image proxy; on data refresh, failed images are allowed to fetch again. */
function Thumb({ src, fallback, width, height, provider, onLearn, retryKey }: {
  src: string; fallback?: string; width?: number; height?: number; provider: string;
  retryKey?: number;
  onLearn?: (width: number, height: number) => void;
}) {
  const [broken, setBroken] = useState(false);
  const [proxied, setProxied] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => { setBroken(false) }, [retryKey]);
  if (broken) return <NoThumb provider={provider} />;
  return (
    <img src={proxied ? fallback : src} alt="" loading="lazy" referrerPolicy="no-referrer"
      width={width || natural?.width} height={height || natural?.height}
      onError={() => {
        if (fallback && fallback !== src && !proxied) setProxied(true);
        else setBroken(true);
      }}
      onLoad={onLearn ? (event) => {
        const image = event.currentTarget;
        if (image.naturalWidth && image.naturalHeight) {
          setNatural({ width: image.naturalWidth, height: image.naturalHeight });
          onLearn(image.naturalWidth, image.naturalHeight);
        }
      } : undefined} />
  );
}

function FollowCardView(props: FollowCardProps) {
  const { group, authorSources, media, context, selected, selectMode, busy, failure, actions } = props;
  const item = itemForMedia(group, media);
  const imageView = media === 'images';
  const selectedMedia = imageView ? (item.media_items || []).find((entry) => entry.media_kind === 'image') : undefined;
  const thumbUrl = selectedMedia?.thumb_url || item.thumb_url || '';
  const imageFallback = imageView && item.playable
    ? `/follow-stream?id=${item.id}${selectedMedia ? `&media=${selectedMedia.index}` : ''}`
    : undefined;
  /* width/height let the browser reserve space by intrinsic ratio before the image lands; the image view fills in dimensions, video cards do not write back.
     The ratio is taken from whichever image the card face shows: if the card face is an image from the media list it lands on that image;
     when the card face is the item's own thumbnail it lands on the item. When neither exists, do not guess hard: use the dimensionless placeholder path, and after this image loads
     use intrinsic dimensions and write back to its owner. */
  const cardMedia = selectedMedia && selectedMedia.thumb_url === thumbUrl ? selectedMedia : null;
  const itemOwnsCard = !cardMedia || thumbUrl === item.thumb_url;
  const sized = imageView
    ? [cardMedia, itemOwnsCard ? item : null].find((owner) => Number(owner?.width) > 0 && Number(owner?.height) > 0)
    : null;
  const learn = imageView && !sized && thumbUrl
    ? (width: number, height: number) => learnFollowDims(item.id, cardMedia ? cardMedia.index : null, width, height)
    : undefined;
  const videos = media === 'videos' ? videoItems(group) : [];
  const embedded = item.media_items || [];
  const mixTarget = embedded.length > 1 ? item.id : (videos[0]?.id || item.id);
  /* Both the corner badge and card flipping take the server's verdict for the whole group (`group.stack`): the same artwork flips only once, and cross-site duplicates count by source. */
  const stack = followStack({
    cover: thumbUrl, coverFace: (selectedMedia?.thumb_url ? selectedMedia : item).face, stack: group.stack,
    imageView, limit: MIX_FLIP_FACES,
  });
  const faces = useRef(stack.faces);
  faces.current = stack.faces;
  const flip = useStackFlip({
    load: async () => faces.current, canFlip: () => faces.current.length > 1 && actions.canFlip(),
    referrerPolicy: 'no-referrer',
  });
  /* On scroll, page change, and opening multi-select the shell kills all hover effects via `_stopHover`, and this card's page flip is among them. */
  const stop = useRef(flip.onPointerLeave);
  stop.current = flip.onPointerLeave;
  const attach = useCallback((el: (HTMLElement & { _stopHover?: () => void }) | null) => {
    if (el) el._stopHover = () => stop.current();
  }, []);

  const identity = followIdentity(item, authorSources, context);
  const title = followTitle(item);
  const picProvider = item.resource_provider || item.provider;
  const tags = (item.tags || []).slice(0, 3);
  const issue = followMediaIssue(item, context);
  const badges = followBadges(group, item);
  const saved = item.status === 'saved';

  const click = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    /* Tags on this card are read-only: clicking one does nothing and does not count as clicking the card in multi-select. */
    if (target.closest('[data-media-tag]')) return;
    if (actions.toggleSelection && (selectMode || event.shiftKey || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      actions.toggleSelection(item.id, event.shiftKey);
      return;
    }
    actions.openDetail(item.id);
  };
  const act = (event: MouseEvent, run: () => void) => { event.stopPropagation(); run() };

  return (
    <article ref={attach} data-media-card="" data-variant={props.variant || 'grid'} data-follow-item={item.id} data-status={item.status}
      data-follow-image={imageView ? '' : undefined} data-collection={stack.isMix ? '' : undefined}
      data-selected={selected ? '' : undefined} onClick={click} onMouseDown={suppressShiftTextSelection}
      onMouseEnter={flip.onPointerEnter} onMouseLeave={flip.onPointerLeave}>
      <div data-follow-visual="" data-mix-stack={stack.isMix ? '' : undefined}>
        <button type="button" data-follow-open="" aria-label={`Open ${title} details`} />
        <div data-media-pic="">
          {thumbUrl
            ? <Thumb key={thumbUrl} src={thumbUrl} fallback={imageFallback} width={sized?.width} height={sized?.height}
                provider={picProvider} onLearn={learn} retryKey={props.retryKey} />
            : <NoThumb provider={picProvider} />}
          {stack.faces.length > 1 ? (
            <div data-mix-faces="" hidden={!flip.faces.length}>
              {flip.faces.map((src, index) => (
                <div key={src} data-mix-face={index === flip.current ? 'on' : index === flip.leaving ? 'off' : ''}>
                  <img src={src} alt="" loading="eager" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
          ) : null}
          <div data-follow-sources="">
            <span data-media-badge="" title={item.provider_label || item.provider}
              aria-label={`Source: ${item.provider_label || item.provider}`}
              dangerouslySetInnerHTML={{ __html: sourceMark(item.provider, item.provider_label) }} />
            {badges ? <span data-follow-badges="" dangerouslySetInnerHTML={{ __html: badges }} /> : null}
          </div>
          {actions.toggleSelection ? <span data-media-check="" onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            actions.toggleSelection?.(item.id, event.shiftKey);
          }} dangerouslySetInnerHTML={{ __html: icon('check') }} /> : null}
          {realDuration(item.duration) ? <span data-media-duration="">{fmtDur(item.duration)}</span> : null}
          {!selectMode ? <div data-follow-corner="">
            {stack.isMix ? (
              <button type="button" data-follow-collection={mixTarget}
                onClick={(event) => act(event, () => actions.openDetail(mixTarget))}>
                <span className="contents" dangerouslySetInnerHTML={{ __html: icon(stack.glyph) }} />{stack.label}
              </button>
            ) : null}
            {props.variant !== 'next' ? <div data-follow-actions="">
              <button type="button" data-follow-save={item.id} title={saved ? 'Saved' : 'Save to the database'}
                aria-label={saved ? 'Saved' : 'Save to the database'} disabled={saved}
                aria-busy={busy === 'save' || undefined} aria-disabled={busy === 'save' || undefined}
                onClick={(event) => act(event, () => props.onSave?.(item.id))}
                dangerouslySetInnerHTML={{ __html: icon(saved ? 'check' : 'bookmark-plus') }} />
              <button type="button" data-follow-status={item.id} data-to="seen" title="Mark as watched" aria-label="Mark as watched"
                disabled={item.status === 'seen'} aria-busy={busy === 'seen' || undefined}
                aria-disabled={busy === 'seen' || undefined}
                onClick={(event) => act(event, () => props.onStatus?.(item.id, 'seen'))}
                dangerouslySetInnerHTML={{ __html: icon('eye') }} />
              <button type="button" data-follow-status={item.id} data-to="ignored" title="Ignore" aria-label="Ignore"
                disabled={item.status === 'ignored'} aria-busy={busy === 'ignored' || undefined}
                aria-disabled={busy === 'ignored' || undefined}
                onClick={(event) => act(event, () => props.onStatus?.(item.id, 'ignored'))}
                dangerouslySetInnerHTML={{ __html: icon('eye-off') }} />
              {item.status === 'seen' || item.status === 'ignored' ? (
                <button type="button" data-follow-status={item.id} data-to="new" title="Restore to unwatched" aria-label="Restore to unwatched"
                  aria-busy={busy === 'new' || undefined} aria-disabled={busy === 'new' || undefined}
                  onClick={(event) => act(event, () => props.onStatus?.(item.id, 'new'))}
                  dangerouslySetInnerHTML={{ __html: icon('rotate-ccw') }} />
              ) : null}
            </div> : null}
          </div> : null}
        </div>
      </div>
      <div data-media-meta="">
        {identity.entityName ? (
          <FollowAuthorLink name={identity.entityName} actions={actions} data-media-avatar="" data-follow-avatar=""
            aria-label={`View ${identity.author}'s author page`} dangerouslySetInnerHTML={{ __html: identity.avatar }} />
        ) : <span data-media-avatar="" data-follow-avatar="" title="Creator avatar"
          dangerouslySetInnerHTML={{ __html: identity.avatar }} />}
        <div data-media-text="">
          <button type="button" data-media-title=""
            dangerouslySetInnerHTML={{ __html: followTitleMarks(group, item) + esc(title) }} />
          {/* The credit, date, and tag rows use the same parts as the work card (`../components/card-meta.tsx`); the name is wrapped in a link to the author page,
              the tags are read-only (no filtering on the card), and the source type is recorded alongside. */}
          <div data-media-byline="" data-follow-byline="">
            {identity.entityName ? (
              <FollowAuthorLink name={identity.entityName} actions={actions} data-media-who="" data-follow-author="" title={identity.author}>
                <WhoLabel name={identity.author} />
              </FollowAuthorLink>
            ) : <span data-media-who="" data-follow-author="" title={identity.author}><WhoLabel name={identity.author} /></span>}
            <span data-media-facts="">
              <CardDate value={item.published_at || ''} label={followCompactWhen(item)} title={followWhen(item)} />
            </span>
            {identity.credited ? <span data-follow-credit="" title={`Byline includes ${identity.credited}`}>{`Byline includes ${identity.credited}`}</span> : null}
          </div>
          {props.variant === 'next'
            ? props.reason ? <RecommendationReason reasons={props.reason.reasons} tags={props.reason.tags.map(tag => tagLabel(tag))} /> : null
            : <CardTags data-follow-labels="" tags={tags} label={tagLabel} readOnly
              attrs={(tag) => ({ 'data-tag-cat': `r34-${item.tag_types?.[tag] || 'unknown'}`, 'data-follow-tag': tag })} />}
          {issue ? <span data-follow-issue="">{issue}</span> : null}
        </div>
      </div>
      <span data-follow-state="" aria-live="polite">{failure}</span>
    </article>
  );
}

/** A screen holds hundreds of cards; re-renders beyond selection and write operations must not drag every card along: comparisons are by reference, and the helpers and actions the shell passes in keep their identity. */
export const FollowCard = memo(FollowCardView);
