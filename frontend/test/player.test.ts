/* The pieces of the player module (`src/player/`) that do not depend on real Video.js: source criteria, stream session cancellation, every cell of immersive mode, watch reporting,
 * loading readings, picture-in-picture's Media Session, and external subtitles. The side that mounts real Video.js lives in `e2e/stage.test.ts`. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountPlayerMediaSession, mountPlayerQualityControl, mountPlayerSubtitles } from '../src/player/controls';
import { configurePlayer, type PlayerHost } from '../src/player/host';
import { averageBitrate, bufferedAhead, fmtLoadRate, pushPlayerStat } from '../src/player/stats';
import {
  cancelDetailStream, detailStreamSource, detailStreamSession, directStreamSource, playableStreamSource,
} from '../src/player/stream';
import { mountPlayer } from '../src/player/detail-player';
import { beginPlayerGuidePreview } from '../src/player/guide-preview';
import { wireTelemetry } from '../src/player/telemetry';
import type { QualityLevel, QualityLevelList, VjsPlayer } from '../src/player/types';
import * as videojsLoader from '../src/player/videojs';
import { mountPlayerPipControl } from '../src/player/pip';

type FetchCall = { url: string; init: RequestInit | undefined };

function stubFetch(reply: (url: string) => unknown): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply(url) ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const host = (seekSeconds = 10): PlayerHost => ({
  settings: () => ({ ambientMode: false, theaterMode: false, seekSeconds, miniplayer: true, detailAutoplay: false, javImage: 'cover' }),
  saveSettings: () => {},
  toast: () => {},
  loadSourceStatus: async () => ({}),
  offlineReason: () => '',
  stage: () => null,
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('The player tour suppresses sources and autoplay; after it ends the saved playback preferences apply', async () => {
  const settings = { ...host().settings(), detailAutoplay: true };
  const saveSettings = vi.fn();
  configurePlayer({ ...host(), settings: () => settings, saveSettings });
  const sources = vi.fn(), play = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(videojsLoader, 'ensureVideojs').mockResolvedValue(vi.fn((video: HTMLVideoElement) => {
    const shell = document.createElement('div'); shell.append(video);
    let disposed = false;
    return {
      el: () => shell, on: () => {}, one: () => {}, ready: () => {},
      isDisposed: () => disposed, dispose: () => { disposed = true }, pause: () => {},
      src: sources, play, duration: () => 0, currentSource: () => ({}),
    } as unknown as VjsPlayer;
  }));
  const calls = stubFetch(() => ({ protocol: 'range', src: '/stream?id=42', mime_type: 'video/mp4' }));
  const finishGuide = beginPlayerGuidePreview();
  const releaseGuide = mountPlayer(document.createElement('video'), { kind: 'item', item: { id: 42 }, chrome: false });
  try {
    await flush(); await flush();
    expect(sources).not.toHaveBeenCalled(); expect(play).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  } finally { releaseGuide(); finishGuide() }
  const releaseNormal = mountPlayer(document.createElement('video'), { kind: 'item', item: { id: 42 }, chrome: false });
  try {
    await flush(); await flush();
    expect(sources).toHaveBeenCalled(); expect(play).toHaveBeenCalledOnce();
    expect(settings.detailAutoplay).toBe(true); expect(saveSettings).not.toHaveBeenCalled();
  } finally { releaseNormal(); configurePlayer(host()) }
});

describe('Source rules', () => {
  it('Saved online videos go through the follows entry proxy and never ask stream-plan', async () => {
    const calls = stubFetch(() => null);
    const source = await playableStreamSource({ id: 7, location: 'online', follow_item_id: 42 }, 's1');
    expect(source).toEqual({ src: '/follow-stream?id=42', type: 'video/mp4' });
    expect(calls).toEqual([]);
  });

  it('Serve transcode segments when the server asks; if the plan cannot be fetched, read directly with the session, and give webm its type by extension', async () => {
    stubFetch(() => ({ protocol: 'hls', src: '/stream/hls/3/index.m3u8' }));
    expect(await playableStreamSource({ id: 3 }, 's2'))
      .toEqual({ src: '/stream/hls/3/index.m3u8', type: 'application/vnd.apple.mpegurl' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }));
    expect(await playableStreamSource({ id: 3, name: 'a.WEBM' }, 's 2'))
      .toEqual({ src: '/stream?id=3&session=s%202', type: 'video/webm' });
    expect(directStreamSource({ id: 4 }, 'x').type).toBe('video/mp4');
  });

  it('The details path shares one session; canceling notifies the server per session and clears it', async () => {
    const calls = stubFetch(() => ({ cancelled: 1 }));
    await detailStreamSource({ id: 5 });
    const session = detailStreamSession();
    expect(session).not.toBe('');
    expect(calls[0]!.url).toBe(`/api/stream-plan?id=5&session=${encodeURIComponent(session)}`);
    cancelDetailStream();
    expect(detailStreamSession()).toBe('');
    const cancel = calls.at(-1)!;
    expect(cancel.url).toBe(`/api/stream-cancel?session=${encodeURIComponent(session)}`);
    expect(cancel.init).toMatchObject({ method: 'POST', keepalive: true });
    await flush(); await flush();
    expect(JSON.parse(document.documentElement.dataset.peachStreamCancel || 'null')).toEqual({ cancelled: 1 });
  });

  it('STRM file kinds use the server\'s playback plan', async () => {
    stubFetch(() => ({ protocol: 'range', src: '/stream?id=6', mime_type: 'video/webm' }));
    expect(await playableStreamSource({ id: 6, name: 'ABC-123.strm' }, 'strm'))
      .toEqual({ src: '/stream?id=6', type: 'video/webm' });
  });
});

describe('Watch reporting', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('Leaving details fires neither pause nor ended: emptied finishes the teardown and stops the clock', async () => {
    const calls = stubFetch(() => ({ real_ratio: .5 }));
    const video = document.createElement('video');
    wireTelemetry({ id: 9, duration: -1 }, video);
    video.onplay?.(new Event('play'));
    video.dispatchEvent(new Event('seeking'));
    vi.advanceTimersByTime(10_000);
    expect(calls.filter((call) => call.url === '/api/activity')).toHaveLength(1);
    video.dispatchEvent(new Event('emptied'));
    const settled = calls.length;
    vi.advanceTimersByTime(60_000);
    expect(calls).toHaveLength(settled);
  });

  it('Playback end fires ended once, then hands over to the caller for the next item; a -1 duration never draws a negative ratio', () => {
    const calls = stubFetch(() => null);
    const video = document.createElement('video');
    const ratio = document.createElement('span');
    ratio.id = 'ratioProbe';
    document.body.append(ratio);
    const onEnded = vi.fn();
    wireTelemetry({ id: 11, duration: -1 }, video, { ratio: '#ratioProbe', onEnded });
    expect(ratio.textContent).toBe('');
    video.onended?.(new Event('ended'));
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toMatchObject({ id: 11, ended: true, duration: 0 });
    expect(onEnded).toHaveBeenCalledOnce();
    ratio.remove();
  });
});

describe('Each cell of immersive mode', () => {
  /** A bookkeeping Video.js: it records which source was attached, and the one-time `error` listener is triggered by the test case. */
  function fakeVideojs() {
    const made: { sources: unknown[]; disposed: boolean; error?: () => void }[] = [];
    const factory = vi.fn((video: HTMLVideoElement) => {
      const record: (typeof made)[number] = { sources: [], disposed: false };
      made.push(record);
      const shell = document.createElement('div');
      const container = document.createElement('media-container'); container.append(video); shell.append(container);
      Object.defineProperty(video, 'textTracks', { value: Object.assign([], new EventTarget(), {
        addEventListener: () => {}, removeEventListener: () => {},
      }) });
      const disposing: (() => void)[] = [];
      return {
        on: (_event: string, handler: () => void) => { disposing.push(handler) },
        addRemoteTextTrack: () => {},
        src: (source: unknown) => { record.sources.push(source) },
        one: (_event: string, handler: () => void) => { record.error = handler },
        el: () => shell,
        isDisposed: () => record.disposed,
        pause: () => {},
        playbackRate: (next?: number) => next === undefined ? video.playbackRate : (video.playbackRate = next),
        dispose: () => { record.disposed = true; disposing.forEach(handler => handler()) },
      } as unknown as VjsPlayer;
    });
    vi.spyOn(videojsLoader, 'ensureVideojs').mockResolvedValue(factory);
    return { factory, made };
  }

  it('The stream is handed to the bare player per stream-plan, falling back to direct read on segment errors; tearing down the cell cancels by session and disposes the player', async () => {
    const calls = stubFetch((url) => url.startsWith('/api/player/memory') ? { selected: null, tracks: [] }
      : url.startsWith('/api/stream-plan') ? { protocol: 'hls', src: '/stream/hls/8/index.m3u8' } : { cancelled: 1 });
    const { factory, made } = fakeVideojs();
    const video = document.createElement('video');
    const onLoaded = vi.fn();
    const dispose = mountPlayer(video, { kind: 'immerse', item: { id: 8 }, session: 'imm-1', onLoaded });
    await flush(); await flush();
    expect(factory).toHaveBeenCalledWith(video, expect.objectContaining({ controls: false, controlBar: false }));
    expect(made[0]!.sources).toEqual([{ src: '/stream/hls/8/index.m3u8', type: 'application/vnd.apple.mpegurl' }]);
    expect(onLoaded).toHaveBeenCalledOnce();
    made[0]!.error!();
    expect(made[0]!.sources.at(-1)).toEqual({ src: '/stream?id=8&session=imm-1', type: 'video/mp4' });
    dispose();
    dispose();
    expect(made[0]!.disposed).toBe(true);
    const cancels = calls.filter((call) => call.url.startsWith('/api/stream-cancel'));
    expect(cancels.map((call) => call.url)).toEqual(['/api/stream-cancel?session=imm-1']);
  });

  it('Tearing down before the source resolves: no player mounts and no callbacks fire', async () => {
    stubFetch(() => ({ protocol: 'direct', src: '/stream?id=9' }));
    const { factory } = fakeVideojs();
    const onLoaded = vi.fn();
    const dispose = mountPlayer(document.createElement('video'), { kind: 'immerse', item: { id: 9 }, session: 'imm-2', onLoaded });
    dispose();
    await flush(); await flush();
    expect(factory).not.toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
  });
});

