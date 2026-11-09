/* Five index pages: filter box, page-level Tabs, layout, tag multi-select, and pagination.
 *
 * The first screen lands in the shared cache exactly like the real path (the legacy layer's `prefetch` step), and the page reads it on mount; the query after a
 * state change goes through a fake fetch. Destinations (profile page, catalog, follows page) and the address bar are handed back to the shell via props; this only watches what the page hands out. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { act, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerResponseEntities } from '../../src/core/entity-links';
import { registerNameWritings, setNameLanguage } from '../../src/core/entity-names';

import { refitNativeImages } from '@peach/card-art';
import { tagLabel } from '@peach/legacy/tags';

import { indexKey, indexRoute, type IndexProps, type IndexRoute } from '../../src/react/index/index-data';
import { IndexPage } from '../../src/react/index/index-page';
import { onlineAuthorsKey, onlineTagsKey } from '../../src/react/follow/online-vocab';
import { queryClient } from '../../src/react/query';
import { buttonNamed, click, mount, pending, settle, type } from './render';

/* Re-measuring already-loaded images uses the `card-art` copy; the measured geometry is guarded by `test/card-art/`, and here we only care about when to measure. */
vi.mock('@peach/card-art', async (importOriginal) => ({
  ...await importOriginal<typeof import('@peach/card-art')>(), refitNativeImages: vi.fn(),
}));

afterEach(() => { queryClient.clear() });
beforeEach(() => { registerNameWritings([]); setNameLanguage('zh-CN') });
notifyManager.setScheduler((notify) => notify());

const person = (k: string, patch: Record<string, unknown> = {}) => ({ k, n: 3, entity_id: 1, ...patch });
const tag = (k: string, cat = 'role') => ({ k, n: 2, cat });

function seed<T>(key: readonly unknown[], items: T[], more = false, categories?: Record<string, number>) {
  queryClient.setQueryData(key, { pages: [{ items, has_more: more, categories }], pageParams: [0] });
}

