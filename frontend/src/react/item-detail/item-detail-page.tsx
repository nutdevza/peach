/* Video details (ADR-0031): the whole block inside the stage: play area, right-side queue, sidebar and "Continue watching"
 * below.
 *
 * The stage (`<dialog id="stage">`), its enter/exit, the mini player and Video.js all belong to the stage island
 * (`../stage/`), which follow details also use; this module only renders the stage's content, and once the play area's media
 * frame is rendered it hands the player mount to the stage via `actions.mountPlayer`. Clicking identity, tags or region
 * returns to the list or profile page, and switching entries in the queue goes through the shell: address and top-bar context
 * must change. When switching entries in the queue the stage swaps content in place and the popover does not reopen.
 *
 * Write operations (rating, tags, feedback, Watch later, quality targets, preferences, playlist ordering and removal) are
 * sent from the island; on success the server-returned fields are swapped into `['item', id]`, the same card in the catalog
 * grid cache swaps along, and the list is not re-read. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fmtDur, fmtSize, icon, requestErrorMessage } from '@peach/legacy/core';
import {
  coverUrl, mixLabel, performerLabel, queueAvatarHtml, queueThumbHtml,
} from '@peach/card-art';
import { confirmModal, spinnerHtml } from '@peach/legacy/ui';

import { apiGet, apiSend } from '../../api';
import { Button } from '@/components/base/buttons/button';
import { RiArrowDownSLine } from '@remixicon/react';
import { CatalogGridPage } from '../catalog-grid/catalog-grid-page';
import { patchCatalogItems, replaceCatalogItem } from '../catalog-grid/catalog-grid';
import type { MediaItem } from '../catalog-grid/types';
import { RetryNote } from '../components/grid-reveal';
import { PendingWork, pendingRefetch } from '../components/pending-work';
import { MixQueue, MixQueueRow } from '../components/mix-queue';
import { RelatedSection } from '../components/related-section';
import { DetailContinuation } from '../components/detail-continuation';
import { DetailTags } from '../components/detail-tags';
import { RatingStars } from '../components/rating-stars';
import { CollapseChevron } from '../components/collapse-region';
import { IdentityCell, IdentitySeries } from '../components/identity-cell';
import { useFoldedTitle } from '../components/folded-title';
import { MediaCarousel } from '../components/media-carousel';
import { CatalogPicture } from './catalog-picture';
import { fetchJavDetail, javDetailKey } from '../jav-detail/jav-detail';
import { busyProps } from '../settings/use-action';
import { ExternalPlayback } from './external-playback';
import { isPlayerGuidePreview } from '../../player/guide-preview';
import { CoverCrop } from '../cover-crop/cover-crop-page';
import { queryClient } from '../query';
import { LibraryCompletionPrompt, missingPreviewIds } from '../library-processing/library-completion';
import {
  CAST_SHOWN, EDITION_TONE, FEEDBACK_URL, ITEM_TAG_URL, PLAYLIST_URL, PREFERENCE_URL, QUALITY_GOAL_URL,
  RELATED_URL, WATCH_LATER_URL, chooseItem, clampRating, detailTags, feedbackReceipt, fetchItem, fetchQueue,
  hasTag, identityGroups, isVanished, itemKey, mediaGate, movedOrder, nextPart, nextRating, partLabel, partLabelHtml, playlistQueue,
  queueCopy, queueKey, ratingStars, ratingText, realWatched, relatedKey, rememberTag, sameOrder,
  withPartLabel, withTag, withoutTag,
  type DetailEntityRef, type DetailItem, type DetailQueue, type DetailTag, type ItemDetailActions,
  type ItemDetailHelpers, type ItemDetailProps, type MediaGate, type PlaylistPayload,
} from './item-detail';

/** The glyph takes the shell's `icon()` output as-is: the skeleton and the legacy details draw exactly that, and switching to a different glyph makes the handover jump. */
const Glyph = ({ name }: { name: string }) => (
  <span className="contents" dangerouslySetInnerHTML={{ __html: icon(name) }} />
);
const Html = ({ html }: { html: string }) => <span className="contents" dangerouslySetInnerHTML={{ __html: html }} />;

/** File size: when not recorded or recorded as 0, write "Size unknown", same as the card's cell. */
const sizeText = (size: unknown) => (Number(size) > 0 ? fmtSize(Number(size)) : 'Unknown size');

export function ItemDetailPage(props: ItemDetailProps) {
  const { queue: ref, actions } = props;
  const queueResult = useQuery({
    queryKey: ref ? queueKey(ref) : ['item-queue', 'none'],
    queryFn: ({ signal }) => fetchQueue(ref!, props.helpers, signal),
    enabled: !!ref,
  });
  const queue = ref ? queueResult.data || null : null;
  const id = queue ? chooseItem(queue, props.id) : ref ? null : props.id;
  const result = useQuery({
    queryKey: itemKey(id ?? 0),
    queryFn: ({ signal }) => fetchItem(id!, signal),
    enabled: id != null,
    refetchInterval: pendingRefetch,
  });
  if (!result.data || (ref && !queue)) {
    const error = result.error || queueResult.error;
    return (
      <div data-stage-grid="" data-item-detail="">
        <div data-stage-media="" data-item-media="none">
          <CloseStage onClose={actions.close} />
          <div data-item-placeholder="">
            {error ? <RetryNote message={requestErrorMessage(error)}
              onRetry={() => { if (queueResult.error) void queueResult.refetch(); if (result.error) void result.refetch() }} /> : null}
          </div>
        </div>
      </div>
    );
  }
  return <Detail key={result.data.id} {...props} item={withPartLabel(result.data, queue)} queue={queue} />;
}

