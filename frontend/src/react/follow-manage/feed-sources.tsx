/* The JAV subscription table in the follow list:
 * one row per source, with her profile image before the name, listing type, source, status, frequency, last pull and new
 * additions, with the enable switch, pull key and remove key at the row's end (ADR-0042). Those three at the row's end match
 * the follow list's row one for one, so the two tables read as the same thing.
 *
 * Subscriptions enter by name from a person page's "Subscribe to new releases" or "Add follow"; neither path takes an address
 * (ADR-0047, ADR-0083). Pulled new releases line up in the row under the home and person page filter bars and are not listed
 * here: listing them here would create a second entry point whose read states would diverge.
 * The server is the only truth: after toggling or removing, refetch this copy; do not assemble local state from the response
 * in the frontend.
 *
 * Selection matches the follow list: the check sits at the row's start, clicking a row's blank also selects it, and with a
 * selection the batch actions surface at the bottom. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createColumnHelper, createPaginatedRowModel, createSortedRowModel, flexRender, rowPaginationFeature,
  rowSelectionFeature, rowSortingFeature, columnVisibilityFeature, tableFeatures, useTable,
  type RowSelectionState, type SortingState,
} from '@tanstack/react-table';
import { RiDeleteBinLine, RiExternalLinkLine, RiRefreshLine, RiRssLine } from '@remixicon/react';
import { VisuallyHidden } from 'react-aria-components';

import { avatarInner } from '@peach/card-art';
import { mapLimit } from '@peach/legacy/core';
import { confirmModal } from '@peach/legacy/ui';

import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Switch } from '@/components/base/switch/switch';
import {
  Table, TableBody, TableCell, TableColumn, TableHeader, TableRow,
} from '@/components/base/table/table';
import { ChevronSortDown } from '@/components/foundations/icons/chevrons';

import { errorMessage } from '../../api';
import { DataTableFrame } from '../components/data-table-frame';
import { useTablePreferences } from '../components/table-column-preferences';
import { TableColumnControls, TableColumnResizer } from '../components/table-column-controls';
import { TableSelectionHeader } from '../components/table-selection-header';
import { DataTableFooter, DataTableSort } from '../components/table-controls';
import { cardClass } from '../components/card';
import { EmptyState } from '../components/empty-state';
import { LEGACY_AVATAR_IMG } from '../components/legacy-avatar';
import { SiteLabel } from '../components/source-label';
import { Note } from '../components/note';
import { SelectionDock } from '../components/selection-dock';
import { queryClient } from '../query';
import { ErrorText, Help } from '../settings/section';
import { busyProps, useAction } from '../settings/use-action';
import { localTime } from '../time';
import {
  checkFeeds, errorHeadline, FEEDS_KEY, feedIntervalText, fetchFeeds, removeFeed, setFeedEnabled,
  pageWindow, type FeedSource,
} from './follow-manage';

const feedTableFeatures = tableFeatures({
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

const COLUMN_LABELS: Record<string, string> = {
  select: 'Select',
  name: 'Name',
  kind: 'Kind',
  origin: 'Source',
  status: 'State',
  interval: 'Frequency',
  fetched: 'Last fetch',
  fresh: 'Last additions',
  actions: 'Actions',
};

/** Columns that take no header text: the checkbox cell announces "select who" itself, and the three row-end controls each carry their own names. */
const SILENT_COLUMNS = new Set(['actions']);
const preferenceColumns = Object.entries(COLUMN_LABELS).map(([id, label]) => ({ id, label,
  /* The source cell needs to fit the site mark, video.dmm.co.jp, and the external-link icon; 160 would push the site name under the icon. */
  width: id === 'select' ? 48 : id === 'name' ? 300 : id === 'actions' ? 208 : id === 'fetched' ? 200
    : id === 'origin' ? 184 : 160,
  min: id === 'select' ? 48 : id === 'actions' ? 200 : id === 'name' ? 300 : 112, max: id === 'select' ? 48 : id === 'name' ? 2000 : 800,
  flex: id === 'name',
  required: id === 'select' || id === 'name',
}));

const reload = () => queryClient.invalidateQueries({ queryKey: FEEDS_KEY, exact: true });

const feedName = (source: FeedSource) => source.name || source.url;


