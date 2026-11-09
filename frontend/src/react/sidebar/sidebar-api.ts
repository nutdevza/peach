/* The sidebar (resident component `sidebar`, `sidebar-island.tsx`) and its contract with the shell.
 *
 * It renders the scrolling layer inside the left drawer `#drawer`: the header row's empty slot, the nav column, the sliding
 * glass over the nav, and the filter groups that appear per context below the nav (catalog and profile pages: sources,
 * duration, origin, aspect, creators, tags; follows page: sources, duration, content tags). The drawer itself, its open/close,
 * the bottom bar (light/dark, color, settings keys), brand and collapse button belong to the shell: they are anchors for
 * several overlays in the shell, and at `attached` the shell moves brand and collapse button into the header row's slot.
 *
 * Filters, routing and fetching stay with the shell. Members, pressed states and counts are computed by the shell and pushed
 * in; clicks return to the shell's `commitContextFilter`, `navTo` and the follows page's filters. Nav order reads the same
 * `appSettings` (`host.store`): when the settings panel or the column's own drag changes the order, the sidebar reorders on the
 * spot per the store's notification. */
import type { SettingsStore } from '../../settings-store';

/** The small mark at the start of the source row: local and online use a sprite glyph, cloud drives use the official site icon, the rest draw a dot by billing. */
export type SidebarDot =
  | { kind: 'glyph'; name: string }
  | { kind: 'image'; src: string }
  | { kind: 'cost'; cost: 'free' | 'metered' };

/** One filter key. The shell has already set `label` from `LOC`, `tagLabel`, or the display name in the aggregate. */
export interface SidebarChip {
  value: string;
  label: string;
  n: number | null;
  dot?: SidebarDot;
  /** A source whose drive is gone: it stays in the list but cannot be clicked; `title` says why. */
  offline?: string;
}

/** The aggregation for the catalog and profile page, sorted by group. */
export interface SidebarFacets {
  years?: SidebarChip[];
  locations: SidebarChip[];
  regions: SidebarChip[];
  orientations: SidebarChip[];
  /** When the profile page is one of the creators themselves, that person has already been removed. */
  creators: SidebarChip[];
  tags: SidebarChip[];
  tech: SidebarChip[];
  followTags: SidebarChip[];
  /** The duration group appears only when the library has duration readings. */
  duration: boolean;
}

export type SidebarContent =
  /** A new `key` means a new aggregate: default group expansion is re-derived from the pressed state, and count badges decide whether to pop based on the previous value. */
  | { kind: 'catalog'; key: string; facets: SidebarFacets }
  /** Follows page and follows details: content tag counts are computed by the shell from the visible items or from this item's own tags. Source and duration exist only on the follows page:
   *  sources listed library-wide (after selecting one the others remain), `duration` says whether the library has duration readings; pressed state and duration ends read
   *  `filters`' `provider`, `dur_min`, `dur_max`. Details only get tags. */
  | { kind: 'follow'; tags: SidebarChip[]; selected: string[]; providers?: SidebarChip[]; duration?: boolean };

export interface SidebarProps {
  /** When null, only navigation renders (video details, the manage area and the index page, or the aggregate has not come back after a page change). */
  content: SidebarContent | null;
  /** The current context's filters (the home page's `state`, or the profile page's and details' copy): pressed states and the duration range render from it. */
  filters: Record<string, string | number | null | undefined>;
  /** The numbers refreshed in place: members stay put, counts follow this copy, names missing from it count 0, and "expand all" lays out by it. */
  latest: SidebarFacets | null;
}

export interface SidebarHost {
  /** The layer the sidebar renders into (`#drawerScroll`), also the host of resident components. The overlay scrollbar is attached to it by the shell, with the track living in `#drawer`. */
  scroll: HTMLElement;
  /** The UI preferences store (`appSettings`); the sidebar reads and writes only its `sidebarOrder`. */
  store: SettingsStore<{ sidebarOrder: string[] }>;
  /** Every entry the sidebar can hold, `[key, name, glyph]`; the home item's key is an empty string. */
  navCatalog: readonly (readonly [string, string, string])[];
  /** Whether this item is lit right now (the shell's `navOn`, reading the address and catalog filters). */
  navOn(key: string): boolean;
  navTo(key: string): void;
  /** Double-clicking a nav smoothly scrolls to top while keeping that section's content and filter. */
  navToTop(): void;
  /** A catalog filter key: `multi` groups toggle members in a comma list, the rest are single-select and a second click clears. */
  toggleChip(key: string, value: string, multi: boolean): void;
  /** The released ends of the duration range (minutes): 0 and 180 mean that end is unbounded. */
  setDuration(min: number, max: number): void;
  /** A follows tag on the catalog page: goes to the follows page's "Saved" copy, filtered by just this tag. */
  openFollowTag(tag: string): void;
  /** Content tags on the follows page and follows details: switch to filtering by this tag alone. */
  selectFollowTag(tag: string): void;
  /** The follows page's source: single select, click again to cancel. */
  selectFollowProvider(provider: string): void;
  /** The follows page's duration range applies on release (minutes), same semantics as `setDuration`. */
  setFollowDuration(min: number, max: number): void;
  /** Called once, in the same task, after the route tree paints its first frame and before the handle is handed over: the shell moves the brand and the collapse key into the title row. */
  attached(): void;
}

export interface SidebarApi {
  /** The full props; the shell keeps one copy, changes a few fields each time and pushes the whole thing back in. It is painted by the time it returns. */
  render(props: SidebarProps): void;
  /** The nav's pressed state must be re-read (route changed, catalog filters switched JAV or portrait): the glass slides from the old item to the new one. Already painted by the time you return. */
  navChanged(): void;
}
