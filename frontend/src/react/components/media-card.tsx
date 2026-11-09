/* A video card in the library: the catalog grid, the profile page's video section, the portrait strip and the details page's
 * Continue watching all use it.
 *
 * Shape: cover cell on top, then a row of avatars, two lines of title, one line of byline and size, then a line of tags. The
 * cover cell holds the source badge, volume/edition counts, duration and watch progress; on hover or keyboard focus the badge
 * fades out, a countdown ring appears top-right, "Watch later" bottom-right, and after a pause three centered buttons for
 * rewind, fast-forward and open details. The stacked paper edges mean this card represents more than one entry (volumes or
 * editions).
 *
 * Structure and style hooks all use `data-media-*`, not the legacy class names: the legacy stylesheet is unlayered and comes
 * later, so same-name rules would land on this card. Styles live in `./media-card.css`.
 *
 * Cover, avatars and hover preview come from `@peach/card-art`, which does three things React cannot see on this card, so
 * their state is written as attributes rather than class names (class names belong to React and one re-render washes them
 * away):
 * - Hover preview (`wireHover`) inserts `video.hv`/`img.ui-hvframes` into the cover cell, toggles
 *   `data-previewing`/`data-longhover` on the card, and hangs `_stopHover` on the card so scrolling and page changes clean up.
 * - Cover framing (`coverAnchor`) modifies the image inside the cover cell, so the image is handed to the cell as an HTML
 *   fragment; large/small images also swap in place on that image, see `./art-slot.tsx`.
 * - Image shimmer (`PENDING_IMAGES`) adds `imgwait`/`ui-imgdone` on `[data-media-art]`.
 *
 * Click routing: multi-select and modifier keys first, then open, entity links, unassigned, and tags; everything else falls to
 * the whole card, which is open. */
import { memo, useCallback, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { cardRatio as layoutRatio } from '@peach/appearance';
import {
  cardArtwork, cardIdentity, entityAvatar, frameArtwork, performerLabel, relayoutCovers, releaseHover, wireHover,
} from '@peach/card-art';
import { esc, fmtDur, fmtSize } from '@peach/legacy/core';
import { spinnerHtml } from '@peach/legacy/ui';
import { entityDisplayName } from '../../core/entity-names';
import { useEntityNames } from '../use-entity-names';

import type { MediaCardActions, MediaCardHelpers, MediaCardLayout, MediaItem } from '../catalog-grid/types';
import { ArtSlot } from './art-slot';
import { ArtworkGapView, failedArtwork, missingArtwork, type ArtworkGap } from './artwork-gap';
import { CardDate, CardTags, Icon, WhoLabel } from './card-meta';
import { RecommendationReason } from './recommendation-reason';
import { useLibraryTints } from './library-tint';
import { suppressShiftTextSelection } from './row-click';

/** Portrait always uses one fixed ratio, not each video's real dimensions: that is what keeps the portrait strip and the portrait grid level with each other. */
const PORTRAIT_RATIO = 9 / 16;

export type MediaCardVariant = 'grid' | 'short' | 'next' | 'resource';

/** Fallback for the card title and screen-reader name when the title is empty; resource cards say "Untitled resource". */
const UNNAMED = 'Untitled video';


const RESOURCE_LABELS: Record<string, string> = { image: 'Images', audio: 'Audio', archive: 'Archives', other: 'Other files' };
const DISPOSAL_LABELS = { manual: 'Manual', junk: 'Junk', duplicate: 'Duplicates', missing: 'Missing file' };

function DisposalReason({ item }: { item: MediaItem }) {
  if (item.disposal !== 'trash') return null;
  const label = (item.disposal_reason && DISPOSAL_LABELS[item.disposal_reason]) || 'Reason not recorded';
  return <span data-media-disposal-reason="" title={`Junk reason: ${label}`}>{label}</span>;
}

/** Videos and assets share the trash actions, with the failure reason left on the card for retry. */
function ResourceAction({ item, actions }: { item: MediaItem; actions: MediaCardActions }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = item.disposal === 'trash' ? 'restore' : 'dispose';
  const label = operation === 'restore' ? 'Restore' : 'Move to trash';
  const run = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError('');
    void actions.resourceOperation(item, operation)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Operation failed. Try again.'))
      .finally(() => setBusy(false));
  };
  return <>
    <button type="button" data-media-resource-action={operation} aria-label={`${label} ${item.name || 'Unnamed resource'}`}
      title={label} onClick={run} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
      {busy ? <><span dangerouslySetInnerHTML={{ __html: spinnerHtml(`${label}…`) }} /><span>{`${label}…`}</span></>
        : <span>{label}</span>}
    </button>
    {error ? <span data-media-operation-error="" role="alert">{error}</span> : null}
  </>;
}

