/* The one player shared by stage and mini player (`src/react/stage/stage-player.ts`): the same instance claimed back without
 * rebuilding, tearing the old one down before mounting the new one on switch, and which situations hand the player to the
 * mini player on leaving details. Video.js itself is faked: what is measured here is how the instance hands over between the
 * two positions and how many times mount and teardown each ran. Real Video.js mounting is measured in `e2e/stage.test.ts`. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlayerItem } from '../src/player';

interface FakePlayer {
  el(): HTMLElement;
  isDisposed(): boolean;
  paused(): boolean;
  ended(): boolean;
  error(): null;
  on(): void;
  off(): void;
  duration(): number;
  currentTime(to?: number): number;
  play(): Promise<void>;
  pause(): void;
  dispose(): void;
  playing: boolean;
  time: number;
  total: number;
}

const fake = vi.hoisted(() => ({
  mounts: [] as { player: FakePlayer; previousDisposed: boolean[] }[],
  current: null as unknown,
}));

function fakePlayer(): FakePlayer {
  const el = document.createElement('div');
  el.className = 'video-js';
  el.append(document.createElement('video'));
  let disposed = false;
  const player: FakePlayer = {
    playing: true,
    time: 0,
    total: 100,
    el: () => el,
    isDisposed: () => disposed,
    paused: () => !player.playing,
    ended: () => false,
    error: () => null,
    on: () => {},
    off: () => {},
    duration: () => player.total,
    currentTime: (to?: number) => { if (to !== undefined) player.time = to; return player.time },
    play: () => Promise.resolve(),
    pause: () => { player.playing = false },
    dispose: () => { disposed = true; el.remove() },
  };
  return player;
}

vi.mock('../src/player', () => ({
  attachPlayerChrome: vi.fn(() => () => {}),
  cancelDetailStream: vi.fn(),
  closePlayerMenu: vi.fn(),
  configurePlayer: vi.fn(),
  configurePlayerMenu: vi.fn(),
  detailPlayer: () => fake.current,
  setDetailPlayer: (player: unknown) => { fake.current = player },
  disposePlayer: vi.fn((player: FakePlayer | null) => player?.dispose()),
  preparePlayerFrame: vi.fn(),
  resizeSoon: vi.fn(),
  mountPlayer: vi.fn((video: HTMLVideoElement, options: {
    onPlayer?: (player: FakePlayer) => void; handedOff?: (player: FakePlayer) => boolean;
  }) => {
    const player = fakePlayer();
    fake.mounts.push({ player, previousDisposed: fake.mounts.map(({ player: before }) => before.isDisposed()) });
    video.replaceWith(player.el());
    fake.current = player;
    options.onPlayer?.(player);
    return () => { if (!options.handedOff?.(player)) player.dispose() };
  }),
}));

type StagePlayer = typeof import('../src/react/stage/stage-player');
let stage: StagePlayer;
let open = true;
const settings = { miniplayer: true, seekSeconds: 10 };
let offline = false;
let dom: ReturnType<typeof miniplayerDom>;
const requestClose = vi.fn();
const expand = vi.fn();

function miniplayerDom() {
  const node = (tag = 'div') => document.body.appendChild(document.createElement(tag));
  const root = node('aside');
  root.hidden = true;
  return {
    root, frame: node(), play: node('button'), time: node('span'), back: node('button'), ahead: node('button'),
    title: node('span'), sub: node('span'), info: node('button'),
  };
}

const item = (id: number) => ({ id, title: `Video ${id}` }) as PlayerItem;

/* Open one item on the stage and then leave: the stage island tears down by first asking whether to hand off to the mini player, then unmounting the React tree (the media frame's cleanup runs with it). */
function show(id: number, frame = document.body.appendChild(document.createElement('div'))) {
  stage.setStageMeta({ kind: 'item', item: item(id), title: `Video ${id}`, sub: '' });
  const detach = stage.attachStagePlayer(frame, { kind: 'item', item: item(id) });
  return {
    frame,
    leave(allow: boolean) { stage.handOffStage(allow); detach(); stage.setStageMeta(null) },
  };
}

