/* 馆藏卡片网格：目录与回收站（由路由树画进 `#grid`）、资料页作品区、详情页的接着看。
 *
 * 取数、排法与续页都在这里；打开、选择、稍后看与回收站操作是壳递进来的动作。换筛选或壳要求
 * 重读时查询换键；筛选与排序控件常驻，等待新结果时只在网格铺共用骨架。
 * 内容与骨架交叉淡化；数据到达即可呈现，缓存命中时直接落内容。
 *
 * 网格每接一页经 `onCount` 报一次总数与显示的卡数，读数画在首页筛选条（`catalog-filter` 岛）的
 * 下排。无限滚动见下面的 `LoadMore`：哨兵进入视口下方一屏
 * 内自动取下一页，点它等于手动取；失败在哨兵后面留一条可重试的 Note，之后只有手动才重试。 */
import {
  Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode,
  type RefObject,
} from 'react';
import { useInfiniteQuery, useQuery, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { mixFace as mixArtwork, mixLabel, relayoutCovers, type Artwork } from '@peach/card-art';
import { isOverlayPath, peachHistory } from '@peach/history';
import { requestErrorMessage } from '@peach/legacy/core';
import { LOAD_MORE_STATUS, loadingDotsHtml } from '@peach/legacy/ui';

import { apiGet } from '../../api';
import { PLAYBACK_PROGRESS_EVENT, type PlaybackProgress } from '../../player/telemetry';
import { LOAD_MORE_MARGIN, RetryNote } from '../components/grid-reveal';
import { SkeletonContent } from '../components/skeleton-content';
import { cardRatio, MediaCard, type MediaCardVariant } from '../components/media-card';
import { MIX_FLIP_FACES, MixCard } from '../components/mix-card';
import {
  SHORTS_BATCH, arrangeTiles, catalogParams, catalogQuery, catalogSummary, collapseGroups, entityQuery, latestCatalogPages, mixHasPicture,
  replaceCatalogItem, shortsBoundaries, shortsParams, splitSections, type GridPage, type ShortsCut, type Tile,
} from './catalog-grid';
import type { CatalogGridProps, MediaCardLayout, MediaCardHelpers, MediaItem, MediaPage } from './types';
import { VideoWall } from '../video-wall/video-wall';
import { finiteWallFilters, wallHasCover } from '../video-wall/wall-layout';
import { wallEmptyHtml } from '../video-wall/wall-empty';
import { LibraryCompletionPrompt, meteredPreviewIds, missingPreviewIds } from '../library-processing/library-completion';
import { useCatalogView } from './catalog-view';
import { queryClient } from '../query';
import { CatalogListPage } from './catalog-list-page';

export function CatalogGridPage(props: CatalogGridProps) {
  const view = useCatalogView();
  if (props.mode === 'items') return <ItemsGrid {...props} />;
  const key = props.mode === 'entity'
    ? `entity:${props.entityKey || ''}:${props.revision}`
    : `catalog:${catalogParams(props.filters || {}, !!props.excludeVertical)}:${props.batchSize || 60}:${props.revision}`;
  if (view === 'list' && !props.wall) return <CatalogListPage key={key} {...props} />;
  const scope = props.mode === 'entity' ? 'entity' : `catalog:${!!props.wall}`;
  return <GridBody key={scope} {...props} />;
}

function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}

/** Meta info picks fixed or natural height based on the actual grid column count. */
function MediaGrid({ children, selectMode }: { children: ReactNode; selectMode?: boolean }) {
  const grid = useRef<HTMLDivElement>(null);
  const [single, setSingle] = useState(false);
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return;
    const measure = () => setSingle(getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length === 1);
    const observer = new ResizeObserver(measure);
    observer.observe(node);measure();
    return () => observer.disconnect();
  }, []);
  return <div ref={grid} data-media-grid="" data-catalog-view-mode="cards" data-single-column={single ? '' : undefined}
    data-select-mode={selectMode ? '' : undefined}>{children}</div>;
}

