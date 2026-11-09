/* The entity profile page (rendered by the route tree into `#index`, `ENTITY_ROUTES` in `managed-routes.tsx`): profile card,
 * filter overlay, new-releases row and body, one root with four hosts.
 *
 * The profile card renders in the host the shell hands over (the `[data-entity-hero]` slot); the overlay, new releases and
 * body portal into the other three the shell laid out: the overlay's stickiness needs its parent to be `#index` itself, and
 * the new-releases row is a legacy-layer card outside the React subtree's style scope, so each of the four guards its own
 * host. All in-page state lives here: current view, roster versus videos, the photo wall's seed and paging; filters and media
 * view read the address bar (the shell's pushed `filters`/`media`), and changing them only calls `actions.route`. */
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@peach/legacy/core';
import { tagLabel } from '@peach/legacy/tags';
import { confirmModal } from '@peach/legacy/ui';

import { Button, ButtonLink } from '@/components/base/buttons/button';
import { EntityFolderWorkspace } from '../catalog-folders/catalog-folders-page';

import { errorMessage } from '../../api';
import type { MediaCardLayout } from '../catalog-grid/types';
import { EmptyState } from '../components/empty-state';
import { RetryNote } from '../components/grid-reveal';
import { spriteGlyph } from '../components/sprite-glyph';
import type { EntityBodyActions, EntityPhotos, EntityRoster } from '../entity-body/entity-body';
import { EntityBodyPage } from '../entity-body/entity-body-page';
import { EntityOnline } from '../entity-body/entity-online';
import type {
  EntityFilterActions, EntityFilterHelpers, EntityFilterTag, EntityPhotoHead, EntityVideoHead, EntityView, EntityViewKeys,
} from '../entity-filter/entity-filter';
import { EntityFilterPage } from '../entity-filter/entity-filter-page';
import type { EntityHeroActions, EntityHeroHelpers } from '../entity-hero/entity-hero';
import { EntityHeroPage } from '../entity-hero/entity-hero-page';
import { feedNewKey, feedNewOptions, postFeedAction } from '../feed-new/feed-new';
import { queryClient } from '../query';
import { pageNavigationReady, rememberPageState } from '../../history/page-navigation';
import {
  EMPTY_MEDIA, codeSetsOf, entityKey, entityOptions, entityPhotosKey, fetchItems, itemsOptions,
  photosOptions, tagList, tagPressed, type EntityPageData, type EntityPageProps, type PhotoPage,
} from './entity-page';
import { useEntityOnline } from './use-entity-online';
import { PENDING_REFETCH_MS } from '../components/pending-work';

export function EntityPage(props: EntityPageProps) {
  const { kind, name } = props;
  const entity = useQuery(entityOptions(kind, name));
  /* When the name matches no one, `/api/entity` returns `{error}`: swap the whole block for the shell's empty state instead of leaving a skeleton flickering. The empty state is
     legacy-layer markup, kept outside the React subtree's style scope. */
  const missing = !!entity.data?.error;
  const canonical = entity.data?.canonical_name;
  const redirect = entity.data?.redirect ?? (canonical && canonical !== name ? { kind, name: canonical } : undefined);
  const { actions } = props;
  useLayoutEffect(() => { if (missing) actions.missing() }, [actions, missing]);
  /* Switching to the canonical profile page is queued in a microtask: the shell's page change relays out the page header and selection state, a path that may hit the bulk bar's `flushSync`,
     which cannot render during the commit phase. If this generation has unmounted, skip the switch. */
  useLayoutEffect(() => {
    if (!redirect) return;
    let live = true;
    queueMicrotask(() => { if (live) actions.openEntity(redirect.kind, redirect.name, true) });
    return () => { live = false };
  }, [actions, redirect?.kind, redirect?.name]);
  if (entity.isError) return <RetryNote message={errorMessage(entity.error)} onRetry={() => { void entity.refetch() }} />;
  if (!entity.data || missing || redirect) return null;
  return <EntityLoaded {...props} entity={entity.data} />;
}