/** The close key. Its `id` stays: Escape, clicking outside the overlay, and the shell's fallback all find it by `#closeStage` and click it once more. */
const CloseStage = ({ onClose }: { onClose(): void }) => (
  <button type="button" data-stage-close="" id="closeStage" title="Close" aria-label="Close" onClick={onClose}
    dangerouslySetInnerHTML={{ __html: icon('x') }} />
);

function Detail(props: ItemDetailProps & { item: DetailItem; queue: DetailQueue | null }) {
  const { item, queue, actions, helpers } = props;
  const write = useDetailWrite(item, actions, helpers.tagLabel);

  /* Which item got painted is reported once: what is swapped in after the write is a new object of the same item, which must not re-push the address or repaint the top bar. */
  const presented = useRef(item);
  useLayoutEffect(() => { actions.present(presented.current, queue) }, [actions]);
  /* The playlist records the resume position: reported once per opened item, failures stay quiet (the next open still starts from the recorded item). */
  useEffect(() => {
    if (queue?.kind !== 'playlist') return;
    apiSend(PLAYLIST_URL, { action: 'progress', id: queue.playlistId, asset_id: item.id }).catch(() => {});
  }, []);

  const gate = isPlayerGuidePreview() ? '' : mediaGate(item, helpers.sourceOffline(String(item.root_id || item.location || '')));
  const next = nextPart(queue, item.id);
  const continuePart = () => {
    if (next && queue) actions.openQueueItem({ kind: queue.kind, seedId: queue.seedId, autoplay: true }, next.id);
  };
  return (
    <>
      <div data-stage-grid="" data-with-queue={queue ? '' : undefined} data-item-detail="">
        <MediaFrame item={item} gate={gate} helpers={helpers} actions={actions}
          autoplay={props.queue?.autoplay} onEnded={continuePart} />
        <Side item={item} queue={queue} write={write} helpers={helpers} actions={actions} />
      </div>
      <DetailContinuation queueCards={queue?.kind === 'parts' || queue?.kind === 'editions' ? queue.items.length : undefined}
        queue={queue ? <Queue queue={queue} itemId={item.id} helpers={helpers} actions={actions} /> : null}>
        {props.relatedLimit > 0 && (!queue || queue.kind === 'parts' || queue.kind === 'editions')
          ? <Related {...props} item={queue ? { ...item, id: queue.seedId ?? item.id } : item} /> : null}
      </DetailContinuation>
    </>
  );
}

/* ── Playback area ── */

function MediaFrame({ item, gate, helpers, actions, autoplay, onEnded }: {
  item: DetailItem; gate: MediaGate; helpers: ItemDetailHelpers; actions: ItemDetailActions;
  autoplay?: boolean; onEnded(): void;
}) {
  /* Metered sources put an explanation in front and only pull the stream on click; the unmounted and online-blocked kinds get no player. */
  const [started, setStarted] = useState<'auto' | 'clicked' | ''>(gate ? '' : 'auto');
  /* The player attaches inside this frame and the stage builds the `<video>`: Video.js wraps it in its own div, and expanding back from the mini player moves the whole
     instance back in; that stretch of DOM does not belong to React. */
  const frameRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState(-2);
  const refreshSamples = useRef(false);
  const source = useQuery({ queryKey: javDetailKey(item.code || ''),
    queryFn: ({ signal }) => {
      const refresh = refreshSamples.current;
      refreshSamples.current = false;
      return fetchJavDetail(item.code!, signal, refresh);
    }, staleTime: 6 * 3600_000,
    enabled: !!item.is_jav && !!item.code && !item.sample_images?.length });
  const samples = item.sample_images?.length ? item.sample_images.map(sample => ({ index: sample.n, source: false }))
    : Array.from({ length: Math.min(30, Math.max(0, source.data?.preview_count || 0)) }, (_, index) => ({ index: index + 1, source: true }));
  const media = item.is_jav && item.code ? [...(item.has_cover ? [{ index: -1, label: 'Cover' }] : []),
    ...samples.map((sample, index) => ({ ...sample, label: `Preview ${index + 1}` })),
    { index: -2, label: 'Feature', video: true }] : [];
  const hasPictures = media.length > 1;
  const selectImage = (index: number) => {
    if (index !== -2) frameRef.current?.querySelector('video')?.pause();
    setImage(index);
  };
  const mounting = useRef(item);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node || !started) return;
    const complete = () => ended.current();
    node.addEventListener('ended', complete, true);
    const unmount = actions.mountPlayer(node, mounting.current, null,
      started === 'clicked' || autoplay ? { autoplay: true } : undefined);
    return () => { node.removeEventListener('ended', complete, true); unmount() };
  }, [actions, started]);
  const badge = helpers.badgeHtml(item.location || '', item.cost || '', 'srcbig');
  return (
    <div ref={frameRef} data-stage-media="" data-item-media={gate || 'video'} data-item-gallery={hasPictures ? '' : undefined}
      data-item-picture={image !== -2 ? '' : undefined}>
      <CloseStage onClose={actions.close} />
      <div data-player-toolbar="">
        <span data-player-stats-slot="" />
        {hasPictures ? <button type="button" data-jav-preview-toggle="" aria-pressed={image !== -2}
          onClick={() => selectImage(image === -2 ? media[0]!.index : -2)}><Glyph name={image === -2 ? 'image' : 'play'} />{image === -2 ? 'View images' : 'Play the feature'}</button>
          : null}
        <span data-player-net-slot="" />
      </div>
      {hasPictures ? <>
        {image !== -2 ? <CatalogPicture key={item.id} item={item} image={image} source={samples.find(sample => sample.index === image)?.source} /> : null}
        <MediaCarousel items={media} position={Math.max(0, media.findIndex(entry => entry.index === image))} onSelect={selectImage}
          below renderThumbnail={entry => <CatalogPicture item={item} image={entry.index === -2 ? media[0]!.index : entry.index}
            source={samples.find(sample => sample.index === (entry.index === -2 ? media[0]!.index : entry.index))?.source} thumbnail />} />
      </> : null}
      {image !== -2 && item.is_jav && item.code && !item.sample_images?.length && (source.isPending || source.error || source.data?.state === 'partial') ?
        <div data-item-samples-state="">{source.isPending ? <span data-skeleton="samples" role="status" aria-label="Loading sample images" className="relative block h-12 w-20 skeleton-sheen" />
          : <Button variant="secondary" {...busyProps(source.isFetching)} title={source.data?.message || requestErrorMessage(source.error)}
            aria-label="Retry sample images now" onClick={() => { refreshSamples.current = true; void source.refetch() }}>Retry now</Button>}</div> : null}
      {gate === 'offline' ? <OfflineGate item={item} badge={badge} helpers={helpers} actions={actions} />
        : gate === 'disc' ? (
          <div role="status" data-item-gate="disc">
            <b>ISO full disc</b>
            <span>Open with an external player that supports full discs.</span>
            <ExternalPlayback key={item.id} id={item.id} onOpened={() => actions.toast('Requested to open the local player')} />
          </div>
        ) : gate === 'online' ? (
          <div id="onlineGate" role="status" data-item-gate="online">
            <Html html={badge} />
            <b>Online videos</b>
            <span>This entry has no matching follow entry, so the media address cannot resolve.</span>
            <button className="chip" id="openSavedFollow" type="button" onClick={actions.openSavedFollow}>Open saved follows</button>
          </div>
        ) : gate === 'metered' && !started ? (
          <div id="gate" data-item-gate="metered" onClick={() => setStarted('clicked')}>
            <Html html={badge} />
            <span>Click to start streaming · {sizeText(item.size)}</span>
          </div>
        ) : null}
    </div>
  );
}

