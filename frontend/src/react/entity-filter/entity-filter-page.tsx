/* The whole block under the entity profile page's profile card: the intersection bar plus a two-row glass overlay (top row:
 * view keys, watch status and tags; bottom row: readouts and this screen's sort, layout and Shuffle). The three views (roster,
 * videos, photos) share this block, with the bottom row swapping content per view.
 *
 * All state lives in the shell: this page's filters, current view, sort and readouts arrive as props; clicks return to the
 * shell, and the shell pushes a new pressed state before sending the request, so `aria-pressed` and the sliding glass are in
 * place immediately, without waiting for this fetch.
 *
 * Each "where am I" row has its sliding glass (the view keys' pane is round), moved by `use-view-glide.ts`; they are resident
 * nodes on the overlay root, moved on filter and view changes and never rebuilt. The two source-file keys are still assembled
 * by the legacy layer (the photo details reuse the same pair), so that cell uses `dangerouslySetInnerHTML` and React does not
 * own the nodes inside. */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { icon } from '@peach/legacy/core';

import { FilterGlassRows, FilterIconButton, FilterPill } from '../components/filter-glass';
import { LibraryShortcuts } from '../library-shortcuts/shortcut-controls';
import { AsyncText } from '../components/async-text';
import { FolderBrowseToggle } from '../catalog-folders/catalog-folders-page';
import { SEGMENTED_GLASS_TRACK, SEGMENT_GLASS } from '../components/segmented';
import { spriteGlyph } from '../components/sprite-glyph';
import { IconSwap } from '../components/icon-swap';
import { useViewGlide } from '../components/use-view-glide';
import { useCatalogView } from '../catalog-grid/catalog-view';
import { CatalogViewToggle } from '../catalog-grid/catalog-view-toggle';
import { sourceIcon } from '../follow-feed/follow-marks';
import {
  videoOnly, type EntityComboItem, type EntityFilterActions, type EntityFilterHelpers, type EntityFilterProps, type EntityOnlineHead,
  type EntityPhotoHead, type EntitySortKey, type EntityVideoHead, type EntityView, type EntityViewKeys, type SegmentOption,
} from './entity-filter';

const Sep = () => <span data-entity-sep="" aria-hidden="true" />;
const ShuffleIcon = spriteGlyph('shuffle');
const SortUpIcon = spriteGlyph('arrow-up'), SortDownIcon = spriteGlyph('arrow-down');

