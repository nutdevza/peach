/* The home new-releases row (`feed-new` island): which copy is fetched, where it renders, how the card reports completion to
 * the shell, and refetching on generation change.
 *
 * The three keys' presence on the card shares the profile page row's component, measured in `entity-hero.test.tsx`; the
 * skeleton handover and collapsing on leaving the catalog page need a real browser, measured in
 * `frontend/e2e/home-loading.test.ts` and `feed-cover.test.ts`. */
import { act, useState } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appSettingsStore } from '@peach/appearance';
import { feedNewKey, fetchFeedNew, prefetchFeedNew, type FeedDiscoveries, type FeedNewProps } from '../../src/react/feed-new/feed-new';
import { FeedNewPage } from '../../src/react/feed-new/feed-new-page';
import { queryClient } from '../../src/react/query';
import { click, mountRoot, settle } from './render';
import { FeedNewRow } from '../../src/react/feed-new/feed-new-row';
import { feedIdentity } from '../../src/card-art/feed-identity';

afterEach(() => { queryClient.clear() });
notifyManager.setScheduler((notify) => notify());

const rowHtml = (data: FeedDiscoveries | null) => `<div class="feednewrow">${(data?.items || []).map((one) =>
  `<div data-feed-id="${one.id}"><button data-feed-action="ignore">Not interested</button></div>`).join('')}</div>`;

/** Fake server: the discovery list returns the given entries per round; write endpoints always succeed. */
function serve(...rounds: number[][]) {
  let round = 0;
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith('/api/feeds/discoveries')) {
      const ids = rounds[Math.min(round, rounds.length - 1)] || [];
      round += 1;
      return { ok: true, status: 200, json: async () => ({ items: ids.map((id) => ({ id, has_cover: true })) }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
const reads = (fetcher: ReturnType<typeof serve>) =>
  fetcher.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/feeds/discoveries'));

it('New-release source co-star avatars load straight from source image URLs and can unmount after being ignored', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('section');
  document.body.append(host);
  const html = `<div class="feednewrow"><article data-feed-id="1">${feedIdentity({ code: 'EXM-001', performer_refs: [
    { name: 'A', source_actor_id: 'A', source_avatar: true },
    { name: 'B', source_actor_id: 'B', source_avatar: true }] })}<button data-feed-action="ignore">Ignore</button></article></div>`;
  const mounted = await mountRoot(<QueryClientProvider client={queryClient}><FeedNewRow host={host} feedNew={{ items: [{ id: 1 }], html }}
    wire={() => {}} act={async () => {}} /></QueryClientProvider>);
  await settle();
  const avatars = [...mounted.host.querySelectorAll<HTMLImageElement>('.mav img')].map((img) => img.getAttribute('src')).sort();
  expect(avatars).toEqual(['/jav-image?code=EXM-001&image=actor%3AA', '/jav-image?code=EXM-001&image=actor%3AB']);
  expect(fetcher).not.toHaveBeenCalled();
  await click(mounted.host.querySelector('[data-feed-action]'));
  await settle();
  expect(mounted.host.querySelector('[data-feed-id]')).toBeNull();
});

function props(patch: Partial<FeedNewProps> = {}): FeedNewProps {
  const host = document.createElement('section');
  host.hidden = true;
  document.body.append(host);
  return {
    host, revision: 0, helpers: { feedRowHtml: rowHtml, wireFeedRow: vi.fn() }, actions: { settled: vi.fn() }, ...patch,
  };
}

async function open(given: FeedNewProps) {
  await prefetchFeedNew(given);
  const root = await mountRoot(<QueryClientProvider client={queryClient}><FeedNewPage {...given} /></QueryClientProvider>);
  await settle();
  return root;
}

describe('Fetching', () => {
  it('It returns as soon as text and actions are ready; covers are neither preloaded nor decoded during fetching', async () => {
    serve([1]);
    const image = vi.fn(function () { throw new Error('The cover must not be preloaded') });
    vi.stubGlobal('Image', image);
    const data = await fetchFeedNew(null, () => '<article>Works<button>Want</button><img src="/cover-image?code=EXM-001"></article>');
    expect(data.items).toHaveLength(1);
    expect(data.html).toContain('Want');
    expect(image).not.toHaveBeenCalled();
  });

  it('A read failure keeps the failed state and does not masquerade as no new releases', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ error: 'Reading unfinished' }) })));
    await expect(fetchFeedNew(null, rowHtml)).rejects.toThrow('Reading unfinished');
  });

  it('Home\'s row does not split by person: it carries only counts and holds its own cache key apart from the profile page\'s row', async () => {
    const fetcher = serve([1, 2]);
    await open(props());
    expect(reads(fetcher)).toEqual(['/api/feeds/discoveries?limit=12']);
    expect(feedNewKey(null)).toEqual(['feed-new', 'home']);
    expect(feedNewKey(7)).toEqual(['feed-new', 7]);
  });

  it('The count follows the settings dialog\'s "New release count"', async () => {
    const store = appSettingsStore();
    const before = store.value.feedLimit;
    store.value.feedLimit = 30;
    try {
      const fetcher = serve([1]);
      await open(props());
      expect(reads(fetcher)).toEqual(['/api/feeds/discoveries?limit=30']);
    } finally { store.value.feedLimit = before }
  });

  it('Each mount is a fresh pass and does not read cache left by the last one', async () => {
    const fetcher = serve([1], [1, 2]);
    await prefetchFeedNew(props());
    const given = props();
    await open(given);
    expect(reads(fetcher)).toHaveLength(2);
    expect(given.host.querySelectorAll('[data-feed-id]')).toHaveLength(2);
  });
});

