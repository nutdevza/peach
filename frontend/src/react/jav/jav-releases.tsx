/* JAV page "New releases" section: everything discovered through follows that hasn't been added to the library yet, paginated by release date descending.
 * The actress and label rows and the tag strip list only what appears in this batch of new releases (facets from `/api/jav/releases`); clicking filters within this section,
 * no navigation to the entity page; both the filter and the page number are written to the address bar. */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RiRssLine } from '@remixicon/react';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import { esc, firstGrapheme, leadingGraphemes } from '@peach/legacy/core';
import { appSettingsStore, javLayout, storeJavLayout, JAV_LAYOUTS, cardRatio, gridLayout } from '@peach/appearance';
import { entityFaceImg, facePos, logoUrl } from '@peach/card-art';
import { wireHorizontalScroller } from '../../ui-kit/scroll';
import { javContentSkeleton, javTagSkeleton, JAV_RECOMMENDATION_GRID } from '../../jav-skeleton';
import { tierPlaceholdersHtml } from '../../catalog-filter-skeleton';
import { errorMessage } from '../../api';
import { entityDisplayName } from '../../core/entity-names';
import type { DownloadPrefill } from '../activity/cloud-download-dialog';
import { Note } from '../components/note';
import { CoverQueue } from '../components/cover-queue';
import { TaskProgress } from '../components/task-progress';
import { EmptyState } from '../components/empty-state';
import { DataTableFooter } from '../components/table-controls';
import { FilterGlassRows, FilterPill, GlassPill } from '../components/filter-glass';
import { Segments, Shuffle, SortKeys } from '../entity-filter/entity-filter-page';
import { Chip } from '@/components/base/badges/chip';
import { recommendationScore, RELEASE_SORTS, type DiscoveryDirection, type ReleaseSort } from './discovery-sorts';
import { addWant, invalidateWants } from '../wants/wants';
import { useAction } from '../settings/use-action';
import { useEntityNames } from '../use-entity-names';
import { DiscoveryCard, resourcePrefill } from './discovery-card';
import { controlReleaseMetadata, coverArrived, DISCOVERY_METADATA_KEY, DISCOVERY_REFRESH_MS, fetchCoverNow, fetchDiscoveryMetadata, fetchReleases,
  releaseFilters, releaseKey, RELEASE_PAGE_SIZE, RELEASE_PAGE_SIZES,
  type Discovery, type DiscoveryMetadataStatus, type ReleaseFacetPerformer, type ReleaseFacetStudio, type ReleaseFilters,
  writeJavQuery } from './jav';
import { queryClient } from '../query';
import { ReleaseTable } from './jav-release-table';
import { CatalogViewToggle } from '../catalog-grid/catalog-view-toggle';
import { useCatalogView } from '../catalog-grid/catalog-view';
import { useVisibleJavWorks } from './jav-selection';

type Facet = 'performer' | 'studio' | 'tag';
/** The placeholder of two rows of avatars while waiting for data, the same copy as the route skeleton (releasesFilterSkeleton). */
const TIER_PLACEHOLDERS = `<div data-catalog-tier="performers" data-skeleton="tiers">${tierPlaceholdersHtml('performer')}</div><div data-catalog-tier="studios">${tierPlaceholdersHtml('studio')}</div>`;

const performerRing = (person: ReleaseFacetPerformer) =>
  `<span data-tier-initial>${esc(firstGrapheme(entityDisplayName('performer', person.name, person.id)))}</span>${entityFaceImg({
    id: person.id, hasImage: person.has_image, version: person.image_version, style: facePos(person.avatar_focus),
    focus: person.avatar_focus, standIn: person.avatar_stand_in })}`;

/** When sorted by taste, that recommendation tier on the card uses the same tiers as “Discover”. */
function TasteChip({ value }: { value?: number | null }) {
  const recommendation = recommendationScore(value);
  return <span data-jav-taste-score="" title={`Taste ${recommendation.score}`}><Chip color={recommendation.color}>{recommendation.label}</Chip></span>;
}

function StudioMark({ studio }: { studio: ReleaseFacetStudio }) {
  const [broken, setBroken] = useState(false);
  return <span data-tier-mark="">
    {studio.has_logo && !broken ? <img src={logoUrl(studio.name, 'icon', studio.logo_version)} alt="" width={28} height={28}
      loading="lazy" decoding="async" onError={() => setBroken(true)} /> : leadingGraphemes(studio.name, 2)}
  </span>;
}

