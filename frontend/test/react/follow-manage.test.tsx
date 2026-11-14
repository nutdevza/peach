/* Follows management page behavior: grouping by creator, sorting applied to the full set, pagination only switching the last step, selection spanning pages and views,
 * and when the "check updates" background run counts as done.
 *
 * Appearance (table separators, badge tiers) is a design decision asserted by `frontend/e2e/design-*.test.ts` reading
 * `getComputedStyle`; here we only check structure, text, and requests. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import { JOB_RUNNING_POLL_MS } from '../../src/react/background-job';
import { queryClient } from '../../src/react/query';
import {
  authorAvatar, authorGroups, authorInitial, authorName, checkReceipt, checkSummary, errorHeadline, feedIntervalText, FEEDS_CHECK_URL, FEED_SOURCE_URL,
  FEEDS_LOOKUP_URL, FEEDS_URL, FOLLOW_CHECK_URL, FOLLOW_MANAGE_KEY,
  FOLLOW_CREDENTIAL_URL, FOLLOW_CREDENTIALS_URL, FOLLOW_RESOLVE_URL, FOLLOW_SOURCE_URL,
  FOLLOW_STATUS_URL, FOLLOW_SUGGEST_URL, FOLLOW_URL, MARK_BATCH, markAllPending, pageWindow, prefetchFollowManage,
  sortLabel, SUGGEST_DEBOUNCE_MS, tableRows,
  type CheckJob, type CredentialData, type CredentialRow, type FeedLookup, type FeedsData, type FollowData,
  type FollowSource, type ResolveJob, type SuggestData,
} from '../../src/react/follow-manage/follow-manage';
import { FollowManagePage } from '../../src/react/follow-manage/follow-manage-page';
import { Credentials } from '../../src/react/follow-manage/credentials';

import { actionOrder, buttonNamed, choose, click, linkNamed, mountRoot, pending, settle, type } from './render';

// The client is a module-level singleton (all React roots share one); without clearing between test cases they feed each other data.
afterEach(() => queryClient.clear());

/* Query dispatches updates through the real `setTimeout(0)` it captured itself, which the fake clock cannot advance: after advancing the clock
   the assertions still see the previous frame's DOM. The case dispatches immediately instead. */
notifyManager.setScheduler((notify) => notify());

/* Timeouts for full-page test cases: the table does not memoize by row, and every click repaints the page's 20 rows with checkboxes and switches, 0.5-0.8s alone;
 * with sixteen shards of the full suite running in parallel, the machine slows six to seven times and crosses the default 5s. 15s still catches genuinely stuck cases. */
const FULL_PAGE = { timeout: 15_000 };

const source = (over: Partial<FollowSource> & { id: number }): FollowSource => ({
  provider: 'kemono',
  provider_label: 'Kemono',
  ref: `fanbox/${over.id}`,
  label: `Source ${over.id}`,
  url: `https://example.com/${over.id}`,
  enabled: true,
  last_status: 'ok',
  last_checked_at: '2026-09-01T00:00:00Z',
  created_at: '2026-08-01T00:00:00Z',
  author_key: `name:author${over.id}`,
  author_name: `Author ${over.id}`,
  ...over,
} as FollowSource);

/** Three creators, one of whom has one source on each of two sites. */
const CAST: FollowSource[] = [
  source({ id: 1, author_key: 'name:Alpha', author_name: 'Alpha', label: 'Alpha · Kemono' }),
  source({
    id: 2, author_key: 'name:Alpha', author_name: 'Alpha', label: 'Alpha · Pawchive',
    provider: 'pawchive', provider_label: 'Pawchive', last_checked_at: '2026-09-03T00:00:00Z',
  }),
  source({
    id: 3, author_key: 'name:Beta', author_name: 'Beta', label: 'Beta · Kemono',
    last_checked_at: '2026-09-02T00:00:00Z', last_status: 'error',
  }),
  source({ id: 4, author_key: 'name:Gamma', author_name: 'Gamma', label: 'Gamma · Kemono' }),
];

const follow = (over: Partial<FollowData> = {}): FollowData => ({
  sources: CAST,
  counts: { new: 0, seen: 0, saved: 0, ignored: 0 },
  author_aliases: [],
  suggestions: [],
  ...over,
} as FollowData);

const credentials = (): CredentialData => ({ root: 'C:\\peach\\creds', providers: [] } as CredentialData);

const IDLE: CheckJob = { status: 'idle' } as CheckJob;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const refuse = (error: string) => ({ ok: false, status: 400, json: async () => ({ error }) });

interface Plan {
  data?: FollowData;
  creds?: CredentialData;
  /** Snapshots for the check task: given an array it answers one at a time in order (repeating the last one afterwards); given a function it asks freshly each time.
   *  A function returning an unfulfilled Promise means the answer is still in flight. */
  check?: CheckJob[] | (() => CheckJob | Promise<CheckJob>);
  /** A fresh snapshot of the lookup task, asked for each time: the test pushes it to the desired step before clicking 'Find'. */
  resolve?: () => ResolveJob | Promise<ResolveJob>;
  resolveStart?: () => ReturnType<typeof ok> | ReturnType<typeof refuse>;
  /** Typing suggestions. Returning a never-settling Promise freezes the moment at 'looking up suggestions'. */
  suggest?: (q: string) => SuggestData | Promise<SuggestData>;
  /** Registers one source. A `refuse(...)` return means the server rejected it. */
  add?: (body: { url: string; label: string }) => unknown;
  /** The subscription feed list. */
  feeds?: FeedsData | Promise<FeedsData>;
  /** Feed enable, removal, and registration by name. A `refuse(...)` return means this attempt was bounced by the server. */
  feedWrite?: (body: { action: string; id?: number; name?: string; ids?: string[] }) => unknown;
  /** The result of searching JavDB performer cards by performer name. A `refuse(...)` return means this run was bounced by the server. */
  lookup?: (q: string) => FeedLookup | ReturnType<typeof refuse>;
}

/** A fake fetch routed by endpoint. Each write operation returns a minimal success body. */
function serve(plan: Plan = {}) {
  const checks = typeof plan.check === 'function' ? plan.check : [...(plan.check ?? [IDLE])];
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url === FEEDS_URL) return ok(await (plan.feeds ?? { sources: [], unread: 0 }));
    if (url === FEED_SOURCE_URL && plan.feedWrite) return plan.feedWrite(body);
    if (url === FEED_SOURCE_URL || url === FEEDS_CHECK_URL) return ok({ ok: true });
    if (url.startsWith(`${FEEDS_LOOKUP_URL}?`)) {
      const q = new URL(url, 'http://peach.test').searchParams.get('q') || '';
      const found = plan.lookup ? plan.lookup(q) : { q, url: '', candidates: [], suggested: [], known: null };
      return 'candidates' in found ? ok(found) : found;
    }
    if (url === FOLLOW_CREDENTIALS_URL) return ok(plan.creds ?? credentials());
    if (url === FOLLOW_CREDENTIAL_URL) return ok({});
    if (url === FOLLOW_CHECK_URL) {
      if (init?.method) return ok({ status: 'running', checked: 0, total: 1 });
      if (typeof checks === 'function') return ok(await checks());
      return ok(checks.length > 1 ? checks.shift()! : checks[0]!);
    }
    if (url === FOLLOW_SOURCE_URL) {
      if (body?.action === 'add' && plan.add) return plan.add(body);
      return ok({ ok: true, source: 9 });
    }
    if (url === FOLLOW_RESOLVE_URL) {
      if (init?.method) return plan.resolveStart ? plan.resolveStart() : ok({ status: 'running' });
      return ok(plan.resolve ? await plan.resolve() : IDLE);
    }
    if (url.startsWith(`${FOLLOW_SUGGEST_URL}?`)) {
      const q = new URL(url, 'http://peach.test').searchParams.get('q') || '';
      return ok(await (plan.suggest ? plan.suggest(q) : { q, groups: [] }));
    }
    if (url.startsWith('/api/tag-management')) return ok({ items: [], total:0, categories:{}, duplicate_groups: [] });
    if (url.startsWith(FOLLOW_URL)) return ok(plan.data ?? follow());
    throw new Error(`No handler is scheduled for this endpoint: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('It checks only enabled failed sources and hides the entry along with the list', async () => {
  const data = follow({ sources: [source({ id: 1 }), source({ id: 2, last_status: 'error' }),
    source({ id: 3, last_status: 'unauthorized' }), source({ id: 4, enabled: false, last_status: 'error' })] });
  const { host, fetcher } = await open({ data });
  expect(actionOrder(host.querySelector('[data-follow-toolbar-actions]')).slice(0, 2)).toEqual(['Check failed items', 'Check all']);
  await click(buttonNamed('Check failed items', host)!);
  const request = fetcher.mock.calls.find(([url, init]) => url === FOLLOW_CHECK_URL && init?.method);
  expect(JSON.parse(String(request?.[1]?.body)).sources).toEqual([2, 3]);
  await act(async () => { queryClient.setQueryData(FOLLOW_MANAGE_KEY, { ...data, sources: [source({ id: 1 }),
    source({ id: 4, enabled: false, last_status: 'error' })] }) });
  expect(buttonNamed('Check failed items', host)).toBeNull();
});

type Props = Parameters<typeof FollowManagePage>[0];

const shellProps = (over: Partial<Props> = {}): Props => ({
  tab: 'list', page: 1, sort: '', dir: '',
  route: vi.fn(),
  pageSize: 20, layout: 'default',
  savePreference: vi.fn(),
  toast: vi.fn(),
  openFollow: vi.fn(),
  readOnly: false, readOnlyMessage: '', writerUrl: '',
  ...over,
});

/** Runs the real first-screen path: prefetch lands in the cache first, then mount. */
async function open(plan: Plan = {}, over: Partial<Props> = {}) {
  const fetcher = serve(plan);
  const props = shellProps(over);
  await prefetchFollowManage(new AbortController().signal).catch(() => {});
  const mounted = await mountRoot(
    <QueryClientProvider client={queryClient}>{over.tab === 'source'
      ? <Credentials data={plan.creds || credentials()} readOnly={props.readOnly} toast={props.toast} />
      : <FollowManagePage {...props} />}</QueryClientProvider>);
  await settle();
  return { fetcher, props, ...mounted };
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) });

it('While the subscription response is incomplete it shows the follow readings and list first; subscription readings wait independently', async () => {
  const delayed = pending<FeedsData>();
  const { host } = await open({ feeds: delayed.answer });
  expect(host.querySelector('[data-measured-reading="creators"] [aria-busy="true"]')).toBeNull();
  expect(host.querySelector('[data-measured-reading="subscriptions"] [aria-busy="true"]')).not.toBeNull();
  expect(host.querySelector('[data-follow-toolbar-actions]')).not.toBeNull();
  await delayed.release({ sources: [], unread: 9 });
  await settle();
  expect(host.querySelector('[data-measured-reading="releases"] [aria-busy="true"]')).toBeNull();
  expect(host.querySelector('[data-measured-reading="releases"] [data-follow-reading]')?.textContent).toBe('9 items');
});

const cards = (root: ParentNode) => [...root.querySelectorAll('section[aria-label^="Follow sources for "]')];

const checkboxNamed = (root: ParentNode, name: string) =>
  root.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${name}"]`);

const buttonLabelled = (root: ParentNode, name: string) =>
  root.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

