/* Index page: performers, creators, labels, agencies, series rosters and the tag vocabulary.
 *
 * The address bar is the only truth. The shell reads kind/q/scope/view/category from the address as initial values on mount,
 * and page-level switches (label versus agency, local versus online, type, view, filter word) only change local state and
 * write back to the address via `route`, without remounting: a remount would swap the header along with whatever is half-typed
 * in the filter box, and the Tabs' blue line would start over.
 *
 * The header holds only title, readout, layout switch and filter box; page-level switches (label/agency, local/online) are
 * the Tabs row below it. The tags page's readout lives in the overlay's bottom row and is not repeated in the header. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Radio } from 'react-aria-components';

import { refitNativeImages } from '@peach/card-art';
import { requestErrorMessage } from '@peach/legacy/core';
import { indexSkeletonHtml, spinnerHtml } from '@peach/legacy/ui';

import { Button, ButtonLink } from '@/components/base/buttons/button';
import { IndexSearch } from './index-search';
import { DataTableFooter } from '../components/table-controls';
import { tagSkeletonHtml, TAG_PAGE_SIZE, TAG_PAGE_SIZES } from '../../tag-skeleton';
import { useTagPagination, useTagPageBounds } from './tag-pagination';

import { IDENTITY_ROW_CLASS } from '../../identity-filter';

import { BoardTabs, type BoardTab } from '../components/board-tabs';
import { SortableBoardTabs } from '../components/navigation-order';
import { EmptyState } from '../components/empty-state';
import { LibraryShortcuts } from '../library-shortcuts/shortcut-controls';
import { AsyncText } from '../components/async-text';
import { SkeletonContent } from '../components/skeleton-content';
import { pageNavigationReady } from '../../history/page-navigation';
import { SEGMENTED_TRACK, SEGMENT_ICON, SegmentedRadioGroup as RadioGroup } from '../components/segmented';
import { spriteGlyph } from '../components/sprite-glyph';
import type { OnlineAuthor, OnlineTag } from '../follow/online-vocab';
import {
  INDEX_TITLES, IDENTITY_CATEGORIES, ONLINE_TAG_CATEGORIES, TAG_CATEGORIES, countText, flatItems, indexQuery, indexRoute, indexSource, isCompany,
  isPeople, tagGroups, type IndexKind, type IndexPage as Page, type IndexPerson, type IndexProps,
  type IndexRoute, type IndexScope, type IndexTag, type PeopleLayout,
} from './index-data';
import { OnlineAuthors, PeopleGrid } from './index-people';
import { TagAlphabet, TagCloud, TagDock, TagFilters, type TagEntry } from './index-tags';
import { TagManager } from './tag-manager';

/* Labels and agencies are two kinds of entities, not two filters over the same data: labels release videos, agencies supply people. So this toggle switches
   the address. The clapperboard stands for labels, the briefcase for agencies; each glyph speaks for its own thing. */
const MAKER_TABS: BoardTab<'studios' | 'agencies' | 'series'>[] = [
  { value: 'studios', label: 'Labels', symbol: 'clapperboard' },
  { value: 'series', label: 'Series', symbol: 'list' },
  { value: 'agencies', label: 'Agency', symbol: 'briefcase' },
];
/* Local and online are two vocabularies: counting scope, category split, and click destinations all differ, so these are page-level Tabs too. */
const SCOPE_TABS: BoardTab<IndexScope>[] = [
  { value: 'local', label: 'Local', symbol: 'hard-drive' },
  { value: 'online', label: 'Online', symbol: 'rss' },
];
const PEOPLE_TABS: BoardTab<'performers' | 'creators' | 'online'>[] = [
  { value: 'performers', label: 'Artists', symbol: 'user-round' },
  { value: 'creators', label: 'Sellers', symbol: 'user-round' },
  { value: 'online', label: 'Online', symbol: 'rss' },
];

/* The company cell shows a logo, not a face; reusing the performer wording would promise "portrait avatar" while the screen shows a square logo.
   The tier is still the same setting value; only the wording differs. */