function OfflineGate({ item, badge, helpers, actions }: {
  item: DetailItem; badge: string; helpers: ItemDetailHelpers; actions: ItemDetailActions;
}) {
  const [checking, setChecking] = useState(false);
  const [still, setStill] = useState(false);
  const retry = async () => {
    setChecking(true);
    const online = await actions.checkSource(item.location || '').catch(() => false);
    setChecking(false);
    if (online) actions.reopen();
    else setStill(true);
  };
  return (
    <div id="offlineGate" role="status" data-item-gate="offline">
      <Html html={badge} />
      <b>The media folder is unreachable</b>
      <span>{helpers.offlineReason(String(item.root_id || item.location || ''))}</span>
      <button className="chip" id="offlineRetry" type="button" disabled={checking} onClick={() => void retry()}>
        {still ? 'Still unreadable · refresh' : 'Refresh state'}
      </button>
    </div>
  );
}

/* ── Queue ── */

function Queue({ queue, itemId, helpers, actions }: {
  queue: DetailQueue; itemId: number; helpers: ItemDetailHelpers; actions: ItemDetailActions;
}) {
  const copy = queueCopy(queue);
  const list = useRef<HTMLDivElement | null>(null);
  const reorder = usePlaylistReorder(queue, itemId, actions);
  const reorderRef = useRef(reorder);
  reorderRef.current = reorder;
  const listRef = useCallback((node: HTMLDivElement | null) => {
    list.current = node;
    if (!node) return;
    helpers.wireDrag(node);
    /* Order by direct drag: a dozen-odd rows, and moving the last one to second place by up/down keys takes a dozen-plus presses, each one a database write
       plus a repaint. The dragging row state hangs on the row via `wireDragReorder`, rows are reused by id, and listeners survive reordering. */
    if (queue.kind === 'playlist') {
      helpers.wireDragReorder(node, {
        selector: '[data-queue-row]', attribute: 'data-queue-row',
        onMove: (from, target, after) => reorderRef.current.move(+from, +target, after),
      });
    }
  }, [helpers, queue.kind]);
  const saveMix = useSaveMix(queue, actions);
  const head = queue.kind === 'mix'
    ? <button type="button" data-save-mix="" title="Save as playlist" aria-label="Save as playlist" onClick={saveMix}
      dangerouslySetInnerHTML={{ __html: icon('playlist') }} />
    : queue.kind === 'playlist'
      ? <button type="button" data-edit-playlist="" title="Edit playlist" aria-label="Edit playlist" onClick={actions.editPlaylist}
        dangerouslySetInnerHTML={{ __html: icon('playlist') }} />
      : null;
  const ref = { kind: queue.kind, seedId: queue.seedId, playlistId: queue.playlistId };
  return (
    <MixQueue kind={queue.kind} title={copy.title} summary={copy.summary} onClose={actions.close} actions={head} listRef={listRef}>
      {queue.items.map((row) => {
        const edition = queue.kind === 'editions' && row.edition_label
          ? <i className={`javedition ${EDITION_TONE[row.edition_label] || 'censored'}`} data-queue-edition="">{row.edition_label}</i> : null;
        // Vanished entries still appear in the playlist and can be removed, but the file is gone from disk, so this row cannot be opened for playback.
        const gone = queue.kind === 'playlist' && isVanished(row);
        return (
          <MixQueueRow key={row.id} current={row.id === itemId} data-queue-item={row.id} row={{ 'data-queue-row': row.id }}
            disabled={gone} title={gone ? 'The file is no longer on disk and cannot play' : undefined}
            {...(gone ? { 'data-queue-vanished': '' } : {})}
            onClick={() => { if (!gone) actions.openQueueItem(ref, row.id) }}
            pic={<><Html html={queueThumbHtml(row, helpers.javImage())} /><i className="mono" data-mix-item-duration="">{fmtDur(row.duration)}</i></>}
            lead={<Html html={queueAvatarHtml(row)} />}
            after={queue.kind === 'playlist' ? (
              <span data-queue-edit="">
                <i data-queue-grip="" aria-hidden="true"><Glyph name="grip-vertical" /></i>
                <button type="button" data-queue-remove={row.id} title="Remove from playlist" aria-label="Remove from playlist"
                  onClick={() => reorder.remove(row.id)}><Glyph name="x" /></button>
              </span>
            ) : null}>
            <span data-queue-head="">{edition}<b data-middle-truncate="">{helpers.displayName(row)}</b></span>
            <span data-truncate-end="">{gone ? 'Vanished · file no longer on disk'
              : queue.kind === 'parts' || (queue.kind === 'editions' && row.part_label)
                ? partLabel(row.part_label) : mixLabel(row, helpers.tagLabel)}</span>
          </MixQueueRow>
        );
      })}
    </MixQueue>
  );
}