const sentBody = (fetcher: ReturnType<typeof serve>, url: string) =>
  fetcher.mock.calls.filter(([input, init]) => String(input) === url && !!(init as RequestInit | undefined)?.method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

// ── Pure functions: grouping, sorting, and paging ──────────────────────────────────────────────

it('One creator\'s sources across several sites group together', () => {
  const groups = authorGroups(CAST, 'checked', 'desc');
  expect(groups.map((group) => group.length)).toEqual([2, 1, 1]);
  expect(groups[0]!.map((row) => row.id).sort()).toEqual([1, 2]);
});

it('Sorting changes the whole set\'s order, never one page\'s internal order', () => {
  const many = Array.from({ length: 25 }, (_, at) => source({
    id: at + 1, author_key: `name:person${at}`, author_name: `person${at}`,
    last_checked_at: `2026-09-${String(at + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  const newest = authorGroups(many, 'checked', 'desc');
  const oldest = authorGroups(many, 'checked', 'asc');
  // After reversing direction, the first item of page one should be the last item of the original last page; sorting only the current page cannot achieve that.
  expect(newest[0]![0]!.id).toBe(25);
  expect(oldest[0]![0]!.id).toBe(1);
  const win = pageWindow(newest.length, 10, 3);
  expect(win).toMatchObject({ page: 3, pages: 3, total: 25, start: 20, end: 25 });
});

it('Added time uses the most recent registration of the creator; name defaults to ascending and is not flipped by direction', () => {
  const rows = [
    source({ id: 1, author_key: 'name:b', author_name: 'b', created_at: '2026-08-01T00:00:00Z' }),
    source({ id: 2, author_key: 'name:a', author_name: 'a', created_at: '2026-08-03T00:00:00Z' }),
    source({ id: 3, author_key: 'name:b', author_name: 'b', created_at: '2026-08-05T00:00:00Z' }),
  ];
  const authors = (groups: FollowSource[][]) => groups.map((group) => group[0]!.author_name);
  expect(authors(authorGroups(rows, 'added', 'desc'))).toEqual(['b', 'a']);
  expect(authors(authorGroups(rows, 'added', 'asc'))).toEqual(['a', 'b']);
  expect(authors(authorGroups(rows, 'name', 'asc'))).toEqual(['a', 'b']);
});

it('Arrow keys read out what pressing would produce', () => {
  expect(sortLabel('checked', 'desc')).toBe('Sort by Check time Farthest first');
  expect(sortLabel('name', 'asc')).toBe('Sort by Creator name Descending');
});

it('Out-of-range pages land on the last page instead of painting an empty one', () => {
  expect(pageWindow(4, 10, 7)).toMatchObject({ page: 1, start: 0, end: 4 });
  expect(pageWindow(25, 10, 99)).toMatchObject({ page: 3, start: 20, end: 25 });
});

it('Table view flattens creator groups to one source per row', () => {
  const groups = authorGroups(CAST, 'source', 'asc');
  const rows = tableRows(groups, 'source', 'asc');
  expect(rows).toHaveLength(CAST.length);
  // Sorting by source name flattens the groups into one row per source in label order, no longer grouped by creator.
  expect(rows.map((row) => row.source.label))
    .toEqual(['Alpha · Kemono', 'Alpha · Pawchive', 'Beta · Kemono', 'Gamma · Kemono']);
  expect(rows[0]!.author).toBe('Alpha');
  // Every row carries its own creator, so the 'Creator' column in the table has a value on every row.
  expect(rows.map((row) => row.author)).toEqual(['Alpha', 'Alpha', 'Beta', 'Gamma']);
});

it('The completion message reads the numbers out loud', () => {
  const job = {
    status: 'done',
    results: [
      { ok: true, added: 2 }, { ok: true, added: 0, updated: 0 },
      { ok: true, exhausted: true }, { ok: false, error: 'Cannot connect' },
    ],
  } as CheckJob;
  const said = checkSummary(job);
  expect(said).toContain('2 new items');
  expect(said).toContain('2 sources had no updates');
  expect(said).toContain('1 with nothing more to fetch');
  expect(said).toContain('1 failed');
});

it('Check receipts keep added, updated, and failed, with detailed statistics carried by the full result', () => {
  const job = { status: 'done', results: [
    { ok: true, added: 3, updated: 2933, skipped: 301, skipped_compilations: 20,
      history_skipped: 862, probed: 241 },
    { ok: false },
  ] } as CheckJob;
  expect(checkReceipt(job)).toBe('Checked 2 sources: 3 new items · Updated 2933 entries · 1 failed');
  expect(checkSummary(job)).toContain('Skipped 281 without resources');
  expect(checkSummary(job)).toContain('Re-checked 241 entries');
  expect(checkReceipt({ results: [{ ok: true }] })).toBe('Checked 1 source: No updates');
  expect(checkReceipt({ results: [{ ok: false }] })).toBe('Checked 1 source: 1 failed');
});

// ── Page: view, selection, and the address bar ──────────────────────────────────────────────

it('Default view shows one card per creator', async () => {
  const { host } = await open();
  expect(cards(host).map((card) => card.getAttribute('aria-label')))
    .toEqual(['Follow sources for Alpha', 'Follow sources for Beta', 'Follow sources for Gamma']);
});

it('Each source on the card has two icon keys, and the checked one marks itself', async () => {
  const { host } = await open();
  const card = cards(host)[0]!;
  expect(buttonLabelled(card, 'Check all sources of Alpha')).not.toBeNull();
  const rows = () => [...card.querySelectorAll('[data-source-divider] > *')];
  expect(rows()).toHaveLength(2);
  for (const row of rows()) {
    const icons = [...row.querySelectorAll('button')].filter((button) => !button.textContent?.trim());
    expect(icons.map((button) => button.getAttribute('aria-label'))).toHaveLength(2);
  }

  await click(checkboxNamed(host, 'Select Alpha · Kemono'));
  expect(rows().filter((row) => row.hasAttribute('data-selected'))).toHaveLength(1);
});

it('Checks span pages and views, and bulk sends the entire id set', async () => {
  const many = Array.from({ length: 12 }, (_, at) => source({
    id: at + 1, author_key: `name:person${at}`, author_name: `person${at}`,
  }));
  const { host, fetcher } = await open({ data: follow({ sources: many }) }, { pageSize: 10 });

  await click(checkboxNamed(host, 'Select all sources on this page'));
  expect(host.textContent).toContain('Follow creator12 peopleEnable the source12 / 12Check failed0 sourcesUnwatched updates0 itemsJAV subscriptions0 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsJAV feed0 feeds - 0 unreadFetch nowShow columnsReset column widthsSortDefault order Default orderNameKindSourceStateFrequencyLast fetchLast additionsNo follow sources yetAdd by performer name under Add follow, or click Subscribe to new releases on a person page.Add subscriptionUnwatched 0 · Enabled 0 / 0Follows list12 sourcesSortCheck time Check timeDate addedCreator nameSource countSource nameSiteStateSelected 10 sourcesCheck selectedEnabledPausedDeleteClear selectionSelect this pagePperson0Sources: KemonoClear select-allCollapseSource 1KemonoNormal2026-09-01 07:00Pperson1Sources: KemonoClear select-allCollapseSource 2KemonoNormal2026-09-01 07:00Pperson2Sources: KemonoClear select-allCollapseSource 3KemonoNormal2026-09-01 07:00Pperson3Sources: KemonoClear select-allCollapseSource 4KemonoNormal2026-09-01 07:00Pperson4Sources: KemonoClear select-allCollapseSource 5KemonoNormal2026-09-01 07:00Pperson5Sources: KemonoClear select-allCollapseSource 6KemonoNormal2026-09-01 07:00Pperson6Sources: KemonoClear select-allCollapseSource 7KemonoNormal2026-09-01 07:00Pperson7Sources: KemonoClear select-allCollapseSource 8KemonoNormal2026-09-01 07:00Pperson8Sources: KemonoClear select-allCollapseSource 9KemonoNormal2026-09-01 07:00Pperson9Sources: KemonoClear select-allCollapseSource 10KemonoNormal2026-09-01 07:001–10 / 12  creators10 people per page 10 people per page20 people per page50 people per page100 people per pagePrevious page12Next pageSource and subscription settings');
  expect(host.querySelector('[data-selection-dock]')).not.toBeNull();

  // Flip to page two and check one: the ten from page one are still in the selection set.
  await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Next page'));
  expect(host.textContent).toContain('Follow creator12 peopleEnable the source12 / 12Check failed0 sourcesUnwatched updates0 itemsJAV subscriptions0 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsJAV feed0 feeds - 0 unreadFetch nowShow columnsReset column widthsSortDefault order Default orderNameKindSourceStateFrequencyLast fetchLast additionsNo follow sources yetAdd by performer name under Add follow, or click Subscribe to new releases on a person page.Add subscriptionUnwatched 0 · Enabled 0 / 0Follows list12 sourcesSortCheck time Check timeDate addedCreator nameSource countSource nameSiteStateSelected 10 sourcesCheck selectedEnabledPausedDeleteClear selectionSelect this pagePperson10Sources: KemonoSelect allCollapseSource 11KemonoNormal2026-09-01 07:00Pperson11Sources: KemonoSelect allCollapseSource 12KemonoNormal2026-09-01 07:0011–12 / 12  creators10 people per page 10 people per page20 people per page50 people per page100 people per pagePrevious page12Next pageSource and subscription settings');
  await click(checkboxNamed(host, 'Select Source 11'));
  expect(host.textContent).toContain('Selected 11 sources');

  await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Paused'));
  await settle();
  const writes = sentBody(fetcher, FOLLOW_SOURCE_URL);
  expect(writes).toHaveLength(11);
  expect(writes.map((body) => body.id).sort((a, b) => a - b))
    .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(writes.every((body) => body.action === 'enabled' && body.enabled === false)).toBe(true);
});

it('Switching to table view keeps the same checks', async () => {
  const { host, props } = await open();
  await click(checkboxNamed(host, 'Select Alpha · Kemono'));
  expect(host.textContent).toContain('Selected 1 source');

  await click(buttonLabelled(host, 'Table view'));
  expect(props.savePreference).toHaveBeenCalledWith({ layout: 'table' });
  // The layout is a per-browser preference and is not written to the address bar.
  for (const [params] of (props.route as ReturnType<typeof vi.fn>).mock.calls) {
    expect(params).not.toHaveProperty('layout');
  }
});

it('Table view spreads each source into a row, still checking by source id', async () => {
  const { host, fetcher } = await open({}, { layout: 'table' });

  expect([...host.querySelectorAll('[role="columnheader"]:not([data-table-space])')].map((cell) => cell.textContent?.trim()))
    .toEqual(['', 'Creators', 'Source', 'Site', 'State', 'Last check', 'Actions']);
  // In card view this is three cards (A has two sources); flattened into the table it is four rows.
  expect(host.querySelectorAll('[role="row"][data-key]')).toHaveLength(4);

  await click(checkboxNamed(host, 'Select Alpha · Pawchive'));
  expect(host.textContent).toContain('Selected 1 source');
  expect(checkboxNamed(host, 'Select Alpha · Pawchive')?.closest('[role="row"]')
    ?.hasAttribute('data-follow-selected')).toBe(true);

  await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Paused'));
  await settle();
  expect(sentBody(fetcher, FOLLOW_SOURCE_URL)).toEqual([{ action: 'enabled', id: 2, enabled: false }]);
});

it('Follow table paging and sorting keep the source selection, and bulk actions cover the cross-page set', FULL_PAGE, async () => {
  const many = Array.from({ length: 12 }, (_, at) => source({
    id: at + 1, label: `Source ${String(at + 1).padStart(2, '0')}`,
  }));
  const { host, fetcher } = await open({ data: follow({ sources: many }) }, {
    layout: 'table', pageSize: 10, sort: 'source', dir: 'asc',
  });
  const rowIds = () => [...host.querySelectorAll('[role="row"][data-key]')]
    .map((row) => Number(row.getAttribute('data-key')));
  expect(rowIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await click(checkboxNamed(host, 'Select Source 01'));
  await click(buttonNamed('Next page', host));
  expect(rowIds()).toEqual([11, 12]);
  await click(checkboxNamed(host, 'Select Source 12'));

  await click(buttonLabelled(host, sortLabel('source', 'asc')));
  expect(rowIds()).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  expect(checkboxNamed(host, 'Select Source 12')?.checked).toBe(true);
  await click(checkboxNamed(host, 'Select Source 12'));
  expect(host.textContent).toContain('Selected 1 source');
  await click(buttonNamed('Next page', host));
  expect(rowIds()).toEqual([2, 1]);
  expect(checkboxNamed(host, 'Select Source 01')?.checked).toBe(true);
  await click(checkboxNamed(host, 'Select Source 02'));

  await click(buttonLabelled(host, 'Default view'));
  expect(host.textContent).toContain('Selected 2 sources');
  await click(buttonNamed('Paused', host));
  await settle();
  expect(sentBody(fetcher, FOLLOW_SOURCE_URL).map((body) => body.id).sort((a, b) => a - b))
    .toEqual([1, 2]);
});

it('Table view rows end with an enable switch; toggling it writes only that row and leaves selection and toasts alone', async () => {
  const { host, fetcher } = await open({}, { layout: 'table' });
  await click(checkboxNamed(host, 'Select Alpha · Pawchive'));
  const toggle = () => host.querySelector<HTMLInputElement>('[aria-label="Enable Alpha · Pawchive"]');
  expect(toggle()?.checked).toBe(true);
  await click(toggle());
  await settle();
  expect(sentBody(fetcher, FOLLOW_SOURCE_URL)).toEqual([{ action: 'enabled', id: 2, enabled: false }]);
  expect(toggle()?.checked).toBe(false);
  expect(host.textContent).toContain('Selected 1 source');
  expect(host.textContent).not.toContain('Paused 1 follow source');
});

it('Card view rows end with an enable toggle; flipping it writes only this one entry', async () => {
  const { host, fetcher } = await open({}, { layout: 'default' });
  const toggle = () => host.querySelector<HTMLInputElement>('[aria-label="Enable Alpha · Pawchive"]');
  expect(toggle()?.checked).toBe(true);
  await click(toggle());
  await settle();
  expect(sentBody(fetcher, FOLLOW_SOURCE_URL)).toEqual([{ action: 'enabled', id: 2, enabled: false }]);
  expect(toggle()?.checked).toBe(false);
});

it('Clicking the blank area of a row selects it, clicking again deselects; clicking a link inside the row does not count', async () => {
  const { host } = await open({}, { layout: 'table' });
  const row = () => checkboxNamed(host, 'Select Alpha · Pawchive')!.closest('[role="row"]')!;
  const blank = () => [...row().querySelectorAll('[role="rowheader"],[role="gridcell"]')]
    .find((cell) => cell.textContent?.trim() === 'Pawchive')!;

  await click(blank());
  expect(row().hasAttribute('data-follow-selected')).toBe(true);
  expect(host.textContent).toContain('Selected 1 source');

  await click(blank());
  expect(row().hasAttribute('data-follow-selected')).toBe(false);

  const link = row().querySelector('a')!;
  link.addEventListener('click', (event) => event.preventDefault());
  await click(link);
  expect(row().hasAttribute('data-follow-selected')).toBe(false);
});

it('Clicking blank space in a card\'s source row selects the whole row, and clicking the checkbox still belongs to the checkbox', async () => {
  const { host } = await open();
  const row = () => checkboxNamed(host, 'Select Alpha · Pawchive')!.closest('[data-source-divider] > div')!;

  await click(row().querySelector('[data-follow-source-site]'));
  expect(row().hasAttribute('data-selected')).toBe(true);
  expect(host.textContent).toContain('Selected 1 source');

  await click(checkboxNamed(host, 'Select Alpha · Pawchive'));
  expect(row().hasAttribute('data-selected')).toBe(false);
});

it('The source header\'s select-all can be clicked again to cancel the page\'s selection', async () => {
  const { host } = await open();
  await click(buttonLabelled(host, 'Table view'));
  await click(checkboxNamed(host, 'Select all sources on this page'));
  expect(CAST.every(item => checkboxNamed(host, `Select ${item.label}`)?.checked)).toBe(true);
  expect(checkboxNamed(host, 'Select all sources on this page')?.checked).toBe(true);
  await click(checkboxNamed(host, 'Select all sources on this page'));
  expect(CAST.every(item => !checkboxNamed(host, `Select ${item.label}`)?.checked)).toBe(true);
});

it('The table\'s sortable columns show and update their sort triangles', async () => {
  const { host, props } = await open({}, { layout: 'table' });
  const author = [...host.querySelectorAll<HTMLElement>('[role="columnheader"]')]
    .find((cell) => cell.textContent?.includes('Creators'));
  expect(author?.querySelector('svg')).not.toBeNull();

  await click(author);
  expect(props.route).toHaveBeenCalledWith({ tab: 'list', page: 1, sort: 'name', dir: '' });
});

it('Sort and page write into the address bar together, with defaults omitted', async () => {
  const { host, props } = await open();
  const route = props.route as ReturnType<typeof vi.fn>;

  await choose(host.querySelector('button[aria-label="Follows list sort"]'), 'Creator name');
  expect(route).toHaveBeenCalledWith({ tab: 'list', page: 1, sort: 'name', dir: '' });

  // When switching back to the default tier, `sort` is written as an empty string: only the data layer knows which item is the default.
  await choose(host.querySelector('button[aria-label="Follows list sort"]'), 'Check time');
  expect(route).toHaveBeenLastCalledWith({ tab: 'list', page: 1, sort: '', dir: '' });
});

// ── Update check: when this pass counts ──────────────────────────────────────────

it('While a check runs it polls every two seconds, stopping when it ends', async () => {
  vi.useFakeTimers();
  const running = { status: 'running', checked: 1, total: 4 } as CheckJob;
  const done = { status: 'done', results: [{ ok: true, added: 3 }] } as CheckJob;
  // The server's state advances per test case, not per query count; how many times it is asked is exactly what is under test.
  let state: CheckJob = IDLE;
  const { host, fetcher, props } = await open({ check: () => state });

  const polls = () => fetcher.mock.calls.filter(
    ([input, init]) => String(input) === FOLLOW_CHECK_URL && !(init as RequestInit | undefined)?.method).length;

  // happy-dom cannot measure the tool row's width, so it paints the narrowest tier: labeled buttons keep only their icons and must be found by aria-label.
  state = running;
  await click(buttonLabelled(host, 'Check all'));
  await settle();
  const started = polls();

  await tick(JOB_RUNNING_POLL_MS);
  await settle();
  expect(polls()).toBeGreaterThan(started);
  // The progress bar is SVG; progress goes on the `aria-label`, not in a text node.
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-label'))
    .toBe('Check for updates: completed 1/4 sources');

  state = done;
  await tick(JOB_RUNNING_POLL_MS);
  await settle();
  expect(props.toast).toHaveBeenCalledWith(expect.stringContaining('3 new items'));
  expect(host.textContent).toContain('Check results');
  expect(host.textContent).toContain('Checked 1 source: 3 new items');

  // After a terminal state there are no more polls: polling is off.
  const settledAt = polls();
  await tick(JOB_RUNNING_POLL_MS * 3);
  expect(polls()).toBe(settledAt);
});

it('A stale terminal state read on the first screen never poses as this run\'s result', async () => {
  const stale = {
    status: 'done', results: [{ ok: false, error: 'The previous round\'s failure' }],
  } as CheckJob;
  const { host, props } = await open({ check: [stale] });
  await settle();
  // No check was ever run, so this copy does not count: no receipt is reported and no failure details are laid out.
  expect(props.toast).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('The previous round\'s failure');
});

it('Check failures name the site and person per item, moving to the next requirement when one is missing', async () => {
  let state: CheckJob = IDLE;
  const { host, fetcher } = await open({ check: () => state });
  state = { status: 'running', checked: 0, total: 3 } as CheckJob;
  await click(buttonLabelled(host, 'Check all'));
  await settle();
  // "Check all" names no source; the server fetches every enabled one.
  expect(sentBody(fetcher, FOLLOW_CHECK_URL)).toEqual([{ background: true }]);
  state = {
    status: 'done',
    results: [
      { ok: false, provider_label: 'Kemono', author: 'Beta', label: 'Beta · Kemono', error: 'Cannot connect' },
      { ok: false, provider: 'pawchive', label: 'Alpha · Pawchive' },
      { ok: false, provider_label: 'F95zone', ref: 'threads/42', error: 'Login required' },
      { ok: true, added: 1, evidence_error: 'The disk is full' },
    ],
  } as CheckJob;
  await act(async () => { await queryClient.refetchQueries({ queryKey: ['follow-manage', 'check'] }) });
  await settle();
  expect(host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates0 itemsJAV subscriptions0 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsJAV feed0 feeds - 0 unreadFetch nowShow columnsReset column widthsSortDefault order Default orderNameKindSourceStateFrequencyLast fetchLast additionsNo follow sources yetAdd by performer name under Add follow, or click Subscribe to new releases on a person page.Add subscriptionUnwatched 0 · Enabled 0 / 0Follows list4 sourcesCheck failed itemsSortCheck time Check timeDate addedCreator nameSource countSource nameSiteStateCheck resultsChecked 4 sources: 1 new item · 3 failed3 source checks failedThese sources got no updates this round.Kemono Beta: Cannot connectpawchive Alpha · Pawchive: No reason givenF95zone threads/42: Login requiredEntry saved, but the raw source response was not saved this time: The disk is fullSelect this pageAAlphaSources: Kemono, PawchiveSelect allCollapseAlpha · KemonoKemonoNormal2026-09-01 07:00Alpha · PawchivePawchiveNormal2026-09-03 07:00BBetaSources: Kemono1 failedSelect allCollapseBeta · KemonoKemonoCheck failed2026-09-02 07:00GGammaSources: KemonoSelect allCollapseGamma · KemonoKemonoNormal2026-09-01 07:001–3 / 3  creators20 people per page 10 people per page20 people per page50 people per page100 people per pageSource and subscription settings');
  expect([...host.querySelectorAll('[aria-live] li')].map((row) => row.textContent)).toEqual([
    'Kemono Beta: Cannot connect', 'pawchive Alpha · Pawchive: No reason given', 'F95zone threads/42: Login required',
  ]);
  // Even the successful one may have left no raw response behind: the candidate still goes into the library, but this has to be said.
  expect(host.textContent).toContain('Entry saved, but the raw source response was not saved this time: The disk is full');
});

it('The one on the creator card checks only sources still open for this creator', async () => {
  const sources = CAST.map((row) => (row.id === 2 ? { ...row, enabled: false } : row));
  const { host, fetcher } = await open({ data: follow({ sources }) });
  await click(buttonLabelled(host, 'Check all sources of Alpha'));
  await settle();
  expect(sentBody(fetcher, FOLLOW_CHECK_URL)).toEqual([{ sources: [1], background: true }]);
});

// ── Creator identity: name, initials, and avatar ──────────────────────────────────────────

it('The group name uses the official source\'s spelling; a Collection suffix in the archive title is not part of the name', () => {
  const mirror = source({ id: 1, author_name: '', label: 'Lazy Procrastinator Collection' });
  const official = source({ id: 2, author_name: 'lazyprocrastinator', official_avatar_url: '/a.png' });
  expect(authorName([mirror, official])).toBe('lazyprocrastinator');
  expect(authorName([mirror])).toBe('Lazy Procrastinator');
});

it('The initial takes the first Latin letter or digit in the creator name, falling back to the first character only when there is none', () => {
  expect(authorInitial('lazy')).toBe('L');
  expect(authorInitial('Hatsune miku')).toBe('H');
  expect(authorInitial('Hatsune')).toBe('H');
});

it('Avatars try the official one first, fall back to the mirror, and finally paint an initial', async () => {
  const official = source({ id: 1, official_avatar_url: '/official.png' });
  const mirror = source({ id: 2, avatar_url: '/mirror.png' });
  expect(authorAvatar([mirror, official])).toEqual({ src: '/official.png', fallback: '/mirror.png' });
  expect(authorAvatar([mirror])).toEqual({ src: '/mirror.png', fallback: '' });

  const kou = { author_key: 'name:kou', author_name: 'kou' };
  const { host } = await open({ data: follow({ sources: [
    source({ ...official, ...kou }), source({ ...mirror, ...kou }),
  ] }) });
  const avatar = () => cards(host)[0]!.querySelector('[data-follow-author-header]')!.firstElementChild!;
  expect(avatar().getAttribute('src')).toBe('/official.png');
  await act(async () => { avatar().dispatchEvent(new Event('error')) });
  expect(avatar().getAttribute('src')).toBe('/mirror.png');
  await act(async () => { avatar().dispatchEvent(new Event('error')) });
  expect(avatar().tagName).toBe('SPAN');
  expect(avatar().textContent).toBe('K');
});

it('State ascending lists what needs handling first: failed, paused, unchecked, then normal', () => {
  const rows = [
    source({ id: 1, label: 'Normal', last_status: 'ok' }),
    source({ id: 2, label: 'Unchecked', last_status: '' }),
    source({ id: 3, label: 'Paused', enabled: false, last_status: 'ok' }),
    source({ id: 4, label: 'Failed', last_status: 'unauthorized' }),
  ];
  expect(authorGroups(rows, 'status', 'asc').map((group) => group[0]!.label))
    .toEqual(['Failed', 'Paused', 'Unchecked', 'Normal']);
});

// ── Follows list: write-back, counts, and empty states ───────────────────────────────────────────────

const listReads = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls.filter(([input, init]) =>
  String(input).startsWith(`${FOLLOW_URL}?`) && !(init as RequestInit | undefined)?.method).length;

it('Pausing changes only that entry\'s status; it does not refetch the whole list', async () => {
  const { host, fetcher } = await open();
  const before = listReads(fetcher);
  await click(checkboxNamed(host, 'Select Alpha · Kemono'));
  await click(buttonNamed('Paused', host));
  await settle();
  expect(listReads(fetcher)).toBe(before);
  const card = cards(host)[0]!;
  expect([...card.querySelectorAll('[data-source-divider] > *')].map((row) => row.textContent))
    .toEqual([expect.stringContaining('Paused'), expect.stringContaining('Normal')]);
});

it('Card title rows carry only the site mark, leaving the name to screen readers', async () => {
  const { host } = await open();
  const head = cards(host)[0]!.querySelector('[data-follow-author-header]')!;
  expect(head.textContent).toContain('Sources: Kemono, Pawchive');
  expect(head.querySelector('[title="Kemono, Pawchive"]')).not.toBeNull();
});

it('With unwatched items left, the card bottom shows a count and three action buttons; with none, the whole row never appears', async () => {
  const counts = { new: 3, seen: 1, saved: 0, ignored: 2 };
  const busy = await open({ data: follow({ counts }) });
  expect(busy.host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates3 itemsJAV subscriptions0 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsJAV feed0 feeds - 0 unreadFetch nowShow columnsReset column widthsSortDefault order Default orderNameKindSourceStateFrequencyLast fetchLast additionsNo follow sources yetAdd by performer name under Add follow, or click Subscribe to new releases on a person page.Add subscriptionUnwatched 0 · Enabled 0 / 0Follows list4 sources - 3 unreadCheck failed itemsSortCheck time Check timeDate addedCreator nameSource countSource nameSiteStateSelect this pageAAlphaSources: Kemono, PawchiveSelect allCollapseAlpha · KemonoKemonoNormal2026-09-01 07:00Alpha · PawchivePawchiveNormal2026-09-03 07:00BBetaSources: Kemono1 failedSelect allCollapseBeta · KemonoKemonoCheck failed2026-09-02 07:00GGammaSources: KemonoSelect allCollapseGamma · KemonoKemonoNormal2026-09-01 07:001–3 / 3  creators20 people per page 10 people per page20 people per page50 people per page100 people per pageUnwatched 3 · Watched 1 · Saved 0 · Ignored 2See the updatesMark everything watchedIgnore allSource and subscription settings');
  expect(busy.host.textContent).toContain('Unwatched 3 · Watched 1 · Saved 0 · Ignored 2');
  expect(buttonNamed('Mark everything watched', busy.host)).not.toBeNull();
  expect(buttonNamed('Ignore all', busy.host)).not.toBeNull();
  await click(buttonNamed('See the updates', busy.host));
  expect(busy.props.openFollow).toHaveBeenCalledTimes(1);
  await busy.unmount();
  queryClient.clear();

  const quiet = await open();
  expect(quiet.host.textContent).not.toContain('Unwatched 0 · Watched');
  expect(buttonNamed('Ignore all', quiet.host)).toBeNull();
});

it('Readouts, list headers, and card footer counts all use thousands separators; from six digits the readout steps down a size, and from seven another size', async () => {
  const counts = { new: 1284000, seen: 22000, saved: 0, ignored: 0 };
  const { host } = await open({ data: follow({ counts }) });
  const readings = [...host.querySelectorAll('[data-follow-reading]')];
  const big = readings.find((node) => node.textContent === '1,284,000 items')!;
  expect(big.className).toContain('text-headline-medium');
  expect(big.querySelector('small')?.className).toContain('whitespace-nowrap');
  expect(readings.find((node) => node.textContent?.startsWith('0'))?.className).toContain('text-title-1-medium');
  expect(host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates1,284,000 itemsJAV subscriptions0 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsJAV feed0 feeds - 0 unreadFetch nowShow columnsReset column widthsSortDefault order Default orderNameKindSourceStateFrequencyLast fetchLast additionsNo follow sources yetAdd by performer name under Add follow, or click Subscribe to new releases on a person page.Add subscriptionUnwatched 0 · Enabled 0 / 0Follows list4 sources - 1,284,000 unreadCheck failed itemsSortCheck time Check timeDate addedCreator nameSource countSource nameSiteStateSelect this pageAAlphaSources: Kemono, PawchiveSelect allCollapseAlpha · KemonoKemonoNormal2026-09-01 07:00Alpha · PawchivePawchiveNormal2026-09-03 07:00BBetaSources: Kemono1 failedSelect allCollapseBeta · KemonoKemonoCheck failed2026-09-02 07:00GGammaSources: KemonoSelect allCollapseGamma · KemonoKemonoNormal2026-09-01 07:001–3 / 3  creators20 people per page 10 people per page20 people per page50 people per page100 people per pageUnwatched 1,284,000 · Watched 22,000 · Saved 0 · Ignored 0See the updatesMark everything watchedIgnore allSource and subscription settings');
  expect(host.textContent).toContain('Unwatched 1,284,000 · Watched 22,000');
});

it('Errors show one line: the traceback yields the exception on the last line, and "View details" expands the full text in place', async () => {
  const trace = 'Traceback (most recent call last):\n  File "kemono.py", line 412, in fetch_page\n'
    + 'peach.follow_providers.ProviderError: HTTP 403';
  const { host } = await open({ data: follow({ sources: [source({ id: 9, last_status: 'error', last_error: trace })] }) });
  const line = host.querySelector('[data-error-line]')!;
  expect(line.textContent).toBe('peach.follow_providers.ProviderError: HTTP 403');
  const toggle = host.querySelector('[data-error-line-toggle]')!;
  expect(toggle.textContent).toBe('View details');
  await click(toggle);
  expect(host.querySelector('[data-error-line]')?.textContent).toBe(trace);
  expect(host.querySelector('[data-error-line-toggle]')?.textContent).toBe('Collapse details');
});

it('The error line: tracebacks take the exception line, everything else takes the first non-empty line', () => {
  expect(errorHeadline('Traceback (most recent call last):\n  File "a.py"\nValueError: broken\n')).toBe('ValueError: broken');
  expect(errorHeadline('\n  HTTP 429 Too Many Requests\nRetry-After: 60')).toBe('HTTP 429 Too Many Requests');
  expect(errorHeadline('')).toBe('');
});

it('Follow source frequency: minutes under an hour, hours under two days, days beyond that', () => {
  expect(feedIntervalText(30)).toBe('Every 30 min');
  expect(feedIntervalText(720)).toBe('Every 12 hr');
  expect(feedIntervalText(2879)).toBe('Every 48 hr');
  expect(feedIntervalText(2880)).toBe('Every 2 days');
  expect(feedIntervalText(525600)).toBe('Every 365 days');
});

it('With no sources at all it explains what will display here', async () => {
  const { host } = await open({ data: follow({ sources: [] }) });
  expect(host.textContent).toContain('No follow sources yet');
  expect(host.textContent).toContain('Follow sources and their check states show here.');
});

it('The follows list empty state switches straight to the add tab and keeps the page host', async () => {
  const { host, props } = await open({ data: follow({ sources: [] }) });
  const empty = [...host.querySelectorAll('[data-empty-state]')].find(node => node.textContent?.includes('No follow sources yet'))!;
  const overview = host.querySelector('[aria-label="Follow overview"]');
  const button = buttonNamed('Add subscription', empty);
  expect(button).not.toBeNull();
  // This is the screen's primary action: the toolbar and 'Check all' render only when there is at least one source.
  expect(buttonNamed('Check all', host)).toBeNull();
  await click(button);
  await settle();
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Add follow');
  expect(host.querySelector('[aria-label="Follow overview"]')).toBe(overview);
  expect(props.route).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'add' }));
});

// ── Tabs and read-only ──────────────────────────────────────────────────────────────

it('Columns are ordered by the sequence of work; counts without credentials hang on the last column', async () => {
  const { host } = await open({ creds: { root: 'C:\\creds', providers: [credential({ provider: 'fanbox' })] } });
  expect([...host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent))
    .toEqual(['Follows list', 'Add follow', 'Manage tags']);
  expect(linkNamed('Sources and subscription settings (1)', host)?.getAttribute('href')).toBe(undefined);
});

const FEEDS: FeedsData = {
  unread: 3,
  sources: [
    { id: 4, kind: 'performer', kind_label: 'JAV subscriptions', name: 'A\'s new releases', url: 'https://feeds.test/a',
      entity_id: 41, entity_name: 'Alpha', has_image: true, enabled: true, interval_minutes: 720,
      last_fetched_at: null, last_error: null, last_new_count: 0, seen: 2 },
    { id: 5, kind: 'performer', kind_label: 'JAV subscriptions', name: 'B\'s new releases', url: 'https://feeds.test/b',
      entity_id: 42, entity_name: 'Beta', has_image: false, enabled: false, interval_minutes: 30,
      last_fetched_at: null, last_error: 'Site 503', last_new_count: 0, seen: 0 },
  ],
};

/** The text readable in a cell: the initial-letter round frame before the name is marked aria-hidden and does not count. */
const shown = (cell: Element) => {
  const copy = cell.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden]').forEach((node) => node.remove());
  return copy.textContent?.trim();
};

const feedReads = (fetcher: ReturnType<typeof serve>) =>
  fetcher.mock.calls.filter(([input, init]) => String(input) === FEEDS_URL && !(init as RequestInit | undefined)?.method).length;

type Confirmation = Parameters<typeof legacyUi.confirmModal>[0];

/** The confirmation popover records what was written; with `accept` true it clicks the primary button for the user. `outcomes` holds each write's result:
 *  null on success, or the reason sentence the popover places under the body on failure. */
function stubConfirm(accept: boolean) {
  const asked: Confirmation[] = [];
  const outcomes: Promise<string | null>[] = [];
  vi.spyOn(legacyUi, 'confirmModal').mockImplementation((async (options: Confirmation) => {
    asked.push(options);
    if (!accept) return { confirmed: false };
    const outcome = Promise.resolve(options.onConfirm?.())
      .then(() => null, (cause: Error) => cause.message);
    outcomes.push(outcome);
    return { confirmed: (await outcome) === null };
  }) as typeof legacyUi.confirmModal);
  return { asked, outcomes };
}

it('The follow list first screen carries the feed list, and toggling, removing, and fetch-now all hit the feed endpoints', async () => {
  stubConfirm(true);
  const { host, fetcher } = await open({ feeds: FEEDS }, { tab: 'list' });
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Follows list');
  expect([...host.querySelectorAll('[role="columnheader"]:not([data-table-space])')].map((cell) => cell.textContent?.trim()))
    .toEqual(['', 'Name', 'Kind', 'Source', 'State', 'Frequency', 'Last fetch', 'Last additions', 'Actions']);
  const first = checkboxNamed(host, 'Select A\'s new releases')!.closest('[role="row"]')!;
  expect([...first.querySelectorAll('[role="rowheader"]:not([data-table-space]),[role="gridcell"]:not([data-table-space])')].map(shown))
    .toEqual(['', 'A\'s new releases', 'JAV subscriptions', 'feeds.test', 'Unchecked', 'Every 12 hr', 'Never fetched', '0 items', '']);
  expect(first.querySelector('a')?.getAttribute('href')).toBe('https://feeds.test/a');
  // The round frame before the name is assembled by `card-art`'s fallback chain: the identity reference carries whether an image exists, and the image is stacked on only once present.
  expect(first.querySelector('[role="rowheader"] img')?.getAttribute('src'))
    .toBe('/entity-image?kind=performer&id=41&thumb=1');
  const second = checkboxNamed(host, 'Select B\'s new releases')!.closest('[role="row"]')!;
  expect(second.querySelector('[role="rowheader"] img')).toBeNull();
  expect(second.querySelector('[role="rowheader"] [aria-hidden]')?.textContent).toBe('B');
  expect(host.textContent).toContain('1 feed failed to fetch');
  expect(host.textContent).toContain('B\'s new releases: Site 503');
  expect(host.textContent).toContain('Unwatched 3 · Enabled 1 / 2');
  expect(host.textContent).not.toContain('Reading follow sources');
  expect(feedReads(fetcher)).toBe(1);
  await click(host.querySelector('[aria-label="Enable B\'s new releases"]'));
  await settle();
  await click(buttonLabelled(host, 'Fetch B\'s new releases'));
  await settle();
  await click(buttonLabelled(host, 'Remove A\'s new releases'));
  await settle();
  await click(buttonNamed('Fetch now', host));
  await settle();
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([
    { action: 'enabled', id: 5, enabled: true }, { action: 'remove', id: 4 },
  ]);
  // The row-end fetch button targets only this one and pulls paused ones too; "Fetch now" is what covers all enabled sources.
  expect(sentBody(fetcher, FEEDS_CHECK_URL)).toEqual([{ sources: [5] }, { all: true }]);
  expect(feedReads(fetcher)).toBeGreaterThan(1);
});

it('The same person\'s two pages get one row each, with the old stage name page showing the on-site name beside it; subscriptions count by person at the top', async () => {
  const page = (id: number, pageName: string, name = '森日向子', entity = 8112) => ({
    id, kind: 'javdb-actor', kind_label: 'JAV subscriptions', name, page_name: pageName,
    url: `https://javdb.com/actors/${id}`, entity_id: entity, entity_name: name, has_image: true,
    enabled: true, interval_minutes: 360, last_fetched_at: null, last_error: null, last_new_count: 0, seen: 0,
  });
  const { host } = await open({ feeds: { unread: 81, sources: [
    page(3, '白石アイリ'), page(4, '森日向子'), page(2, '涼森玲夢, 涼森れむ', '凉森玲梦', 7746),
  ] } }, { tab: 'list' });
  const names = [...host.querySelectorAll('[role="rowheader"]')].map(shown);
  // A person with a single row gets no page name: the site title bar string would be pure noise.
  expect(names).toEqual(['森日向子白石アイリ', '森日向子', '凉森玲梦']);
  const readings = [...host.querySelector('[aria-label="Follow overview"]')!.children].map((card) => card.textContent);
  expect(readings.slice(-2)).toEqual(['JAV subscriptions2 people', 'Unwatched new releases81 items']);
});

it('Clicking a blank spot on a feed table row selects it; with a selection the batch actions float up at the bottom, and pausing writes to the feed API one by one', async () => {
  const { host, fetcher } = await open({ feeds: FEEDS }, { tab: 'list' });
  const row = () => checkboxNamed(host, 'Select B\'s new releases')!.closest('[role="row"]')!;
  const blank = () => [...row().querySelectorAll('[role="rowheader"],[role="gridcell"]')]
    .find((cell) => cell.textContent?.trim() === 'Every 30 min')!;
  expect(host.querySelector('[data-selection-dock]')).toBeNull();

  await click(blank());
  expect(row().hasAttribute('data-follow-selected')).toBe(true);
  expect(host.textContent).toContain('Selected 1 follow source');
  await click(blank());
  expect(row().hasAttribute('data-follow-selected')).toBe(false);
  expect(host.querySelector('[data-selection-dock]')).toBeNull();

  await click(checkboxNamed(host, 'Select A\'s new releases'));
  await click(checkboxNamed(host, 'Select B\'s new releases'));
  expect(host.textContent).toContain('Selected 2 follow sources');
  await click([...host.querySelectorAll('[data-selection-dock] button')].find((b) => b.textContent === 'Paused'));
  await settle();
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([
    { action: 'enabled', id: 4, enabled: false }, { action: 'enabled', id: 5, enabled: false },
  ]);
  expect(host.querySelector('[data-selection-dock]')).toBeNull();
});

it('Batch remove shows a confirmation stating the count first; after confirming, items are removed one by one and a toast reports the count', async () => {
  const { asked, outcomes } = stubConfirm(true);
  const { host, fetcher, props } = await open({ feeds: FEEDS }, { tab: 'list' });
  await click(checkboxNamed(host, 'Select A\'s new releases'));
  await click(checkboxNamed(host, 'Select B\'s new releases'));
  await click([...host.querySelectorAll('[data-selection-dock] button')].find((b) => b.textContent === 'Remove'));
  expect(asked[0]).toMatchObject({ title: 'Remove 2 follow sources', confirmLabel: 'Remove selected feeds', danger: true });
  expect(await outcomes[0]).toBeNull();
  await settle();
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([{ action: 'remove', id: 4 }, { action: 'remove', id: 5 }]);
  expect(props.toast).toHaveBeenCalledWith('Removed 2 follow sources');
});

it('Remove first raises a confirmation: title and primary button share one verb, the body names this source, and cancel sends nothing', async () => {
  const { asked } = stubConfirm(false);
  const { host, fetcher, props } = await open({ feeds: FEEDS }, { tab: 'list' });
  await click(buttonLabelled(host, 'Remove A\'s new releases'));
  await settle();
  expect(asked).toHaveLength(1);
  const [modal] = asked;
  expect(modal).toMatchObject({ title: 'Remove feed', confirmLabel: 'Remove feed', danger: true });
  expect(modal!.cancelLabel ?? 'Cancel').toBe('Cancel');
  expect(modal!.body).toBe('Will remove the feed "A\'s new releases"; its new releases will no longer be pulled, and new releases already fetched are kept.');
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([]);
  expect(props.toast).not.toHaveBeenCalled();
});

it('Writes only after the removal is confirmed; the toast and primary button share one verb and name this source, and the list refetches afterward', async () => {
  const { outcomes } = stubConfirm(true);
  const { host, fetcher, props } = await open({ feeds: FEEDS }, { tab: 'list' });
  const before = feedReads(fetcher);
  await click(buttonLabelled(host, 'Remove A\'s new releases'));
  expect(await outcomes[0]).toBeNull();
  await settle();
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([{ action: 'remove', id: 4 }]);
  expect(props.toast).toHaveBeenCalledWith('Removed the follow source "A\'s new releases"');
  expect(feedReads(fetcher)).toBeGreaterThan(before);
});

it('When removal is blocked by the server, the reason goes to the popover: no toast and no list refetch', async () => {
  const { outcomes } = stubConfirm(true);
  const { host, fetcher, props } = await open(
    { feeds: FEEDS, feedWrite: () => refuse('JavDB returned the login page') }, { tab: 'list' });
  const before = feedReads(fetcher);
  await click(buttonLabelled(host, 'Remove A\'s new releases'));
  expect(await outcomes[0]).toBe('JavDB returned the login page');
  await settle();
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([{ action: 'remove', id: 4 }]);
  expect(props.toast).not.toHaveBeenCalled();
  expect(feedReads(fetcher)).toBe(before);
});

it('In read-only subscription management, search, toggles, removal, and pull are all disabled', async () => {
  const { host, unmount } = await open({ feeds: FEEDS }, { tab: 'list', readOnly: true });
  expect(host.querySelector('input[type="url"]')).toBeNull();
  expect(buttonNamed('Fetch now', host)?.disabled).toBe(true);
  expect(buttonLabelled(host, 'Remove A\'s new releases')?.disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Enable A\'s new releases"]')?.disabled).toBe(true);
  await unmount();
  queryClient.clear();
  const add = await open({}, { tab: 'add', readOnly: true });
  expect(nameField(add.host).disabled).toBe(true);
  expect(buttonNamed('Find', actorPanel(add.host))?.disabled).toBe(true);
});

/** A feed that exactly fills two pages: 20 entries on page one, a single entry left on page two. */
const twoPagesOfFeeds = (unread = 0) => ({ unread, sources: Array.from({ length: 21 }, (_, i) => ({
  ...FEEDS.sources[0], id: i + 1, name: `Source ${i + 1}`, entity_name: `Source ${i + 1}`,
})) });

it('JAV subscription paging keeps cross-page selection', FULL_PAGE, async () => {
  const { host } = await open({ feeds: twoPagesOfFeeds() }, { tab: 'list' });
  const rows = () => host.querySelectorAll('[role="row"][data-key]');
  expect(rows()).toHaveLength(20);
  expect(host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates0 itemsJAV subscriptions1 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsJAV feed21 feeds - 0 unreadFetch nowShow columnsReset column widthsSortDefault order Default orderNameKindSourceStateFrequencyLast fetchLast additionsNameKindSourceStateFrequencyLast fetchLast additionsActionsSSource 1JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 2JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 3JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 4JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 5JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 6JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 7JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 8JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 9JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 10JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 11JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 12JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 13JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 14JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 15JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 16JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 17JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 18JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 19JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 20JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 items1–20 / 21 follow sources20 items per page 10 items per page20 items per page50 items per page100 items per pagePrevious page12Next pageUnwatched 0 · Enabled 21 / 21Follows list4 sourcesCheck failed itemsSortCheck time Check timeDate addedCreator nameSource countSource nameSiteStateSelect this pageAAlphaSources: Kemono, PawchiveSelect allCollapseAlpha · KemonoKemonoNormal2026-09-01 07:00Alpha · PawchivePawchiveNormal2026-09-03 07:00BBetaSources: Kemono1 failedSelect allCollapseBeta · KemonoKemonoCheck failed2026-09-02 07:00GGammaSources: KemonoSelect allCollapseGamma · KemonoKemonoNormal2026-09-01 07:001–3 / 3  creators20 people per page 10 people per page20 people per page50 people per page100 people per pageSource and subscription settings');
  await click(checkboxNamed(host, 'Select Source 1'));
  await click(buttonNamed('Next page', host));
  expect(rows()).toHaveLength(1);
  expect(host.textContent).toContain('21–21 / 21 follow sources');
  expect(host.textContent).toContain('Selected 1 follow source');
  await click(checkboxNamed(host, 'Select Source 21'));
  await click(buttonNamed('Previous page', host));
  expect(checkboxNamed(host, 'Select Source 1')?.checked).toBe(true);
  expect(host.textContent).toContain('Selected 2 follow sources');
});

it('JAV subscription frequency sorts the whole set by minutes and returns to the home page', FULL_PAGE, async () => {
  const feeds = twoPagesOfFeeds();
  feeds.sources = feeds.sources.map((source, index) => ({ ...source, interval_minutes: (21 - index) * 15 }));
  const { host } = await open({ feeds }, { tab: 'list' });
  await click(checkboxNamed(host, 'Select Source 1'));
  await click(buttonNamed('Next page', host));
  await click(host.querySelector('th[data-key="interval"]'));
  const table = host.querySelector('[aria-label="JAV subscription list"]')!;
  const rows = table.querySelectorAll('tbody tr');
  expect(rows).toHaveLength(20);
  expect(rows[0]!.textContent).toContain('Source 21');
  expect(rows[19]!.textContent).toContain('Source 2');
  expect(host.textContent).toContain('1–20 / 21 follow sources');
  expect(host.textContent).toContain('Selected 1 follow source');
});

it('JAV subscription paging capacity returns to the home count, with the status bar counting the whole set', FULL_PAGE, async () => {
  const { host } = await open({ feeds: twoPagesOfFeeds(81) }, { tab: 'list' });
  await click(buttonNamed('Next page', host));
  await choose(host.querySelector('button[aria-label="Rows per page"]'), '10 items per page');
  expect(host.querySelectorAll('[role="row"][data-key]')).toHaveLength(10);
  expect(host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates0 itemsJAV subscriptions1 peopleUnwatched new releases81 itemsFollows listAdd followManage tagsJAV feed21 feeds - 81 unreadFetch nowShow columnsReset column widthsSortDefault order Default orderNameKindSourceStateFrequencyLast fetchLast additionsNameKindSourceStateFrequencyLast fetchLast additionsActionsSSource 1JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 2JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 3JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 4JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 5JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 6JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 7JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 8JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 9JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 10JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 items1–10 / 21 follow sources10 items per page 10 items per page20 items per page50 items per page100 items per pagePrevious page123Next pageUnwatched 81 · Enabled 21 / 21Follows list4 sourcesCheck failed itemsSortCheck time Check timeDate addedCreator nameSource countSource nameSiteStateSelect this pageAAlphaSources: Kemono, PawchiveSelect allCollapseAlpha · KemonoKemonoNormal2026-09-01 07:00Alpha · PawchivePawchiveNormal2026-09-03 07:00BBetaSources: Kemono1 failedSelect allCollapseBeta · KemonoKemonoCheck failed2026-09-02 07:00GGammaSources: KemonoSelect allCollapseGamma · KemonoKemonoNormal2026-09-01 07:001–3 / 3  creators20 people per page 10 people per page20 people per page50 people per page100 people per pageSource and subscription settings');
  expect(host.querySelector('footer')?.textContent).toContain('Unwatched 81 · Enabled 21 / 21');
});

it('Removing the last source on the final page shows a valid page', FULL_PAGE, async () => {
  stubConfirm(true);
  const feeds = twoPagesOfFeeds();
  const plan: Plan = { feeds, feedWrite: ({ id }) => {
    plan.feeds = { ...feeds, sources: feeds.sources.filter(source => source.id !== id) };
    return ok({ ok: true });
  } };
  const { host } = await open(plan, { tab: 'list' });
  await click(buttonNamed('Next page', host));
  await click(buttonLabelled(host, 'Remove Source 21'));
  await settle();
  expect(host.querySelectorAll('[role="row"][data-key]')).toHaveLength(20);
  expect(host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates0 itemsJAV subscriptions1 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsJAV feed20 feeds - 0 unreadFetch nowShow columnsReset column widthsSortDefault order Default orderNameKindSourceStateFrequencyLast fetchLast additionsNameKindSourceStateFrequencyLast fetchLast additionsActionsSSource 1JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 2JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 3JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 4JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 5JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 6JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 7JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 8JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 9JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 10JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 11JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 12JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 13JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 14JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 15JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 16JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 17JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 18JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 19JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 itemsSSource 20JAV subscriptionsfeeds.testUncheckedEvery 12 hrNever fetched0 items1–20 / 20 follow sources20 items per page 10 items per page20 items per page50 items per page100 items per pageUnwatched 0 · Enabled 20 / 20Follows list4 sourcesCheck failed itemsSortCheck time Check timeDate addedCreator nameSource countSource nameSiteStateSelect this pageAAlphaSources: Kemono, PawchiveSelect allCollapseAlpha · KemonoKemonoNormal2026-09-01 07:00Alpha · PawchivePawchiveNormal2026-09-03 07:00BBetaSources: Kemono1 failedSelect allCollapseBeta · KemonoKemonoCheck failed2026-09-02 07:00GGammaSources: KemonoSelect allCollapseGamma · KemonoKemonoNormal2026-09-01 07:001–3 / 3  creators20 people per page 10 people per page20 people per page50 people per page100 people per pageSource and subscription settings');
});

it('The subscriptions list card includes title, empty state, and status bar', async () => {
  const { host, props } = await open({}, { tab: 'list' });
  const panel = host.querySelector('section[aria-label="JAV subscription list"]')!;
  expect([...panel.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['JAV feed', 'No follow sources yet']);
  expect(panel.textContent).toContain('Add by performer name under Add follow, or click Subscribe to new releases on a person page.');
  expect(panel.querySelector('footer')?.textContent).toContain('Unwatched 0 · Enabled 0 / 0');
  expect(buttonNamed('Fetch now', host)).not.toBeNull();
  await click(buttonNamed('Add subscription', panel));
  expect(props.route).toHaveBeenCalledWith(expect.objectContaining({ tab: 'add' }));
  expect(nameField(host)).not.toBeNull();
});

// ── Add a JAV subscription: search performer cards by name, tick, and register ─────────────────────────────

/** Performer name input. BoardUI's `Input` puts the accessible name on the outer field, with the input inside it. */
function nameField(root: ParentNode): HTMLInputElement {
  const named = root.querySelector('[aria-label="Performer name"]');
  const field = named instanceof HTMLInputElement ? named : named?.querySelector('input');
  if (!field) throw new Error('The performer name input never painted');
  return field;
}

const actorPanel = (root: ParentNode) => root.querySelector('section[aria-label="Add JAV subscription"]')!;

const card = (id: string, names: string[], record = '', held_by: { id: number; name: string } | null = null) =>
  ({ id, names, record, url: `https://javdb.com/actors/${id}`, held_by, matched: [] });

const LOOKUP: FeedLookup = {
  q: '瀬戸環奈', url: 'https://javdb.com/search?f=actor&q=x', known: null, suggested: ['Kn01', 'Kn02'],
  candidates: [card('Kn01', ['瀬戸環奈', '瀨戶環奈']), card('Kn02', ['瀬戸環奈'], 'Uncensored'), card('Zz99', ['別人さん'])],
};

it('The follows list shows existing JAV subscriptions and reuses the feed switches', async () => {
  const { host, fetcher } = await open({ feeds: FEEDS });
  expect(host.querySelector('section[aria-label="JAV subscription list"]')).not.toBeNull();
  expect(host.textContent).toContain('A\'s new releases');
  expect(host.textContent).not.toContain('Add JAV subscription');
  await click(host.querySelector('[aria-label="Enable A\'s new releases"]'));
  await settle();
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([{ action: 'enabled', id: 4, enabled: false }]);
});

it('The follows list\'s creators and JAV subscriptions keep only the current table\'s selection', async () => {
  const { host } = await open({ feeds: FEEDS });
  const creator = () => checkboxNamed(host, 'Select Alpha · Kemono')!;
  const feed = () => checkboxNamed(host, 'Select A\'s new releases')!;
  await click(creator());
  expect(creator().checked).toBe(true);
  await click(feed());
  expect(creator().checked).toBe(false);
  expect(feed().checked).toBe(true);
  expect(host.querySelectorAll('[data-selection-dock]')).toHaveLength(1);
  await click(creator());
  expect(feed().checked).toBe(false);
  expect(creator().checked).toBe(true);
  expect(host.querySelectorAll('[data-selection-dock]')).toHaveLength(1);
});

it('Add follows can look up performers and subscribe, landing on the follows list with the new subscription on success', async () => {
  const lookup = vi.fn(() => LOOKUP);
  const plan: Plan = { feeds: { sources: [], unread: 0 }, lookup };
  plan.feedWrite = () => {
    plan.feeds = FEEDS;
    return ok({ ok: true, entity_id: 9, entity_name: '瀬戸環奈', created: false, sources: [4] });
  };
  const { host, fetcher, props } = await open(plan, { tab: 'add' });
  await type(nameField(host), '瀬戸環奈');
  await act(async () => {
    nameField(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  await settle();
  expect(lookup).toHaveBeenCalledWith('瀬戸環奈');
  await click(buttonNamed('Add subscriptions (2)', host));
  await settle();
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([
    { action: 'follow-name', name: '瀬戸環奈', ids: ['Kn01', 'Kn02'] },
  ]);
  expect(props.route).toHaveBeenCalledWith(expect.objectContaining({ tab: 'list' }));
  expect(host.querySelector('section[aria-label="JAV subscription list"]')).not.toBeNull();
});

const boxNamed = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('label')].find((label) => label.textContent?.includes(text))
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]');

it('Find by name lists every cast card and pre-checks the two belonging to the same person; it says clearly that a new one will be created, and after adding it sends the id, names it in a toast, and refetches the list', async () => {
  const lookup = vi.fn(() => LOOKUP);
  const feedWrite = vi.fn(() => ok({ ok: true, entity_id: 9, entity_name: '瀬戸環奈', created: true, sources: [7, 8] }));
  const { host, fetcher, props } = await open({ feeds: FEEDS, lookup, feedWrite }, { tab: 'add' });
  const before = feedReads(fetcher);
  expect(buttonNamed('Find', actorPanel(host))?.disabled).toBe(true);
  await type(nameField(host), ' 瀬戸環奈 ');
  await click(buttonNamed('Find', actorPanel(host)));
  await settle();
  expect(lookup).toHaveBeenCalledWith('瀬戸環奈');
  expect(boxNamed(host, '瀬戸環奈、瀨戶環奈')?.checked).toBe(true);
  expect(boxNamed(host, 'Uncensored')?.checked).toBe(true);
  expect(boxNamed(host, '別人さん')?.checked).toBe(false);
  expect(host.textContent).toContain('"瀬戸環奈" is not in the database yet; a new person will be created');
  expect([...host.querySelectorAll('a')].find((a) => a.textContent?.includes('Kn01'))?.getAttribute('href'))
    .toBe('https://javdb.com/actors/Kn01');

  await click(boxNamed(host, 'Uncensored'));
  expect(buttonNamed('Add subscriptions (1)', host)).not.toBeNull();
  expect(actionOrder(buttonNamed('Add subscriptions (1)', host)!.parentElement)).toEqual(['Off', 'Add subscriptions (1)']);
  await click(buttonNamed('Add subscriptions (1)', host));
  await settle();
  expect(feedWrite).toHaveBeenCalledWith({ action: 'follow-name', name: '瀬戸環奈', ids: ['Kn01'] });
  expect(props.toast).toHaveBeenCalledWith('Created "瀬戸環奈" and subscribed to her new releases');
  expect(feedReads(fetcher)).toBeGreaterThan(before);
  // After subscribing, go back to the follows list.
  expect(boxNamed(host, 'Uncensored')).toBeUndefined();
  expect(host.querySelector('input[aria-label="Performer name"]')).toBeNull();
  expect(host.querySelector('section[aria-label="JAV subscription list"]')).not.toBeNull();
});

it('Enter also searches; checked cards already in the database state whose name they will attach to, and the add button disables when split across two people', async () => {
  const held = { ...LOOKUP, suggested: [], candidates: [
    card('Kn01', ['瀬戸環奈'], '', { id: 3, name: 'Alpha' }), card('Kn02', ['瀬戸環奈'], 'Uncensored', { id: 4, name: 'Beta' }),
  ] };
  const { host, fetcher } = await open({ feeds: FEEDS, lookup: () => held }, { tab: 'add' });
  await type(nameField(host), '瀬戸環奈');
  await act(async () => {
    nameField(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  await settle();
  expect(host.textContent).toContain('Already filed under "Alpha"');
  expect(host.textContent).toContain('Check her performer card');
  await click(boxNamed(host, 'Uncensored'));
  expect(host.textContent).toContain('It will file under "Beta"');
  expect(buttonNamed('Add subscriptions (1)', host)?.disabled).toBe(false);
  await click(boxNamed(host, '瀬戸環奈'));
  expect(host.textContent).toContain('The checked cards belong to different people in the database: Alpha, Beta');
  expect(buttonNamed('Add subscriptions (2)', host)?.disabled).toBe(true);
  expect(sentBody(fetcher, FEED_SOURCE_URL)).toEqual([]);
});

it('When JavDB search fails, she can be followed directly if the ledger already has her code; the reason is still explained', async () => {
  const lookup = vi.fn(() => ({ ...LOOKUP, suggested: [], candidates: [], unavailable: 'JavDB 没有搜成：来源正在冷却',
    known: { id: 5, name: '瀬戸環奈', subscribable: true, following: false } }));
  const feedWrite = vi.fn(() => ok({ ok: true, entity_id: 5, following: true, sources: [7] }));
  const { host, props } = await open({ feeds: FEEDS, lookup, feedWrite }, { tab: 'add' });
  await type(nameField(host), '瀬戸環奈');
  await click(buttonNamed('Find', actorPanel(host)));
  await settle();
  expect(host.textContent).toContain('JavDB 没有搜成：来源正在冷却');
  expect(host.textContent).toContain('The database entry "瀬戸環奈" already has a JavDB or DMM code and can be followed directly.');
  expect(host.textContent).not.toContain('That name returned nothing on JavDB.');
  await click(buttonNamed('Follow "瀬戸環奈"', host));
  await settle();
  expect(feedWrite).toHaveBeenCalledWith({ action: 'follow', entity_id: 5, enabled: true });
  expect(props.toast).toHaveBeenCalledWith('Followed new releases for "瀬戸環奈"');
});

it('When a lookup is rejected by the server the reason sits in the card, and no candidates states so plainly', async () => {
  const first = await open({ feeds: FEEDS, lookup: () => refuse('JavDB returned the login page') }, { tab: 'add' });
  await type(nameField(first.host), 'Alpha');
  await click(buttonNamed('Find', actorPanel(first.host)));
  await settle();
  expect(first.host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates0 itemsJAV subscriptions2 peopleUnwatched new releases3 itemsFollows listAdd followManage tagsAdd a creator followAll sourcesFindAdd JAV subscriptionFindThis run did not finishJavDB returned the login pageCreator aliasesAdd an alias manuallySave aliasSaved aliases0 groupsSortDefault order Default orderCanonical namePlatform aliasShow columnsReset column widthsNo saved creator aliases yetFill in the unified name plus the names this creator uses on other platforms.Add aliasSource and subscription settings');
  await first.unmount();
  queryClient.clear();

  const none = await open({ feeds: FEEDS }, { tab: 'add' });
  await type(nameField(none.host), 'Beta');
  await click(buttonNamed('Find', actorPanel(none.host)));
  await settle();
  expect(none.host.textContent).toContain('That name returned nothing on JavDB.');
  expect(buttonNamed('Off', none.host)).not.toBeNull();
});

it('The read-only instance is clearly labeled and points to the writer; all write operations are disabled', async () => {
  const writer = 'https://writer.example/follow-manage';
  const list = await open({}, { readOnly: true, readOnlyMessage: 'This machine is a read-only replica', writerUrl: writer });
  expect(list.host.textContent).toContain('This machine is browse-only');
  expect(list.host.textContent).toContain('This machine is a read-only replica');
  expect([...list.host.querySelectorAll('a')].find((a) => a.textContent?.includes('Go to the writer instance to manage follows'))
    ?.getAttribute('href')).toBe(writer);
  expect(buttonLabelled(list.host, 'Check all')?.disabled).toBe(true);
  expect(buttonLabelled(list.host, 'Remove Alpha · Kemono')?.disabled).toBe(true);
  await list.unmount();
  queryClient.clear();

  const add = await open({}, { tab: 'add', readOnly: true });
  expect(lookupField(add.host).disabled).toBe(true);
});

// ── Add follow: search, candidates, and registration ───────────────────────────────────────────────

/** The find box. BoardUI's `Input` puts the accessible name on the outer field, with the input inside it. */
function lookupField(root: ParentNode): HTMLInputElement {
  const named = root.querySelector('[aria-label="Source link, name, or id"]');
  const field = named instanceof HTMLInputElement ? named : named?.querySelector('input');
  if (!field) throw new Error('The lookup box never painted');
  return field;
}

const press = (el: Element, key: string) => act(async () => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
});

const focus = (el: HTMLElement) => act(async () => { el.focus() });

/** A candidate's checkbox, found by its row's text. */
const candidateBox = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('label')].find((label) => label.textContent?.includes(text))
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;

const lookups = (fetcher: ReturnType<typeof serve>) => sentBody(fetcher, FOLLOW_RESOLVE_URL);

const CANDIDATES = {
  line: 'kou',
  candidates: [
    { provider: 'kemono', provider_label: 'Kemono', url: 'https://kemono.test/kou', label: 'kou · Kemono',
      author: 'kou', aliases: ['kou_art'], evidence: 'Same name on site' },
    { provider: 'pawchive', provider_label: 'Pawchive', url: 'https://pawchive.test/kou', label: 'kou · Pawchive',
      author: 'kou', evidence: 'Same name on site' },
    { provider: 'fanbox', provider_label: 'Fanbox', url: 'https://fanbox.test/kou', label: 'kou · Fanbox',
      author: 'kou', known: true, evidence: 'Same name on site' },
  ],
};

/** The server's find pass. The first screen reads it as idle; the test advances it to the step it wants before clicking "find". */
function lookupJob() {
  let state: ResolveJob | Promise<ResolveJob> = IDLE as ResolveJob;
  return {
    resolve: () => state,
    set: (next: ResolveJob | Promise<ResolveJob>) => { state = next },
    finish: (results: ResolveJob['results']) => { state = { status: 'complete', results } as ResolveJob },
  };
}

const RUNNING = { status: 'running' } as ResolveJob;

async function lookUp(host: HTMLElement, text: string) {
  await type(lookupField(host), text);
  await press(lookupField(host), 'Enter');
  await settle();
}

it('Enter and the "Find" button run the same lookup, and the find field is one line of text, not a stack of addresses', async () => {
  const { host, fetcher } = await open({}, { tab: 'add' });
  expect(host.querySelector('textarea')).toBeNull();

  await lookUp(host, '  kou  ');
  await type(lookupField(host), 'https://kemono.test/kou');
  await click(buttonNamed('Find', host));
  await settle();
  expect(lookups(fetcher)).toEqual([
    { lines: ['kou'], background: true },
    { lines: ['https://kemono.test/kou'], background: true },
  ]);
});

it('While one lookup runs no second starts, and the button goes busy', async () => {
  const job = lookupJob();
  const { host, fetcher } = await open({ resolve: job.resolve }, { tab: 'add' });
  job.set(RUNNING);
  await lookUp(host, 'kou');
  expect(buttonNamed('Find', host)?.getAttribute('aria-busy')).toBe('true');
  await lookUp(host, 'kou again');
  expect(lookups(fetcher)).toHaveLength(1);
});

it('A failed lookup start keeps input, and Enter retries directly', async () => {
  const { host, fetcher } = await open({ resolveStart: () => refuse('The source is temporarily unavailable') }, { tab: 'add' });
  await lookUp(host, 'kou');
  expect(host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates0 itemsJAV subscriptions0 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsAdd a creator followAll sourcesFindThis run did not finishThe source is temporarily unavailableAdd JAV subscriptionFindCreator aliasesAdd an alias manuallySave aliasSaved aliases0 groupsSortDefault order Default orderCanonical namePlatform aliasShow columnsReset column widthsNo saved creator aliases yetFill in the unified name plus the names this creator uses on other platforms.Add aliasSource and subscription settings');
  expect(lookupField(host).value).toBe('kou');
  await press(lookupField(host), 'Enter');
  await settle();
  expect(lookups(fetcher)).toHaveLength(2);
});

it('A failed background lookup keeps the input and reason; Enter retries directly', async () => {
  vi.useFakeTimers();
  const job = lookupJob();
  const { host, fetcher } = await open({ resolve: job.resolve }, { tab: 'add' });
  job.set(RUNNING);
  await lookUp(host, 'kou');
  job.set({ status: 'failed', error: 'The source connection dropped' } as ResolveJob);
  await tick(JOB_RUNNING_POLL_MS);
  await settle();
  expect(host.textContent).toContain('The source connection dropped');
  expect(lookupField(host).value).toBe('kou');
  await press(lookupField(host), 'Enter');
  await settle();
  expect(lookups(fetcher)).toHaveLength(2);
});

it('The waiting message follows whether this lookup is by name or by link', async () => {
  const hint = async (text: string) => {
    const job = lookupJob();
    const { host, unmount } = await open({ resolve: job.resolve }, { tab: 'add' });
    job.set(RUNNING);
    await lookUp(host, text);
    const said = host.querySelector('[aria-live] [role="status"]')?.textContent;
    await unmount();
    queryClient.clear();
    return said;
  };
  // The first search by name must download the creator index and can sit silent for tens of seconds, so say so up front; pasting a link skips the index.
  expect(await hint('kou')).toContain('Searching (the first name lookup downloads the creator index and may take tens of seconds)');
  expect(await hint('https://kemono.test/kou')).toBe('Identifying');
});

it('A lookup that can report progress draws a progress bar', async () => {
  const job = lookupJob();
  const { host } = await open({ resolve: job.resolve }, { tab: 'add' });
  job.set({ status: 'running', checked: 2, total: 5 } as ResolveJob);
  await lookUp(host, 'kou');
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('Searching: 2/5');
});

it('After the lookup, candidates list pre-checked; already followed ones are listed but cannot be checked; registering happens only on "Add selected"', async () => {
  const job = lookupJob();
  const { host, fetcher } = await open({ resolve: job.resolve }, { tab: 'add' });
  job.finish([CANDIDATES]);
  await lookUp(host, 'kou');

  // The result stays inside the "Add follow" card, without a separate heading.
  const panel = [...host.querySelectorAll('h3')].find((h) => h.textContent === 'Add a creator follow')!.parentElement!;
  expect(panel.textContent).toContain('Lookup results');
  expect(panel.querySelectorAll('h3')).toHaveLength(1);

  expect(candidateBox(panel, 'kou · Kemono')?.checked).toBe(true);
  expect(candidateBox(panel, 'kou · Fanbox')?.disabled).toBe(true);
  expect(candidateBox(panel, 'kou · Fanbox')?.checked).toBe(false);
  expect(candidateBox(panel, 'kou · Fanbox')?.closest('label')?.textContent).toContain('Already followed');
  expect(sentBody(fetcher, FOLLOW_SOURCE_URL)).toEqual([]);

  await click(candidateBox(panel, 'kou · Pawchive'));
  await click(buttonNamed('Add selected (1)', host));
  await settle();
  // Write back who was originally queried: it is what groups one person's sources across several sites.
  expect(sentBody(fetcher, FOLLOW_SOURCE_URL)).toEqual([{
    action: 'add', url: 'https://kemono.test/kou', label: 'kou · Kemono',
    author: 'kou', aliases: ['kou_art'], defer_check: true,
  }]);
  // The check was skipped at registration; after registering, kick off one pass all at once.
  expect(sentBody(fetcher, FOLLOW_CHECK_URL)).toEqual([{ sources: [9], background: true }]);
});

it('The reasons for failed registrations stay on the page, surviving list refetches', async () => {
  const job = lookupJob();
  const { host, fetcher, props } = await open({
    resolve: job.resolve,
    add: (body) => (body.label === 'kou · Pawchive' ? refuse('The site refused') : ok({ source: 9 })),
  }, { tab: 'add' });
  job.finish([CANDIDATES]);
  await lookUp(host, 'kou');
  const before = listReads(fetcher);

  await click(buttonNamed('Add selected (2)', host));
  await settle();
  expect(listReads(fetcher)).toBeGreaterThan(before);
  expect(host.textContent).toContain('This run did not finish');
  expect(host.textContent).toContain('Follow creator3 peopleEnable the source4 / 4Check failed1 sourcesUnwatched updates0 itemsJAV subscriptions0 peopleUnwatched new releases0 itemsFollows listAdd followManage tagsAdd a creator followAll sourcesFindThis run did not finishkou · Pawchive: The site refusedLookup resultskouKemonokou · KemonoSame name on sitePawchivekou · PawchiveSame name on siteFanboxkou · FanboxAlready followedOffAdd selected (2)Add JAV subscriptionFindCreator aliasesAdd an alias manuallySave aliasSaved aliases0 groupsSortDefault order Default orderCanonical namePlatform aliasShow columnsReset column widthsNo saved creator aliases yetFill in the unified name plus the names this creator uses on other platforms.Add aliasSource and subscription settings');
  expect(sentBody(fetcher, FOLLOW_CHECK_URL)).toEqual([{ sources: [9], background: true }]);
  expect(props.toast).not.toHaveBeenCalled();
});

it('When the in-site lookup finds nothing it explains why first, then offers a clickable external search', async () => {
  const job = lookupJob();
  const { host } = await open({ resolve: job.resolve }, { tab: 'add' });
  job.finish([{
    line: 'kou',
    candidates: [],
    external_searches: [{
      label: 'Google', query: 'site:f95zone.to kou', url: 'https://www.google.com/search?q=kou',
      evidence: 'F95 on-site search needs sign-in',
    }],
  }]);
  await lookUp(host, 'kou');
  expect(host.textContent).toContain('The in-site lookup found no source');
  const link = [...host.querySelectorAll('a')].find((a) => a.textContent?.includes('Google: site:f95zone.to kou'))!;
  expect(link.getAttribute('href')).toBe('https://www.google.com/search?q=kou');
  const why = [...host.querySelectorAll('small')].find((node) => node.textContent === 'F95 on-site search needs sign-in')!;
  expect(why.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('The source filter button names which sites it keeps, and filtered-out sites neither show nor register', async () => {
  const creds = {
    root: 'C:\\creds',
    providers: [
      credential({ provider: 'kemono', provider_label: 'Kemono', requirement: 'none', missing: [] }),
      credential({ provider: 'pawchive', provider_label: 'Pawchive', requirement: 'none', missing: [] }),
    ],
  };
  const job = lookupJob();
  const { host } = await open({ creds, resolve: job.resolve }, { tab: 'add' });
  job.finish([CANDIDATES]);
  await lookUp(host, 'kou');

  await click(buttonLabelled(host, 'All sources'));
  await click(buttonNamed('Deselect all'));
  expect(buttonLabelled(host, '0/2 sources')).not.toBeNull();
  expect(candidateBox(host, 'kou · Kemono')).toBeNull();
  expect(buttonNamed('Add selected (0)', host)?.disabled).toBe(true);

  await click(buttonNamed('Select all'));
  expect(buttonLabelled(host, 'All sources')).not.toBeNull();
  expect(buttonNamed('Add selected (2)', host)).not.toBeNull();
  expect(actionOrder(buttonNamed('Add selected (2)', host)!.parentElement)).toEqual(['Off', 'Add selected (2)']);
});

it('Source filters provide one credentials-setup link at the top', async () => {
  const creds = { root: 'C:\\creds', providers: [credential({ provider: 'fanbox', provider_label: 'Fanbox' })] };
  const { host } = await open({ creds }, { tab: 'add' });
  await click(buttonLabelled(host, 'All sources'));
  const dialog = document.querySelector('[role="dialog"][aria-label="Source filter"]')!;
  expect(actionOrder(buttonNamed('Select all', dialog)!.parentElement)).toEqual(['Select all', 'Deselect all', 'Credential setup']);
  expect(linkNamed('Credential setup', dialog)?.getAttribute('href')).toBe('/settings/subscriptions');
  expect(dialog.querySelectorAll('a')).toHaveLength(1);
});

it('A "guess you like" click takes that name straight to lookup', async () => {
  const data = follow({ suggestions: [{ name: 'lewdgazer', visits: 12, origin: 'Chrome' }] });
  const { host, fetcher } = await open({ data }, { tab: 'add' });
  const guess = buttonNamed('lewdgazer', host)!;
  expect(guess.getAttribute('title')).toBe('Appeared 12 times in browsing history · Chrome');
  await click(guess);
  await settle();
  expect(lookups(fetcher)).toEqual([{ lines: ['lewdgazer'], background: true }]);
});

// ── Add follow: typing suggestions ───────────────────────────────────────────────────────

const SUGGESTED: SuggestData = {
  q: 'strau',
  groups: [
    { kind: 'followed', label: 'Following', items: [{ value: 'strauzek', n: 0, matched: '' }] },
    { kind: 'archive', label: 'Archive site creators', items: [{ value: 'Mr_Strauz', n: 0, matched: 'kemono' }] },
    {
      kind: 'tag', label: 'Rule34.xxx tags', items: [
        { value: 'strauss', n: 1234, matched: 'Roles' },
        { value: 'strausberg', n: 56, matched: 'Tags' },
      ],
    },
  ],
};

const suggestCalls = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls
  .map(([input]) => String(input)).filter((url) => url.startsWith(`${FOLLOW_SUGGEST_URL}?`));

/** The suggestion dropdown hangs in the overlay container, not under the page's root, so query the whole document. */
const suggestMenu = () => document.querySelector<HTMLElement>('[aria-label="Source suggestions"]');

async function typeAndWait(host: HTMLElement, text: string) {
  await focus(lookupField(host));
  await type(lookupField(host), text);
  await tick(SUGGEST_DEBOUNCE_MS);
  await settle();
}

it('Continuous typing queries once after you stop, and the URL does not go down the suggestions path', async () => {
  vi.useFakeTimers();
  const { host, fetcher } = await open({ suggest: () => SUGGESTED }, { tab: 'add' });
  await focus(lookupField(host));
  await type(lookupField(host), 'st');
  await tick(SUGGEST_DEBOUNCE_MS / 2);
  await typeAndWait(host, 'strau');
  expect(suggestCalls(fetcher)).toEqual([`${FOLLOW_SUGGEST_URL}?q=strau`]);

  await typeAndWait(host, 'https://kemono.test/strau');
  await tick(SUGGEST_DEBOUNCE_MS);
  expect(suggestCalls(fetcher)).toHaveLength(1);
});

it('Suggestions list in the grouping and order the server gives; select with arrow keys and press Enter to search that name', async () => {
  vi.useFakeTimers();
  const { host, fetcher } = await open({ suggest: () => SUGGESTED }, { tab: 'add' });
  await typeAndWait(host, 'strau');
  // The line starts with the name itself; the sites carrying it and their official categories are only side notes. Each group name appears once per group.
  // Count only the dropdown's direct child rows: react-aria appends one hidden Dismiss key for screen readers at the end.
  expect([...suggestMenu()!.querySelectorAll(':scope > button')].map((row) => row.textContent))
    .toEqual(['strauzek', 'Mr_Strauzkemono', 'straussRoles1,234', 'strausbergTags56']);
  expect([...suggestMenu()!.querySelectorAll(':scope > div')]
    .filter((row) => !row.querySelector('button')).map((row) => row.textContent))
    .toEqual(['Following', 'Archive site creators', 'Rule34.xxx tags']);

  await press(lookupField(host), 'ArrowDown');
  await press(lookupField(host), 'ArrowDown');
  await press(lookupField(host), 'Enter');
  await settle();
  expect(lookups(fetcher)).toEqual([{ lines: ['Mr_Strauz'], background: true }]);
});

it('Clicking a suggestion never blurs the lookup box, and the clicked name searches directly', async () => {
  vi.useFakeTimers();
  const { host, fetcher } = await open({ suggest: () => SUGGESTED }, { tab: 'add' });
  await typeAndWait(host, 'strau');
  const row = suggestMenu()!.querySelector('button')!;
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  await act(async () => { row.dispatchEvent(down) });
  expect(down.defaultPrevented).toBe(true);
  await click(row);
  await settle();
  expect(lookups(fetcher)).toEqual([{ lines: ['strauzek'], background: true }]);
});

it('Enter while composing belongs to the IME; a half-typed composition is not used to search', async () => {
  const { host, fetcher } = await open({}, { tab: 'add' });
  await type(lookupField(host), 'chu');
  await act(async () => {
    lookupField(host).dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', isComposing: true, bubbles: true, cancelable: true,
    }));
  });
  await settle();
  expect(lookups(fetcher)).toEqual([]);
});

it('During Chinese and Japanese composition no suggestions or lookups fire; only complete words query after committing', async () => {
  vi.useFakeTimers();
  const { host, fetcher } = await open({}, { tab: 'add' });
  const input = lookupField(host);
  await focus(input);
  for (const [draft, word] of [['chuangzuozhe', 'Creators'], ['さくら', '桜']]) {
    await act(async () => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })) });
    await type(input, draft!);
    await tick(SUGGEST_DEBOUNCE_MS);
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
    });
    expect(lookups(fetcher)).toEqual([]);
    expect(suggestCalls(fetcher).some(url => new URL(url, 'http://peach.test').searchParams.get('q') === draft)).toBe(false);
    await type(input, word!);
    await act(async () => { input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: word })) });
    await tick(SUGGEST_DEBOUNCE_MS);
    await settle();
  }
  expect(suggestCalls(fetcher).map(url => new URL(url, 'http://peach.test').searchParams.get('q'))).toEqual(['Creators', '桜']);
});

