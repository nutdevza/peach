/* HD version target page behavior: what a card carries, where to click to open the video, and how many requests each direction of entering/leaving sends.
 *
 * Appearance (cover width and ratio, long-title middle truncation) is a design decision asserted by `frontend/e2e/design-*.test.ts`
 * reading `getComputedStyle`; here we only check structure, text, and requests. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { queryClient } from '../../src/react/query';
import { QualityGoalsPage } from '../../src/react/quality-goals/quality-goals-page';
import {
  prefetchQualityGoals, QUALITY_GOALS_URL,
  type QualityGoal, type QualityGoalsData,
} from '../../src/react/quality-goals/quality-goals';

import { click, mount, mountRoot, settle } from './render';

// The client is a module-level singleton (all React roots share one); without clearing between test cases they feed each other data.
afterEach(() => queryClient.clear());

/* Query dispatches updates through the real `setTimeout(0)` it captured itself, which the fake clock cannot advance: after advancing the clock
   the assertions still see the previous frame's DOM. The case dispatches immediately instead. */
notifyManager.setScheduler((notify) => notify());

const goal = (overrides: Partial<QualityGoal> = {}): QualityGoal => ({
  id: 1,
  name: 'one.mp4',
  code: null,
  location: 'local',
  size: 2147483648,
  duration: 3725,
  reason: null,
  cost: 'free',
  has_thumb: true,
  has_cover: false,
  ...overrides,
});

const payload = (items: QualityGoal[], total = items.length): QualityGoalsData =>
  ({ total, items, offset: 0, has_more: false });

/** The helpers handed over by the legacy layer, replaced with a recognizable minimal implementation. */
const legacyProps = () => ({
  toast: vi.fn(),
  openItem: vi.fn<(id: number) => void>(),
  javTitleHtml: (item: QualityGoal) => `<strong class="ui-javcode">${item.name}</strong>`,
  javDisplayName: (item: QualityGoal) => `Name ${item.name}`,
  srcBadge: (location: string, cost: string) => `<span class="src ${cost}" data-location="${location}"></span>`,
});

