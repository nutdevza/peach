/* The one player shared by the stage and the mini player (ADR-0031 step 11a). No React: the stage island's media frame calls
 * `attachStagePlayer` in a layout effect, the mini player component registers its node, and everything else is imperative.
 *
 * Modeled on YouTube desktop's miniplayer (docs/reference-snapshots/youtube-miniplayer-measured.md): the video playing when
 * you leave details is not destroyed; Video.js's shell moves wholesale into the mini player and keeps playing; with the mini
 * player open, clicking other cards switches videos inside it; clicking the title or "Expand" returns to details, moving the
 * same instance back into the stage's media frame without rebuilding; drag to any quadrant and it snaps to that corner.
 * Upstream keeps only in-playlist switching inside the mini player; Peach also takes card clicks into it, per user request.
 *
 * Stage and mini player play one video at a time, so there are only two positions: `attached` is the one in the stage's media
 * frame, `held` is the one in the mini player. An instance moves from `attached` to `held` (leaving details) or is claimed
 * back from `held` to `attached` (expand), never in both at once. */
import { api, fmtClock, realDuration } from '@peach/legacy/core';
import { iconSwapHtml, setIconSwap } from '@peach/legacy/ui';

import {
  attachPlayerChrome, cancelDetailStream, closePlayerMenu, configurePlayer, configurePlayerMenu, detailPlayer,
  disposePlayer, mountPlayer, preparePlayerFrame, resizeSoon, setDetailPlayer,
  type PlayerHost, type PlayerItem, type PlayerMedia, type PlayerResume, type VjsPlayer,
} from '../../player';

export type StageKind = 'item' | 'follow';

/** The item the stage is currently painting: the mini player's title and source, and the kind used by the context menu's copy URL, all come from here. */
export interface StageMeta { kind: StageKind; item: PlayerItem; title: string; sub: string }

/** What the stage and mini player ask the shell for. The stage element inside the player host is filled in by the stage itself. */
export interface StagePlayerHost {
  player: Omit<PlayerHost, 'stage'>;
  /** Whether this source is currently unmounted. */
  sourceOffline(location: string): boolean;
  /** 'Expand' in the mini player: back to this entry's details, with the shell handling the address and the origin. */
  expand(kind: StageKind, id: number, mediaIndex: number | null): void;
  /** Cards the mini player cannot take still open details as usual. */
  openItem(id: number): void;
}

/** Nodes registered after the mini player component paints; playing state, time and rate are written onto them directly from player events. */
export interface MiniplayerDom {
  root: HTMLElement;
  frame: HTMLElement;
  play: HTMLElement;
  time: HTMLElement;
  back: HTMLElement;
  ahead: HTMLElement;
  title: HTMLElement;
  sub: HTMLElement;
  info: HTMLElement;
}

interface Slot {
  player: VjsPlayer;
  kind: StageKind;
  item: PlayerItem;
  mediaIndex: number | null;
  key: string;
}

interface Held extends Slot { meta: StageMeta; off: (() => void)[]; pending: boolean }

interface Attached {
  player: VjsPlayer | null;
  kind: StageKind;
  item: PlayerItem;
  mediaIndex: number | null;
  key: string;
}

let host: StagePlayerHost | null = null;
let held: Held | null = null;
let attached: Attached | null = null;
let meta: StageMeta | null = null;
let dom: MiniplayerDom | null = null;
/* The context menu and i-key "mini player" action: bypasses the playing-state check and sends the current stage entry into the mini player. Closing has an exit animation,
   so it stays until the stage is actually torn down before being consumed. */
let requested = false;
let token = 0;
let requestClose: (() => void) | null = null;
let stageOpen: () => boolean = () => false;

export const playerKey = (kind: StageKind, id: number, mediaIndex: number | null): string =>
  `${kind}:${id}:${mediaIndex ?? ''}`;