/** The source cell shows only the site name: writing out the whole address would stretch this table past one screen, and clicking opens the original page. */
function originHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** The enabled state and the fetched results so far jointly decide the current tab. */
function StatusChip({ source }: { source: FeedSource }) {
  if (!source.enabled) return <Chip variant="caption" color="gray">Paused</Chip>;
  if (source.last_error) return <Chip variant="caption" color="rose">Fetch failed</Chip>;
  if (!source.last_fetched_at) return <Chip variant="caption" color="gray">Unchecked</Chip>;
  return <Chip variant="caption" color="lime">Normal</Chip>;
}

/** The round frame before the name: same size and background as the follows list's creator roundel. Its inside is assembled by `card-art`'s `avatarInner`:
 *  with a profile image it frames by face, judged by the server's `has_image`; without, the initial. The whole cell is out of the screen reader; the name is right beside. */
function FeedAvatar({ source }: { source: FeedSource }) {
  const entity = source.entity_id
    ? {
        id: source.entity_id, has_image: !!source.has_image, image_version: source.image_version,
        avatar_focus: source.avatar_focus,
      }
    : null;
  return (
    <span aria-hidden
      className={`relative inline-grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-background-tertiary-default text-caption-1-semibold text-text-secondary ${LEGACY_AVATAR_IMG}`}
      dangerouslySetInnerHTML={{ __html: avatarInner(feedName(source), entity, null, 'performer') }} />
  );
}

/** Another name this page goes by on the site. One person often has two pages, and the real-name page and old stage-name page share a name in the table,
 *  so only this segment can tell which row is which page. Written only when this person has more than one row: the site's title bar often chains the kanji and kana
 *  spellings together, and for single-row people repeating it is noise; it is also skipped when it equals the collective name. */
const pageAlias = (source: FeedSource, shared: ReadonlySet<number>) =>
  (source.entity_id !== null && shared.has(source.entity_id)
    && source.page_name && source.page_name !== source.name ? source.page_name : '');

/** A person with more than one source attached. */
function sharedEntities(sources: FeedSource[]): ReadonlySet<number> {
  const seen = new Set<number>();
  const shared = new Set<number>();
  for (const { entity_id: id } of sources) {
    if (id === null) continue;
    if (seen.has(id)) shared.add(id); else seen.add(id);
  }
  return shared;
}

interface RowHandlers {
  readOnly: boolean;
  /** The page name next to the name is written only for people carrying more than one source. */
  shared: ReadonlySet<number>;
  /** The key of the action currently running (`useAction`'s `busy`); the pull key at the row end shows busy against it. */
  busy: string | null;
  toggle(source: FeedSource, enabled: boolean): void;
  fetch(source: FeedSource): void;
  remove(source: FeedSource): void;
}

/** Confirm before removing, the same pattern as the follows-list row: what is deleted is this source and its dedup memory, while new releases already fetched stay
 *  (`feed_discovery.source_id` cleared to null). The popover handles the write, and busy state and failure reason both land in the popover. */
function confirmRemove(sources: FeedSource[], write: () => Promise<unknown>) {
  const one = sources.length === 1 ? sources[0] : null;
  return confirmModal({
    title: one ? 'Remove feed' : `Remove ${sources.length} follow sources`,
    body: one
      ? `Will remove the feed "${feedName(one)}"; its new releases will no longer be pulled, and new releases already fetched are kept.`
      : 'The selected sources will be removed and their new releases will no longer be fetched; new releases already fetched are kept.',
    confirmLabel: one ? 'Remove feed' : 'Remove selected feeds', danger: true,
    onConfirm: write,
  });
}