/** Saving a Mix: the shell raises the form (the stage is a native modal, so the popover must join that layer), and this writes the database on confirm. */
function useSaveMix(queue: DetailQueue, actions: ItemDetailActions) {
  const save = useMutation({
    mutationFn: (name: string) => apiSend<{ playlist: PlaylistPayload }>(PLAYLIST_URL, {
      action: 'create', name, asset_ids: queue.items.map((row) => row.id), source_kind: 'mix', source_seed_asset_id: queue.seedId,
    }).then((result) => result.playlist),
  });
  return () => actions.saveMix({ title: queue.title, count: queue.items.length, save: (name) => save.mutateAsync(name) });
}

/** Playlist sorting and removal. After either write, the server-returned full list is swapped into the queue cache, rows reorder in place, and the stage does not remount;
 *  only when the removed one is the current entry does it switch to the next via the shell, and if the list empties, return to the list page. Undo takes the full order from before the action,
 *  so one drag across any number of rows needs only one undo. */
function usePlaylistReorder(queue: DetailQueue, itemId: number, actions: ItemDetailActions) {
  const key = queueKey({ kind: 'playlist', playlistId: queue.playlistId });
  const apply = (playlist: PlaylistPayload) => {
    queryClient.setQueryData(key, playlistQueue(playlist));
    return playlist;
  };
  const write = (body: Record<string, unknown>) =>
    apiSend<{ playlist: PlaylistPayload }>(PLAYLIST_URL, { id: queue.playlistId, ...body }).then((result) => result.playlist);
  const reorder = useMutation({
    mutationFn: (ids: number[]) => write({ action: 'reorder', asset_ids: ids }),
    onSuccess: (playlist, _ids) => { apply(playlist) },
    onError: (error) => actions.failure('Reorder playback', error),
  });
  const ids = queue.items.map((row) => row.id);
  return {
    move: async (from: number, target: number, after: boolean) => {
      if (queue.kind !== 'playlist') return;
      const next = movedOrder(ids, from, target, after);
      if (sameOrder(next, ids)) return;
      const before = ids;
      await reorder.mutateAsync(next);
      actions.toast('Playback order adjusted', { undo: async () => { apply(await write({ action: 'reorder', asset_ids: before })) } });
    },
    remove: (assetId: number) => {
      const before = ids;
      void confirmModal({
        title: 'Remove from playlist', body: 'This video will be removed from the playlist; the video file is kept.', confirmLabel: 'Remove from playlist',
        onConfirm: async () => {
          const playlist = await write({ action: 'remove', asset_id: assetId });
          /* Undo puts it back in its slot: `add` only appends, so after appending, re-sort by the order from before the removal.
             When the removal emptied the list it is no longer on screen, so undo returns to the list page instead of an empty queue. */
          actions.toast('Removed from playlist', {
            undo: async () => {
              await write({ action: 'add', asset_ids: [assetId] });
              const restored = apply(await write({ action: 'reorder', asset_ids: before }));
              if (!playlist.items.length || assetId === itemId) {
                actions.openQueueItem({ kind: 'playlist', playlistId: restored.id }, itemId, false);
              }
            },
          });
          if (!playlist.items.length) { actions.openPlaylists(); return }
          apply(playlist);
          if (assetId === itemId) {
            actions.openQueueItem({ kind: 'playlist', playlistId: playlist.id }, playlist.current_asset_id || playlist.items[0]!.id, false);
          }
        },
      });
    },
  };
}

/* ── Sidebar ── */