describe('Loading count', () => {
  const buffered = (ranges: [number, number][]) => ({
    length: ranges.length, start: (i: number) => ranges[i]![0], end: (i: number) => ranges[i]![1],
  });

  it('Buffer health counts only the segment at the play position; bitrate needs size and true duration to be computable', () => {
    const video = { currentTime: 12, buffered: buffered([[0, 5], [10, 30]]) } as unknown as HTMLVideoElement;
    expect(bufferedAhead(video)).toBe(18);
    expect(averageBitrate(1_000_000, 8)).toBe(1_000_000);
    expect(averageBitrate(1_000_000, -1)).toBe(0);
  });

  it('With unknown bitrate it reports how much longer playback can continue, not convertible metrics like "x realtime"', () => {
    expect(fmtLoadRate(0, 12.4)).toBe('Buffered 12 sec');
    expect(fmtLoadRate(8 * 2048, 0)).toBe('2 KB/s');
    expect(fmtLoadRate(0, 0)).toBe('Loading…');
  });

  it('Each of the three metrics keeps 24 samples, recording bad values as 0', () => {
    const samples: number[] = [];
    for (let i = 1; i <= 30; i++) pushPlayerStat(samples, i);
    pushPlayerStat(samples, Number.NaN);
    expect(samples).toHaveLength(24);
    expect(samples[0]).toBe(8);
    expect(samples.at(-1)).toBe(0);
  });
});