/** An epoch that increments whenever the key changes: the video grid and the photo wall rekey by it, and skeleton and continuation pages both start over. */
function useRevision(key: string): number {
  const [seen, setSeen] = useState({ key, n: 1 });
  if (seen.key === key) return seen.n;
  const next = { key, n: seen.n + 1 };
  setSeen(next);
  return next.n;
}

const newSeed = () => String(((Date.now() ^ (Math.random() * 1e9 | 0)) >>> 0) % 99991);

/** The photo screen's readout: local images and samples counted separately; when only samples exist, no '0 images' is written. */
function photoReadout(page: PhotoPage, codeSets: number) {
  return `Photos - ${[
    page.total || !codeSets ? `${(page.total || 0).toLocaleString()} images` : '',
    codeSets ? `stills ${(page.sample_total || 0).toLocaleString()} images · ${codeSets.toLocaleString()} videos` : '',
  ].filter(Boolean).join(' · ')}`;
}

function EntityLoaded(props: EntityPageProps & { entity: EntityPageData }) {
  const { kind, name, entity, filters, media, helpers, actions, hosts } = props;
  const company = kind === 'agency' || kind === 'studio';
  /* The people under an agency do not go into the row of small round avatars at the bottom of the profile card: that row is "Co-performers", a side note; the roster is this page's
     body. On a studio page the roster is the labels under it, and the co-performers row stays at the card bottom as usual. */
  const roster = kind === 'agency' ? (entity.related_performers || []) : kind === 'studio' ? (entity.labels || []) : [];
  const entityId = Number(entity.id) || 0;

  /* ── Photos: the whole-set copy counts how many photo files the set has and whether any render; the wall reads the current set (the whole set or one album). ── */
  const base = useInfiniteQuery(photosOptions(kind, name, 0, ''));
  const basePage = base.data?.pages[0];
  const basePhotos = basePage && !basePage.error ? basePage : null;
  const photoCount = basePhotos ? (basePhotos.total || 0) + (basePhotos.sample_total || 0) : 0;
  const photosAvailable = (basePhotos?.total || 0) > 0 || codeSetsOf(basePhotos).length > 0;
  /* Sources bound to this person in follows (ADR-0096): when present there is an extra online view. With no local videos at all, the video view is empty,
     the video button does not appear, and the page lands on online. */
  const followKey = kind === 'creator' ? entity.follow?.key || '' : '';
  const onlineOnly = !!followKey && !entity.asset_count;
  const mediaNow = media.media === 'photos' && (base.isPending || base.isError || basePage?.error || photosAvailable) ? media
    : (media.media === 'online' || onlineOnly) && followKey ? { media: 'online' as const, set: 0 } : EMPTY_MEDIA;

  /* The roster and media do not share the URL: the URL only knows `media`, the roster is the default view of agency and studio pages, and entering the page lands there.
     A filter change returns to videos: tags are video filters, and staying in the roster would both ignore them and leave the tag bar contradicting itself. */
  const [rosterView, setRosterView] = useState<'people' | 'videos'>('people');
  const filterKey = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const [seenFilters, setSeenFilters] = useState(filterKey);
  if (seenFilters !== filterKey) {
    setSeenFilters(filterKey);
    setRosterView('videos');
  }
  const view: EntityView = company && rosterView === 'people' && roster.length ? 'people' : mediaNow.media;

  /* -- Online: filters and fetching match the follows page, filtered only by this person's author key -- */
  const online = useEntityOnline(followKey, view === 'online', {
    photoLayout: props.photoLayout, photoLayouts: props.photoLayouts, imagesOnly: props.followImagesOnly,
    setImagesOnly: props.follow.actions.setImagesOnly,
  });
  const photoWall = view === 'photos' || (view === 'online' && online.media === 'images');

  /* The avatar has changed a few times. Both the profile card and the video grid fold the image into their own state (the grid only rebuilds from a new first page when the generation
     changes), so refetching new data is not enough; the key must change to force a rebuild before the version in the new image URL reaches the page. */
  const [avatarEpoch, setAvatarEpoch] = useState(0);

  /* 资料还在补全时资料卡每隔几秒重取一次（`entityOptions` 的 `refetchInterval`）。每补完一项，头像、
     作品署名与照片都可能换了：同换头像那样作废作品、照片与新作，换键重建，不用刷新页面。 */
  const pendingCount = entity.pending_work?.length || 0;
  const lastPending = useRef(pendingCount);
  useEffect(() => {
    const finished = pendingCount < lastPending.current;
    lastPending.current = pendingCount;
    if (!finished) return;
    actions.avatarChanged();
    setAvatarEpoch((epoch) => epoch + 1);
    void queryClient.invalidateQueries({ queryKey: ['entity-items', kind, name] });
    void queryClient.invalidateQueries({ queryKey: ['entity-photos', kind, name] });
    if (entityId) void queryClient.invalidateQueries({ queryKey: feedNewKey(entityId) });
    if (pendingCount) return;
    /* 全部补完、轮询停下之后再取一次：最后一项结算与它顺手写进的别名、外链可能差一两秒才落地。 */
    const settle = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: entityKey(kind, name) });
    }, PENDING_REFETCH_MS);
    return () => window.clearTimeout(settle);
  }, [actions, entityId, kind, name, pendingCount]);

  /* ── Videos ── */
  const itemsQuery = itemsOptions(props);
  const items = useQuery(itemsQuery);
  const itemsRevision = useRevision(JSON.stringify([itemsQuery.queryKey, avatarEpoch]));
  /* Direct visits or refreshes to the profile page have no `jav=1` in the URL: restore the performer/studio context from the first page's real `is_jav`, so the layout switch
     does not only coincidentally exist when entering from the JAV home. Only the entry copy counts; in-page filter changes do not alter the context. */
  const [initialJav, setInitialJav] = useState<boolean | null>(() => props.jav || props.layout.active ? true : null);
  if (initialJav === null && items.data) setInitialJav((items.data.items || []).some((item) => item.is_jav));
  const javPage = (kind === 'performer' || kind === 'studio') && !!(initialJav ?? props.jav);
  useLayoutEffect(() => { actions.javContext(javPage) }, [actions, javPage]);
  const layout = useMemo<MediaCardLayout>(() => (props.layout.active === javPage ? props.layout
    : { ...props.layout, active: javPage }), [props.layout, javPage]);
  const opts = { jav: props.jav, seed: props.seed };
  const fetchPage = useCallback(
    (offset: number, signal: AbortSignal, options?: Parameters<typeof fetchItems>[6]) =>
      fetchItems(kind, name, filters, opts, offset, signal, options),
    // Continuation pages use the same query as page one: the epoch follows the key, and the key already carries the filters, seed and JAV toggle.
    [itemsRevision]);

  /* ── Photo wall ── */
  const [seeds, setSeeds] = useState<Record<number, string>>({});
  const wallSet = mediaNow.set;
  const wallSeed = seeds[wallSet] || '';
  const wall = useInfiniteQuery({ ...photosOptions(kind, name, wallSet, wallSeed), enabled: view === 'photos' });
  const wallPage = wall.data?.pages[0];
  const wallRevision = useRevision(JSON.stringify(entityPhotosKey(kind, name, wallSet, wallSeed)));
  const photos = useMemo<EntityPhotos | null>(() => {
    const pages = wall.data?.pages;
    if (!pages?.[0] || pages[0].error) return null;
    const first = pages[0];
    return {
      revision: wallRevision,
      codeSets: first.id ? [] : codeSetsOf(first),
      items: pages.flatMap((page) => page.items || []),
      total: first.total || 0,
      hasMore: !!pages[pages.length - 1]?.has_more,
    };
  }, [wall.data, wallRevision]);
  const wallRefetch = wall.refetch;
  const fetchNextPhotos = wall.fetchNextPage;

  /* ── New releases ── */
  const feed = useQuery({ ...feedNewOptions(entityId, helpers.feedRowHtml), enabled: !!entityId });
  const feedRevision = useRef(props.feedRevision);
  useEffect(() => {
    if (feedRevision.current === props.feedRevision) return;
    feedRevision.current = props.feedRevision;
    void queryClient.invalidateQueries({ queryKey: feedNewKey(entityId) });
  }, [entityId, props.feedRevision]);

  /* After a view change or a content batch change, sticky positioning must be recomputed once. */
  const hasItems = !!items.data;
  useEffect(() => { actions.painted(view, photoWall) },
    [actions, view, photoWall, itemsRevision, photos?.revision, hasItems, online.key]);
  useEffect(() => {
    if (!hosts.body.isConnected || document.getElementById('index')?.hidden) return;
    rememberPageState('entity', { seed: props.seed, revision: props.revision, jav: props.jav });
    if (!items.isPending && !wall.isPending) {
      void pageNavigationReady(() => hosts.body.isConnected && !document.getElementById('index')?.hidden, hosts.filter);
    }
  }, [hosts, props.seed, props.revision, props.jav, items.isPending, wall.isPending, filterKey, view]);

  /* ── Write operations ── */
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false }, []);
  const refreshEntity = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['entity-route'] });
    await queryClient.invalidateQueries({ queryKey: entityKey(kind, name) });
    await queryClient.invalidateQueries({ queryKey: ['entity-items', kind, name] });
  }, [kind, name]);
  const alias = useMutation({
    mutationFn: (payload: { alias: string; remove?: boolean }) => api('/api/entity-alias',
      { method: 'POST', body: JSON.stringify({ kind, name: entity.canonical_name, ...payload }) }) as Promise<{ added?: boolean; alias?: string }>,
    onSuccess: () => refreshEntity(),
  });
  const rename = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => api('/api/entity-name',
      { method: 'POST', body: JSON.stringify({ kind, name: from, canonical: to }) }) as Promise<{
        changed?: boolean; canonical_name?: string; previous_name?: string }>,
    onSuccess: () => refreshEntity(),
  });
  const follow = useMutation({
    mutationFn: (on: boolean) => api('/api/feeds/source',
      { method: 'POST', body: JSON.stringify({ action: 'follow', entity_id: entityId, enabled: on }) }),
    onSuccess: (_data, on) => queryClient.setQueryData<EntityPageData>(entityKey(kind, name),
      (current) => (current ? { ...current, feed: { ...current.feed, following: on } } : current)),
  });

  const bindFollow = useMutation({
    mutationFn: (key: string) => api('/api/follow/creator',
      { method: 'POST', body: JSON.stringify({ entity_id: entityId, key }) }),
  });

  const heroActions = useMemo<EntityHeroActions>(() => ({
    openEntity: actions.openEntity,
    /* Changing the common name rewrites the whole entity's flat projection, so the cost is stated before asking. Confirm button, title and success receipt share the single
       verb "Change common name"; when the write fails the popover stays put with the reason under the body, waiting for a retry. The URL switches to the new name and the shell re-enters this page. */
    chooseName: (chosen) => {
      const current = entity.canonical_name;
      if (chosen === current) return;
      void confirmModal({
        title: 'Change the canonical name',
        body: `"${chosen}" becomes the display name for this profile and "${current}" stays as an alias. Bylines on videos, search, and tags will all be updated.`,
        confirmLabel: 'Change the canonical name',
        onConfirm: () => rename.mutateAsync({ from: current, to: chosen }),
      }).then(({ confirmed, result }) => {
        const done = result as { changed?: boolean; canonical_name?: string; previous_name?: string } | undefined;
        if (!confirmed || !done?.changed) return;
        helpers.receipt(`Changed the canonical name to ${done.canonical_name}`, { undo: async () => {
          await rename.mutateAsync({ from: done.canonical_name || '', to: done.previous_name || '' });
          actions.openEntity(kind, done.previous_name || '');
        } });
        actions.openEntity(kind, done.canonical_name || '');
      });
    },
    addAlias: () => { void helpers.aliasForm(entity.user_aliases || [], (payload) => alias.mutateAsync(payload)) },
    follow: async (on) => {
      try {
        await follow.mutateAsync(on);
      } catch (error) {
        helpers.failure(on ? 'Subscribe to new releases' : 'Unsubscribe from new releases', error);
        throw error;
      }
    },
    /* When "Subscribe to new releases" turns on, the server immediately runs one fetch in the background: wait for that run to finish, then refetch the new releases row once. The wait is capped at
       the order of that run's own duration, and stops once the page navigates away. */
    refreshFeedAfterCheck: () => {
      void (async () => {
        for (let tries = 0; tries < 40 && alive.current; tries += 1) {
          await new Promise((resolve) => { setTimeout(resolve, 3000) });
          const job = await (api('/api/feeds/check') as Promise<{ status?: string }>).catch(() => null);
          if (!job || job.status !== 'running') break;
        }
        if (alive.current) await queryClient.invalidateQueries({ queryKey: feedNewKey(entityId) });
      })();
    },
    feedAction: postFeedAction,
    /* The plus at the circle's corner: the avatar index has already been changed server-side. Profiles and the video list are refetched together (video card bylines show
       the same face), the profile card and video grid rebuild on the new data, and the shell's cached top three are invalidated along with them. */
    avatarPicked: () => {
      actions.avatarChanged();
      void refreshEntity().then(() => {
        if (alive.current) setAvatarEpoch((epoch) => epoch + 1);
      });
      void queryClient.invalidateQueries({ queryKey: feedNewKey(entityId) });
    },
    /* The profile card's "N updates" line: updates under this person stay in this page's online view without leaving; only other author keys go to the follow page. */
    openFollowAuthor: (key) => {
      if (key && key === followKey) actions.route(filters, { media: 'online', set: 0 });
      else actions.openFollowAuthor(key);
    },
    /* After a claim, updates from that set of sources are recorded under this person: the profile refetches, and readings and hints change with it. */
    confirmFollowAuthor: async (key, author) => {
      try {
        await bindFollow.mutateAsync(key);
      } catch (error) {
        helpers.failure('Creators in related follows', error);
        throw error;
      }
      helpers.receipt(`Credited the follow ${author} to ${entity.canonical_name}`);
      await refreshEntity();
    },
  }), [actions, alias, bindFollow, entity, entityId, filters, follow, followKey, helpers, kind, name, refreshEntity, rename]);
  const heroHelpers = useMemo<EntityHeroHelpers>(() => ({
    portraitImg: () => helpers.portraitImg(kind, entity),
    wireScroller: helpers.wireDrag,
    wireFeedRow: helpers.wireFeedRow,
    receipt: helpers.receipt,
  }), [entity, helpers, kind]);

  /* ── Overlay ── */
  const filterActions = useMemo<EntityFilterActions>(() => ({
    /* The view switches the moment the button is pressed, the glass slides along, and nothing waits for the view swap to finish. */
    setView: (next) => {
      if (next === view && !mediaNow.set) return;
      setRosterView(next === 'people' ? 'people' : 'videos');
      actions.route(filters, next === 'photos' || next === 'online' ? { media: next, set: 0 } : EMPTY_MEDIA);
    },
    setState: (value) => actions.route({ ...filters, state: value }, EMPTY_MEDIA),
    toggleTag: actions.toggleTag,
    clearFilter: actions.clearFilter,
    clearAll: actions.clearAll,
    setSort: actions.setSort,
    /* Shuffle: photos reshuffle this screen with a new seed, whether the whole set or a single album, and swap in the new wall once fetched, with the wait
       spinning on the key; videos use the site-wide seed, handed to the shell. */
    reshuffle: async () => {
      if (view !== 'photos') {
        const seed = actions.reshuffleVideos();
        const next = itemsOptions({ kind, name, filters: { ...filters, sort: 'seed' }, jav: props.jav, seed,
          revision: props.revision });
        await queryClient.fetchQuery(next).catch(() => null);
        return;
      }
      const seed = newSeed();
      const next = await queryClient.fetchInfiniteQuery(photosOptions(kind, name, wallSet, seed)).catch(() => null);
      if (!alive.current || !next?.pages[0] || next.pages[0].error) return;
      setSeeds((current) => ({ ...current, [wallSet]: seed }));
    },
    setJavLayout: actions.setJavLayout,
    setPhotoLayout: actions.setPhotoLayout,
    photoBack: () => actions.route(filters, { media: 'photos', set: 0 }),
    ...online.actions,
  }), [actions, filters, kind, mediaNow.set, name, online.actions, props.jav, props.revision, view, wallSet]);
  const filterHelpers = useMemo<EntityFilterHelpers>(() => ({
    wireDrag: helpers.wireDrag,
    wireScroller: helpers.wireScroller,
    sourceToolsHtml: helpers.sourceToolsHtml,
    wireSourceTools: (root) => helpers.wireSourceTools(root, () => { void wallRefetch() }),
  }), [helpers, wallRefetch]);

  /* Tags sit in profile order and the selected one does not jump forward: the tag just clicked is under the pointer, and yanking it away decides for the person
     where to look now. The count is videos under this person or label carrying that tag. */
  const tags: EntityFilterTag[] = (entity.tags || []).map((tag) => ({
    k: tag.k, label: tagLabel(tag.k), n: tag.n, selected: tagPressed(filters.tag, tag.k) }));
  /* Performer roster, videos, photos and online are this page's mutually exclusive views sharing one set of round buttons; the set is omitted when only one kind exists. */
  const viewKinds = [roster.length, !onlineOnly, photoCount, followKey].filter(Boolean).length;
  const views: EntityViewKeys | null = viewKinds > 1 ? {
    label: roster.length ? 'Page views' : 'Media kinds',
    people: roster.length ? { label: kind === 'studio' ? 'Labels' : 'Artists', count: roster.length,
      icon: kind === 'studio' ? 'clapperboard' : 'user-round' } : null,
    videos: onlineOnly ? null : { count: entity.asset_count || 0 },
    photos: photoCount ? { count: photoCount } : null,
    online: followKey ? { count: entity.follow?.n || 0 } : null,
  } : null;
  const video: EntityVideoHead = {
    sorts: helpers.sortKeys(filters.sort || 'new', filters.dir || '', javPage),
    jav: javPage ? { layout: props.javLayout, options: props.javLayouts } : null,
  };
  /* The photo row gets no sort keys: the database only has file name, size, and source for images. Inside one album, two extra source file keys appear. */
  const inSet = !!wallPage?.id && !wallPage.error;
  const photo: EntityPhotoHead | null = wallPage && !wallPage.error ? {
    back: inSet, shuffle: !!wallPage.total, layout: props.photoLayout, layouts: props.photoLayouts,
    setId: inSet ? Number(wallPage.id) : 0,
  } : null;
  /* When a person has no videos under their name (or filtering leaves none), the body is an empty state and the sort key row and shuffle in the bottom row have nothing to arrange, so they do not render. */
  const combo = helpers.comboItems(filters);
  const filtered = combo.length > 0 || !!filters.state;
  const worksEmpty = view === 'videos' && !!items.data && !(items.data.items || []).length;
  const showAll = () => actions.route(
    // Key names share the same group as the shell's `clearAll`, plus watch status.
    { ...filters, state: '', tag: '', creator: '', studio: '', owner: '' }, EMPTY_MEDIA);
  let readout = '';
  let busy = false;
  if (view === 'people') readout = `${kind === 'studio' ? 'Labels' : 'Performers'} · ${roster.length.toLocaleString()}`;
  else if (view === 'online') {
    busy = online.busy;
    readout = `Online · ${(online.total ?? entity.follow?.n ?? 0).toLocaleString()} updates`;
  }
  else if (view === 'videos') {
    busy = items.isPending;
    /* Which tags are selected is listed chip by chip on the intersection bar above, so the count only reports a number: repeating the tag names here, a few long tags
       would push this row off the page. */
    const picked = tagList(filters.tag).length;
    readout = items.data ? `Videos · ${(items.data.work_total ?? items.data.total ?? 0).toLocaleString()}${picked ? ` · ${picked.toLocaleString()} tags selected` : ''}` : '';
  } else if (wallPage && !wallPage.error) {
    readout = inSet ? `${wallPage.title} · ${(wallPage.total || 0).toLocaleString()} images`
      : photoReadout(wallPage, codeSetsOf(wallPage).length);
  } else busy = wall.isPending;

  /* ── Body ── */
  const bodyActions = useMemo<EntityBodyActions>(() => ({
    ...props.card.actions,
    /* The next page of local images; throws when the fetch fails, and a key press brings up a retry. */
    loadMorePhotos: async () => {
      const result = await fetchNextPhotos();
      if (result.isError) throw result.error;
    },
  }), [fetchNextPhotos, props.card.actions]);
  const rosterProps = useMemo<EntityRoster | null>(() => (roster.length
    ? { kind: kind === 'studio' ? 'studios' : 'performers', people: roster, layout: props.peopleLayout } : null),
  [kind, props.peopleLayout, roster]);

  return (
    <>
      <EntityHeroPage key={avatarEpoch} kind={kind} name={name} entity={entity} feedNew={feed.data ?? null}
        feedError={!feed.data && feed.isError ? errorMessage(feed.error) : undefined} retryFeed={() => { void feed.refetch() }}
        feedHost={entityId ? hosts.feed : null} jav={javPage} actions={heroActions} helpers={heroHelpers} />
      {createPortal(
        <EntityFilterPage kind={kind} name={name} view={view} views={views} state={filters.state || ''}
          states={props.states} tags={tags} combo={combo} readout={readout} busy={busy}
          video={worksEmpty ? null : video} photo={photo} online={view === 'online' ? online.head : null} actions={filterActions}
          helpers={filterHelpers} />,
        hosts.filter)}
      {createPortal(
        <EntityFolderWorkspace enabled={view === 'videos'}>{view === 'online'
          ? <EntityOnline view={online.view} media={online.media} result={online.result}
            data={online.data} visible={online.visible} context={online.context} photoSize={props.photoSize}
            photoLayout={props.photoLayout} imagesOnly={props.followImagesOnly} helpers={props.follow.helpers}
            actions={props.follow.actions} canLoadMore={props.canLoadMore} clearFilters={online.clearFilters} />
          : view === 'videos' && items.isError
          ? <RetryNote message={errorMessage(items.error)} onRetry={() => { void items.refetch() }} />
          : view === 'photos' && (wall.isError || wallPage?.error)
          ? <RetryNote message={wallPage?.error || errorMessage(wall.error)} onRetry={() => { void wall.refetch() }} />
          : view === 'photos' && !photos
          ? <div data-photo-wall="" data-size={props.photoSize} data-layout={props.photoLayout} role="status" aria-busy="true" aria-label="Reading photos">
              {Array.from({ length: 8 }, (_, index) => <button key={index} data-photo-cell="" disabled aria-hidden className="skeleton-sheen" />)}
            </div>
          : worksEmpty ? <WorksEmpty filtered={filtered} onShowAll={showAll}
            onOnline={followKey ? () => filterActions.setView('online') : undefined} />
          : (
            <EntityBodyPage kind={kind} name={name} view={view} roster={rosterProps} items={items.data ?? null}
              revision={itemsRevision} fetchPage={fetchPage}
              listScope={JSON.stringify([kind, name, filters, props.jav, filters.sort === 'seed' ? props.seed : ''])}
              restoreNavigation={props.restoreNavigation}
              photos={photos} photoSize={props.photoSize}
              photoLayout={props.photoLayout} helpers={props.card.helpers} actions={bodyActions} layout={layout}
              selectMode={props.selectMode} selected={props.selected} seekSeconds={props.seekSeconds}
              wireDrag={props.wireDrag} skeletonHtml={props.skeletonHtml} groupCollapse={props.groupCollapse}
              canLoadMore={props.canLoadMore} />
          )}</EntityFolderWorkspace>,
        hosts.body)}
    </>
  );
}

/** The video section has not a single one. When filtering leaves nothing, offer a path back to all videos: the watch status and the filters on the intersection bar are cleared together. */
function WorksEmpty({ filtered, onShowAll, onOnline }: { filtered: boolean; onShowAll(): void; onOnline?: () => void }) {
  return filtered ? (
    <EmptyState icon={spriteGlyph('search')} title="No matching videos"
      actions={<Button size="small" onClick={onShowAll}>Clear filters</Button>}>
      Clear filters to see every video under this name.
    </EmptyState>
  ) : (
    <EmptyState icon={spriteGlyph('film')} title="No videos yet"
      actions={onOnline ? <Button size="small" onClick={onOnline}>View online videos</Button>
        : <ButtonLink size="small" href="/">Browse library</ButtonLink>}>
      Videos added to library under this name will appear here.
    </EmptyState>
  );
}