/** Media frames within one list are equal height: the vertical strip always uses the vertical ratio, everything else takes the layout's copy from the appearance layer (`cardRatio` in
 *  `@peach/appearance`; the skeleton reads it too). */
export function cardRatio(_item: MediaItem, variant: MediaCardVariant, layout: MediaCardLayout): number {
  return variant === 'short' ? PORTRAIT_RATIO : layoutRatio(layout);
}

export interface MediaCardProps {
  item: MediaItem;
  variant: MediaCardVariant;
  layout: MediaCardLayout;
  selected: boolean;
  selectMode: boolean;
  seekSeconds: number;
  helpers: MediaCardHelpers;
  actions: MediaCardActions;
  /** What tapping this card opens. Portrait videos enter immersive mode, trash items route by type, everything else opens detail. */
  onOpen(item: MediaItem, anchor: HTMLElement): void;
  /** This card represents the whole volume or edition group (with "Merge volumes and editions" on). When off, one card per volume showing only that file's
   *  name, duration and size, without the group's volume count; when on, entries still route into the volume or edition queue by their grouping. On by default. */
  grouped?: boolean;
}

/** Byline: avatar and name resolve onto one identity (`cardIdentity`). Co-stars list only the first, followed by the total count. */
export function identityParts(item: MediaItem): { avatar: ReactNode; who: ReactNode } {
  const { kind, name, coStarred, performers, refs, total } = cardIdentity(item);
  const performer = performers[0] || '';
  const label = performerLabel(item);
  const avatar = coStarred
    ? (
      <div data-media-avatars="" style={{ '--media-avatar-count': Math.min(5, performers.length) } as CSSProperties}>
        {performers.slice(0, 5).map((nm, index) => (
          <button key={`${nm}:${index}`} type="button" data-media-avatar="" data-entity-kind="performer"
            data-entity-name={nm} title={`Open ${label} page: ${entityDisplayName('performer', nm, refs[index]?.id)}`}
            style={{ '--media-avatar-index': index } as CSSProperties}
            dangerouslySetInnerHTML={{ __html: entityAvatar(nm, refs[index] ?? null, 'performer') }} />
        ))}
      </div>
    )
    : kind
      ? (
        <button type="button" data-media-avatar="" data-entity-kind={kind} data-entity-name={name}
          title={`Open ${kind === 'performer' ? label : 'profile'} page`}
          dangerouslySetInnerHTML={{
            __html: entityAvatar(name, kind === 'performer' ? refs[0] ?? null : item.creator_entity ?? null, kind),
          }} />
      )
      : <span data-media-avatar="" dangerouslySetInnerHTML={{ __html: entityAvatar(name, null, '') }} />;
  const who = coStarred
    ? (
      <>
        <button type="button" data-media-who="" data-entity-kind="performer" data-entity-name={performer} title={entityDisplayName('performer', performer)}><WhoLabel name={entityDisplayName('performer', performer)} /></button>
        <span data-media-who-more="">{`and ${total} people`}</span>
      </>
    )
    : kind
      ? <button type="button" data-media-who="" data-entity-kind={kind} data-entity-name={name} title={entityDisplayName(kind, name)}><WhoLabel name={entityDisplayName(kind, name)} /></button>
      /* Entries without a credited person are one class of the library, clickable like performer names and studio names. */
      : <button type="button" data-media-who="" data-open-unowned=""><WhoLabel name={name} /></button>;
  return { avatar, who };
}