beforeEach(async () => {
  vi.resetModules();
  fake.mounts.length = 0;
  fake.current = null;
  open = true;
  offline = false;
  settings.miniplayer = true;
  settings.seekSeconds = 10;
  stage = await import('../src/react/stage/stage-player');
  stage.configureStagePlayer({
    player: { settings: () => settings, loadSourceStatus: async () => ({ local: !offline }),
      offlineReason: () => 'Source not mounted' } as never,
    sourceOffline: () => offline, expand, openItem: vi.fn(),
  }, { isOpen: () => open, requestClose });
  dom = miniplayerDom();
  stage.registerMiniplayer(dom);
});

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals() });

describe('Shared player for the play wall', () => {
  const response = (extra: Record<string, unknown> = {}) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id: 1, title: 'Video 1', location: 'local', ...extra }) })));
  };
  it('Collapsing the video wall hands off to the mini player; opening details claims the same instance and progress', async () => {
    open = false; response();
    const frame = document.body.appendChild(document.createElement('div'));
    const release = await stage.mountWallPlayer(item(1), frame, new AbortController().signal);
    const player = fake.mounts[0]!.player;
    player.currentTime(43);
    expect(stage.activeStageVideo()).toBe(player.el().querySelector('video'));
    release(true);
    expect(stage.miniplayerActive()).toBe(true);
    expect(player.isDisposed()).toBe(false);
    stage.prepareStageFor('item', 1);
    const detail = show(1);
    expect(detail.frame.contains(player.el())).toBe(true);
    expect(player.currentTime()).toBe(43);
    expect(fake.mounts).toHaveLength(1);
  });
  it('Switching videos or stopping releases the instance, and repeat cleanup stays idempotent', async () => {
    open = false; response();
    const release = await stage.mountWallPlayer(item(1), document.body.appendChild(document.createElement('div')), new AbortController().signal);
    release(false); release(true);
    expect(fake.mounts[0]!.player.isDisposed()).toBe(true);
    expect(stage.miniplayerActive()).toBe(false);
    expect(stage.stagePlayer()).toBeNull();
  });
  it('After choosing a volume or edition the shared player takes over', async () => {
    open = false; response({ part_group:{ key:'p' } });
    const frame = document.body.appendChild(document.createElement('div'));
    const release = await stage.mountWallPlayer({ ...item(1), part_group:{ key:'p' } }, frame, new AbortController().signal);
    expect(fake.mounts).toHaveLength(1);
    expect(frame.contains(fake.mounts[0]!.player.el())).toBe(true);
    release();
  });
  it('Metered, online, and dead-link videos cannot stream directly', async () => {
    response();
    const frame = document.body.appendChild(document.createElement('div'));
    const signal = new AbortController().signal;
    for (const extra of [{ cost: 'metered' }, { location: 'online' }]) {
      response(extra);
      await expect(stage.mountWallPlayer(item(1), frame, signal)).rejects.toThrow('Open details to');
    }
    response(); offline = true;
    await expect(stage.mountWallPlayer(item(1), frame, signal)).rejects.toThrow('Source not mounted');
    expect(fake.mounts).toHaveLength(0);
  });
  it('Video responses returning after the page was left never mount a player', async () => {
    let answer!: (response: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { answer = resolve })));
    const controller = new AbortController();
    const mounting = stage.mountWallPlayer(item(1), document.body.appendChild(document.createElement('div')), controller.signal);
    controller.abort();
    answer({ ok: true, json: async () => ({ id: 1, location: 'local' }) });
    await expect(mounting).rejects.toThrow();
    expect(fake.mounts).toHaveLength(0);
  });
});