function Side({ item, queue, write, helpers, actions }: {
  item: DetailItem; queue: DetailQueue | null; write: DetailWrite; helpers: ItemDetailHelpers; actions: ItemDetailActions;
}) {
  const online = item.location === 'online';
  const busy = write.busyAttrs;
  const [reasonOpen, setReasonOpen] = useState(false);
  return (
    <div data-stage-side="" data-item-side="">
      <div data-stage-side-content="">
        <DetailTitle item={item} queue={queue} helpers={helpers} actions={actions} onStatus={write.setSourceState} />
        {online ? null : <span data-title-state="" aria-live="polite">{write.sourceState}</span>}
        <PendingWork work={item.pending_work} />
        <Rating item={item} write={write} />
        <div className="mono" data-stage-meta="" data-reveal-line="">
          {item.width && item.height
            ? <span data-spec-item=""><Glyph name="monitor" /><span>{item.width}×{item.height}</span></span>
            : null}
          <span data-spec-item=""><Glyph name="hard-drive" /><span>{sizeText(item.size)}</span></span>
          {item.release_date ? <span data-spec-item=""><Glyph name="calendar" /><span>{item.release_date}</span></span> : null}
          {item.region_label ? (
            <button type="button" data-spec-item="" data-open-region={item.region || ''}
              title="Open works from the same origin"
              onClick={() => actions.openRegion(item.region || '')}>
              <Glyph name="globe" /><span>{item.region_label}{item.region_settled ? '' : ' (inferred)'}</span>
            </button>
          ) : null}
        </div>
        {(item.medium || 'video') === 'video' && !online && !String(item.name || '').toLowerCase().endsWith('.iso')
          ? <ExternalPlayback key={item.id} id={item.id} onOpened={() => actions.toast('Requested to open the local player')} /> : null}
        <Identity item={item} helpers={helpers} actions={actions} />
        <Tags item={item} write={write} helpers={helpers} actions={actions} />
        <LibraryCompletionPrompt assetIds={missingPreviewIds([item], helpers.javImage())}
          onComplete={() => { void queryClient.invalidateQueries({ queryKey: itemKey(item.id) }) }} />
        <Trace item={item} />
        <div data-stage-actions="" data-item-feedback="">
          <button type="button" id="likeBtn" data-fb="like" aria-label={item.liked ? 'Unfavorite' : 'Like'} title="Favorite · record taste preference"
            aria-pressed={!!item.liked} {...busy('like')} onClick={() => write.preference({ liked: !item.liked })}><Glyph name="thumbs-up" /></button>
          <button type="button" id="preferenceToggle" data-fb="reason" aria-label="Favorite reason" title="Favorite reason" aria-expanded={reasonOpen}
            aria-controls="preferencePanel" data-has-reason={String(!!item.like_reason)}
            onClick={() => setReasonOpen((open) => !open)}><Glyph name="notebook-pen" /></button>
          <button type="button" data-stage-action="dislike" data-kind="dislike" aria-label="Not my taste" title="Not your taste · lowers recommendation weight"
            aria-pressed={item.feedback === 'dislike'} {...busy('dislike')} onClick={() => write.feedback('dislike')}><Glyph name="thumbs-down" /></button>
          <button type="button" data-stage-action="seen" data-kind="seen" aria-label="Watched" title="Watched · lowers recent recommendations only"
            aria-pressed={item.feedback === 'seen'} {...busy('seen')} onClick={() => write.feedback('seen')}><Glyph name="eye" /></button>
          <button type="button" data-stage-action="later" id="stageLater" aria-label="Watch later" title="Watch later · add to or remove from the queue"
            aria-pressed={!!item.watch_later} {...busy('later')} onClick={write.later}><Glyph name={item.watch_later ? 'check' : 'bookmark-plus'} /></button>
          <button type="button" id="addPlaylist" data-fb="playlist" aria-label="Add to playlist" title="Add to playlist"
            onClick={() => actions.addToPlaylist(item)}><Glyph name="playlist" /></button>
          <button type="button" id="betterVersion" data-fb="quality" aria-label="Find a better edition"
            title={item.better_version ? (item.better_version_reason || 'Marked to find a better edition') : 'Find HD, watermark free or full versions'}
            aria-pressed={!!item.better_version} {...busy('quality')} onClick={write.quality}><Glyph name="sparkles" /></button>
          <button type="button" data-kind="dispose" data-fb="dispose" aria-label="Move to trash" title="Move to trash · Files stay and can be permanently cleared from trash"
            aria-pressed={item.disposal === 'trash'} {...busy('dispose')} onClick={() => write.feedback('dispose')}><Glyph name="trash" /></button>
        </div>
        <Preference item={item} open={reasonOpen} write={write} />
        <button type="button" data-kind="o" {...busy('o')} onClick={() => write.feedback('o')}>
          <Glyph name="sperm" /><span>Log a climax</span><b className="mono" id="oCount">{item.o_count || 0}</b>
        </button>
      </div>
    </div>
  );
}

/* Titles fold to two lines by default and get an expand key only on real overflow: in the folded state, scrollHeight higher
   than clientHeight means a line is being clipped.
   Expand and collapse swap glyphs: chevron-down for reading further, chevron-up for taking it back. The expand key leads the
   row of keys, right beside the title it manages. The title text itself also takes the click: when someone wants the full
   text, their hand is already on the words. Selecting text does not count; that is copying the title. Overflow is not judged
   only at open: the title bar's width differs greatly between theater mode and normal view. */
function DetailTitle({ item, queue, helpers, actions, onStatus }: {
  item: DetailItem; queue: DetailQueue | null; helpers: ItemDetailHelpers; actions: ItemDetailActions;
  onStatus(text: string): void;
}) {
  const { text, expanded, foldable, toggle } = useFoldedTitle(String(item.title || item.name || ''));
  const html = helpers.badgeHtml(item.location || '', item.cost || '', 'srcbig') + helpers.titleHtml(item) + partLabelHtml(item, queue);
  return (
    <div data-item-title="">
      <div data-stage-title="" data-title-line="" data-reveal-line="">
        <span ref={text} data-detail-title="" data-expanded={expanded ? '' : undefined}
          data-foldable={foldable ? '' : undefined}
          onClick={() => { if (foldable && !String(getSelection() || '')) toggle() }}
          dangerouslySetInnerHTML={{ __html: html }} />
        <span data-title-tools="">
          <button type="button" data-title-fold="" hidden={!foldable} aria-expanded={expanded}
            aria-label={expanded ? 'Collapse title' : 'Expand title'} title={expanded ? 'Collapse title' : 'Show the full title'} onClick={toggle}>
            <CollapseChevron />
          </button>
          {/* The crop box stores coordinates, not an image: after saving, refetch this entry; the cover URL is unchanged, what changes is the `poster_box` the API returns.
              Cards for the same code in the grid behind are not refetched; they take the new box in place, so closing the details shows the cropped look. */}
          {item.has_cover && (item.cover_key || item.code) ? (
            <span data-cover-crop-host="">
              <CoverCrop code={item.cover_key || item.code || ''} coverUrl={coverUrl(item)} box={item.poster_box || null}
                onSaved={(box) => {
                  void queryClient.invalidateQueries({ queryKey: itemKey(item.id), exact: true });
                  patchCatalogItems((one) => (one.cover_key || one.code) === (item.cover_key || item.code), { poster_box: box });
                }} />
            </span>
          ) : null}
          {item.location === 'online' ? null : <SourceTools id={item.id} actions={actions} onStatus={onStatus} />}
        </span>
      </div>
    </div>
  );
}

