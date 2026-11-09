/* Follows page `/follow`: header, the creator and tag rows, the two rows' filter glass, intersection bar, card list and footer
 * (ADR-0031 step 10g).
 *
 * Data shapes, query keys and this page's criteria live in `./follow-feed.ts`; cards in `./follow-card.tsx`. Changing filters
 * or sort changes the query key: the list area remounts per the new key and lays a list skeleton, while the header, both rows
 * and the glass stay exactly as they are: they can produce their final look right now, and skeletoning the whole block would
 * make the overlay and both rows vanish and reappear, when only the list's contents are actually waited on.
 *
 * The address bar belongs to the shell: clicking filters, sorting or switching media only calls `actions.route`; the shell
 * writes the address and pushes the new `view` back. The page's only networked actions are "Check updates" and "fetch an
 * earlier page", both starting the same background job; `helpers.jobProgress` watches the progress, and when it finishes the
 * page's queries are invalidated and refetched. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useInfiniteQuery, useMutation, useQuery, type InfiniteData } from '@tanstack/react-query';
import { esc, icon, leadingGraphemes, requestErrorMessage } from '@peach/legacy/core';
import { tagLabel } from '@peach/legacy/tags';
import { spinnerHtml } from '@peach/legacy/ui';

import { Button, ButtonLink } from '@/components/base/buttons/button';
import { EmptyState } from '../components/empty-state';

import { apiGet, apiSend } from '../../api';
import { LoadMore } from '../catalog-grid/catalog-grid-page';
import { FilterGlassRows, FilterPill } from '../components/filter-glass';
import { LibraryShortcuts } from '../library-shortcuts/shortcut-controls';
import { AsyncText } from '../components/async-text';
import { RetryNote } from '../components/grid-reveal';
import { SkeletonContent } from '../components/skeleton-content';
import { spriteGlyph } from '../components/sprite-glyph';
import { IconSwap } from '../components/icon-swap';
import { useViewGlide } from '../components/use-view-glide';
import { useMasonryGrid } from '../components/use-masonry-grid';
import { Segments, Shuffle } from '../entity-filter/entity-filter-page';
import type { SegmentOption } from '../entity-filter/entity-filter';
import { checkSummary, FOLLOW_CHECK_URL, FOLLOW_STATUS_URL, sourceIconUrl } from '../follow-manage/follow-manage';
import { followManageEntry } from '../follow-manage/manage-route';
import { Note } from '../components/note';
import { sidebarTagCounts } from '../../sidebar';
import { queryClient } from '../query';
import { pageNavigationReady } from '../../history/page-navigation';
import { FollowAuthorLink, FollowCard } from './follow-card';
import { authorAvatarHtml, followAuthorEntity, followAuthorName, sourceMark } from './follow-marks';
import {
  FOLLOW_AUTO_LOAD_LIMIT, FOLLOW_CREDENTIALS_KEY, FOLLOW_FEED_SORTS, FOLLOW_FILTERS, FOLLOW_TAGS_FIRST,
  FOLLOW_WORKS_FIRST,
  collectionItems, dropCondition, fetchFollowCredentials, followConditions, followFeedQuery, groupMediaKinds, groupTagType, itemForMedia,
  mergedPage, nextSort, randomOrder, sortAriaLabel, backfillState, withStatus,
  type FollowCondition, type FollowContext, type FollowDrawer, type FollowFeedProps, type FollowGroup, type FollowPage, type FollowSource,
  type FollowJobState, type FollowView, type FollowWorkRow,
} from './follow-feed';

const Sep = () => <span data-entity-sep="" aria-hidden="true" />;
const SETTINGS = spriteGlyph('settings');
const CHEVRON_DOWN = spriteGlyph('chevron-down');
const HISTORY = spriteGlyph('history');
const SortUpIcon = spriteGlyph('arrow-up'), SortDownIcon = spriteGlyph('arrow-down');

/** The two layout tiers for the photo wall's row, same as the shell's `PHOTO_LAYOUTS`. */
export const FOLLOW_PHOTO_LAYOUTS: readonly SegmentOption[] = [
  ['fixed', 'Fixed ratio', 'layout-grid'], ['masonry', 'Masonry', 'columns-2'],
];