function fakePlayer(state: { time: number; duration: number }) {
  const handlers = new Map<string, (() => void)[]>();
  const player = {
    on(events: string | string[], fn: () => void) {
      for (const event of [events].flat()) handlers.set(event, [...handlers.get(event) || [], fn]);
    },
    currentTime(value?: number) { if (value !== undefined) state.time = value; return state.time },
    duration: () => state.duration,
    playbackRate: () => 1,
    play: () => Promise.resolve(),
    pause: () => {},
    isDisposed: () => false,
    addRemoteTextTrack: vi.fn(),
  };
  const fire = (event: string) => handlers.get(event)?.forEach((fn) => fn());
  return { player: player as unknown as VjsPlayer, raw: player, fire };
}

it('The picture-in-picture entry keeps its placeholder, enables once media is ready, and when the browser lacks support keeps the reason and disables', async () => {
  const root = document.createElement('div'), video = document.createElement('video'), button = document.createElement('button');
  root.append(video, button);
  let ready = 0;
  Object.defineProperties(video, { readyState: { get: () => ready }, videoWidth: { value: 1280 },
    webkitSetPresentationMode: { value: () => {} } });
  const original = vi.fn(async () => { throw new DOMException('Picture-in-Picture is not available', 'NotSupportedError') });
  const pip = Object.assign(button, { activate: original });
  const { player, fire } = fakePlayer({ time: 0, duration: 10 });
  Object.assign(player, { el: () => root });
  const label = vi.fn(), failure = vi.fn();
  mountPlayerPipControl(player, pip, label, failure);
  expect(pip.hasAttribute('data-peach-pip-supported')).toBe(true);
  expect(pip.disabled).toBe(true);
  ready = 4; video.dispatchEvent(new Event('loadedmetadata'));
  expect(pip.disabled).toBe(false);
  await (pip.activate as (media: unknown) => Promise<unknown>)({});
  expect(failure).toHaveBeenCalledWith('The current browser does not support picture-in-picture');
  expect(pip.disabled).toBe(true);
  expect(pip.getAttribute('label')).toBe('The current browser does not support picture-in-picture');
  fire('dispose');
  expect(pip.activate).toBe(original);
});

