/* Playlists page: first-screen refetch, three write operations and undo, the shell-requested refetch, card destinations, and hover paging.
 *
 * Write operations go through a fake fetch, recording every request by address and method; delete's confirm modal belongs to the legacy layer, and this clicks confirm on the user's behalf.
 * Destinations (queue, profile page) and receipts are handed back to the shell via props; here we only watch what the page hands out. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import type { PlaylistsProps } from '../../src/react/bundle';
import {
  PLAYLISTS_KEY, prefetchPlaylists, type PlaylistDetail, type PlaylistRow,
} from '../../src/react/playlists/playlists';
import { PlaylistsPage } from '../../src/react/playlists/playlists-page';
import { queryClient } from '../../src/react/query';
import { buttonNamed, click, mount, settle, submit, type } from './render';

afterEach(() => { queryClient.clear() });
notifyManager.setScheduler((notify) => notify());

const row = (id: number, patch: Partial<PlaylistRow> = {}): PlaylistRow => ({
  id, name: `List ${id}`, source_kind: 'manual', source_seed_asset_id: null, current_asset_id: null,
  created_at: '2026-09-01 10:00:00', updated_at: '2026-09-01 10:00:00', item_count: 2,
  preview_asset_id: 11, preview_ids: [11, 12], faces: [], ...patch,
});

type Call = { url: string; method: string; body: unknown };
type Answer = { status?: number; body: unknown };

/** A fake fetch answering by "method and address"; unregistered addresses return an empty list. */
function serve(routes: Record<string, Answer | ((body: unknown) => Answer)> = {}) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    const route = routes[`${method} ${url}`];
    const answer = typeof route === 'function' ? route(body) : route ?? { body: { items: [] } };
    const status = answer.status ?? 200;
    return { ok: status < 400, status, json: async () => answer.body };
  });
  vi.stubGlobal('fetch', fetcher);
  return {
    calls,
    posts: () => calls.filter((call) => call.method === 'POST').map((call) => call.body),
    reads: () => calls.filter((call) => call.method === 'GET' && call.url === '/api/playlists').length,
  };
}

const written = (id: number, name = `List ${id}`) => ({ body: { ok: true, playlist: { id, name, items: [] } } });

function props(patch: Partial<PlaylistsProps> = {}): PlaylistsProps {
  return {
    openPlaylist: vi.fn(), openEntity: vi.fn(),
    canFlip: () => true, toast: vi.fn(), revision: 0, ...patch,
  };
}

let bump: () => void = () => {};
/** The refresh epoch pushed in by the shell via `updateManagedRoute`, replaced here with one layer of state. */
function Shell(given: PlaylistsProps) {
  const [revision, setRevision] = useState(given.revision ?? 0);
  bump = () => setRevision((now) => now + 1);
  return <PlaylistsPage {...given} revision={revision} />;
}

function open(items: PlaylistRow[], given = props()) {
  queryClient.setQueryData(PLAYLISTS_KEY, { items });
  return mount(<QueryClientProvider client={queryClient}><Shell {...given} /></QueryClientProvider>);
}

const card = (host: ParentNode, id: number) => host.querySelector(`[data-playlist-card="${id}"]`)!;
const createInput = (host: ParentNode) => host.querySelector<HTMLInputElement>('[data-playlist-create] input')!;
const undoOf = (toast: PlaylistsProps['toast'], index = 0) =>
  vi.mocked(toast).mock.calls[index]?.[1]?.undo as () => Promise<void>;

async function menuAction(host: ParentNode, id: number, label: string) {
  await click(card(host, id).querySelector('[data-playlist-menu]'));
  await click(buttonNamed(label));
}

type Confirmation = Parameters<typeof legacyUi.confirmModal>[0];
function confirmYes() {
  const seen: Confirmation[] = [];
  vi.spyOn(legacyUi, 'confirmModal').mockImplementation((async (options: Confirmation) => {
    seen.push(options);
    await options.onConfirm?.();
    return { confirmed: true };
  }) as typeof legacyUi.confirmModal);
  return seen;
}