export function EntityFilterPage(props: EntityFilterProps) {
  const { view, views, state, states, tags, combo, actions, helpers } = props;
  const onVideos = videoOnly(view);
  /* The online view also has its own statuses, sources and tags (the follows-page set); it just counts entries within follows. */
  const online = view === 'online' ? props.online : null;
  const filtered = onVideos || !!online;
  const stateNow = online ? online.status : state;
  const stateOptions = online ? online.statuses.map(([k, label]) => ({ k, label })) : states;
  const statePane = useRef<HTMLSpanElement>(null);
  const mediaPane = useRef<HTMLSpanElement>(null);
  const stateRow = useRef<HTMLDivElement>(null);
  const mediaRow = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const tagRow = useRef<HTMLDivElement>(null);
  const bottomRow = useRef<HTMLDivElement>(null);
  const stateGlide = useViewGlide(statePane, stateRow, '[data-entity-state][aria-pressed="true"]', `${view}:${stateNow}`);
  const mediaGlide = useViewGlide(mediaPane, mediaRow, '[data-media-view][aria-pressed="true"]', `${view}:${!!views}`);
  const onlinePane = useRef<HTMLSpanElement>(null);
  const onlineRow = useRef<HTMLDivElement>(null);
  const onlineMedia = online?.mediaCounts ? online : null;
  const onlineGlide = useViewGlide(onlinePane, onlineRow, '[data-media-view][aria-pressed="true"]',
    `${view}:${online?.media}:${!!onlineMedia}`);

  /* The tag cell is `overflow-x:auto` with a hidden scrollbar: it scrolls, but the mouse has no reachable handle, so the site-wide
     horizontal-row drag plus wheel mapping is registered. On narrow screens the outer layer scrolls (watch state moves with it), so both layers register:
     registering on the non-scrolling layer is a no-op, while missing one layer leaves some width unscrollable. On narrow screens the bottom row scrolls horizontally as a whole; same treatment. */
  useEffect(() => {
    helpers.wireDrag(tagRow.current);
    helpers.wireScroller(scroll.current);
    helpers.wireDrag(bottomRow.current);
  }, [helpers]);

  return (
    <>
      <Combo items={combo} hidden={!onVideos} actions={actions} />
      <FilterGlassRows label="Filter and sort" topLabel="Media and tags"
        attrs={{ 'data-filter-frame': '', 'data-entity-filter-glass': '' }}
        topClassName="gap-1.5 overflow-visible"
        bottomClassName="min-h-12" bottomRef={bottomRow} busy={props.busy}
        panes={<>
          <span ref={statePane} data-view-glide="" aria-hidden="true" />
          <span ref={mediaPane} data-view-glide="round" aria-hidden="true" />
          <span ref={onlinePane} data-view-glide="round" aria-hidden="true" />
        </>}
        top={!views && !filtered ? null : <>
          {views ? (
            <>
              <ViewKeys keys={views} view={view} row={mediaRow} glide={mediaGlide} onView={actions.setView} />
              {filtered ? <Sep /> : null}
            </>
          ) : null}
          {onlineMedia ? (
            <>
              <OnlineMediaKeys head={onlineMedia} row={onlineRow} glide={onlineGlide} onMedia={actions.onlineMedia} />
              <Sep />
            </>
          ) : null}
          <div ref={scroll} data-entity-scroll="">
            <div ref={stateRow} role="group" aria-label={online ? 'State' : 'Watch states'} data-entity-states=""
              hidden={!filtered} onPointerLeave={stateGlide.leave}>
              {stateOptions.map((option) => (
                <button key={option.k} type="button" data-entity-state={option.k} data-entity-press=""
                  aria-pressed={stateNow === option.k} onPointerEnter={stateGlide.hover}
                  onClick={() => {
                    if (stateNow === option.k) return;
                    if (online) actions.onlineStatus(option.k); else actions.setState(option.k);
                  }}>
                  {option.label}
                </button>
              ))}
              {!online || online.providers.length || online.tags.length ? <Sep /> : null}
            </div>
            {/* Tags appear only in the video view: counts count videos, so on the roster or photos they would not add up, and clicking one would also flip the view back to videos. */}
            <div ref={tagRow} data-entity-tags="">
              {onVideos ? tags.map((tag) => (
                <FilterPill key={tag.k} data-entity-tag={tag.k} data-entity-press="" pressed={tag.selected}
                  onPress={() => actions.toggleTag(tag.k)}>
                  {tag.label}<span data-count-badge={tag.k}>{tag.n.toLocaleString()}</span>
                </FilterPill>
              )) : online ? <OnlineFilters head={online} actions={actions} /> : null}
            </div>
          </div>
        </>}
        bottom={<Head {...props} />}
      />
    </>
  );
}

const ONLINE_MEDIA = [['videos', 'Videos', 'play', 'video'], ['images', 'Images', 'pics', 'image']] as const;

/** The two round buttons at the left end of the online view, same as the follows page: whether this screen shows videos or images. */
function OnlineMediaKeys({ head, row, glide, onMedia }: {
  head: EntityOnlineHead;
  row: RefObject<HTMLDivElement | null>;
  glide: ReturnType<typeof useViewGlide>;
  onMedia(media: 'videos' | 'images'): void;
}) {
  return (
    <div ref={row} role="group" aria-label="Online media kinds" data-entity-media="" data-online-media=""
      onPointerLeave={glide.leave}>
      {ONLINE_MEDIA.map(([value, text, symbol, kind]) => {
        const title = `${text} ${Math.max(0, head.mediaCounts?.[value] || 0).toLocaleString()}`;
        return (
          <button key={value} type="button" data-media-view={value} data-media-icon={kind}
            aria-pressed={head.media === value} aria-label={title} title={title} onPointerEnter={glide.hover}
            onClick={() => { if (head.media !== value) onMedia(value) }} dangerouslySetInnerHTML={{ __html: icon(symbol) }} />
        );
      })}
    </div>
  );
}

/** The online view's source site icons and tag pills, same overlay as the follows page: pressing a site icon means only this source, tags intersect. */
function OnlineFilters({ head, actions }: { head: EntityOnlineHead; actions: EntityFilterActions }) {
  return (
    <>
      {head.providers.map(([key, label]) => (
        <button key={key} type="button" data-follow-provider={key} data-entity-press=""
          aria-pressed={head.provider === key} title={label} aria-label={`Source: ${label}`}
          onClick={() => actions.onlineProvider(key)} dangerouslySetInnerHTML={{ __html: sourceIcon(key) }} />
      ))}
      {head.providers.length && head.tags.length ? <Sep /> : null}
      {head.tags.map((tag) => (
        <FilterPill key={tag.k} data-follow-tag={tag.k} data-entity-press="" data-tag-cat={`r34-${tag.cat}`}
          pressed={tag.selected} onPress={() => actions.onlineTag(tag.k)}>
          {tag.label}{tag.n ? <span data-count-badge={tag.k}>{tag.n.toLocaleString()}</span> : null}
        </FilterPill>
      ))}
    </>
  );
}