const LAYOUTS: Record<'people' | 'company' | 'series', readonly (readonly [PeopleLayout, string, string])[]> = {
  people: [['big', 'Large · Portrait avatar', 'maximize'], ['compact', 'Compact · Round avatar', 'layout-grid']],
  company: [['big', 'Large · Full logo', 'maximize'], ['compact', 'Compact · Round logo', 'layout-grid']],
  series: [['big', 'Large · Series images', 'maximize'], ['compact', 'Compact · Series images', 'layout-grid']],
};

function LayoutSwitch(
  { kind, layout, onChange }: { kind: IndexKind; layout: PeopleLayout; onChange(layout: PeopleLayout): void },
) {
  return (
    <RadioGroup aria-label={`${INDEX_TITLES[kind]} index layout`} orientation="horizontal" value={layout}
      onChange={(next) => onChange(next as PeopleLayout)} data-index-layout=""
      className={`flex-none ${SEGMENTED_TRACK}`}>
      {LAYOUTS[kind === 'series' ? 'series' : isCompany(kind) ? 'company' : 'people'].map(([value, label, symbol]) => {
        const Glyph = spriteGlyph(symbol);
        return (
          <Radio key={value} value={value} aria-label={label} className={SEGMENT_ICON}>
            <span title={label} className="contents"><Glyph className="size-4" /></span>
          </Radio>
        );
      })}
    </RadioGroup>
  );
}

type Item = IndexPerson | IndexTag | OnlineAuthor | OnlineTag;

