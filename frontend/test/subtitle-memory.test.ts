/* The ordering of subtitle restoration and the user's new choice, independent of the browser decoder. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubtitleSession } from '../src/player/subtitle-memory';
import type { VjsPlayer } from '../src/player/types';
import { mountPlaybackRate, playerMemory } from '../src/player/memory';
import { mountPlayerRotation } from '../src/player/rotation';
import { mountCaptionStyle } from '../src/player/subtitle-style';

function mounted() {
  const video = document.createElement('video'), events = new EventTarget();
  const tracks = Object.assign([] as TextTrack[], {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  Object.defineProperty(video, 'textTracks', { value: tracks });
  const disposing: (() => void)[] = [];
  const root = document.createElement('div'); root.innerHTML = '<media-container></media-container>';
  let rate = 1;
  const player = { peachItem: { id: 1 }, on: (_event: string, callback: () => void) => disposing.push(callback),
    el: () => root, playbackRate: (next?: number) => next === undefined ? rate : (rate = next),
    isDisposed: () => false } as unknown as VjsPlayer;
  return { video, tracks, player,
    add: (id: string) => {
      const track = Object.assign(new EventTarget(), { id, kind: 'subtitles', label: id, language: 'zh', mode: 'disabled' }) as TextTrack;
      tracks.push(track); events.dispatchEvent(new Event('addtrack')); return track;
    }, dispose: () => disposing.forEach(callback => callback()) };
}
afterEach(() => vi.unstubAllGlobals());

describe('Unified playback file memory', () => {
  const observer = () => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  it('Subtitles, rotation, playback speed, and appearance share one read; after the player closes a new session restores them', async () => {
    observer();
    let saved = { selected: 'sidecar:2', tracks: [], rotation: 270, rate: 1.75, caption_style: { size: '150' } };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') saved = { ...saved, ...JSON.parse(String(init.body)) };
      return new Response(JSON.stringify(saved));
    });
    vi.stubGlobal('fetch', fetcher);
    const view = mounted(), memory = playerMemory(view.player);
    const rotation = mountPlayerRotation(view.player, view.video);
    const setRate = mountPlaybackRate(view.player, view.video);
    const cleanup = new AbortController();
    const style = mountCaptionStyle(view.player.el(), view.video, cleanup.signal, memory);
    const subtitles = new SubtitleSession(view.player, view.video);
    await subtitles.ready;
    expect(fetcher).toHaveBeenCalledOnce();
    expect(rotation.angle()).toBe(270); expect(view.player.playbackRate()).toBe(1.75);
    expect(view.video.defaultPlaybackRate).toBe(1.75);
    expect(style.current().size).toBe('150'); expect(view.add('sidecar:2').mode).toBe('showing');
    rotation.set(90); setRate.set(2); style.set('size', '200'); subtitles.select(null);
    view.video.playbackRate = view.video.defaultPlaybackRate;
    view.video.dispatchEvent(new Event('loadedmetadata'));
    expect(setRate.current()).toBe(2); expect(view.video.defaultPlaybackRate).toBe(2);
    await flush(); view.dispose(); cleanup.abort();
    const reopened = mounted();
    const restored = mountPlayerRotation(reopened.player, reopened.video);
    mountPlaybackRate(reopened.player, reopened.video);
    await playerMemory(reopened.player).load(); await flush();
    expect(restored.angle()).toBe(90); expect(reopened.player.playbackRate()).toBe(2);
    expect(saved.selected).toBeNull(); expect(saved.caption_style.size).toBe('200');
    reopened.dispose();
  });

  it('Editing settings while a read runs: late records restore only fields not yet touched', async () => {
    observer();
    let loaded!: (response: Response) => void;
    const response = new Promise<Response>(resolve => { loaded = resolve });
    const writes: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { writes.push(JSON.parse(String(init.body))); return new Response('{}') }
      return response;
    }));
    const view = mounted(), memory = playerMemory(view.player);
    const rotation = mountPlayerRotation(view.player, view.video), rate = mountPlaybackRate(view.player, view.video);
    const cleanup = new AbortController();
    const style = mountCaptionStyle(view.player.el(), view.video, cleanup.signal, memory);
    await Promise.resolve();
    rotation.set(180); rate.set(1.25); style.set('size', '200');
    loaded(new Response(JSON.stringify({ selected: null, tracks: [], rotation: 90, rate: 2,
      caption_style: { size: '150', color: 'yellow' } })));
    await memory.load(); await flush();
    expect(rotation.angle()).toBe(180); expect(view.player.playbackRate()).toBe(1.25);
    expect(style.current()).toMatchObject({ size: '200', color: 'yellow' });
    expect(writes).toEqual([{ rotation: 180 }, { rate: 1.25 }, { caption_style: { size: '200' } }]);
    view.dispose(); cleanup.abort();
  });

  it('Failed fields can retry; other settings do not overwrite unsaved values', async () => {
    const writes: unknown[] = [];
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'PUT') return new Response('{"selected":null,"tracks":[]}');
      writes.push(JSON.parse(String(init.body)));
      return fail ? new Response('{"error":"disk not writable"}', { status: 503 }) : new Response('{}');
    }));
    const view = mounted(), memory = playerMemory(view.player);
    await expect(memory.save({ rotation: 90 })).rejects.toThrow('Disk not writable');
    fail = false;
    await memory.save({ rate: 2 });
    expect(writes).toEqual([{ rotation: 90 }, { rotation: 90, rate: 2 }]);
    expect(memory.error).toBe(''); view.dispose();
  });
});

describe('Subtitle selection per video', () => {
  it('The registered track choice restores through subtitle aliases', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ selected: 'sidecar:2', tracks: [] }))));
    const view = mounted(), session = new SubtitleSession(view.player, view.video);
    await session.ready;
    const track = view.add('sidecar:local:stable');
    const node = document.createElement('track'); node.dataset.subtitleAlias = 'sidecar:2';
    Object.defineProperty(node, 'track', { value: track }); view.video.append(node);
    view.video.dispatchEvent(new Event('loadedmetadata'));
    expect(track.mode).toBe('showing');
    view.dispose();
  });

  it('Late sidecar tracks are restored by identity; list order plays no part in selection', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ selected: 'sidecar:2', tracks: [] })));
    vi.stubGlobal('fetch', fetcher);
    const view = mounted(), session = new SubtitleSession(view.player, view.video);
    await session.ready;
    const second = view.add('sidecar:2'), first = view.add('sidecar:1');
    expect(second.mode).toBe('showing'); expect(first.mode).toBe('disabled');
    expect(fetcher).toHaveBeenCalledOnce();
    view.dispose();
  });

  it('Choosing off while memory is being read: neither a late response nor the track can re-enable subtitles', async () => {
    let loaded!: (response: Response) => void;
    const response = new Promise<Response>(resolve => { loaded = resolve });
    const writes: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { writes.push(JSON.parse(String(init.body))); return new Response('{}') }
      return response;
    }));
    const view = mounted(), session = new SubtitleSession(view.player, view.video);
    await Promise.resolve();
    session.select(null);
    loaded(new Response(JSON.stringify({ selected: 'sidecar:2', tracks: [] })));
    await session.ready;
    const track = view.add('sidecar:2');
    expect(track.mode).toBe('disabled');
    expect(writes).toEqual([{ selected: null }]);
    view.dispose();
  });
});
