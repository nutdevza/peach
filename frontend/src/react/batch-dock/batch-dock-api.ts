/* The batch bar's (resident component `batch-dock`, `batch-dock-island.tsx`) contract with the shell, and which keys each
 * context lists.
 *
 * Multi-select state belongs to the shared shell store and application/selection.js: the switch, the selection set, Shift
 * range selection and exiting on page change have one copy. Each time the shell re-renders selection state it pushes the
 * count and context; this surface only renders the bottom floating bar (the shared `SelectionDock`). Clicks return to the
 * shell's `run`: the confirmation dialog, write endpoints, receipt and undo are the shell's per-group flows, with the busy
 * state hanging on the key that was clicked. */

/** Catalog (including the profile page and the tags page), trash, junk files, follows page. */
export type BatchContext = 'catalog' | 'trash' | 'junk' | 'follow';

/** Which shell flow a pressed key routes to: `batch` goes to `/api/batch`, `region` is the origin decision popover, `follow` writes follow items,
 *  `junk` is the junk files decision, and `clear` exits multi-select. */
export type BatchGroup = 'batch' | 'region' | 'follow' | 'junk' | 'clear';

export interface BatchAction {
  group: BatchGroup;
  operation: string;
  label: string;
  glyph: string;
  danger?: boolean;
}

export interface BatchDockProps {
  /** How many items are selected; the floating bar hides at 0. */
  count: number;
  context: BatchContext;
  /** The junk files page is currently on the "excluded" copy: that one offers "re-judge", and the pending copy offers "not junk". */
  junkDismissed: boolean;
}

export interface BatchDockHost {
  /** The layer this panel renders into (`[data-batch-dock]`, itself `display: contents`), i.e. the resident component's host. */
  root: HTMLElement;
  run(group: BatchGroup, operation: string, button: HTMLButtonElement): void;
}

export interface BatchDockApi {
  render(props: BatchDockProps): void;
}

const CLEAR: BatchAction = { group: 'clear', operation: 'clear', label: 'Cancel', glyph: 'x' };

/** The bar's buttons in this context, in left-to-right order. "Cancel" always comes last. */
export function batchActions(context: BatchContext, junkDismissed = false): BatchAction[] {
  switch (context) {
    case 'trash':
      return [
        { group: 'batch', operation: 'restore', label: 'Restore', glyph: 'rotate-ccw' },
        { group: 'batch', operation: 'delete', label: 'Delete permanently', glyph: 'trash', danger: true },
        CLEAR,
      ];
    case 'junk':
      return [
        junkDismissed
          ? { group: 'junk', operation: 'reconsider-junk', label: 'Judge again', glyph: 'rotate-ccw' }
          : { group: 'junk', operation: 'dismiss-junk', label: 'Not junk', glyph: 'check' },
        { group: 'junk', operation: 'dispose', label: 'Move to trash', glyph: 'trash', danger: true },
        CLEAR,
      ];
    case 'follow':
      return [
        { group: 'follow', operation: 'save', label: 'Save to the database', glyph: 'bookmark-plus' },
        { group: 'follow', operation: 'seen', label: 'Mark as watched', glyph: 'eye' },
        { group: 'follow', operation: 'ignored', label: 'Ignore', glyph: 'eye-off' },
        CLEAR,
      ];
    default:
      return [
        { group: 'batch', operation: 'like', label: 'Like', glyph: 'thumbs-up' },
        { group: 'batch', operation: 'seen', label: 'Watched', glyph: 'eye' },
        { group: 'batch', operation: 'later', label: 'Watch later', glyph: 'bookmark-plus' },
        { group: 'region', operation: 'region', label: 'Decide origin', glyph: 'globe' },
        { group: 'batch', operation: 'dispose', label: 'Move to trash', glyph: 'trash', danger: true },
        CLEAR,
      ];
  }
}