/** A batch the shell already holds (the details page's keep watching): no fetching, just draw the cards. The cards in the `next` row slot straight into the shell's horizontal row. */
function ItemsGrid(props: CatalogGridProps) {
  const { actions } = props;
  const onOpen = useCallback((item: MediaItem, anchor: HTMLElement) => actions.open(item, anchor), [actions]);
  const variant: MediaCardVariant = props.variant === 'next' ? 'next' : 'grid';
  const cards = (props.items || []).map((item) => (
    <MediaCard key={item.id} item={item} variant={variant} layout={props.layout}
      selected={props.selected.has(item.id)} selectMode={props.selectMode} seekSeconds={props.seekSeconds}
      helpers={props.helpers} actions={actions} onOpen={onOpen} />
  ));
  if (variant === 'next') return <div data-media-next-row="">{cards}</div>;
  return <MediaGrid selectMode={props.selectMode}>{cards}</MediaGrid>;
}

const readCovered = () => isOverlayPath(peachHistory.navigation.location.pathname);
const listenCovered = (notify: () => void) => peachHistory.listen(notify);

/** 详情或队列压在网格上时（真实地址是覆盖地址）网格停订：结果版本变了也不在背后把已加载的每一页重取一遍，
 *  看片期间后台任务每写一次账本就是一整轮。揭开那一刻，期间被失效过才重取一次。 */
function useCoveredPause(queryKey: QueryKey): boolean {
  const covered = useSyncExternalStore(listenCovered, readCovered);
  const was = useRef(covered);
  useEffect(() => {
    const uncovered = was.current && !covered;
    was.current = covered;
    if (uncovered && queryClient.getQueryState(queryKey)?.isInvalidated) {
      void queryClient.refetchQueries({ queryKey, exact: true });
    }
  }, [covered, queryKey]);
  return covered;
}

/** 心跳回执里的观看进度改写缓存里那张卡：心跳不推账本版本，网格不会为它重取。 */
function usePlaybackProgress(): void {
  useEffect(() => {
    const update = (event: Event) => {
      const { id, ...progress } = (event as CustomEvent<PlaybackProgress>).detail;
      replaceCatalogItem(id, progress);
    };
    document.addEventListener(PLAYBACK_PROGRESS_EVENT, update);
    return () => { document.removeEventListener(PLAYBACK_PROGRESS_EVENT, update) };
  }, []);
}