/** Locate the source file and verify the catalog. Reconciliation may have removed exactly this item; with it gone there is nothing to stay on, so return straight to the list. */
function SourceTools({ id, actions, onStatus }: { id: number; actions: ItemDetailActions; onStatus(text: string): void }) {
  const [busy, setBusy] = useState('');
  const reveal = async () => {
    if (busy) return;
    setBusy('reveal');
    onStatus('');
    onStatus(await actions.reveal(id));
    setBusy('');
  };
  const sync = async () => {
    if (busy) return;
    setBusy('sync');
    onStatus('Verifying folders…');
    const result = await actions.sync(id);
    onStatus(result.text);
    setBusy('');
    if (result.removed.includes(id)) actions.close();
  };
  return (
    <>
      <button type="button" data-reveal={id} title="Open the source file's folder in the file manager" aria-label="Locate source file"
        {...(busy === 'reveal' ? { 'aria-busy': true, 'aria-disabled': true } : {})} onClick={() => void reveal()}
        dangerouslySetInnerHTML={{ __html: busy === 'reveal' ? spinnerHtml('Locating') : icon('folder-open') }} />
      <button type="button" data-sync={id} title="Reconcile this directory: items deleted on disk move to Peach trash, and those with personal records are marked vanished" aria-label="Delete on sync too"
        {...(busy === 'sync' ? { 'aria-busy': true, 'aria-disabled': true } : {})} onClick={() => void sync()}>
        <Glyph name="folder-sync" />
      </button>
    </>
  );
}

/* The five stars sit between the title and the spec line: the rating is a judgment of this specific video and part of its identity. */
function Rating({ item, write }: { item: DetailItem; write: DetailWrite }) {
  const on = ratingStars(item.rating);
  return (
    <div id="detailRating" role="group" data-item-rating="" aria-label="Rating" data-value={clampRating(item.rating)}>
      <RatingStars value={on} onRate={star => write.rate(star)}
        busyStar={[1, 2, 3, 4, 5].find(star => write.busy.has(`rate:${star}`))}
        busyAttrs={star => write.busyAttrs(`rate:${star}`)} />
      <span data-rating-value="" aria-live="polite">{ratingText(item.rating)}</span>
    </div>
  );
}

/* Identities grouped by category: the tag is the group heading above, same-category names laid out horizontally. One name per row would fill the whole sidebar
   for co-starred videos. When there are none, "Unattributed" is the category this video belongs to, listed alongside performers and labels: open it to see everything. */
function Identity({ item, actions }: { item: DetailItem; helpers: ItemDetailHelpers; actions: ItemDetailActions }) {
  const groups = useMemo(() => identityGroups(item), [item]);
  const [castOpen, setCastOpen] = useState(false);
  const overflow = Math.max(0, groups.cast.length - CAST_SHOWN);
  const cell = (kind: string, ref: DetailEntityRef, index: number) => {
    const hide = kind === 'performer' && index >= CAST_SHOWN && !castOpen;
    return <IdentityCell key={`${kind}:${ref.name}`} kind={kind} person={ref} onOpen={actions.openEntity}
      hidden={hide} overflow={kind === 'performer' && index >= CAST_SHOWN} />;
  };
  const group = (label: string, kind: string, list: DetailEntityRef[], extra: ReactNode = null) => (list.length ? (
    <section key={`${kind}:${label}`} data-id-group={kind}>
      <h5 data-id-label="">{label}</h5>
      <div data-id-row="">{list.map((ref, index) => cell(kind, ref, index))}{extra}</div>
    </section>
  ) : null);
  const primary = [
    groups.unowned ? (
      <section key="unowned" data-id-group="unowned">
        <h5 data-id-label="">Attribution</h5>
        <div data-id-row="">
          <button type="button" data-id-cell="unowned" data-open-unowned="" title="Open Unattributed: library videos with no credited person"
            onClick={actions.openUnowned}>
            <span data-id-face=""><Glyph name="user-round" /></span><span data-id-name="">Unattributed</span>
          </button>
        </div>
      </section>
    ) : group(performerLabel(item), 'performer', groups.cast, overflow && !castOpen
      ? <Button variant="secondary" size="small" id="castMore" data-cast-more="" trailingIcon={RiArrowDownSLine}
        aria-expanded={false} onClick={() => setCastOpen(true)}>and {overflow} people</Button> : null),
    group('Labels', 'studio', groups.studios),
    group('Studios', 'studio', groups.makers),
    group('Sellers', 'creator', groups.creators.filter(ref => ref.identity_categories?.includes('seller'))),
    group('Creators', 'creator', groups.creators.filter(ref => !ref.identity_categories?.includes('seller'))),
  ].filter(Boolean);
  return (
    <div data-item-identity="">
      {primary.length ? <div data-identity-primary="">{primary}</div> : null}
      <IdentitySeries people={groups.series} onOpen={actions.openEntity} />
    </div>
  );
}

/* ── Tags ── */

function Tags({ item, write, helpers, actions }: {
  item: DetailItem; write: DetailWrite; helpers: ItemDetailHelpers; actions: ItemDetailActions;
}) {
  return <div data-item-tags="">
    <DetailTags key={item.id} id="detailTags" tags={detailTags(item, helpers)} candidates={helpers.tagCandidates()} label={helpers.tagLabel}
      adding={[...write.busy].some(key => key.startsWith('add:'))}
      onOpen={actions.openTag} onAdd={write.addTag} onRemove={write.removeTag} busyAttrs={tag => write.busyAttrs(`tag:${tag}`)} />
  </div>;
}

