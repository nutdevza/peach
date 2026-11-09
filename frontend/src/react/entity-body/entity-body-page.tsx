/* 实体资料页的正文（`entity-body` island）：名册、作品网格与照片墙三个视图里的一个。
 *
 * 数据全由壳取好推进来，这里只挑出当前视图画。作品网格跨刷新代次保留宿主：新的作品请求
 * 将 `items` 置为 `null`，内容与骨架原位交叉淡化，数据到达时同时呈现内容并撤下骨架。 */
import { Fragment, useCallback, useMemo, useState } from 'react';

import { CatalogGridPage, LoadMore } from '../catalog-grid/catalog-grid-page';
import { SkeletonContent } from '../components/skeleton-content';
import { PAGE_SIZE } from '../index/index-data';
import { PeopleGrid } from '../index/index-people';
import { openPhotoLightbox } from '../photo-lightbox/photo-lightbox-dialog';
import type { LightboxSlide } from '../photo-lightbox/photo-lightbox';
import type {
  EntityBodyProps, EntityCodeSet, EntityPhotos, EntityRoster, EntitySamplePhoto, EntityWallPhoto,
} from './entity-body';

export function EntityBodyPage(props: EntityBodyProps) {
  if (props.view === 'people' && props.roster) return <Roster roster={props.roster} props={props} />;
  if (props.view === 'videos') return <VideoSection {...props} />;
  if (props.view === 'photos' && props.photos) {
    return <PhotoSection key={props.photos.revision} photos={props.photos} props={props} />;
  }
  return null;
}

/** How many cells a roster page holds, the same cell count as the index page's roster. */
const ROSTER_PAGE = PAGE_SIZE.people;

/** A roster cell opens onto that person's (or studio's) profile page, with images following the index page's fallback chain.
 *
 *  The list arrives with the profile in one transaction, over a thousand people; painting all at once means a thousand avatar cells and a thousand image fetches. Lay out one page first,
 *  and the rest go through the video section's same "Load more", self-fetching the next page when scrolled near. */
function Roster({ roster, props }: { roster: EntityRoster; props: EntityBodyProps }) {
  const { helpers, actions } = props;
  const cell = useMemo(() => ({ personAvatar: helpers.personAvatar, openEntity: actions.openEntity }),
    [helpers, actions]);
  const [shown, setShown] = useState<number>(ROSTER_PAGE);
  const people = useMemo(() => roster.people.slice(0, shown), [roster.people, shown]);
  const loadMore = useCallback(async () => { setShown((count) => count + ROSTER_PAGE) }, []);
  return (
    <>
      <PeopleGrid kind={roster.kind} items={people} layout={roster.layout} props={cell} />
      {shown < roster.people.length
        ? <LoadMore key={shown} entity load={loadMore} enabled={() => true} />
        : null}
    </>
  );
}

/** Video section: the outer layer only handles the skeleton while "the shell is still fetching"; once the list arrives it is the card grid's entity mode,
 *  with the first page given by the shell and continuation pages via `fetchPage`. `[data-entity-grid]` is the cell the shell recognizes when arranging cards for Shift multi-select. */
function VideoSection(props: EntityBodyProps) {
  return (
    <div data-entity-grid=""><SkeletonContent pending={!props.items} skeletonHtml={props.skeletonHtml}>
      {props.items ? (
        <CatalogGridPage mode="entity" entityKey={props.listScope || `${props.kind}:${props.name}`} revision={props.revision}
          restoreNavigation={props.restoreNavigation}
          initial={props.items} fetchPage={props.fetchPage} listScope={props.listScope} helpers={props.helpers} actions={props.actions}
          layout={props.layout} selectMode={props.selectMode} selected={props.selected}
          seekSeconds={props.seekSeconds} wireDrag={props.wireDrag}
          skeletonHtml={props.skeletonHtml} groupCollapse={props.groupCollapse} canLoadMore={props.canLoadMore} />
      ) : null}
    </SkeletonContent></div>
  );
}

/** A video's sample shots laid out as several cells. Count, site name, and title already came down with `/api/photos`, so no extra request is made. */
const sampleItems = (set: EntityCodeSet): EntitySamplePhoto[] => Array.from({ length: set.n }, (_, i) => ({
  sample: true, code: set.code, position: i + 1, total: set.n, name: `${set.code} sample ${i + 1}`,
  source: set.site_label || 'Official samples',
}));

const isSample = (item: EntityWallPhoto): item is EntitySamplePhoto => (item as EntitySamplePhoto).sample === true;

/** Sample image URLs are looked up server-side by code and index, shared between thumbnails and the lightbox's large view. */
const sampleQuery = (item: EntitySamplePhoto) => `code=${encodeURIComponent(item.code)}&n=${item.position}`;

/* Thumbnails always go through `/photo-thumb` (server-side cache); only the lightbox reads originals: PikPak is a metered source, and laying originals across a screen
 *  costs tens of megabytes of traffic. Samples go through `/sample-thumb`. */