it('While a site has not answered the dropdown shows a waiting row, and Enter searches what was typed', async () => {
  vi.useFakeTimers();
  const { host, fetcher } = await open({ suggest: () => new Promise<SuggestData>(() => {}) }, { tab: 'add' });
  await typeAndWait(host, 'strau');
  expect(suggestMenu()?.textContent).toContain('Searching suggestions');
  await press(lookupField(host), 'ArrowDown');
  await press(lookupField(host), 'Enter');
  await settle();
  expect(lookups(fetcher)).toEqual([{ lines: ['strau'], background: true }]);
});

it('Escape collapses the dropdown and drops the selection, Enter searches the box\'s text; typing another character opens it again', async () => {
  vi.useFakeTimers();
  const { host, fetcher } = await open({ suggest: () => SUGGESTED }, { tab: 'add' });
  await typeAndWait(host, 'strau');
  await press(lookupField(host), 'ArrowDown');
  await press(lookupField(host), 'Escape');
  expect(suggestMenu()).toBeNull();
  // Focus stays in the input box; the arrow keys call it back but do not select a row along the way.
  await press(lookupField(host), 'ArrowDown');
  expect(suggestMenu()?.querySelector('[aria-current="true"]')).toBeNull();
  await press(lookupField(host), 'Escape');
  await typeAndWait(host, 'strauz');
  expect(suggestMenu()).not.toBeNull();
  await press(lookupField(host), 'Escape');
  await press(lookupField(host), 'Enter');
  await settle();
  expect(lookups(fetcher)).toEqual([{ lines: ['strauz'], background: true }]);
});