describe('First screen', () => {
  it('It refetches even when the cache holds the previous list: a Mix just saved on the home page must be visible', async () => {
    queryClient.setQueryData(PLAYLISTS_KEY, { items: [row(1)] });
    const server = serve({ 'GET /api/playlists': { body: { items: [row(1), row(2)] } } });
    await prefetchPlaylists(new AbortController().signal);
    expect(server.reads()).toBe(1);
    expect(queryClient.getQueryData<{ items: PlaylistRow[] }>(PLAYLISTS_KEY)?.items).toHaveLength(2);
  });

  it('On load failure the header and create box remain, with the reason and retry button where the list would be; the list renders once the retry succeeds', async () => {
    let fail = true;
    serve({ 'GET /api/playlists': () => (fail ? { status: 500, body: { error: 'The database is locked' } } : { body: { items: [row(1)] } }) });
    const host = await mount(<QueryClientProvider client={queryClient}><Shell {...props()} /></QueryClientProvider>);
    await settle();
    expect(host.querySelector('h2')?.textContent).toBe('Playlists');
    expect(host.querySelector('[data-playlist-create]')).not.toBeNull();
    const note = host.querySelector('[data-media-error]')!;
    expect(note.textContent).toContain('The operation did not finish; please retry. If it keeps failing, check the tray log.');
    fail = false;
    await click(note.querySelector('[data-note-action]'));
    await settle();
    expect(card(host, 1)).not.toBeNull();
    expect(host.querySelector('[data-media-error]')).toBeNull();
  });

  it('With no lists the whole page is an empty state using the playlist glyph', async () => {
    const host = await open([]);
    const empty = host.querySelector('[data-empty-state]')!;
    expect(empty.querySelector('h3')?.textContent).toBe('No playlists yet');
    expect(empty.querySelector('use')?.getAttribute('href')).toBe('#i-playlist');
    expect(host.querySelector('[data-playlist-grid]')).toBeNull();
  });
});

describe('Cards', () => {
  it('Whitespace-only names render "Untitled playlist" in title and accessible name', async () => {
    const host = await open([row(1, { name: '   ' })]);
    expect(card(host, 1).textContent).toContain('Untitled playlist');
    expect(card(host, 1).querySelector('[data-mix-open]')?.getAttribute('aria-label')).toBe('Open playlist Untitled playlist');
  });

  it('Badges over 1000 use thousands separators', async () => {
    const host = await open([row(1, { item_count: 98765 })]);
    expect(card(host, 1).querySelector('[data-mix-badge]')?.textContent).toBe('98,765 videos');
  });

  it('Source, item count, and cover render per row; clicking the cover resumes from the playback position', async () => {
    const given = props();
    const host = await open([row(1, { source_kind: 'mix', current_asset_id: 12, item_count: 3 }), row(2)], given);
    const mix = card(host, 1);
    expect(mix.textContent).toContain('Saved by Mix');
    expect(card(host, 2).textContent).toContain('Manual playlists');
    expect(mix.querySelector('[data-mix-badge]')?.textContent).toBe('3 videos');
    expect(mix.querySelector('[data-mix-poster]')?.getAttribute('src')).toBe('/poster?id=11&c=4');
    const opener = mix.querySelector<HTMLButtonElement>('[data-mix-open]')!;
    expect(opener.getAttribute('aria-label')).toBe('Open playlist List 1');
    await click(opener);
    expect(given.openPlaylist).toHaveBeenCalledWith(1, 12);
    await click(card(host, 2).querySelector('[data-mix-open]'));
    expect(given.openPlaylist).toHaveBeenLastCalledWith(2, 11);
  });

  it('Empty lists have no destination: the click area is inert and the cover reads "No preview"', async () => {
    const given = props();
    const host = await open([row(3, { item_count: 0, preview_asset_id: null, preview_ids: [] })], given);
    const opener = card(host, 3).querySelector<HTMLButtonElement>('[data-mix-open]')!;
    expect(opener.disabled).toBe(true);
    expect(card(host, 3).querySelector('[data-mix-cover]')?.textContent).toContain('No preview');
    await click(opener);
    expect(given.openPlaylist).not.toHaveBeenCalled();
  });

  it('Avatars each lead to a profile; with no person the title\'s initial paints', async () => {
    const given = props();
    const faces = [{ kind: 'performer', id: 7, name: 'Alpha', has_image: false }];
    const host = await open([row(1, { faces }), row(2, { name: 'Weekend slow watch' })], given);
    const avatar = card(host, 1).querySelector<HTMLButtonElement>('[data-mix-avatars] button')!;
    expect(avatar.getAttribute('aria-label')).toBe('Open profile: Alpha');
    expect(avatar.innerHTML).toBe('<span class="ini">A</span>');
    await click(avatar);
    expect(given.openEntity).toHaveBeenCalledWith('performer', 'Alpha');
    expect(card(host, 2).querySelector('[data-mix-initial]')?.textContent).toBe('W');
  });
});