describe('Player quality', () => {
  function menu(entries: QualityLevel[], selectedIndex = 0) {
    configurePlayer(host());
    const root = document.createElement('div'), bar = document.createElement('div'), video = document.createElement('video');
    bar.className = 'vjs-control-bar';
    bar.innerHTML = '<div class="vjs-subtitles-control vjs-control"><button type="button">CC</button></div>';
    const container = document.createElement('media-container'); container.append(video, bar);
    root.append(container); document.body.append(root);
    const { player, fire } = fakePlayer({ time: 0, duration: 100 });
    const events = new Map<string, () => void>();
    const levels = Object.assign(entries, { selectedIndex, on: (names: string | string[], fn: () => void) => {
      for (const name of [names].flat()) events.set(name, fn);
    } }) as QualityLevelList;
    Object.assign(player, { el: () => root, qualityLevels: () => levels,
      paused: () => true, ended: () => false, isFullscreen: () => false, muted: () => false, volume: () => 1, trigger: () => {} });
    mountPlayerQualityControl(player, video, 2160);
    const open = () => {
      bar.querySelector<HTMLButtonElement>('.vjs-peach-settings-toggle')!.click();
      bar.querySelector<HTMLButtonElement>('[data-player-quality-view]')!.click();
    };
    const labels = () => [...bar.querySelectorAll('[data-player-quality-option]')].map((node) => node.textContent);
    return { bar, video, levels, open, labels, change: () => events.get('change')?.(), notify: (name: string) => events.get(name)?.(),
      close: () => { fire('dispose'); root.remove() } };
  }

  it('The settings menu picks among four orientations and can restore the original picture', () => {
    const view = menu([]);
    try {
      Object.defineProperties(view.video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 },
        clientWidth: { value: 640 }, clientHeight: { value: 360 } });
      Object.defineProperties(view.video.closest('media-container')!, { clientWidth: { value: 640 }, clientHeight: { value: 360 } });
      view.bar.querySelector<HTMLButtonElement>('.vjs-peach-settings-toggle')!.click();
      for (const angle of [90, 180, 270, 0]) {
        view.bar.querySelector<HTMLButtonElement>('[data-player-rotation]')!.click();
        expect(view.bar.querySelectorAll('[data-player-rotation-option]')).toHaveLength(4);
        view.bar.querySelector<HTMLButtonElement>(`[data-player-rotation-option="${angle}"]`)!.click();
        expect(view.video.style.transform).toBe(angle % 180 ? `translate(-50%, -50%) rotate(${angle}deg)` : angle ? `rotate(${angle}deg)` : '');
        expect(view.video.style.width).toBe(angle % 180 ? '360px' : '');
        expect(view.video.style.height).toBe(angle % 180 ? '640px' : '');
      }
    } finally { view.close() }
    expect(view.video.style.transform).toBe('');
  });

  it('Single-tier HLS is named by the actual video size and never shows the track URL or a fabricated Auto tier', () => {
    const view = menu([{ id: '0-https://example.test/index.m3u8?session=private', enabled: true }]);
    try {
      Object.defineProperties(view.video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } });
      view.video.dispatchEvent(new Event('loadedmetadata'));
      view.open();
      expect(view.labels()).toEqual(['1080p']);
      expect(view.bar.querySelector('[data-player-quality-option]')?.getAttribute('aria-checked')).toBe('true');
      expect(view.bar.querySelector('[data-player-quality-badge]')?.textContent).toBe('HD');
      view.bar.querySelector<HTMLButtonElement>('[data-player-quality-option]')!.click();
      expect(view.levels[0]!.enabled).toBe(true);
    } finally { view.close() }
  });

  it('A single tier without dimensions never guesses quality from the source file\'s height', () => {
    const view = menu([{ id: 'private-stream-url', enabled: true }]);
    try {
      view.open();
      expect(view.labels()).toEqual(['Current quality']);
      expect(view.bar.querySelector<HTMLElement>('[data-player-quality-badge]')!.hidden).toBe(true);
    } finally { view.close() }
  });

  it('Auto selection is preserved as tracks are added one by one', () => {
    const entries = [{ width: 640, height: 360, enabled: true }];
    const view = menu(entries);
    try {
      view.open();
      entries.push({ width: 1920, height: 1080, enabled: true });
      view.notify('addqualitylevel');
      expect(view.labels()).toEqual(['Auto', '360p', '1080p']);
      expect(view.bar.querySelector('[data-player-quality-option="auto"]')?.getAttribute('aria-checked')).toBe('true');
    } finally { view.close() }
  });

  it('The auto tier\'s badge follows the playing track, and unknown tiers use the route name', () => {
    const view = menu([{ width: 640, height: 360, enabled: true }, { width: 3840, height: 2160, enabled: true },
      { id: 'private-url', enabled: true }]);
    try {
      view.open();
      expect(view.labels()).toEqual(['Auto', '360p', '2160p', 'Route 3']);
      const badge = view.bar.querySelector<HTMLElement>('[data-player-quality-badge]')!;
      expect(badge.hidden).toBe(true);
      view.levels.selectedIndex = 1; view.change();
      expect(badge.textContent).toBe('4K');
      expect(badge.hidden).toBe(false);
    } finally { view.close() }
  });

  it('With the menu open, track changes and resizes update the quality panel in place, keeping focus on the original tier', () => {
    const entries = [{ width: 640, height: 360, enabled: true }, { width: 1920, height: 1080, enabled: true }];
    const view = menu(entries);
    try {
      view.open();
      view.bar.querySelector<HTMLElement>('[data-player-quality-option="1"]')!.focus();
      view.levels.selectedIndex = 1; view.change();
      view.video.dispatchEvent(new Event('resize'));
      entries.push({ width: 3840, height: 2160, enabled: true });
      view.notify('addqualitylevel');
      const panel = view.bar.querySelector('.vjs-peach-settings-menu')!.lastElementChild!;
      expect(panel.querySelector('strong')?.textContent).toBe('Quality');
      expect([...panel.querySelectorAll('[data-player-quality-option]')].map((node) => node.textContent))
        .toEqual(['Auto', '360p', '1080p', '2160p']);
      expect((document.activeElement as HTMLElement).dataset.playerQualityOption).toBe('1');
    } finally { view.close() }
  });

  it('While the main menu is open, a size change only updates the quality row\'s readout', () => {
    const view = menu([{ id: 'private-stream-url', enabled: true }]);
    try {
      view.bar.querySelector<HTMLButtonElement>('.vjs-peach-settings-toggle')!.click();
      const row = view.bar.querySelector('[data-player-quality-view]')!;
      expect(row.querySelector('b')?.textContent).toBe('Current quality');
      Object.defineProperties(view.video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } });
      view.video.dispatchEvent(new Event('resize'));
      expect(view.bar.querySelector('[data-player-quality-view]')).toBe(row);
      expect(row.querySelector('b')?.textContent).toBe('1080p');
    } finally { view.close() }
  });
});

