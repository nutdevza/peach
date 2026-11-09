/* Sidebar (ADR-0031 step 11f): the scrolling layer inside the left drawer.
 *
 * Resident component `sidebar` (the resident table in `router/managed-routes.tsx`): the route tree renders it into the shell's
 * resident `#drawerScroll`, the host being that node itself (the overlay scrollbar hangs on it, the track lives in `#drawer`).
 * At shell startup it synchronously writes a same-structure navigation skeleton into the host (`sidebarSkeletonHtml`); when
 * this surface opens, `place` clears the skeleton and the route tree renders the first frame (navigation only) in the same
 * task; the shell then moves the brand and the collapse button into the header row via `attached`, takes the handle, and pushes
 * the props it holds in.
 *
 * After that the shell only speaks through the handle `configureSidebar` provides: `render(props)` and `navChanged()` write this
 * module's store, notify via `flushSync`, and by the time they return the render is done. `navChanged` runs inside the
 * synchronous part of the shell's `route()`, so the glass measures from the old position to the new one. Page changes, filter
 * changes and context changes all land on the same component; the nav column and the glass on top of it are the same nodes
 * throughout. Swap the nodes and the glass's translation would start over from scratch, and all you would see is the current
 * item lighting up somewhere else.
 *
 * The glass renders on `#drawer` (a portal), not inside the scrolling layer: it must follow the column's vertical scroll yet not
 * be clipped by the scrolling layer's overscroll bounce. Translation and stretching go to the vertical variant of
 * `useViewGlide`, the same motion as the filter bar rows.
 *
 * The header row `[data-sidebar-head]` renders as an empty slot with no children: the brand and collapse button are the shell's
 * nodes, moved in by the shell. The component never renders into that slot, so re-renders leave them alone.
 *
 * Group collapse goes through the shared Collapse's `setCollapseOpen` (same as the settings page's `Disclosure`): a native
 * `details` gives keyboard and accessibility semantics, and `open` is not written as a controlled prop so the collapse
 * transition cannot be re-rendered back into expanded state.
 *
 * The host is not wrapped in `.peach-react`: this column always sits outside Preflight, buttons and font sizes inherit the
 * legacy layer's global rules, all styles live in `sidebar.css`, no utility classes. */
import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type MouseEvent, type ReactNode,
} from 'react';
import { createPortal, flushSync } from 'react-dom';

import { growCollapse, popBadges, setCollapseOpen } from '@peach/legacy/ui';

import { useViewGlide } from '../components/use-view-glide';
import { Icon } from '../settings-panel/icon';
import type {
  SidebarApi, SidebarChip, SidebarContent, SidebarDot, SidebarFacets, SidebarHost, SidebarProps,
} from './sidebar-api';
import { useCommitNavigationOrder } from './sidebar-order';
import { useSidebarReorder } from './use-sidebar-reorder';
import { resetSidebarOrder } from '../../sidebar';
import { NavigationOrderMenu } from '../components/navigation-order';

/* The home page item's key is an empty string; an empty string in dataTransfer counts as unwritten, so it gets a placeholder. */
const HOME = '__home__';
/* How many entries each group shows before "Expand all". */
const LIMITS = { creator: 26, tag: 30, tech: 16 } as const;
/* The duration slider's range (minutes): dragged all the way right it means "No limit". */
const DURATION_MAX = 180;

let host: SidebarHost | null = null;
/* One slice of the store: the generation of the props the shell pushes and of the nav pressed state (incremented when the shell says "re-read", with the glass settling on the new pressed item).
   Every write swaps in a new object, and subscribers compare by reference to detect change. */
let shown: { props: SidebarProps; epoch: number } = { props: { content: null, filters: {}, latest: null }, epoch: 0 };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/* After this surface throws and is unmounted by the error boundary nobody subscribes: pushed updates only land in the store, unpainted and unthrown. */
const api: SidebarApi = {
  render(next) { shown = { ...shown, props: next }; flushSync(notify) },
  navChanged() { shown = { ...shown, epoch: shown.epoch + 1 }; flushSync(notify) },
};

