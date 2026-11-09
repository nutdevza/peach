/* Follow details (ADR-0031): the whole block inside the stage: media area, right-side queue and sidebar.
 *
 * The stage (`<dialog id="stage">`), its enter/exit, the mini player and Video.js all belong to the stage island
 * (`../stage/`), which JAV details also use; this module only renders the stage's content, and once the media area's frame is
 * rendered it hands the player mount to the stage via `actions.mountPlayer`. Media area, sidebar and queue structure follow
 * the JAV details setup (`[data-stage-grid]` / `[data-stage-media]` / `[data-stage-side]` / `[data-mix-queue]`, shared by
 * both, styles in `../stage/stage.css`); the blocks follow details adds are styled in `follow-detail.css`.
 *
 * Switching media (carousel, multi-media queue) only changes island state: the media area swaps per the "entry:media" mapping
 * and the player is torn down and remounted accordingly. Switching to another entry in the group goes through the shell
 * (`actions.openItem`): the address must change; once the stage has fetched that entry it swaps content in place and the
 * popover does not reopen. */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { esc, fmtDur, foldName, icon, requestErrorMessage } from '@peach/legacy/core';
import { noteHtml } from '@peach/legacy/ui';
import { pageSkeletonHtml } from '../../management-placeholder';

import { Button } from '@/components/base/buttons/button';

import { ApiError, apiSend } from '../../api';
import { textLang } from '../../core/text-lang';
import { RetryNote } from '../components/grid-reveal';
import { MixGroupLabel, MixQueue, MixQueueRow } from '../components/mix-queue';
import { RelatedSection } from '../components/related-section';
import { DetailContinuation } from '../components/detail-continuation';
import { MediaCarousel } from '../components/media-carousel';
import { FollowAuthorLink, FollowCard } from '../follow-feed/follow-card';
import {
  FOLLOW_CREDENTIALS_KEY, fetchFollowCredentials, replaceFollowItem, setFollowItemStatus, videoItems,
  type FollowContext, type FollowFeedHelpers, type FollowGroup,
} from '../follow-feed/follow-feed';
import {
  followBadges, followIdentity, followMediaIssue, followTitle, followTitleMarks, followWhen, sourceIcon,
} from '../follow-feed/follow-marks';
import { FOLLOW_STATUS_URL } from '../follow-manage/follow-manage';
import { openPhotoLightbox } from '../photo-lightbox/photo-lightbox-dialog';
import { queryClient } from '../query';
import { addWant, fetchFollowWant, invalidateWants, removeWants, wantFollowKey, type Want } from '../wants/wants';
import {
  FOLLOW_MEDIA_HIDE_URL, FOLLOW_SAVE_URL, FollowItemGone, authorSources, collectionCopy, detailContext, detailMedia, detailSlides,
  fetchFollowItem, followItemKey, groupedMediaOwner, mediaName, resourceLabel, statusReceipt,
  type DetailMedia, type FollowDetailActions, type FollowDetailData, type FollowDetailItem, type FollowDetailMedia,
  type FollowDetailProps,
} from './follow-detail';
import { fetchFollowRelated, followRelatedGroups, followRelatedKey, followRelatedReasons } from './follow-related';
import { FollowTags } from './follow-tags';

const realDuration = (value: unknown) => Number(value) > 0;

/** The glyph takes the shell's `icon()` output as-is: the skeleton and the legacy details draw exactly that, and switching to a different glyph makes the handover jump. */
const Glyph = ({ name }: { name: string }) => (
  <span className="contents" dangerouslySetInnerHTML={{ __html: icon(name) }} />
);
/** The external link glyph: its stroke comes from the site-wide `svg.ui-externalmark` (`core/core.css`), and this page's 18px size lives in `follow-detail.css`. */
const EXTERNAL_MARK = icon('external-link', 'ui-externalmark');

