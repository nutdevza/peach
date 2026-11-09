/* Follow list: two views over the same source set, plus the check-updates background job.
 *
 * Both views share one selection set (identity is the source ID) and one sort state. The table view is driven by
 * `@tanstack/react-table`: column definitions, sort state, row selection and pagination are all in its hands, and the row
 * data is the **full set** already sorted by the shared comparator, so sorting acts on all results and pagination only cuts
 * the last step, which is why "next page" shows the real next batch rather than a reshuffle within this page.
 *
 * Selection crosses pages and views: after paging, re-sorting or switching from cards to table, the same sources stay
 * selected, and the batch bar at the bottom sends the whole ID set, not just this screen's page. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RiCheckDoubleLine,
  RiDeleteBinLine, RiLayoutGridLine, RiRefreshLine, RiRssLine, RiTableLine,
} from '@remixicon/react';
import { useMutation } from '@tanstack/react-query';
import {
  createColumnHelper, createPaginatedRowModel, flexRender, rowPaginationFeature,
  rowSelectionFeature, rowSortingFeature, columnVisibilityFeature, tableFeatures, useTable,
  type RowSelectionState, type SortingState,
} from '@tanstack/react-table';
import { VisuallyHidden } from 'react-aria-components';

import { mapLimit } from '@peach/legacy/core';
import { confirmModal } from '@peach/legacy/ui';

import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Select, SelectItem } from '../components/select';
import { Switch } from '@/components/base/switch/switch';
import {
  Table, TableBody, TableCell, TableColumn, TableHeader, TableRow,
} from '@/components/base/table/table';
import { ChevronSortDown } from '@/components/foundations/icons/chevrons';

import { errorMessage } from '../../api';
import { DataTableFooter } from '../components/table-controls';
import { useBackgroundJob } from '../background-job';
import { cardClass } from '../components/card';
import { DataTableFrame } from '../components/data-table-frame';
import { useTablePreferences } from '../components/table-column-preferences';
import { TableColumnControls, TableColumnResizer } from '../components/table-column-controls';
import { CollapseChevron, CollapseRegion } from '../components/collapse-region';
import { TableSelectionHeader } from '../components/table-selection-header';
import { SortDirectionIcon } from '../components/icon-swap';
import { EmptyState } from '../components/empty-state';
import { clickedBlank } from '../components/row-click';
import { Note } from '../components/note';
import { TaskProgress } from '../components/task-progress';
import { SelectionDock } from '../components/selection-dock';
import { busyProps } from '../settings/use-action';
import {
  authorGroups, authorName, checkedText, checkEvidenceGap, checkFailures, checkReceipt, checkSummary,
  COLUMN_SORT, dropSources, errorHeadline, fetchCheckJob, FOLLOW_CHECK_KEY, isBroken,
  LAYOUTS, markAllPending, pageWindow, patchSource, removeSource,
  reloadFollowManage, selectionState, setSourceEnabled, SORT_DEFAULT_DIR, SORT_OPTIONS,
  sortLabel, startCheck, tableRows, toggleGroup,
  type CheckJob, type FollowData, type FollowSource, type Layout, type SortDir, type SortKey,
  type TableRow as SourceTableRow,
} from './follow-manage';
import { AuthorAvatar, ErrorLine, SourceIcon, SourceLink, StatusBadge } from './source-view';

const sourceTableFeatures = tableFeatures({
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const count = (value: unknown) => (Number(value) || 0).toLocaleString();

/** Clicking a column header is the toolbar's sort tier, so both sides share one mapping table and one direction value. */
const SORT_COLUMN = Object.fromEntries(
  Object.entries(COLUMN_SORT).map(([column, sort]) => [sort, column]),
) as Partial<Record<SortKey, string>>;

/** Below this width the tool row keeps only glyphs on buttons with labels. Taken from a breakpoint measured in the old build. */
const TOOLBAR_COMPACT_PX = 740;

/** How wide this row is on its own.
 *
 * The criterion can only be the row's own width, not the viewport's: with the same viewport, sidebar collapsed versus expanded leaves a 200px difference
 * for the row, and a viewport breakpoint would wrap early on one side while still overflowing on the other. The collapsed state uses `Button`'s own `iconOnly`;
 * changing its padding from outside gets blocked by `no-restyle`, and that rule says spacing belongs to the control. */