/** A fake fetch that answers by address; when `answer` returns `undefined`, that request stays pending forever. */
function serve(answer: (url: string) => unknown) {
  const fetcher = vi.fn(async (url: string) => {
    const body = await answer(url);
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

const urls = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls.map(([url]) => String(url));

function props(route: Partial<IndexRoute> = {}, patch: Partial<IndexProps> = {}): IndexProps {
  return {
    kind: 'performers', q: '', scope: 'local', view: 'alphabet', category: 'all', ...route,
    layout: 'big', selectMode: false,
    route: vi.fn(), savePreference: vi.fn(), exitSelectMode: vi.fn(),
    personAvatar: vi.fn(() => ({ html: '<span class="ini">A</span>', face: '' })),
    authorAvatar: vi.fn(() => '<span class="ini">B</span>'),
    tagLabel,
    openEntity: vi.fn(), showTags: vi.fn(), openFollowAuthor: vi.fn(), openFollowTag: vi.fn(),
    configurable: true, ...patch,
  };
}

let setSelectMode: (on: boolean) => void = () => {};
/** The selection key belongs to the shell: whatever the shell pushes in via `updateManagedRoute` is this item; here one layer of state stands in for it. */
function Shell(given: IndexProps) {
  const [selectMode, set] = useState(given.selectMode);
  setSelectMode = set;
  return <IndexPage {...given} selectMode={selectMode} />;
}

const open = (given: IndexProps) =>
  mount(<QueryClientProvider client={queryClient}><Shell {...given} /></QueryClientProvider>);

const cells = (host: ParentNode) => [...host.querySelectorAll('[data-index-cell]')];
const search = (host: ParentNode) => host.querySelector<HTMLInputElement>('[data-index-search] input')!;
const tab = (host: ParentNode, value: string) => host.querySelector(`[role="tab"][data-tab="${value}"]`);
const alphaTag = (host: ParentNode, k: string) => host.querySelector(`[data-alpha-tag][data-k="${k}"]`);

describe('Type in the address bar', () => {
  it('The shared glyph map from the name endpoint covers the roster label; switching language never changes the original parameters of the profile page', async () => {
    registerResponseEntities('/api/entity/shapes', { entities: [], name_variants: [], name_glyphs: { 鈴: '铃' } });
    const given = props();
    seed(indexKey('performers', ''), [person('山田鈴奈')]);
    const host = await open(given); await settle();
    expect(cells(host)[0]?.textContent).toContain('山田铃奈');
    await click(cells(host)[0]);
    expect(given.openEntity).toHaveBeenCalledWith('performer', '山田鈴奈');
    await act(async () => setNameLanguage('ja'));
    expect(cells(host)[0]?.textContent).toContain('山田鈴奈');
  });
  it('Tag pagination shows only the current page; a search change returns to the first page', async () => {
    const all = Array.from({ length:230 }, (_, index) => tag(`tag-${index}`));
    const fetcher = serve(url => {
      const params = new URL(url, 'http://localhost').searchParams;
      const offset = Number(params.get('offset')), limit = Number(params.get('limit'));
      const rows = all.filter(row => row.k.includes(params.get('q') || ''));
      return { items:rows.slice(offset, offset+limit), total:rows.length, has_more:offset+limit < rows.length, categories:{ role:rows.length } };
    });
    const host = await open(props({ kind:'tags', view:'cloud' })); await settle();
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(100);
    await click(buttonNamed('Next page', host)); await settle();
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(100);
    expect(host.querySelector('[data-tag-chip][data-k="tag-0"]')).toBeNull();
    expect(host.querySelector('[data-tag-chip][data-k="tag-100"]')).not.toBeNull();
    await type(search(host), 'tag-229');
    await act(async () => search(host).dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })));
    await settle();
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(1);
    const last = new URL(urls(fetcher).at(-1)!, 'http://localhost');
    expect(last.searchParams.get('offset')).toBe('0');
    expect(last.searchParams.get('limit')).toBe('100');
    expect(host.querySelector('[data-index-more]')).toBeNull();
  });

  it('When a filter yields nothing, clear the condition and keep the current online index and layout', async () => {
    seed(onlineTagsKey('missing', 'artist'), []);
    serve(() => ({ items: [], has_more: false }));
    const given = props({ kind: 'tags', scope: 'online', q: 'missing', category: 'artist', view: 'alphabet' });
    const host = await open(given);
    await settle();
    await click(buttonNamed('Clear filters', host));
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'tags', scope: 'online', view: 'alphabet', q: '', category: 'all',
    }), { replace: false });
    expect(search(host).value).toBe('');
  });
  it('Unrecognized kinds fall back to "All", and roster pages drop the vocabulary tier', () => {
    expect(indexRoute({ kind: 'tags', q: '', scope: 'local', view: 'alphabet', category: 'bogus' }).category).toBe('all');
    expect(indexRoute({ kind: 'tags', q: '', scope: 'local', view: 'alphabet', category: 'role' }).category).toBe('role');
    // The online set's categories come from the upstream tag_type; there is no `artist` category locally.
    expect(indexRoute({ kind: 'tags', q: '', scope: 'local', view: 'alphabet', category: 'artist' }).category).toBe('all');
    expect(indexRoute({ kind: 'tags', q: '', scope: 'online', view: 'alphabet', category: 'artist' }).category).toBe('artist');
    expect(indexRoute({ kind: 'studios', q: '', scope: 'online', view: 'alphabet', category: 'role' }))
      .toMatchObject({ scope: 'local', category: 'all' });
  });
});