/** The countdown ring at the top right while hovering; when it completes, it zooms. Clicking it opens directly. */
function PreviewCounter() {
  return (
    <button type="button" data-media-preview="" data-open="" title="Open preview" aria-label="Open preview">
      <svg viewBox="-18 -18 36 36" aria-hidden="true"><circle r="17" /><circle r="17" /></svg>
      <svg data-media-ring-play="" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-play" /></svg>
    </button>
  );
}

/** "Watch later" writes to the ledger and is triggered only by clicks; on completion it shows an undo key, and undoing brings the button back with it.
 *  The pressed state first trusts a result just written on this card, otherwise the entry itself: after the same entry is refetched it renders by the new value. */
function LaterButton({ item, actions, on, onChange }: {
  item: MediaItem; actions: MediaCardActions; on: boolean; onChange(on: boolean): void;
}) {
  const [busy, setBusy] = useState(false);
  const click = (event: MouseEvent) => {
    event.stopPropagation();
    if (busy) return;
    setBusy(true);
    void actions.watchLater(item, onChange).finally(() => setBusy(false));
  };
  return (
    <div data-media-later="">
      <button type="button" data-later="" aria-pressed={on} title="Watch later" aria-label="Watch later" onClick={click}
        aria-busy={busy || undefined} aria-disabled={busy || undefined}>
        <Icon name={on ? 'check' : 'bookmark-plus'} />
      </button>
    </div>
  );
}

/** Rewind and fast-forward jump within the hover preview's video itself and never open details. */
function seekPreview(card: HTMLElement | null, delta: number) {
  const video = card?.querySelector<HTMLVideoElement & { _hop?: ReturnType<typeof setInterval> | null }>('video.hv');
  if (!video || !Number.isFinite(video.duration)) return;
  if (video._hop) { clearInterval(video._hop); video._hop = null }
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
}