// ── Sources and credentials ──────────────────────────────────────────────────────────────

function credential(over: Partial<CredentialRow> & { provider: string }): CredentialRow {
  return {
    provider_label: over.provider, followable: true, requirement: 'required',
    needs: ['cookie'], fields: [], missing: ['cookie'], present: false, ...over,
  } as CredentialRow;
}

const CREDENTIAL_CAST: CredentialData = {
  root: 'C:\\peach\\creds',
  providers: [
    credential({
      provider: 'fanbox', provider_label: 'Fanbox', needs: ['FANBOXSESSID', 'cf_clearance'],
      missing: ['FANBOXSESSID', 'cf_clearance'], why: 'Members only content is visible after signing in.',
      where: 'https://www.fanbox.cc/', howto: 'Copy it from the browser developer tools.', path: 'C:\\peach\\creds\\fanbox.json',
    }),
    credential({
      provider: 'patreon', provider_label: 'Patreon', requirement: 'optional', present: true,
      fields: ['cookie'], missing: [], world_readable: true,
    }),
    credential({
      provider: 'onlyfans', provider_label: 'OnlyFans', requirement: 'blocked', needs: [], missing: [],
      why: 'The site demands a device fingerprint and cannot be reached.',
    }),
    credential({ provider: 'kemono', provider_label: 'Kemono', requirement: 'none', needs: [], missing: [] }),
  ],
};