describe('Picture-in-picture seek buttons', () => {
  it('Actions register one by one; one unrecognized action takes none of the rest down, step size comes from settings, and switching videos removes the whole set', () => {
    configurePlayer(host(15));
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const positions: unknown[] = [];
    vi.stubGlobal('navigator', { mediaSession: {
      setActionHandler(action: string, handler: MediaSessionActionHandler | null) {
        if (action === 'seekto' && handler) throw new TypeError('unsupported');
        handlers.set(action, handler);
      },
      setPositionState(state?: unknown) { positions.push(state) },
    } });
    const state = { time: 100, duration: 600 };
    const { player, fire } = fakePlayer(state);
    mountPlayerMediaSession(player, { id: 1, duration: 600 });
    expect([...handlers.keys()]).toEqual(['play', 'pause', 'seekbackward', 'seekforward']);
    handlers.get('seekforward')!({ action: 'seekforward' });
    expect(state.time).toBe(115);
    handlers.get('seekbackward')!({ action: 'seekbackward', seekOffset: 200 });
    expect(state.time).toBe(0);
    expect(positions[0]).toEqual({ duration: 600, position: 100, playbackRate: 1 });
    state.time = 700; fire('timeupdate');
    expect(positions).toHaveLength(1);
    fire('dispose');
    expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
  });
});

describe('External subtitle', () => {
  it('Every playable track mounts with none opened in advance', async () => {
    stubFetch(() => ({ subtitles: [
      { id: 'sidecar:1', playable: true, src: '/sub/1.vtt', language: 'zh', label: 'Simplified' },
      { id: 'sidecar:2', playable: false, src: '/sub/2.ass', language: 'ja', label: 'Japanese' },
      { id: 'sidecar:3', playable: true, src: '/sub/3.vtt', label: 'Traditional' },
    ] }));
    const { player, raw } = fakePlayer({ time: 0, duration: 0 });
    mountPlayerSubtitles(player, 21);
    await flush(); await flush();
    expect(raw.addRemoteTextTrack.mock.calls).toEqual([
      [{ id: 'sidecar:1', kind: 'subtitles', src: '/sub/1.vtt', srclang: 'zh', label: 'Simplified', default: false }, true],
      [{ id: 'sidecar:3', kind: 'subtitles', src: '/sub/3.vtt', srclang: '', label: 'Traditional', default: false }, true],
    ]);
  });
});
