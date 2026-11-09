/* The whole block above the home grid: two avatar rows (performers, labels) plus a two-row glass overlay (top: four view keys
 * and tags; bottom: readout, Shuffle, card layout and sort keys), plus the intersection bar above the grid in the body.
 *
 * All state lives in the shell: filters, current view, sort, members and readouts arrive as props; clicks return to the shell,
 * and the shell pushes a new pressed state before sending the request, so `aria-pressed` and the sliding glass are in place
 * immediately, without waiting for this fetch.
 *
 * Adding a filter does not re-render these rows: members (`tiers.key` and the tag order) are unchanged, React only changes
 * pressed states, and a row scrolled to its sixtieth person and parked at pixel 600 stays as it is. When the basis changes or
 * a new batch arrives, the shell provides a new `tiers.key` and both rows lay out from the start. While the details popover is
 * open the shell pushes nothing, and closing returns to the same batch of nodes (why is explained in the `buildBars` comment). */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { entityDisplayName } from '../../core/entity-names';
import { useEntityNames } from '../use-entity-names';
import { popBadges } from '@peach/legacy/ui';
import { AsyncText } from '../components/async-text';

import { FilterGlassRows, FilterPill } from '../components/filter-glass';
import { useViewGlide } from '../components/use-view-glide';
import { LibraryShortcuts } from '../library-shortcuts/shortcut-controls';
import { FolderBrowseToggle } from '../catalog-folders/catalog-folders-page';
import { useCatalogView } from '../catalog-grid/catalog-view';
import { CatalogViewToggle } from '../catalog-grid/catalog-view-toggle';
import { Combo, Segments, Shuffle, SortKeys } from '../entity-filter/entity-filter-page';
import {
  EMPTY_SLOTS, ROW_AHEAD, ROW_BATCH, ROW_FIRST, rememberedTiers, rememberTiers, type CatalogFilterProps,
  type CatalogTag, type TierKind, type TierPerformer, type TierStudio,
} from './catalog-filter';

export function CatalogFilterPage(props: CatalogFilterProps) {
  const loading = !props.tiers;
  const combo = useComboHost(props.comboHost);
  /* When collapsed (profile, index, and manage pages) only the two avatar rows remain: returning to the home page of the same scope keeps that batch as is, without re-laying or re-fetching images.
     The overlay's two rows and the profile/index pages' overlays are the same components with the same props; keeping a hidden copy on the page means two same-named control sets. */
  return (
    <div data-catalog-root="" data-loading={loading || undefined} data-refreshing={props.refreshing || undefined}
      className="contents">
      {combo ? createPortal(<Combo items={props.combo} hidden={props.comboHidden} actions={props.actions} />, combo) : null}
      <Tiers {...props} />
      {props.offscreen ? null : <Glass {...props} />}
    </div>
  );
}