export function FeedSources({ readOnly, toast, onAdd, selection }: {
  readOnly: boolean; toast(message: string): void; onAdd(): void;
  selection?: {
    ids: ReadonlySet<number>;
    onChange: Dispatch<SetStateAction<ReadonlySet<number>>>;
    onActivate(): void;
  };
}) {
  const feeds = useQuery({ queryKey: FEEDS_KEY, queryFn: ({ signal }) => fetchFeeds(signal) });
  const action = useAction();
  const preferences = useTablePreferences('jav-feeds', preferenceColumns);
  const data = feeds.data;
  const sources = useMemo(() => data?.sources ?? [], [data]);
  const [ownSelected, setOwnSelected] = useState<ReadonlySet<number>>(new Set<number>());
  const selected = selection?.ids ?? ownSelected;
  const setSelected = selection?.onChange ?? setOwnSelected;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([]);
  const win = pageWindow(sources.length, pageSize, page);
  useEffect(() => { setPage((current) => Math.min(current, win.pages)) }, [win.pages]);

  /* A removed source should not keep holding counts: when the manifest is replaced, drop the IDs no longer in it. */
  useEffect(() => {
    setSelected((now) => {
      const alive = new Set(sources.map((source) => source.id));
      const next = new Set([...now].filter((id) => alive.has(id)));
      return next.size === now.size ? now : next;
    });
  }, [sources, setSelected]);

  const bulk = useMutation({
    mutationFn: async (work: { ids: number[]; action: 'enabled' | 'paused' | 'remove' }) => {
      const results = await mapLimit(work.ids, 4, async (id: number) => {
        if (work.action === 'remove') await removeFeed(id);
        else await setFeedEnabled(id, work.action === 'enabled');
      });
      return { ...work, results };
    },
    onSuccess: (result) => {
      const failed = result.results.filter((row) => !row.ok);
      const done = result.ids.length - failed.length;
      setSelected(new Set());
      void reload();
      if (result.action === 'remove' && done) toast(`Removed ${done} follow sources`);
      if (failed.length) {
        const first = failed[0]!;
        action.setError(`${failed.length} not written: ${first.ok ? '' : errorMessage(first.error)}`);
      }
    },
    onError: (cause) => action.setError(errorMessage(cause)),
  });

  /* Column definitions are built once; the controls in each row fetch the latest handlers and read-only state from here at click time. */
  const shared = useMemo(() => sharedEntities(sources), [sources]);
  const handlers = useRef<RowHandlers>({
    readOnly, shared, busy: null, toggle: () => {}, fetch: () => {}, remove: () => {},
  });
  handlers.current = {
    readOnly,
    shared,
    busy: action.busy,
    toggle: (source, enabled) => void action.run(`enabled-${source.id}`,
      (signal) => setFeedEnabled(source.id, enabled, signal), () => void reload()),
    /* Pull only this one, paused ones included: whoever taps this wants to know right now whether she has new releases, without first flipping a switch. */
    fetch: (source) => void action.run(`check-${source.id}`,
      (signal) => checkFeeds(signal, [source.id]), () => void reload()),
    remove: (source) => void confirmRemove([source], async () => {
      await removeFeed(source.id);
      toast(`Removed the follow source "${feedName(source)}"`);
      void reload();
    }),
  };

  const columns = useMemo(() => {
    const column = createColumnHelper<typeof feedTableFeatures, FeedSource>();
    const label = (id: string) => () => COLUMN_LABELS[id] || id;
    return column.columns([
      column.display({
        id: 'select',
        header: context => <TableSelectionHeader table={context.table} label="Select all feeds on this page" page />,
        /* `slot={null}`: the table ships a slot named selection, and a checkbox placed without declaring ownership gets intercepted by it
           and errors. This column's checkboxes belong to TanStack Table's row selection, not the Table's own selection. */
        cell: (context) => (
          <Checkbox slot={null} isSelected={context.row.getIsSelected()}
            onChange={(on) => context.row.toggleSelected(on)}
            aria-label={`Select ${feedName(context.row.original)}`} />
        ),
      }),
      column.accessor(feedName, {
        id: 'name',
        header: label('name'),
        /* Name, frequency and time never wrap: on narrow screens the table scrolls horizontally in Table's own container, and letting cells wrap would
           just stack a name like Mikami Yua into four vertical lines, defeating the scrolling. */
        cell: (context) => {
          const alias = pageAlias(context.row.original, handlers.current.shared);
          return (
            <span className="flex items-center gap-2 whitespace-nowrap text-body-medium text-text-primary">
              <FeedAvatar source={context.row.original} />
              {context.getValue()}
              {alias ? (
                <span className="text-body-2-regular text-text-secondary" title={`On-site this page files under "${alias}"`}>
                  {alias}
                </span>
              ) : null}
            </span>
          );
        },
      }),
      column.accessor((row) => row.kind_label, {
        id: 'kind',
        header: label('kind'),
        cell: (context) => <span className="whitespace-nowrap">{context.getValue()}</span>,
      }),
      column.accessor((row) => row.url, {
        id: 'origin',
        header: label('origin'),
        cell: (context) => (
          <a href={context.getValue()} target="_blank" rel="noopener noreferrer" title="Open the source page"
            className="max-w-full text-text-primary underline-offset-2 hover:underline">
            <SiteLabel site={context.row.original.kind.startsWith('javdb') ? 'javdb'
              : context.row.original.kind.startsWith('dmm') ? 'dmm' : originHost(context.getValue())}
              label={originHost(context.getValue())} />
            <RiExternalLinkLine aria-hidden className="size-(--icon-inline) shrink-0" />
          </a>
        ),
      }),
      column.accessor((source) => source.last_error ? 'Fetch failed' : source.enabled ? 'Enabled' : 'Paused', {
        id: 'status',
        header: label('status'),
        cell: (context) => <StatusChip source={context.row.original} />,
      }),
      column.accessor((row) => row.interval_minutes, {
        id: 'interval',
        header: label('interval'),
        cell: (context) => <span className="whitespace-nowrap">{feedIntervalText(context.getValue())}</span>,
      }),
      column.accessor((row) => row.last_fetched_at ? Date.parse(row.last_fetched_at) || 0 : 0, {
        id: 'fetched',
        header: label('fetched'),
        cell: (context) => <span className="whitespace-nowrap tabular-nums">{context.row.original.last_fetched_at ? localTime(context.row.original.last_fetched_at) : 'Never fetched'}</span>,
      }),
      column.accessor((row) => row.last_new_count, {
        id: 'fresh',
        header: label('fresh'),
        cell: (context) => <span className="whitespace-nowrap tabular-nums">{`${context.getValue()} items`}</span>,
      }),
      column.display({
        id: 'actions',
        header: label('actions'),
        /* The row end follows the same order as the follows list table: enable switch, fetch button, and remove button side by side. Both buttons are secondary outline,
           refresh and trash glyphs, sized xs to match the switch's height. */
        cell: (context) => (
          <span className="flex items-center gap-1">
            <Switch aria-label={`Enable ${feedName(context.row.original)}`}
              isSelected={context.row.original.enabled} isDisabled={handlers.current.readOnly}
              onChange={(enabled) => handlers.current.toggle(context.row.original, enabled)} />
            <Button variant="secondary" size="small" iconOnly leadingIcon={RiRefreshLine}
              aria-label={`Fetch ${feedName(context.row.original)}`}
              disabled={handlers.current.readOnly}
              {...busyProps(handlers.current.busy === `check-${context.row.original.id}`)}
              onClick={() => handlers.current.fetch(context.row.original)} />
            <Button variant="secondary" size="small" iconOnly leadingIcon={RiDeleteBinLine}
              aria-label={`Remove ${feedName(context.row.original)}`}
              disabled={handlers.current.readOnly}
              onClick={() => handlers.current.remove(context.row.original)} />
          </span>
        ),
      }),
    ]);
  }, []);

  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries([...selected].map((id) => [String(id), true])), [selected]);
  const table = useTable({
    features: feedTableFeatures,
    data: sources,
    columns,
    getRowId: (row) => String(row.id),
    state: { rowSelection, sorting, pagination: { pageIndex: win.page - 1, pageSize }, columnVisibility: preferences.visibility },
    onColumnVisibilityChange: preferences.change,
    onSortingChange: (next) => { setSorting(next); setPage(1); },
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      selection?.onActivate();
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setSelected(new Set(Object.entries(next).filter(([, on]) => on).map(([id]) => Number(id))));
    },
  });

  if (!data) {
    return feeds.error
      ? <Note tone="error" title="The follow source will not open">{errorMessage(feeds.error)}</Note>
      : <Help>Reading feed.</Help>;
  }

  const check = () => void action.run('check', (signal) => checkFeeds(signal), () => void reload());
  const toggleRow = (id: number) => {
    selection?.onActivate();
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const chosen = sources.filter((source) => selected.has(source.id));
  const failing = sources.filter((source) => source.last_error);

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="JAV subscription list"
        className={cardClass({ padding: 'none', className: 'flex flex-col gap-4 px-6 py-5 max-sm:px-4' })}>
      <div data-responsive-toolbar="">
        <div data-toolbar-heading="">
        <h3 className="text-title-2-medium text-text-primary">JAV feed</h3>
        <span className="text-body-2-regular text-text-secondary">{`${sources.length.toLocaleString()} feeds - ${(Number(data.unread) || 0).toLocaleString()} unread`}</span>
        </div>
        <div data-toolbar-actions="">
        <Button onClick={check} disabled={readOnly} {...busyProps(action.busy === 'check')}>Fetch now</Button>
        <TableColumnControls preferences={preferences} label="JAV feeds" />
        <DataTableSort label="JAV feeds" sorting={sorting} onChange={(next) => { setSorting(next); setPage(1); }}
          options={['name', 'kind', 'origin', 'status', 'interval', 'fetched', 'fresh'].map((id) => ({ id, label: COLUMN_LABELS[id]! }))} />
        </div>
      </div>

      {failing.length || action.error ? (
        <div className="flex flex-col gap-3">
          {/* Sources that cannot be pulled collapse into one line: one row per source reading "source name: first line of the error", so several failing sources cannot push the table off the first screen;
              the status badge on the table's row also reads "fetch failed". */}
          {failing.length ? (
            <Note tone="error" title={`${failing.length.toLocaleString()} feeds failed to fetch`}
              extra={<ul className="flex flex-col gap-0.5 text-body-2-regular">
                {failing.map((source) => (
                  <li key={source.id} className="min-w-0 truncate" title={source.last_error || ''}>
                    {`${feedName(source)}: ${errorHeadline(source.last_error || '') || 'reason not stated'}`}
                  </li>
                ))}
              </ul>}>
              These feeds fetched no new entries this round.
            </Note>
          ) : null}
          {action.error ? <ErrorText>{action.error}</ErrorText> : null}
        </div>
      ) : null}

        <SelectionDock visible={chosen.length > 0} label="Feed bulk actions" count={`Selected ${chosen.length} follow sources`}>
          <Button variant="secondary" size="small" disabled={readOnly} {...busyProps(bulk.isPending)}
            onClick={() => bulk.mutate({ ids: chosen.map((row) => row.id), action: 'enabled' })}>Enabled</Button>
          <Button variant="secondary" size="small" disabled={readOnly} {...busyProps(bulk.isPending)}
            onClick={() => bulk.mutate({ ids: chosen.map((row) => row.id), action: 'paused' })}>Paused</Button>
          <Button variant="danger" size="small" disabled={readOnly} {...busyProps(bulk.isPending)}
            onClick={() => void confirmRemove(chosen,
              () => bulk.mutateAsync({ ids: chosen.map((row) => row.id), action: 'remove' }))}>Remove</Button>
          <Button variant="ghost" size="small" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </SelectionDock>

      {sources.length ? (
        <DataTableFrame follow preferences={preferences} onRowClick={(key) => toggleRow(Number(key))}>
          <Table aria-label="JAV feeds" size="sm"
            sortDescriptor={sorting[0] ? { column: sorting[0].id, direction: sorting[0].desc ? 'descending' : 'ascending' } : undefined}
            onSortChange={(sort) => table.getColumn(String(sort.column))?.toggleSorting(sort.direction === 'descending')}>
            <TableHeader>
              {table.getHeaderGroups()[0]!.headers.map((header) => {
                const text = flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <TableColumn key={header.id} id={header.id} isRowHeader={header.column.id === 'name'} allowsSorting={header.column.getCanSort()} {...preferences.columnProps(header.id)}>
                    {({ sortDirection }) => <>{SILENT_COLUMNS.has(header.column.id) ? <VisuallyHidden>{text}</VisuallyHidden>
                      : <span className="flex items-center gap-0.5">{text}
                        {header.column.getCanSort() ? <span data-sort-indicator data-direction={sortDirection || undefined}><ChevronSortDown /></span> : null}
                      </span>}<TableColumnResizer preferences={preferences} id={header.id} /></>}
                  </TableColumn>
                );
              })}
              <TableColumn id="remaining-space" aria-label="Row empty space" data-table-space="" width={preferences.spaceWidth} minWidth={0} />
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} id={row.id} data-follow-selected={row.getIsSelected() || undefined}>
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
        <EmptyState icon={RiRssLine} title="No follow sources yet" size="compact"
          actions={!readOnly ? <Button variant="secondary" onClick={onAdd}>Add subscription</Button> : undefined}>
          Add by performer name under Add follow, or click Subscribe to new releases on a person page.
        </EmptyState>
      )}
      {sources.length ? (
        <DataTableFooter label="JAV subscriptions" total={win.total} unit=" follow sources"
          pagination={{ pageIndex: win.page - 1, pageSize }}
          onChange={(next) => { setPageSize(next.pageSize); setPage(next.pageIndex + 1); }} />
      ) : null}
      <footer className="-mx-6 -mb-5 flex flex-wrap items-center gap-2 border-t border-separator-border rounded-b-2xl bg-card-footer px-6 py-4 max-sm:-mx-4 max-sm:px-4">
        <span role="status" className="mr-auto text-body-2-regular text-text-secondary">
          {`Unwatched ${(Number(data.unread) || 0).toLocaleString()} · Enabled ${sources.filter((source) => source.enabled).length.toLocaleString()} / ${sources.length.toLocaleString()}`}
        </span>
      </footer>
      </section>
    </div>
  );
}
