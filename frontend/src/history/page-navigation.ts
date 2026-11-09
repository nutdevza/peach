import { peachHistory, isOverlayPath, isPreferencePath, routeMetaOf, type Navigation } from './index';
import { routeScrollBehavior, scrollToAnchor } from '../ui-kit/anchor-scroll';
import { portraitColumn } from './page-title';

interface Visit {
  left: number;
  top: number;
  state: Map<string, unknown>;
}

const visits = new Map<string, Visit>();
const addresses = new Map<string, Visit>();
const columns = new Map<string, string>();
let active: Navigation;
let from: Navigation['location'];
let departure = { left: window.scrollX, top: window.scrollY };
let restoring: Visit | undefined;
let positioned = -1;
let requestedTop = -1;
let refreshing = false;
let installed = false;
let anchorStyle: string | undefined;
let heightStyle: string | undefined;
let contentReady = false;
let scrolling = false;

function holdScrollAnchor(): void {
  const root = document.documentElement;
  anchorStyle ??= root.style.overflowAnchor;
  heightStyle ??= root.style.minHeight;
  // When collapsing the old page, a short skeleton must not first clamp the current position to the top.
  root.style.minHeight = `${root.scrollHeight}px`;
  contentReady = false;
  scrolling = false;
  root.style.overflowAnchor = 'none';
  root.setAttribute('data-page-navigation-pending', '');
  // Cancel the previous page's unfinished smooth scroll; the next page only accepts its own positioning.
  window.scrollTo({ left: window.scrollX, top: window.scrollY, behavior: 'instant' });
}

function releaseScrollAnchor(seq: number): void {
  if (!contentReady || scrolling || anchorStyle === undefined) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (peachHistory.navigation.seq !== seq || !contentReady || scrolling || anchorStyle === undefined) return;
    const root = document.documentElement;
    root.style.minHeight = heightStyle!;
    root.style.overflowAnchor = anchorStyle;
    root.removeAttribute('data-page-navigation-pending');
    heightStyle = undefined;
    anchorStyle = undefined;
  }));
}

function scrollPage(options: ScrollToOptions): void {
  scrolling = options.behavior === 'smooth'
    && (Math.abs((options.top ?? window.scrollY) - window.scrollY) > 0.5
      || Math.abs((options.left ?? window.scrollX) - window.scrollX) > 0.5);
  window.scrollTo(options);
}

function trackElementScroll(target: Element | null): void {
  if (!target?.getClientRects().length) { scrolling = false; return }
  const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const top = Math.max(0, Math.min(target.getBoundingClientRect().top + window.scrollY - padding - margin,
    document.documentElement.scrollHeight - window.innerHeight));
  scrolling = routeScrollBehavior() === 'smooth' && Math.abs(top - window.scrollY) > 0.5;
}

const page = (path: string) => !isOverlayPath(path) && !isPreferencePath(path) && path !== '/immerse' && path !== '/wall';
const identity = (location: typeof active.location) => {
  const query = new URLSearchParams(location.search);
  return `${location.pathname}:${query.get('jav') === '1'}:${portraitColumn(query)}`;
};
const address = (location: typeof active.location) => {
  const query = new URLSearchParams(location.search);
  query.delete('edit');
  query.sort();
  return location.pathname + (query.size ? `?${query}` : '') + location.hash;
};
const visitKey = (location: typeof active.location) => `${location.key}:${address(location)}`;
function columnKeys(location: typeof active.location): string[] {
  if (!page(location.pathname)) return [];
  if (location.pathname === '/') {
    const query = new URLSearchParams(location.search);
    return [query.get('jav') === '1' ? 'jav' : portraitColumn(query) ? 'shorts' : ''];
  }
  const meta = routeMetaOf(location.pathname);
  return [...(meta?.nav ? [meta.nav] : []), ...(meta?.section ? ['manage', meta.section] : [])];
}
/* The home-page tabs (Home, JAV, and vertical all live on `/`) record their address without the search term: the screen a search lands on is a query, not
   this tab's view. Recording with the term means clicking "Home" while searching stays put, and leaving then coming back still lands on the search results. */
function columnAddress(location: typeof active.location): string {
  const path = location.pathname + location.search + location.hash;
  if (location.pathname !== '/') return path;
  const query = new URLSearchParams(location.search);
  if (!query.has('q')) return path;
  query.delete('q');
  return '/' + (query.size ? `?${query}` : '') + location.hash;
}
function rememberColumns(): void {
  const location = active.location;
  for (const key of columnKeys(location)) columns.set(key, columnAddress(location));
}

/** Re-entering a section in the same tab reuses the last address; if already in that section, keep the current view, and search results return to the screen without the term. */
export function rememberedSidebarPath(key: string): string | undefined {
  installPageNavigation();
  return columnKeys(active.location).includes(key) ? columnAddress(active.location) : columns.get(key);
}

/** A manual refresh and the enabled auto-rotation fetch new content via the original refresh entry, without claiming the old view. */
export function refreshPageNavigation(): void { installPageNavigation(); refreshing = true }

