/* The route elements of the five index pages and the profile page (ADR-0031, "index and profile pages likewise open by route
 * tree match"): mounts when the page group matches `INDEX_ROUTES` or `ENTITY_ROUTES`, reads from the address who this page is
 * and with what parameters, then opens that page by address.
 *
 * The element renders nothing itself: pages register into `#index` via `openManagedRoute` and are rendered by
 * `ManagedSurface`. Before opening it first reports `surfaceChanged` so the shell tears down other surfaces and spreads the
 * home side open, then lays the skeleton; the moment the first screen is fetched, skeleton and full page swap together.
 *
 * When they open:
 * - Index elements key by page-open epoch (`useOpenEpoch()`): back/forward and unclaimed jumps each take a generation, so they
 *   remount and reopen by address; in-page address writes (filter words, tabs) are claimed by the shell, generation unchanged,
 *   no remount.
 * - Profile page elements key by kind and name: a different person remounts; the same person taking a new generation
 *   (back/forward to a different filter state) only pushes the new filters from the address to the rendered page, and the whole
 *   page reopens only if that page is not rendered.
 * - When the shell asks for a full reopen at the current address (`pageOpens` +1 in `@peach/shell`: after a batch write-back,
 *   or the opened person is the one already rendered), both element kinds reopen fully. While `pageOpens` is still 0 the shell
 *   has not started routing and the element only mounts.
 * - If details are stacked on this page at mount or epoch time (the page group matches on background): no reopen. When details
 *   close, if this page was never opened and nothing is rendered underneath (back/forward landed on details stacked over
 *   something else, mounted already covered), open the whole page by address; if rendered, leave it alone.
 *
 * Opening queues into microtasks: the router root commits synchronously in the same call as the history change, and tearing
 * down the previous page and rendering the first frame must also commit synchronously; doing it in the commit phase triggers
 * flushSync warnings. The shell subscribes to history before the router root, so its title and sidebar round runs first. */
import { useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { pageNavigationReady, rememberPageState, restoredPageState, restoringPage } from '../../../history/page-navigation';

import { appSettingsStore } from '@peach/appearance';
import { isOverlayPath, managedEntry, openManagedRoute, peachHistory, shellNavigate, updateManagedRoute } from '@peach/history';
import { ROUTE_ENTITIES, entityPath } from '@peach/legacy/core';
import { apiGet } from '../../../api';
import { queryClient } from '../../query';
import type { EntityPageData } from '../../entity-page/entity-page';
import { pageOpens, selectMode, subscribeShell, writeShell } from '@peach/shell';

import { indexParams, paintIndexSkeleton, peopleLayoutOf, type IndexPageKind } from '../../../index-skeleton';
import type { EntityPageProps } from '../../entity-page/entity-page';
import { ShellActionsContext, useOpenEpoch } from '../router';
import type { EntityPageShell, EntityRoutePath, ShellActions } from '../shell-actions';

const readOpens = () => pageOpens;
const readSelectMode = () => selectMode;
const indexHost = () => document.getElementById('index');

/** `usePageOpen`'s two optional judgments. `shown()`: whether this page is painted right now, by which never-opened elements decide whether to open when details close.
 *  `onCovered()`: called once when mounted or when taking a generation while covered by details. */
export interface PageOpenOptions {
  readonly shown?: () => boolean;
  readonly onCovered?: () => void;
}

/** When this cell opens by address. `run(fresh, live)`: `fresh` true is a whole-page open (mounted, or the shell requests a reopen), false is the same
 *  element receiving a new generation; `live()` returns false after the element unmounts or opens again. The follows page and playlist page elements use it too. */
export function usePageOpen(
  epoch: number, run: (fresh: boolean, live: () => boolean) => void, options: PageOpenOptions = {},
): void {
  const opens = useSyncExternalStore(subscribeShell, readOpens);
  /* Re-renders on every navigation, so details stacking on and coming off are both visible. The page group supplies the background address; whether something is stacked on is read from the real address. */
  useLocation();
  const covered = isOverlayPath(peachHistory.navigation.location.pathname);
  const seen = useRef({ mounted: true, epoch: -1, opens: -1, run: 0, opened: false });
  const latest = useRef({ run, options });
  useLayoutEffect(() => { latest.current = { run, options } });
  useEffect(() => {
    const mark = seen.current;
    mark.mounted = true;
    return () => { mark.mounted = false };
  }, []);
  useEffect(() => {
    if (opens === 0) return;
    queueMicrotask(() => {
      const mark = seen.current;
      if (!mark.mounted) return;
      /* Read `pageOpens` at this moment: when the shell writes the address and mounts this cell and then immediately asks for a reopen, the two merge into one open. */
      const stale = mark.epoch !== epoch || mark.opens !== pageOpens;
      let fresh = mark.opens !== pageOpens;
      mark.epoch = epoch;
      mark.opens = pageOpens;
      if (isOverlayPath(peachHistory.navigation.location.pathname)) {
        if (stale) latest.current.options.onCovered?.();
        return;
      }
      if (!stale) {
        if (mark.opened || latest.current.options.shown?.()) {
          mark.opened = true;
          return;
        }
        fresh = true;
      }
      mark.opened = true;
      const mine = ++mark.run;
      latest.current.run(fresh, () => mark.mounted && mark.run === mine);
    });
  }, [epoch, opens, covered]);
}

/* ── Index ── */

async function openIndex(actions: ShellActions, kind: IndexPageKind, search: string, live: () => boolean) {
  const host = indexHost();
  if (!host) return;
  const path = `/${kind}` as const;
  const params = indexParams(kind, search);
  const layout = peopleLayoutOf(appSettingsStore().value.peopleLayout);
  const reuse = !!host.querySelector('[data-index-page]') && !host.hidden;
  if (!reuse) {
    actions.surfaceChanged('index', path);
    paintIndexSkeleton(host, params, layout);
    void pageNavigationReady(live, host, { pending: true });
  }
  /* In-page tier switching, saving layout, exiting selection, avatar, and destination all live in `ShellActions`; what travels with the open is only those four address items plus the current layout,
     selection key, and configuration permission. */
  const painted = await openManagedRoute(path,
    { ...params, layout, selectMode, configurable: !!actions.configurable?.() }, {
      container: host, isCurrent: live, reuse,
    });
  if (painted && live()) {
    actions.surfaceShown?.('index', path);
    void pageNavigationReady(live, host);
  }
}

/* What is drawn and shown inside `#index` is this page's index. */
function indexShown(path: string): boolean {
  const host = indexHost();
  const entry = host ? managedEntry(host) : null;
  return !!host && !host.hidden && !!entry && entry.path === path && entry.host.isConnected;
}

function IndexOpen({ epoch }: { epoch: number }) {
  const actions = useContext(ShellActionsContext);
  const location = useLocation();
  const kind = location.pathname.split('/').filter(Boolean)[0] as IndexPageKind;
  usePageOpen(epoch, (_fresh, live) => {
    if (actions) void openIndex(actions, kind, location.search, live);
  }, { shown: () => indexShown(`/${kind}`) });
  return null;
}

/** Elements shared by the five index pages. Selection keys belong to the shell: the moment a toggle changes it is pushed to the painted tab, and closing a page clears its selection. */
export function IndexMatch() {
  const epoch = useOpenEpoch();
  const on = useSyncExternalStore(subscribeShell, readSelectMode);
  const last = useRef(on);
  useEffect(() => {
    if (last.current === on) return;
    last.current = on;
    if (window.location.pathname === '/tags') updateManagedRoute(indexHost(), { selectMode: on });
  }, [on]);
  return <IndexOpen key={epoch} epoch={epoch} />;
}

/* ── Profile ── */

/** This piece of the URL: decode the whole thing first, then split by segment (a slash inside a name swallows every remaining segment, empty segments do not count), same as the shell's `matchPath`. */
export function entityTarget(pathname: string): { segment: string; kind: string; name: string } | null {
  let path: string;
  try { path = decodeURIComponent(pathname) } catch { return null }
  const [segment = '', ...rest] = path.split('/').filter(Boolean);
  const kind = Object.hasOwn(ROUTE_ENTITIES, segment) ? ROUTE_ENTITIES[segment] : undefined;
  const name = rest.join('/');
  return kind && name ? { segment, kind, name } : null;
}

/* The cards' helpers and actions are the catalog's own, roster cells fetch images like the index page, and the photo wall adds one thing: locating the source file of a local image in the lightbox. One copy is kept per
   set the shell hands in, and every open hands out the same object. */
const cards = new WeakMap<ShellActions, EntityPageProps['card']>();
function entityCard(actions: ShellActions): EntityPageProps['card'] {
  let card = cards.get(actions);
  if (!card) {
    card = {
      helpers: { ...actions.grid.helpers, personAvatar: actions.personAvatar },
      actions: { ...actions.grid.actions, revealSource: actions.revealSource },
    };
    cards.set(actions, card);
  }
  return card;
}

/* What is drawn inside `#index` is the profile page. */
function entityShown(): boolean {
  const host = indexHost();
  const entry = host ? managedEntry(host) : null;
  return !!entry && entry.path.endsWith('/*') && entry.host.isConnected;
}

async function openEntity(
  actions: ShellActions, shell: EntityPageShell, target: { segment: string; kind: string; name: string },
  pathname: string, search: string, live: () => boolean, resolvedEntity: EntityPageData,
) {
  const host = indexHost();
  if (!host) return;
  const { segment, kind, name } = target;
  if (!live()) return;
  writeShell({ entityJavLayout: false });
  /* 卡外面依次是交集条与玻璃浮层、新作和正文，顶到底一条线。身份资料就绪时将四块宿主放进页面；
     其余区域独立加载。资料卡、浮层与正文各带一层 `.peach-react`（React 子树的样式
     范围）；新作那一行是遗留层的卡片，宿主不进这个范围。 */
  const frame = document.createElement('template');
  const reserveFeed = !!host.querySelector('.feednew');
  frame.innerHTML = `<div data-entity-hero><div class="peach-react"></div></div>
    <div data-entity-filter><div class="peach-react"></div></div>
    <section class="feednew" data-feed-new aria-label="New releases not in library" ${reserveFeed ? 'aria-busy="true"' : 'hidden'}></section>
    <div data-entity-body><div class="peach-react"></div></div>`;
  const parts = [...frame.content.childNodes];
  const hero = frame.content.querySelector('[data-entity-hero]')!;
  const hosts = {
    filter: frame.content.querySelector('[data-entity-filter]>.peach-react')!,
    feed: frame.content.querySelector<HTMLElement>('[data-feed-new]')!,
    body: frame.content.querySelector('[data-entity-body]>.peach-react')!,
  };
  const open = { ...shell.props(kind, name, search), ...restoredPageState<Pick<EntityPageProps, 'seed' | 'revision' | 'jav'>>('entity') };
  rememberPageState('entity', { seed: open.seed, revision: open.revision, jav: open.jav });
  /* Whether this page is in JAV context is inferred by the page from the first page of videos and written back into the shell's state: the shell's sort options, the sidebar fetch, and the card layouts all read it. */
  const props: EntityPageProps = {
    ...open, hosts, card: entityCard(actions), resolvedEntity, restoreNavigation: restoringPage(),
    actions: { ...open.actions, javContext: (on) => { writeShell({ entityJavLayout: !!on }) } },
  };
  const painted = await openManagedRoute(`/${segment}/*` as EntityRoutePath, props, {
    container: host, isCurrent: live,
    beforePlace: () => actions.surfaceChanged('entity', pathname),
    place: (container) => { container.replaceChildren(...parts); return hero.firstElementChild as HTMLElement },
  });
  if (!painted || !live() || !entityShown()) return;
  actions.surfaceShown?.('entity', pathname);
  void pageNavigationReady(live, hosts.filter);
}

function EntityOpen({ target }: { target: { segment: string; kind: string; name: string } }) {
  const actions = useContext(ShellActionsContext);
  const epoch = useOpenEpoch();
  const location = useLocation();
  usePageOpen(epoch, (fresh, live) => {
    const shell = actions?.entity;
    if (!actions || !shell) return;
    void (async () => {
      if (fresh || !entityShown()) {
        actions.surfaceChanged('entity', location.pathname);
        await shell.loading(target.kind, target.name, live);
        if (!live()) return;
        void pageNavigationReady(live, indexHost(), { pending: true });
      }
      const params = new URLSearchParams({ kind: target.kind });
      params.set(/^[0-9]+$/.test(target.name) ? 'id' : 'name', target.name);
      const entity = await queryClient.fetchQuery({ queryKey: ['entity-route', target.kind, target.name],
        queryFn: ({ signal }) => apiGet<EntityPageData>(`/api/entity?${params}`, signal), staleTime: restoringPage() ? Infinity : 0 })
        .catch(() => null);
      if (!live()) return;
      if (entity?.redirect) {
        shellNavigate(entityPath(entity.redirect.kind, entity.redirect.name, entity.redirect.id) + location.search + location.hash,
          { replace: true, state: peachHistory.navigation.location.state });
        return;
      }
      if (!entity?.id || entity.error) {
        shell.missing(target.kind);
        void pageNavigationReady(live);
        return;
      }
      const name = String(entity.canonical_name || target.name);
      const path = entityPath(target.kind, name, Number(entity.id));
      if (path !== location.pathname) {
        shellNavigate(path + location.search + location.hash, { replace: true, state: peachHistory.navigation.location.state });
        return;
      }
      if (!fresh && shell.refresh(target.kind, name, location.search)) {
        void pageNavigationReady(live, indexHost()?.querySelector('[data-entity-filter]'));
        return;
      }
      void openEntity(actions, shell, { ...target, name }, location.pathname, location.search, live, entity);
    })();
  }, { shown: () => entityShown() && !indexHost()?.hidden });
  return null;
}

/** Elements shared by the profile page's five modes: keyed by kind and name, so the same person does not remount when filters change. */
export function EntityMatch() {
  const target = entityTarget(useLocation().pathname);
  return target ? <EntityOpen key={JSON.stringify([target.kind, target.name])} target={target} /> : null;
}