describe('Roster', () => {
  it('The subscription mark follows roster state, and the marked area still opens the person\'s profile', async () => {
    seed(indexKey('performers', ''), [person('Alpha', { following: true }), person('Beta', { entity_id: 2, following: false })]);
    const given = props();
    const host = await open(given);
    const marker = host.querySelector('[data-index-feed]');
    expect(marker?.getAttribute('aria-label')).toBe('Subscribed to new releases');
    expect(host.querySelectorAll('[data-index-feed]')).toHaveLength(1);
    await click(marker);
    expect(given.openEntity).toHaveBeenCalledWith('performer', 'Alpha');
    await act(async () => { seed(indexKey('performers', ''), [person('Alpha', { following: false })]) });
    await settle();
    expect(host.querySelector('[data-index-feed]')).toBeNull();
  });
  it('Browsing categories writes back the address with isolated page caches, and filters show only categories with content', async () => {
    seed(indexKey('performers', ''), [person('Animation authors', { entity_kind:'creator', identity_labels: ['Animation authors'] })], false, { animation:1 });
    const fetcher = serve(() => ({ items: [person('Animation authors', { entity_kind:'creator', identity_labels: ['Animation authors'] })], categories:{ animation:1 }, has_more: false }));
    const given = props();
    const host = await open(given);
    expect(host.querySelector('[data-index-title]')?.textContent).toBe('Artists');
    expect(cells(host)[0]?.textContent).toContain('Animation authors');
    expect(host.querySelector('[aria-label="Identity groups"]')?.textContent).toBe('AllAnimation authors');
    await click(buttonNamed('Animation authors', host));
    await settle();
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'animation' }), { replace: false });
    expect(urls(fetcher)[0]).toContain('category=animation');
    expect(cells(host)[0]?.textContent).toContain('Animation authors');
    expect(indexRoute({ kind: 'performers', q: '', scope: 'online', view: 'alphabet', category: 'artist' }).category).toBe('all');
  });
  it('Artist categories show only ones with content, and seller addresses reject performer filters', async () => {
    seed(indexKey('performers', ''), [person('Performers', { identity_labels:['Performers','Western'] })], false, { japanese_av:1, western:1 });
    const host = await open(props());
    expect(host.querySelector('[aria-label="Identity groups"]')?.textContent).toBe('AllPerformersWestern');
    expect(indexRoute({ kind:'creators', q:'', scope:'local', view:'alphabet', category:'japanese_av' }).category).toBe('all');
  });
  it('While waiting for a new page after switching categories, the category button row keeps the previous counts and never collapses', async () => {
    seed(indexKey('performers', ''), [person('Performers', { identity_labels:['Performers'] })], false, { japanese_av:1, amateur:2, western:1 });
    const answer = pending<unknown>();
    serve(() => answer.answer);
    const host = await open(props());
    const row = () => host.querySelector('[aria-label="Identity groups"]')?.textContent;
    expect(row()).toBe('AllPerformersAmateurWestern');
    await click(buttonNamed('Amateur', host));
    await settle();
    expect(row()).toBe('AllPerformersAmateurWestern');
    expect(buttonNamed('Amateur', host)?.getAttribute('aria-pressed')).toBe('true');
    await answer.release({ items: [person('Amateur')], categories: { japanese_av:1, amateur:2 }, has_more: false });
    await settle();
    expect(row()).toBe('All performers: amateur');
  });
  it('After an old seller-animation author link is normalized into the artist category, the address is rewritten with replace', async () => {
    seed(indexKey('performers', '', 'animation'), [person('Animation authors')], false, { animation:1 });
    const given = props({ kind: 'creators', category: 'animation' });
    const host = await open(given);
    expect(host.querySelector('[data-index-title]')?.textContent).toBe('Artists');
    expect(given.route).toHaveBeenCalledTimes(1);
    expect(given.route).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'performers', scope: 'local', category: 'animation' }), { replace: true });
  });
  it('Already-canonical addresses never rewrite', async () => {
    seed(indexKey('performers', ''), [person('Performers')]);
    const given = props();
    await open(given);
    expect(given.route).not.toHaveBeenCalled();
  });
  it('Artists, sellers, and online share one nav row, with sellers carrying no duplicate identity filter', async () => {
    seed(indexKey('performers',''),[person('Real account')]);
    seed(indexKey('creators',''),[person('Seller accounts')]);
    seed(onlineAuthorsKey(''),[]);
    serve(() => ({items:[],has_more:false}));
    const given = props();
    const host = await open(given);
    expect([...host.querySelectorAll('[role="tab"]')].map(item => item.textContent?.trim())).toEqual(['Artists','Sellers','Online']);
    expect(host.querySelectorAll('[role="tablist"]')).toHaveLength(1);
    await click(tab(host,'creators'));
    await settle();
    expect(host.querySelector('[data-index-title]')?.textContent).toBe('Sellers');
    expect(host.querySelector('[aria-label="Identity groups"]')).toBeNull();
    await click(tab(host,'online'));
    await settle();
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({kind:'performers',scope:'online',category:'all'}),{replace:false});
    await click(tab(host,'performers'));
    await settle();
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({kind:'performers',scope:'local',category:'all'}),{replace:false});
    expect(indexRoute({kind:'creators',q:'',scope:'local',view:'alphabet',category:'animation'})).toMatchObject({kind:'performers',category:'animation'});
  });
  it('The performer roster keeps real account avatars and profile page entries', async () => {
    seed(indexKey('performers',''),[person('Real account',{entity_kind:'creator',identity_labels:['Adult web creators']})],false,{blogger:1});
    const given = props();
    const host = await open(given);
    expect(given.personAvatar).toHaveBeenCalledWith(expect.objectContaining({k:'Real account'}),'creator',true);
    await click(cells(host)[0]);
    expect(given.openEntity).toHaveBeenCalledWith('creator','Real account');
    expect(host.querySelector('[aria-label="Identity groups"]')?.textContent).toBe('AllAdult web creators');
  });
  it('The first screen reads cache with plus-signed counts; the large-image layout takes avatars at large cells', async () => {
    seed(indexKey('performers', ''), [person('Alpha'), person('Beta')], true);
    const given = props();
    const host = await open(given);
    expect(cells(host)).toHaveLength(2);
    expect(host.querySelector('[data-index-count]')?.textContent).toBe('2+ items');
    expect(given.personAvatar).toHaveBeenCalledWith(expect.objectContaining({ k: 'Alpha' }), 'performer', true);
    await click(cells(host)[0]);
    expect(given.openEntity).toHaveBeenCalledWith('performer', 'Alpha');
  });

  it('Counts under cells carry units with thousands separators, and header readings group digits the same way', async () => {
    seed(indexKey('performers', ''), [person('Alpha', { n: 128400 }), person('Beta', { n: 0 })]);
    const host = await open(props());
    expect(cells(host)[0]?.textContent).toContain('128,400 videos');
    expect(cells(host)[1]?.textContent).toContain('0 videos');
  });

  it('Without a roster reading the header never writes "0 items", and the empty state pairs with an error glyph', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'Cannot be read' }) })));
    const host = await open(props());
    await settle();
    expect(host.textContent).toContain('ArtistsArtistsSellersOnlineAllCould not read ArtistsThe Peach service failed to handle the request. Try again; if it keeps failing, check the tray logs.Retry nowLoading the index                        ');
    expect(host.querySelector('[data-index-count]')?.textContent ?? '').toBe('');
    expect(host.textContent).not.toContain('0 items');
  });

  it('Truncated tag names in the alphabet show their full name on hover', async () => {
    const long = 'A very long Japanese tag name that continues here and gets truncated partway';
    seed(indexKey('tags', '', 'all'), [tag(long)]);
    const host = await open(props({ kind: 'tags' }));
    expect(alphaTag(host, long)?.getAttribute('title')).toBe(long);
  });

  it('Switching layout writes the preference back, fetches avatars by circle, and re-measures the images that have already loaded', async () => {
    seed(indexKey('performers', ''), [person('Alpha')]);
    const given = props();
    const host = await open(given);
    vi.mocked(refitNativeImages).mockClear();
    await click(host.querySelector('[data-index-layout] input[value="compact"]'));
    expect(given.savePreference).toHaveBeenCalledWith({ layout: 'compact' });
    expect(given.personAvatar).toHaveBeenLastCalledWith(expect.objectContaining({ k: 'Alpha' }), 'performer', false);
    expect(refitNativeImages).toHaveBeenCalledTimes(1);
  });

  it('"Load more" fetches the next page: it greys out and reports busy on the way, and collapses after fetching if there is no next page', async () => {
    seed(indexKey('performers', ''), [person('Alpha')], true);
    const next = pending<unknown>();
    const fetcher = serve(() => next.answer);
    const host = await open(props());
    const more = host.querySelector<HTMLButtonElement>('[data-index-more]')!;
    await click(more);
    expect(more.disabled).toBe(true);
    expect(more.getAttribute('aria-busy')).toBe('true');
    expect(urls(fetcher)[0]).toContain('offset=1');
    await next.release({ items: [person('Beta')], has_more: false });
    await settle();
    expect(cells(host)).toHaveLength(2);
    expect(host.querySelector('[data-index-more]')).toBeNull();
  });

  it('Label and agency are two separate routes; the agency count counts people', async () => {
    seed(indexKey('studios', ''), [person('S1')]);
    const fetcher = serve(() => ({ items: [person('T-POWERS', { members: 13 })], has_more: false }));
    const given = props({ kind: 'studios' });
    const host = await open(given);
    await click(tab(host, 'agencies'));
    await settle();
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'agencies' }), { replace: false });
    expect(urls(fetcher)[0]).toContain('kind=agencies');
    expect(host.querySelector('[data-index-title]')?.textContent).toBe('Agency');
    expect(cells(host)[0]?.textContent).toContain('13 people');
  });

  it('Switching artists to the online roster: selection mode exits first, and unarchived entries open into the follows page', async () => {
    seed(indexKey('performers', ''), [person('Alpha')]);
    const alice = { k: 'Alice', key: 'x:alice', n: 4, entity_id: null, held_by: '', avatar: '', avatar_fallback: '', providers: [] };
    seed(onlineAuthorsKey(''), [alice]);
    // On tier change the cached copy is already stale, so the background re-asks once anyway.
    const fetcher = serve(() => ({ items: [alice], has_more: false }));
    const given = props();
    const host = await open(given);
    await click(tab(host, 'online'));
    await settle();
    expect(given.exitSelectMode).toHaveBeenCalledTimes(1);
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'online' }), { replace: false });
    expect(urls(fetcher)[0]).toContain('/api/follow/authors?');
    const cell = host.querySelector('[data-follow-author="x:alice"]');
    expect(cell?.textContent).toContain('4 updates');
    await click(cell);
    expect(given.openFollowAuthor).toHaveBeenCalledWith('x:alice');
    expect(given.openEntity).not.toHaveBeenCalled();
  });

  it('Roster entries with an archived profile go to the creator profile page; same-name pending confirmation counts carry "Pending confirmation" and go to the profile of that person in the database', async () => {
    const bound = { k: 'Jul3D', key: 'entity:9', n: 3, entity_id: 9, held_by: '', avatar: '', avatar_fallback: '', providers: [] };
    const held = { k: 'InitialA', key: 'name:initiala', n: 8, entity_id: null, held_by: 'InitialA',
      avatar: '', avatar_fallback: '', providers: [] };
    seed(indexKey('performers', ''), [person('Alpha')]);
    seed(onlineAuthorsKey(''), [bound, held]);
    serve(() => ({ items: [bound, held], has_more: false }));
    const given = props();
    const host = await open(given);
    await click(tab(host, 'online'));
    await settle();
    await click(host.querySelector('[data-follow-author="entity:9"]'));
    expect(given.openEntity).toHaveBeenLastCalledWith('creator', 'Jul3D');
    const pending = host.querySelector('[data-follow-author="name:initiala"]');
    expect(pending?.textContent).toContain('BInitialA8 updates · pending confirmation');
    await click(pending);
    expect(given.openEntity).toHaveBeenLastCalledWith('creator', 'InitialA');
    expect(given.openFollowAuthor).not.toHaveBeenCalled();
  });
});