export function configureStagePlayer(next: StagePlayerHost, stage: {
  isOpen(): boolean; requestClose(): void;
}): void {
  host = next;
  stageOpen = () => stage.isOpen();
  requestClose = () => stage.requestClose();
  configurePlayer({ ...next.player, stage: () => document.getElementById('stage') });
  configurePlayerMenu({
    inMiniplayer: (player) => held?.player === player,
    kind: (player) => (held?.player === player ? held.kind : attached?.kind ?? meta?.kind ?? 'item'),
    expand: () => expandMiniplayer(),
    toMiniplayer: () => toggleMiniplayer(),
  });
  // Leaving the page tears down this detail's quality probing and transcode sessions, so the server keeps no orphan processes.
  if (!pagehideWired) { pagehideWired = true; addEventListener('pagehide', () => cancelDetailStream()) }
}
let pagehideWired = false;

function stageHost(): StagePlayerHost {
  if (!host) throw new Error('The stage player has no host attached yet (configureStagePlayer)');
  return host;
}

/** When the stage draws one, register its title and source; clear them when the stage is torn down. */
export function setStageMeta(next: StageMeta | null): void { meta = next }
export const stageMeta = (): StageMeta | null => meta;

/* ── Stage media frame ── */

export interface StagePlayerOptions {
  kind: StageKind;
  item: PlayerItem;
  media?: PlayerMedia | null | undefined;
  autoplay?: boolean | undefined;
  resume?: PlayerResume | null | undefined;
  /** The `<video>` id: the video details one is `vid`; keyboard and e2e find the playback area by it. */
  id?: string | undefined;
  poster?: string | undefined;
  /** Native `<video>` errors (follows entries use this to explain a failed video source). */
  onError?: (() => void) | undefined;
}

/** Mounts a player on a media frame in the stage and returns the teardown.
 *
 *  If the mini player is playing the same entry (same kind, same id, same media), claim that instance back: Video.js's shell
 *  moves wholesale into this frame, telemetry reconnects, and playback never stops. Otherwise build a new `<video>` and hand
 *  it to `mountPlayer`. On teardown, if the instance was already taken by the mini player only the telemetry is removed;
 *  otherwise the stream session is dismantled with it. */
export function attachStagePlayer(frame: HTMLElement, options: StagePlayerOptions): () => void {
  const { kind, item, media = null } = options;
  const key = playerKey(kind, item.id, media?.index ?? null);
  if (held && held.key === key) return claimHeld(frame, held);
  if (held) closeMiniplayer();
  const slot: Attached = { player: null, kind, item, mediaIndex: media?.index ?? null, key };
  attached = slot;
  const video = document.createElement('video');
  if (options.id) video.id = options.id;
  video.className = 'video-js vjs-big-play-centered';
  video.controls = false;
  video.setAttribute('playsinline', '');
  video.preload = 'metadata';
  if (options.poster) video.poster = options.poster;
  if (options.onError) video.addEventListener('error', options.onError);
  frame.append(video);
  const release = mountPlayer(video, {
    kind, item, media, autoplay: options.autoplay, resume: options.resume ?? null,
    onPlayer: (player) => { if (attached === slot) slot.player = player },
    handedOff: (player) => held?.player === player,
  });
  return () => {
    const handed = !!slot.player && held?.player === slot.player;
    if (attached === slot) attached = null;
    release();
    if (handed) return;
    /* When Video.js did not load, a bare `<video>` is playing: it keeps sounding even after leaving the document, so stop it before clearing the source. */
    if (!slot.player) { video.pause(); video.removeAttribute('src'); video.load() }
    cancelDetailStream();
  };
}

/** The wall receives already-chosen local video entries; billing and online videos use the detail's source gating. */
export async function mountWallPlayer(summary: PlayerItem, frame: HTMLElement, signal: AbortSignal): Promise<(continuePlaying?: boolean) => void> {
  const item = await api(`/api/item?id=${summary.id}`, { signal }) as PlayerItem & { error?: string };
  signal.throwIfAborted();
  if (!item || item.error) throw new Error(item?.error || 'Video not fetched');
  if (item.medium && item.medium !== 'video') throw new Error('This title has no playable video');
  if (item.location === 'online') throw new Error('Open details to play online videos');
  if (item.cost === 'metered') throw new Error('Open details to confirm the metered source');
  const sources = await stageHost().player.loadSourceStatus();
  signal.throwIfAborted();
  if (sources[String(item.root_id || item.location || '')] === false) throw new Error(stageHost().player.offlineReason(String(item.root_id || item.location || '')));
  const metadata: StageMeta = { kind: 'item', item, title: String(item.title || item.name || ''),
    sub: String((item.performers as string[] | undefined)?.[0] || item.creator || 'Unassigned') };
  setStageMeta(metadata);
  const release = attachStagePlayer(frame, { kind: 'item', item, autoplay: true });
  let released = false;
  return (continuePlaying = false) => {
    if (released) return;
    released = true;
    if (continuePlaying && meta === metadata) handOffStage(true);
    release();
    if (meta === metadata) setStageMeta(null);
  };
}