function installPageNavigation(): void {
  if (installed) return;
  installed = true;
  active = peachHistory.navigation;
  from = active.location;
  window.history.scrollRestoration = 'manual';
  document.addEventListener('scrollend', event => {
    if (event.target !== document) return;
    scrolling = false;
    releaseScrollAnchor(peachHistory.navigation.seq);
  });
  peachHistory.listen(next => {
    from = active.location;
    departure = { left: window.scrollX, top: window.scrollY };
    if (page(next.location.pathname)) holdScrollAnchor();
    else {
      contentReady = true;
      scrolling = false;
      releaseScrollAnchor(next.seq);
    }
    if (page(from.pathname)) {
      const saved = visits.get(visitKey(from)) ?? { ...departure, state: new Map<string, unknown>() };
      Object.assign(saved, departure);
      visits.set(visitKey(from), saved);
      addresses.set(address(from), saved);
      rememberColumns();
    }
    if (next.action === 'REPLACE') {
      const previous = visits.get(visitKey(from));
      if (previous) visits.set(visitKey(next.location), { ...previous, state: new Map(previous.state) });
      if (restoring) restoring = visits.get(visitKey(next.location));
    } else {
      restoring = next.action === 'POP' ? visits.get(visitKey(next.location)) : addresses.get(address(next.location));
    }
    if (refreshing) restoring = undefined;
    refreshing = false;
    if (restoring) {
      restoring = { ...restoring, state: new Map(restoring.state) };
      visits.set(visitKey(next.location), restoring);
    }
    active = next;
  });
}

/** Only keep the reading state of the current history entry; don't write to the address, user config, or ledger. */
export function rememberPageState<T>(name: string, value: T): void {
  installPageNavigation();
  if (!page(active.location.pathname)) return;
  const saved = visits.get(visitKey(active.location)) ?? {
    left: window.scrollX, top: window.scrollY, state: new Map<string, unknown>(),
  };
  saved.state.set(name, value);
  visits.set(visitKey(active.location), saved);
  rememberColumns();
}

/** Section back-and-forth, back/forward navigation, and their canonical-address redirects read the state saved on leaving. */
export function restoredPageState<T>(name: string): T | undefined {
  installPageNavigation();
  return restoring?.state.get(name) as T | undefined;
}

export const restoringPage = (): boolean => { installPageNavigation(); return !!restoring };

/** Double-click navigation returns to the top; if the target page is still open, its ready callback consumes this request. */
export function requestPageTop(): void {
  installPageNavigation();
  requestedTop = peachHistory.navigation.seq;
  if (positioned !== requestedTop) return;
  requestedTop = -1;
  scrollPage({ top: 0, behavior: routeScrollBehavior() });
}

/** Navigation can start once the new page's skeleton is in place; history positions wait for content height to recover, and anchors wait for the target to appear. */
export async function pageNavigationReady(isCurrent: () => boolean, results?: Element | null,
  { pending = false }: { pending?: boolean } = {}): Promise<void> {
  installPageNavigation();
  const navigation = peachHistory.navigation;
  const seq = navigation.seq;
  const current = () => isCurrent() && peachHistory.navigation.seq === seq;
  if (!page(navigation.location.pathname) || !current()) return;
  rememberColumns();
  if (!pending && restoring) {
    await document.fonts?.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (!current()) return;
  }
  if (!pending) contentReady = true;
  if (positioned === seq) { releaseScrollAnchor(seq); return }
  if (pending && restoring) return;
  if (pending && navigation.location.hash) {
    let target: Element | null;
    try { target = document.getElementById(decodeURIComponent(navigation.location.hash.slice(1))) } catch { return }
    if (!target?.getClientRects().length || target.closest('[data-skeleton], [data-content-skeleton]')) return;
  }
  positioned = seq;
  if (requestedTop === seq) {
    requestedTop = -1;
    restoring = undefined;
    scrollPage({ top: 0, behavior: routeScrollBehavior() });
  } else if (restoring) {
    const behavior = routeScrollBehavior();
    if (behavior === 'smooth') {
      window.scrollTo({ ...departure, behavior: 'instant' });
    }
    scrollPage({ left: restoring.left, top: restoring.top, behavior });
    restoring = undefined;
  } else if (navigation.location.hash) {
    await scrollToAnchor(navigation.location.hash, current);
    if (!current()) return;
    let target: Element | null = null;
    try { target = document.getElementById(decodeURIComponent(navigation.location.hash.slice(1))) } catch { /* An invalid anchor does not position */ }
    trackElementScroll(target);
  } else if (navigation.action === 'REPLACE' && identity(from) === identity(navigation.location)) {
    window.scrollTo({ ...departure, behavior: 'instant' });
  } else if (results?.getClientRects().length && identity(from) === identity(navigation.location)
    && from.search !== navigation.location.search) {
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    if (results.getBoundingClientRect().top < inset) {
      trackElementScroll(results);
      results.scrollIntoView({ block: 'start', behavior: routeScrollBehavior() });
    }
  } else if (seq > 0) {
    scrollPage({ top: 0, behavior: routeScrollBehavior() });
  }
  releaseScrollAnchor(seq);
}