/** The glass overlay's two rows: the top row holds four views and tags, the bottom row holds the readout, shuffle, layout and sort buttons. */
function Glass(props: CatalogFilterProps) {
  const { actions, helpers } = props;
  const pane = useRef<HTMLSpanElement>(null);
  const viewRow = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const tagRow = useRef<HTMLDivElement>(null);
  const bottomRow = useRef<HTMLDivElement>(null);
  const [singleRow, setSingleRow] = useState(false);
  const glide = useViewGlide(pane, viewRow, '[data-catalog-view][aria-pressed="true"]', props.state);

  /* The tags cell is `overflow-x:auto` with a hidden scrollbar, out of the mouse's reach, so it registers the site-wide horizontal-row drag-and-wheel mapping.
     On narrow screens the outer layer scrolls (the view moves with it) and both layers register; the bottom row scrolls as one strip on narrow screens, same setup. */
  useEffect(() => {
    helpers.wireDrag(tagRow.current);
    helpers.wireScroller(scroll.current);
    helpers.wireDrag(bottomRow.current);
  }, [helpers]);

  const loading = !props.tiers;
  const tags = usePaged(tagRow, props.tags, props.tiers?.key ?? '', props.tagFirst);
  useLayoutEffect(() => {
    // First load uses a two-row placeholder; refreshing with existing content reuses the measured layout, not re-wrapping lines at the skeleton width.
    if (loading) { setSingleRow(false); return }
    if (props.tiersPending || props.count === null) return;
    const frame = scroll.current?.closest<HTMLElement>('[data-catalog-frame]');
    if (!frame) return;
    const width = (element: HTMLElement | null) => {
      if (!element) return 0;
      const style = getComputedStyle(element);
      return [...element.children].reduce((total, child) => total + child.getBoundingClientRect().width, 0)
        + Math.max(0, element.children.length - 1) * (parseFloat(style.columnGap) || 0);
    };
    const measure = () => setSingleRow(frame.clientWidth >= width(viewRow.current) + width(tagRow.current)
      + width(bottomRow.current) + 64);
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    measure();
    return () => observer.disconnect();
  }, [loading, props.tiersPending, tags, props.count, props.layout, props.sorts]);
  /* Only the count badges whose value changed pop (legacy layer `popBadges`, judged by the previous value, not by whether the node is new). */
  useLayoutEffect(() => { popBadges(tagRow.current, 'tagbar') }, [tags]);

  return (
    <FilterGlassRows label="Filter and sort" topLabel="Views and tags"
      attrs={{ 'data-filter-frame': '', 'data-catalog-frame': '', ...(singleRow ? { 'data-single-row': '' } : {}) }}
      className="mx-4" topClassName="gap-1.5 overflow-visible" bottomClassName={props.trash ? 'hidden' : 'min-h-12'}
      bottomRef={bottomRow} busy={props.count === null || props.refreshing}
      panes={<span ref={pane} data-view-glide="" aria-hidden="true" />}
      top={
        <div ref={scroll} data-catalog-scroll="">
          <div ref={viewRow} role="group" aria-label="View" data-catalog-views="" onPointerLeave={glide.leave}>
            {props.views.map((view) => (
              <a key={view.k} href={view.href} data-catalog-view={view.k} data-entity-press=""
                aria-pressed={props.state === view.k} onPointerEnter={glide.hover}
                onClick={(event) => { event.preventDefault(); actions.setView(view.k) }}>
                {view.label}
              </a>
            ))}
            <span data-entity-sep="" aria-hidden="true" />
          </div>
          <div ref={tagRow} data-catalog-tags="">
            {props.empty || loading ? <Placeholders kind="tag" /> : null}
            {tags.map((tag) => <TagPill key={tag.k} tag={tag} pending={props.tiersPending} onPress={actions.toggleTag} />)}
          </div>
        </div>
      }
      bottom={props.trash ? null : <Head {...props} />}
    />
  );
}

function TagPill({ tag, pending, onPress }: { tag: CatalogTag; pending: boolean; onPress(tag: string): void }) {
  return (
    <FilterPill data-catalog-tag={tag.k} data-entity-press="" pressed={tag.selected} onPress={() => onPress(tag.k)}>
      <AsyncText text={tag.label} busy={pending} />
      {tag.n == null ? null : <span data-count-badge={tag.k}>{tag.n.toLocaleString()}</span>}
    </FilterPill>
  );
}