function claimHeld(frame: HTMLElement, from: Held): () => void {
  const { player } = from;
  unbindHeld(from);
  held = null;
  hideMiniplayer();
  player.el().classList.remove('vjs-peach-mini');
  preparePlayerFrame(frame);
  frame.append(player.el());
  setDetailPlayer(player);
  const slot: Attached = { player, kind: from.kind, item: from.item, mediaIndex: from.mediaIndex, key: from.key };
  attached = slot;
  const detachChrome = attachPlayerChrome(player, frame);
  resizeSoon(player);
  return () => {
    if (attached === slot) attached = null;
    detachChrome();
    if (held?.player === player) return;
    if (detailPlayer() === player) setDetailPlayer(null);
    disposePlayer(player);
    cancelDetailStream();
  };
}

/** The player currently mounted on the stage (needed by the context menu, the i key, and theater mode). */
export const stagePlayer = (): VjsPlayer | null => {
  const player = attached?.player;
  return player && !player.isDisposed() ? player : null;
};

/** The stage is being torn down: should the currently playing one go to the mini player. `allow` is whether this exit permits the mini player;
 *  explicit close (X, Escape), switching to another details entry, and deleting the current item all forbid it; the context menu and the i key are the requested exceptions.
 *  The one that opened but was never claimed (fetch rerouted, disk not mounted) is collected here too. */
export function handOffStage(allow: boolean): void {
  const wanted = requested;
  requested = false;
  if (held?.pending) closeMiniplayer();
  const slot = attached;
  const player = slot?.player;
  const current = meta;
  if (!slot || !player || player.isDisposed() || !current || !dom) return;
  const settings = stageHost().player.settings();
  const eligible = wanted || (allow && settings.miniplayer && !player.paused() && !player.ended() && !player.error());
  if (!eligible) return;
  enterMiniplayer({ player, kind: slot.kind, item: slot.item, mediaIndex: slot.mediaIndex, key: slot.key }, current);
}

/** Before the stage opens this entry: if the mini player holds something else, close it first so the two players never sound at once; if it holds this one, hide it first,
 *  and claim it back once the media frame renders. */
export function prepareStageFor(kind: StageKind, id: number): void {
  requested = false;
  if (!held) return;
  if (held.kind === kind && held.item.id === id) {
    held.pending = true;
    hideMiniplayer();
    return;
  }
  closeMiniplayer();
}

/* ── Mini player ── */

export function registerMiniplayer(next: MiniplayerDom | null): void {
  dom = next;
  if (dom) syncSeekLabels();
}

export const miniplayerActive = (): boolean => !!held && !held.pending && !held.player.isDisposed();

export function miniplayerVideo(): HTMLVideoElement | null {
  return miniplayerActive() ? dom?.frame.querySelector('video') ?? null : null;
}

/** The video that should respond to playback shortcuts right now: the stage's when open, otherwise the mini player's. It operates the native element directly rather than the
 *  Video.js instance: after mount `#vid` is Video.js's div, and the real media element is `#vid_html5_api`. */
export function activeStageVideo(): HTMLVideoElement | null {
  if (stageOpen()) return document.getElementById('stage')?.querySelector('video') ?? null;
  return stagePlayer()?.el().querySelector('video') ?? miniplayerVideo();
}

function paintMeta(next: { title: string; sub: string }): void {
  if (!dom) return;
  dom.title.textContent = next.title || '';
  dom.sub.textContent = next.sub || '';
  dom.info.setAttribute('aria-label', next.title ? `Expand to details: ${next.title}` : 'Expand to details');
}