function useCompactToolbar(): [(node: HTMLDivElement | null) => void, boolean] {
  const [compact, setCompact] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!node) { observer.current = null; return }
    const watch = new ResizeObserver(() => setCompact(node.clientWidth < TOOLBAR_COMPACT_PX));
    watch.observe(node);
    observer.current = watch;
    setCompact(node.clientWidth < TOOLBAR_COMPACT_PX);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [attach, compact];
}

const COLUMN_LABELS: Record<string, string> = {
  select: 'Select', author: 'Creators', source: 'Source', provider: 'Site',
  status: 'State', checked: 'Last check', actions: 'Actions',
};
const preferenceColumns = Object.entries(COLUMN_LABELS).map(([id, label]) => ({ id, label,
  width: id === 'select' ? 48 : id === 'source' ? 320 : id === 'author' ? 240 : id === 'actions' ? 208 : 184,
  min: id === 'select' ? 48 : id === 'actions' ? 200 : id === 'source' ? 320 : 112, max: id === 'select' ? 48 : id === 'source' ? 2000 : 800,
  flex: id === 'source',
  required: id === 'select' || id === 'source',
}));

/** The row's two actions come from the caller, but the column definitions must not be rebuilt on every render; a box holding the current values sits between the two. */
interface RowHandlers {
  check(ids: number[]): void;
  /** The enable toggle at the row end: writes only this row, leaves checkboxes alone and pops no batch toast, same as the feed table's toggle. */
  toggle(source: FollowSource, enabled: boolean): void;
  remove(source: FollowSource): void;
  busy: boolean;
  readOnly: boolean;
}

export interface SourceListProps {
  data: FollowData;
  sort: SortKey;
  dir: SortDir;
  page: number;
  layout: Layout;
  pageSize: number;
  selected: ReadonlySet<number>;
  readOnly: boolean;
  onSort(sort: SortKey, dir: SortDir): void;
  onPage(page: number): void;
  onLayout(layout: Layout): void;
  onPageSize(size: number): void;
  onSelected(next: Set<number>): void;
  toast(message: string): void;
  openFollow(): void;
  onAdd(): void;
}

/** A source's row inside a creator card: checkbox, site logo and name, status, last check, actions. */
function SourceRow(
  { source, selected, onToggle, handlers }:
  { source: FollowSource; selected: boolean; onToggle(on: boolean): void; handlers: RowHandlers },
) {
  /* Clicking a row's blank space is a check or uncheck: the checkbox is only 16px, and if the rest of the row did nothing, selecting a few entries takes several squints.
     Row one is checkbox, site mark, and name, with status; on wide screens, last check, switch, and action keys join the row; errors get a full row of their own,
     indented past the checkbox and site mark widths, aligned with the name. On narrow screens, in order: row one, errors, actions. */
  return (
    <div data-selected={selected || undefined} data-follow-source-row=""
      className="flex min-h-16 flex-wrap items-center gap-3 px-2 py-3 last:rounded-b-lg max-sm:gap-x-2"
      onClick={(event) => { if (clickedBlank(event, event.currentTarget)) onToggle(!selected) }}>
      <Checkbox isSelected={selected} onChange={onToggle} aria-label={`Select ${source.label}`} />
      {/* Names grow from zero width: long names wrap inside the column instead of squeezing the status and action keys onto the next line. The site icon hugs the name's front. */}
      <span className="flex min-w-0 grow basis-0 items-center gap-1.5">
        <span data-follow-source-site="" className="flex shrink-0 items-center text-body-medium">
          <SourceIcon provider={source.provider} />
        </span>
        <SourceLink source={source} />
      </span>
      {/* The site logo draws only the glyph; the site name goes to screen readers. */}
      <VisuallyHidden>{source.provider_label}</VisuallyHidden>
      <StatusBadge source={source} />
      {source.last_error ? (
        <span data-follow-source-error="" className="flex min-w-0 basis-full gap-3 max-sm:gap-x-2 sm:order-last">
          <span aria-hidden className="w-4 shrink-0" />
          <span className="flex min-w-0 grow gap-1.5">
            <span aria-hidden className="w-(--icon-inline) shrink-0 text-body-medium" />
            <span className="min-w-0 grow"><ErrorLine text={source.last_error} /></span>
          </span>
        </span>
      ) : null}
      <span data-follow-source-controls="" className="flex w-max max-w-full flex-none flex-wrap items-center gap-1.5 max-sm:w-full">
        <span className="shrink-0 text-body-2-regular whitespace-nowrap text-text-secondary max-sm:mr-auto max-sm:text-caption-1-regular">
          {checkedText(source)}
        </span>
        <Switch aria-label={`Enable ${source.label}`} isSelected={source.enabled}
          isDisabled={handlers.readOnly} onChange={(on) => handlers.toggle(source, on)} />
        <span className="flex shrink-0 items-center gap-1">
          <Button variant="secondary" size="small" iconOnly leadingIcon={RiRefreshLine}
            aria-label={`Check ${source.label} for updates`}
            disabled={!source.enabled || handlers.readOnly} {...busyProps(handlers.busy)}
            onClick={() => handlers.check([source.id])} />
          <Button variant="secondary" size="small" iconOnly leadingIcon={RiDeleteBinLine}
            aria-label={`Remove ${source.label}`} disabled={handlers.readOnly}
            onClick={() => handlers.remove(source)} />
        </span>
      </span>
    </div>
  );
}