/** A site's row, found from the site name out to its own outer frame. */
const credentialRow = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('b')].find((b) => b.textContent === label)!.closest('div')!;

const chipText = (row: Element) => [...row.querySelectorAll('span')]
  .map((span) => span.textContent).filter((text) => ['Required', 'Configured', 'Cannot connect right now', 'Not needed', 'Optional'].includes(text!));

it('Every site states its own situation: needed, configured, unreachable, or not needed', async () => {
  const { host } = await open({ creds: CREDENTIAL_CAST }, { tab: 'source' });
  expect(['Fanbox', 'Patreon', 'OnlyFans', 'Kemono'].map((label) => chipText(credentialRow(host, label))))
    .toEqual([['Required'], ['Configured'], ['Cannot connect right now'], ['Not needed']]);
  expect(host.textContent).toContain('1 item to configure');
  const groupNames = ['Configurable credentials', 'No credentials needed', 'Not supported yet'];
  expect(groupNames.map(name => [...host.querySelectorAll(`section[aria-label="${name}"] b`)]
    .map(node => node.textContent))).toEqual([['Fanbox', 'Patreon'], ['Kemono'], ['OnlyFans']]);
  expect(host.querySelector('section[aria-label="No credentials needed"] input')).toBeNull();
});

it('What is missing, why it is needed, and where to get it all sit on that row, and the mandatory one starts expanded', async () => {
  const { host } = await open({ creds: CREDENTIAL_CAST }, { tab: 'source' });
  const fanbox = credentialRow(host, 'Fanbox');
  expect(fanbox.textContent).toContain('Missing FANBOXSESSID');
  expect(fanbox.textContent).toContain('Missing cf_clearance');
  expect(fanbox.textContent).toContain('Members only content is visible after signing in.');
  expect(fanbox.textContent).toContain('Copy it from the browser developer tools.');
  expect([...fanbox.querySelectorAll('a')].find((a) => a.textContent?.includes('Get credentials'))?.getAttribute('href'))
    .toBe('https://www.fanbox.cc/');
  expect(fanbox.querySelector('details')?.open).toBe(true);
  expect(fanbox.querySelector('summary')?.textContent).toContain('Fill in credentials');

  const patreon = credentialRow(host, 'Patreon');
  expect(patreon.querySelector('details')?.open).toBe(false);
  expect(patreon.querySelector('summary')?.textContent).toContain('Edit credentials');
  // Sites that cannot be connected have no form to fill in; they only say why.
  const blocked = credentialRow(host, 'OnlyFans');
  expect(blocked.querySelector('details')).toBeNull();
  expect(blocked.textContent).toContain('The site demands a device fingerprint and cannot be reached.');
});