export function FollowDetailPage(props: FollowDetailProps) {
  const { id, actions } = props;
  const result = useQuery({ queryKey: followItemKey(id), queryFn: ({ signal }) => fetchFollowItem(id, signal) });
  const credentialsResult = useQuery({
    queryKey: FOLLOW_CREDENTIALS_KEY, queryFn: ({ signal }) => fetchFollowCredentials(signal),
  });
  const credentials = useMemo(() => new Set((credentialsResult.data?.providers || [])
    .filter((provider) => provider.present).map((provider) => provider.provider)), [credentialsResult.data]);
  const [mediaIndex, setMediaIndex] = useState(props.mediaIndex);

  if (!result.data) {
    return (
      <div data-stage-grid="" data-follow-detail="">
        <div data-stage-media="" data-follow-detail-media="none">
          <CloseStage onClose={actions.close} />
          <div data-follow-detail-placeholder="">
            {result.isError
              ? gone(result.error)
                ? <GoneNote onBack={actions.close} />
                : <RetryNote message={requestErrorMessage(result.error)} onRetry={() => void result.refetch()} />
              : null}
          </div>
        </div>
      </div>
    );
  }
  return (
    <Detail {...props} data={result.data} context={detailContext(result.data, credentials)}
      mediaIndex={mediaIndex} onMedia={setMediaIndex} />
  );
}

const gone = (error: unknown) => error instanceof FollowItemGone || (error instanceof ApiError && error.status === 404);

/** The entry is gone: retrying cannot bring it back, so the only way out is back to the follows page. */
function GoneNote({ onBack }: { onBack(): void }) {
  return (
    <div data-follow-detail-gone="" onClick={(event) => {
      if ((event.target as HTMLElement).closest('[data-note-action]')) onBack();
    }} dangerouslySetInnerHTML={{ __html: noteHtml('This followed content no longer exists; the source may have deleted or cleaned it up.', { actionLabel: 'Back to follows' }) }} />
  );
}

/** The close key. Its `id` stays: Escape, clicking outside the overlay, and the shell's fallback all find it by `#closeStage` and click it once more. */
const CloseStage = ({ onClose }: { onClose(): void }) => (
  <button type="button" data-stage-close="" id="closeStage" title="Close" aria-label="Close" onClick={onClose}
    dangerouslySetInnerHTML={{ __html: icon('x') }} />
);

function Detail({ data, context, mediaIndex, onMedia, mediaView, relatedLimit, helpers, actions }: FollowDetailProps & {
  data: FollowDetailData; context: FollowContext; onMedia(index: number | null): void;
}) {
  const { item, group } = data;
  const media = detailMedia(item, group, mediaIndex, mediaView);
  const write = useDetailWrite(item, actions, onMedia);
  /* The two notices about unfetched media talk only about this media area: swapping in another media starts over. */
  const frameKey = `${item.id}:${media.selected?.index ?? ''}`;
  const [issue, setIssue] = useState<{ key: string; kind: MediaIssue }>({ key: '', kind: '' });
  const issues: MediaIssues = {
    failed: () => setIssue({ key: frameKey, kind: 'failed' }),
    thumbFallback: () => setIssue({ key: frameKey, kind: 'thumb' }),
  };

  useLayoutEffect(() => { actions.present(item, media.kind) }, [actions, item, media.kind]);

  const owner = !media.embedded.length && media.collection ? groupedMediaOwner(media.collection) : undefined;
  const queue = media.embeddedQueue
    ? <MediaQueue item={item} current={media.selected!.index} helpers={helpers} actions={actions} onMedia={onMedia} />
    : media.collection
      ? owner
        ? <MediaQueue item={owner} current={null} helpers={helpers} actions={actions} onMedia={onMedia} currentId={item.id} />
        : <CollectionQueue group={media.collection} itemId={item.id} helpers={helpers} actions={actions} />
      : null;

  return (
    <>
    <div data-stage-grid="" data-with-queue={queue ? '' : undefined} data-follow-detail="">
      <MediaFrame key={frameKey} item={item} media={media}
        helpers={helpers} actions={actions} onMedia={onMedia} issues={issues} />
      <Side item={item} data={data} context={context} media={media} write={write}
        issue={issue.key === frameKey ? issue.kind : ''} helpers={helpers} actions={actions} />
    </div>
    <DetailContinuation queue={queue}>
      {relatedLimit > 0 ? <Related data={data} media={media.kind === 'image' ? 'images' : media.kind === 'video' ? 'videos' : mediaView}
        limit={relatedLimit} context={context} helpers={helpers} actions={actions} /> : null}
    </DetailContinuation>
    </>
  );
}