/* The picture area takes its height from the video ratio: a 4:3 video gives a 400×300 mini player. Portrait is clamped to within 1:1, since 400-wide 9:16
   would exceed the viewport height. */
function syncAspect(item: PlayerItem | undefined = held?.item): void {
  if (!dom) return;
  const video = dom.frame.querySelector('video');
  const width = video?.videoWidth || Number(item?.width) || 16;
  const height = video?.videoHeight || Number(item?.height) || 9;
  dom.frame.style.setProperty('--miniplayer-aspect', `${Math.max(width, height)}/${height}`);
}

function syncPlayState(): void {
  const player = held?.player;
  if (!player || player.isDisposed() || !dom) return;
  const paused = player.paused();
  dom.play.setAttribute('aria-label', paused ? 'Play' : 'Paused');
  /* The main player's icon morphs along a path; the mini bar's is only 20px, too small for a morph to read, so it crossfades two stacked glyphs.
     Only the container state changes and the `use`'s href stays, since changing href is a hard cut. */
  if (!dom.play.querySelector('[data-icon-swap]')) dom.play.innerHTML = iconSwapHtml('player-pause', 'player-play', paused ? 'b' : 'a');
  setIconSwap(dom.play, paused ? 'b' : 'a');
}

function syncTime(): void {
  const player = held?.player;
  if (!player || player.isDisposed() || !dom) return;
  const total = realDuration(held?.item.duration) || realDuration(player.duration());
  dom.time.textContent = `${fmtClock(player.currentTime())} / ${total ? fmtClock(total) : '0:00'}`;
}

const seekStep = (): number => Math.max(1, Number(stageHost().player.settings().seekSeconds) || 10);

/* The step follows the setting, and the label carries the number so screen reader users hear how far they will jump before pressing. Rewrite it every time the player is taken over,
   and the next mini player opened after the setting changes uses the new seconds. */
function syncSeekLabels(): void {
  if (!dom || !host) return;
  const step = seekStep();
  for (const [button, text] of [[dom.back, `Back ${step} sec`], [dom.ahead, `Forward ${step} sec`]] as const) {
    button.setAttribute('aria-label', text);
    button.title = text;
  }
}

function bindHeld(slot: Held): void {
  const on = (events: string | string[], handler: () => void) => {
    slot.player.on(events, handler);
    slot.off.push(() => { try { slot.player.off(events, handler) } catch { /* Torn down */ } });
  };
  on(['play', 'pause', 'ended'], syncPlayState);
  on(['timeupdate', 'durationchange', 'loadedmetadata'], syncTime);
  on('loadedmetadata', () => syncAspect());
  syncPlayState(); syncTime(); syncAspect(); syncSeekLabels();
}

function unbindHeld(slot: Held): void { slot.off.forEach((off) => off()); slot.off = [] }

function showMiniplayer(): void {
  const root = dom?.root;
  if (!root) return;
  const entering = root.hidden;
  root.hidden = false;
  if (!entering) return;
  root.setAttribute('data-miniplayer-enter', '');
  const settle = () => root.removeAttribute('data-miniplayer-enter');
  root.addEventListener('animationend', settle, { once: true });
  setTimeout(settle, 500);
}

function hideMiniplayer(): void {
  const root = dom?.root;
  if (!root) return;
  root.hidden = true;
  for (const state of ['data-miniplayer-drag', 'data-miniplayer-snap', 'data-miniplayer-enter']) root.removeAttribute(state);
  root.style.transform = '';
}

function enterMiniplayer(slot: Slot, next: StageMeta): void {
  if (!dom) return;
  const entry: Held = { ...slot, meta: next, off: [], pending: false };
  held = entry;
  token++;
  slot.player.el().classList.add('vjs-peach-mini');
  dom.frame.prepend(slot.player.el());
  paintMeta(next);
  bindHeld(entry);
  showMiniplayer();
  resizeSoon(slot.player);
}

export function closeMiniplayer(): void {
  const slot = held;
  if (slot) unbindHeld(slot);
  held = null;
  token++;
  const player = slot?.player ?? null;
  if (player && detailPlayer() === player) setDetailPlayer(null);
  disposePlayer(player);
  if (player) cancelDetailStream();
  dom?.frame.querySelectorAll('.video-js,video').forEach((el) => el.remove());
  closePlayerMenu();
  hideMiniplayer();
}