/** One query's full lifecycle: skeleton, first screen, continuation pages, the portrait strip and the numbers. */
function GridBody(props: CatalogGridProps) {
  const { helpers, actions, layout } = props;
  const entity = props.mode === 'entity';
  const trash = !entity && props.filters?.state === 'trash';
  const query = entity ? entityQuery(props) : catalogQuery(props);
  /* The profile page's first page is fetched by the shell and page header together: it lands synchronously into this epoch's cache, the first frame is already cards, and nothing is sent twice. */
  const [retained] = useState(() => props.wall ? latestCatalogPages(query.queryKey) : undefined);
  const queryIdentity = JSON.stringify(query.queryKey);
  const restored = useMemo(() => props.restoreNavigation ? latestCatalogPages(query.queryKey) : undefined,
    [queryIdentity, props.restoreNavigation]);
  const initialData = restored || retained || (entity && props.initial
    ? { pages: [{ ...props.initial, items: props.initial.items || [], offset: 0 }], pageParams: [0] }
    : undefined);
  const covered = useCoveredPause(query.queryKey);
  const result = useInfiniteQuery<GridPage, Error, InfiniteData<GridPage, number>, QueryKey, number>({
    queryKey: query.queryKey,
    queryFn: ({ pageParam, signal }) => query.queryFn({ pageParam, signal }),
    initialPageParam: 0,
    getNextPageParam: query.getNextPageParam,
    initialData,
    staleTime: entity || props.restoreNavigation ? Infinity : 0,
    refetchOnMount: entity && retained ? 'always' : false,
    subscribed: !covered,
  });
  usePlaybackProgress();
  const progressive = !entity && !trash && !props.wall;
  const summaryParams = catalogParams(props.filters || {}, !!props.excludeVertical);
  const summary = useQuery({
    queryKey: ['catalog-summary', summaryParams, props.revision || 0],
    queryFn: ({ signal }) => catalogSummary(summaryParams, signal),
    enabled: progressive && !!result.data,
  });

  /* Tell the shell once per settled fetch, success, empty, and failure alike: callers in the shell awaiting this re-read are released on it. */
  const settledRevision = useRef<number | null>(null);
  useEffect(() => {
    if (result.isPending || result.isPlaceholderData || settledRevision.current === props.revision) return;
    settledRevision.current = props.revision;
    props.settled?.(props.revision);
  }, [result.isPending, result.isPlaceholderData, props.revision]);

  const { tiles, pageStarts } = useMemo(() => arrangeTiles(result.data?.pages || [], {
    collapse: props.groupCollapse !== false, mix: !!props.mix && !trash, javImage: layout.javImage,
  }), [result.data, props.groupCollapse, props.mix, trash, layout.javImage]);
  const shown = tiles.reduce((count, tile) => count + (tile.kind === 'card' ? 1 : 0), 0);
  const total = Number(result.data?.pages[0]?.total ?? summary.data?.total ?? shown);
  const finiteWall = entity || finiteWallFilters(props.filters);
  const wallAvailable = !trash && !props.selectMode && !!actions.wallPlayer && !!actions.wallDetails;
  const wallItems = tiles.flatMap(tile => tile.kind === 'card' && wallHasCover(tile.item) ? [tile.item] : []);
  const wallPool = wallItems;
  const body = useRef<HTMLDivElement | null>(null);
  const cuts = useShortsStrips(props, result.isPlaceholderData ? undefined : result.data, tiles, pageStarts, body);
  /* 状态条数的是这一页画出来的全部卡：主网格加上插在中间的竖屏带。竖屏格只用视频帧，
     按帧图判断有没有图；筛竖屏时主网格本身也是竖屏格。 */
  const shownItems = tiles.flatMap(tile => tile.kind === 'card' ? [tile.item] : []);
  const shortItems = cuts.flatMap(cut => cut.items);
  const portrait = !!layout.portrait;
  const merge = (...lists: number[][]) => [...new Set(lists.flat())];
  const missing = trash ? [] : merge(missingPreviewIds(shownItems, layout.javImage, portrait),
    missingPreviewIds(shortItems, layout.javImage, true));
  const metered = trash ? [] : merge(meteredPreviewIds(shownItems, layout.javImage, portrait),
    meteredPreviewIds(shortItems, layout.javImage, true));

  /* Readouts are reported in a microtask: the shell rendering readouts also relays out the page header and selection state, a path that may hit the bulk bar's `flushSync`,
     which cannot render during the commit phase. Microtasks finish before the browser paints; if this generation has unmounted, skip the report. */
  useLayoutEffect(() => {
    if (!result.data || result.isPlaceholderData) return;
    if (progressive && !summary.data) return;
    let live = true;
    queueMicrotask(() => { if (live) props.onCount?.(total, shown) });
    return () => { live = false };
  }, [result.data, result.isPlaceholderData, total, shown, progressive, summary.data]);
  useEffect(() => { if (progressive && summary.isError) props.onCountFailed?.() }, [progressive, summary.isError]);
  const failed = !result.isPending && !result.data;
  useLayoutEffect(() => {
    if (!failed) return;
    let live = true;
    queueMicrotask(() => { if (live) props.onCountFailed?.() });
    return () => { live = false };
  }, [failed]);

  const open = useCallback((item: MediaItem, anchor: HTMLElement) => actions.open(item, anchor), [actions]);
  const openResource = useCallback(
    (item: MediaItem, anchor: HTMLElement) => actions.openResource(item, anchor), [actions]);
  const openShort = useCallback((item: MediaItem) => actions.openShort(item), [actions]);

  /* Continuation pages yield to background refetches: when the result version changes, the shell invalidates this query, and the infinite query refetches every page already appended in order. If a continuation page rides along,
     it must wait for all N pages to finish, and even then gains no new page. So continuation first stops the in-flight refetch and fetches the next page directly;
     the stopped refresh waits for the next result version change to make it up. */
  const loadNext = useCallback(async () => {
    const next = await result.fetchNextPage();
    if (next.isFetchNextPageError) throw next.error;
  }, [result.fetchNextPage]);

  const card = (tile: Tile) => tile.kind === 'mix'
    ? <HomeMix key={`mix:${tile.seed.id}`} seed={tile.seed} layout={layout} helpers={helpers} actions={actions} />
    : (
      <MediaCard key={tile.item.id} item={tile.item} grouped={props.groupCollapse !== false}
        variant={trash && tile.item.medium && tile.item.medium !== 'video' ? 'resource' : 'grid'} layout={layout}
        selected={props.selected.has(tile.item.id)} selectMode={props.selectMode} seekSeconds={props.seekSeconds}
        helpers={helpers} actions={actions} onOpen={trash ? openResource : open} />
    );

  const content = () => {
    if (wallAvailable && props.wall) return <VideoWall
      key={finiteWall ? 'finite' : 'explore'}
      sessionKey={entity ? `entity:${props.entityKey || ''}` : `catalog:${catalogParams(props.filters || {}, !!props.excludeVertical)}`}
      items={wallPool} finite={finiteWall} hasMore={!!result.hasNextPage} busy={result.isFetchingNextPage}
      loading={result.isPending || (!result.data && result.isFetching)}
      error={!result.data && !result.isPending ? requestErrorMessage(result.error) : ''}
      retry={() => void result.refetch()}
      emptyHtml={result.data && !wallPool.length ? wallEmptyHtml({
        libraryEmpty: !!result.data.pages[0]?.libraryEmpty, matches: total, hasMore: !!result.hasNextPage,
        catalogEmpty: props.emptyHtml?.({ trash, libraryEmpty: !!result.data.pages[0]?.libraryEmpty }),
      }) : ''}
      loadMore={loadNext} actions={actions} helpers={helpers} javImage={layout.javImage} />;
    if (result.isPending) return null;
    if (!result.data) {
      return <RetryNote message={requestErrorMessage(result.error)} onRetry={() => void result.refetch()} />;
    }
    if (!tiles.length) {
      const html = props.emptyHtml?.({ trash, libraryEmpty: !!result.data.pages[0]?.libraryEmpty }) || '';
      return <div data-media-empty="" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return (
      <>
        <div data-media-sections="" data-select-mode={props.selectMode ? '' : undefined}>
          {splitSections(tiles, cuts).map((section) => (
            <Fragment key={section.start}>
              <MediaGrid>{section.tiles.map(card)}</MediaGrid>
              {section.strip ? <ShortsStrip cut={section.strip} props={props} onOpen={openShort} /> : null}
            </Fragment>
          ))}
        </div>
        {result.hasNextPage
          ? <LoadMore key={result.data.pages.length} entity={entity} load={loadNext}
            enabled={() => !result.isPlaceholderData && props.canLoadMore?.() !== false} />
          : null}
      </>
    );
  };

  return (
    <div ref={body} data-media-body="" aria-busy={result.isFetching && !result.isFetchingNextPage}>
      <LibraryCompletionPrompt assetIds={missing} meteredIds={metered} />
      {props.wall ? content() : <SkeletonContent pending={result.isPending} skeletonHtml={props.skeletonHtml}>
        {content()}
      </SkeletonContent>}
    </div>
  );
}

/** Continuation pages. The catalog uses a sentinel that fetches itself when scrolled near; the profile page uses a "Load more" key; same criteria.
 *  Each appended page remounts once against the new key, and failure state does not cross pages. The profile page's photo wall and the follows page's paging use this key too; the follows page's key
 *  carries a glyph, with `children` replacing the key's label. */
export function LoadMore({ entity, load, enabled, children }: {
  entity: boolean; load: () => Promise<void>; enabled: () => boolean; children?: ReactNode;
}) {
  const node = useRef<HTMLElement | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const busy = useRef(false);
  const failed = useRef(false);
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  const latest = useRef({ load, enabled });
  latest.current = { load, enabled };
  const run = useCallback(async (manual: boolean) => {
    const el = node.current;
    if (busy.current || !el?.isConnected || el.closest('[inert]') || (!manual && failed.current) || !latest.current.enabled()) return;
    busy.current = true;
    failed.current = false;
    setState({ busy: true, error: '' });
    try {
      await latest.current.load();
      if (node.current) setState({ busy: false, error: '' });
    } catch (error) {
      failed.current = true;
      if (node.current) setState({ busy: false, error: requestErrorMessage(error) });
    } finally {
      busy.current = false;
    }
    /* When this pass did not attach a new page (for example it was merged into another fetch), the sentinel does not remount, and a sentinel that stayed in the viewport receives
       no further intersection notifications: observe it once more so the observer re-evaluates at the current position. */
    const watching = observer.current;
    if (!failed.current && watching && node.current?.isConnected) {
      watching.unobserve(node.current);
      watching.observe(node.current);
    }
  }, []);
  const attach = useCallback((el: HTMLElement | null) => { node.current = el }, []);
  useEffect(() => {
    const el = node.current;
    if (!el) return undefined;
    const watching = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void run(false);
    }, { rootMargin: LOAD_MORE_MARGIN });
    observer.current = watching;
    watching.observe(el);
    return () => { watching.disconnect(); observer.current = null };
  }, [run]);
  const aria = state.busy ? { 'aria-busy': true, 'aria-disabled': true } as const : {};
  return (
    <>
      {entity
        ? <button ref={attach} type="button" data-entity-more="" {...aria} onClick={() => void run(true)}>{children ?? 'Load more'}</button>
        /* On failure only the retry below remains: the sentinel collapses but never unmounts, and once the retry succeeds it keeps paging as before. */
        : <div ref={attach} data-load-more="" {...aria} hidden={Boolean(state.error)} onClick={() => void run(true)}
          dangerouslySetInnerHTML={{ __html: loadingDotsHtml(LOAD_MORE_STATUS) }} />}
      {state.error ? <RetryNote message={state.error} onRetry={() => void run(true)} /> : null}
    </>
  );
}

