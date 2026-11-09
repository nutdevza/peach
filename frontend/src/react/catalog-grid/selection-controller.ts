import { junkRoute } from '../../junk-queue';
import { selectRange } from '../../selection';

export type SelectionSurface = 'catalog' | 'follow' | 'junk';
export interface SelectionSets { selected: Set<number>; followSelected: Set<number> }
export interface SelectionState {
  selectMode: boolean;
  selectSurface: string;
  lastSelectedId: number | null;
  followLastSelectedId: number | null;
}

export interface SelectionDock {
  count: number;
  context: SelectionSurface | 'trash';
  junkDismissed: boolean;
}

/** Profile and trash share the catalog's selection set; junk files have their own selection-mode scope. */
export function selectionSurface(pathname: string): SelectionSurface {
  return pathname === '/follow' ? 'follow' : pathname === '/junk-files' ? 'junk' : 'catalog';
}

/** The two Sets stay resident, and their return values feed the sole shell state writer. */
export function setSelectionMode(sets: SelectionSets, state: Readonly<SelectionState>,
  surface: SelectionSurface, on: boolean, clear = false): SelectionState {
  if (clear) { sets.selected.clear(); sets.followSelected.clear(); }
  return {
    selectMode: on,
    selectSurface: on ? (state.selectMode ? state.selectSurface : surface) : '',
    lastSelectedId: clear ? null : state.lastSelectedId,
    followLastSelectedId: clear ? null : state.followLastSelectedId,
  };
}

/** Cleared when crossing business scopes or entering non-selectable pages; selection persists through navigation within the catalog. */
export function syncSelectionSurface(sets: SelectionSets, state: Readonly<SelectionState>,
  pathname: string, canSelect: boolean): SelectionState {
  const surface = selectionSurface(pathname);
  return state.selectMode && (!canSelect || state.selectSurface !== surface)
    ? setSelectionMode(sets, state, surface, false, true) : { ...state };
}

/** The page supplies the display order; short videos from the mixed feed must not be pulled into the catalog's Shift range. */
export function toggleSelection(sets: SelectionSets, state: Readonly<SelectionState>,
  surface: SelectionSurface, visible: number[], id: number, range = false): SelectionState {
  const follow = surface === 'follow';
  const anchor = selectRange(follow ? sets.followSelected : sets.selected, visible,
    follow ? state.followLastSelectedId : state.lastSelectedId, id, range);
  return {
    ...setSelectionMode(sets, state, surface, true),
    ...(follow ? { followLastSelectedId: anchor } : { lastSelectedId: anchor }),
  };
}

/** Bulk operations cover the whole selection set, and the count includes selected videos not on the current screen. */
export function selectionDock(sets: SelectionSets, pathname: string, search: string,
  catalogState: string): SelectionDock {
  const surface = selectionSurface(pathname);
  return {
    count: (surface === 'follow' ? sets.followSelected : sets.selected).size,
    context: surface === 'catalog' && catalogState === 'trash' ? 'trash' : surface,
    junkDismissed: junkRoute(search).view === 'dismissed',
  };
}