describe('Filter box', () => {
  it('Query only after 300ms idle, rewriting the URL along the way; the previous results stay until new ones arrive, and the input is not replaced', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    seed(indexKey('performers', ''), [person('Alpha'), person('Beta')]);
    const answer = pending<unknown>();
    const fetcher = serve(() => answer.answer);
    const given = props();
    const host = await open(given);
    const input = search(host);
    await type(input, 'Alpha');
    expect(given.route).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(300) });
    expect(given.route).toHaveBeenCalledWith(expect.objectContaining({ q: 'Alpha' }), { replace: true });
    expect(urls(fetcher)[0]).toContain('/api/index?kind=performers&limit=120&offset=0&q=Alpha');
    // This query is still in flight; the previous list keeps its size but becomes non-interactive, and the change region shows a busy state.
    expect(cells(host)).toHaveLength(2);
    expect(host.querySelector('[data-index-body] [aria-busy="true"]')).not.toBeNull();
    expect(host.querySelector('[data-index-body] [data-content-current]')?.hasAttribute('inert')).toBe(true);
    await answer.release({ items: [person('Alpha')], has_more: false });
    await settle();
    expect(cells(host)).toHaveLength(1);
    expect(host.querySelector('[data-index-body] [aria-busy="true"]')).toBeNull();
    expect(search(host)).toBe(input);
  });

  it('Enter searches on the spot; both input and Enter during IME composition pass through', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    seed(indexKey('performers', ''), [person('Alpha')]);
    serve(() => ({ items: [], has_more: false }));
    const given = props();
    const host = await open(given);
    const input = search(host);
    await act(async () => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })) });
    await type(input, 'zhon');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
      vi.advanceTimersByTime(300);
    });
    expect(given.route).not.toHaveBeenCalled();
    await type(input, 'medium');
    await act(async () => { input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })) });
    await act(async () => { vi.advanceTimersByTime(300) });
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'medium' }), { replace: true });
    await type(input, 'Chinese');
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) });
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Chinese' }), { replace: true });
  });
});