export function IndexPage(props: IndexProps) {
  const [managing, setManaging] = useState(false);
  const [route, setRoute] = useState<IndexRoute>(() => indexRoute(
    { kind: props.kind, q: props.q, scope: props.scope, view: props.view, category: props.category },
  ));
  const incoming = JSON.stringify([props.kind, props.q, props.scope, props.view, props.category]);
  const [previousIncoming, setPreviousIncoming] = useState(incoming);
  if (incoming !== previousIncoming) {
    setPreviousIncoming(incoming);
    setRoute(indexRoute(props));
  }
  const [layout, setLayout] = useState<PeopleLayout>(props.layout);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [match, setMatch] = useState<'any' | 'all'>('any');
  const root = useRef<HTMLDivElement>(null);
  const { kind, q, scope, view, category } = route;
  const title = INDEX_TITLES[kind];
  const onlineTags = kind === 'tags' && scope === 'online';
  const onlineAuthors = kind === 'performers' && scope === 'online';

  /* The address's copy has been normalized (old links got renamed, unrecognized categories fall back to all): rewrite the address with replace;
     title, sidebar, and history all follow what is actually displayed on the page, and going back no longer lands on the old address.
     Writing the address is queued into a microtask: the shell's address write synchronously paints the sidebar and the route root also commits synchronously, both with `flushSync`, unpaintable during the commit phase.
     If this page has unmounted, nothing is written. */
  useEffect(() => {
    if (route.kind === props.kind && route.scope === props.scope && route.category === props.category) return;
    let live = true;
    queueMicrotask(() => { if (live) props.route(route, { replace: true }) });
    return () => { live = false };
  }, []);

  /* Selection belongs to the shell: closing clears the selection and the next open starts from zero, like the catalog page's multi-select. */
  useEffect(() => { if (!props.selectMode) setPicked(new Set()) }, [props.selectMode]);

  /* When changing filter, term list, or type, keep the controls and only show a waiting state in the results area. */
  const go = (patch: Partial<IndexRoute>, replace = false) => {
    if (patch.scope !== undefined) setManaging(false);
    const next = { ...route, ...patch };
    setRoute(next);
    props.route(next, { replace });
  };

  const { pagination, onChange: changePage } = useTagPagination(JSON.stringify(route));
  const query = indexQuery(indexSource(route), pagination.pageSize);
  const pagedKey = kind === 'tags' && (pagination.pageIndex || pagination.pageSize !== TAG_PAGE_SIZE)
    ? [...query.queryKey, 'page', pagination.pageIndex, pagination.pageSize] : query.queryKey;
  const result = useInfiniteQuery<Page<Item>>({
    queryKey: pagedKey,
    queryFn: ({ pageParam, signal }) => query.queryFn({ pageParam: pageParam as number, signal }),
    initialPageParam: kind === 'tags' ? pagination.pageIndex * pagination.pageSize : 0,
    getNextPageParam: kind === 'tags' ? () => undefined : query.getNextPageParam,
    enabled: !(managing && kind === 'tags'),
    placeholderData: keepPreviousData,
  });
  const items = flatItems(result.data);
  const pending = result.isPending || result.isPlaceholderData;
  const more = !!result.hasNextPage && !result.isPlaceholderData;
  const total = result.data?.pages[0]?.total;
  useEffect(() => {
    void pageNavigationReady(() => window.location.pathname === `/${kind}` && !!root.current?.isConnected,
      root.current?.querySelector('[data-index-body]'), { pending });
  }, [result.data, result.isPending, result.isPlaceholderData, route]);
  useTagPageBounds(kind === 'tags' && !result.isPlaceholderData ? total : undefined, pagination, changePage);
  const readout = kind === 'tags'
    ? (result.isPending || result.isError ? '' : `${(total ?? items.length).toLocaleString()} tags`)
    : countText(items.length, !!result.hasNextPage);
  /* Category counts change only with the roster, vocabulary, and filter words, never with the selected category. When switching categories before the new page arrives, reuse the counts the roster got last time:
     the category button row does not first collapse to "All" plus the current item and pop back open when data lands. The first time, with no counts yet, the whole row lays out,
     matching the shell's skeleton row, and empty categories collapse once counts arrive. */
  const countsKey = `${kind}:${scope}:${q}`;
  const lastCounts = useRef<{ key: string; counts: Record<string, number> } | null>(null);
  const pageCounts = result.data?.pages[0]?.categories;
  if (pageCounts && !result.isPlaceholderData) lastCounts.current = { key: countsKey, counts: pageCounts };
  const categoryCounts = pageCounts ?? (lastCounts.current?.key === countsKey ? lastCounts.current.counts : undefined);
  const waiting = result.isPending && !categoryCounts;
  const hasEntries = ([key]: readonly [string, string]) => key === 'all' || waiting || Number(categoryCounts?.[key] || 0) > 0;

  /* The box changed size, so both "does this image need a backing fill" and face zoom must be recomputed: the image finished loading long ago and will not fire another load.
     Do it before painting, otherwise the layout-switch frame uses geometry computed from the old box. */
  useLayoutEffect(() => { if (root.current) refitNativeImages(root.current) }, [layout]);

  const tags = useMemo<TagEntry[]>(() => kind === 'tags'
    ? (items as IndexTag[]).map((tag) => ({ ...tag, label: onlineTags ? tag.k : props.tagLabel(tag.k) })) : [], [items, kind, onlineTags]);
  const groups = useMemo(() => kind === 'tags' && view === 'alphabet'
    ? tagGroups(tags, (tag) => onlineTags ? tag : props.tagLabel(tag)) : [], [tags, view, kind, onlineTags]);

  const changeLayout = (next: PeopleLayout) => { setLayout(next); props.savePreference({ layout: next }) };

  const tabs = kind === 'tags'
    ? <SortableBoardTabs group="tags" tabs={SCOPE_TABS} value={scope} label="Vocabulary" onChange={(next) => {
      setPicked(new Set());
      // Online tags are all English, so the alphabet is their natural shape; swap it in when switching over, no second press needed.
      go({ scope: next, category: 'all', view: next === 'online' ? 'alphabet' : view });
    }} />
    : isCompany(kind) || kind === 'series'
        ? <BoardTabs tabs={MAKER_TABS} value={kind as 'studios' | 'agencies' | 'series'} label="Detail kinds"
          onChange={(next) => go({ kind: next })} />
        : null;

  const pressTag = (tag: string) => {
    if (onlineTags) { props.openFollowTag(tag); return }
    if (!props.selectMode) {
      const identity = tags.find(item => item.k === tag);
      if (identity?.entity_id) props.openEntity('tag', tag);
      else props.showTags([tag], 'all');
      return;
    }
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  };

  const categories = (onlineTags ? ONLINE_TAG_CATEGORIES : TAG_CATEGORIES).filter(hasEntries);

  const body = () => {
    if (pending) {
      return null;
    }
    if (result.isError) {
      return (
        <EmptyState icon={spriteGlyph('alert')} title={`Could not read ${title}`}
          actions={<Button variant="secondary" onClick={() => void result.refetch()}>Retry now</Button>}>
          {requestErrorMessage(result.error)}
        </EmptyState>
      );
    }
    if (!items.length) return <IndexEmpty kind={kind} filtered={!!q || category !== 'all'}
      online={onlineTags || onlineAuthors} onClear={() => go({ q: '', category: 'all' })} />;
    if (onlineAuthors) return <OnlineAuthors items={items as OnlineAuthor[]} layout={layout} props={props} />;
    if (isPeople(kind)) return <PeopleGrid kind={kind} items={items as IndexPerson[]} layout={layout} props={props} />;
    const actions = { online: onlineTags, picked, press: pressTag };
    return view === 'alphabet' ? <TagAlphabet groups={groups} actions={actions} /> : <TagCloud tags={tags} actions={actions} />;
  };

  return (
    <div ref={root} data-index-page={kind} className="flex min-w-0 flex-col">
      <div data-index-head="" className="mb-5 flex min-w-0 flex-wrap items-center gap-3 max-board-narrow:gap-x-2">
        <h2 data-index-title="" className="flex flex-none items-center text-display-4-medium whitespace-nowrap text-text-primary max-board-narrow:text-title-1-medium">
          {title}
        </h2>
        {isPeople(kind) ? (
          <span data-index-count="" className="text-caption-1-regular leading-5 whitespace-nowrap text-text-secondary tabular-nums max-board-narrow:order-1 max-board-narrow:basis-full">
            {/* No fetch, no readout: '0 items' reads as 'the roster is empty', which says something different from an error. */}
            <AsyncText text={pending ? undefined : result.isError ? '' : readout} busy={pending}
              placeholder={<span aria-hidden className="skeleton-sheen inline-block h-3.5 w-24 rounded-md" />} />
          </span>
        ) : null}
        {isPeople(kind) ? <LayoutSwitch kind={kind} layout={layout} onChange={changeLayout} /> : null}
        <LibraryShortcuts kind={kind === 'tags' ? 'tag' : kind === 'series' ? 'series' : kind === 'studios' ? 'studio' : kind === 'agencies' ? 'agency' : kind === 'creators' ? 'creator' : 'performer'} />
        {kind === 'tags' ? <Button variant={managing ? 'primary' : 'ghost'} iconOnly className="flex-none" data-tag-mode=""
          leadingIcon={spriteGlyph('pencil')} aria-label={managing ? 'Back to tag browsing' : 'Manage tags'} title={managing ? 'Back to tag browsing' : 'Manage tags'} aria-pressed={managing}
          onClick={() => { props.exitSelectMode(); setPicked(new Set()); setManaging(!managing) }} /> : null}
        <IndexSearch label={`Filter ${title}`} value={q} onQuery={(next) => { if (next !== q) go({ q: next }, !!next) }} />
      </div>
      {kind === 'performers' || kind === 'creators' ? (
        <BoardTabs tabs={PEOPLE_TABS} value={onlineAuthors ? 'online' : kind} label="People roster"
          onChange={(next) => {
            if (next === 'online') props.exitSelectMode();
            go({ kind: next === 'online' ? 'performers' : next,
              scope: next === 'online' ? 'online' : 'local', category: 'all' });
          }} />
      ) : null}
      {tabs}
      {managing && kind === 'tags' ? <TagManager key={scope} scope={scope} search={q} category={category} view={view}
        onCategory={next => go({ category: next })} onView={next => go({ view: next })}
        onJump={at => root.current?.querySelector(`[data-alpha-group="${at}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })} /> : <>
      {kind === 'performers' && scope === 'local' ? (
        <div aria-label="Identity groups" className={IDENTITY_ROW_CLASS}>
          {IDENTITY_CATEGORIES.filter((entry) => entry[0] === category || hasEntries(entry)).map(([key, label]) => (
            <Button key={key} variant={category === key ? 'primary' : 'secondary'} size="small"
              aria-pressed={category === key} onClick={() => go({ category: key })}>{label}</Button>
          ))}
        </div>
      ) : null}
      {kind === 'tags' ? (
        <TagFilters categories={categories} category={category} online={onlineTags} readout={readout}
          letters={groups.map(([letter]) => letter)} view={view}
          onCategory={(next) => go({ category: next })}
          onView={(next) => go({ view: next })}
          onJump={(at) => root.current?.querySelector(`[data-alpha-group="${at}"]`)
            ?.scrollIntoView({ block: 'start', behavior: 'smooth' })} />
      ) : null}
      <div data-index-body=""><SkeletonContent pending={pending} skeletonHtml={() => kind === 'tags'
        ? tagSkeletonHtml({ mode:view, pageSize:pagination.pageSize }) : indexSkeletonHtml({ kind, layout, mode: view })}>
        {body()}
      </SkeletonContent></div>
      {kind === 'tags' && !pending && !result.isError ? <div className="mt-5">
        <DataTableFooter label="Tags" total={total ?? items.length} pagination={pagination} onChange={changePage} unit="tags" pageUnit="items" pageSizes={TAG_PAGE_SIZES} />
      </div> : null}
      {more ? (
        <div className="mt-5 flex justify-center">
          {/* Something must move between the press and the next batch painting: this stretch is one network round trip plus a screen of avatars, and only graying the key
              cannot say "still working" apart from "clicked, nothing happened". The pressed key gets a Spinner (same as the playback wall's "Load more"),
              the label stays unchanged, the key is wide enough for the spinner, and the content below does not jump. */}
          <Button variant="secondary" data-index-more="" className="min-w-31"
            disabled={result.isFetchingNextPage} aria-busy={result.isFetchingNextPage || undefined}
            onClick={() => void result.fetchNextPage()}>
            {result.isFetchingNextPage ? <span className="contents" dangerouslySetInnerHTML={{ __html: spinnerHtml('Loading the next batch') }} /> : null}
            Load more
          </Button>
        </div>
      ) : null}
      {kind === 'tags' && !onlineTags && props.selectMode ? (
        <TagDock count={picked.size} match={match} onMatch={setMatch}
          onClear={() => setPicked(new Set())}
          onApply={() => { const chosen = [...picked]; setPicked(new Set()); props.showTags(chosen, match) }} />
      ) : null}
      </>}
    </div>
  );
}

const LABELS: Record<IndexKind, string> = {
  tags: 'Tags', performers: 'Artists', creators: 'Sellers', studios: 'Labels', agencies: 'Agency', series: 'Series',
};

/** Empty library, no filter results, and online sources without content yet each get an actionable destination. Copy matches the catalog page's empty states
 *  (`frontend/src/catalog-onboarding.ts`'s `catalogEmptyHtml`). */
function IndexEmpty(
  { kind, filtered, online, onClear }: { kind: IndexKind; filtered: boolean; online: boolean; onClear(): void },
) {
  if (filtered) {
    return (
      <EmptyState icon={spriteGlyph('search')} title="No matching content"
        actions={<Button size="small" onClick={onClear}>Clear filters</Button>}>
        Clear the filter or search to see all content.
      </EmptyState>
    );
  }
  // The online bucket counts what lives on the sources, and naming follows the sources' own usage: a performer page's online tab shows creators from followed sources.
  const label = online && kind === 'performers' ? 'Creators' : LABELS[kind];
  const follow = (
    <ButtonLink size="small" variant={online ? 'primary' : 'secondary'} href="/subscriptions?tab=add">Add follows</ButtonLink>
  );
  return (
    <EmptyState icon={spriteGlyph(kind === 'tags' ? 'tags' : 'user-round')} title={`No ${label} yet`}
      actions={online ? follow : <>
        <ButtonLink size="small" href="/settings/library">Add media</ButtonLink>
        {follow}
      </>}>
      {online ? `After you add a follows source and fetch content, ${label} from the source will show up here.` : 'After adding content and completing profiles, the corresponding information appears here.'}
    </EmptyState>
  );
}