/** The portrait strip: each page appended requests one strip, and the landing point randomly picks a row boundary among the rows this page added.
 *  Requests follow the main list's filter and sort; with no strips at all, or when this page yields no row boundary, the offset resets or stays put per the legacy layer.
 *  Volumes and editions collapse under the same toggle as the main grid (`collapseGroups`); a group spanning several strips keeps only its first appearance. */
function useShortsStrips(
  props: CatalogGridProps, data: InfiniteData<GridPage, number> | undefined,
  tiles: readonly Tile[], pageStarts: readonly number[], body: RefObject<HTMLElement | null>,
): ShortsCut[] {
  type Saved = { cuts: ShortsCut[]; offset: number; handled: number };
  const cacheKey = ['catalog-short-layout', catalogParams(props.filters || {}, !!props.excludeVertical)];
  const stamp = `${cacheKey[1]}:${props.revision}`;
  const create = () => {
    const saved = props.restoreNavigation ? queryClient.getQueryData<Saved>(cacheKey) : undefined;
    const groups = { parts: new Set<string>(), editions: new Set<string>() };
    if (saved) collapseGroups(saved.cuts.flatMap(cut => cut.items), groups, props.groupCollapse !== false);
    return { stamp, cuts: saved?.cuts || [], offset: saved?.offset || 0, handled: saved?.handled || 0,
      groups, controllers: [] as AbortController[] };
  };
  const run = useRef<ReturnType<typeof create> | null>(null);
  if (!run.current) run.current = create();
  const [cutState, setCutState] = useState(() => ({ stamp, cuts: run.current!.cuts }));
  const [arrived, setArrived] = useState<{ stamp: string; page: number; total: number; items: MediaItem[]; more: boolean } | null>(null);
  if (run.current.stamp !== stamp) {
    run.current = create();
    setCutState({ stamp, cuts: run.current.cuts });
    setArrived(null);
  }
  const own = run.current;
  const cuts = cutState.cuts;
  useEffect(() => () => own.controllers.forEach(controller => controller.abort()), [own]);
  useEffect(() => {
    const pages = data?.pages.length || 0;
    if (!props.shorts || own.handled >= pages) return;
    own.handled = pages;
    const controller = new AbortController();
    own.controllers.push(controller);
    const page = pages - 1;
    apiGet<MediaPage>(`/api/items?${shortsParams(props.filters || {}, own.offset)}`, controller.signal)
      .then((strip) => {
        if (run.current !== own || controller.signal.aborted) return;
        const items = strip.items || [];
        if (!items.length) { own.offset = 0; return }
        setArrived({ stamp, page, total: Number(strip.total || 0), items, more: strip.has_more !== false });
      })
      /* The portrait strip is inserted bonus content: skip it when it cannot be fetched and the main list carries on as usual. */
      .catch(() => {});
  }, [data, own]);
  useLayoutEffect(() => {
    if (!arrived || arrived.stamp !== stamp) return;
    setArrived(null);
    const start = cuts.reduce((at, cut) => Math.max(at, cut.at), 0);
    const sections = body.current?.querySelectorAll<HTMLElement>('[data-media-sections] > [data-media-grid]');
    const last = sections?.[sections.length - 1];
    const columns = last ? Math.max(1, getComputedStyle(last).gridTemplateColumns.split(' ').length) : 1;
    const addedFrom = Math.max(0, (pageStarts[arrived.page] ?? 0) - start);
    const boundaries = shortsBoundaries(tiles.length - start, addedFrom, columns);
    if (!boundaries.length) return;
    /* Collapse only once the anchor is decided: a batch that yields no anchor is refetched at the same offset next time and must not be recorded as seen yet. */
    const items = collapseGroups(arrived.items, own.groups, props.groupCollapse !== false);
    own.offset = arrived.more ? own.offset + SHORTS_BATCH : 0;
    if (!items.length) return;
    const at = start + (boundaries[Math.floor(Math.random() * boundaries.length)] ?? 0);
    const next = [...cuts, { at, total: arrived.total, items }];
    own.cuts = next;
    queryClient.setQueryData<Saved>(cacheKey, { cuts: next, offset: own.offset, handled: own.handled });
    setCutState({ stamp, cuts: next });
  }, [arrived]);
  return cuts;
}