describe('Tags', () => {
  for (const scope of ['local', 'online'] as const) for (const view of ['alphabet', 'cloud'] as const) {
    it(`${scope} ${view} browsing uses current names and offers editing only in manage mode`, async () => {
      const row = { ...tag('Glasses', 'appearance'), entity_id: 4472, id: 'glasses', aliases: ['Glasses'], hidden: false };
      seed(indexKey('tags', '', 'all'), [row]);
      seed(onlineTagsKey('', 'all'), [row]);
      serve(() => ({ items: [row], total:1, categories:{ appearance:1 }, duplicate_groups: [], favorites: [], filters: [], has_more: false }));
      const host = await open(props({ kind: 'tags', scope, view }));
      await settle();
      expect(host.querySelector('[data-alpha-tag], [data-tag-chip]')?.textContent).toContain('Glasses');
      expect(host.querySelector('[data-alpha-tag], [data-tag-chip]')?.textContent).not.toContain('Glasses2');
      expect(host.querySelector('[aria-label="Favorite Glasses"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Edit tag Glasses"]')).toBeNull();
      expect(host.querySelector('[data-tag-mode] use')?.getAttribute('href')).toBe('#i-pencil');
      await click(host.querySelector('[aria-label="Manage tags"]'));
      await settle();
      expect(host.querySelector('[data-tag-manager] [aria-label="Edit tag Glasses"]')).not.toBeNull();
      await click(host.querySelector('[aria-label="Back to tag browsing"]'));
      expect(host.querySelector('[aria-label="Edit tag Glasses"]')).toBeNull();
    });
  }

  it('The overlay lists only types with data, and clicking one writes the address back', async () => {
    seed(indexKey('tags', '', 'all'), [tag('Nympho'), tag('Secretary OL', 'scene')], false, { role: 1, scene: 1 });
    serve(() => ({ items: [tag('Nympho')], has_more: false, categories: { role: 1 } }));
    const given = props({ kind: 'tags' });
    const host = await open(given);
    const pills = [...host.querySelectorAll('[data-tag-pill]')].map((pill) => pill.textContent);
    expect(pills).toEqual(['All', 'Character roles', 'Settings and places']);
    await click([...host.querySelectorAll('[data-tag-pill]')][1]);
    expect(given.route).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'role' }), { replace: false });
  });

  it('Outside selection mode, tapping one returns to the catalog and filters by that one only', async () => {
    seed(indexKey('tags', '', 'all'), [tag('Nympho')]);
    const given = props({ kind: 'tags' });
    const host = await open(given);
    await click(alphaTag(host, 'Nympho'));
    expect(given.showTags).toHaveBeenCalledWith(['Nympho'], 'all');
  });

  it('In selection mode, clicking, broad match, and "Show results" only affect this screen; when the shell closes the selection key the selection clears with it', async () => {
    seed(indexKey('tags', '', 'all'), [tag('Nympho'), tag('Secretary OL')]);
    const given = props({ kind: 'tags' }, { selectMode: true });
    const host = await open(given);
    expect(host.querySelector('[aria-label="Selected tags actions"]')).toBeNull();
    await click(alphaTag(host, 'Nympho'));
    await click(alphaTag(host, 'Secretary OL'));
    expect(alphaTag(host, 'Nympho')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).toContain('Selected 2 tags');
    // Broad matching is on by default; turning it off means "must contain all terms".
    await click(host.querySelector('[aria-label="Selected tag actions"] input[type="checkbox"]'));
    await click(buttonNamed('Show results', host));
    expect(given.showTags).toHaveBeenCalledWith(['Nympho', 'Secretary OL'], 'all');
    expect(given.route).not.toHaveBeenCalled();

    await click(alphaTag(host, 'Nympho'));
    expect(host.textContent).toContain('Selected 1 tag');
    await act(async () => setSelectMode(false));
    await act(async () => setSelectMode(true));
    expect(alphaTag(host, 'Nympho')?.getAttribute('aria-pressed')).toBe('false');
    expect(host.textContent).not.toContain('Selected');
  });

  it('Switching to the online vocabulary shows the alphabet directly, opening into the follows page', async () => {
    seed(indexKey('tags', '', 'all'), [tag('Nympho')]);
    seed(onlineTagsKey('', 'all'), [tag('long_hair', 'general')]);
    const fetcher = serve(() => ({ items: [tag('long_hair', 'general')], has_more: false }));
    const given = props({ kind: 'tags', view: 'cloud' }, { selectMode: true });
    const host = await open(given);
    expect(host.querySelector('[data-tag-cloud]')).not.toBeNull();
    await click(tab(host, 'online'));
    await settle();
    expect(given.route).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'online', view: 'alphabet', category: 'all' }), { replace: false });
    expect(urls(fetcher)[0]).toContain('/api/follow/tags?types=all');
    await click(alphaTag(host, 'long_hair'));
    expect(given.openFollowTag).toHaveBeenCalledWith('long_hair');
    expect(given.showTags).not.toHaveBeenCalled();
    // Multi-select is local catalog semantics; the online side gets no action bar.
    expect(host.querySelector('[aria-label="Selected tags actions"]')).toBeNull();
  });
});
