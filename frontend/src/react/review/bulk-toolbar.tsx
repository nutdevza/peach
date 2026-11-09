/* Review filters and batch actions: grouping, category filter, and select-this-page stay in the sticky bar; decision actions for the selection
 * use the same bottom floating bar as the home page.
 *
 * Grouping and filter options are computed over the whole queue while cards only draw the current page: counts in the filters describe the queue, not
 * this screen. The filter bar's height stays constant, so checking items does not push down the stuck content. */
import { useLayoutEffect, useRef, useState } from 'react';
import { RiCheckDoubleLine } from '@remixicon/react';

import { Button } from '@/components/base/buttons/button';
import { Select, SelectItem } from '../components/select';
import { SelectionDock } from '../components/selection-dock';
import { FilterGlassRows } from '../components/filter-glass';
import { useViewGlide } from '../components/use-view-glide';
import type { DecisionStatus, ReviewGroup, ReviewGrouping, ReviewQueue, ReviewRow } from './review';
import { commonReviewSources, REVIEW_QUEUES, REVIEW_QUEUE_LABELS } from './review';

export interface BulkToolbarProps {
  queueView?: ReviewQueue;
  queueCounts?: Record<ReviewQueue, number>;
  onQueueChange(queue: ReviewQueue): void;
  locked: boolean;
  fields: ReviewGroup[];
  fieldFilter: string;
  onFieldFilter(field: string): void;
  groupOptions: [ReviewGrouping, string][];
  groupBy: ReviewGrouping;
  onGroupBy(next: ReviewGrouping): void;
  groups: ReviewGroup[];
  filter: string;
  onFilter(next: string): void;
  /** The rows on the current page; select all selects exactly these. */
  pageKeys: string[];
  selected: ReadonlySet<string>;
  onSelected(next: Set<string>): void;
  /** The selected rows, used to compute the common source. */
  selectedRows: ReviewRow[];
  metadata: boolean;
  /** Whether "Approve selected" can still be pressed for the selected items. */
  approvable: boolean;
  busy: boolean;
  feedback: string;
  onUnifySource(source: string): void;
  onRun(status: DecisionStatus): void;
}