describe('Paints into the host', () => {
  it('The card lands on the host itself, not in the React root; once painted it reveals the host, drops the waiting state, and reports "present" to the shell', async () => {
    serve([1, 2]);
    const given = props();
    given.host.setAttribute('aria-busy', 'true');
    const { host: root } = await open(given);
    expect(given.host.hidden).toBe(false);
    expect(given.host.hasAttribute('aria-busy')).toBe(false);
    expect(given.host.querySelectorAll('[data-feed-id]')).toHaveLength(2);
    expect(root.querySelector('[data-feed-id]')).toBeNull();
    expect(given.helpers.wireFeedRow).toHaveBeenCalledWith(given.host.querySelector('.feednewrow'));
    expect(given.actions.settled).toHaveBeenLastCalledWith(true);
  });

  it('The home page\'s row ends with “View all new works”, pointing at the JAV page\'s new-works section', async () => {
    serve([1]);
    const rowWithAll = vi.fn((data: FeedDiscoveries | null, allHref = '') => `${rowHtml(data).slice(0, -6)}<a class="feednewall" href="${allHref}">View all new releases</a></div>`);
    const given = props({ helpers: { feedRowHtml: rowWithAll, wireFeedRow: vi.fn() } });
    await open(given);
    expect(rowWithAll).toHaveBeenLastCalledWith(expect.anything(), '/jav?tab=releases');
    expect(given.host.querySelector('.feednewrow > a.feednewall')?.getAttribute('href')).toBe('/jav?tab=releases');
  });

  it('With none at all the whole block never renders, reporting "none" to the shell', async () => {
    serve([]);
    const given = props();
    await open(given);
    expect(given.host.hidden).toBe(true);
    expect(given.host.querySelector('[data-feed-id]')).toBeNull();
    expect(given.actions.settled).toHaveBeenLastCalledWith(false);
  });

  it('When the last card collapses the host hides, and the shell lays no skeleton on the next home entry', async () => {
    const fetcher = serve([5]);
    const given = props();
    await open(given);
    await click(given.host.querySelector('[data-feed-action="ignore"]'));
    await settle();
    expect(fetcher.mock.calls.some(([url, init]) => url === '/api/feeds/discovery'
      && JSON.parse(String(init?.body)).ids[0] === 5)).toBe(true);
    expect(given.host.hidden).toBe(true);
    expect(given.actions.settled).toHaveBeenLastCalledWith(false);
  });
});

/* The shell pushes patches via `updateManagedRoute`; here a layer of state stands in for it. */
let push: (patch: Partial<FeedNewProps>) => void = () => {};
function Harness(initial: FeedNewProps) {
  const [value, set] = useState(initial);
  push = (patch) => set((current) => ({ ...current, ...patch }));
  return <QueryClientProvider client={queryClient}><FeedNewPage {...value} /></QueryClientProvider>;
}

describe('Switch generation', () => {
  it('A new generation pushed by the shell triggers a refetch; a patch with the same generation sends no request', async () => {
    const fetcher = serve([1], [1, 3]);
    const given = props();
    await prefetchFeedNew(given);
    await mountRoot(<Harness {...given} />);
    await settle();
    expect(reads(fetcher)).toHaveLength(1);
    await act(async () => push({ revision: 0 }));
    await settle();
    expect(reads(fetcher)).toHaveLength(1);
    await act(async () => push({ revision: 1 }));
    await settle();
    expect(reads(fetcher)).toHaveLength(2);
    expect(given.host.querySelectorAll('[data-feed-id]')).toHaveLength(2);
  });
});