const thumbSrc = (item: EntityWallPhoto) => isSample(item)
  ? `/sample-thumb?${sampleQuery(item)}`
  : `/photo-thumb?id=${item.id}`;

/** A wall cell becomes one slide in the lightbox. Local images are passed in whole as an asset; the details panel reads source and size, and locating reads the id. */
const wallSlide = (item: EntityWallPhoto): LightboxSlide => isSample(item)
  ? { src: `/sample-image?${sampleQuery(item)}`, thumb: thumbSrc(item), name: item.name, asset: null,
    source: item.source }
  : { src: `/photo?id=${item.id}`, thumb: thumbSrc(item), name: item.name || '', asset: item };

/** Photo view: each video's official stills spread from newest to oldest by release date, one segment with one segment header,
 *  and the local images' wall behind them; with only local images, no segment headers (ADR-0068).
 *
 *  One full-width masonry fills down by column, and one video's images would run from one column's bottom into the next
 *  column's top, with numbering every image too noisy; split into segments, one video is numbered once. `data-photo-index` is
 *  a cell's index across the whole wall, continuous across segments, and clicking hands the whole column to the lightbox,
 *  which keeps flipping continuously across segments. Paging counts only local images: stills lay out in one pass and take no
 *  pagination. */
function PhotoSection({ photos, props }: { photos: EntityPhotos; props: EntityBodyProps }) {
  const { photoSize: size, photoLayout: layout, actions, canLoadMore } = props;
  const wall = useMemo(() => [...photos.codeSets.flatMap(sampleItems), ...photos.items], [photos]);
  /* Cells whose image cannot load. A missing local image means the file is gone and the whole cell goes; a missing sample usually means the source is down right now,
   *  so the cell keeps an empty backing, keeps its index, and stays reachable in the lightbox. Neither case renumbers the other cells. */
  const [lost, setLost] = useState<ReadonlySet<number>>(() => new Set());
  const lose = useCallback((index: number) => setLost((prev) => {
    if (prev.has(index)) return prev;
    const next = new Set(prev);
    next.add(index);
    return next;
  }), []);
  const open = useCallback((index: number) => {
    void openPhotoLightbox(index, wall.map(wallSlide), { revealSource: actions.revealSource });
  }, [actions, wall]);
  const cell = (item: EntityWallPhoto, index: number) => (
    <PhotoCell key={index} item={item} index={index} lost={lost.has(index)} onLose={lose} onOpen={open} />
  );
  const wallAttrs = { 'data-photo-wall': '', 'data-size': size, 'data-layout': layout };
  let start = 0;
  const groups = photos.codeSets.map((set) => {
    const from = start;
    start += set.n;
    return { set, from };
  });
  const localStart = start;
  return (
    <>
      {groups.map(({ set, from }) => (
        <Fragment key={set.code}>
          <GroupHead label={set.code} title={set.name}
            meta={[`${set.site_label || 'Official'} samples`, set.release_date, `${set.n.toLocaleString()} images`].filter(Boolean).join(' · ')} />
          <div {...wallAttrs}>{wall.slice(from, from + set.n).map((item, i) => cell(item, from + i))}</div>
        </Fragment>
      ))}
      {groups.length && photos.total ? <GroupHead label="Local images" meta={`${photos.total.toLocaleString()} images`} /> : null}
      <div {...wallAttrs} data-local-wall="">
        {photos.items.map((item, i) => (lost.has(localStart + i) ? null : cell(item, localStart + i)))}
      </div>
      {photos.hasMore ? (
        <LoadMore key={photos.items.length} entity load={actions.loadMorePhotos}
          enabled={() => canLoadMore?.() !== false} />
      ) : null}
    </>
  );
}

/** The section header row: code, title, and at the right end "source previews · release date · count". Overlong titles truncate at the tail, the full name in title. */
function GroupHead({ label, title, meta }: { label: string; title?: string; meta: string }) {
  return (
    <div data-photo-group="">
      <b>{label}</b>
      {title ? <span data-photo-group-title="" title={title}>{title}</span> : null}
      <span data-photo-group-meta="">{meta}</span>
    </div>
  );
}

/** One cell. Until the image arrives it is a `--sunk` empty base, not a row of filename: `alt` is kept for screen readers, and the text color is set transparent in the styles. */
function PhotoCell({ item, index, lost, onLose, onOpen }: {
  item: EntityWallPhoto; index: number; lost: boolean; onLose(index: number): void; onOpen(index: number): void;
}) {
  const name = item.name ?? '';
  return (
    <button type="button" data-photo-cell="" data-photo-index={index} title={name} onClick={() => onOpen(index)}>
      {lost ? null : (
        <img src={thumbSrc(item)} alt={name} loading="lazy" decoding="async" fetchPriority="low"
          onError={() => onLose(index)} />
      )}
    </button>
  );
}