/* -- Watch history --
   The two readout ids are reserved for the shell: once Video.js attaches, the left-off position is written by `wireTelemetry` during playback, and real watch time is filled back in after each
   report. This only renders the initial values and never touches them again. */
function Trace({ item }: { item: DetailItem }) {
  const real = realWatched(item);
  return (
    <div data-item-trace="">
      <div data-trace-metric="">
        <div data-trace-label=""><span>Leaving the position</span><span id="ratioTxt">0%</span></div>
        <div data-trace-bar=""><u id="watched" /><b id="mark" /></div>
      </div>
      <div data-trace-metric="">
        <div data-trace-label=""><span>Actually watched</span><span id="realTxt">{real == null ? '0%' : `${real.toFixed(0)}%`}</span></div>
        {/* oxlint-disable-next-line shadcn/no-inline-styles -- the width is this item's watched ratio, later rewritten by shell telemetry on report */}
        <div data-trace-bar=""><u id="realBar" data-trace-real="" style={real == null ? undefined : { width: `${real.toFixed(1)}%` }} /></div>
      </div>
    </div>
  );
}

function Preference({ item, open, write }: { item: DetailItem; open: boolean; write: DetailWrite }) {
  const [reason, setReason] = useState(item.like_reason || '');
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) field.current?.focus() }, [open]);
  /* The reason returned by the server (save, undo) is swapped into the input; while the user is typing, the local copy is not overwritten, because it only changes once the write completes. */
  useEffect(() => { setReason(item.like_reason || '') }, [item.like_reason]);
  const saving = write.busy.has('preference');
  return (
    <div id="preferencePanel" data-item-preference="" hidden={!open}>
      <textarea ref={field} id="likeReason" maxLength={2000} placeholder="Why favorite it?" value={reason}
        onChange={(event) => setReason(event.target.value)} />
      <div data-preference-foot="">
        <span id="preferenceState" aria-live="polite">{write.preferenceState}</span>
        <button type="button" className="geist-button primary" id="savePreference" data-save-preference="" title="Submit the favorite reason" aria-label="Submit the favorite reason"
          {...write.busyAttrs('preference')} onClick={() => write.preference({ reason })}
          dangerouslySetInnerHTML={{ __html: saving ? `${spinnerHtml('Submitting favorite reason')}<span>Submitting</span>` : '<span>Submit</span>' }} />
      </div>
    </div>
  );
}

/* -- Continue watching --
   This row's cards are the catalog grid's items mode: fetching happens here, cards only render. Empty results and failures stay in the recommendations area,
   and both dragging and the wheel rely on the shell's `wireDrag`. */
function Related(props: ItemDetailProps & { item: DetailItem }) {
  const { item, relatedLimit, helpers, grid } = props;
  const result = useQuery({
    queryKey: relatedKey(item.id, relatedLimit),
    queryFn: async ({ signal }) => {
      const page = await apiGet<{ items?: MediaItem[] }>(RELATED_URL(item.id, relatedLimit), signal);
      return page.items || [];
    },
  });
  const [skeleton] = useState(() => helpers.relatedSkeletonHtml());
  return (
    <RelatedSection wireDrag={helpers.wireDrag} busy={result.isPending} empty={result.data?.length === 0}
      error={result.isError ? `Failed to load Continue watching: ${requestErrorMessage(result.error)}` : undefined}
      onRetry={() => { void result.refetch() }}>
        {result.data ? (
          <CatalogGridPage mode="items" variant="next" items={result.data} helpers={grid.helpers} actions={grid.actions}
            layout={props.layout} selectMode={props.selectMode} selected={props.selected} seekSeconds={props.seekSeconds}
            revision={0} wireDrag={helpers.wireDrag} skeletonHtml={() => ''} />
        ) : <Html html={skeleton} />}
    </RelatedSection>
  );
}

/* -- Write operations --
 * Each key has its own busy state (`aria-busy` + `aria-disabled`; the control stays focusable, and repeat triggers are blocked by the shell's
 * `wireBusyActions`). On success, swap the fields the server returned into `['item', id]` and into the same card in the catalog cache;
 * undo is also a real write, and after it completes it is swapped in the same way. */
type DetailWrite = ReturnType<typeof useDetailWrite>;
type Patch = Partial<DetailItem>;