function Related({ data, media, limit, context, helpers, actions }: {
  data: FollowDetailData; media: FollowDetailProps['mediaView']; limit: number; context: FollowContext;
  helpers: FollowFeedHelpers; actions: FollowDetailActions;
}) {
  const result = useQuery({ queryKey: followRelatedKey(data.item.id, media, limit),
    queryFn: ({ signal }) => fetchFollowRelated(data, media, limit, signal) });
  const [skeleton] = useState(() => pageSkeletonHtml('Loading recommendations', { cards: true, className: 'related-skeleton' }));
  const cardActions = useMemo(() => ({
    openDetail: actions.openItem, openAuthor: actions.openAuthor, canFlip: actions.canFlip,
  }), [actions]);
  const groups = followRelatedGroups(result.data?.pages || [], data, media, limit);
  const reason = followRelatedReasons(result.data?.pages || [], data, media);
  const sources = result.data?.pages.at(-1)?.sources || data.sources;
  const relatedContext = { ...context, sources, aliases: result.data?.pages.at(-1)?.author_aliases || context.aliases };
  return <RelatedSection online data-follow-related="" wireDrag={helpers.wireDrag} busy={result.isPending}
    empty={!!result.data && !groups.length}
    error={result.isError ? `Failed to load Continue watching: ${requestErrorMessage(result.error)}` : undefined}
    onRetry={() => { void result.refetch() }}>
    {result.data ? groups.map(group => <FollowCard key={group.primary.id} variant="next" group={group} media={media}
      authorSources={authorSources(group.primary, sources)} context={relatedContext} selected={false} selectMode={false}
      busy="" failure="" actions={cardActions} reason={reason(group)} />)
      : <div className="contents" dangerouslySetInnerHTML={{ __html: skeleton }} />}
  </RelatedSection>;
}

/* ── Media area ── */