/** 本页一键插队当场取一部：取到就补进已取回的数据（`coverArrived`），卡片换成本机那张。 */
const fetchReleaseCover = (code: string) => fetchCoverNow(code).then(result => {
  if (result.has_cover) coverArrived(code, result);
  return result.has_cover;
});

export function Releases({ readOnly, receipt, resource, query, navigate, clearText }: {
  readOnly: boolean; receipt(message: string): void; resource(work: DownloadPrefill): void; query: string;
  navigate(path: string): void; clearText(): void;
}) {
  useEntityNames();
  const [filters, setFilters] = useState<ReleaseFilters>(() => releaseFilters(location.search));
  /* The page header's IndexSearch waits 300 ms of idle before emitting text; here when it changes, return to page 1 and ask the server again. */
  useEffect(() => {
    if (query === filters.q) return;
    setFilters(current => ({ ...current, q: query, page: 1 }));
    writeJavQuery({ page: '' });
  }, [query, filters.q]);
  const choose = (facet: Facet, value: string) => {
    const next = filters[facet] === value ? '' : value;
    setFilters(current => ({ ...current, [facet]: next, page: 1 }));
    writeJavQuery({ [facet]: next, page: '' });
  };
  const section = useRef<HTMLElement>(null);
  const changePage = ({ pageIndex, pageSize }: { pageIndex: number; pageSize: number }) => {
    const page = pageIndex + 1;
    setFilters(current => ({ ...current, page, size: pageSize }));
    writeJavQuery({ page: page > 1 ? String(page) : '', size: pageSize === RELEASE_PAGE_SIZE ? '' : String(pageSize) });
    section.current?.scrollIntoView({ block: 'start' });
  };
  const clear = () => {
    setFilters(current => ({ ...current, performer: '', studio: '', tag: '', q: '', page: 1 }));
    writeJavQuery({ performer: '', studio: '', tag: '', page: '' });
    clearText();
  };
  /* Clicking the selected one flips its direction; switching to a different one defaults the code to ascending and the rest to descending (same as “Discover”). */
  const sortBy = (key: ReleaseSort) =>
    setSort(key, key === filters.sort ? (filters.dir === 'asc' ? 'desc' : 'asc') : key === 'code' ? 'asc' : 'desc');
  /* In list mode, the table header states the sort direction directly. */
  const setSort = (key: ReleaseSort, dir: DiscoveryDirection) => {
    setFilters(current => ({ ...current, sort: key, dir, seed: '', page: 1 }));
    writeJavQuery({ sort: key === 'release_date' ? '' : key, dir: dir === 'asc' ? 'asc' : '', seed: '', page: '' });
  };
  /* New batch: the same batch of new releases is reshuffled with a new seed, and the order stays the same when paging; the sort keys are no longer pressed. */
  const reshuffle = () => {
    const seed = Math.random().toString(36).slice(2, 10);
    setFilters(current => ({ ...current, sort: 'random', dir: 'desc', seed, page: 1 }));
    writeJavQuery({ sort: 'random', dir: '', seed, page: '' });
  };
  useEffect(() => {
    const rows = section.current?.querySelectorAll('[data-catalog-tier],[data-catalog-tags],[data-filter-row="bottom"]');
    const scrollers = [...(rows || [])].map(row => wireHorizontalScroller(row, { drag: true }));
    return () => scrollers.forEach(scroller => scroller.destroy());
  }, []);
  const settings = appSettingsStore();
  useSyncExternalStore(settings.subscribe, settings.version, settings.version);
  const layout = javLayout();
  /* Card / list uses the same toggle as the library (peach.catalog-view.v1): the JAV page's library and new releases switch together. */
  const view = useCatalogView();
  const ratio = cardRatio(gridLayout({ active: true, home: false, portrait: false }));
  /* 新作列表只读：每问一次都把全部候选重算一遍，不拿它当进度轮询。还没读过来源资料的那几部由
     「读取资料」起一轮（与「发现」共用一个任务），进度单独轮询；读的期间列表隔 `DISCOVERY_REFRESH_MS`
     才重取一次，跑完再取一次，标签与筛选项补全。 */
  const readingNow = useRef(false);
  const releases = useQuery({ queryKey: releaseKey(filters), queryFn: ({ signal }) => fetchReleases(filters, signal),
    placeholderData: keepPreviousData, retry: false, refetchOnWindowFocus: false,
    refetchInterval: () => (readingNow.current ? DISCOVERY_REFRESH_MS : false) });
  const listedJob = releases.data?.metadata_job;
  const listedRunning = useRef(false);
  listedRunning.current = listedJob?.status === 'running';
  const polled = queryClient.getQueryData<DiscoveryMetadataStatus>(DISCOVERY_METADATA_KEY)?.metadata_job;
  /* 进度只在有一轮在跑时轮询：列表带回来的、或起读回执写进来的那一轮。 */
  const progress = useQuery({ queryKey: DISCOVERY_METADATA_KEY, retry: false, refetchOnWindowFocus: false,
    enabled: listedJob?.status === 'running' || polled?.status === 'running',
    queryFn: ({ signal }) => fetchDiscoveryMetadata(signal),
    refetchInterval: current => current.state.data?.metadata_job?.status === 'running' || listedRunning.current
      ? Math.max(1000, current.state.data?.poll_after_ms || 3000) : false });
  // 两处谁新用谁：进度轮询与起读的回执写在进度那份里，列表重取时也带回当前任务。
  const metadata = progress.data && progress.dataUpdatedAt >= releases.dataUpdatedAt
    ? progress.data.metadata_job : listedJob;
  const reading = metadata?.status === 'running';
  readingNow.current = reading;
  const wasReading = useRef(false);
  useEffect(() => {
    if (wasReading.current && !reading) void releases.refetch();
    wasReading.current = reading;
  }, [reading, releases]);
  /* 筛选结果里有从没读过的就起一轮；同一组筛选每次挂载只起一次，停下、失败的那一轮不在这里重启。 */
  const started = useRef('');
  const scope = JSON.stringify([filters.performer, filters.studio, filters.tag, filters.q, filters.sort, filters.dir, filters.seed]);
  const unread = !releases.isPlaceholderData && (releases.data?.metadata_unread || 0) > 0 && !reading;
  useEffect(() => {
    if (!unread || started.current === scope) return;
    started.current = scope;
    void controlReleaseMetadata('start', filters).then(async (result) => {
      // 起读之前发出的进度请求晚回来会盖掉这份回执，先取消。
      await queryClient.cancelQueries({ queryKey: DISCOVERY_METADATA_KEY });
      queryClient.setQueryData(DISCOVERY_METADATA_KEY, result);
    }).catch(() => {});
  }, [unread, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const action = useAction();
  const want = (item: Discovery) => { void action.run(String(item.id), signal => addWant({ code: item.code }, signal), () => {
    receipt('Added to wants'); void invalidateWants(); void releases.refetch();
  }) };
  const data = releases.data;
  useVisibleJavWorks(data?.items || []);
  const waiting = releases.isPending;
  const filtered = !!(filters.performer || filters.studio || filters.tag || filters.q);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / filters.size));
  useEffect(() => {
    if (!data || releases.isPlaceholderData || filters.page <= pages) return;
    setFilters(current => ({ ...current, page: pages }));
    writeJavQuery({ page: pages > 1 ? String(pages) : '' });
  }, [data, releases.isPlaceholderData, filters.page, pages]);
  return <section ref={section} aria-label="Subscribe to new releases" aria-busy={waiting || releases.isFetching} className="flex min-w-0 scroll-mt-24 flex-col gap-4">
    {waiting ? <div data-catalog-tiers="" aria-busy="true" dangerouslySetInnerHTML={{ __html: TIER_PLACEHOLDERS }} /> : null}
    {data && (data.facets.performers.length || data.facets.studios.length) ? <div data-catalog-tiers="" data-release-tiers="">
      {data.facets.performers.length ? <div data-catalog-tier="performers" role="group" aria-label="Filter by performer">
        {data.facets.performers.map(person => <button key={person.name} type="button" data-tier-performer=""
          aria-pressed={filters.performer === person.name} title={`${entityDisplayName('performer', person.name, person.id)} · ${person.count} titles`}
          onClick={() => choose('performer', person.name)}>
          <span data-tier-ring="" dangerouslySetInnerHTML={{ __html: performerRing(person) }} />
          <span data-tier-name="">{entityDisplayName('performer', person.name, person.id)}</span>
        </button>)}
      </div> : null}
      {data.facets.studios.length ? <div data-catalog-tier="studios" role="group" aria-label="Filter by studio">
        {data.facets.studios.map(studio => <button key={studio.name} type="button" data-tier-studio=""
          aria-pressed={filters.studio === studio.name} title={`${studio.name} · ${studio.count} works`} onClick={() => choose('studio', studio.name)}>
          <StudioMark studio={studio} />{studio.name}<span data-count-badge="">{studio.count}</span>
        </button>)}
      </div> : null}
    </div> : null}
    <FilterGlassRows label="New work filter" topLabel="New work tag" attrs={{ 'data-filter-frame': '', 'data-jav-filter': '', 'data-catalog-frame': '' }}
      busy={waiting} topClassName="gap-1.5 overflow-visible" bottomClassName="min-h-12" top={<div data-catalog-scroll="">
        <div data-catalog-tags="" dangerouslySetInnerHTML={waiting ? { __html: javTagSkeleton() } : undefined}>
          {waiting ? null : data?.facets.tags.map(row => <FilterPill key={row.name} data-catalog-tag={row.name} data-entity-press=""
            pressed={filters.tag === row.name} onPress={() => choose('tag', row.name)}>
            {row.name}<span data-count-badge="">{row.count}</span>
          </FilterPill>)}
        </div></div>} bottom={<>
        <span data-catalog-readout="">{waiting ? <span data-skeleton="count" aria-hidden className="relative inline-block h-3.5 w-37.5 rounded-md align-middle skeleton-sheen" />
          : filtered ? `${data?.total || 0} / ${data?.candidate_total || 0} works` : `${data?.total || 0} works`}</span>
        {filtered ? <GlassPill onPress={clear}>Clear filters</GlassPill> : null}
        <span data-entity-sorts="">
          <Shuffle onPress={reshuffle} busy={filters.sort === 'random' && releases.isFetching} />
          {view === 'cards' ? <Segments label="JAV card layout" value={layout} options={JAV_LAYOUTS} onChange={storeJavLayout} /> : null}
          <CatalogViewToggle />
          <SortKeys sorts={RELEASE_SORTS.map(([key, label, ariaLabel]) => ({ key, label, ariaLabel, pressed: key === filters.sort, dir: filters.dir }))}
            onSort={key => sortBy(key as ReleaseSort)} />
        </span>
      </>} />
    {waiting && view === 'cards' ? <div role="status" aria-label="Loading new works" dangerouslySetInnerHTML={{ __html: javContentSkeleton('discover', layout) }} /> : null}
    {releases.error ? <Note tone="error" title="New work unavailable">{errorMessage(releases.error)}</Note> : null}
    {reading && metadata ? <div data-jav-metadata="" className="min-w-0"><TaskProgress
      label={`Reading video details · ${metadata.completed} / ${metadata.total}`} value={metadata.completed} total={metadata.total} /></div> : null}
    {readOnly ? null : <CoverQueue scope="This page" fetchOne={fetchReleaseCover}
      codes={(data?.items || []).filter(item => item.cover_state === 'queued' && !item.cover_url).map(item => item.code)}
      settled={(got, total) => {
        receipt(got === total ? `Fetched ${total} covers` : `Fetched ${got} / ${total} covers; the misses have their reasons on the card`);
        void releases.refetch();
      }} />}
    {!waiting && !releases.error && !data?.items.length ? <EmptyState icon={RiRssLine} title={filtered ? 'No new works match the filter' : 'No new works not yet indexed'}
      actions={filtered ? <Button size="small" onClick={clear}>Clear filters</Button>
        : <ButtonLink size="small" href="/subscriptions?tab=add">Add subscription</ButtonLink>}>
      {filtered ? 'Clear the filter to view all new works.' : 'After following a performer or studio, new works not yet indexed appear here.'}
    </EmptyState> : null}
    {action.error ? <Note tone="error">{action.error}</Note> : null}
    {view === 'list' ? waiting || data?.items.length ? <ReleaseTable items={data?.items || []} waiting={waiting} filters={filters}
      studios={data?.facets.studios || []} javImage={settings.value.javImage} readOnly={readOnly} navigate={navigate}
      onTag={value => choose('tag', value || filters.tag)} onSort={setSort} wanting={item => action.busy === String(item.id)}
      onWant={want} onResource={item => resource(resourcePrefill(item))} /> : null
    : <div data-media-grid="" className={JAV_RECOMMENDATION_GRID} style={{ '--card-ratio': ratio } as CSSProperties}>
      {(data?.items || []).map(item => <DiscoveryCard key={item.id} item={item} layout={layout} javImage={settings.value.javImage}
        readOnly={readOnly} navigate={navigate} tag={filters.tag} onTag={value => choose('tag', value || filters.tag)}
        wanting={action.busy === String(item.id)} onWant={() => want(item)}
        onResource={() => resource(resourcePrefill(item))} badge={filters.sort === 'taste' ? <TasteChip value={item.taste_score} /> : undefined} />)}
    </div>}
    {data ? <DataTableFooter label="New releases" total={data.total}
      pagination={{ pageIndex: filters.page - 1, pageSize: filters.size }} onChange={changePage}
      unit="videos" pageUnit="videos" pageSizes={RELEASE_PAGE_SIZES} /> : null}
  </section>;
}