function useDetailWrite(item: DetailItem, actions: ItemDetailActions, label: (tag: string) => string) {
  const id = item.id;
  const key = itemKey(id);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [sourceState, setSourceState] = useState('');
  const [preferenceState, setPreferenceState] = useState('');
  const mark = (name: string, on: boolean) => setBusy((now) => {
    const next = new Set(now);
    if (on) next.add(name); else next.delete(name);
    return next;
  });
  const current = () => queryClient.getQueryData<DetailItem>(key) || item;
  const apply = (patch: Patch | ((item: DetailItem) => DetailItem)) => {
    const next = typeof patch === 'function' ? patch(current()) : { ...current(), ...patch };
    queryClient.setQueryData(key, next);
    const card = { feedback: next.feedback, disposal: next.disposal, watch_later: next.watch_later, rating: next.rating, o_count: next.o_count };
    replaceCatalogItem(id, card);
    return next;
  };
  const post = <T,>(url: string, body: Record<string, unknown>) => apiSend<T>(url, { id, ...body });

  type Run = { name: string; action: string; run(): Promise<void> };
  const task = useMutation({
    mutationFn: ({ run }: Run) => run(),
    onError: (error, { action }) => actions.failure(action, error),
    onSettled: (_result, _error, { name }) => mark(name, false),
  });
  const start = (name: string, action: string, run: () => Promise<void>) => {
    if (busy.has(name)) return;
    mark(name, true);
    task.mutate({ name, action, run });
  };

  type FeedbackResult = { feedback?: string | null; disposal?: string | null; o_count?: number; rating?: number | null };
  const sendFeedback = async (kind: string, value?: number) => {
    const result = await post<FeedbackResult>(FEEDBACK_URL, value === undefined ? { kind } : { kind, value });
    if (kind === 'rate') apply({ rating: result.rating ?? null });
    else apply({ feedback: result.feedback ?? undefined, disposal: result.disposal ?? undefined, o_count: result.o_count });
    return result;
  };

  return {
    busy, sourceState, setSourceState, preferenceState,
    busyAttrs: (name: string) => (busy.has(name) ? { 'aria-busy': true, 'aria-disabled': true } as const : {}),

    rate: (star: number) => start(`rate:${star}`, 'Rating', async () => {
      const before = current().rating || 0;
      const value = nextRating(before, star);
      await sendFeedback('rate', value);
      actions.toast(value ? `Rated ${ratingStars(value)} stars` : 'Rating removed', { undo: async () => { await sendFeedback('rate', before) } });
    }),

    feedback: (kind: string) => start(kind, 'Actions', async () => {
      const before = { feedback: current().feedback || null };
      const result = await sendFeedback(kind);
      actions.toast(feedbackReceipt(kind, result), {
        undo: async () => {
          if (kind === 'o') await sendFeedback('o-undo');
          else if (kind === 'dispose') await sendFeedback('dispose');
          else {
            if (result.feedback) await sendFeedback(result.feedback);
            if (before.feedback) await sendFeedback(before.feedback);
          }
          await actions.trashChanged(current().disposal || null, true);
        },
      });
      if (kind === 'dispose') await actions.trashChanged(result.disposal || null, false);
    }),

    later: () => start('later', 'Update Watch later', async () => {
      const result = await post<{ watch_later: boolean }>(WATCH_LATER_URL, {});
      apply({ watch_later: result.watch_later });
      actions.toast(result.watch_later ? 'Added to Watch later' : 'Removed from Watch later', {
        undo: async () => { apply({ watch_later: (await post<{ watch_later: boolean }>(WATCH_LATER_URL, {})).watch_later }) },
      });
    }),

    quality: () => start('quality', 'Update edition requirements', async () => {
      const before = { wanted: !!current().better_version, reason: current().better_version_reason || '' };
      type Goal = { better_version: boolean; better_version_reason?: string };
      const paint = (goal: Goal) => apply({ better_version: goal.better_version, better_version_reason: goal.better_version_reason || '' });
      const result = await post<Goal>(QUALITY_GOAL_URL, { wanted: !before.wanted });
      paint(result);
      actions.toast(result.better_version ? 'Marked to find a better edition' : 'Cancelled find-better-edition', {
        undo: async () => { paint(await post<Goal>(QUALITY_GOAL_URL, before)) },
      });
    }),

    /* Like and reason are one preference: tapping the like key only flips `liked`, and submitting a reason with text counts as liked. */
    preference: ({ liked, reason }: { liked?: boolean; reason?: string }) => {
      const name = liked === undefined ? 'preference' : 'like';
      start(name, 'Save the favorite preference', async () => {
        const before = { liked: !!current().liked, reason: current().like_reason || '' };
        const text = reason ?? before.reason;
        const wanted = liked ?? (before.liked || text.trim().length > 0);
        type Preference = { liked: boolean; like_reason?: string };
        const paint = (result: Preference) => apply({ liked: result.liked, like_reason: result.like_reason || '' });
        setPreferenceState('Saving…');
        try {
          paint(await post<Preference>(PREFERENCE_URL, { liked: wanted, reason: text }));
        } catch (error) {
          setPreferenceState('Save failed · retry');
          throw error;
        }
        setPreferenceState('Saved');
        setTimeout(() => setPreferenceState((now) => (now === 'Saved' ? '' : now)), 1400);
        const saved = current();
        actions.toast(saved.liked ? 'Liked preferences saved' : 'Like removed', {
          undo: async () => { paint(await post<Preference>(PREFERENCE_URL, before)) },
        });
      });
    },

    removeTag: (tag: DetailTag) => start(`tag:${tag.k}`, 'Delete tag', async () => {
      const result = await post<{ ok?: boolean }>(ITEM_TAG_URL, { operation: 'remove', tag: tag.k });
      if (!result.ok) throw new Error('Tag not deleted');
      apply((now) => withoutTag(now, tag.k));
      actions.toast(`Deleted tag "${label(tag.k)}"`, {
        undo: async () => {
          await post(ITEM_TAG_URL, { operation: 'add', tag: tag.k });
          apply((now) => withTag(now, tag));
        },
      });
    }),

    addTag: (raw: string) => {
      const tag = raw.trim();
      if (!tag) return;
      start(`add:${tag}`, 'Add tag', async () => {
        const result = await post<{ ok?: boolean; tag?: string }>(ITEM_TAG_URL, { operation: 'add', tag });
        if (!result.ok) return;
        const canonical = result.tag || tag;
        if (hasTag(current(), canonical)) {
          actions.toast(`The tag "${label(canonical)}" already exists`);
          return;
        }
        apply((now) => withTag(now, { k: canonical, cat: 'general' }));
        rememberTag(canonical);
        actions.toast(`Added the tag "${label(canonical)}"`, {
          undo: async () => {
            await post(ITEM_TAG_URL, { operation: 'remove', tag: canonical });
            apply((now) => withoutTag(now, canonical));
          },
        });
      });
    },
  };
}