/** Wire up the host the shell provides and take back the sidebar's imperative entry. Called once; the shell's `loadSidebar` then opens this surface in the route tree, painting only
 *  navigation on the first frame, calling `attached` and handing over the handle once painted, and the shell immediately pushes in its props. */
export function configureSidebar(next: SidebarHost): SidebarApi {
  host = next;
  shown = { ...shown, props: { content: null, filters: {}, latest: null } };
  return api;
}

/** The resident table's face: reads this module's store and renders nothing until the host is attached. */
export function SidebarSurface() {
  const current = useSyncExternalStore(subscribe, () => shown);
  return host ? <Sidebar host={host} props={current.props} epoch={current.epoch} /> : null;
}

/* ── Whole column ── */

function Sidebar({ host: at, props: view, epoch }: { host: SidebarHost; props: SidebarProps; epoch: number }) {
  const version = useSyncExternalStore(at.store.subscribe, at.store.version);
  return (
    <>
      <div data-sidebar-head="" />
      <Navigation host={at} epoch={epoch} version={version} />
      {view.content ? <Groups host={at} content={view.content} filters={view.filters} latest={view.latest} /> : null}
    </>
  );
}

/* ── Navigation ── */

function Navigation({ host: at, epoch, version }: { host: SidebarHost; epoch: number; version: number }) {
  const commit = useCommitNavigationOrder(at.store);
  const order = at.store.value.sidebarOrder;
  const byKey = new Map(at.navCatalog.map((item) => [item[0], item]));
  const items = order.map((key) => byKey.get(key)).filter((item) => item !== undefined);
  const pressed = items.map(([key]) => at.navOn(key));
  const column = useRef<HTMLDivElement | null>(null);
  const pane = useRef<HTMLSpanElement | null>(null);
  const glideKey = `${epoch}:${version}:${items.map(([key], index) => pressed[index] ? key || HOME : '').join(',')}`;
  const glide = useViewGlide(pane, column, '[data-nav][aria-pressed="true"]', glideKey, { axis: 'y' });
  const { sync } = glide;

  /* Drawer open/close (width transitioning between 60 and 260 on desktop), the scroll layer resizing, and the brand moving into the title row all remeasure without animating;
     after open/close, a hovered cell does not count and the current item wins. */
  useEffect(() => {
    const scroll = at.scroll, drawer = scroll.parentElement;
    const head = scroll.querySelector<HTMLElement>(':scope > [data-sidebar-head]');
    const resize = new ResizeObserver(() => sync());
    [drawer, scroll, head].forEach((node) => { if (node) resize.observe(node) });
    /* Open and close events fire synchronously in the click callback, at the moment the whole page's styles have just gone dirty from the open/close class; measuring on the spot forces a full-tree reflow;
       move it to the next frame and measure together with the resize observer. */
    let frame = 0;
    const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync() }) };
    document.addEventListener('board:sidebar', later);
    return () => { resize.disconnect(); cancelAnimationFrame(frame); document.removeEventListener('board:sidebar', later) };
  }, [at, sync]);

  const reorder = useSidebarReorder(column, order, commit, () => requestAnimationFrame(sync));

  const drawer = at.scroll.parentElement;
  return (
    <>
      <div data-sidebar-nav="" ref={column} onPointerLeave={glide.leave}
        data-reordering={reorder.picked ? '' : undefined} onClickCapture={reorder.clickCapture}>
        {items.map(([key, label, glyph], index) => {
          const nudge = reorder.nudge(key);
          return (
          <button type="button" key={key || HOME} data-nav={key} aria-pressed={pressed[index]} aria-label={label}
            data-dragging={reorder.picked?.key === key ? '' : undefined}
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
            style={{ '--sidebar-picked-top': reorder.picked?.key === key ? `${reorder.picked.offset}px` : undefined,
              '--sidebar-nudge': `${nudge.distance}px`, '--sidebar-delay': `${nudge.delay}ms` } as CSSProperties}
            onClick={() => at.navTo(key)} onDoubleClick={() => at.navToTop()} onPointerEnter={glide.hover}
            {...reorder.bindings(key)}>
            {key === '' ? <img data-sidebar-home-logo="" src="/peach-logo-64.png"
              srcSet="/peach-logo-64.png 64w, /peach-logo-128.png 128w" sizes="24px" width={24} height={24} alt=""
              decoding="async" draggable={false} /> : <Icon name={glyph} />}
            <span>{label}</span>
          </button>
        )})}
        {reorder.hint ? <span data-sidebar-drop-line="" aria-hidden="true"
          style={{ '--sidebar-line-top': `${reorder.linePosition}px` } as CSSProperties}><span /></span> : null}
        <NavigationOrderMenu order={{ label: 'Left navigation', keys: order, defaults: resetSidebarOrder(order), commit }} />
        <span role="status" aria-live="polite" data-sidebar-order-status="">{reorder.announcement}</span>
      </div>
      {drawer ? createPortal(<span data-sidebar-glide="" aria-hidden="true" ref={pane} />, drawer) : null}
    </>
  );
}