describe('New', () => {
  it('Creating with only a name makes an empty list; on success the input clears, the list refetches, and undo deletes the one just created', async () => {
    const server = serve({ 'POST /api/playlist': (body) => ((body as { action: string }).action === 'create'
      ? written(9, 'New list') : { body: { ok: true, deleted: 9 } }) });
    const given = props();
    const host = await open([], given);
    await type(createInput(host), 'New list');
    await submit(host.querySelector('[data-playlist-create]'));
    await settle();
    expect(server.posts()).toEqual([{ action: 'create', name: 'New list', asset_ids: [] }]);
    expect(createInput(host).value).toBe('');
    expect(server.reads()).toBe(1);
    expect(given.toast).toHaveBeenCalledWith('Playlist created', { undo: expect.any(Function) });
    await act(async () => { await undoOf(given.toast)() });
    await settle();
    expect(server.posts()[1]).toEqual({ action: 'delete', id: 9 });
    expect(server.reads()).toBe(2);
  });

  it('An empty name sends no request, with the reason under the input', async () => {
    const server = serve();
    const host = await open([]);
    await type(createInput(host), '   ');
    await submit(host.querySelector('[data-playlist-create]'));
    expect(server.calls).toHaveLength(0);
    expect(createInput(host).getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('[data-playlist-create]')?.textContent).toContain('The playlist name cannot be empty');
  });

  it('When the server rejects, the reason stays in place and the name in the input is not lost', async () => {
    serve({ 'POST /api/playlist': { status: 409, body: { error: 'A playlist with that name already exists' } } });
    const given = props();
    const host = await open([], given);
    await type(createInput(host), 'Duplicate name');
    await submit(host.querySelector('[data-playlist-create]'));
    await settle();
    expect(host.querySelector('[data-playlist-create]')?.textContent).toContain('New playlistA playlist with that name already existsNew');
    expect(createInput(host).value).toBe('Duplicate name');
    expect(given.toast).not.toHaveBeenCalled();
  });
});

describe('Rename', () => {
  it('The menu\'s "Edit name" opens the popover, saving refetches, and undo restores the original name', async () => {
    const server = serve({ 'POST /api/playlist': written(1) });
    const given = props();
    const host = await open([row(1)], given);
    await menuAction(host, 1, 'Edit name');
    const form = document.querySelector('[data-playlist-rename]')!;
    const input = form.querySelector('input')!;
    expect(input.value).toBe('List 1');
    await type(input, 'Edited name');
    await submit(form);
    await settle();
    expect(server.posts()).toEqual([{ action: 'rename', id: 1, name: 'Edited name' }]);
    expect(document.querySelector('[data-playlist-rename]')).toBeNull();
    expect(given.toast).toHaveBeenCalledWith('Renamed the playlist', { undo: expect.any(Function) });
    await act(async () => { await undoOf(given.toast)() });
    await settle();
    expect(server.posts()[1]).toEqual({ action: 'rename', id: 1, name: 'List 1' });
    expect(server.reads()).toBe(2);
  });

  it('The failure reason writes in the popover and the popover stays open', async () => {
    serve({ 'POST /api/playlist': { status: 409, body: { error: 'A playlist with that name already exists' } } });
    const host = await open([row(1)]);
    await menuAction(host, 1, 'Edit name');
    const form = document.querySelector('[data-playlist-rename]')!;
    await type(form.querySelector('input'), 'Duplicate name');
    await submit(form);
    await settle();
    expect(document.querySelector('[data-playlist-rename]')?.textContent).toContain('Edit nameNameA playlist with that name already existsCancelSave name');
  });
});