/** The things this page derives from the data: the two rows' sampling, the filter bar's options, and the visible groups. They change only with the data, the view, and the seed. */
function useFacets(data: FollowPage | null, view: FollowView, seed: number) {
  return useMemo(() => {
    const groups = data?.groups || [];
    const counts = data?.counts || {};
    const sources = data?.sources || [];
    /* What the filter bar offers comes from the server's library-wide facets, not this page's groups. Computed from groups, selecting
       one creator makes the server return only their entries, leaving a single name in the creator column with no way back. */
    const facets = data?.facets || {};
    const activeAuthors = new Set(facets.authors || []);
    const providerLabels = new Map(sources.map((source) => [source.provider, source.provider_label || source.provider]));
    const providers = new Map((facets.providers || []).map((key) => [key, providerLabels.get(key) || key]));
    const tagCounts = new Map(facets.tags || []);
    const authorSources = new Map<string, FollowSource[]>();
    sources.forEach((source) => {
      if (!source.author_key) return;
      if (!authorSources.has(source.author_key)) authorSources.set(source.author_key, []);
      authorSources.get(source.author_key)!.push(source);
    });
    const authorKeys = [...authorSources.keys()].filter((key) => activeAuthors.has(key));
    /* The creator and genre rows are sampled randomly by the seed of this visit, changing each time: taking the first few by count would always show the same
       twenty-odd of eighty-odd genres. These two rows answer "what to watch next", not "which is the largest". */
    const authorOrder = randomOrder(authorKeys, (key) => key, seed);
    const workRows: FollowWorkRow[] = randomOrder(facets.works || [], (row) => row[0], seed).slice(0, FOLLOW_WORKS_FIRST);
    if (view.work && !workRows.some((row) => row[0] === view.work)) workRows.push([view.work, view.work, 0]);
    const allCount = Object.values(counts).reduce((total, count) => total + (Number(count) || 0), 0);
    const tagRows = randomOrder([...tagCounts], (row) => row[0], seed).slice(0, FOLLOW_TAGS_FIRST);
    view.tags.forEach((tag) => {
      if (!tagRows.some(([key]) => key === tag)) tagRows.push([tag, tagCounts.get(tag) || allCount]);
    });
    const mediaCounts = { videos: 0, images: 0 };
    groups.forEach((group) => groupMediaKinds(group).forEach((kind) => { mediaCounts[kind === 'image' ? 'images' : 'videos'] += 1 }));
    const wanted = view.media === 'images' ? 'image' : 'video';
    const visible = groups.filter((group) => groupMediaKinds(group).has(wanted));
    return {
      groups, counts, sources, providers, tagRows, authorSources, authorOrder, workRows, allCount, mediaCounts, visible,
      /* When the pressed creator or source is not among this version's options (alias changed, source withdrawn), treat as unpressed: the page cannot stay
         in a filter whose pressed item is invisible. Tags and genres entered from elsewhere may be absent from general facets and still apply. */
      author: authorSources.has(view.author) && activeAuthors.has(view.author) ? view.author : '',
      provider: providers.has(view.provider) ? view.provider : '',
      workNames: new Map((facets.works || []).map((row) => [row[0], row[1]])),
      broken: sources.filter((source) => source.last_status === 'error' || source.last_status === 'unauthorized'),
      byId: new Map(sources.map((source) => [source.id, source])),
    };
  }, [data, view, seed]);
}

type Facets = ReturnType<typeof useFacets>;