/* ── Filter groups ── */

interface GroupSpec {
  title: string;
  kind: string;
  body: ReactNode;
  active: boolean;
}

const selectedValues = (filters: SidebarProps['filters'], key: string) =>
  String(filters[key] ?? '').split(',').filter(Boolean);

function countsOf(latest: SidebarFacets | null): Map<string, number> | null {
  if (!latest) return null;
  const counts = new Map<string, number>();
  const rows: [string, SidebarChip[]][] = [['loc', latest.locations], ['orient', latest.orientations],
    ['region', latest.regions], ['year', latest.years || []], ['creator', latest.creators], ['tag', latest.tags], ['tag', latest.tech]];
  for (const [key, chips] of rows) for (const chip of chips) counts.set(`${key}\n${chip.value}`, chip.n ?? 0);
  return counts;
}

function Groups({ host: at, content, filters, latest }: {
  host: SidebarHost; content: SidebarContent; filters: SidebarProps['filters']; latest: SidebarFacets | null;
}) {
  const key = content.kind === 'catalog' ? content.key
    : `follow:${content.selected.join(',')}:${content.tags.map((row) => row.value).join(',')}`
      + `:${(content.providers || []).map((row) => row.value).join(',')}:${filters.provider ?? ''}`
      + `:${content.duration ? 1 : 0}:${filters.dur_min ?? ''}:${filters.dur_max ?? ''}`;
  /* Whether count badges pop is decided by `popBadges` against the last seen values, not by whether nodes are newly created: asking once per new aggregation
     keeps an entire column of counts from popping together on a filter change. */
  useLayoutEffect(() => { if (content.kind === 'catalog') popBadges(at.scroll, 'drawer') }, [at, key, content.kind]);
  const groups = content.kind === 'catalog'
    ? catalogGroups(at, content.facets, filters, latest, key)
    : followGroups(at, content, filters);
  let index = 0;
  return groups.map((group) => group && (
    <Group key={group.title} title={group.title} kind={group.kind} active={group.active} index={index++} epoch={key}>
      {group.body}
    </Group>
  ));
}