/** Roster, videos, photos and online are mutually exclusive views sharing one set of pill keys: they answer the same question. Key names carry counts, readable on hover.
 *  The first three are local database content; online is updates from follows not yet added to library, so it sorts last. */
function ViewKeys({ keys, view, row, glide, onView }: {
  keys: EntityViewKeys;
  view: EntityView;
  row: RefObject<HTMLDivElement | null>;
  glide: ReturnType<typeof useViewGlide>;
  onView(view: EntityView): void;
}) {
  const buttons: { value: EntityView; text: string; count: number; symbol: string; kind: string }[] = [];
  if (keys.people) buttons.push({ value: 'people', text: keys.people.label, count: keys.people.count, symbol: keys.people.icon, kind: 'people' });
  if (keys.videos) buttons.push({ value: 'videos', text: 'Videos', count: keys.videos.count, symbol: 'play', kind: 'video' });
  if (keys.photos) buttons.push({ value: 'photos', text: 'Photos', count: keys.photos.count, symbol: 'pics', kind: 'image' });
  if (keys.online) buttons.push({ value: 'online', text: 'Online', count: keys.online.count, symbol: 'rss', kind: 'online' });
  return (
    <div ref={row} role="group" aria-label={keys.label} data-entity-media="" onPointerLeave={glide.leave}>
      {buttons.map(({ value, text, count, symbol, kind }) => {
        const title = `${text} ${Math.max(0, count || 0).toLocaleString()}`;
        return (
          <button key={value} type="button" data-media-view={value} data-media-icon={kind}
            aria-pressed={view === value} aria-label={title} title={title} onPointerEnter={glide.hover}
            onClick={() => onView(value)} dangerouslySetInnerHTML={{ __html: icon(symbol) }} />
        );
      })}
    </div>
  );
}

/** The active video filter. Placed above the popover, separate from it: it says "which filters are currently applied" and can be removed one by one. The home page one
 *  (`catalog-filter`) is the same chip. */
export function Combo({ items, hidden, actions }: {
  items: EntityComboItem[]; hidden: boolean; actions: Pick<EntityFilterActions, 'toggleTag' | 'clearFilter' | 'clearAll'>;
}) {
  return (
    <div data-entity-combo="" hidden={hidden}>
      {items.length ? (
        <>
          {items.map((item) => (
            <span key={`${item.kind}:${item.key}`} data-combo-chip="">
              {item.label}
              <button type="button" aria-label={`Remove ${item.label}`}
                onClick={() => (item.kind === 'untag' ? actions.toggleTag(item.key) : actions.clearFilter(item.key))}>
                ✕
              </button>
            </span>
          ))}
          <button type="button" data-combo-clear="" onClick={actions.clearAll}>Clear all</button>
        </>
      ) : null}
    </div>
  );
}

/** Bottom row: the numbers plus this view's own controls. The roster has only the numbers. */
function Head(props: EntityFilterProps) {
  const { view, readout, busy, video, photo, actions, helpers } = props;
  return (
    <>
      {view === 'photos' && photo?.back ? (
        <button type="button" data-photo-back="" onClick={actions.photoBack}>
          <span className="contents" dangerouslySetInnerHTML={{ __html: icon('chevron-left') }} /><span>All photos</span>
        </button>
      ) : null}
      <Readout text={readout} busy={busy} />
      <LibraryShortcuts currentHref={() => location.pathname + location.search} />
      {view === 'videos' && video ? <VideoControls head={video} actions={actions} /> : null}
      {view === 'photos' && photo ? <PhotoControls head={photo} actions={actions} helpers={helpers} /> : null}
      {view === 'online' && props.online ? <OnlineControls head={props.online} actions={actions} /> : null}
    </>
  );
}

/** While a reading waits, the old text is kept; the filter box and other controls stay in place. */
function Readout({ text, busy }: { text: string; busy: boolean }) {
  return (
    <h3 data-entity-readout="">
      <AsyncText text={busy ? undefined : text} busy={busy} placeholder={<span data-skeleton="count" aria-hidden
        className="relative inline-block h-3.5 w-24 rounded-md align-middle skeleton-sheen" />} />
    </h3>
  );
}

/** Segmented switches on glass: card layout, image layout. The selected cell uses the overlay-selected glass material. The follows page and home overlays use
 *  the same one; `name` gives that radio group a form name (home's groups are `home-layout`/`jav-layout`). */
