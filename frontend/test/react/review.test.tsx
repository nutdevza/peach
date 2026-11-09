/* Manual review page behavior: the category is the address bar's identity, grouping, filter, and pagination are this moment's view, decisions only change those rows in the cache,
 * and this page writes nothing on a read-only database.
 *
 * Appearance (card background, tab selected state) is a design decision asserted by `frontend/e2e/design-*.test.ts` reading
 * `getComputedStyle`; here we only check structure, text, and requests. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { queryClient } from '../../src/react/query';
import {
  commonReviewSources, filterReviewRows, groupReviewRows, prefetchReview, REVIEW_DECISION_URL,
  REVIEW_KEY, REVIEW_PAGE_SIZE, REVIEW_URL, reviewGroupingOptions, settleReviewRows,
  reviewWindow, type ReviewCandidate, type ReviewData, type ReviewRow,
  type DecisionResult,
} from '../../src/react/review/review';
import { AUTO_LANDINGS_URL, type AutoLandingWrite } from '../../src/react/review/auto-landings';
import { ReviewPage } from '../../src/react/review/review-page';

import { actionOrder, choose, click, mountRoot, settle } from './render';

// The client is a module-level singleton (all React roots share one); without clearing between test cases they feed each other data.
afterEach(() => queryClient.clear());

/* Query dispatches updates through the real `setTimeout(0)` it captured itself, which the fake clock cannot advance: after advancing the clock
   the assertions still see the previous frame's DOM. The case dispatches immediately instead. */
notifyManager.setScheduler((notify) => notify());

const candidate = (source: string, value: string): ReviewCandidate =>
  ({ candidate_key: `${source}:${value}`, source, display_value: value });

/** One metadata field candidate. Several entries in `sources` mean several candidates; one means a single source. */
const row = (at: number, sources: string[] = ['javdb', 'nfo']): ReviewRow => ({
  item_key: `row-${at}`,
  queue_order: at,
  field: 'title',
  field_label: 'Title',
  query: `ABC-${at}`,
  candidates: sources.map((source) => candidate(source, `Title from ${source} ${at}`)),
});

/** 22 multi-source entries and 3 single-source ones: enough for two pages and for two groups. */
const QUEUE: ReviewRow[] = [
  ...Array.from({ length: 22 }, (_, at) => row(at)),
  ...Array.from({ length: 3 }, (_, at) => row(100 + at, ['nfo'])),
];