describe('The player is handed off between the stage and the mini player', () => {
  it('The video playing when you leave details moves into the mini player; expanding back to the same item reclaims it instead of rebuilding', () => {
    show(1).leave(true);
    const { player } = fake.mounts[0]!;
    expect(player.isDisposed()).toBe(false);
    expect(stage.miniplayerActive()).toBe(true);
    expect(player.el().classList.contains('vjs-peach-mini')).toBe(true);

    stage.prepareStageFor('item', 1);
    const back = show(1);
    expect(fake.mounts).toHaveLength(1);
    expect(back.frame.contains(player.el())).toBe(true);
    expect(player.el().classList.contains('vjs-peach-mini')).toBe(false);
    expect(stage.stagePlayer()).toBe(player);
    expect(stage.miniplayerActive()).toBe(false);
  });

  it('Opening another item while the mini window holds a different one: the mini window\'s item tears down first, then the new one mounts', () => {
    show(1).leave(true);
    stage.prepareStageFor('item', 2);
    expect(fake.mounts[0]!.player.isDisposed()).toBe(true);
    show(2);
    expect(fake.mounts).toHaveLength(2);
    expect(fake.mounts[1]!.previousDisposed).toEqual([true]);
  });

  it('Queue switching: the previous item\'s media box unmounts before the next one mounts', () => {
    show(1).leave(false);
    show(2);
    expect(fake.mounts[1]!.previousDisposed).toEqual([true]);
    expect(stage.miniplayerActive()).toBe(false);
  });

  it.each([
    ['Explicitly closed', false, true, true],
    ['Paused', true, false, true],
    ['Mini player disabled in settings', true, true, false],
  ])('%s never enters the mini window, with the player torn down alongside the stage', (_name, allow, playing, enabled) => {
    settings.miniplayer = enabled;
    const shown = show(1);
    fake.mounts[0]!.player.playing = playing;
    shown.leave(allow);
    expect(fake.mounts[0]!.player.isDisposed()).toBe(true);
    expect(stage.miniplayerActive()).toBe(false);
  });

  it('The i key requests the mini player from details: it bypasses the playing-state check, and the close request still goes through the stage', () => {
    const shown = show(1);
    fake.mounts[0]!.player.playing = false;
    stage.toggleMiniplayer();
    expect(requestClose).toHaveBeenCalledOnce();
    shown.leave(false);
    expect(fake.mounts[0]!.player.isDisposed()).toBe(false);
    expect(stage.miniplayerActive()).toBe(true);

    open = false;
    stage.toggleMiniplayer();
    expect(expand).toHaveBeenCalledWith('item', 1, null);
  });
});

describe('The mini window\'s own keys', () => {
  it('Rewind and fast forward jump by the seconds in settings, with that number in the label; with unknown duration there is no cap', () => {
    settings.seekSeconds = 15;
    show(1).leave(true);
    const { player } = fake.mounts[0]!;
    expect(dom.back.getAttribute('aria-label')).toBe('Back 15 sec');
    expect(dom.ahead.title).toBe('Forward 15 sec');
    player.time = 90;
    stage.seekMiniplayer(1);
    expect(player.time).toBe(100);
    stage.seekMiniplayer(-1);
    expect(player.time).toBe(85);
    player.total = Number.NaN;
    player.time = 100;
    stage.seekMiniplayer(1);
    expect(player.time).toBe(115);
  });

  it.each([
    ['Volume group', { part_group: { key: 'p' } }],
    ['Edition group', { edition_group: { key: 'e' } }],
    ['Images', { medium: 'image' }],
    ['Billing source', { cost: 'metered', location: '115' }],
    ['Reverse lookup finds no online videos for follow entries', { location: 'online' }],
  ])('While the mini player is open, the %s card still opens details and does not swap playback inside the mini player', (_name, extra) => {
    show(1).leave(true);
    expect(stage.miniplayerTakesCard({ id: 2, location: 'local' } as PlayerItem)).toBe(true);
    expect(stage.miniplayerTakesCard({ id: 2, location: 'local', ...extra } as PlayerItem)).toBe(false);
  });

  it('Also refuse when the source is unmounted or the mini player is closed', () => {
    expect(stage.miniplayerTakesCard({ id: 2, location: 'local' } as PlayerItem)).toBe(false);
    show(1).leave(true);
    offline = true;
    expect(stage.miniplayerTakesCard({ id: 2, location: 'local' } as PlayerItem)).toBe(false);
  });
});
