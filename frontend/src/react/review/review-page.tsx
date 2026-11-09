/* Manual review page: putting sourced candidates in front of a person and waiting for one explicit approval or rejection.
 *
 * ADR-0018's decided items already landed in the database when the scan and profile-processing jobs finished; this page only
 * reads the remaining judgment calls, and opening it triggers no write.
 *
 * The line between address bar and component state (ADR-0031, "migration bridging"):
 * - `category` and `queue` live in the address bar; both category and processing state must survive links and refresh, and
 *   refresh too: judging halfway, hitting refresh and being thrown back to the metadata fields means finding your place again.
 * - Grouping, filtering and page number are component state. The review queue is consumable: judging one removes one, and
 *   which twenty rows "page 3" means changes with every judgment; writing it into the address would only point whoever you
 *   share with at a different batch. Changing category, grouping or filter returns to page 1, which is exactly why the page
 *   number belongs to this screen's current view, not to the page's identity. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RiCheckboxCircleLine } from '@remixicon/react';

import { Button } from '@/components/base/buttons/button';
import type { ReviewProps } from '../bundle';
import { errorMessage } from '../../api';
import { DataTableFooter } from '../components/table-controls';
import { EmptyState } from '../components/empty-state';
import { Note } from '../components/note';
import { Page } from '../components/page';
import { SortableBoardTabs, useNavigationOrder } from '../components/navigation-order';
import { ExternalLink } from '../settings/section';
import { AutoLandingsCard } from './auto-landings-card';
import { BulkToolbar } from './bulk-toolbar';
import { GenreTagList } from './candidate-form';
import { ReviewCard } from './review-card';
import type { DecisionStatus, ReviewCategory, ReviewData, ReviewGrouping, ReviewQueue, ReviewRow, RowChoice } from './review';
import {
  canApprove, currentReviewRow, DEFAULT_CATEGORY, decisionPayload, decisionReceipt, defaultChoice,
  fetchReview, filterReviewRows, groupReviewRows, isReviewCategory, mirrorText,
  REVIEW_CATEGORIES, REVIEW_KEY, REVIEW_LABELS, reviewGroupingOptions,
  REVIEW_QUEUES, REVIEW_QUEUE_LABELS, reviewQueueData, reviewQueueOf,
  reviewWindow, selectReviewRange, settleReviewRows, submitDecision,
} from './review';

// Shares the BoardUI gray PillTab styling with the config page; keeps the tabpanel and the review queue count.
const TAB_CLASS = 'flex cursor-pointer items-center justify-between gap-2';

export function ReviewPage(props: ReviewProps) {
  const categoryOrder = useNavigationOrder('review').keys.filter(isReviewCategory);
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width:900px)').matches);
  useEffect(() => {
    const query = matchMedia('(max-width:900px)');
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const {
    route, openItem, openEntity, revealSource, toast,
    readOnly, readOnlyMessage, writerUrl,
  } = props;
  const [category, setCategory] = useState<ReviewCategory>(
    isReviewCategory(props.category) ? props.category : DEFAULT_CATEGORY);
  const [queueView, setQueueView] = useState<ReviewQueue>(() => reviewQueueOf(props.queue));
  const [groupBy, setGroupBy] = useState<ReviewGrouping>('candidates');
  const [filter, setFilter] = useState('');
  const [fieldFilter, setFieldFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  /* Checkboxes, selected source values, sampled checked videos and failure reasons are all keyed by `item_key`: after paging or regrouping
     you still hold the same batch. They stay out of the URL; that is this moment's batch, not this page's identity. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set<string>());
  const [choices, setChoices] = useState<ReadonlyMap<string, RowChoice>>(new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [feedback, setFeedback] = useState('');
  /* The anchor for range multi-select: Shift counts from the last cell clicked, same semantics as the library page. */
  const anchor = useRef<string | null>(null);
  const [revealing, setRevealing] = useState(0);
  const [revealNote, setRevealNote] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false }, []);

  const review = useQuery({ queryKey: REVIEW_KEY, queryFn: ({ signal }) => fetchReview(signal) });

  const data: ReviewData = review.data || { sections: {}, counts: {},
    queues: { later: { sections: {}, counts: {} }, ignored: { sections: {}, counts: {} } } };
  const snapshot = reviewQueueData(data, queueView);
  const queueCounts = review.data ? Object.fromEntries(REVIEW_QUEUES.map(key => [key,
    REVIEW_CATEGORIES.reduce((sum, category) =>
      sum + Number(reviewQueueData(data, key).counts[category] || 0), 0)])) as Record<ReviewQueue, number> : undefined;
  const queue = snapshot.sections[category] || [];
  const metadata = category === 'metadata_fields';
  const locked = readOnly;

  useEffect(() => {
    const available = new Set(queue.map(row => row.item_key));
    setSelected(current => {
      const kept = [...current].filter(key => available.has(key));
      return kept.length === current.size ? current : new Set(kept);
    });
    setChoices(current => {
      const kept = [...current].filter(([key]) => available.has(key));
      return kept.length === current.size ? current : new Map(kept);
    });
    setErrors(current => {
      const kept = [...current].filter(([key]) => available.has(key));
      return kept.length === current.size ? current : new Map(kept);
    });
  }, [queue]);

  const fields = useMemo(() => metadata ? groupReviewRows(queue, 'field') : [], [queue, metadata]);
  const activeField = fields.some(field => field.key === fieldFilter) ? fieldFilter : '';
  const fieldQueue = useMemo(() => metadata ? filterReviewRows(queue, 'field', activeField) : queue,
    [queue, metadata, activeField]);
  const groupOptions = useMemo(() => reviewGroupingOptions(fieldQueue, metadata), [fieldQueue, metadata]);
  const activeGroupBy: ReviewGrouping =
    groupOptions.some(([key]) => key === groupBy) ? groupBy : 'candidates';
  const groups = useMemo(() => groupReviewRows(fieldQueue, activeGroupBy), [fieldQueue, activeGroupBy]);
  const activeFilter = groups.some((group) => group.key === filter) ? filter : '';
  const filteredRows = useMemo(() => filterReviewRows(fieldQueue, activeGroupBy, activeFilter),
    [fieldQueue, activeGroupBy, activeFilter]);
  const win = useMemo(() => reviewWindow(filteredRows, page, pageSize), [filteredRows, page, pageSize]);
  const pageKeys = win.rows.map((row) => row.item_key);
  const onPage = new Set(pageKeys);
  /* Groups with no cards on this page skip the section bar: an empty strip under it reads like a broken load. */
  const pageGroups = groups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => onPage.has(row.item_key)) }))
    .filter((group) => group.rows.length);

  const choiceOf = (row: ReviewRow): RowChoice => choices.get(row.item_key) || defaultChoice(row);
  const selectedRows = useMemo(() => queue.filter((row) => selected.has(row.item_key)), [queue, selected]);

  const forget = (keys: string[]) => {
    const gone = new Set(keys);
    setSelected((now) => new Set([...now].filter((key) => !gone.has(key))));
    setChoices((now) => new Map([...now].filter(([key]) => !gone.has(key))));
    setErrors((now) => new Map([...now].filter(([key]) => !gone.has(key))));
  };
  const fail = (key: string, message: string) =>
    setErrors((now) => new Map(now).set(key, message));

  /* Switching categories means switching queues: the checks, chosen sources, and failure reasons of the previous queue no longer have matching rows,
     and keeping them would only make the toolbar report an uncomputable number. */
  const resetView = () => {
    setGroupBy('candidates');
    setFilter('');
    setFieldFilter('');
    setPage(1);
    setSelected(new Set());
    setChoices(new Map());
    setErrors(new Map());
    setFeedback('');
    anchor.current = null;
  };
  const goCategory = (next: ReviewCategory) => {
    setCategory(next);
    resetView();
    route({ category: next === DEFAULT_CATEGORY ? '' : next, queue: queueView === 'pending' ? '' : queueView });
  };
  const goQueue = (next: ReviewQueue) => {
    setQueueView(next);
    resetView();
    route({ category: category === DEFAULT_CATEGORY ? '' : category, queue: next === 'pending' ? '' : next });
  };

  const decide = useMutation({
    mutationFn: ({ row, status, category: target }: { row: ReviewRow; status: DecisionStatus; category: ReviewCategory }) =>
      submitDecision(decisionPayload(target, currentReviewRow(target, row), status, choiceOf(row))),
    onSuccess: (result, { row, status, category: target }) => {
      if (!result.ok) { fail(row.item_key, result.error || 'The server rejected this verdict'); return }
      settleReviewRows(target, [row.item_key], status);
      forget([row.item_key]);
      toast(decisionReceipt(status));
    },
    onError: (cause, { row }) => fail(row.item_key, errorMessage(cause)),
  });

  /* Submit the batch item by item: failures stay on screen for retry, successes leave the queue immediately. Hand the whole batch over at once and
     if any entry in the middle is rejected by the server, the user cannot tell whether the earlier ones were written. */
  const bulk = useMutation({
    mutationFn: async ({ status, category: target, rows }: {
      status: DecisionStatus; category: ReviewCategory; rows: ReviewRow[];
    }) => {
      const done: string[] = [];
      const failures: [string, string][] = [];
      for (const [at, row] of rows.entries()) {
        if (!alive.current) break;
        setFeedback(`Processing ${at} / ${rows.length}`);
        try {
          const result = await submitDecision(decisionPayload(target, currentReviewRow(target, row), status, choiceOf(row)));
          if (!result.ok) throw new Error(result.error || 'The server did not adopt this entry');
          done.push(row.item_key);
        } catch (cause) {
          failures.push([row.item_key, errorMessage(cause)]);
        }
      }
      return { status, category: target, done, failures };
    },
    onSuccess: ({ status, category: target, done, failures }) => {
      settleReviewRows(target, done, status);
      forget(done);
      failures.forEach(([key, message]) => fail(key, message));
      setFeedback('');
      const action = { approved: 'Approve', rejected: 'Ignore', skipped: 'Move to handle-later', restore: 'Restore pending' }[status];
      toast(`${action} ${done.length} items`
        + (failures.length ? `, ${failures.length} unfinished` : ''));
    },
    onError: (cause) => { setFeedback(errorMessage(cause)) },
  });

  const runBulk = (status: DecisionStatus) => {
    if (bulk.isPending || !selectedRows.length) return;
    if (status === 'approved' && metadata
      && selectedRows.some((row) => !choiceOf(row).candidateKey)) {
      setFeedback('Choose which source to adopt for the selected details first.');
      return;
    }
    setFeedback('');
    bulk.mutate({ status, category, rows: selectedRows });
  };

  /* Bulk-selecting sources only changes the selection on the chosen rows and never approves on the user's behalf: it changes what would be written, and the judgment stays human. */
  const unifySource = (source: string) => {
    setChoices((now) => {
      const next = new Map(now);
      for (const row of selectedRows) {
        const candidate = row.candidates?.find((item) => item.source === source);
        if (candidate) next.set(row.item_key, { ...choiceOf(row), candidateKey: candidate.candidate_key });
      }
      return next;
    });
    setFeedback(`${source} selected; click to adopt the selection.`);
  };

  const reveal = async (id: number) => {
    if (revealing) return;
    setRevealing(id);
    setRevealNote('');
    const note = await revealSource(id);
    if (!alive.current) return;
    setRevealing(0);
    setRevealNote(note);
  };

  const mirror = mirrorText(data.mirror, readOnlyMessage);
  const genreTags = data.genre_tags || [];
  const handlers = {
    openItem, openEntity, onReveal: reveal, revealing, revealNote, toast,
  };

  return (
    <Page>
      <div className="flex flex-col gap-5 pb-10">
      {locked ? (
        <Note tone="warning" title="This machine is browse-only"
          extra={writerUrl
            ? <p className="text-body-2-regular">
                <ExternalLink href={writerUrl}>Go to write side for review</ExternalLink>
              </p>
            : undefined}>
          {mirror}
        </Note>
      ) : null}
      <GenreTagList tags={genreTags} />

      {/* The category catalog sits to the left of the body; narrow screens use navigation above the body. */}
      <div className="flex flex-col gap-5 review-split:flex-row review-split:items-start review-split:gap-6">
        <div data-section-nav className="w-full min-w-0 review-split:sticky review-split:top-topbar review-split:w-review-tabs review-split:shrink-0">
          <h2 id="reviewcategories">Review categories</h2>
          <SortableBoardTabs group="review" label="Review categories" value={category} onChange={goCategory}
            orientation={narrow ? 'horizontal' : 'vertical'} panelPrefix="review" sectionItems
            className="" itemClassName={TAB_CLASS} disabled={decide.isPending || bulk.isPending}
            tabs={REVIEW_CATEGORIES.map((key) => {
              const count = Number(snapshot.counts[key] || 0);
              return { value: key, label: REVIEW_LABELS[key], badge: count
                    ? <span className="tabular-nums text-caption-1-medium text-text-secondary">
                        {count.toLocaleString()}
                      </span>
                    : null };
            })} />
        </div>

        <div role="tabpanel" id={`review-panel-${category}`} aria-labelledby={`review-tab-${category}`}
          className="flex min-w-0 flex-1 flex-col gap-5">
            <BulkToolbar queueView={queueView} queueCounts={queueCounts} onQueueChange={goQueue} locked={locked}
              fields={fields} fieldFilter={activeField}
              onFieldFilter={(next) => { setFieldFilter(next); setFilter(''); setPage(1) }}
              groupOptions={groupOptions} groupBy={activeGroupBy}
              onGroupBy={(next) => { setGroupBy(next); setFilter(''); setPage(1) }}
              groups={groups} filter={activeFilter}
              onFilter={(next) => { setFilter(next); setPage(1) }}
              pageKeys={pageKeys} selected={selected} onSelected={setSelected}
              selectedRows={selectedRows} metadata={metadata}
              approvable={selectedRows.every((row) => canApprove(category, row))}
              busy={bulk.isPending || decide.isPending} feedback={feedback}
              onUnifySource={unifySource} onRun={runBulk} />

          {win.rows.length ? pageGroups.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              {pageGroups.length > 1 || activeGroupBy !== 'candidates' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-body-medium text-text-primary">
                    {`${group.title} · ${group.rows.length}`}
                  </h3>
                  {locked ? null : (
                    <Button variant="ghost" size="small" onClick={() => {
                      const keys = group.rows.map((row) => row.item_key);
                      const all = keys.every((key) => selected.has(key));
                      const next = new Set(selected);
                      for (const key of keys) { if (all) next.delete(key); else next.add(key) }
                      setSelected(next);
                    }}>
                      {group.rows.every((row) => selected.has(row.item_key)) ? 'Clear this group' : 'Select this group'}
                    </Button>
                  )}
                </div>
              ) : null}
              <div className="review-grid gap-5">
                {group.rows.map((row) => (
                  <ReviewCard key={row.item_key} category={category} row={row} queueView={queueView}
                    choice={choiceOf(row)}
                    onChoice={(next) => setChoices((now) => new Map(now).set(row.item_key, next))}
                    selected={selected.has(row.item_key)}
                    onSelect={(range, checked) => setSelected((now) => {
                      const next = new Set(now);
                      anchor.current = selectReviewRange(
                        next, pageKeys, anchor.current, row.item_key, range, checked);
                      return next;
                    })}
                    locked={locked}
                    busy={bulk.isPending || decide.isPending && decide.variables?.row.item_key === row.item_key}
                    problem={errors.get(row.item_key) || ''}
                    genreTags={genreTags}
                    onDecide={(status) => {
                      if (decide.isPending || bulk.isPending) return;
                      setErrors((now) => new Map([...now].filter(([key]) => key !== row.item_key)));
                      decide.mutate({ row, status, category });
                    }}
                    handlers={handlers} />
                ))}
              </div>
            </section>
          )) : review.isError && !review.data ? (
            /* A queue that cannot be read is not an empty queue: say it is a read failure and give a retry button. */
            <Note tone="error" title="Reading the review queue failed" action={
              <Button variant="secondary" size="small" disabled={review.isFetching} onClick={() => void review.refetch()}>Retry now</Button>
            }>
              {errorMessage(review.error)}
            </Note>
          ) : (
            <EmptyState icon={RiCheckboxCircleLine} title={`This category has no ${REVIEW_QUEUE_LABELS[queueView]} items`}
              actions={REVIEW_CATEGORIES.some(key => key !== category && Number(snapshot.counts[key] || 0) > 0)
                ? <Button size="small" onClick={() => {
                    const next = categoryOrder.find(key => key !== category && Number(snapshot.counts[key] || 0) > 0);
                    if (next) goCategory(next);
                  }}>View other categories</Button> : undefined}>
              {queueView === 'pending' ? 'Switch categories to view other unconfirmed details.' : `Details from ${REVIEW_QUEUE_LABELS[queueView]} stay here and can be restored to pending.`}
            </EmptyState>
          )}

          {filteredRows.length ? <DataTableFooter label="Review" total={filteredRows.length}
            pagination={{ pageIndex: win.page - 1, pageSize }}
            onChange={(next) => { setPage(next.pageIndex + 1); setPageSize(next.pageSize) }} /> : null}
          {metadata && queueView === 'pending'
            ? <AutoLandingsCard locked={locked} openItem={openItem} toast={toast} />
            : null}
        </div>
      </div>
      </div>
    </Page>
  );
}