function VideoCard({ item, variant, layout, selected, selectMode, seekSeconds, helpers, actions, onOpen, grouped = true }: MediaCardProps) {
  useEntityNames();
  const card = useRef<HTMLElement | null>(null);
  const [written, setWritten] = useState<{ id: number; on: boolean } | null>(null);
  const later = written?.id === item.id ? written.on : !!item.watch_later;
  const tints = useLibraryTints();
  const library = item.library_id && tints.get(item.library_id)?.color ? item.library_id : undefined;
  const flaggedBy = [Number(item.liked) > 0 ? 'Like' : '', Number(item.o_count) > 0 ? 'Has climax records' : ''].filter(Boolean);
  const latest = useRef(item);
  latest.current = item;
  /* 资源身份或缩略图能力变化时重绑；wireHover 先清理旧事件，避免虚拟卡片复用旧资源。 */
  const attach = useCallback((el: HTMLElement | null) => {
    const current = latest.current;
    if (card.current && card.current !== el) releaseHover(card.current);
    card.current = el;
    if (el && (!current.medium || current.medium === 'video')) wireHover(el, current);
  }, [item.id, item.location, item.has_thumb, item.medium]);

  /* In an aspect-filtered list the API only counts volumes and editions of the same aspect, so a group may be down to one volume or one edition: that card is that
     single file itself, with no stacked paper edges and no volume or edition count. */
  const parts = grouped && Number(item.part_group?.count) > 1 ? item.part_group || null : null;
  const editions = grouped && Number(item.edition_group?.count) > 1 ? item.edition_group || null : null;
  const stacked = !!(parts || editions);
  const jav = layout.active && !!item.is_jav;
  const ratio = cardRatio(item, variant, layout);
  const size = jav ? layout.size : 'small';
  /* 竖屏格（竖屏带与筛竖屏的网格）只展示竖屏比例的视频，卡面只用视频自己的帧图；番号作品也
     不走官方封面，「JAV 默认封面」设置在这里不起作用：那张封面是整部作品的宣传图，多是横图，
     和这一卷竖屏视频不是同一个画面。没有图时写缺的是什么、为什么缺（`./artwork-gap.tsx`）。 */
  const frameOnly = ratio === PORTRAIT_RATIO && !!item.is_jav;
  const drawn = frameOnly ? frameArtwork(item, false) : cardArtwork(item, size, false, layout.javImage);
  const identity = frameOnly || size === 'small' ? drawn.html : cardArtwork(item, 'small', false, layout.javImage).html;
  /* 取失败记在当时那段片段上：换了图（补到封面、改了「JAV 默认封面」）就不再算失败。重试给地址
     添一个序号，身份跟着变，`ArtSlot` 才会换一个新元素重新取。 */
  const [failure, setFailure] = useState<{ html: string; gap: ArtworkGap | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failed = failure?.html === drawn.html ? failure : null;
  const artwork = attempt ? { ...drawn, html: drawn.html.replace(/ src="([^"]*)"/, (_all, src: string) =>
    ` src="${src}${src.includes('?') ? '&amp;' : '?'}r=${attempt}"`) } : drawn;
  const onFailed = useCallback((src: string) => {
    const html = drawn.html;
    setFailure({ html, gap: null });
    void failedArtwork(src.replace(/&r=\d+$/, ''), drawn.kind).then(gap =>
      setFailure(current => current?.html === html ? { html, gap } : current));
  }, [drawn.html, drawn.kind]);
  const retry = useCallback(() => { setFailure(null); setAttempt(count => count + 1) }, []);
  const gap = !artwork.html ? missingArtwork(item, frameOnly) : failed
    ? failed.gap || { key: 'checking', title: drawn.kind === 'cover' ? 'Cover not fetched' : 'Preview not obtained', reason: 'Checking the reason', fix: '' as const }
    : null;
  const rawName = parts?.title || item.name || '';
  const shownName = helpers.displayName(item, rawName).trim() || UNNAMED;
  const titleHtml = helpers.titleHtml(item, rawName).trim() || esc(UNNAMED);
  const shownSize = parts?.total_size ?? item.size;
  const shownDuration = parts?.total_duration ?? item.duration;
  const watched = !parts && Number(item.play_seconds) > 0 && Number(item.duration) > 0
    ? Math.min(Number(item.play_seconds) / Number(item.duration), 1) : 0;
  const { avatar, who } = identityParts(item);
  const tags = (item.follow_tags || item.tags || []).slice(0, 3);

  const click = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-media-reason-dialog]')) return;
    const el = card.current;
    if (!el) return;
    if (selectMode || event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      actions.toggleSelection(item.id, event.shiftKey);
      return;
    }
    if (target.closest('[data-open]')) { onOpen(item, el); return }
    const entity = target.closest<HTMLElement>('[data-entity-kind]');
    if (entity && el.contains(entity)) {
      actions.openEntity(entity.dataset.entityKind || '', entity.dataset.entityName || '');
      return;
    }
    const unowned = target.closest('[data-open-unowned]');
    if (unowned && el.contains(unowned)) { actions.openUnowned(); return }
    const tag = target.closest<HTMLElement>('[data-tag]');
    if (tag && el.contains(tag)) { actions.toggleTag(tag.dataset.tag || ''); return }
    onOpen(item, el);
  };

  const pic = (
    <div data-media-pic="" data-pic-portrait={ratio === PORTRAIT_RATIO ? '' : undefined}
      style={{ '--card-ratio': String(ratio) } as CSSProperties}>
      {gap
        ? <ArtworkGapView gap={gap} item={item} onRetry={retry} />
        : <ArtSlot artwork={artwork} identity={`${identity}#${attempt}`} relayout={(root) => relayoutCovers(root, size)}
          onFailed={onFailed} />}
      <div data-media-badge="" dangerouslySetInnerHTML={{ __html: helpers.badgeHtml(item.location || '', item.cost || '') }} />
      <span data-media-check=""><Icon name="check" /></span>
      <span data-media-trash-mark=""><Icon name="trash" /><b>Trash</b></span>
      {parts && !editions ? <span data-media-group="">{`${Number(parts.count).toLocaleString()} volumes`}</span> : null}
      {editions
        ? <span data-media-group="" title={editions.editions.join(' · ')}>{`${Number(editions.count).toLocaleString()} editions`}</span>
        : null}
      {Number(shownDuration) > 0 ? <span data-media-duration="">{fmtDur(shownDuration)}</span> : null}
      {!selectMode && item.disposal === 'trash' ? <ResourceAction item={item} actions={actions} /> : null}
      {watched > 0
        ? (
          <div data-media-progress="" role="progressbar" aria-label="Watch progress" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(watched * 100)}>
            <i style={{ '--media-fill': `${(watched * 100).toFixed(1)}%` } as CSSProperties} />
          </div>
        )
        : item.leave_ratio != null
          ? (
            <div data-media-scrub="">
              <i style={{ '--media-fill': `${Math.round(item.leave_ratio * 100)}%` } as CSSProperties} />
            </div>
          )
          : null}
      <PreviewCounter />
      {later || flaggedBy.length
        ? (
          <div data-media-status="">
            {later ? <span data-status="later" title="Watch later" aria-label="Watch later"><Icon name="bookmark" /></span> : null}
            {flaggedBy.length
              ? <span data-status="flagged" title={`Flagged by: ${flaggedBy.join(', ')}`} aria-label={`Flagged by: ${flaggedBy.join(', ')}`}><Icon name="heart" /></span>
              : null}
          </div>
        )
        : null}
      {!selectMode ? <LaterButton item={item} actions={actions} on={later} onChange={on => setWritten({ id: item.id, on })} /> : null}
      {!selectMode ? <div data-media-seek="">
        <button type="button" onClick={(event) => { event.stopPropagation(); seekPreview(card.current, -seekSeconds) }}
          title={`Back ${seekSeconds} sec`} aria-label={`Back ${seekSeconds} sec`}><Icon name="rotate-ccw" /></button>
        <button type="button" onClick={(event) => { event.stopPropagation(); seekPreview(card.current, seekSeconds) }}
          title={`Forward ${seekSeconds} sec`} aria-label={`Forward ${seekSeconds} sec`}><Icon name="rotate-cw" /></button>
        <button type="button" data-open="" title="Open details" aria-label="Open details"><Icon name="expand" /></button>
      </div> : null}
    </div>
  );

  return (
    <article ref={attach} data-media-card="" data-id={item.id} data-variant={variant}
      data-guide-video={item.location !== 'online' && !String(item.name || '').toLowerCase().endsWith('.iso') ? '' : undefined}
      data-watch-later={later ? '' : undefined} data-library={library}
      data-jav-item={item.is_jav ? '' : undefined}
      data-part-seed={parts ? parts.seed_id : undefined} data-stacked={stacked ? '' : undefined}
      data-pending-delete={item.disposal === 'trash' ? '' : undefined} data-selected={selected ? '' : undefined}
      onClick={click} onMouseDown={suppressShiftTextSelection}>
      <button type="button" data-media-open="" data-open=""
        aria-label={`Open ${shownName}${editions ? ' editions' : parts ? ' volumes' : ' details'}`} />
      {stacked ? <div data-media-stack="">{pic}</div> : pic}
      <div data-media-meta="">
        {avatar}
        <div data-media-text="">
          <button type="button" data-media-title="" data-open=""
            dangerouslySetInnerHTML={item.disposal === 'trash' ? undefined : { __html: titleHtml }}>
            {item.disposal === 'trash' ? <span data-media-title-text="" dangerouslySetInnerHTML={{ __html: titleHtml }} /> : null}
          </button>
          <div data-media-byline="">
            {who}
            {item.why && variant !== 'next' ? <span data-media-why="" title={item.why}>{item.why}</span> : null}
            <span data-media-facts="">
              {item.is_jav && item.release_date ? <CardDate value={item.release_date} label={item.release_date} /> : null}
              <span data-media-size=""><Icon name="hard-drive" />{Number(shownSize) > 0 ? fmtSize(Number(shownSize)) : 'Unknown size'}</span>
            </span>
          </div>
          {variant === 'next' ? <RecommendationReason reasons={item.why ? item.why.split(' · ') : []}
            tags={(item.why_tags || []).map(helpers.tagLabel)} /> : tags.length || item.disposal === 'trash'
            ? <CardTags tags={tags} label={helpers.tagLabel} readOnly={!!item.follow_item_id} />
            : null}
          <DisposalReason item={item} />
        </div>
      </div>
    </article>
  );
}