/** Two avatar rows. An empty row still takes 28px and renders as a bare empty band, so when there is nobody, that row is not drawn. */
function Tiers(props: CatalogFilterProps) {
  useEntityNames();
  const { actions, helpers } = props;
  const tiers = props.tiers ?? { key: '', performers: [], studios: [] };
  const loading = !props.tiers;
  const empty = props.empty || loading;
  const performers = useRef<HTMLDivElement>(null);
  const studios = useRef<HTMLDivElement>(null);
  const more = useCallback((kind: TierKind) => () => actions.moreTops(kind), [actions]);
  /* The placeholder rows have no next page to fetch. */
  const shownPerformers = usePaged(performers, tiers.performers, tiers.key, ROW_FIRST,
    empty ? undefined : more('performers'));
  const shownStudios = usePaged(studios, tiers.studios, tiers.key, ROW_FIRST, empty ? undefined : more('studios'));
  /* Before the fetch lands, draw the placeholder against this machine's last structure, the same record as the shell skeleton. */
  const shape = useMemo(() => loading ? rememberedTiers() : null, [loading]);
  const hasPerformers = shape ? shape.performers : props.empty || tiers.performers.length > 0;
  const hasStudios = shape ? shape.studios : props.empty || tiers.studios.length > 0;
  useEffect(() => {
    if (!loading) rememberTiers({ performers: hasPerformers, studios: hasStudios });
  }, [loading, hasPerformers, hasStudios]);
  useEffect(() => {
    helpers.wireDrag(performers.current);
    helpers.wireDrag(studios.current);
  }, [helpers, hasPerformers, hasStudios]);
  return (
    <div data-catalog-tiers="" hidden={!hasPerformers && !hasStudios}
      aria-busy={(loading && props.tiersPending && !props.offscreen) || undefined}>
      {hasPerformers ? (
        <div ref={performers} data-catalog-tier="performers">
          {empty ? <Placeholders kind="performer" /> : (shownPerformers as TierPerformer[]).map((person) => (
            <button key={person.name} type="button" data-tier-performer="" data-entity-kind="performer"
              data-entity-name={person.name} onClick={() => actions.openEntity('performer', person.name)}>
              <span data-tier-ring="" dangerouslySetInnerHTML={{ __html: person.ringHtml }} />
              <span data-tier-name=""><AsyncText text={entityDisplayName('performer', person.name)} busy={props.tiersPending} /></span>
            </button>
          ))}
        </div>
      ) : null}
      {hasStudios ? (
        <div ref={studios} data-catalog-tier="studios">
          {empty ? <Placeholders kind="studio" /> : (shownStudios as TierStudio[]).map((studio) => (
            <button key={studio.name} type="button" data-tier-studio="" data-entity-kind="studio"
              data-entity-name={studio.name} onClick={() => actions.openEntity('studio', studio.name)}>
              <StudioMark studio={studio} /><AsyncText text={studio.name} busy={props.tiersPending} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Label logo. The only remaining fallback is "installed but unreadable": the file is broken, or normalization missed it, or the image is too small to make out;
 *  when no logo is installed the shell does not hand out an address at all, and this image never renders. */
function StudioMark({ studio }: { studio: TierStudio }) {
  const [broken, setBroken] = useState(false);
  return (
    <span data-tier-mark="">
      {studio.logo && !broken ? (
        <img src={studio.logo} alt="" width={28} height={28} loading="lazy" decoding="async" onError={() => setBroken(true)}
          onLoad={(event) => { if (event.currentTarget.naturalWidth < 32) setBroken(true) }} />
      ) : studio.fallback}
    </span>
  );
}

/** The empty-library placeholder: 64 cells per row, clipped by the container to the available width. It is not a control and receives no pointer events. */
function Placeholders({ kind }: { kind: 'performer' | 'studio' | 'tag' }) {
  const slots = Array.from({ length: EMPTY_SLOTS }, (_, index) => index);
  if (kind === 'tag') {
    return <span data-catalog-placeholder="tag" aria-hidden="true">{slots.map((i) => <span key={i} />)}</span>;
  }
  return (
    <>
      {slots.map((i) => (kind === 'performer' ? (
        <span key={i} data-catalog-placeholder="performer" aria-hidden="true"><span /><span>&nbsp;</span></span>
      ) : (
        <span key={i} data-catalog-placeholder="studio" aria-hidden="true"><span /><span>&nbsp;</span></span>
      )))}
    </>
  );
}

/** Bottom row: numbers, shuffle, layout and sort. Trash does not show this row. */
function Head({ count, refreshing, layout, sorts, actions }: CatalogFilterProps) {
  const view = useCatalogView();
  const [shuffling, setShuffling] = useState(false);
  const shuffle = () => {
    setShuffling(true);
    actions.reshuffle().finally(() => setShuffling(false));
  };
  return (
    <>
      <span data-catalog-summary=""><Readout count={count} /><LibraryShortcuts currentHref={actions.currentHref} /></span>
      <span data-entity-sorts="">
        <Shuffle onPress={shuffle} busy={shuffling || refreshing} />
        {/* Keys swapped by name: one group each for JAV and home, and React Aria's radio group does not change `name` once mounted. */}
        {layout && view === 'cards' ? <Segments key={layout.name} name={layout.name} label={layout.label} value={layout.value} options={layout.options}
          onChange={actions.setLayout} /> : null}
        <CatalogViewToggle />
        <FolderBrowseToggle />
        <SortKeys sorts={sorts} onSort={actions.setSort} />
      </span>
    </>
  );
}


/** While a reading loads, only the text is replaced; the filter box and action controls stay in place. */
function Readout({ count }: { count: CatalogFilterProps['count'] }) {
  const text = count ? `${count.total.toLocaleString()} matches · showing ${count.shown.toLocaleString()}`
    : count === false ? '' : undefined;
  return <span data-catalog-readout="" data-count-readout="" role="status">
    <AsyncText text={text} busy={count === null} placeholder={<span data-skeleton="count" aria-hidden
      className="relative inline-block h-3.5 w-37.5 rounded-md align-middle skeleton-sheen" />} />
  </span>;
}

/** The intersection bar's host: another `.peach-react` layer built inside `#combo` because style scoping needs it. Removed on unmount, with the row itself handed back to the shell. */
function useComboHost(row: Element | null): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!row) return undefined;
    const el = row.ownerDocument.createElement('div');
    el.className = 'peach-react';
    row.replaceChildren(el);
    setHost(el);
    return () => { el.remove(); setHost(null) };
  }, [row]);
  return host;
}

interface Page<T> { key: string; limit: number; fetched: T[]; drained: boolean }

/** A row lays out `first` cells, and after horizontally scrolling to within 320px of the right end appends 12 more, until this row truly overflows: on wide screens one batch
 *  may not fill a line, and without overflow there is no scrolling, and without scrolling there is no second `scroll` event to continue appending. After the batch on hand runs out, request the next page via
 *  `more`; an empty response means the end. When `key` changes, start over from the top. */
function usePaged<T>(row: RefObject<HTMLElement | null>, items: T[], key: string, first: number,
  more?: () => Promise<unknown[]>): T[] {
  const initial = (): Page<T> => ({ key, limit: first, fetched: [], drained: !more });
  const [page, setPage] = useState(initial);
  const current = page.key === key ? page : initial();
  if (current !== page) setPage(current);
  const all = useMemo(() => (current.fetched.length ? items.concat(current.fetched) : items),
    [items, current.fetched]);
  const fetching = useRef<string | null>(null);
  const state = useRef({ current, all, more });
  state.current = { current, all, more };
  const fill = useCallback(() => {
    const el = row.current;
    const { current: now, all: list, more: next } = state.current;
    if (!el || !el.clientWidth || el.scrollLeft + el.clientWidth < el.scrollWidth - ROW_AHEAD) return;
    if (now.limit < list.length) {
      setPage((p) => (p.key === now.key ? { ...p, limit: p.limit + ROW_BATCH } : p));
      return;
    }
    if (now.drained || !next || fetching.current === now.key) return;
    fetching.current = now.key;
    /* While waiting for the next page the person is still scrolling; `fetching` blocks re-entry with the same list so no page is requested twice. Recorded by `key`:
     * when the list changes while the old list's page is still in flight, the new list still pages on, otherwise the old response returns, gets dropped, and the row stops at page one. */
    void next().catch(() => []).then((rows) => {
      if (fetching.current === now.key) fetching.current = null;
      setPage((p) => {
        if (p.key !== now.key) return p;
        return rows.length ? { ...p, fetched: p.fetched.concat(rows as T[]) } : { ...p, drained: true };
      });
    });
  }, [row]);
  /* Width measuring is coalesced into the next frame: measuring right after commit or on every `scroll` event lands right behind freshly written styles,
   *  and each one forces a whole-tree recompute; horizontal scrolling fires several `scroll` events per frame, and one measurement is enough. */
  const frame = useRef(0);
  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; fill() });
  }, [fill]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useLayoutEffect(schedule);
  useEffect(() => {
    const el = row.current;
    el?.addEventListener('scroll', schedule, { passive: true });
    return () => el?.removeEventListener('scroll', schedule);
  });
  return all.slice(0, current.limit);
}