function MediaFrame({ item, media, actions, onMedia, issues }: {
  item: FollowDetailItem; media: DetailMedia; helpers: FollowFeedHelpers; actions: FollowDetailActions;
  onMedia(index: number | null): void; issues: MediaIssues;
}) {
  const { kind, selected, src, images, position, carousel, frameRatio } = media;
  const frame = useRef<HTMLDivElement>(null);
  const slides = detailSlides(item, media);
  /* Originals go through the proxy; thumbnails are read by the browser straight from the public host: archive sites' original-file hosts block the server (pawchive's
     file. subdomain sits behind ddos-guard and always 403s), while the thumbnail host serves normally. */
  const thumb = selected?.thumb_url || item.thumb_url || '';
  const playable = item.playable && kind === 'video';
  const imageSrc = item.playable && kind === 'image' ? src : item.thumb_url || '';
  const fallback = item.playable && kind === 'image' && thumb && thumb !== src ? thumb : '';
  const [shown, setShown] = useState(imageSrc);

  /* The player mounts and unmounts only with this media block: a completed write swaps in a new object of the same entry and must not tear down and remount for it.
     The block itself keys by "item:media"; switching item or media rebuilds the whole block, and cleanup runs at that moment. The `<video>` is built by the stage
     inside this frame (same as video details); on error it reports back here. */
  const mounting = useRef({ item, selected });
  const failed = useRef(issues.failed);
  failed.current = issues.failed;
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node || !playable) return;
    return actions.mountPlayer(node, mounting.current.item, mounting.current.selected, { onError: () => failed.current() });
  }, [actions, playable]);

  return (
    <div ref={frame} data-stage-media="" data-follow-detail-media={kind || 'none'} data-framed={frameRatio ? '' : undefined}
      // oxlint-disable-next-line shadcn/no-inline-styles -- the frame ratio takes this image group's dimensions
      style={{ '--follow-frame-ratio': frameRatio ? frameRatio.toFixed(4) : undefined } as CSSProperties}>
      <CloseStage onClose={actions.close} />
      {playable ? null : imageSrc ? (
        <img data-follow-detail-poster="" data-zoomable={slides.length ? '' : undefined} src={shown} alt={item.title}
          referrerPolicy="no-referrer"
          onClick={slides.length ? () => void openPhotoLightbox(Math.max(0, position), slides) : undefined}
          onError={() => {
            if (fallback && shown !== fallback) { setShown(fallback); issues.thumbFallback(); return }
            issues.failed();
          }} />
      ) : (
        <div data-follow-detail-placeholder="">
          <span className="contents" dangerouslySetInnerHTML={{ __html: sourceIcon(item.resource_provider || item.provider) }} />
          <span>No preview available</span>
        </div>
      )}
      {carousel ? <MediaCarousel items={images} position={position} onSelect={onMedia} below renderThumbnail={entry => {
        const image = images.find(image => image.index === entry.index)!;
        const thumbnail = image.thumb_url || (item.playable ? `/follow-stream?id=${item.id}&media=${entry.index}` : item.thumb_url);
        return thumbnail ? <img src={thumbnail} alt="" referrerPolicy="no-referrer" /> : <span>Preview unavailable</span>;
      }} /> : null}
    </div>
  );
}

/* ── Queue ── */

/** A queue cell with no footage takes a neutral glyph, not a site icon: images in cells are always scaled to fill, and a 48px favicon
 *  stretched across the cell would look like this video's thumbnail. */
const NoThumb = ({ kind }: { kind: string }) => (
  <span data-follow-nothumb="" dangerouslySetInnerHTML={{ __html: icon(kind === 'image' ? 'image-off' : 'play') }} />
);

/** Removes the thumbnail when it cannot load, same as the legacy layer's `data-drop="self"`. */
function QueueThumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

function useDragRow(helpers: FollowFeedHelpers) {
  return useCallback((node: HTMLDivElement | null) => { if (node) helpers.wireDrag(node) }, [helpers]);
}

function CollectionQueue({ group, itemId, helpers, actions }: {
  group: FollowGroup; itemId: number; helpers: FollowFeedHelpers; actions: FollowDetailActions;
}) {
  const items = videoItems(group) as FollowDetailItem[];
  const listRef = useDragRow(helpers);
  return (
    <MixQueue kind="collection" data-follow-queue="" title="Video compilations" onClose={actions.close} listRef={listRef}
      summary={`${followTitle(group.primary)} · ${items.length} videos`}>
      {items.map((member) => {
        const duplicate = group.duplicates.includes(member);
        const copy = collectionCopy(group, member, duplicate ? member.provider_label : '');
        /* The same entry on another site attributes itself through the site icon, whose alt is the site name; sites without a registered icon still write the name out. */
        const siteIcon = duplicate ? sourceIcon(member.provider, member.provider_label) : '';
        return (
          <MixQueueRow key={member.id} current={member.id === itemId} data-follow-queue-item={member.id}
            onClick={() => actions.openItem(member.id)}
            pic={<>
              {member.thumb_url ? <QueueThumb src={member.thumb_url} /> : <NoThumb kind="video" />}
              {realDuration(member.duration) ? <i className="mono" data-mix-item-duration="">{fmtDur(member.duration)}</i> : null}
            </>}>
            <b data-truncate-end="">{copy.title}</b>
            <span data-follow-queue-meta="">
              {siteIcon
                ? <span data-follow-queue-source="" dangerouslySetInnerHTML={{ __html: siteIcon }} />
                : <i data-follow-variant={member.variant_kind || ''}>{copy.label}</i>}
              <time dateTime={member.published_at || ''}>{followWhen(member)}</time>
            </span>
          </MixQueueRow>
        );
      })}
    </MixQueue>
  );
}