it('Credentials fill on the page and the input clears after saving; saving while empty is blocked', async () => {
  const { host, fetcher, props } = await open({ creds: CREDENTIAL_CAST }, { tab: 'source' });
  const fanbox = credentialRow(host, 'Fanbox');
  const fields = [...fanbox.querySelectorAll<HTMLInputElement>('input[type="password"]')];
  expect(fields).toHaveLength(2);

  await click(buttonNamed('Save configuration', fanbox));
  expect(fanbox.textContent).toContain('Nothing was filled in');
  expect(sentBody(fetcher, FOLLOW_CREDENTIAL_URL)).toEqual([]);

  await type(fields[0], '  secret  ');
  await click(buttonNamed('Save configuration', fanbox));
  await settle();
  expect(sentBody(fetcher, FOLLOW_CREDENTIAL_URL))
    .toEqual([{ provider: 'fanbox', values: { FANBOXSESSID: 'secret' } }]);
  expect(fields[0]!.value).toBe('');
  expect(props.toast).toHaveBeenCalledWith('Source credentials saved');
  // Only a configured row gets "Clear".
  expect(buttonNamed('Clear', fanbox)).toBeNull();
  expect(buttonNamed('Clear', credentialRow(host, 'Patreon'))).not.toBeNull();
  expect(actionOrder(buttonNamed('Clear', credentialRow(host, 'Patreon'))!.parentElement)).toEqual(['Clear', 'Save configuration']);
});