/** One card per creator. One person's sources across several sites are gathered together, and the title row states the person's overall status. */
function AuthorCard(
  { group, name, open, selected, handlers, onOpen, onToggleGroup, onToggle }:
  {
    group: FollowSource[]; name: string; open: boolean; selected: ReadonlySet<number>;
    handlers: RowHandlers;
    onOpen(open: boolean): void;
    onToggleGroup(on: boolean): void;
    onToggle(id: number, on: boolean): void;
  },
) {
  const ids = group.map((source) => source.id);
  const enabled = group.filter((source) => source.enabled).map((source) => source.id);
  const bad = group.filter(isBroken).length;
  const providers = [...new Set(group.map((source) => source.provider_label || source.provider))].join('、');
  const panel = `follow-author-${group[0]!.id}`;
  const state = selectionState(selected, ids);
  return (
    <section aria-label={`Follow sources for ${name}`}
      className={cardClass({
        variant: 'raised', padding: 'none', className: 'flex flex-col overflow-hidden p-2',
      })}>
      <div data-follow-author-header data-open={open || undefined}
        className="flex flex-wrap items-center gap-3 px-2 py-2.5">
        <AuthorAvatar group={group} name={name} />
        {/* The line under the name describes the person's sources: each site's logo and failure count. On narrow screens the action buttons wrap to their own right-aligned row. */}
        <span className="flex min-w-0 grow basis-0 flex-col gap-1">
          <b className="min-w-0 text-body-medium wrap-anywhere text-text-primary">{name}</b>
          <span data-follow-author-sites="" className="flex min-w-0 flex-wrap items-center gap-1 text-body-2-regular" title={providers}>
            {group.map((source) => <SourceIcon key={source.id} provider={source.provider} />)}
            {/* Screen-reader-only text goes through `VisuallyHidden`: it writes styles on the element and will not generate a utility class sharing a name with the old
                stylesheet (`web/css/01-base.css`'s `.sr-only` carries !important). */}
            <VisuallyHidden>{`Sources: ${providers}`}</VisuallyHidden>
            {bad
              ? <span className="ml-1 shrink-0 text-text-error-primary">{`${bad} failed`}</span>
              : null}
          </span>
        </span>
        <span data-follow-author-controls="" className="flex flex-none items-center gap-2 max-sm:w-full max-sm:justify-end">
          <Button variant="secondary" size="small" iconOnly leadingIcon={RiRefreshLine}
            aria-label={`Check all sources of ${name}`} disabled={!enabled.length || handlers.readOnly}
            {...busyProps(handlers.busy)} onClick={() => handlers.check(enabled)} />
          <span className="flex flex-none items-center gap-2">
          <Button variant="secondary" size="small" leadingIcon={RiCheckDoubleLine}
            aria-pressed={state.all ? 'true' : state.some ? 'mixed' : 'false'}
            aria-label={`${state.all ? 'Deselect all' : 'Select all'} sources for ${name}`}
            onClick={() => onToggleGroup(!state.all)}>{state.all ? 'Clear select-all' : 'Select all'}</Button>
          <Button variant="secondary" size="small" aria-expanded={open} aria-controls={panel}
            leadingIcon={CollapseChevron}
            aria-label={`${open ? 'Collapse' : 'Expand'} sources of ${name}`}
            onClick={() => onOpen(!open)}>{open ? 'Collapse' : 'Expand'}</Button>
          </span>
        </span>
      </div>
      <CollapseRegion id={panel} open={open} data-source-divider>
        {group.map((source) => (
          <SourceRow key={source.id} source={source} handlers={handlers}
            selected={selected.has(source.id)} onToggle={(on) => onToggle(source.id, on)} />
        ))}
      </CollapseRegion>
    </section>
  );
}