/** The multimedia queue: every image and video in one post, grouped by cloud drive. `currentId` is the entry currently on stage;
 *  when a compilation switches to the group's cloud-drive-grouped entry, it and the queue's owner are not the same entry. */
function MediaQueue({ item, current, currentId = item.id, helpers, actions, onMedia }: {
  item: FollowDetailItem; current: number | null; currentId?: number; helpers: FollowFeedHelpers;
  actions: FollowDetailActions; onMedia(index: number | null): void;
}) {
  const items = item.media_items || [];
  const listRef = useDragRow(helpers);
  const groups: { key: string; label: string; items: FollowDetailMedia[] }[] = [];
  items.forEach((media) => {
    const key = media.resource_group || 'ungrouped';
    let row = groups.find((entry) => entry.key === key);
    if (!row) { row = { key, label: media.resource_group_label || '', items: [] }; groups.push(row) }
    row.items.push(media);
  });
  const pick = (media: FollowDetailMedia) => (item.id === currentId ? onMedia(media.index) : actions.openItem(item.id, media.index));
  return (
    <MixQueue kind="media" data-follow-queue="" title="Multimedia" onClose={actions.close} listRef={listRef}
      summary={`${followTitle(item)} · ${items.length} media`}>
      {groups.map((row) => [
        row.label ? <MixGroupLabel key={`label:${row.key}`} label={row.label} count={row.items.length} /> : null,
        ...row.items.map((media) => (
          <MixQueueRow key={media.index} current={media.index === current} data-follow-media-owner={item.id}
            data-follow-media-item={media.index} data-media-kind={media.media_kind || ''} onClick={() => pick(media)}
            pic={media.thumb_url ? <QueueThumb src={media.thumb_url} /> : <NoThumb kind={media.media_kind || ''} />}>
            <b data-middle-truncate="">{mediaName(media)}</b>
            <span data-truncate-end="">{media.media_kind === 'image' ? 'Images' : 'Videos'}</span>
          </MixQueueRow>
        )),
      ])}
    </MixQueue>
  );
}

/* ── Sidebar ── */

