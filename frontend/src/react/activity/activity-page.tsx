/* 活动页：任务中心那张表的唯一界面。
 *
 * 这一屏要回答三个问题，顺序就是它们的紧迫程度：现在有什么在跑、有哪一轮被挡下了、
 * 刚跑完的那些怎么样。三段共用 `/api/tasks` 一次请求的结果。最前面的「需要处理」是后台服务
 * 此刻的问题，末尾的「云下载」段是网盘离线任务，两者各自取数与轮询（`background-issues.tsx`、
 * `downloads-panel.tsx`），和这三段互不牵连。
 *
 * 轮询交给 Query 的 `refetchInterval`：间隔按上一次拿到的内容算，有东西在跑两秒一次，
 * 全是终态十秒一次。它是后台刷新，不写 `aria-busy`——页面上的内容一直是完整的，写了
 * 等于告诉辅助技术和冒烟用例「这一屏还没好」。取数失败只在页内报一条，上一份数据留着：
 * 服务重启的那几秒里，把整页换成一句错误比留着十秒前的进度更难用。
 *
 * 各段使用统一分页，最近完成按服务端页码读取，轮询刷新当前页。 */
import { Children, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { RiArrowRightLine, RiHistoryLine } from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';

import { Chip } from '@/components/base/badges/chip';
import { LinkButton } from '@/components/base/buttons/link-button';

import { apiGet, errorMessage } from '../../api';
import { cardClass } from '../components/card';
import { CodeBlock } from '../components/code-block';
import { EmptyState } from '../components/empty-state';
import { IssueRow } from '../components/issue-row';
import { LoadingDots } from '../components/loading-dots';
import { NameLink } from '../components/name-link';
import { Note } from '../components/note';
import { Page } from '../components/page';
import { Progress } from '../components/progress';
import { DataTableFooter } from '../components/table-controls';
import { Disclosure } from '../settings/section';
import { BackgroundIssues } from './background-issues';
import { DownloadsPanel } from './downloads-panel';
import { ErrorDetails, ErrorExcerpt } from './error-excerpt';
import { TaskControlFeedback, TaskControls } from './task-controls';
import { TaskIcon } from './task-icon';
import { TaskResources } from './task-resources';
import {
  elapsedText, fetchTasks, foldByKind, foldRoutine, followupDetail, followupTally, groupFollowups, isActive,
  hasResultProblems, isRoutine, latestOfKind, momentText, pollInterval, problemDestination, progressText,
  readableErrorHeadline, statusLabel, summaryItems, taskIssues, taskSubject, TASKS_KEY, TRIGGER_LABELS, type FollowupCounts, type TaskControlState, type TaskRunPayload,
} from './tasks';

/** It only dispatches successor tasks: one round is just 'how many were scheduled'; what matters is the results of those items. */
const DISPATCHERS = new Set(['upgrade-repairs']);
/** The two items written into the summary at start, indicating which work this round processes (`taskSubject`). */
const SUBJECT_KEYS = new Set(['asset_id', 'name']);

/* 完成绿、失败与已取消红、进行中蓝、意外中断黄，排队为中性。 */
const BADGE_COLORS: Record<string, 'lime' | 'rose' | 'yellow' | 'blue' | 'neutral'> = {
  succeeded: 'lime', failed: 'rose', cancelled: 'rose', interrupted: 'yellow', running: 'blue', pending: 'neutral',
};

const CONTROL_LABELS: Record<TaskControlState, string> = {
  running: 'In progress', pausing: 'Pausing', paused: 'Paused', cancelling: 'Cancelling',
};

function StatusBadge({ run }: { run: TaskRunPayload }) {
  const control = run.control?.state;
  if (control && (control !== 'running' || !isActive(run))) {
    return <Chip color={control === 'running' ? 'blue' : 'neutral'}>
      <span data-copy-key={`tasks.control.state.${control}`}>{CONTROL_LABELS[control]}</span>
    </Chip>;
  }
  const partial = run.status === 'failed' && run.task_key === 'library-processing'
    && run.result_summary?.outcome === 'partial';
  const problems = partial || run.status === 'succeeded' && hasResultProblems(run);
  return <Chip color={problems ? 'yellow' : BADGE_COLORS[run.status] ?? 'neutral'}>
    {partial ? 'Some items need handling' : problems ? 'Issues found' : statusLabel(run.status)}
  </Chip>;
}

/** Successors dispatched by one run (ADR-0040). Attached inside the parent task card, one per row.
 *
 * A successor is its own run with its own status and results, but shown alone it cannot tell who dispatched it,
 * and that is exactly the only thing this screen needs to explain: the user never clicked "fetch covers", yet it is running.
 * Inter-row lines are written on each li itself; the first row's line doubles as the divider from the card body. */
function FollowupList({ rows }: { rows: TaskRunPayload[] }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const { pageSize } = pagination;
  const current = Math.min(pagination.pageIndex, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  return (<>
    <ul className="-mr-5 flex min-w-0 flex-col">
      {rows.slice(current * pageSize, (current + 1) * pageSize).map((row) => {
        const detail = followupDetail(row);
        return (
          <li key={row.id} data-status={row.status} data-followup-key={row.followup_key}
            className="flex min-w-0 flex-col gap-1 border-t border-separator-border py-2.5 pr-10 pl-5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-x-2 gap-y-1">
                <TaskIcon taskKey={row.task_key} className="size-4 shrink-0 text-text-secondary" />
                <span className="min-w-0 break-words text-caption-1-regular text-text-primary">
                  {row.task_label}
                </span>
                <StatusBadge run={row} />
                {detail
                  ? <span className="min-w-0 break-words text-caption-1-regular text-text-secondary">{detail}</span>
                  : null}
              </div>
              <TaskControls run={row} />
            </div>
            <TaskResources run={row} />
            {/* Queued ones have no results yet: an empty "Technical details" expands to just a pair of braces. */}
            {Object.keys(row.result_summary || {}).length
              ? <div className="w-full min-w-0">
                  <Disclosure summary="Technical details" contentClassName="pb-2.5">
                    <CodeBlock code={JSON.stringify(row.result_summary, null, 2)} language="json"
                      label={`${row.task_label} technical details`} />
                  </Disclosure>
                </div>
              : null}
          </li>
        );
      })}
    </ul>
    <DataTableFooter label="Task details" total={rows.length} pagination={{ ...pagination, pageIndex: current }}
      onChange={setPagination} />
  </>);
}

/** One card per task run. On failure the whole card's border switches to the danger color instead of coloring the end-reason line:
 *  reading red text line by line across a dozen rows is much slower than glancing at which card has a red border. */
function RunCard(
  { run, meta, children, error, issues, followups, followupTotal = 0, badge, resourceActive, controlled }:
  { run: TaskRunPayload; meta: string; children?: ReactNode; error?: string; issues?: ReactNode;
    followups?: TaskRunPayload[]; followupTotal?: number; badge?: ReactNode; resourceActive?: boolean;
    controlled?: TaskRunPayload[] },
) {
  const [detailOpen, setDetailOpen] = useState(Boolean(followups?.some(isActive)));
  const parentIds = (controlled || [run]).map((parent) => parent.id);
  const needsDetails = followupTotal > (followups?.length || 0);
  const detail = useQuery({
    queryKey: [...TASKS_KEY, 'followups', parentIds],
    enabled: detailOpen && needsDetails,
    queryFn: async ({ signal }) => {
      const snapshots = await Promise.all(parentIds.map((id) =>
        apiGet<{ followups: TaskRunPayload[] }>(`/api/tasks/${id}`, signal)));
      return snapshots.flatMap((snapshot) => snapshot.followups);
    },
    refetchInterval: resourceActive ? 2000 : false,
  });
  const rank = (row: TaskRunPayload) => (row.status === 'running' ? 3 : row.status === 'pending' ? 2
    : row.status === 'failed' || row.status === 'interrupted' ? 1 : 0);
  const listed = [...((needsDetails ? detail.data : undefined) || followups || [])].sort((a, b) =>
    rank(b) - rank(a) || b.id - a.id);
  const shown = listed.length;
  const total = Math.max(followups?.length || 0, followupTotal);
  const subject = taskSubject(run);
  const errorFull = String(error || '').trim();
  const errorHead = readableErrorHeadline(errorFull);
  return (
    // The `id` lets the "needs attention" row's "View failures" scroll straight to this card.
    <li id={`run-${run.id}`} data-status={run.status} data-task-key={run.task_key} data-run-id={run.id}
      className={cardClass({
        padding: 'none', bordered: run.status === 'failed' ? 'error' : undefined, className: 'flex flex-col',
      })}>
      {/* The card title is one step below the section title ('In progress'), and title, time and summary share one line spacing. */}
      <div className="flex flex-col gap-2 px-5 py-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-48 flex-wrap items-center gap-2">
            <TaskIcon taskKey={run.task_key} className="size-5 shrink-0 text-text-secondary" />
            <strong className="min-w-0 break-words text-title-3-medium text-text-primary">{run.task_label}</strong>
            {badge ?? <StatusBadge run={run} />}
          </div>
          <TaskControls run={run} runs={controlled} />
        </div>
        <p className="text-caption-1-regular text-text-secondary">{meta}</p>
        <TaskResources run={run} active={resourceActive} />
        {/* Filenames often run to hundreds of characters: single-line with a tail ellipsis, the code up front, the full name in the hover tooltip. No data-middle-truncate:
            it measures width on Canvas without CJK/Latin auto-spacing, so names mixing CJK and English get their trailing pixels clipped. */}
        {subject ? <NameLink href={subject.href} data-task-subject={run.id} title={subject.label}
          className="min-w-0 max-w-full self-start truncate text-text-primary">
          {subject.label}
        </NameLink> : null}
        {/* The end reason is the conclusion of this round, written in the body like the summary; the full text is details, collapsed into 'Error details' below. */}
        {errorHead ? <p data-task-error="" className="text-caption-1-regular text-text-secondary wrap-anywhere">{errorHead}</p> : null}
        {children}
      </div>
      {/* Issue details, error details, task details, and technical details are all expandable details, likewise laid out as a row at the card's bottom with a divider, in this order. */}
      {issues ? <div className="border-t border-separator-border">{issues}</div> : null}
      {errorHead && errorFull !== errorHead ? <div className="border-t border-separator-border">
        <Disclosure row summary="Error details" contentClassName="pb-5">
          <ErrorDetails label={`${run.task_label} Error details`}>{errorFull}</ErrorDetails>
        </Disclosure>
      </div> : null}
      {total ? <div className="border-t border-separator-border">
        <Disclosure row summary={`Task details · ${total.toLocaleString()} ${total === 1 ? 'item' : 'items'}`}
          contentClassName="pb-5"
          isOpen={detailOpen} onOpenChange={setDetailOpen}>
          {detail.error ? <Note tone="error">{errorMessage(detail.error)}</Note> : null}
          {shown < total
            ? <p className="text-caption-1-regular text-text-secondary">Listing {shown.toLocaleString()} {shown === 1 ? 'item' : 'items'}</p>
            : null}
          <FollowupList rows={listed} />
        </Disclosure>
      </div> : null}
      {/* When the summary only has the work written at start, it's already linked on the card, so no separate technical-details block is added. */}
      {Object.keys(run.result_summary || {}).some((key) => !(subject && SUBJECT_KEYS.has(key)))
        ? <div className="border-t border-separator-border">
        <Disclosure row summary="Technical details" contentClassName="pb-5">
          <CodeBlock code={JSON.stringify(run.result_summary, null, 2)} language="json"
            label={`${run.task_label} technical details`} />
        </Disclosure>
      </div> : null}
    </li>
  );
}

function RunningRun({ run, followups, followupTotal }:
  { run: TaskRunPayload; followups?: TaskRunPayload[]; followupTotal?: number }) {
  const total = run.progress_total || 0;
  const current = run.progress_current || 0;
  const control = run.control?.state;
  const stopping = control && control !== 'running';
  const label = stopping ? CONTROL_LABELS[control] : run.progress_label || 'Running';
  const elapsed = elapsedText(run.elapsed_seconds);
  const meta = [TRIGGER_LABELS[run.trigger] || run.trigger, elapsed && `Ran for ${elapsed}`]
    .filter(Boolean).join(' · ');
  return (
    <RunCard run={run} meta={meta} followups={followups} followupTotal={followupTotal}>
      {total > 0
        ? <div className="flex flex-col gap-1.5">
            <Progress label={label} value={Math.min(current, total)} max={total} />
            <p className="text-caption-1-regular text-text-secondary wrap-anywhere">{label} · {progressText(current, total)} items</p>
          </div>
        : stopping ? <p data-copy-key={`tasks.control.state.${control}`}
            className="text-caption-1-regular text-text-secondary">{label}</p> : <LoadingDots label={label} />}
    </RunCard>
  );
}

/** A finished run. With more than one entry in `runs`, these are collapsed routine rounds: the time is written as the span
 *  from earliest to latest, and the summary takes the newest round, since routine rounds' summaries are identical anyway and
 *  listing each would just copy one line N times.
 *  The job card records only this run's history: problems still unresolved and "Retry now" live in the page-top "Needs
 *  attention" block.
 *  `latest` says whether it is that job kind's newest round: some jobs only have an action entry point on the newest round. */
function SettledRun(
  { run, followups, runs, latest, followupTotal, followupFailed = 0, followupCancelled = 0 }:
  { run: TaskRunPayload; followups?: TaskRunPayload[]; runs?: TaskRunPayload[]; latest: boolean;
    followupTotal?: number; followupFailed?: number; followupCancelled?: number },
) {
  /* When several dispatched batches merge into one card, the latest batch's "64 items scheduled" cannot tell the whole story: say instead how many items were processed in total and how many failed,
     with the badge reading "issues found" when there are failures, and the failed entries sorted to the front of the task details. */
  const batches = Boolean(runs && runs.length > 1 && followupTotal);
  const summary = batches
    ? [`Processed ${followupTotal!.toLocaleString()} items in total`, followupFailed ? `${followupFailed.toLocaleString()} of them failed` : '']
        .filter(Boolean)
    // The work link already carries the file name, so the summary no longer lists “name”.
    : summaryItems(taskSubject(run) ? { ...run.result_summary, name: '' } : run.result_summary)
        // The end reason gets its own line on the card; the summary does not repeat the same sentence.
        .filter((line) => line !== run.error && line !== readableErrorHeadline(run.error));
  const issues = taskIssues(run);
  const destination = problemDestination(run, latest);
  const elapsed = elapsedText(run.elapsed_seconds);
  const oldest = runs && runs.length > 1 ? runs[runs.length - 1] : undefined;
  const meta = (oldest
    ? [TRIGGER_LABELS[run.trigger] || run.trigger, `Last ${runs!.length} rounds`,
       `${momentText(oldest.finished_at)} – ${momentText(run.finished_at)}`]
    : [TRIGGER_LABELS[run.trigger] || run.trigger, momentText(run.finished_at),
       elapsed && `Took ${elapsed}`]).filter(Boolean).join(' · ');
  return (
    <RunCard run={run} meta={meta} error={run.error} followups={followups} followupTotal={followupTotal} controlled={runs}
      issues={issues.length ? <Disclosure row summary={`Issue details · ${issues.length} ${issues.length === 1 ? 'item' : 'items'}`} contentClassName="pb-5">
        <ErrorDetails label="Task issue details">
        {/* The same hierarchy as the data management issue list: the name is one tier, source and issue category follow the name in a secondary color, and the reason is one tier lower. */}
        <ul className="flex min-w-0 flex-col whitespace-normal" data-task-issues="">
          {issues.map((issue, index) => <IssueRow key={`${issue.source}-${index}`} title={<>
              {issue.label}
              {issue.provider || issue.kind
                ? <span className="text-body-2-regular text-text-secondary"> · {[issue.provider, issue.kind].filter(Boolean).join(' · ')}</span>
                : null}
            </>}>
            <ErrorExcerpt text={issue.error} className="text-caption-1-regular text-text-secondary" />
          </IssueRow>)}
        </ul>
        </ErrorDetails>
      </Disclosure> : undefined}
      badge={followupCancelled && run.status === 'succeeded'
        ? <Chip color="rose"><span data-copy-key={`tasks.followups.cancelled.${followupCancelled === followupTotal ? 'all' : 'partial'}`}>
            {followupCancelled === followupTotal ? 'Follow-up tasks cancelled' : 'Some follow-up tasks were cancelled'}
          </span></Chip>
        : batches && followupFailed ? <Chip color="yellow">Issues found</Chip> : undefined}>
      {followupCancelled ? <p className="text-caption-1-regular text-text-secondary">
        Follow-up tasks cancelled {followupCancelled.toLocaleString()} items
      </p> : null}
      {/* No bullet when there is only one summary line: a lone dot reads like text missing below. */}
      {summary.length === 1
        ? <p className="text-caption-1-regular text-text-secondary wrap-anywhere">{summary[0]}</p>
        : summary.length ? <ul className="flex list-disc flex-col gap-1 pl-5 text-caption-1-regular text-text-secondary wrap-anywhere">
            {summary.map((line, index) => <li key={index}>{line}</li>)}
          </ul> : null}
      {!issues.length && hasResultProblems(run) && ['follow-check', 'feed-check'].includes(run.task_key)
        ? <p className="text-body-2-regular text-text-secondary">Per-item details for this round were not fetched; check results are available in the source list.</p> : null}
      {destination
        ? <LinkButton href={destination.href} size="small" trailingIcon={RiArrowRightLine}
            className="self-start">
            {destination.label}
          </LinkButton> : null}
    </RunCard>
  );
}

/** Rounds that finished themselves while their dispatched successors are still running merge into one card per task kind.
 *
 * The parent task's round is only "scheduling", done in seconds; what the user cares about is how far the scheduled batch got. So the badge reads in-progress,
 * and the progress bar counts all successors, not the rows listed on the page. */
function WorkingRun(
  { runs, followups, counts }:
  { runs: TaskRunPayload[]; followups: TaskRunPayload[]; counts: FollowupCounts | undefined },
) {
  const run = runs[0]!;
  const oldest = runs[runs.length - 1]!;
  const tally = followupTally(counts, runs);
  const total = Math.max(tally.total, followups.length);
  const settled = tally.total ? tally.settled : followups.filter((row) => !isActive(row)).length;
  const failed = tally.total ? tally.failed
    : followups.filter((row) => row.status === 'failed' || row.status === 'interrupted').length;
  const meta = [TRIGGER_LABELS[run.trigger] || run.trigger,
    runs.length > 1 ? `${runs.length} batches` : '',
    `Started ${momentText(oldest.started_at || oldest.finished_at)}`].filter(Boolean).join(' · ');
  return (
    <RunCard run={run} meta={meta} followups={followups} followupTotal={total} resourceActive controlled={runs}
      badge={run.control ? <StatusBadge run={run} /> : <Chip color="blue">Running</Chip>}>
      <div className="flex flex-col gap-1.5">
        <Progress label={`${run.task_label} progress`} value={settled} max={total} />
        <p className="text-caption-1-regular text-text-secondary">
          Processed {progressText(settled, total)} items{failed ? ` · ${failed.toLocaleString()} of them failed` : ''}
        </p>
      </div>
    </RunCard>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h3 id={id} className="text-title-2-medium text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

function RunList({ live = false, paginate = true, children }: { live?: boolean; paginate?: boolean; children: ReactNode }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const rows = Children.toArray(children);
  const { pageSize } = pagination;
  const current = Math.min(pagination.pageIndex, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  return <>
    <ul aria-live={live ? 'polite' : undefined} className="flex min-w-0 flex-col gap-3">
      {paginate ? rows.slice(current * pageSize, (current + 1) * pageSize) : rows}
    </ul>
    {paginate ? <DataTableFooter label="Task list" total={rows.length}
      pagination={{ ...pagination, pageIndex: current }} onChange={setPagination} /> : null}
  </>;
}

export function ActivityPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const tasks = useQuery({
    queryKey: page === 1 && pageSize === 20 ? TASKS_KEY : [...TASKS_KEY, 'page', page, pageSize],
    queryFn: ({ signal }) => fetchTasks(signal, page, pageSize),
    refetchInterval: (query) => pollInterval(query.state.data),
    placeholderData: (previous) => previous,
  });
  const [lastData, setLastData] = useState(tasks.data);
  if (tasks.data && tasks.data !== lastData) setLastData(tasks.data);
  const data = tasks.data || lastData;
  const problem = tasks.error ? errorMessage(tasks.error) : '';
  // The first screen got no data at all: only this one line remains, and the empty three segments are not drawn.
  if (!data) return <Page><Note tone="error">{problem || 'Reading the task center failed'}</Note></Page>;

  const allFinished = data.finished || [];
  const parents = data.working_parents || [];
  const allRuns = [...(data.running || []), ...(data.skipped || []), ...allFinished, ...parents];
  // A successor hangs under the card that dispatched it. When the parent job is not on this screen (already pruned) it still stands alone
  // -- If it cannot mount, it does not render, which makes a running task vanish into thin air.
  const byParent = groupFollowups(allRuns);
  const visible = new Set(allRuns.map((run) => run.id));
  const topLevel = (rows: TaskRunPayload[]) => rows.filter(
    (run) => !(run.followup_key && run.parent_run_id != null && visible.has(run.parent_run_id)));
  const settled = topLevel(allFinished);
  const counts: FollowupCounts = data.followup_counts || {};
  const childrenOf = (runs: TaskRunPayload[]) => runs.flatMap((run) => byParent.get(run.id) || []);
  // A round that finished itself while its dispatched successors are still running counts as 'in progress': the whole job is not done yet, it goes under 'Recently finished'
  // Simply one card with one finished and one in progress. The page can only list some of the successors, so read the counts first.
  const working = [...settled, ...topLevel(parents)].filter((run) => followupTally(counts, [run]).active > 0
    || byParent.get(run.id)?.some(isActive)).sort((a, b) => b.id - a.id);
  const running = topLevel(data.running || []);
  const skipped = topLevel(data.skipped || []);
  // The same round does not appear twice under 'Recently finished': two rows on one screen telling one story reads like two runs.
  const finished = settled.filter((run) => !working.includes(run)
    && !skipped.some((row) => row.id === run.id));
  // The hourly scheduled check lists every item even when nothing happened, filling a page with the same "checked 83" line.
  // For a round that dispatched successors, it counts as routine only when every successor finished cleanly; one failure and it stands alone. The dispatch-only kind
  // (Auto-repair runs one batch per minute) Exception: several batches of the same thing still merge into one card, with the failure count written on it.
  const quietChildren = (run: TaskRunPayload) => {
    const children = byParent.get(run.id) || [];
    return children.every((row) => row.status === 'succeeded' && !hasResultProblems(row))
      && followupTally(counts, [run]).failed === 0;
  };
  const folds = foldRoutine(finished, (run) => isRoutine(run)
    && (quietChildren(run) || DISPATCHERS.has(run.task_key)));
  // 控制状态相同的几批合成一张，卡上的暂停、继续、取消对其中每一批都发一次；
  // 状态不同的（一批已暂停、一批在跑）分开摆，按钮才说得清作用在哪批上。
  const workingGroups = foldByKind(working, (run) => run.control?.state || '')
    .sort((left, right) => right.run.id - left.run.id);
  const newest = latestOfKind(allRuns);
  const quiet = !running.length && !working.length && !skipped.length && !finished.length;
  return (
    <Page>
      {problem ? <Note tone="error">{problem}</Note> : null}
      <TaskControlFeedback />
      {data.available === false
        ? <Note tone="warning">{data.message || 'The database has not set up the task records table yet'}</Note>
        : null}
      {/* Background service problems come first: they do not finish on their own and need a human to handle. */}
      <BackgroundIssues />
      {quiet
        ? <EmptyState icon={RiHistoryLine} title="No task records yet">
            Once scans, update checks, bulk actions, and command-line batches run, their progress and results show up here.
          </EmptyState>
        : <>
            <Section title="Running">
              {running.length || working.length
                ? <RunList live>
                    {running.map((run) => (
                      <RunningRun key={run.id} run={run} followups={byParent.get(run.id)}
                        followupTotal={followupTally(counts, [run]).total} />))}
                    {workingGroups.map(({ run, runs }) => (
                      <WorkingRun key={run.id} runs={runs} followups={childrenOf(runs)} counts={counts} />))}
                  </RunList>
                : <Note tone="neutral">No tasks running.</Note>}
            </Section>
            {/* Only this section can answer "why did the last round not run": a scheduled trigger that lands on a running round skips silently,
                and without a record it looks on screen exactly like never having triggered. */}
            {skipped.length
              ? <Section title="Not executed this time">
                  <RunList>{skipped.map((run) => (
                    <SettledRun key={run.id} run={run} latest={newest.has(run.id)} followups={byParent.get(run.id)} />))}</RunList>
                </Section>
              : null}
            {finished.length || Boolean(data.finished_total)
              ? <Section title="Recently completed">
                  {finished.length
                    ? <RunList paginate={false}>{folds.map(({ run, runs }) => {
                        const tally = followupTally(counts, runs);
                        return <SettledRun key={run.id} run={run} runs={runs} latest={newest.has(run.id)}
                          followups={childrenOf(runs)} followupTotal={tally.total} followupFailed={tally.failed}
                          followupCancelled={tally.cancelled} />;
                      })}</RunList>
                    : null}
                  <DataTableFooter label="Recently completed" total={data.finished_total ?? settled.length} unit="rounds" pageUnit="rounds"
                    pagination={{ pageIndex: (data.finished_page || page) - 1, pageSize }}
                    onChange={(next) => {
                      if (next.pageIndex + 1 === page && next.pageSize === pageSize) void tasks.refetch();
                      else { setPage(next.pageIndex + 1); setPageSize(next.pageSize) }
                    }} />
                </Section>
              : null}
          </>}
      {/* Offline downloads run on the cloud drive's side, with their own table and their own polling; they are there even when the task center is empty. */}
      <DownloadsPanel />
    </Page>
  );
}