/** The non-video things in trash: images, audio, archives, and URL shortcuts. The card carries only a "Restore" or
 *  "Move to trash" button; clicking writes the ledger, and on completion gives an undo button. */
function ResourceCard({ item, selected, selectMode, helpers, actions, onOpen }: MediaCardProps) {
  const card = useRef<HTMLElement | null>(null);
  const image = item.medium === 'image' && item.location !== 'online';
  const name = String(item.name || '');
  const label = name.toLowerCase().endsWith('.url') ? 'URL shortcut' : RESOURCE_LABELS[item.medium || ''] || 'Other files';
  const glyph = image ? 'pics' : label === 'URL shortcut' ? 'globe' : 'hard-drive';
  const click = (event: MouseEvent<HTMLElement>) => {
    if (!card.current) return;
    if (selectMode || event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      actions.toggleSelection(item.id, event.shiftKey);
      return;
    }
    onOpen(item, card.current);
  };
  return (
    <article ref={card} data-media-card="" data-id={item.id} data-variant="resource" data-medium={item.medium || 'other'}
      data-pending-delete={item.disposal === 'trash' ? '' : undefined} data-selected={selected ? '' : undefined}
      onClick={click} onMouseDown={suppressShiftTextSelection}>
      <div data-media-pic="" style={{ '--card-ratio': String(16 / 9) } as CSSProperties}>
        <span data-media-glyph=""><Icon name={glyph} /><b>{label}</b></span>
        {image
          ? <span data-media-art="thumb" dangerouslySetInnerHTML={{
            __html: `<img class="poster" src="/photo-thumb?id=${item.id}" width="640" height="360" alt="" loading="lazy" data-drop="self">`,
          }} />
          : null}
        <div data-media-badge="" dangerouslySetInnerHTML={{ __html: helpers.badgeHtml(item.location || '', item.cost || '') }} />
        <span data-media-check=""><Icon name="check" /></span>
        <span data-media-trash-mark=""><Icon name="trash" /><b>Trash</b></span>
        {!selectMode ? <ResourceAction item={item} actions={actions} /> : null}
      </div>
      <div data-media-meta="">
        <span data-media-avatar="" data-media-kind-glyph="" aria-hidden="true"><Icon name={glyph} /></span>
        <div data-media-text="">
          <span data-media-title="" data-middle-truncate="" title={name}
            dangerouslySetInnerHTML={{ __html: esc(name || 'Unnamed resource') }} />
          <div data-media-byline="">
            <span data-media-who="">{label}</span>
            {item.why ? <span data-media-why="">{item.why}</span> : null}
            <span data-media-size="">{Number(item.size) > 0 ? fmtSize(Number(item.size)) : 'Unknown size'}</span>
          </div>
          {item.disposal === 'trash' ? <div data-media-tags="" /> : null}
          <DisposalReason item={item} />
        </div>
      </div>
    </article>
  );
}

function MediaCardView(props: MediaCardProps) {
  if (props.variant === 'resource') return <ResourceCard {...props} />;
  return <VideoCard {...props} />;
}

/** Dozens to hundreds of cards per screen; rerenders beyond selection and layout must not drag every card along: everything compares by reference, and the
 *  helpers and actions the shell passes down keep their identity. */
export const MediaCard = memo(MediaCardView);