function ShortsStrip({ cut, props, onOpen }: {
  cut: ShortsCut; props: CatalogGridProps; onOpen: (item: MediaItem) => void;
}) {
  const row = useRef<HTMLDivElement | null>(null);
  const { wireDrag } = props;
  useEffect(() => { if (row.current) wireDrag(row.current) }, [wireDrag]);
  return (
    <section data-shorts-strip="">
      <h2>
        Portrait <span data-shorts-count="">{`${cut.total.toLocaleString()} items`}</span>
        <button type="button" data-shorts-enter="" onClick={() => props.actions.openShorts()}>
          <Icon name="gallery-vertical-end" /><span>Enter immersive mode</span>
        </button>
      </h2>
      <div ref={row} data-shorts-row="">
        {cut.items.map((item) => (
          <MediaCard key={item.id} item={item} variant="short" layout={props.layout} grouped={props.groupCollapse !== false}
            selected={props.selected.has(item.id)} selectMode={props.selectMode} seekSeconds={props.seekSeconds}
            helpers={props.helpers} actions={props.actions} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

/** One face of a Mix: with the code layout on, coded videos pick large or small per this screen, everything else always takes small. */
function mixFace(item: MediaItem, layout: MediaCardLayout, eager: boolean): Artwork {
  return mixArtwork(item, layout.active && item.is_jav ? layout.size : 'small', eager, layout.javImage);
}

/** The Mix at position 8 of every catalog page: similar videos headed by the seeded one. The whole card is the click target, and hovering flips through the stack one by one. */
function HomeMix({ seed, layout, helpers, actions }: {
  seed: MediaItem; layout: MediaCardLayout; helpers: MediaCardHelpers; actions: CatalogGridProps['actions'];
}) {
  const faces = useRef(new Map<string, string>());
  const latest = useRef(layout);
  latest.current = layout;
  const label = mixLabel(seed, helpers.tagLabel);
  const flipImages = useCallback(async () => {
    const current = latest.current;
    const related = await actions.mixRelated(seed.id);
    const list = [seed, ...related].filter((item) => mixHasPicture(item, current.javImage)).slice(0, MIX_FLIP_FACES);
    faces.current = new Map(list.map((item) => [String(item.id), mixFace(item, current, true).html]));
    return list.map((item) => String(item.id));
  }, [seed, actions]);
  const jav = layout.active && !!seed.is_jav;
  const size = jav ? layout.size : 'small';
  const artwork = mixFace(seed, layout, false);
  return (
    <MixCard data-mix-seed={String(seed.id)} name={`Mix · ${label}`}
      caption={`${helpers.displayName(seed, seed.name || '')} and similar videos`} count={0} badge="Mix" glyph wholeCard
      poster={null} artwork={artwork}
      artworkIdentity={size === 'small' ? artwork.html : mixFace(seed, { ...layout, size: 'small' }, false).html}
      relayoutArt={(root) => relayoutCovers(root, size)}
      ratio={cardRatio(seed, 'grid', layout)}
      flipImages={flipImages} faceHtml={(id) => faces.current.get(id) || ''} canFlip={actions.canFlip}
      faces={[]} onOpenEntity={actions.openEntity}
      onOpen={(anchor) => actions.openMix(seed.id, anchor)} openLabel={`Open Mix · ${label}`} />
  );
}