it('The credentials file path expands, and the over-broad permissions warning stays visible while credentials are collapsed', async () => {
  const { host } = await open({ creds: CREDENTIAL_CAST }, { tab: 'source' });
  const patreon = credentialRow(host, 'Patreon');
  expect(patreon.querySelector('details')?.open).toBe(false);
  const warning = patreon.querySelector('[role="alert"]')!;
  expect(warning.textContent).toContain('The credentials file permissions are too broad');
  expect(warning.closest('details')).toBeNull();
  const file = [...credentialRow(host, 'Fanbox').querySelectorAll('details')]
    .find(node => node.querySelector('summary')?.textContent === 'Credentials file')!;
  expect(file.open).toBe(false);
  await click(file.querySelector('summary'));
  expect(file.open).toBe(true);
  expect(file.textContent).toContain('fanbox.json');
});

it('Mark all as watched: entries beyond the pending page get marked too, each batch no larger than the bulk endpoint limit of 1000', async () => {
  // 1500 条未看，每组一条主条目；服务端一页最多给 1000 组，标过的离开 status=new。
  const unseen = new Set(Array.from({ length: 1500 }, (_, index) => index + 1));
  const batches: number[][] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, location.origin).pathname;
    if (path === FOLLOW_STATUS_URL) {
      const body = JSON.parse(String(init?.body)) as { items: number[]; to: string };
      expect(body.to).toBe('seen');
      batches.push(body.items);
      for (const id of body.items) unseen.delete(id);
      return { ok: true, status: 200, json: async () => ({ ok: true, items: body.items }) } as Response;
    }
    expect(path).toBe(FOLLOW_URL);
    const page = [...unseen].slice(0, MARK_BATCH);
    return { ok: true, status: 200, json: async () => ({
      groups: page.map((id) => ({ primary: { id, status: 'new' }, variants: [], duplicates: [] })),
      has_more: unseen.size > MARK_BATCH }) } as Response;
  }));
  const result = await markAllPending('seen');
  expect(result).toEqual({ total: 1500, failed: 0, error: undefined });
  expect(unseen.size).toBe(0);
  expect(batches.map((items) => items.length)).toEqual([1000, 500]);
});

it('Mark all as watched: the batch that failed to write counts into the failure total and is not refetched repeatedly', async () => {
  const fetcher = vi.fn(async (url: string) => {
    const path = new URL(url, location.origin).pathname;
    if (path === FOLLOW_STATUS_URL) return { ok: false, status: 500, json: async () => ({ error: 'The database is busy' }) } as Response;
    return { ok: true, status: 200, json: async () => ({
      groups: [{ primary: { id: 1, status: 'new' }, variants: [{ id: 2, status: 'seen' }], duplicates: [{ id: 3, status: 'new' }] }],
      has_more: true }) } as Response;
  });
  vi.stubGlobal('fetch', fetcher);
  const result = await markAllPending('ignored');
  expect([result.total, result.failed]).toEqual([2, 2]);
  expect(String((result.error as Error).message)).toContain('The database is busy');
  expect(fetcher.mock.calls.filter(([url]) => new URL(url, location.origin).pathname === FOLLOW_URL)).toHaveLength(2);
});