export function expandMiniplayer(): void {
  if (!miniplayerActive() || !held) return;
  const { kind, item, mediaIndex } = held;
  stageHost().expand(kind, item.id, mediaIndex);
}

/** The i key means what it does on YouTube: mini player from the detail, expand back to the detail from the mini player. */
export function toggleMiniplayer(): void {
  if (miniplayerActive() && !stageOpen()) { expandMiniplayer(); return }
  if (stageOpen() && stagePlayer() && requestClose) { requested = true; requestClose() }
}

export function playMiniplayer(): void {
  const player = held?.player;
  if (!player || player.isDisposed()) return;
  if (player.paused()) player.play()?.catch(() => {}); else player.pause();
}

/* No cap when duration is unavailable: for live streams and videos whose metadata has not been read, `duration()` is NaN, and feeding it to `Math.min` throws the progress
   straight to NaN, freezing the video in place. */
export function seekMiniplayer(side: 1 | -1): void {
  const player = held?.player;
  if (!player || player.isDisposed()) return;
  const total = realDuration(player.duration()) || realDuration(held?.item.duration) || 0;
  const at = Math.max(0, (Number(player.currentTime()) || 0) + seekStep() * side);
  player.currentTime(total ? Math.min(total, at) : at);
}

/** Only plain video cards can be switched directly in the mini player: volume/edition groups must pick a volume first, and metered, off-disk, and online assets that cannot be traced back to a follow entry
 *  all have to pass the gate in details first. */
export function miniplayerTakesCard(item: PlayerItem | null | undefined): boolean {
  if (!miniplayerActive() || !item) return false;
  if (item.part_group || item.edition_group) return false;
  if (item.medium && item.medium !== 'video') return false;
  if (item.cost === 'metered' && item.location !== 'online') return false;
  if (item.location === 'online' && !item.follow_item_id) return false;
  if (stageHost().sourceOffline(String(item.root_id || item.location || ''))) return false;
  return true;
}

/** Switches to another video inside the mini player. A new video is a new video, and attaching a fresh player is the cleanest: the previous entry's error fallback, watch
 *  reporting and quality list are all bound in the old instance's closures, and reusing it books the new video's behavior against the old one. */
export async function miniplayerPlay(id: number): Promise<void> {
  if (!miniplayerActive() || !held || !dom) return;
  const mine = ++token;
  const item = await (api(`/api/item?id=${id}`) as Promise<(PlayerItem & { error?: unknown }) | null>).catch(() => null);
  if (mine !== token || !miniplayerActive() || !held || !dom) return;
  if (!item || item.error) return;
  if (!miniplayerTakesCard(item)) { stageHost().openItem(id); return }
  const previous = held;
  unbindHeld(previous);
  if (detailPlayer() === previous.player) setDetailPlayer(null);
  disposePlayer(previous.player);
  cancelDetailStream();
  dom.frame.querySelectorAll('.video-js,video').forEach((el) => el.remove());
  const video = document.createElement('video');
  video.className = 'video-js';
  video.setAttribute('playsinline', '');
  video.preload = 'metadata';
  dom.frame.prepend(video);
  const nextMeta: StageMeta = { kind: 'item', item, title: String(item.title || item.name || ''),
    sub: String((item.performers as string[] | undefined)?.[0] || item.creator || 'Unassigned') };
  /* During a swap `held` still points at the old cell (marked as torn down), and the mini player does not collapse just because mounting waits a beat. */
  paintMeta(nextMeta);
  mountPlayer(video, {
    kind: 'item', item, autoplay: true, chrome: false,
    onPlayer: (player) => {
      if (mine !== token) {
        if (player && detailPlayer() === player) setDetailPlayer(null);
        disposePlayer(player);
        return;
      }
      if (!player) { closeMiniplayer(); stageHost().openItem(id); return }
      player.el().classList.add('vjs-peach-mini');
      const slot: Held = { player, kind: 'item', item, mediaIndex: null, key: playerKey('item', item.id, null),
        meta: nextMeta, off: [], pending: false };
      held = slot;
      bindHeld(slot);
        },
  });
  syncAspect(item);
}