function Side({ item, data, context, media, write, issue, helpers, actions }: {
  item: FollowDetailItem; data: FollowDetailData; context: FollowContext; media: DetailMedia;
  write: DetailWrite; issue: MediaIssue; helpers: FollowFeedHelpers; actions: FollowDetailActions;
}) {
  const { kind, selected, src } = media;
  const single: FollowGroup = { primary: item, variants: [], duplicates: [], has_wip: item.variant_kind === 'wip' };
  const badges = followBadges(single, item);
  const identity = followIdentity(item, authorSources(item, data.sources), context);
  const postedBy = identity.credited ? ''
    : item.author && foldName(item.author) !== foldName(identity.author) ? item.author : '';
  const mediaIssue = followMediaIssue(item, context);
  const saved = item.status === 'saved';
  const { busy } = write;
  const busyAttrs = (key: string) => (busy.has(key) ? { 'aria-busy': true, 'aria-disabled': true } as const : {});
  return (
    <div data-stage-side="" data-follow-detail-side="">
      <div data-stage-side-content="">
        <div data-follow-detail-title="">
          <div data-stage-title="" data-follow-detail-name="" data-reveal-line=""
            dangerouslySetInnerHTML={{ __html: followTitleMarks(single, item) + esc(followTitle(item)) }} />
          {item.url ? (
            <a data-follow-origin="" href={item.url} target="_blank" rel="noreferrer noopener"
              title="Open the source page" aria-label="Open the source page"
              dangerouslySetInnerHTML={{ __html: EXTERNAL_MARK }} />
          ) : null}
        </div>
        <div className="mono" data-stage-meta="" data-reveal-line="">
          <span>{followWhen(item)}</span>
          {realDuration(item.duration) ? <span>{fmtDur(item.duration)}</span> : null}
          {badges ? <span data-follow-badges="" dangerouslySetInnerHTML={{ __html: badges }} /> : null}
        </div>
        <div data-item-identity="" data-follow-detail-identity="">
          <section data-id-group="creator">
            <h5 data-id-label="">Creators</h5>
            <div data-id-row="">
              {identity.entityName ? <FollowAuthorLink name={identity.entityName} actions={actions}
                data-id-cell="creator" data-entity-kind="creator" data-follow-source-avatar=""
                title={identity.author} aria-label={`View ${identity.author}'s author page`}>
                <span data-id-face="" dangerouslySetInnerHTML={{ __html: identity.avatar }} />
                <span data-id-name="">{identity.author}</span>
              </FollowAuthorLink> : <span data-id-cell="creator" data-follow-source-avatar="">
                <span data-id-face="" dangerouslySetInnerHTML={{ __html: identity.avatar }} />
                <span data-id-name="">{identity.author}</span>
              </span>}
            </div>
          </section>
          {postedBy || identity.credited ? <div data-follow-detail-credit="">
            {postedBy ? <span>Uploader {postedBy}</span> : null}
            {identity.credited ? <span>byline includes {identity.credited}</span> : null}
          </div> : null}
        </div>
        {item.summary ? <Summary key={item.id} text={item.summary} /> : null}
        {mediaIssue ? <p data-follow-media-issue="">{mediaIssue}</p> : null}
        {/* When upstream provides no media, the proxy just returns a failure with no reason. If a thumbnail exists, swap it in and say it is a thumbnail;
            only when even the thumbnail is unavailable say "not fetched this time, most likely rate limited", instead of leaving someone guessing at a blank canvas. */}
        <p data-follow-media-issue="" data-media-load-issue="" hidden={issue !== 'failed'}>
          Media not fetched: the upstream returned nothing this time, most likely site rate limiting. Try again shortly.
        </p>
        <p data-follow-media-issue="" data-media-thumb-fallback="" hidden={issue !== 'thumb'}>
          Original image not fetched, showing the thumbnail for now: the upstream blocked this request.
        </p>
        {item.resource_urls?.length ? (
          <div data-follow-resources="">
            {item.resource_urls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer noopener">
                {resourceLabel(url)}<span className="contents" dangerouslySetInnerHTML={{ __html: EXTERNAL_MARK }} />
              </a>
            ))}
          </div>
        ) : null}
        <div data-stage-actions="" data-follow-detail-actions="">
          <button type="button" data-stage-action="later" data-follow-detail-save="" aria-label={saved ? 'Saved' : 'Save to the database'}
            title={saved ? 'Saved' : 'Save to the database'} disabled={saved} {...busyAttrs('save')}
            onClick={write.save} dangerouslySetInnerHTML={{ __html: icon(saved ? 'check' : 'bookmark-plus') }} />
          <button type="button" data-stage-action="later" data-follow-detail-want="" aria-pressed={!!write.want}
            aria-label={write.want ? 'Remove from wants' : 'Want'} title={write.want ? 'Remove from wants' : 'Want'}
            {...busyAttrs('want')} onClick={write.toggleWant} dangerouslySetInnerHTML={{ __html: icon('star') }} />
          <button type="button" data-stage-action="seen" data-follow-detail-status="seen" aria-label="Mark as watched" title="Mark as watched"
            aria-pressed={item.status === 'seen'} {...busyAttrs('seen')} onClick={() => write.status('seen')}
            dangerouslySetInnerHTML={{ __html: icon('eye') }} />
          <button type="button" data-stage-action="dislike" data-follow-detail-status="ignored" aria-label="Ignore" title="Ignore"
            aria-pressed={item.status === 'ignored'} {...busyAttrs('ignored')} onClick={() => write.status('ignored')}
            dangerouslySetInnerHTML={{ __html: icon('eye-off') }} />
          {item.status === 'seen' || item.status === 'ignored' ? (
            <button type="button" data-follow-detail-status="new" aria-label="Restore to unwatched" title="Restore to unwatched"
              {...busyAttrs('new')} onClick={() => write.status('new')}
              dangerouslySetInnerHTML={{ __html: icon('rotate-ccw') }} />
          ) : null}
          {kind === 'image' && selected ? (
            <button type="button" data-stage-action="dislike" data-follow-media-hide={selected.index} aria-label="Hide this image"
              title="Hide this image" {...busyAttrs(`hide:${selected.index}`)} onClick={() => write.hide(selected.index)}
              dangerouslySetInnerHTML={{ __html: icon('image-off') }} />
          ) : null}
          {src ? (
            <a data-stage-action-link="" data-follow-download="" href={`${src}${src.includes('?') ? '&' : '?'}download=1`} download=""
              aria-label="Download locally" title="Download locally" dangerouslySetInnerHTML={{ __html: icon('download') }} />
          ) : null}
        </div>
        {/* Hidden images retreat to this restore strip: a thumbnail plus an undo button that puts them back into the carousel. They take no slot in the media queue and do not enter
            the badge count; they are already part of the "not being viewed" set. */}
        {item.hidden_media?.length ? (
          <div data-follow-hidden-media="">
            <span data-follow-hidden-label="">Hidden {item.hidden_media.length} images</span>
            <div data-follow-hidden-thumbs="">
              {item.hidden_media.map((hidden) => (
                <button type="button" key={hidden.index} data-follow-media-restore={hidden.index}
                  title={`Restore ${hidden.name || ''}`} aria-label={`Restore ${hidden.name || ''}`}
                  {...busyAttrs(`restore:${hidden.index}`)} onClick={() => write.restore(hidden.index)}>
                  {hidden.thumb_url ? <QueueThumb src={hidden.thumb_url} /> : <Glyph name="image-off" />}
                  <i dangerouslySetInnerHTML={{ __html: icon('rotate-ccw') }} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <span data-follow-state="" aria-live="polite">{write.failure}</span>
        <FollowTags key={item.id} item={item} label={helpers.tagLabel} actions={actions} />
      </div>
    </div>
  );
}

/** The summary collapses to eight lines by default; 'Expand' appears only when measurement confirms it was truncated, and the same button collapses it again. */
function Summary({ text }: { text: string }) {
  const node = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const box = node.current;
    if (!box || open) return undefined;
    const measure = () => setOverflows(box.scrollHeight > box.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text, open]);
  return (
    <>
      <p ref={node} data-follow-detail-summary="" data-long-text="" lang={textLang(text)} data-clamped={open ? undefined : ''}>{text}</p>
      {overflows || open ? (
        <Button variant="ghost" size="small" data-follow-summary-toggle="" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Collapse' : 'Expand'}
        </Button>
      ) : null}
    </>
  );
}

/* -- Write operations --
 * Save, status, want, hide, and restore of this image are all sent from the island. After status and save succeed, swap the same entry into both caches (the details one and
 * the one in the follows page list, with the card face state changing along), without refetching the list: closing details and returning to the list must not wait another network round trip.
 * Hide and restore swap out the whole media list; refetch this one entry, and the server projection gives the new visible set and thumbnails. */
type MediaIssue = '' | 'failed' | 'thumb';
type MediaIssues = { failed(): void; thumbFallback(): void };
type DetailWrite = ReturnType<typeof useDetailWrite>;

function useDetailWrite(item: FollowDetailItem, actions: FollowDetailActions, onMedia: (index: number | null) => void) {
  const id = item.id;
  const key = followItemKey(id);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [failure, setFailure] = useState('');
  const mark = (name: string, on: boolean) => setBusy((now) => {
    const next = new Set(now);
    if (on) next.add(name); else next.delete(name);
    return next;
  });
  const apply = (to: string) => {
    queryClient.setQueryData<FollowDetailData>(key, (data) => (data ? { ...data, item: { ...data.item, status: to } } : data));
    setFollowItemStatus(id, to);
  };
  const failed = (error: unknown) => {
    setFailure(requestErrorMessage(error) || 'The action failed');
    actions.failure('Follow state updated', error);
  };
  const statusMutation = useMutation({
    mutationFn: ({ to }: { to: string; was: string }) => apiSend(FOLLOW_STATUS_URL, { item: id, to }),
    onSuccess: (_result, { to, was }) => {
      apply(to);
      setFailure('');
      // Ignoring pulls this one out of wanted (the two are exclusive), so the wanted button has to pop back up.
      if (to === 'ignored') void invalidateWants();
      actions.toast(statusReceipt(to), {
        undo: was !== 'saved' ? async () => { await apiSend(FOLLOW_STATUS_URL, { item: id, to: was }); apply(was) } : undefined,
      });
    },
    onError: failed,
    onSettled: (_result, _error, { to }) => mark(to, false),
  });
  const saveMutation = useMutation({
    mutationFn: () => apiSend(FOLLOW_SAVE_URL, { item: id }),
    onSuccess: () => { apply('saved'); setFailure(''); actions.toast('Saved to the database') },
    onError: failed,
    onSettled: () => mark('save', false),
  });
  const mediaMutation = useMutation({
    mutationFn: async ({ index, hidden }: { index: number; hidden: boolean; next: number | null }) => {
      await apiSend(FOLLOW_MEDIA_HIDE_URL, { item: id, media: index, hidden });
      await queryClient.invalidateQueries({ queryKey: key, exact: true });
    },
    onSuccess: (_result, { hidden, next }) => {
      const data = queryClient.getQueryData<FollowDetailData>(key);
      if (data) replaceFollowItem(data.item);
      onMedia(next);
      setFailure('');
      actions.toast(hidden ? 'Hid this image' : 'Showing again');
    },
    onError: failed,
    onSettled: (_result, _error, { index, hidden }) => mark(`${hidden ? 'hide' : 'restore'}:${index}`, false),
  });
  /* Wants should ask the server per item: when the same item is removed in follow management's "wants" tab, this key must pop back up too. */
  const wantKey = wantFollowKey(id);
  const wanted = useQuery({ queryKey: wantKey, queryFn: ({ signal }) => fetchFollowWant(id, signal) });
  const want = wanted.data?.want ?? null;
  const wantMutation = useMutation({
    mutationFn: async (current: Want | null) => {
      if (current) await removeWants([current.id]);
      else await addWant({ follow: id });
      return !current;
    },
    onSuccess: (added) => {
      setFailure('');
      actions.toast(added ? 'Added to wants' : 'Want removed');
      void invalidateWants();
    },
    onError: failed,
    onSettled: () => mark('want', false),
  });
  return {
    busy, failure, want,
    toggleWant: () => { mark('want', true); wantMutation.mutate(want) },
    save: () => { mark('save', true); saveMutation.mutate() },
    status: (to: string) => { mark(to, true); statusMutation.mutate({ to, was: item.status }) },
    hide: (index: number) => {
      const next = (item.media_items || []).find((media) => media.index !== index && media.media_kind === 'image');
      mark(`hide:${index}`, true);
      mediaMutation.mutate({ index, hidden: true, next: next ? next.index : null });
    },
    restore: (index: number) => { mark(`restore:${index}`, true); mediaMutation.mutate({ index, hidden: false, next: index }) },
  };
}