export function SourceList(props: SourceListProps) {
  const {
    data, sort, dir, page, layout, pageSize, selected, readOnly,
    onSort, onPage, onLayout, onPageSize, onSelected, toast, openFollow, onAdd,
  } = props;
  const sources = data.sources;
  const aliases = useMemo(() => data.author_aliases || [], [data.author_aliases]);
  const counts = data.counts || {};
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set<string>());
  const [toolbar, compact] = useCompactToolbar();
  const [problem, setProblem] = useState('');

  const groups = useMemo(() => authorGroups(sources, sort, dir, aliases), [sources, sort, dir, aliases]);
  const rows = useMemo(() => tableRows(groups, sort, dir, aliases), [groups, sort, dir, aliases]);

  const { job, running, outcome, start: check } = useBackgroundJob<CheckJob, number[]>({
    queryKey: FOLLOW_CHECK_KEY,
    queryFn: ({ signal }) => fetchCheckJob(signal),
    start: (ids) => startCheck(ids),
    onError: (cause) => setProblem(errorMessage(cause)),
    onFinish: (state) => {
      void reloadFollowManage();
      toast(state.status === 'failed' ? (state.error || 'Check failed') : checkReceipt(state));
    },
  });

  const startChecking = (ids: number[]) => {
    if (running || check.isPending) return;
    setProblem('');
    check.mutate(ids);
  };

  const toggleOne = (id: number, on: boolean) => onSelected(toggleGroup(selected, [id], on));
  const toggleMany = (ids: number[], on: boolean) => onSelected(toggleGroup(selected, ids, on));

  /* Removing one entry drops only that entry from the cache and unticks it as well: otherwise the bar at the bottom keeps counting
     a source that no longer exists. */
  const remove = useMutation({
    mutationFn: (id: number) => removeSource(id),
    onSuccess: (_result, id) => {
      dropSources([id]);
      onSelected(toggleGroup(selected, [id], false));
      toast('Unfollowed source');
    },
    onError: (cause) => setProblem(errorMessage(cause)),
  });

  /* The row-end switch writes only this row and updates the local row; the bulk path also clears selections and toasts "Enabled n",
     and a single switch should have neither of those side effects. */
  const toggleEnabled = useMutation({
    mutationFn: (work: { id: number; enabled: boolean }) => setSourceEnabled(work.id, work.enabled),
    onSuccess: (_result, work) => {
      patchSource(work.id, { enabled: work.enabled });
      setProblem('');
    },
    onError: (cause) => setProblem(errorMessage(cause)),
  });

  const removeSourceRow = (source: FollowSource) => void confirmModal({
    title: 'Unfollow the source', body: 'This will remove the source and its fetched entries; media files are kept.',
    confirmLabel: 'Unfollow the source', danger: true,
    onConfirm: () => remove.mutateAsync(source.id),
  });

  /** Batching: one item per request, bounded concurrency. Sending hundreds serially is the measured bottleneck, and firing them all at once makes them crowd each other. */
  const bulk = useMutation({
    mutationFn: async (work: { ids: number[]; action: 'enabled' | 'paused' | 'remove' }) => {
      const results = await mapLimit(work.ids, 4, async (id: number) => {
        if (work.action === 'remove') await removeSource(id);
        else await setSourceEnabled(id, work.action === 'enabled');
      });
      return { ...work, done: work.ids.filter((_id, at) => results[at]?.ok), results };
    },
    onSuccess: (result) => {
      if (result.action === 'remove') dropSources(result.done);
      else for (const id of result.done) patchSource(id, { enabled: result.action === 'enabled' });
      onSelected(toggleGroup(selected, result.done, false));
      const failed = result.results.filter((row) => !row.ok);
      if (failed.length) {
        setProblem(`${failed.length}/${result.ids.length} sources not updated: ${errorMessage(failed[0]?.error)}`);
        return;
      }
      setProblem('');
      const word = result.action === 'remove' ? 'Delete' : result.action === 'enabled' ? 'Enabled' : 'Paused';
      toast(`${word} done: ${result.done.length} follow sources`);
    },
    onError: (cause) => setProblem(errorMessage(cause)),
  });

  /** 未看条目的批量标记：按 1000 条一批调批量接口，一页待处理之外的也接着标完（`markAllPending`）。 */
  const markAll = useMutation({
    mutationFn: markAllPending,
    onSuccess: (result) => {
      void reloadFollowManage();
      if (result.failed) {
        setProblem(`Bulk update ${result.failed}/${result.total} unfinished: ${errorMessage(result.error)}`);
        return;
      }
      setProblem('');
      toast(`Bulk marked ${result.total} items`);
    },
    onError: (cause) => setProblem(errorMessage(cause)),
  });

  const toggleSourceRow = (source: FollowSource, enabled: boolean) =>
    toggleEnabled.mutate({ id: source.id, enabled });

  const handlers = useRef<RowHandlers>({
    check: startChecking, toggle: toggleSourceRow, remove: removeSourceRow, busy: false, readOnly,
  });
  handlers.current = {
    check: startChecking,
    toggle: toggleSourceRow,
    remove: removeSourceRow,
    busy: running || check.isPending,
    readOnly,
  };
  const rowHandlers = handlers.current;

  /* -- Table view: column definitions, sorting, row selection and pagination all delegated to TanStack Table -- */
  const columns = useMemo(() => {
    const column = createColumnHelper<typeof sourceTableFeatures, SourceTableRow>();
    const label = (id: string) => () => COLUMN_LABELS[id] || id;
    return column.columns([
      column.display({
        id: 'select',
        header: context => <TableSelectionHeader table={context.table} label="Select all sources on this page" page />,
        /* `slot={null}`: the table ships a slot named selection, and a checkbox placed without declaring ownership gets intercepted by it
           and errors. This column's checkboxes belong to TanStack Table's row selection, not the Table's own selection. */
        cell: (context) => (
          <Checkbox slot={null} isSelected={context.row.getIsSelected()}
            onChange={(on) => context.row.toggleSelected(on)}
            aria-label={`Select ${context.row.original.source.label}`} />
        ),
      }),
      column.accessor((row) => row.author, {
        id: 'author',
        header: label('author'),
        cell: (context) => (
          <span className="flex min-w-0 items-center gap-2">
            <AuthorAvatar group={context.row.original.group} name={context.row.original.author} />
            <span className="min-w-0 break-words">{context.row.original.author}</span>
          </span>
        ),
      }),
      column.accessor((row) => row.source.label, {
        id: 'source',
        header: label('source'),
        cell: (context) => (
          <span className="flex min-w-0 flex-col gap-0.5">
            <SourceLink source={context.row.original.source} />
            {context.row.original.source.last_error ? <ErrorLine text={context.row.original.source.last_error} /> : null}
          </span>
        ),
      }),
      column.accessor((row) => row.source.provider_label, {
        id: 'provider',
        header: label('provider'),
        cell: (context) => (
          <span className="flex items-center gap-1.5">
            <SourceIcon provider={context.row.original.source.provider} />
            {context.row.original.source.provider_label}
          </span>
        ),
      }),
      column.display({
        id: 'status',
        header: label('status'),
        cell: (context) => <StatusBadge source={context.row.original.source} />,
      }),
      column.accessor((row) => row.source.last_checked_at || '', {
        id: 'checked',
        header: label('checked'),
        cell: (context) => checkedText(context.row.original.source),
      }),
      column.display({
        id: 'actions',
        header: label('actions'),
        cell: (context) => (
          <span className="flex items-center gap-1">
            <Switch aria-label={`Enable ${context.row.original.source.label}`}
              isSelected={context.row.original.source.enabled} isDisabled={rowHandlers.readOnly}
              onChange={(on) => handlers.current.toggle(context.row.original.source, on)} />
            <Button variant="secondary" size="small" iconOnly leadingIcon={RiRefreshLine}
              aria-label={`Check updates for ${context.row.original.source.label}`}
              disabled={!context.row.original.source.enabled || rowHandlers.readOnly}
              {...busyProps(rowHandlers.busy)}
              onClick={() => handlers.current.check([context.row.original.source.id])} />
            <Button variant="secondary" size="small" iconOnly leadingIcon={RiDeleteBinLine}
              aria-label={`Remove ${context.row.original.source.label}`} disabled={rowHandlers.readOnly}
              onClick={() => handlers.current.remove(context.row.original.source)} />
          </span>
        ),
      }),
    ]);
  }, [rowHandlers]);

  const sorting: SortingState = useMemo(() => {
    const id = SORT_COLUMN[sort];
    return id ? [{ id, desc: dir === 'desc' }] : [];
  }, [sort, dir]);
  const rowSelection: RowSelectionState = useMemo(
    () => Object.fromEntries([...selected].map((id) => [String(id), true])), [selected]);

  const asTable = layout === 'table';
  const preferences = useTablePreferences('follow-sources', preferenceColumns);
  // An out-of-range page number lands on the last page: the address bar may still carry a page number from an earlier run with more sources.
  const win = pageWindow(asTable ? rows.length : groups.length, pageSize, page);

  const table = useTable({
    features: sourceTableFeatures,
    data: rows,
    columns,
    /* A row's identity is its source ID, not its index on this page: after paging or re-sorting, `rowSelection` still holds
       the same sources, and the card view reads the same set. */
    getRowId: (row) => String(row.source.id),
    state: { sorting, rowSelection, pagination: { pageIndex: win.page - 1, pageSize }, columnVisibility: preferences.visibility },
    onColumnVisibilityChange: preferences.change,
    /* Sorting is computed by the shared comparator before being handed in: if the table sorted again on its own, card view and table view would each have their own
       order, and the same data would rank differently across the two views. */
    manualSorting: true,
    enableRowSelection: true,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      if (!first) return;
      const key = COLUMN_SORT[first.id as keyof typeof COLUMN_SORT];
      if (key) onSort(key, first.desc ? 'desc' : 'asc');
    },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      onSelected(new Set(Object.entries(next).filter(([, on]) => on).map(([id]) => Number(id))));
    },
    onPaginationChange: (updater) => {
      const now = { pageIndex: win.page - 1, pageSize };
      const next = typeof updater === 'function' ? updater(now) : updater;
      if (next.pageSize !== pageSize) onPageSize(next.pageSize);
      else if (next.pageIndex !== now.pageIndex) onPage(next.pageIndex + 1);
    },
  });

  const pageRows = table.getRowModel().rows;
  const pageIds = asTable
    ? pageRows.map((row) => row.original.source.id)
    : groups.slice(win.start, win.end).flatMap((group) => group.map((source) => source.id));
  const pageState = selectionState(selected, pageIds);
  const chosen = [...selected];
  const failures = checkFailures(outcome);
  const failedSourceIds = sources.filter((source) => source.enabled
    && (source.last_status === 'error' || source.last_status === 'unauthorized')).map((source) => source.id);
  const evidence = checkEvidenceGap(outcome);
  const allCollapsed = groups.length > 0 && collapsed.size >= groups.length;

  if (!sources.length) {
    return (
      <EmptyState icon={RiRssLine} title="No followed sources yet" actions={
        <Button variant="primary" size="small" onClick={onAdd}>Add follows</Button>
      }>Follow sources and their check states show here.</EmptyState>
    );
  }

  return (
    /* Legacy `.followmanage .fmain>.fsec`: the whole follows list is one filled card, with the title, toolbar, creator groups
       and the summary line at the bottom all in the same card, not an outlined container wrapping several rows. */
    <div className={cardClass({
      padding: 'none',
      className: 'flex flex-col gap-4 px-6 py-5 max-sm:px-4',
    })}>
      {/* The action area wraps as a group; if a full row still cannot fit it, the controls inside keep wrapping in order. */}
      <div ref={toolbar} data-follow-toolbar="" data-responsive-toolbar="">
        <span data-follow-toolbar-heading="" data-toolbar-heading="">
          <h3 className="text-title-2-medium text-text-primary">Follows list</h3>
          <span className="text-body-2-regular text-text-secondary">
            {`${sources.length.toLocaleString()} sources${counts.new ? ` - ${count(counts.new)} unread` : ''}`}
          </span>
        </span>
        <div data-follow-toolbar-actions="" data-toolbar-actions="">
        {failedSourceIds.length ? <Button variant="secondary" disabled={readOnly}
          {...busyProps(rowHandlers.busy)} onClick={() => startChecking(failedSourceIds)}>Check failed items</Button> : null}
        <Button variant="primary" leadingIcon={RiRefreshLine} disabled={readOnly}
          aria-label="Check all" iconOnly={compact}
          {...busyProps(rowHandlers.busy)} onClick={() => startChecking([])}>Check all</Button>
        <span data-follow-toolbar-controls="" className="contents">
          <span data-button-group role="group" aria-label="Follows list layout">
            <Button variant="ghost" iconOnly
              leadingIcon={RiLayoutGridLine} aria-label={LAYOUTS[0][1]} aria-pressed={!asTable}
              onClick={() => onLayout('default')} />
            <Button variant="ghost" iconOnly
              leadingIcon={RiTableLine} aria-label={LAYOUTS[1][1]} aria-pressed={asTable}
              onClick={() => onLayout('table')} />
          </span>
          {asTable ? <TableColumnControls preferences={preferences} label="Follow sources" /> : null}
          <span className="flex flex-none items-center gap-2">
          <Select aria-label="Follows list sort" prefix="Sort" selectedKey={sort}
            onSelectionChange={(key) => {
              if (key === null) return;
              const next = String(key) as SortKey;
              onSort(next, SORT_DEFAULT_DIR[next]);
            }}>
            {SORT_OPTIONS.map(([key, name]) => <SelectItem key={key} id={key}>{name}</SelectItem>)}
          </Select>
          {/* The arrow is decoration; the accessible name states the direction, and it names the end you get by clicking. */}
          <Button variant="secondary" iconOnly
            leadingIcon={SortDirectionIcon} data-icon-state={dir === 'asc' ? 'a' : 'b'}
            aria-label={sortLabel(sort, dir)}
            onClick={() => onSort(sort, dir === 'asc' ? 'desc' : 'asc')} />
          </span>
          {asTable ? null : (
            <Button variant="secondary" iconOnly={compact}
              leadingIcon={CollapseChevron} aria-expanded={!allCollapsed}
              aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}
              onClick={() => setCollapsed(allCollapsed
                ? new Set<string>()
                : new Set(groups.map((group) => String(group[0]!.author_key || group[0]!.id))))}>
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </Button>
          )}
        </span>
        </div>
      </div>

      {/* This run keeps going in the background after the page closes, so its state lives on the page instead of just spinning a button. */}
      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {running ? <TaskProgress embedded label={job?.message || (job?.total
          ? `${job.older ? 'Fetch history' : 'Check for updates'}: completed ${job.checked || 0}/${job.total} sources`
          : 'Preparing the check task')} value={job?.checked} total={job?.total} /> : null}
        {problem ? <Note tone="error" title="Action not completed">{problem}</Note> : null}
        {!running && outcome?.results?.length ? (
          <Note tone="neutral" title="Check results">{checkSummary(outcome)}</Note>
        ) : null}
        {failures.length ? (
          <Note tone="error" title={`${failures.length} source checks failed`}
            extra={<ul className="flex flex-col gap-0.5 text-body-2-regular">
              {failures.map((row, at) => (
                <li key={`${row.provider || ''}-${row.ref || at}`}>
                  {`${row.provider_label || row.provider || ''} ${row.author || row.label || row.ref || ''}: ${errorHeadline(row.error || '') || 'No reason given'}`}
                </li>
              ))}
            </ul>}>
            These sources got no updates this round.
          </Note>
        ) : null}
        {evidence ? <Note tone="warning">{`Entry saved, but the raw source response was not saved this time: ${evidence}`}</Note> : null}
      </div>

        <SelectionDock label="Follow source bulk actions" visible={chosen.length > 0} count={`Selected ${chosen.length} sources`}>
          <Button variant="secondary" size="small" disabled={readOnly}
            {...busyProps(rowHandlers.busy)} onClick={() => startChecking(chosen)}>Check selected</Button>
          <Button variant="secondary" size="small" disabled={readOnly} {...busyProps(bulk.isPending)}
            onClick={() => bulk.mutate({ ids: chosen, action: 'enabled' })}>Enabled</Button>
          <Button variant="secondary" size="small" disabled={readOnly} {...busyProps(bulk.isPending)}
            onClick={() => bulk.mutate({ ids: chosen, action: 'paused' })}>Paused</Button>
          <Button variant="danger" size="small" disabled={readOnly} {...busyProps(bulk.isPending)}
            onClick={() => void confirmModal({
              title: `Delete ${chosen.length} follow sources`,
              body: 'This removes the selected follow sources and their fetched entries; media files are kept.',
              confirmLabel: 'Delete selected sources', danger: true,
              onConfirm: () => bulk.mutateAsync({ ids: chosen, action: 'remove' }),
            })}>Delete</Button>
          <Button variant="ghost" size="small" onClick={() => onSelected(new Set())}>Clear selection</Button>
        </SelectionDock>

      {asTable ? (
        <DataTableFrame follow preferences={preferences} onRowClick={(key) => toggleOne(Number(key), !selected.has(Number(key)))}>
          <Table aria-label="Follow sources" size="sm"
            sortDescriptor={sorting[0]
              ? { column: sorting[0].id, direction: sorting[0].desc ? 'descending' : 'ascending' }
              : undefined}
            onSortChange={(descriptor) => table.setSorting([
              { id: String(descriptor.column), desc: descriptor.direction === 'descending' },
            ])}>
            <TableHeader>
              {table.getHeaderGroups()[0]!.headers.map((header) => {
                const sortable = header.column.id in COLUMN_SORT;
                const text = flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <TableColumn key={header.id} id={header.id} allowsSorting={sortable}
                    isRowHeader={header.column.id === 'source'} {...preferences.columnProps(header.id)}>
                    {({ sortDirection }) => <>{header.id === 'select' ? text : sortable ? (
                      <span className="flex items-center gap-0.5">
                        {text}
                        <span data-sort-indicator data-direction={sortDirection || undefined}>
                          <ChevronSortDown />
                        </span>
                      </span>
                    ) : <VisuallyHidden>{text}</VisuallyHidden>}<TableColumnResizer preferences={preferences} id={header.id} /></>}
                  </TableColumn>
                );
              })}
              <TableColumn id="remaining-space" aria-label="Row empty space" data-table-space="" width={preferences.spaceWidth} minWidth={0} />
            </TableHeader>
            <TableBody renderEmptyState={() => 'No sources on this page'}>
              {pageRows.map((row) => (
                <TableRow key={row.id} id={row.id}
                  data-follow-selected={row.getIsSelected() || undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                  <TableCell data-table-space="" />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableFrame>
      ) : (
        <>
          <Checkbox isSelected={pageState.all} isIndeterminate={pageState.some}
            onChange={(on) => toggleMany(pageIds, on)} aria-label="Select all sources on this page">Select this page</Checkbox>
          <div className="flex flex-col gap-3">
            {groups.slice(win.start, win.end).map((group) => {
              const key = String(group[0]!.author_key || group[0]!.id);
              return (
                <AuthorCard key={key} group={group} name={authorName(group, aliases)}
                  handlers={rowHandlers} selected={selected} open={!collapsed.has(key)}
                  onOpen={(open) => {
                    const next = new Set(collapsed);
                    if (open) next.delete(key); else next.add(key);
                    setCollapsed(next);
                  }}
                  onToggleGroup={(on) => toggleMany(group.map((source) => source.id), on)}
                  onToggle={toggleOne} />
              );
            })}
          </div>
        </>
      )}

      <DataTableFooter label="Follows list" total={win.total} pagination={{ pageIndex: win.page - 1, pageSize }}
        unit={asTable ? 'sources' : ' creators'} pageUnit={asTable ? 'items' : 'people'}
        onChange={(next) => { if (next.pageSize !== pageSize) table.setPageSize(next.pageSize); else table.setPageIndex(next.pageIndex); }} />

      {counts.new ? (
        /* Old `.fsecfoot`: the summary and its actions were one band at the card bottom, a touch darker than the card face, running to both side edges. */
        <div className="-mx-6 -mb-5 flex flex-wrap items-center gap-2 border-t border-separator-border rounded-b-2xl bg-card-footer px-6 py-4 max-sm:-mx-4 max-sm:px-4">
          <span className="mr-auto text-body-2-regular text-text-secondary">
            {`Unwatched ${count(counts.new)} · Watched ${count(counts.seen)} · Saved ${count(counts.saved)} · Ignored ${count(counts.ignored)}`}
          </span>
          <Button variant="secondary" size="small" onClick={openFollow}>See the updates</Button>
          <Button variant="secondary" size="small" disabled={readOnly} {...busyProps(markAll.isPending)}
            onClick={() => void confirmModal({
              title: 'Mark as watched', body: 'This marks the current unwatched videos as watched.', confirmLabel: 'Mark as watched',
              onConfirm: () => markAll.mutateAsync('seen'),
            })}>Mark everything watched</Button>
          <Button variant="secondary" size="small" disabled={readOnly} {...busyProps(markAll.isPending)}
            onClick={() => void confirmModal({
              title: 'Mark as ignored', body: 'This marks the current unwatched videos as ignored.', confirmLabel: 'Mark as ignored',
              onConfirm: () => markAll.mutateAsync('ignored'),
            })}>Ignore all</Button>
        </div>
      ) : null}
    </div>
  );
}