/** Returns these responses in order, repeating the last one forever after. The `null` entry returns 500. */
function serve(...responses: (QualityGoalsData | null)[]) {
  let at = 0;
  const fetcher = vi.fn(async (input: string, _init?: RequestInit) => {
    // The cloud download popover fetches its download config itself; that route returns an empty table with no channels configured and does not take a slot in these responses' order.
    if (input.startsWith('/api/downloads')) {
      return { ok: true, status: 200, json: async () => ({ available: true, providers: [], tasks: [] }) };
    }
    const body = responses[Math.min(at, responses.length - 1)] ?? null;
    at += 1;
    return body
      ? { ok: true, status: 200, json: async () => body }
      : { ok: false, status: 500, json: async () => ({ message: 'Database is currently browse-only' }) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

/** Runs the real first-screen path: prefetch lands in the cache first, then mount. */
async function open(...responses: (QualityGoalsData | null)[]) {
  const fetcher = serve(...responses);
  const props = legacyProps();
  await prefetchQualityGoals(new AbortController().signal).catch(() => {});
  const mounted = await mountRoot(
    <QueryClientProvider client={queryClient}><QualityGoalsPage {...props} /></QueryClientProvider>);
  return { fetcher, props, ...mounted };
}

it('The first screen renders from the prefetched cache entry and does not request again on mount', async () => {
  const { fetcher, host } = await open(payload([goal()]));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe(QUALITY_GOALS_URL);
  expect(host.querySelectorAll('li[data-goal-id]')).toHaveLength(1);
});

it('The summary is the server total, not the count captured on this page', async () => {
  const { host } = await open(payload([goal(), goal({ id: 2, name: 'two.mp4' })], 37));
  expect(host.querySelector('[data-collection-summary] strong')?.textContent).toBe('37 videos');
  expect(host.querySelectorAll('li[data-goal-id]')).toHaveLength(2);
});

it('One card per target, with readings using the legacy layer\'s same formatting convention', async () => {
  const { host } = await open(payload([goal({
    id: 42, name: 'one.mp4', location: '115', cost: 'metered',
    duration: 3725, size: 2147483648, reason: 'Only 720p',
  })]));
  const card = host.querySelector('li[data-goal-id="42"]')!;
  // The first cell hosts the source badge: it takes only HTML, never plain text.
  expect([...card.querySelectorAll('h3 ~ p > span')].map((node) => node.textContent))
    .toEqual(['', '115', '1:02:05', '2.0 GB']);
  expect(card.querySelector('.src')?.getAttribute('data-location')).toBe('115');
  expect(card.querySelector('.src')?.classList.contains('metered')).toBe(true);
  expect(card.querySelector('h3 .ui-javcode')?.textContent).toBe('one.mp4');
  expect(card.querySelector('h3 button')?.hasAttribute('data-middle-truncate')).toBe(false);
  expect(card.querySelector('h3 button')?.getAttribute('title')).toBe('Name one.mp4');
  expect([...card.querySelectorAll('p')].at(-1)?.textContent).toBe('Only 720p');
});

it('A failed duration probe shows a placeholder, never 0 or a negative', async () => {
  const { host } = await open(payload([goal({ duration: -1, size: 0 })]));
  expect([...host.querySelectorAll('h3 ~ p > span')].map((node) => node.textContent))
    .toEqual(['', 'Local', '—', 'Unknown size']);
});

it('The code cover is used when present, falling back to the poster', async () => {
  const withCover = await open(payload([goal({ has_cover: true, code: 'ABC-123' })]));
  expect(withCover.host.querySelector('img')?.getAttribute('src')).toBe('/cover?code=ABC-123');
  await withCover.unmount();
  queryClient.clear();

  const withoutCover = await open(payload([goal({ id: 7, has_cover: false })]));
  expect(withoutCover.host.querySelector('img')?.getAttribute('src')).toBe('/poster?id=7&c=4');
});

it('When a cover cannot be fetched the image is removed, the fallback text stays, and the rest of the card renders as usual', async () => {
  const { host } = await open(payload([goal()]));
  host.querySelector('img')!.dispatchEvent(new Event('error'));
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('li[data-goal-id] button')?.textContent).toBe('No preview yet');
});

it('Cover, title, and footer all open the same video, with accessible names in plain text form', async () => {
  const { host, props } = await open(payload([goal({ id: 42 })]));
  const cover = host.querySelector<HTMLButtonElement>('li[data-goal-id] button')!;
  expect(cover.getAttribute('aria-label')).toBe('Open Name one.mp4');
  await click(cover);
  await click(host.querySelector('h3 button'));
  await click([...host.querySelectorAll('button')].find((node) => node.textContent === 'View editions'));
  expect(props.openItem.mock.calls).toEqual([[42], [42], [42]]);
});

it('Searching a resource opens the cloud download dialog in place with the code and original-edition target; without a code only viewing editions is offered', async () => {
  const { host } = await open(payload([goal({ id: 42, code: 'ABC-123', reason: 'Chinese subs' }), goal({ id: 43 })]));
  const buttons = [...host.querySelectorAll('button')].filter((node) => node.textContent === 'Find resources');
  expect(buttons).toHaveLength(1);
  await click(buttons[0]);
  await settle();
  const dialog = document.querySelector('[role=dialog]');
  expect(dialog?.textContent).toContain('Find resourcesABC-123 · Name one.mp462 minEdition target: Chinese subs. Search priorities adjust below; completeness and watermarks need per-item review.Find resources by codeFind firstChinese subs HDChinese subsUncensoredMin size (GiB)Max size (GiB)Magnet linkDownload to选择一个项目 No download channel configured yet.Download channel settingsTarget folderCancelSubmit download');
});

it('With no targets at all it gives an empty state, never a blank white page', async () => {
  const { host } = await open(payload([]));
  expect(host.querySelector('h3')?.textContent).toBe('No HD target is being marked');
  expect(host.querySelector('li[data-goal-id]')).toBeNull();
});

it('When the first-screen fetch fails only one error shows and no empty list paints', async () => {
  const { host } = await open(null);
  const alert = host.querySelector('[role=alert]');
  // Copy goes through the legacy layer's `requestErrorMessage`: when the server supplies a reason message, use it; the page does not say it a second time.
  expect(alert?.textContent).toContain('HD edition target fetch failedDatabase is currently browse-only');
  expect(alert?.textContent).toContain('HD edition target fetch failedDatabase is currently browse-only');
  expect(host.querySelector('ul')).toBeNull();
});

it('Re-entering this page refetches: refresh on this page is a fresh re-entry and never reads the cache', async () => {
  const first = await open(payload([goal({ id: 1, name: 'cached.mp4' })]),
    payload([goal({ id: 2, name: 'fresh.mp4' })]));
  expect(first.fetcher).toHaveBeenCalledTimes(1);
  await first.unmount();

  // The shell opens this page again: `openManagedRoute` prefetches first, then paints.
  await prefetchQualityGoals(new AbortController().signal);
  expect(first.fetcher).toHaveBeenCalledTimes(2);
  const host = await mount(
    <QueryClientProvider client={queryClient}><QualityGoalsPage {...legacyProps()} /></QueryClientProvider>);
  expect(first.fetcher).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('fresh.mp4');
});

it('After unmount nothing touches the database: this page has no polling and should leave no other timers', async () => {
  vi.useFakeTimers();
  const { fetcher, unmount } = await open(payload([goal()]));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await unmount();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher, 'Fetching continued after unmount').toHaveBeenCalledTimes(1);
});