export function BulkToolbar(props: BulkToolbarProps) {
  const {
    groupOptions, groupBy, onGroupBy, groups, filter, onFilter, pageKeys, selected, onSelected,
    selectedRows, metadata, approvable, busy, feedback, onUnifySource, onRun, queueView = 'pending',
    queueCounts, onQueueChange, locked, fields, fieldFilter, onFieldFilter,
  } = props;
  const shown = pageKeys.filter((key) => selected.has(key));
  const allShown = shown.length > 0 && shown.length === pageKeys.length;
  const sources = commonReviewSources(selectedRows);
  const needsSource = metadata && selectedRows.some((row) => (row.candidates?.length || 0) > 1);
  const sourceLabel = sources.length ? 'Pick sources once for all' : 'Selected items share no source';
  const statePane = useRef<HTMLSpanElement>(null);
  const stateRow = useRef<HTMLDivElement>(null);
  const controlRow = useRef<HTMLDivElement>(null);
  const [joinedRows, setJoinedRows] = useState(false);
  const stateGlide = useViewGlide(statePane, stateRow, '[data-entity-state][aria-pressed="true"]', queueView);
  useLayoutEffect(() => {
    const states = stateRow.current, controls = controlRow.current;
    const statusLine = states?.parentElement;
    const frame = states?.closest<HTMLElement>('[data-review-filter]');
    if (!states || !controls || !statusLine || !frame) return;
    const measure = () => setJoinedRows(controls.offsetHeight > 0
      && Math.abs(statusLine.getBoundingClientRect().top - controls.getBoundingClientRect().top) < 1);
    const observer = new ResizeObserver(measure);
    for (const element of [frame, states, controls]) observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const toggleAll = () => {
    const next = new Set(selected);
    for (const key of pageKeys) { if (allShown) next.delete(key); else next.add(key) }
    onSelected(next);
  };

  return (
    <>
      <FilterGlassRows label="Review filter" topLabel="Processing state" attrs={{ 'data-review-filter': '' }}
        className="mb-0 flex-row flex-wrap" topClassName="max-w-full flex-none"
        bottomClassName={pageKeys.length ? 'min-h-12 max-w-full flex-none flex-wrap' : 'hidden'}
        bottomRef={controlRow}
        panes={<span ref={statePane} data-view-glide="" aria-hidden="true" />}
        top={<div ref={stateRow} role="group" aria-label="Review state" data-entity-states=""
          onPointerLeave={stateGlide.leave}>
          {REVIEW_QUEUES.map(key => <button key={key} type="button" data-entity-state={key} data-entity-press=""
            disabled={busy} aria-pressed={queueView === key} onPointerEnter={stateGlide.hover}
            onClick={() => { if (key !== queueView) onQueueChange(key) }}>
            <span data-copy-key={`review.queue.${key}`}>{REVIEW_QUEUE_LABELS[key]}</span>{' '}
            <span className="ms-1.5 tabular-nums text-caption-1-medium text-text-secondary">
              {queueCounts ? queueCounts[key].toLocaleString() : '…'}
            </span>
          </button>)}
          <span data-entity-sep="" aria-hidden="true" className={joinedRows ? undefined : 'invisible'} />
        </div>}
        bottom={pageKeys.length ? <>
        {metadata && fields.length ? <Select aria-label="Filter detail fields" size="sm"
          prefix={<span data-copy-key="review.filter.field" className="pointer-events-auto">Fields</span>}
          selectedKey={fieldFilter || '*'} isDisabled={busy}
          onSelectionChange={(key) => { if (key !== null) onFieldFilter(String(key) === '*' ? '' : String(key)) }}>
          <SelectItem id="*">All</SelectItem>
          {fields.map(field => <SelectItem key={field.key} id={field.key}>
            {`${field.title} · ${field.rows.length}`}
          </SelectItem>)}
        </Select> : null}
        <Select aria-label="Filter grouping" size="sm" selectedKey={groupBy}
          onSelectionChange={(key) => { if (key !== null) onGroupBy(String(key) as ReviewGrouping) }}>
          {groupOptions.map(([key, name]) => <SelectItem key={key} id={key}>{name}</SelectItem>)}
        </Select>
        {/* With one group there is nothing to filter: a lone "All categories" dropdown reads like a bug. */}
        {groups.length > 1 ? (
          <Select aria-label={groupBy === 'field' ? 'Filter field categories' : 'Filter the current category'} size="sm" prefix="Categories"
            selectedKey={filter || '*'}
            onSelectionChange={(key) => { if (key !== null) onFilter(String(key) === '*' ? '' : String(key)) }}>
            <SelectItem id="*">All</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.key} id={group.key}>
                {`${group.title} · ${group.rows.length}`}
              </SelectItem>
            ))}
          </Select>
        ) : null}
        {locked ? null : <Button variant="secondary" size="small" leadingIcon={RiCheckDoubleLine}
          aria-pressed={allShown} disabled={busy} onClick={toggleAll}>
          {allShown ? 'Clear the current selection' : filter ? 'Select all in the current category' : 'Select this page'}
        </Button>}
        </> : null} />

        <SelectionDock label="Review the selected items" visible={!locked && selected.size > 0} count={`${selected.size} items selected`}>
          {needsSource && queueView !== 'ignored' ? (
            <Select aria-label="Pick sources once for all" size="sm" selectedKey=""
              isDisabled={busy || !sources.length}
              onSelectionChange={(key) => { if (key !== null && key !== '') onUnifySource(String(key)) }}>
              <SelectItem id="">{sourceLabel}</SelectItem>
              {sources.map((source) => <SelectItem key={source} id={source}>{source}</SelectItem>)}
            </Select>
          ) : null}
          {queueView !== 'ignored' ? <Button variant="ghost" size="small" disabled={busy || !selected.size}
            onClick={() => onRun('rejected')}>Ignore selected</Button> : null}
          {queueView === 'pending' ? <Button variant="secondary" size="small" disabled={busy || !selected.size}
            onClick={() => onRun('skipped')}>Handle selected later</Button> : <Button
            variant={queueView === 'ignored' ? 'primary' : 'secondary'} size="small" disabled={busy || !selected.size}
            onClick={() => onRun('restore')}>Restore selected</Button>}
          {queueView !== 'ignored' ? <Button variant="primary" size="small" disabled={busy || !selected.size || !approvable}
            onClick={() => onRun('approved')}>Approve selected</Button> : null}
          <Button variant="ghost" size="small" disabled={busy}
            onClick={() => onSelected(new Set())}>Clear selection</Button>
          {feedback
            ? <p role="status" className="w-full text-body-2-regular text-text-secondary">{feedback}</p>
            : null}
        </SelectionDock>
    </>
  );
}