export function Segments({ name, label, value, options, onChange }: {
  name?: string; label: string; value: string; options: readonly SegmentOption[]; onChange(value: string): void;
}) {
  return (
    <RadioGroup name={name} aria-label={label} orientation="horizontal" value={value} onChange={onChange}
      data-entity-layout="" className={SEGMENTED_GLASS_TRACK}>
      {options.map(([option, text, symbol]) => {
        const Glyph = spriteGlyph(symbol);
        return (
          <Radio key={option} value={option} aria-label={text} data-glass-segment="" className={SEGMENT_GLASS}>
            <span title={text} className="contents"><Glyph className="size-4" /></span>
          </Radio>
        );
      })}
    </RadioGroup>
  );
}

export function Shuffle({ onPress, busy = false }: { onPress(): void; busy?: boolean }) {
  return (
    <FilterIconButton data-entity-batch="" label="Show more" busy={busy} busyStyle="strand" icon={ShuffleIcon} onPress={onPress} />
  );
}

/** Video view: shuffle and, in the JAV context, the card layout; sort keys always go last, next to the group of content they describe. */
function VideoControls({ head, actions }: { head: EntityVideoHead; actions: EntityFilterActions }) {
  const view = useCatalogView();
  return (
    <span data-entity-sorts="">
      <Shuffle onPress={() => void actions.reshuffle()} />
      {head.jav && view === 'cards' ? (
        <Segments label="JAV card layout" value={head.jav.layout} options={head.jav.options} onChange={actions.setJavLayout} />
      ) : null}
      <CatalogViewToggle />
      <FolderBrowseToggle />
      <SortKeys sorts={head.sorts} onSort={actions.setSort} />
    </span>
  );
}

/** A row of sort keys. Direction is drawn only on the selected one: the arrow is both the current direction and the only hint that clicking again flips it.
 *  The accessible name announces what clicking will produce; the current state is conveyed separately by `aria-pressed` and by this arrow. */
export function SortKeys({ sorts, onSort }: { sorts: readonly EntitySortKey[]; onSort(key: string): void }) {
  return (
    <>
      {sorts.map((sort) => {
        return (
          <button key={sort.key} type="button" data-entity-sort={sort.key} data-entity-press=""
            aria-pressed={sort.pressed} aria-label={sort.ariaLabel || undefined} onClick={() => onSort(sort.key)}>
            {sort.label}{sort.pressed && sort.dir ? <IconSwap a={SortUpIcon} b={SortDownIcon} state={sort.dir === 'asc' ? 'a' : 'b'} className="size-(--icon-inline)" /> : null}
          </button>
        );
      })}
    </>
  );
}

/** The online view's bottom row, same as the follow page: shuffle, the image wall's multi-image layout and "images only", with sort keys last. */
function OnlineControls({ head, actions }: { head: EntityOnlineHead; actions: EntityFilterActions }) {
  return (
    <span data-entity-sorts="">
      <Shuffle onPress={actions.onlineShuffle} />
      {head.media === 'images' ? (
        <>
          <Segments label="Image layout" value={head.photoLayout} options={head.photoLayouts} onChange={actions.setPhotoLayout} />
          <button type="button" data-follow-images-only="" aria-pressed={head.imagesOnly} title="Images only"
            aria-label="Images only" onClick={() => actions.onlineImagesOnly(!head.imagesOnly)}>
            {head.imagesOnly ? <span data-view-glide="" aria-hidden="true" /> : null}
            <span className="contents" dangerouslySetInnerHTML={{ __html: icon('captions-off') }} />
          </button>
        </>
      ) : null}
      <SortKeys sorts={head.sorts} onSort={actions.onlineSort} />
    </span>
  );
}

/** The photo view: this row has no sort keys (the database only knows file name, size and source for images), just new batch and image layout,
 *  plus those two source-file keys inside a set. The new-batch key spins by itself while it waits for the new wall to come back. */
function PhotoControls({ head, actions, helpers }: {
  head: EntityPhotoHead; actions: EntityFilterActions; helpers: EntityFilterHelpers;
}) {
  const [shuffling, setShuffling] = useState(false);
  const tools = useRef<HTMLSpanElement>(null);
  const toolsHtml = head.back ? helpers.sourceToolsHtml(head.setId) : '';
  useEffect(() => { if (tools.current && toolsHtml) helpers.wireSourceTools(tools.current) }, [helpers, toolsHtml]);
  const shuffle = () => {
    setShuffling(true);
    actions.reshuffle().finally(() => setShuffling(false));
  };
  return (
    <span data-entity-sorts="">
      {head.shuffle ? <Shuffle onPress={shuffle} busy={shuffling} /> : null}
      <Segments label="Image layout" value={head.layout} options={head.layouts} onChange={actions.setPhotoLayout} />
      {toolsHtml ? <span ref={tools} data-entity-srctools="" dangerouslySetInnerHTML={{ __html: toolsHtml }} /> : null}
    </span>
  );
}