function catalogGroups(
  at: SidebarHost, facets: SidebarFacets, filters: SidebarProps['filters'], latest: SidebarFacets | null, epoch: string,
): (GroupSpec | null)[] {
  const counts = countsOf(latest);
  const chips = (rows: SidebarChip[], key: string, multi: boolean): GroupSpec['body'] | null => {
    if (!rows.length) return null;
    const selected = selectedValues(filters, key);
    return <ChipList rows={rows} filterKey={key} multi={multi} selected={selected} counts={counts} host={at} />;
  };
  const spec = (title: string, kind: string, rows: SidebarChip[], key: string, multi: boolean, more?: keyof typeof LIMITS) => {
    if (!rows.length) return null;
    const selected = selectedValues(filters, key);
    const active = rows.some((row) => selected.includes(row.value));
    if (!more) return { title, kind, active, body: chips(rows, key, multi) };
    const source = more === 'creator' ? latest?.creators : more === 'tag' ? latest?.tags : latest?.tech;
    return {
      title, kind, active,
      body: <MoreList epoch={epoch} title={title} rows={rows} latest={source ?? null} limit={LIMITS[more]} filterKey={key}
        selected={selected} counts={counts} host={at} expandable={more !== 'tech'} />,
    };
  };
  return [
    spec('Source', 'src', facets.locations, 'loc', true),
    facets.duration
      ? { title: 'Duration', kind: 'meta', active: false, body: <Duration host={at} filters={filters} /> }
      : null,
    /* Origin sits right next to source: both answer "where did these videos come from", one for storage, one for the distribution system. Multi-select allowed. */
    spec('Origin', 'general', facets.regions, 'region', true),
    spec('Release year', 'meta', facets.years || [], 'year', true),
    spec('Aspect', 'meta', facets.orientations, 'orient', false),
    spec('Creators', 'artist', facets.creators, 'creator', false, 'creator'),
    spec('Content tags', 'general', facets.tags, 'tag', false, 'tag'),
    spec('Video properties', 'meta', facets.tech, 'tag', false, 'tech'),
    facets.followTags.length ? {
      title: 'Followed tags', kind: 'online', active: false,
      body: <FollowChips rows={facets.followTags} host={at} selected={null} badges />,
    } : null,
  ];
}

/* Follows page and follow details: same order as the catalog's column, source and duration first, content tags after. Source and duration go back to the follows page's filters,
   not the catalog's `commitContextFilter`. */
function followGroups(
  at: SidebarHost, content: Extract<SidebarContent, { kind: 'follow' }>, filters: SidebarProps['filters'],
): (GroupSpec | null)[] {
  const providers = content.providers || [];
  const provider = selectedValues(filters, 'provider');
  const selected = new Set(content.selected);
  return [
    providers.length ? {
      title: 'Source', kind: 'src', active: providers.some((row) => provider.includes(row.value)),
      body: <ChipList rows={providers} filterKey="provider" multi={false} selected={provider} counts={null} host={at}
        onToggle={(_key, value) => at.selectFollowProvider(value)} />,
    } : null,
    content.duration
      ? { title: 'Duration', kind: 'meta', active: false, body: <Duration host={at} filters={filters} commit={at.setFollowDuration} /> }
      : null,
    content.tags.length ? {
      title: 'Content tags', kind: 'online', active: content.tags.some((row) => selected.has(row.value)),
      body: <FollowChips rows={content.tags} host={at} selected={selected} badges={false} />,
    } : null,
  ];
}

/* On entry only the groups currently in effect are expanded. Hardcoding two groups as always open decides for the user which dimension to filter by, and the sidebar is only
   a screen tall; expanded sections push other groups out of view. Groups the user opened or collapsed themselves are remembered for this session. */
function wantOpen(title: string, active: boolean): boolean {
  let saved: string | null = null;
  try { saved = sessionStorage.getItem(`peach.sidebar.group.${title}`) } catch { /* With storage unavailable, use the pressed state */ }
  return saved !== null ? saved === 'open' : active;
}