describe('Delete', () => {
  const kept = (patch: Partial<PlaylistDetail> = {}): PlaylistDetail => ({
    id: 1, name: 'List 1', source_kind: 'mix', source_seed_asset_id: 12, current_asset_id: 12,
    items: [{ id: 11 }, { id: 12 }], ...patch,
  });

  it('Confirmation comes first and content is fetched before deletion; undo rebuilds one from the original content and source', async () => {
    const seen = confirmYes();
    const server = serve({
      'GET /api/playlist?id=1': { body: kept() },
      'POST /api/playlist': (body) => ((body as { action: string }).action === 'delete'
        ? { body: { ok: true, deleted: 1 } } : written(5)),
    });
    const given = props();
    const host = await open([row(1, { source_kind: 'mix' })], given);
    await menuAction(host, 1, 'Delete playlist');
    await settle();
    expect(seen[0]).toMatchObject({ title: 'Delete playlist', confirmLabel: 'Delete playlist', danger: true });
    const order = server.calls.map((call) => `${call.method} ${call.url}`);
    expect(order.indexOf('GET /api/playlist?id=1')).toBeLessThan(order.indexOf('POST /api/playlist'));
    expect(server.posts()[0]).toEqual({ action: 'delete', id: 1 });
    expect(given.toast).toHaveBeenCalledWith('Playlist deleted', { undo: expect.any(Function) });
    await act(async () => { await undoOf(given.toast)() });
    await settle();
    expect(server.posts()[1]).toEqual({
      action: 'create', name: 'List 1', asset_ids: [11, 12], source_kind: 'mix', source_seed_asset_id: 12,
    });
    expect(server.reads()).toBe(2);
  });

  it('When the Mix seed has left the list the rebuild carries no seed', async () => {
    confirmYes();
    const server = serve({
      'GET /api/playlist?id=1': { body: kept({ source_seed_asset_id: 99 }) },
      'POST /api/playlist': { body: { ok: true, deleted: 1 } },
    });
    const given = props();
    const host = await open([row(1)], given);
    await menuAction(host, 1, 'Delete playlist');
    await settle();
    await act(async () => { await undoOf(given.toast)() });
    expect(server.posts()[1]).toMatchObject({ action: 'create', source_seed_asset_id: null });
  });

  it('Unfetchable content still deletes, but offers no undo', async () => {
    confirmYes();
    serve({
      'GET /api/playlist?id=1': { status: 500, body: { error: 'Load failed' } },
      'POST /api/playlist': { body: { ok: true, deleted: 1 } },
    });
    const given = props();
    const host = await open([row(1)], given);
    await menuAction(host, 1, 'Delete playlist');
    await settle();
    expect(given.toast).toHaveBeenCalledWith('Playlist deleted', undefined);
  });
});

describe('Shell asks to reload', () => {
  it('Each refresh generation bump refetches once; the first-frame generation is not refetched', async () => {
    const server = serve({ 'GET /api/playlists': { body: { items: [row(1), row(2)] } } });
    const host = await open([row(1)]);
    await settle();
    expect(server.reads()).toBe(0);
    await act(async () => bump());
    await settle();
    expect(server.reads()).toBe(1);
    expect(host.querySelectorAll('[data-playlist-card]')).toHaveLength(2);
  });
});

/** jsdom does not decode images: setting `src` counts as loaded, with nonzero width. */
class LoadedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 16;
  set src(_url: string) { queueMicrotask(() => this.onload?.()) }
  decode() { return Promise.resolve() }
}

describe('Hover paging', () => {
  const hover = (el: Element) => act(async () => {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  });
  const leave = (el: Element) => act(async () => {
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  });
  const advance = async (ms: number) => {
    await act(async () => { vi.advanceTimersByTime(ms) });
    await settle();
  };
  const stateOf = (host: ParentNode) =>
    [...host.querySelectorAll('[data-mix-face]')].map((face) => face.getAttribute('data-mix-face'));

  it('Waits 340ms before starting, flips the first one at 420ms, then one image every 1100ms; leaving restores the static cover', async () => {
    vi.stubGlobal('Image', LoadedImage);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const host = await open([row(1, { preview_ids: [11, 12, 13] })]);
    const article = card(host, 1);
    const panel = article.querySelector<HTMLElement>('[data-mix-faces]')!;
    await hover(article);
    await advance(339);
    expect(panel.hidden).toBe(true);
    await advance(1);
    expect(panel.hidden).toBe(false);
    expect(stateOf(article)).toEqual(['on', '', '']);
    await advance(420);
    expect(stateOf(article)).toEqual(['off', 'on', '']);
    await advance(1100);
    expect(stateOf(article)).toEqual(['', 'off', 'on']);
    await leave(article);
    expect(panel.hidden).toBe(true);
    expect(article.querySelectorAll('[data-mix-face]')).toHaveLength(0);
  });

  it('When the shell says flipping is blocked (multi-select, overlays, reduced motion, scrolling) it never starts', async () => {
    vi.stubGlobal('Image', LoadedImage);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const host = await open([row(1, { preview_ids: [11, 12, 13] })], props({ canFlip: () => false }));
    await hover(card(host, 1));
    await advance(2000);
    expect(card(host, 1).querySelector<HTMLElement>('[data-mix-faces]')?.hidden).toBe(true);
  });

  it('No flip when only one image remains', async () => {
    vi.stubGlobal('Image', LoadedImage);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const host = await open([row(1, { preview_ids: [11] })]);
    await hover(card(host, 1));
    await advance(2000);
    expect(card(host, 1).querySelector<HTMLElement>('[data-mix-faces]')?.hidden).toBe(true);
  });
});
