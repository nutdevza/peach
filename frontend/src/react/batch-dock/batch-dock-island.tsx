/* Batch bar (ADR-0031 step 11g): the floating bar at the bottom during multi-select on catalog, trash, junk files and the
 * follows page.
 *
 * Resident component `batch-dock` (the resident table in `router/managed-routes.tsx`): the route tree renders it into the
 * shell's resident `[data-batch-dock]` at the end of body, the host being that node itself. The shell only gets the imperative
 * entry `configureBatchDock` provides: each re-render of selection state pushes a count and context; the handle writes them
 * into this module's store and notifies via `flushSync`, so the bar is rendered by the time the call returns and the shell can
 * immediately refresh the glass optics (`syncGlassOptics`). The bar's shell is the shared `SelectionDock` (review, tags page
 * and follow management use the same one), which needs the tokens and Preflight of the `.peach-react` scope, so the component
 * wraps itself in a `display: contents` `.peach-react` that takes no box.
 *
 * The keys on the bar are transparent `<button>`s: size, border, font size and the 17px glyphs follow ADR-0031's pre-migration
 * baseline, all in `batch-dock.css`; BoardUI `Button`'s medium tier is a 20px glyph with 8px padding and does not match. Danger
 * keys carry `data-danger`, and their red reads the site-wide danger-key rule in `../styles.css`. */
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

import { SelectionDock } from '../components/selection-dock';
import { batchActions, type BatchDockApi, type BatchDockHost, type BatchDockProps } from './batch-dock-api';
import './batch-dock.css';

let host: BatchDockHost | null = null;
let props: BatchDockProps = { count: 0, context: 'catalog', junkDismissed: false };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/* After this surface throws and is unmounted by the error boundary nobody subscribes: pushed updates only land in the store, unpainted and unthrown. */
const api: BatchDockApi = {
  render(next) { props = next; flushSync(notify) },
};

/** Attach the shell's host and take back the batch bar's imperative entry. Called once; the shell's `loadBatchDock` then opens this panel in the route tree. */
export function configureBatchDock(next: BatchDockHost): BatchDockApi {
  host = next;
  return api;
}

/** The resident table's face: reads this module's store and renders nothing until the host is attached. */
export function BatchDockSurface() {
  const view = useSyncExternalStore(subscribe, () => props);
  return host ? <BatchDock host={host} props={view} /> : null;
}

function BatchDock({ host: at, props: view }: { host: BatchDockHost; props: BatchDockProps }) {
  /* Whether the dock bar is up is told to the stylesheet by `data-batch-dock-open` on `<body>` (`batch-dock.css` makes room for the grid and the details bottom).
   * Written as `body:has(...)`, wall panning and cards being inserted would force a full body subtree style recompute per batch of nodes;
   * measured once at 40-60ms. */
  const open = view.count > 0;
  useLayoutEffect(() => { document.body.toggleAttribute('data-batch-dock-open', open) }, [open]);
  useLayoutEffect(() => () => { document.body.removeAttribute('data-batch-dock-open') }, []);
  return (
    <div className="peach-react" data-batch-scope="" data-context={view.context}>
      <SelectionDock label="Actions for selected items" visible={view.count > 0} count={`Selected ${view.count.toLocaleString()} items`}>
        {batchActions(view.context, view.junkDismissed).map((action) => (
          <button key={`${action.group}:${action.operation}`} type="button" data-batch-group={action.group}
            data-batch-action={action.operation} data-danger={action.danger ? '' : undefined}
            onClick={(event) => at.run(action.group, action.operation, event.currentTarget)}>
            <svg aria-hidden viewBox="0 0 24 24"><use href={`#i-${action.glyph}`} /></svg>
            {action.label}
          </button>
        ))}
      </SelectionDock>
    </div>
  );
}