function Group({ title, kind, active, index, epoch, children }: {
  title: string; kind: string; active: boolean; index: number; epoch: string; children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(() => wantOpen(title, active));
  const mounted = useRef(false);
  /* On first mount, commit the initial state to the DOM; with each new aggregate after that, groups nobody has toggled are re-derived from the pressed state. */
  useLayoutEffect(() => {
    const node = details.current, collapse = body.current;
    if (!node || !collapse) return;
    const want = mounted.current ? wantOpen(title, active) : open;
    mounted.current = true;
    if (node.open === want) return;
    node.open = want;
    collapse.inert = !want;
    collapse.style.height = '';
    if (collapse.classList.contains('ui-fcollapse')) collapse.classList.toggle('ui-fcollapse-settled', want);
    setOpen(want);
  }, [epoch]);
  const toggle = (event?: MouseEvent) => {
    event?.preventDefault();
    if (!details.current || !body.current) return;
    const next = !open;
    setCollapseOpen(details.current, body.current, next);
    setOpen(next);
    try { sessionStorage.setItem(`peach.sidebar.group.${title}`, next ? 'open' : 'closed') } catch { /* It just does not remember */ }
  };
  const collapseId = `sidebar-collapse-${index}`;
  return (
    <details ref={details} data-sidebar-group={title} data-sidebar-kind={kind}>
      <summary role="button" data-sidebar-toggle="" aria-expanded={open} aria-controls={collapseId} onClick={toggle}>
        <Icon name="chevron-right" /><span>{title}</span>
      </summary>
      <div ref={body} data-sidebar-collapse="" id={collapseId} inert={!open}>
        <div data-sidebar-collapse-body="">
          <div data-sidebar-body="" id={`sidebar-group-${encodeURIComponent(title)}`}>
            <GroupToggle.Provider value={toggle}>{children}</GroupToggle.Provider>
          </div>
        </div>
      </div>
    </details>
  );
}

/* The "collapse" chip at the list's end collapses the whole group: open/close belongs to `Group`, passed down through this layer. */
const GroupToggle = createContext<() => void>(() => {});

function Dot({ dot }: { dot?: SidebarDot }) {
  if (!dot) return null;
  if (dot.kind === 'glyph') return <Icon name={dot.name} />;
  if (dot.kind === 'image') return <img data-sidebar-source-icon="" src={dot.src} alt="" />;
  return <i data-sidebar-cost={dot.cost} />;
}

function ChipList({ rows, filterKey, multi, selected, counts, host: at, onToggle = at.toggleChip }: {
  rows: SidebarChip[]; filterKey: string; multi: boolean; selected: string[];
  counts: Map<string, number> | null; host: SidebarHost;
  /** Who receives the click: the catalog filter by default, swapped for the follows page's own. */
  onToggle?: SidebarHost['toggleChip'];
}) {
  return (
    <div data-sidebar-chips="">
      {rows.map((row) => {
        const n = row.n === null ? null : counts ? counts.get(`${filterKey}\n${row.value}`) ?? 0 : row.n;
        return (
          <button type="button" key={row.value} data-sidebar-chip="" aria-pressed={selected.includes(row.value)}
            data-key={filterKey} data-val={row.value} data-multi={multi ? '1' : '0'}
            data-offline={row.offline ? '' : undefined} disabled={!!row.offline} title={row.offline || row.label}
            onClick={() => onToggle(filterKey, row.value, multi)}>
            <Dot dot={row.dot} />
            <span data-sidebar-chip-label="">{row.label}</span>
            {n === null ? null : <span data-sidebar-count="" data-count-badge={`${filterKey}:${row.value}`}>{n.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* The expand key sits at the end of the roster; it says "this roster continues", and that message belongs where the roster breaks off. Size copies the ranking row's
   expand pill: an arrow says it all, no caption needed. Expanding re-lays the whole group from the latest aggregation. */
function MoreList({ epoch, title, rows, latest, limit, filterKey, selected, counts, host: at, expandable }: {
  epoch: string; title: string; rows: SidebarChip[]; latest: SidebarChip[] | null; limit: number; filterKey: string;
  selected: string[]; counts: Map<string, number> | null; host: SidebarHost; expandable: boolean;
}) {
  const toggleGroup = useContext(GroupToggle);
  const [shown, setShown] = useState<{ rows: SidebarChip[]; all: boolean } | null>(null);
  /* When a fresh aggregation arrives the list lays out from the top: members reset to this copy's first entries and the expand key returns to "expand all". */
  const [seen, setSeen] = useState(epoch);
  if (seen !== epoch) { setSeen(epoch); setShown(null) }
  const grow = useRef<{ body: HTMLElement; before: number; scroller: HTMLElement; keep: number } | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const expanded = !!shown?.all;
  const list = shown ? shown.rows : rows;

  /* The column's position belongs to the person: everything that opens sits below the point they pressed, and moving them there decides for them which item they are looking at.
     When the list grows, the browser pushes this column along through focus and anchoring, so it is remembered and put back. */
  useLayoutEffect(() => {
    const run = grow.current;
    if (!run) return;
    grow.current = null;
    const hold = () => { run.scroller.scrollTop = run.keep };
    if (expanded) {
      const details = run.body.closest('details');
      run.body.classList.add('ui-fcollapse');
      growCollapse(run.body, run.before, () => !!details?.open && !run.body.inert);
    }
    hold();
    requestAnimationFrame(hold);
  }, [shown, expanded]);

  const more = () => {
    const node = button.current;
    const body = node?.closest<HTMLElement>('[data-sidebar-collapse]');
    const scroller = at.scroll;
    if (!node || !body) return;
    grow.current = { body, before: body.getBoundingClientRect().height, scroller, keep: scroller.scrollTop };
    const source = latest ?? rows;
    setShown({ rows: source, all: !expanded });
    /* Collapse collapses the whole group. The list is already at its longest; shrinking it back to twenty-odd entries just moves the breakpoint, leaving the person in front of the same column of unreadable stuff;
       what pressing this wants is to put the group away. */
    if (expanded) toggleGroup();
  };
  return (
    <>
      <ChipList rows={expanded ? list : list.slice(0, limit)} filterKey={filterKey} multi={false} selected={selected}
        counts={counts} host={at} />
      {expandable && rows.length > limit
        ? <button type="button" ref={button} data-sidebar-more={filterKey} aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse ' : 'Expand all '}${title}`} onClick={more}><Icon name="chevron-down" /></button>
        : null}
    </>
  );
}

function FollowChips({ rows, host: at, selected, badges }: {
  rows: SidebarChip[]; host: SidebarHost; selected: Set<string> | null; badges: boolean;
}) {
  return (
    <div data-sidebar-chips="">
      {rows.map((row) => (
        <button type="button" key={row.value} data-sidebar-chip="" data-online="" data-follow-drawer-tag={row.value}
          aria-pressed={selected ? selected.has(row.value) : undefined} title={row.label}
          onClick={() => (selected ? at.selectFollowTag(row.value) : at.openFollowTag(row.value))}>
          <span data-sidebar-chip-label="">{row.label}</span>
          <span data-sidebar-count="" data-count-badge={badges ? `follow:${row.value}` : undefined}>
            {badges ? (row.n ?? 0).toLocaleString() : row.n}
          </span>
        </button>
      ))}
    </div>
  );
}

/* -- Duration --
   Duration has one reading: the bubble above the handle. A second line writing "unlimited - unlimited" says the same thing twice and, with the sliders unmoved,
   it always says that. Both ends always show: this is the only place reporting numbers, and hidden, the filtered range is invisible without touching the sliders. */

const minutesOf = (seconds: unknown, fallback: number) =>
  seconds ? Math.min(DURATION_MAX, Number(seconds) / 60) : fallback;

function Duration({ host: at, filters, commit: onCommit = at.setDuration }: {
  host: SidebarHost; filters: SidebarProps['filters'];
  /** Who receives the release: the catalog filter by default, swapped for the follows page's own. */
  commit?: SidebarHost['setDuration'];
}) {
  const source = `${filters.dur_min ?? ''}:${filters.dur_max ?? ''}`;
  const [seen, setSeen] = useState(source);
  const [range, setRange] = useState(() => [minutesOf(filters.dur_min, 0), minutesOf(filters.dur_max, DURATION_MAX)]);
  /* The handle moved last sits on top: when both ends are dragged together they overlap, and the one underneath reports its own resting position. */
  const [active, setActive] = useState<'min' | 'max'>('max');
  if (seen !== source) {
    setSeen(source);
    setRange([minutesOf(filters.dur_min, 0), minutesOf(filters.dur_max, DURATION_MAX)]);
  }
  const [lo, hi] = range;
  const group = useRef<HTMLDivElement | null>(null);
  const minInput = useRef<HTMLInputElement | null>(null);
  const maxInput = useRef<HTMLInputElement | null>(null);
  const latest = useRef(range);
  latest.current = range;

  const move = (end: 'min' | 'max', value: number) => {
    let [nextLo, nextHi] = end === 'min' ? [value, hi] : [lo, value];
    if (nextLo > nextHi) { if (end === 'min') nextHi = nextLo; else nextLo = nextHi }
    setActive(end);
    setRange([nextLo, nextHi]);
    return [nextLo, nextHi];
  };

  /* Dragging only moves the readout; releasing (`change`) commits: React's onChange receives every input step. */
  useEffect(() => {
    const commit = () => onCommit(latest.current[0], latest.current[1]);
    const inputs = [minInput.current, maxInput.current];
    inputs.forEach((input) => input?.addEventListener('change', commit));
    return () => inputs.forEach((input) => input?.removeEventListener('change', commit));
  }, [onCommit]);

  /* The selected stretch and the two bubbles' positions are written to style variables and `left`. Bubbles center on the handle, and the overhang past the track is pulled back by
     the measured overflow: the sidebar is only a little wider than the track, and the overflowing half would be clipped by it, leaving half a reading. Clear the previous
     offset before measuring, otherwise what is measured is the already-once-pulled-back position, drifting further with every drag. */
  useLayoutEffect(() => {
    const node = group.current;
    if (!node) return;
    node.style.setProperty('--lo', `${lo / DURATION_MAX * 100}%`);
    node.style.setProperty('--hi', `${hi / DURATION_MAX * 100}%`);
    const bounds = node.getBoundingClientRect();
    node.querySelectorAll<HTMLElement>('[data-sidebar-range-tip]').forEach((tip) => {
      const value = tip.dataset.rangeEnd === 'max' ? hi : lo;
      tip.style.left = `${value / DURATION_MAX * 100}%`;
      tip.style.setProperty('--range-tip-shift', '0px');
      const box = tip.getBoundingClientRect();
      const shift = box.right > bounds.right ? bounds.right - box.right : box.left < bounds.left ? bounds.left - box.left : 0;
      if (shift) tip.style.setProperty('--range-tip-shift', `${Math.round(shift)}px`);
    });
  }, [lo, hi]);

  const tip = (end: 'min' | 'max', value: number) => (
    <output data-sidebar-range-tip="" data-range-end={end} data-range-active={active === end ? '' : undefined} aria-hidden="true">
      {end === 'max' && value >= DURATION_MAX ? 'Any' : `${value} min`}
    </output>
  );
  return (
    <div data-sidebar-duration="">
      <div data-sidebar-range="" id="durationRange" ref={group}>
        <span data-sidebar-range-base="" />
        <span data-sidebar-range-fill="" />
        <input id="durMin" type="range" min="0" max={DURATION_MAX} step="5" value={lo} aria-label="Min duration (minutes)"
          ref={minInput} onChange={(event) => move('min', Number(event.currentTarget.value))} />
        <input id="durMax" type="range" min="0" max={DURATION_MAX} step="5" value={hi} aria-label="Max duration (minutes)"
          ref={maxInput} onChange={(event) => move('max', Number(event.currentTarget.value))} />
        {tip('min', lo)}
        {tip('max', hi)}
      </div>
    </div>
  );
}