const review = (over: Partial<ReviewData> = {}): ReviewData => ({
  sections: { metadata_fields: QUEUE, creator_tags: [] },
  counts: { metadata_fields: QUEUE.length, creator_tags: 0 },
  queues: { later: { sections: {}, counts: {} }, ignored: { sections: {}, counts: {} } },
  genre_tags: ['Drama'],
  ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

interface Plan {
  data?: ReviewData;
  /** Verdict answers: given a list, answer in order one by one (after the last, keep returning it). */
  decisions?: DecisionResult[];
  /** 「自动写入的资料」列出的条目；缺省没有，那一块不出现。 */
  autoLandings?: AutoLandingWrite[];
}

function serve(plan: Plan = {}) {
  const decisions = [...(plan.decisions ?? [{ ok: true }])];
  const fetcher = vi.fn(async (input: string, _init?: RequestInit) => {
    const url = String(input);
    if (url === REVIEW_DECISION_URL) {
      return ok(decisions.length > 1 ? decisions.shift()! : decisions[0]!);
    }
    if (url.startsWith(AUTO_LANDINGS_URL)) return ok({ items: plan.autoLandings ?? [] });
    if (url.startsWith(REVIEW_URL)) return ok(plan.data ?? review());
    throw new Error(`No handler is scheduled for this endpoint: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

type Props = Parameters<typeof ReviewPage>[0];

const shellProps = (over: Partial<Props> = {}): Props => ({
  category: '',
  route: vi.fn(),
  openItem: vi.fn(),
  openEntity: vi.fn(),
  revealSource: vi.fn(async () => ''),
  toast: vi.fn(),
  readOnly: false,
  readOnlyMessage: 'This device is browse-only',
  writerUrl: '',
  ...over,
});

/** Walks the real first-screen path: fetch only the queue, then mount. */
async function open(plan: Plan = {}, over: Partial<Props> = {}) {
  const fetcher = serve(plan);
  const props = shellProps(over);
  await prefetchReview(new AbortController().signal).catch(() => {});
  const mounted = await mountRoot(
    <QueryClientProvider client={queryClient}><ReviewPage {...props} /></QueryClientProvider>);
  await settle();
  return { fetcher, props, ...mounted };
}

const cards = (root: ParentNode) => [...root.querySelectorAll('[data-review-key]')];
const keys = (root: ParentNode) => cards(root).map((card) => card.getAttribute('data-review-key'));
const boxOf = (root: ParentNode, at: number) =>
  cards(root)[at]?.querySelector<HTMLInputElement>('input[type="checkbox"]');
const buttonIn = (root: ParentNode, name: string) =>
  [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === name) ?? null;
const tabNamed = (root: ParentNode, name: string) =>
  [...root.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent?.startsWith(name)) ?? null;
const stateNamed = (root: ParentNode, name: string) =>
  [...root.querySelectorAll('[aria-label="Review state"] button')].find(button => button.textContent?.startsWith(name)) ?? null;
const statusText = (root: ParentNode) =>
  [...root.querySelectorAll('[role="status"]')].map((node) => node.textContent?.trim());

it('Expanding source evidence selects no candidate and submits no detail verdict', async () => {
  const entry = row(1);
  entry.candidates![0]!.catalog_evidence = { runtime: { display_value: '120 min' } };
  const { host, fetcher } = await open({ data: review({ sections: { metadata_fields: [entry] } }) });
  const card = cards(host)[0]!;
  const toggle = card.querySelector('button[aria-label="Expand javdb source evidence"]')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect([...card.querySelectorAll<HTMLInputElement>('input[type="radio"]')].every(input => !input.checked)).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => url === REVIEW_DECISION_URL)).toBe(false);
  expect(card.textContent).toContain('120 min');
});

it('The current value shows manual attribution independently, without mixing in maintenance implementation details from the old note', async () => {
  const entry = { ...row(1), current_value: 'User-organized title', current_owner: 'user:manual',
    evidence: 'The maintenance script name from the old note', videos: 1 };
  const { host } = await open({ data: review({ sections: { metadata_fields: [entry] } }) });
  const current = cards(host)[0]!.querySelector('[aria-label="Current info"]')!;
  expect(current.textContent).toContain('User-organized title');
  expect(current.textContent).toContain('Manual confirmation');
  expect(current.textContent).not.toContain('The maintenance script name from the old note');
});

it('The title marks only the differing text, keeping the common content and original candidate values', async () => {
  const before = 'Shared opening, old content; shared ending 😀';
  const after = 'Shared opening, new content; shared ending 😀';
  const entry = { ...row(1, ['nfo']), current_value: before,
    candidates: [candidate('nfo', after)] };
  const { host, fetcher } = await open({ data: review({ sections: { metadata_fields: [entry] } }) });
  const card = cards(host)[0]!;
  const current = card.querySelector('[aria-label="Current info"]')!;
  expect(current.textContent).toContain(before);
  expect(card.textContent).toContain(after);
  expect([...card.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['old', 'new']);
  await click(buttonIn(card, 'Approve'));
  const request = fetcher.mock.calls.find(([url]) => url === REVIEW_DECISION_URL)!;
  expect(JSON.parse(request[1]!.body as string)).toMatchObject({ candidate_key: entry.candidates[0]!.candidate_key });
});

it('Source evidence compares same-named fields only, never treating cast or title as differences', async () => {
  const entry = { ...row(1), field: 'performers', field_label: 'Cast', current_value: 'Performer A',
    candidates: ['javdb', 'nfo'].map((source, at) => ({ ...candidate(source, 'Performer A'),
      catalog_evidence: { title: { display_value: `Shared start, ${at ? 'new' : 'old'} content; shared end` } } })) };
  const { host } = await open({ data: review({ sections: { metadata_fields: [entry] } }) });
  const card = cards(host)[0]!;
  const trigger = card.querySelector('button[aria-label="Expand javdb source evidence"]')!;
  await click(trigger);
  const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!;
  expect(panel.textContent).toContain('Shared opening, old content; shared ending');
  expect([...panel.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['old']);
  expect(card.querySelector('[aria-label="Current info"]')!.querySelectorAll('mark')).toHaveLength(0);
});

it('Detail fields filter independently of source groups and repaginate after counting the whole queue', async () => {
  const entries = [...QUEUE, ...[201, 202].map(at => ({ ...row(at), field: 'performers', field_label: 'Cast' }))];
  const { host } = await open({ data: review({ sections: { metadata_fields: entries } }) });
  await click(buttonIn(host, 'Next page'));
  await choose(host.querySelector('button[aria-label="Filter detail fields"]'), 'Cast · 2');
  expect(keys(host)).toEqual(['row-201', 'row-202']);
  expect(buttonIn(host, 'Next page')).toBeNull();
  await choose(host.querySelector('button[aria-label="Filter grouping"]'), 'By source');
  expect(keys(host)).toEqual(['row-201', 'row-202']);
  await choose(host.querySelector('button[aria-label="Filter detail fields"]'), 'Title · 25');
  expect(cards(host)).toHaveLength(REVIEW_PAGE_SIZE);
  expect(keys(host)[0]).toBe('row-0');
});
/** Notes land in one of three roles by tone: `note`, `status` or `alert`. */
const noteText = (root: ParentNode) =>
  [...root.querySelectorAll('[role="note"], [role="status"], [role="alert"]')]
    .map((node) => node.textContent);
const queueOf = () => queryClient.getQueryData<ReviewData>(REVIEW_KEY)!;

/** Shift must be taken from the event that triggered the check: keydown precedes the change. */
const pickRange = (box: Element | null | undefined) => act(async () => {
  if (!box) throw new Error('The checkbox never painted');
  box.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, shiftKey: true }));
  (box as HTMLInputElement).click();
});

it('Grouping, filtering, and paging all compute over the whole queue, never just the on-screen batch', () => {
  expect(reviewGroupingOptions(QUEUE, true).map(([key]) => key)).toEqual(['candidates', 'source', 'field']);
  const groups = groupReviewRows(QUEUE, 'candidates');
  expect(groups.map((group) => [group.title, group.rows.length]))
    .toEqual([['Select a source', 22], ['Single source', 3]]);
  expect(filterReviewRows(QUEUE, 'candidates', 'single')).toHaveLength(3);
  expect(reviewWindow(QUEUE, 1).rows).toHaveLength(REVIEW_PAGE_SIZE);
  expect(reviewWindow(QUEUE, 2)).toMatchObject({ page: 2, pages: 2 });
  // An out-of-range page number snaps back to the last page instead of rendering an empty list.
  expect(reviewWindow(QUEUE, 9).page).toBe(2);
  // When one source gives two values in a row, there is no unique answer like 'always pick javdb'.
  expect(commonReviewSources(QUEUE.slice(0, 2))).toEqual(['javdb', 'nfo']);
  expect(commonReviewSources([row(0, ['nfo', 'nfo'])])).toEqual([]);
});

it('One page paints twenty cards, and paging swaps which twenty', async () => {
  const { host } = await open();
  expect(cards(host)).toHaveLength(REVIEW_PAGE_SIZE);
  await click(buttonIn(host, 'Next page'));
  expect(keys(host)).toEqual(['row-20', 'row-21', 'row-100', 'row-101', 'row-102']);
});

it('Filtering out a group returns to the first page', async () => {
  const { host } = await open();
  await choose(host.querySelector('button[aria-label="Filter current category"]'), 'Single source · 3');
  expect(keys(host)).toEqual(['row-100', 'row-101', 'row-102']);
  expect(buttonIn(host, 'Next page')).toBeNull();
});

it('Switching the per-page size returns to the first page and keeps the chosen candidates', async () => {
  const { host } = await open();
  await click(boxOf(host, 0));
  await click(buttonIn(host, 'Next page'));
  await choose(host.querySelector('[data-table-pagination] button[aria-haspopup="listbox"]'), '10 items per page');
  expect(cards(host)).toHaveLength(10);
  expect(keys(host)[0]).toBe('row-0');
  expect(statusText(host)).toContain('Selected 1 item');
  await choose(host.querySelector('[data-table-pagination] button[aria-haspopup="listbox"]'), '50 items per page');
  expect(cards(host)).toHaveLength(QUEUE.length);
  expect(buttonIn(host, 'Next page')).toBeNull();
});

it('Category goes into the URL; switching queues drops the current selection', async () => {
  const { host, props } = await open();
  expect(host.querySelector('[data-selection-dock]')).toBeNull();
  await click(boxOf(host, 0));
  expect(statusText(host)).toContain('Selected 1 item');
  expect(host.querySelector('[data-selection-dock]')).not.toBeNull();
  await click(tabNamed(host, 'Creator tags'));
  expect(props.route).toHaveBeenCalledWith({ category: 'creator_tags', queue: '' });
  expect(statusText(host)).not.toContain('Selected 1 item');
  expect(host.querySelector('[data-selection-dock]')).toBeNull();
  // The default tier is not written to the address bar.
  await click(tabNamed(host, 'Metadata fields'));
  expect(props.route).toHaveBeenLastCalledWith({ category: '', queue: '' });
});

it('Shift selects a range; the same batch persists across page changes', async () => {
  const { host } = await open();
  await click(boxOf(host, 1));
  await pickRange(boxOf(host, 4));
  expect(statusText(host)).toContain('Selected 4 items');
  await click(buttonIn(host, 'Next page'));
  // The items checked on the previous page are not on screen, but they are still held.
  expect(boxOf(host, 0)?.checked).toBe(false);
  await click(boxOf(host, 0));
  expect(statusText(host)).toContain('Selected 5 items');
});

it('Reviewed rows come out of the cache with counts synced, and one verdict never refetches the whole queue', async () => {
  const { host, fetcher, props } = await open();
  const reads = () => fetcher.mock.calls.filter(([url]) => String(url) === REVIEW_URL).length;
  expect(reads()).toBe(1);
  await click(buttonIn(cards(host)[0]!, 'Approve'));
  await settle();
  expect(props.toast).toHaveBeenCalledWith('Profile approved');
  expect(queueOf().sections.metadata_fields).toHaveLength(QUEUE.length - 1);
  expect(queueOf().counts.metadata_fields).toBe(QUEUE.length - 1);
  expect(keys(host)).not.toContain('row-0');
  expect(reads()).toBe(1);
});

it('When the server rejects this verdict the reason states, keeping the row on screen', async () => {
  const { host, props } = await open({ decisions: [{ ok: false, error: 'Field already has a value' }] });
  await click(buttonIn(cards(host)[0]!, 'Approve'));
  await settle();
  expect(cards(host)[0]?.textContent).toContain('Field already has a value');
  expect(props.toast).not.toHaveBeenCalled();
  expect(queueOf().sections.metadata_fields).toHaveLength(QUEUE.length);
});

it('Batch verdicts remove the successful ones; the ones that failed stay behind for retry', async () => {
  const { host, props } = await open({
    decisions: [{ ok: true }, { ok: false, error: 'Source expired' }, { ok: true }],
  });
  await choose(host.querySelector('button[aria-label="Filter current category"]'), 'Single source · 3');
  await click(buttonIn(host, 'Select all in the current category'));
  expect(statusText(host)).toContain('Selected 3 items');
  expect(actionOrder(buttonIn(host, 'Approve selected')!.parentElement).filter((name) => name.endsWith('Selected') || name === 'Clear selection'))
    .toEqual(['Ignore selected', 'Handle selected later', 'Approve selected', 'Clear selection']);
  await click(buttonIn(host, 'Approve selected'));
  await settle();
  expect(props.toast).toHaveBeenCalledWith('2 approved, 1 unfinished');
  expect(queueOf().sections.metadata_fields).toHaveLength(QUEUE.length - 2);
  expect(keys(host)).toEqual(['row-101']);
  expect(cards(host)[0]?.textContent).toContain('Source expired');
});

const sameAssetRows = (): ReviewRow[] => [0, 1, 2].map((at) => ({
  ...row(at, ['javdb']), asset_id: 6, asset_path: '/media/ABC-123.mp4',
  asset_mutation_revision: at === 2 ? 0 : 1,
}));
const receipt = (before: number, after: number): DecisionResult =>
  ({ ok: true, asset_revisions: { '6': { before, after } } });
const sentDecisions = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls
  .filter(([url]) => url === REVIEW_DECISION_URL)
  .map((call) => JSON.parse((call[1] as RequestInit).body as string));

it('Item-by-item pass uses the most recently approved version of the same asset; expired candidates keep their original version', async () => {
  const { host, fetcher } = await open({
    data: review({ sections: { metadata_fields: sameAssetRows() } }),
    decisions: [receipt(1, 4), receipt(4, 5)],
  });
  await click(buttonIn(cards(host)[0]!, 'Approve'));
  await settle();
  expect(queueOf().sections.metadata_fields?.map((item) => item.asset_mutation_revision)).toEqual([4, 0]);
  await click(buttonIn(cards(host)[0]!, 'Approve'));
  await settle();
  expect(sentDecisions(fetcher).map((body) => body.expected_revision)).toEqual([1, 4]);
});

it('Bulk approval reuses the server\'s per-row version receipts and keeps conflicts caused by other writes', async () => {
  const { host, fetcher } = await open({
    data: review({ sections: { metadata_fields: sameAssetRows() } }),
    decisions: [receipt(1, 4), receipt(4, 5), { ok: false, error: 'Asset profile changed' }],
  });
  await click(buttonIn(host, 'Select this page'));
  await click(buttonIn(host, 'Approve selected'));
  await settle();
  expect(sentDecisions(fetcher).map((body) => body.expected_revision)).toEqual([1, 4, 0]);
  expect(keys(host)).toEqual(['row-2']);
  expect(cards(host)[0]?.textContent).toContain('TitleABC-2No coverOpen original video Original videoOpen original videoCandidate sources · 1javdbTitle from javdb 2IgnoreHandle laterApproveThe operation did not finish; please retry. If it keeps failing, check the tray log.');
});

it('Bulk-approving multi-source candidates without a chosen source says so first instead of deciding for you', async () => {
  const { host } = await open();
  await click(buttonIn(host, 'Select this page'));
  await click(buttonIn(host, 'Approve selected'));
  await settle();
  expect(statusText(host)).toContain('Choose which source to adopt for the selected details first.');
  expect(queueOf().sections.metadata_fields).toHaveLength(QUEUE.length);
});

it('On a read-only database neither verdicts nor bulk actions are clickable', async () => {
  const { host, fetcher } = await open(
    { data: review({ mirror: { state: 'live' } }) },
    { readOnly: true, writerUrl: 'https://writer.example/review' });
  // 只读：队列与自动写入批次各读一次，一个写请求都不发。
  expect(fetcher.mock.calls.map(([url]) => String(url)).sort()).toEqual([REVIEW_URL, AUTO_LANDINGS_URL]);
  expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  expect(noteText(host).join()).toContain('Showing the writer\'s live review queue');
  expect(host.querySelector('a[href="https://writer.example/review"]')).toBeTruthy();
  // Checkboxes and bulk operations are absent entirely: with nothing writable, the toolbar is just a row of dead buttons.
  expect(boxOf(host, 0)).toBeFalsy();
  expect(buttonIn(host, 'Select this page')).toBeNull();
  for (const name of ['Approve', 'Ignore', 'Handle later']) {
    expect(buttonIn(cards(host)[0]!, name)).toHaveProperty('disabled', true);
  }
});

it('Opening the review page only reads the queue and no longer triggers automatic add-to-library writes', async () => {
  const { fetcher } = await open();
  // 读两样：复核队列与「自动写入的资料」的批次列表；都是 GET。
  expect(fetcher.mock.calls.map(([url]) => String(url)).sort()).toEqual([REVIEW_URL, AUTO_LANDINGS_URL]);
  expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});

it('Handle later switches to an independent queue; refreshing the address restores it and recovery keeps the original order', async () => {
  const { host, props } = await open();
  await click(buttonIn(cards(host)[1]!, 'Handle later'));
  await settle();
  expect(queueOf().counts.metadata_fields).toBe(24);
  expect(queueOf().queues.later.counts.metadata_fields).toBe(1);
  await click(stateNamed(host, 'Handle later'));
  expect(props.route).toHaveBeenLastCalledWith({ category: '', queue: 'later' });
  expect(keys(host)).toEqual(['row-1']);
  expect(buttonIn(cards(host)[0]!, 'Restore pending')).toBeTruthy();
  await click(buttonIn(cards(host)[0]!, 'Restore pending'));
  await settle();
  expect(queueOf().queues.later.counts.metadata_fields).toBe(0);
  expect(queueOf().sections.metadata_fields?.slice(0, 3).map(row => row.item_key))
    .toEqual(['row-0', 'row-1', 'row-2']);
  await click(stateNamed(host, 'Pending'));
  expect(keys(host).slice(0, 3)).toEqual(['row-0', 'row-1', 'row-2']);
});

it('Ignored opens via the link, offering only restore, and clears selection across states', async () => {
  const data = review({ queues: {
    later: { sections: {}, counts: {} },
    ignored: { sections: { metadata_fields: [{ ...row(7), decision: 'rejected' }] },
      counts: { metadata_fields: 1 } },
  } });
  const { host, props } = await open({ data }, { queue: 'ignored' });
  expect(keys(host)).toEqual(['row-7']);
  expect(buttonIn(cards(host)[0]!, 'Approve')).toBeNull();
  expect(buttonIn(cards(host)[0]!, 'Restore pending')).toBeTruthy();
  await click(boxOf(host, 0));
  expect(buttonIn(host, 'Restore selected')).toBeTruthy();
  expect(buttonIn(host, 'Approve selected')).toBeNull();
  await click(stateNamed(host, 'Pending'));
  expect(props.route).toHaveBeenLastCalledWith({ category: '', queue: '' });
  expect(host.querySelector('[data-selection-dock]')).toBeNull();
});

it('Empty categories still toggle state in the filter overlay; read-only keeps filters and hides select-all', async () => {
  const { host, props } = await open({ data: review({
    sections: { metadata_fields: [] }, counts: { metadata_fields: 0 },
  }) }, { readOnly: true });
  const filter = host.querySelector('[aria-label="Review filter"]');
  expect(filter?.querySelector('[aria-label="Review state"]')).toBeTruthy();
  expect(buttonIn(filter!, 'Select this page')).toBeNull();
  await click(stateNamed(filter!, 'Ignored'));
  expect(props.route).toHaveBeenLastCalledWith({ category: '', queue: 'ignored' });
  expect(host.textContent).toContain('This machine is browse-onlyThis device is browse-onlyReview categoriesMetadata fieldsCreator tagsCode directory questionableWestern identity backfillPerformer avatarsLabel logoFC2 comment marksFC2 cross-code similarityEnd credits / source evidencePending 0Handle later 0Ignored 0This category has no Ignored itemsDetails from Ignored stay here and can be restored to pending.');
  expect(filter?.querySelector('[aria-label="Review state"]')).toBeTruthy();
});

it('Bulk state moves adopt only successes; failed rows and other categories stay untouched', () => {
  queryClient.setQueryData(REVIEW_KEY, review());
  settleReviewRows('metadata_fields', ['row-1', 'row-2'], 'rejected');
  const data = queueOf();
  expect(data.counts.metadata_fields).toBe(23);
  expect(data.queues.ignored.sections.metadata_fields?.map(row => row.item_key))
    .toEqual(['row-1', 'row-2']);
  expect(data.sections.metadata_fields?.some(row => row.item_key === 'row-0')).toBe(true);
  expect(data.sections.creator_tags).toEqual([]);
  settleReviewRows('metadata_fields', ['row-1'], 'restore');
  expect(queueOf().queues.ignored.counts.metadata_fields).toBe(1);
  expect(queueOf().counts.metadata_fields).toBe(24);
});

it('Bulk handle-later leaves failed rows in pending while successful rows enter the dedicated queue', async () => {
  const rows = [row(0, ['nfo']), row(1, ['nfo']), row(2, ['nfo'])];
  const { host } = await open({
    data: review({ sections: { metadata_fields: rows }, counts: { metadata_fields: 3 } }),
    decisions: [{ ok: true }, { ok: false, error: 'Candidates changed' }, { ok: true }],
  });
  await click(buttonIn(host, 'Select this page'));
  await click(buttonIn(host, 'Handle selected later'));
  await settle();
  expect(keys(host)).toEqual(['row-1']);
  expect(cards(host)[0]?.textContent).toContain('TitleABC-1Candidate sources · 1nfoTitle from nfo 1IgnoreHandle laterApproveThe operation did not finish; please retry. If it keeps failing, check the tray log.');
  expect(queueOf().counts.metadata_fields).toBe(1);
  expect(queueOf().queues.later.counts.metadata_fields).toBe(2);
  await click(stateNamed(host, 'Handle later'));
  expect(keys(host)).toEqual(['row-0', 'row-2']);
  expect(host.querySelector('[data-selection-dock]')).toBeNull();
});

it('A failed queue read says it failed and offers retry, kept distinct from an empty queue; after a successful retry the queue renders', async () => {
  let fail = true;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (!String(input).startsWith(REVIEW_URL)) throw new Error(`No handler is scheduled for this endpoint: ${String(input)}`);
    return fail
      ? { ok: false, status: 500, json: async () => ({ message: 'The review queue query errored' }) }
      : ok(review());
  }));
  await prefetchReview(new AbortController().signal).catch(() => {});
  const { host } = await mountRoot(
    <QueryClientProvider client={queryClient}><ReviewPage {...shellProps()} /></QueryClientProvider>);
  await settle();
  expect(host.textContent).toContain('Reading the review queue failed');
  expect(host.textContent).not.toContain('No items pending review in this category');
  fail = false;
  await click(buttonIn(host, 'Retry now'));
  await settle();
  expect(host.textContent).not.toContain('Reading the review queue failed');
  expect(cards(host)).toHaveLength(REVIEW_PAGE_SIZE);
});

it('Cards with no adoptable candidates can still be ignored or handled later, with the approve key unavailable', async () => {
  const empty: ReviewRow = { ...row(7), candidates: [] };
  const { host } = await open({ data: review({ sections: { metadata_fields: [empty], creator_tags: [] } }) });
  const footer = cards(host)[0]!.querySelector('footer')!;
  expect([...footer.querySelectorAll('button')].map((button) => button.textContent?.trim()))
    .toEqual(['Ignore', 'Handle later', 'Never passes']);
});

const WRITES: AutoLandingWrite[] = [
  { item_key: 'DASS-468:release_date', rule: 'adr-0139-official-replaces-verified', label: '官方来源一致，覆盖原值',
    batch: 'adr-0139-official-replaces-verified@20261104T141053', at: 1793772653, field: 'Release date',
    value: '2024-09-10', previous: ['2024-09-06'], tags: [], assets: 1,
    asset_id: 7, code: 'DASS-468', name: '某部作品的标题', preview_url: '' },
  { item_key: 'ROYD-083:tags', rule: 'adr-0139-verified-tags-union', label: '补上来源多给的标签',
    batch: 'auto:metadata-tags@20261104T141053', at: 1793772653, field: 'Tags',
    value: '痴女、姐弟', previous: [], tags: ['Nympho', '姐弟'], assets: 1,
    asset_id: 8, code: 'ROYD-083', name: 'Another video', preview_url: '' },
];

it('Under metadata fields it lists auto-writes one by one: the work, what was written, what was there before; the read-only side can browse too', async () => {
  const { host } = await open({ autoLandings: WRITES }, { readOnly: true });
  const section = host.querySelector('[aria-labelledby="auto-landings-title"]')!;
  const text = section.textContent ?? '';
  for (const expected of ['The profiles auto-written', 'DASS-468', '某部作品的标题', 'Release date: 2024-09-10', 'Was "2024-09-06"',
    'ROYD-083', 'Tags: Nympho, 姐弟', 'Original tags kept']) expect(text).toContain(expected);
});

it('Without auto-writes that block does not appear', async () => {
  const { host } = await open();
  expect(host.querySelector('[aria-labelledby="auto-landings-title"]')).toBeNull();
});