export function FollowFeedPage(props: FollowFeedProps) {
  const { view, seed, revision, actions } = props;
  const query = followFeedQuery(view, revision);
  const result = useInfiniteQuery(query);
  const credentialsResult = useQuery({
    queryKey: FOLLOW_CREDENTIALS_KEY, queryFn: ({ signal }) => fetchFollowCredentials(signal),
  });
  const data = useMemo(() => mergedPage(result.data), [result.data]);
  const credentials = useMemo(() => new Set((credentialsResult.data?.providers || [])
    .filter((provider) => provider.present).map((provider) => provider.provider)), [credentialsResult.data]);
  const context = useMemo<FollowContext>(() => ({
    sources: data?.sources || [], aliases: data?.author_aliases || [], credentials,
    credentialsReady: credentialsResult.data !== undefined,
  }), [data, credentials, credentialsResult.data]);
  const facets = useFacets(data, view, seed);
  const listPending = result.isPending || result.isPlaceholderData;

  /* The sidebar stays in the shell: each time this key's own data arrives, hand back the visible items' tag counts plus library-wide source and duration availability;
     placeholder data borrowed during a key switch is not handed back. Sources are listed library-wide: after selecting one the others remain, so you can switch back.
     Handing back is queued into a microtask: the shell paints the sidebar on receipt, and the sidebar's handle calls `flushSync` internally, unpaintable during the commit phase.
     If this drawer has been superseded by the next one or the page has unmounted, nothing is handed back. */
  const settled = !listPending && !!data;
  useEffect(() => {
    void pageNavigationReady(() => location.pathname === '/follow',
      document.querySelector('#stats [data-filter-frame]'), { pending: listPending });
  }, [listPending, data, view]);
  const drawer = useMemo<FollowDrawer>(() => ({
    tags: sidebarTagCounts(facets.visible.flatMap(collectionItems).map((item) => ({ tags: item.tags || [] }))),
    providers: [...facets.providers].map(([key, label]) => [key, label, sourceIconUrl(key)] as const),
    duration: !!data?.facets?.duration,
  }), [facets.visible, facets.providers, data]);
  useEffect(() => {
    if (!settled) return;
    let live = true;
    queueMicrotask(() => { if (live) actions.loaded(drawer) });
    return () => { live = false };
  }, [settled, drawer, actions]);

  const job = useFollowJob(props, !!data);

  if (!data) {
    /* The page header renders even when the list cannot load: at that moment the most useful thing is heading to the manage page to see what went wrong with the sources. */
    if (result.isError) {
      return (
        <div data-follow-feed="">
          <Head />
          <RetryNote message={requestErrorMessage(result.error)} onRetry={() => void result.refetch()} />
        </div>
      );
    }
    return null;
  }
  const route = (patch: Partial<FollowView>) => actions.route({ ...view, ...patch });
  const conditions = followConditions({ ...view, author: facets.author, provider: facets.provider }, {
    authors: new Map([...facets.authorSources].map(([key, list]) => [key, followAuthorName(list, context)])),
    providers: facets.providers,
    works: facets.workNames,
  });
  const total = view.status ? facets.counts[view.status] || 0 : facets.allCount;
  const canBackfill = facets.sources.some((source) => source.can_backfill);

  return (
    <>
      {/* The progress cell belongs to `followJobProgress`: it inserts its own panel and opens and closes it itself; React only supplies an empty node. */}
      <div key={job.generation} ref={job.host} data-follow-progress="" />
      {credentialsResult.isError ? <RetryNote message="Credential state not obtained" onRetry={() => { void credentialsResult.refetch() }} /> : null}
      {!job.busy && job.report ? <Note tone="neutral" title="Check results">{job.report}</Note> : null}
      <div data-follow-feed="" data-select-mode={props.selectMode ? '' : undefined}>
        <Head>
          {facets.sources.length ? (
            <Button variant="primary" data-follow-recheck="" aria-label="Check updates for each source"
              aria-busy={job.busy || undefined}
              onClick={() => void job.start(false)}>
              {job.starting === 'check'
                ? <span className="contents" dangerouslySetInnerHTML={{ __html: spinnerHtml('Checking') }} />
                : 'Check for updates'}
            </Button>
          ) : null}
        </Head>
        <Authors facets={facets} pressed={facets.author} context={context} props={props}
          onPick={(key) => route({ author: facets.author === key ? '' : key })} />
        <Works rows={facets.workRows} pressed={view.work} props={props}
          onPick={(key) => route({ work: view.work === key ? '' : key })} />
        <Glass facets={facets} view={view} total={total} busy={listPending} props={props} route={route} />
        <Combo conditions={conditions} onDrop={(row) => actions.route(dropCondition(view, row))}
          onClear={() => route({ author: '', provider: '', work: '', tags: [], durMin: 0, durMax: 0 })} />
        {facets.broken.length ? <BrokenNote count={facets.broken.length} /> : null}
        <List retryKey={result.dataUpdatedAt} pending={listPending} facets={facets} data={data} context={context}
          props={props} checkAction={<Button size="small" variant="secondary" aria-label="Check updates for each source" aria-busy={job.busy || undefined}
            aria-disabled={job.busy || undefined} onClick={() => { if (!job.busy) void job.start(false) }}>Check updates</Button>} />
        {data.has_more || canBackfill ? (
          <div data-follow-pagination="">
            {data.has_more ? (
              <span data-follow-page-action="">
                {data.groups.length < FOLLOW_AUTO_LOAD_LIMIT ? (
                  <LoadMore key={result.data?.pages.length} entity enabled={() => !job.busyRef.current}
                    load={async () => { await result.fetchNextPage({ throwOnError: true }) }}>
                    <CHEVRON_DOWN className="size-(--icon-inline)" />Load more
                  </LoadMore>
                ) : (
                  <ManualMore busy={result.isFetchingNextPage}
                    error={result.isFetchNextPageError ? requestErrorMessage(result.error) : ''}
                    load={() => { if (!job.busyRef.current && !result.isFetchingNextPage) void result.fetchNextPage() }} />
                )}
              </span>
            ) : null}
            {canBackfill ? (
              <span data-follow-page-action="">
                <Button variant="secondary" leadingIcon={job.olderBusy ? undefined : HISTORY} data-follow-older=""
                  aria-busy={job.busy || undefined}
                  onClick={() => void job.start(true)}>
                  {job.olderBusy
                    ? <><span className="contents" dangerouslySetInnerHTML={{ __html: spinnerHtml('Fetching') }} /><span>Scraping</span></>
                    : 'Fetch an earlier page'}
                </Button>
                <span data-follow-backfill="">{backfillState(facets.sources)}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Page header: the title and "manage follows" are always present; the check-updates key waits until sources are read (`children`). */
function Head({ children }: { children?: ReactNode }) {
  return (
    <div data-follow-head="">
      <h2 data-follow-title="">Follows</h2>
      <span data-follow-head-actions="">
        <ButtonLink variant="secondary" leadingIcon={SETTINGS} data-follow-manage="" href={manageHref()}>
          Manage follows
        </ButtonLink>
        {children}
      </span>
    </div>
  );
}

/** The "Load more" shown after `FOLLOW_AUTO_LOAD_LIMIT` groups: same look as the `LoadMore` one, except scrolling to it does not load by itself;
 *  it needs a click. On failure the reason and a retry stay in place. */
function ManualMore({ busy, error, load }: { busy: boolean; error: string; load(): void }) {
  return (
    <>
      <button type="button" data-entity-more="" aria-busy={busy || undefined} aria-disabled={busy || undefined} onClick={load}>
        <CHEVRON_DOWN className="size-(--icon-inline)" />Load more
      </button>
      {error ? <RetryNote message={error} onRetry={load} /> : null}
    </>
  );
}

/* -- Check updates and back-crawl --
 * Only one page back at a time: the routine update check only ever reads the first page, and back-crawling is a separate, explicit action, one click one page,
 * never automatic, never consecutive. Both keys start the same run; while it runs both are busy, and continuation pages stop too. */
function useFollowJob(props: FollowFeedProps, ready: boolean) {
  const { helpers, actions } = props;
  const [generation, setGeneration] = useState(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState<'' | 'check' | 'older'>('');
  const [report, setReport] = useState('');
  /* The fetch-back key keeps reading "fetching" until the run it started finishes, same as the legacy layer: the check-for-updates run only keeps it busy without swapping the text. */
  const [olderRun, setOlderRun] = useState(false);
  const busyRef = useRef(false);
  const node = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ helpers, actions });
  latest.current = { helpers, actions };

  useEffect(() => {
    const host = node.current;
    if (!host) return undefined;
    let alive = true;
    latest.current.helpers.jobProgress({
      host,
      active: () => alive,
      read: (signal) => apiGet<FollowJobState>(FOLLOW_CHECK_URL, signal),
      busy: (on) => {
        if (!alive) return;
        busyRef.current = on;
        setRunning(on);
      },
      complete: (state) => {
        if (!alive) return;
        const report = state.status === 'failed' ? { results: [{ ok: false, error: state.error }] } : state;
        latest.current.actions.checkReport(report);
        setReport(checkSummary({ ...report, status: state.status || 'done' }));
        busyRef.current = false;
        setRunning(false);
        setOlderRun(false);
        void queryClient.invalidateQueries({ queryKey: ['follow-feed'] });
        /* The finished path stops being watched: mount a new one so the next run started elsewhere can still be caught. */
        setGeneration((value) => value + 1);
      },
    });
    return () => { alive = false };
    /* When the first-screen fetch fails the progress cell has not painted yet; after a successful retry `ready` flips and it connects. */
  }, [generation, ready]);

  const start = useCallback(async (older: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStarting(older ? 'older' : 'check');
    setReport('');
    let started = false;
    try {
      const job = await apiSend<{ job_id: string }>(FOLLOW_CHECK_URL, older ? { older: true, background: true } : { background: true });
      sessionStorage.setItem('peach-follow-job', job.job_id);
      started = true;
      setRunning(true);
      if (older) setOlderRun(true);
      setGeneration((value) => value + 1);
    } catch (error) {
      latest.current.actions.checkReport({ results: [{ ok: false, error: requestErrorMessage(error) }] });
      if (older) void queryClient.invalidateQueries({ queryKey: ['follow-feed'] });
    } finally {
      busyRef.current = started;
      setStarting('');
    }
  }, []);

  return {
    generation, host: node as RefObject<HTMLDivElement | null>, busyRef, starting, start, report,
    busy: running || starting !== '',
    olderBusy: starting === 'older' || (olderRun && running),
  };
}

/* ── Two rows ── */

function Authors({ facets, pressed, context, props, onPick }: {
  facets: Facets; pressed: string; context: FollowContext; props: FollowFeedProps; onPick(key: string): void;
}) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => { props.helpers.wireDrag(row.current) }, [props.helpers]);
  const nameOf = (key: string) => followAuthorName(facets.authorSources.get(key) || [], context);
  if (!facets.authorOrder.length) return null;
  return (
    <div data-follow-authors-bar="">
      <div ref={row} data-follow-authors="" aria-label="Creators">
        {facets.authorOrder.map((key) => {
          const list = facets.authorSources.get(key) || [];
          const entity = followAuthorEntity(list);
          const content = <>
            <span data-follow-ring="" dangerouslySetInnerHTML={{ __html: authorAvatarHtml(list, nameOf(key)) }} />
            <span data-follow-name="">{nameOf(key)}</span>
          </>;
          return entity ? (
            <FollowAuthorLink key={key} name={entity} actions={props.actions} data-follow-author={key}
              aria-label={`View the author page for ${nameOf(key)}`}>{content}</FollowAuthorLink>
          ) : (
            <button key={key} type="button" data-follow-author={key} aria-pressed={pressed === key} onClick={() => onPick(key)}>
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* The row under the creator row is genres, matching the position and shape of the label row on the home page: it only accepts tags that sources themselves record as copyright and character;
   the word form cannot be guessed. The round badge holds a representative image the server picked for that genre, or two letters when none can be picked. */
function Works({ rows, pressed, props, onPick }: {
  rows: readonly FollowWorkRow[]; pressed: string; props: FollowFeedProps; onPick(key: string): void;
}) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => { props.helpers.wireDrag(row.current) }, [props.helpers]);
  if (!rows.length) return null;
  return (
    <div ref={row} data-follow-works="" aria-label="Filter by genre">
      {rows.map((work) => (
        <button key={work[0]} type="button" data-follow-work={work[0]} aria-pressed={pressed === work[0]}
          onClick={() => onPick(work[0])}>
          <span data-follow-mark="" data-fallback={leadingGraphemes(work[1], 2)}
            dangerouslySetInnerHTML={{ __html: props.helpers.workMark(work) }} />
          {work[1]}
        </button>
      ))}
    </div>
  );
}

/* Filter glass.
 * The top row runs coarse to fine, the same order as the profile page's bar: the far left is videos/photos, which kind of
 * things this page currently shows; past one divider are the four statuses, always exactly one active, with the sliding glass
 * following it; past another divider come the optional filters: sources and tags. The media tier has its own round glass: it
 * asks a different question than status, and sharing one glass would fly the pane over from "Unwatched" on a photo click.
 * The bottom row holds the readout on the left, then Shuffle, the photo wall's layout and "images only", then the sort keys. */
function Glass({ facets, view, total, busy, props, route }: {
  facets: Facets; view: FollowView; total: number; busy: boolean; props: FollowFeedProps;
  route(patch: Partial<FollowView>): void;
}) {
  const { helpers, actions } = props;
  const statePane = useRef<HTMLSpanElement>(null);
  const mediaPane = useRef<HTMLSpanElement>(null);
  const stateRow = useRef<HTMLDivElement>(null);
  const mediaRow = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const tagRow = useRef<HTMLDivElement>(null);
  const showMedia = !!facets.mediaCounts.images || view.media === 'images';
  const stateGlide = useViewGlide(statePane, stateRow, '[data-follow-filter][aria-pressed="true"]', view.status);
  const mediaGlide = useViewGlide(mediaPane, mediaRow, '[data-media-view][aria-pressed="true"]', `${view.media}:${showMedia}`);
  useEffect(() => {
    helpers.wireDrag(scroll.current);
    helpers.wireDrag(tagRow.current);
    helpers.wireScroller(tagRow.current);
  }, [helpers]);
  const providers = [...facets.providers];
  const extras = providers.length + facets.tagRows.length > 0;
  const images = view.media === 'images';
  return (
    <FilterGlassRows label="Filter and sort" topLabel={showMedia ? 'Media and follow filters' : 'Follow filters'}
      attrs={{ 'data-filter-frame': '', 'data-follow-filter-glass': '' }}
      topClassName="gap-1.5 overflow-visible" busy={busy}
      panes={<>
        <span ref={statePane} data-view-glide="" aria-hidden="true" />
        <span ref={mediaPane} data-view-glide="round" aria-hidden="true" />
      </>}
      top={<>
        {showMedia ? (
          <>
            <div ref={mediaRow} role="group" aria-label="Media kinds" data-entity-media="" onPointerLeave={mediaGlide.leave}>
              {([['videos', 'Videos', facets.mediaCounts.videos, 'play', 'video'],
                ['images', 'Images', facets.mediaCounts.images, 'pics', 'image']] as const).map(([value, text, count, symbol, kind]) => {
                const title = `${text} ${Math.max(0, count || 0).toLocaleString()}`;
                return (
                  <button key={value} type="button" data-media-view={value} data-media-icon={kind}
                    aria-pressed={view.media === value} aria-label={title} title={title}
                    onPointerEnter={mediaGlide.hover} onClick={() => { if (view.media !== value) route({ media: value }) }}
                    dangerouslySetInnerHTML={{ __html: icon(symbol) }} />
                );
              })}
            </div>
            <Sep />
          </>
        ) : null}
        <div ref={scroll} data-entity-scroll="">
          <div ref={stateRow} role="group" aria-label="State" data-entity-states="" onPointerLeave={stateGlide.leave}>
            {FOLLOW_FILTERS.map(([key, label]) => (
              <button key={key} type="button" data-entity-state={key} data-follow-filter={key} data-entity-press=""
                aria-pressed={view.status === key} onPointerEnter={stateGlide.hover}
                onClick={() => { if (view.status !== key) route({ status: key }) }}>
                {label}
              </button>
            ))}
            {extras ? <Sep /> : null}
          </div>
          <div ref={tagRow} data-entity-tags="">
            {providers.map(([key, label]) => (
              <button key={key} type="button" data-follow-provider={key} data-entity-press=""
                aria-pressed={facets.provider === key} title={label} aria-label={`Source: ${label}`}
                onClick={() => route({ provider: facets.provider === key ? '' : key })}
                dangerouslySetInnerHTML={{ __html: sourceMark(key, label) }} />
            ))}
            {providers.length && facets.tagRows.length ? <Sep /> : null}
            {facets.tagRows.map(([tag, n]) => (
              <FilterPill key={tag} data-follow-tag={tag} data-entity-press=""
                data-tag-cat={`r34-${groupTagType(facets.groups, tag)}`} pressed={view.tags.includes(tag)}
                onPress={() => route({ tags: view.tags.includes(tag) ? view.tags.filter((key) => key !== tag) : [...view.tags, tag] })}>
                {tagLabel(tag)}
                {n ? <span data-count-badge={tag}>{String(n)}</span> : null}
              </FilterPill>
            ))}
          </div>
        </div>
      </>}
      bottom={<>
        <h3 data-entity-readout="" data-follow-readout="">
          <AsyncText text={`${total.toLocaleString()} updates · showing ${facets.visible.length.toLocaleString()}`} busy={busy} />
        </h3>
        <LibraryShortcuts currentHref={() => location.pathname + location.search} kind="creator" />
        <span data-entity-sorts="">
          <Shuffle onPress={actions.shuffle} />
          {images ? (
            <>
              <Segments label="Image layout" value={props.photoLayout} options={FOLLOW_PHOTO_LAYOUTS}
                onChange={(value) => actions.setPhotoLayout(value === 'fixed' ? 'fixed' : 'masonry')} />
              <button type="button" data-follow-images-only="" aria-pressed={props.imagesOnly} title="Images only"
                aria-label="Images only" onClick={() => actions.setImagesOnly(!props.imagesOnly)}>
                {props.imagesOnly ? <span data-view-glide="" aria-hidden="true" /> : null}
                <span className="contents" dangerouslySetInnerHTML={{ __html: icon('captions-off') }} />
              </button>
            </>
          ) : null}
          {FOLLOW_FEED_SORTS.map(([key, label]) => {
            const pressed = view.sort === key;
            return (
              <button key={key} type="button" data-entity-sort={key} data-follow-sort={key} data-entity-press=""
                aria-pressed={pressed} aria-label={sortAriaLabel(key, label, view.sort, view.dir) || undefined}
                onClick={() => {
                  const next = nextSort(key, view.sort, view.dir);
                  if (next) route(next);
                }}>
                {label}{pressed ? <IconSwap a={SortUpIcon} b={SortDownIcon} state={view.dir === 'asc' ? 'a' : 'b'} className="size-(--icon-inline)" /> : null}
              </button>
            );
          })}
        </span>
      </>}
    />
  );
}

/* Active filters lay right below the overlay, on the same intersection filter bar as home and the profile page. Placed below: this bar appearing from nothing pushes
   everything under it down forty pixels as a block, and placed above, what gets pushed is the stuck glass and the two avatar rows on it. The tag tier
   writes no prefix; the tag name itself says what it is. */
function Combo({ conditions, onDrop, onClear }: {
  conditions: FollowCondition[]; onDrop(row: FollowCondition): void; onClear(): void;
}) {
  return (
    <div data-entity-combo="" data-follow-combo="">
      {conditions.length ? (
        <>
          {conditions.map((row) => {
            const text = `${row.kind === 'Tags' ? '' : `${row.kind} `}${row.label}`;
            return (
              <span key={`${row.kind}:${row.key}`} data-combo-chip="">
                {text}
                <button type="button" aria-label={`Remove ${text}`} data-follow-drop={row.key} data-follow-drop-kind={row.kind}
                  onClick={() => onDrop(row)}>✕</button>
              </span>
            );
          })}
          <button type="button" data-combo-clear="" onClick={onClear}>Clear all</button>
        </>
      ) : null}
    </div>
  );
}

/** A source failed its last check: this page does not spread out the reasons and points to the manage page instead. The Note's border and icon use the site-wide copy. */
function BrokenNote({ count }: { count: number }) {
  return (
    <div data-follow-broken="" dangerouslySetInnerHTML={{
      __html: `<div class="geist-note geist-note-error fwarn" role="alert">${icon('alert')}<span>${count} sources failed their last check. Open <a class="flink" href="${esc(manageHref())}" data-follow-manage>Manage follows</a> to see why.</span></div>`,
    }} />
  );
}

/** The manage page entry is computed from the current URL: `tab` on legacy URLs still reroutes by the `followManageEntry` convention. */
const manageHref = () => followManageEntry(window.location.search);

/* ── List ── */

function List({ pending, facets, data, context, props, retryKey, checkAction }: {
  pending: boolean; facets: Facets; data: FollowPage; context: FollowContext; props: FollowFeedProps;
  retryKey: number; checkAction: ReactNode;
}) {
  const { view, helpers } = props;
  const images = view.media === 'images';
  return (
    <div data-follow-list-body="">
      <SkeletonContent pending={pending} skeletonHtml={() => helpers.listSkeletonHtml(view.media)}>
        {pending ? null : (
        <Cards facets={facets} data={data} context={context} props={props} images={images} retryKey={retryKey} checkAction={checkAction} />
        )}
      </SkeletonContent>
    </div>
  );
}

function Cards({ facets, data, context, props, images, retryKey, checkAction }: {
  facets: Facets; data: FollowPage; context: FollowContext; props: FollowFeedProps; images: boolean;
  retryKey: number; checkAction: ReactNode;
}) {
  const { view, actions } = props;
  const write = useFollowWrite(props);
  const wall = images ? { 'data-size': props.photoSize, 'data-layout': props.photoLayout, 'data-images-only': String(props.imagesOnly) } : {};
  const wallRef = useMasonryGrid(images && props.photoLayout === 'masonry',
    `${props.photoSize}:${facets.visible.map((group) => group.primary.id).join(',')}`);
  let body: ReactNode;
  if (facets.visible.length) {
    body = facets.visible.map((group) => {
      const source = facets.byId.get(group.primary?.source_id as number);
      const siblings = (source?.author_key && facets.authorSources.get(source.author_key)) || [];
      const id = group.primary.id;
      return (
        <FollowCard key={`${id}:${view.media}`} group={group} authorSources={siblings} media={view.media} retryKey={retryKey}
          context={context} selected={props.selected.has(cardId(group, view))} selectMode={props.selectMode}
          busy={write.busy.get(cardId(group, view)) || ''} failure={write.failures.get(cardId(group, view)) || ''}
          actions={actions} onStatus={write.status} onSave={write.save} />
      );
    });
  } else {
    body = <Empty data={data} filtered={!!(view.status || facets.author || facets.provider || view.work || view.tags.length || view.durMin || view.durMax)}
      checkAction={checkAction} clear={() => actions.route({ ...view, status: '', author: '', provider: '', work: '', tags: [], durMin: 0, durMax: 0,
        media: data.groups.length ? (data.groups.some(group => groupMediaKinds(group).has('video')) ? 'videos' : 'images') : view.media })} />;
  }
  return (
    <div ref={wallRef} data-follow-list="" data-follow-wall={images ? '' : undefined} {...wall}>
      {body}
    </div>
  );
}

/** The id of the item on the card: when the card face switched to the group entry containing the current media, selection and writes target it. */
function cardId(group: FollowGroup, view: FollowView): number {
  return itemForMedia(group, view.media).id;
}

/** Four kinds of empty list: this page has entries but the media type does not match; a filter is set but matched nothing; there are sources but nothing fetched yet;
 *  no sources at all. When no filter is set, do not tell people to change filters. */
function Empty({ data, filtered, clear, checkAction }: {
  data: FollowPage; filtered: boolean; clear(): void; checkAction: ReactNode;
}) {
  const noMatch = !!data.groups.length || filtered;
  const hasSources = !!data.sources.length;
  return <div data-follow-empty="" className="contents"><EmptyState icon={spriteGlyph(noMatch ? 'search-x' : 'rss')}
    title={noMatch ? 'No updates under the current filter' : hasSources ? 'No updates yet' : 'Not following any sources yet'}
    actions={noMatch ? <Button size="small" onClick={clear}>Clear filters</Button>
      : hasSources ? checkAction : <ButtonLink size="small" href="/subscriptions?tab=add">Add follows</ButtonLink>}>
    {noMatch ? 'Try again after switching media type, creator, source, duration, or tags.'
      : hasSources ? 'After checking source updates, new content is collected here.' : 'After adding creators or subscribing to sources, their updates gather here.'}
  </EmptyState></div>;
}

/* Write operations.
 * Status and Watch later (saving to the database) are sent from the island. On success, cache is updated locally: entry
 * status, status counts, and when filtering by a tier the new status is not in, the whole group moves out; then a background
 * reread corrects against the server's basis. The receipt carries an undo key, and entries saved into the database get none,
 * since that is another matter. Read-only clients always answer 409 on write, which is normal and stated as-is on the card.
 * The profile page's online view uses the same hook, its `view` being its own copy filtered by creator only. */
const STATUS_RECEIPTS: Record<string, string> = { new: 'Reset to unwatched', seen: 'Marked as watched', ignored: 'Ignored' };

export function useFollowWrite(props: Pick<FollowFeedProps, 'view' | 'revision' | 'actions'>) {
  const { view, revision, actions } = props;
  const [busy, setBusy] = useState<Map<number, string>>(() => new Map());
  const [failures, setFailures] = useState<Map<number, string>>(() => new Map());
  const key = followFeedQuery(view, revision).queryKey;
  const mark = (id: number, value: string, into: typeof setBusy) => into((now) => {
    const next = new Map(now);
    if (value) next.set(id, value); else next.delete(id);
    return next;
  });
  const apply = (id: number, to: string) => {
    queryClient.setQueryData<InfiniteData<FollowPage>>(key, (current) => (current ? withStatus(current, view, id, to) : current));
  };
  /* Refetch only this version of the list: the credentials one and the lists cached under other filters do not change because of a single flag. */
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key, exact: true });
  const before = (id: number) => {
    const page = mergedPage(queryClient.getQueryData<InfiniteData<FollowPage>>(key));
    for (const group of page?.groups || []) {
      for (const item of [group.primary, ...group.variants, ...group.duplicates]) if (item.id === id) return item.status;
    }
    return 'new';
  };
  /* The callback is written on the hook, not on each `mutate`: when two cards are clicked in a row, only the last callback on `mutate` would run. */
  const statusMutation = useMutation({
    mutationFn: ({ id, to }: { id: number; to: string; was: string }) => apiSend(FOLLOW_STATUS_URL, { item: id, to }),
    onSuccess: (_result, { id, to, was }) => {
      apply(id, to);
      refresh();
      actions.toast(STATUS_RECEIPTS[to] || 'Follow state updated', {
        undo: was !== 'saved' ? async () => {
          await apiSend(FOLLOW_STATUS_URL, { item: id, to: was });
          apply(id, was);
          refresh();
        } : undefined,
      });
    },
    onError: (error, { id }) => {
      mark(id, requestErrorMessage(error), setFailures);
      actions.failure('Follow state updated', error);
    },
    onSettled: (_result, _error, { id }) => mark(id, '', setBusy),
  });
  const saveMutation = useMutation({
    mutationFn: (id: number) => apiSend('/api/follow/save', { item: id }),
    onSuccess: (_result, id) => {
      apply(id, 'saved');
      refresh();
      actions.toast('Saved to the database');
    },
    onError: (error, id) => {
      mark(id, requestErrorMessage(error), setFailures);
      actions.failure('Save to the database', error);
    },
    onSettled: (_result, _error, id) => mark(id, '', setBusy),
  });
  const latest = useRef({ statusMutation, saveMutation, before });
  latest.current = { statusMutation, saveMutation, before };
  /* The two handlers keep a stable identity: cards compare by reference, and swapping in a new function on every repaint would redraw hundreds of cards on screen. */
  const status = useCallback((id: number, to: string) => {
    mark(id, to, setBusy);
    mark(id, '', setFailures);
    latest.current.statusMutation.mutate({ id, to, was: latest.current.before(id) });
  }, []);
  const save = useCallback((id: number) => {
    mark(id, 'save', setBusy);
    mark(id, '', setFailures);
    latest.current.saveMutation.mutate(id);
  }, []);
  return { busy, failures, status, save };
}
