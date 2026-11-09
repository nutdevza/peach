/* The details player: attaches Video.js and all Peach controls to the stage play area's `<video>`.
 *
 * - `mountDetailPlayer` mounts a Video.js instance: stream source resolution, duration correction, falling back from segments
 *   to direct read on error, offline detection; once ready it attaches the settings menu, scrub preview, Media Session,
 *   spinner and subtitles.
 * - `attachPlayerChrome` connects the stats panel, load-speed badge and ambient light to one media frame. It is removed when
 *   the player enters the mini player and reconnected to the new media frame on expand back to the stage; the instance itself
 *   is not rebuilt.
 * - `mountPlayer` is the entry for the stage play area and each immersive slide: inserts the ambient light canvas and stats
 *   badge, provides stream source, poster and reporting per video or follow entry, and returns the teardown for this one
 *   player. */
import { detailPosterUrl } from '@peach/card-art';
import { api, esc, fmtClock, fmtSize, icon, realDuration } from '@peach/legacy/core';

import {
  mountPlayerAmbient, mountPlayerMediaSession, mountPlayerQualityControl, mountPlayerSeekPreview,
  mountPlayerSpinner, mountPlayerSubtitles,
} from './controls';
import { disposePlayer } from './dispose';
import { playerHost } from './host';
import { mountImmersePlayer, type ImmersePlayerOptions } from './immerse-player';
import { wirePlayerContextMenu } from './menu';
import { detailPlayer, setDetailPlayer } from './registry';
import { playbackKey, playbackPosition, stopPlaybackPosition, trackPlaybackPosition } from './progress';
import {
  averageBitrate, bufferedAhead, createBufferMeter, fmtLoadRate, fmtSpeed, PLAYER_PANEL_EVENT,
  playerSpeedBits, playerStatsOverlayHtml, playerStatsPlot, pushPlayerStat, streamEntries,
} from './stats';
import { detailStreamSession, detailStreamSource, directDetailSource } from './stream';
import { stopTelemetry, wireFollowTelemetry, wireTelemetry } from './telemetry';
import type { MediaFacts, PlayerItem, PlayerSource, SourceQuality, VjsPlayer } from './types';
import { ensureVideojs } from './videojs';
import { isPlayerGuidePreview } from './guide-preview';

/** The moment playback resumes when expanding back from the mini player or entering with a `?t=` deep link. */
export interface PlayerResume { time: number; autoplay: boolean }

export interface DetailPlayerOptions {
  guidePreview?: boolean;
  playbackKey?: string;
  /** Given a stream (a follow item's `/follow-stream`); when omitted, resolve by the video's source. */
  source?: PlayerSource;
  /** Whether a playback error should trigger a source-status check for a dropped drive. A follow entry's stream is not among local sources, so no check. */
  checkSourceStatus?: boolean;
  size?: number | null | undefined;
  poster?: string | undefined;
  qualities?: SourceQuality[] | null;
  /** The quality list and byte counts parse in parallel with the default source and arrive later than mount. */
  mediaPromise?: Promise<MediaFacts | null>;
  resume?: PlayerResume | null;
}

/** The three readouts in the media frame: the stats key, the stats panel, and the load-speed badge (`playerStatsOverlayHtml`). */
interface PlayerChrome {
  statsButton: HTMLElement | null;
  statsPanel: HTMLElement | null;
  netBadge: HTMLElement | null;
}

/** One player instance's stat source. Which frame the panel paints into is decided by `chrome`; only it changes when the frame changes. */
interface PlayerSession {
  chrome: PlayerChrome | null;
  /** The stats button appears only after ready: clicking it before the control bar mounts reads nothing. */
  ready: boolean;
  updateStats(): void;
}

const sessions = new WeakMap<VjsPlayer, PlayerSession>();

/* Timers for the stats panel and the load-speed badge. They paint inside the stage's media frame and stop together with the stage when the player goes to the mini player. */
let statsTimer: ReturnType<typeof setInterval> | null = null;
let netTimer: ReturnType<typeof setInterval> | null = null;
let netHideTimer: ReturnType<typeof setTimeout> | null = null;

/** Stops the stats panel and badge refresh. The player itself is untouched. */
export function stopPlayerPanels(): void {
  if (statsTimer) { clearInterval(statsTimer); statsTimer = null }
  if (netTimer) { clearInterval(netTimer); netTimer = null }
  if (netHideTimer) { clearTimeout(netHideTimer); netHideTimer = null }
}

export async function mountDetailPlayer(
  item: PlayerItem, video: HTMLVideoElement, autoplay: boolean, options: DetailPlayerOptions = {},
): Promise<VjsPlayer | null> {
  const existing = detailPlayer();
  if (existing && !existing.isDisposed()) return existing;
  const host = playerHost();
  const resume = options.resume ?? null;
  if (resume?.autoplay) autoplay = true;
  if (options.guidePreview) autoplay = false;
  const source = () => (options.source ? Promise.resolve(options.source) : detailStreamSource(item));
  /* When it cannot be pulled, fall back to the native video, the same fallback exit as "no videojs on the page". */
  let videojs;
  try { videojs = await ensureVideojs() } catch {
    video.controls = true;
    if (options.guidePreview) return null;
    source().then((next) => {
      video.addEventListener('loadedmetadata', () => {
        if (resume && resume.time > 0) video.currentTime = Math.min(resume.time, realDuration(video.duration) || resume.time);
      }, { once: true });
      video.src = next.src; if (autoplay) video.play().catch(() => {});
    }).catch(() => {});
    return null;
  }
  const player = videojs(video, {
    controls: true, preload: 'metadata', language: 'zh-CN', responsive: true,
    /* The poster matches the video's current cover preference and is handed to the native video element to display. */
    poster: options.poster || detailPosterUrl(item, host.settings().javImage),
    controlBar: {
      pictureInPictureToggle: true, currentTimeDisplay: false, timeDivider: false,
      durationDisplay: false, remainingTimeDisplay: false,
      // Time and hover preview belong to Peach controls; the progress bar keeps only the parts needed for playback and scrubbing.
      progressControl: { seekBar: { mouseTimeDisplay: false, playProgressBar: { timeTooltip: false } } },
    },
  });
  setDetailPlayer(player);
  player.peachItem = item;
  player.peachPlaybackKey = options.playbackKey || playbackKey('item', item);
  wirePlayerContextMenu(player);
  /* On mobile, video cells lay out at each video's own ratio (`--peach-video-ratio`). */
  player.on('loadedmetadata', () => {
    const tech = player.el()?.querySelector('video');
    if (tech?.videoWidth && tech.videoHeight) player.el().style.setProperty('--peach-video-ratio', `${tech.videoWidth}/${tech.videoHeight}`);
  });
  // Non-positive durations are always treated as unknown.
  const expected = realDuration(item.duration);
  const statsHistory = { speed: [] as number[], activity: [] as number[], buffer: [] as number[] };
  /* A follow entry's byte size is known only from a HEAD to the source, arriving with the quality list, after mount. Bitrate is the conversion factor for the speed readout,
   so leave a slot to fill in later rather than fixing it at mount time. */
  let mediaSize = Number(options.size ?? item.size) || 0;
  const meter = createBufferMeter(averageBitrate(mediaSize, item.duration));
  let statsLoaded = 0;
  let correcting = false;
  const live = () => detailPlayer() === player && !player.isDisposed();
  const enforceDuration = () => {
    if (!expected || correcting || !live()) return;
    const reported = Number(player.duration());
    if (!Number.isFinite(reported) || Math.abs(reported - expected) > Math.max(2, expected * .001)) {
      correcting = true; player.duration(expected); queueMicrotask(() => { correcting = false });
    }
  };
  const segmentedNow = () => String(player.currentSource()?.type || '').includes('mpegurl');
  const session: PlayerSession = { chrome: null, ready: false, updateStats: () => {} };
  sessions.set(player, session);
  session.updateStats = () => {
    const statsPanel = session.chrome?.statsPanel;
    if (!statsPanel || statsPanel.hidden || !live()) return;
    const quality = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
    const rect = video.getBoundingClientRect(), current = `${video.videoWidth || item.width || '?'}×${video.videoHeight || item.height || '?'}`;
    const segmented = segmentedNow();
    const stream = detailStreamSession();
    const resources = segmented ? streamEntries(item.id, stream) : [];
    const bytes = resources.reduce((n, entry) => n + (entry.transferSize || entry.encodedBodySize || 0), 0);
    const seconds = resources.reduce((n, entry) => n + (entry.duration || 0), 0) / 1000;
    meter.sample(video);
    const speed = playerSpeedBits(player, item.id, stream, segmented ? null : meter) || (seconds > 0 ? bytes * 8 / seconds : 0);
    /* Segmented streams count bytes from completed requests; progressive sources have no such requests, so progress is derived from the leading edge, falling back to seconds when the bitrate is unknown. */
    const loaded = segmented ? bytes : (meter.bitrate > 0 ? meter.bytes() : meter.seconds);
    const activity = Math.max(0, loaded - statsLoaded); statsLoaded = loaded;
    const buffer = bufferedAhead(video);
    pushPlayerStat(statsHistory.speed, speed);
    pushPlayerStat(statsHistory.activity, activity);
    pushPlayerStat(statsHistory.buffer, buffer);
    /* Follow items have no on-disk file name, so the container format can only be inferred from the source MIME; HLS is already recorded on the transport side and is not repeated. */
    const named = String(item.name || '');
    const container = (named.includes('.') ? named.split('.').pop() || ''
      : segmented ? '' : String(player.currentSource()?.type || '').split('/').pop() || '').toUpperCase() || '—';
    const speedText = speed ? `${(speed / 1e6).toFixed(1)} Mbps` : '—';
    const byteScale = segmented || meter.bitrate > 0;
    const loadedRow: [string, string, string] = segmented
      ? ['Network activity', `${bytes ? fmtSize(bytes) : '—'} · ${resources.length} requests`,
        `Network activity in the last second ${activity ? fmtSize(activity) : '0 B'}`]
      : ['Downloaded', byteScale ? `${fmtSize(loaded)}${mediaSize > 0 ? ` / ${fmtSize(mediaSize)}` : ''}` : `${loaded.toFixed(0)} sec`,
        byteScale ? `Downloaded in the last second ${activity ? fmtSize(activity) : '0 B'}` : `Downloaded ${activity.toFixed(1)} sec in the last second`];
    const rows: [string, string, string?][] = [
      ['Video ID / session', stream && !options.source ? `${item.id} / ${stream.slice(0, 8)}` : `${item.id}`],
      ['Viewport / frame', `${Math.round(rect.width)}×${Math.round(rect.height)} / ${quality ? `${quality.totalVideoFrames - quality.droppedVideoFrames} of ${quality.totalVideoFrames}` : '—'}`],
      ['Current / best resolution', `${current} / ${item.width || video.videoWidth || '?'}×${item.height || video.videoHeight || '?'}`],
      ['Codec / transport', `${container} / ${segmented ? 'HLS' : 'HTTP Range'}`],
      ['Connection speed', speedText,
        playerStatsPlot(statsHistory.speed, 'speed', Math.max(10e6, ...statsHistory.speed), `Connection speed ${speedText === '—' ? 'no data yet' : speedText}`)],
      [loadedRow[0], loadedRow[1],
        playerStatsPlot(statsHistory.activity, 'activity', Math.max(1, ...statsHistory.activity), loadedRow[2])],
      ['Buffer health', `${buffer.toFixed(1)} sec`,
        playerStatsPlot(statsHistory.buffer, 'buffer', 30, `${buffer.toFixed(1)} sec of continuous playback available`)],
      ['Play time', `${fmtClock(video.currentTime)} / ${fmtClock(expected || player.duration())}`],
      ['Date', new Date().toLocaleString()],
    ];
    statsPanel.innerHTML = `<dl>${rows.map(([key, value, plot]) =>
      `<dt>${esc(key)}</dt><dd${plot ? ' data-player-stats-metric=""' : ''}>${plot || ''}<span>${esc(value)}</span></dd>`).join('')}</dl>`;
  };
  player.on(['loadstart', 'loadedmetadata', 'durationchange', 'error'], enforceDuration);
  let segmentedSource = false, fallbackUsed = false;
  const updateNet = () => {
    const netBadge = session.chrome?.netBadge;
    if (!netBadge || player.isDisposed()) return;
    const segmented = segmentedNow();
    if (!segmented) meter.sample(video);
    const bits = playerSpeedBits(player, item.id, detailStreamSession(), segmented ? null : meter);
    const rate = segmented ? fmtSpeed(bits) : fmtLoadRate(bits, bufferedAhead(video));
    netBadge.innerHTML = `${icon('gauge')}<span class="sr-only">Load speed</span><span>${esc(rate)}</span>`;
  };
  const showNet = () => {
    const netBadge = session.chrome?.netBadge;
    if (!netBadge || !netBadge.isConnected) return;
    netBadge.hidden = false; updateNet();
    if (netTimer) clearInterval(netTimer);
    netTimer = setInterval(updateNet, 500);
  };
  const hideNet = () => {
    const netBadge = session.chrome?.netBadge;
    if (!netBadge) return;
    if (netHideTimer) clearTimeout(netHideTimer);
    netHideTimer = setTimeout(() => { netBadge.hidden = true; if (netTimer) { clearInterval(netTimer); netTimer = null } }, 1400);
  };
  player.on(['loadstart', 'progress', 'waiting', 'stalled'], showNet);
  player.on(['canplay', 'playing'], () => { updateNet(); hideNet() });
  player.on('error', () => {
    if (segmentedSource && !fallbackUsed && !player.isDisposed()) {
      fallbackUsed = true; segmentedSource = false;
      player.src(directDetailSource(item));
      if (autoplay) player.play()?.catch(() => {});
      return;
    }
    // When the drive drops mid-playback the video element only reports a generic error; source status is what tells a dropped drive apart from a corrupted file.
    if (options.checkSourceStatus === false) return;
    void host.loadSourceStatus().then((status) => {
      if (status[String(item.root_id || item.location)] !== false || player.isDisposed()) return;
      player.error({ code: 2, message: `Media folder unreachable · ${host.offlineReason(String(item.root_id || item.location))}` });
    });
  });
  player.ready(() => {
    enforceDuration();
    const updateQualities = mountPlayerQualityControl(player, video, item.height, options.qualities ?? null);
    options.mediaPromise?.then((next) => {
      if (!live()) return;
      updateQualities?.(next?.qualities?.length ? next.qualities : null);
      const size = Number(next?.size) || 0;
      if (size > 0 && !mediaSize) { mediaSize = size; meter.bitrate = averageBitrate(size, item.duration) }
    }).catch(() => {});
    mountPlayerSeekPreview(player, item, { thumbnail: !options.source });
    if (!options.guidePreview) mountPlayerMediaSession(player, item);
    mountPlayerSpinner(player);
    if (!options.source) mountPlayerSubtitles(player, item.id);
    session.ready = true;
    if (session.chrome?.statsButton) session.chrome.statsButton.hidden = false;
  });
  if (!options.guidePreview) source().then((next) => {
    if (!live()) return;
    segmentedSource = String(next.type || '').includes('mpegurl');
    if (resume && resume.time > 0) player.one('loadedmetadata', () => {
      if (player.isDisposed()) return;
      const duration = realDuration(player.el().querySelector('video')?.duration) || realDuration(player.duration());
      player.currentTime(Math.min(resume.time, duration || resume.time));
    });
    player.src(next);
    enforceDuration(); setTimeout(enforceDuration, 0); setTimeout(enforceDuration, 250);
    if (autoplay) player.play()?.catch(() => {});
  }).catch(() => {});
  return player;
}

const AMBIENT_CANVAS = '<canvas data-ambient-canvas="" width="32" height="18"></canvas>';

/** Ambient glow goes at the head of the media frame; the video details stats key and rate attach to the toolbar slot React leaves open, with the stats panel inside the frame.
 *  Follow details have no toolbar, so readouts insert before `before`. When readouts already exist, keep the current nodes and events. */
export function preparePlayerFrame(frame: HTMLElement, before: Element | null = null): void {
  if (!frame.querySelector(':scope > [data-ambient-canvas]')) frame.insertAdjacentHTML('afterbegin', AMBIENT_CANVAS);
  if (frame.querySelector('#playerStatsBtn')) return;
  const overlay = document.createElement('template');
  overlay.innerHTML = playerStatsOverlayHtml();
  const toolbar = frame.querySelector(':scope > [data-player-toolbar]');
  if (toolbar) {
    toolbar.querySelector('[data-player-stats-slot]')!.append(overlay.content.querySelector('#playerStatsBtn')!);
    toolbar.querySelector('[data-player-net-slot]')!.append(overlay.content.querySelector('#playerNet')!);
  }
  frame.insertBefore(overlay.content, before);
}

/** Attaches the stats panel, load-speed badge and ambient glow to `frame` (which passes through `preparePlayerFrame` first). Returns a
 *  detach function: detached on entering the mini player, and self-detached when the player is destroyed. */
export function attachPlayerChrome(player: VjsPlayer, frame: HTMLElement): () => void {
  const session = sessions.get(player);
  if (!session || player.isDisposed()) return () => {};
  const find = (id: string) => frame.querySelector<HTMLElement>(`#${id}`);
  const chrome: PlayerChrome = { statsButton: find('playerStatsBtn'), statsPanel: find('playerStats'), netBadge: find('playerNet') };
  session.chrome = chrome;
  const { statsButton, statsPanel } = chrome;
  let offPanels = () => {};
  if (statsButton && statsPanel) {
    statsButton.hidden = !session.ready;
    const closeStats = () => {
      if (statsPanel.hidden) return;
      statsPanel.hidden = true; statsButton.setAttribute('aria-pressed', 'false');
      if (statsTimer) { clearInterval(statsTimer); statsTimer = null }
    };
    statsButton.onclick = () => {
      if (!statsPanel.hidden) { closeStats(); return }
      document.dispatchEvent(new CustomEvent(PLAYER_PANEL_EVENT, { detail: 'stats' }));
      statsPanel.hidden = false; statsButton.setAttribute('aria-pressed', 'true');
      session.updateStats();
      if (statsTimer) clearInterval(statsTimer);
      statsTimer = setInterval(session.updateStats, 1000);
    };
    const closeStatsForOtherPanel = (event: Event) => { if ((event as CustomEvent<string>).detail !== 'stats') closeStats() };
    document.addEventListener(PLAYER_PANEL_EVENT, closeStatsForOtherPanel);
    offPanels = () => document.removeEventListener(PLAYER_PANEL_EVENT, closeStatsForOtherPanel);
  }
  const tech = player.el().querySelector('video');
  const stopAmbient = tech ? mountPlayerAmbient(tech) : () => {};
  let attached = true;
  const detach = () => {
    if (!attached) return;
    attached = false;
    offPanels(); stopAmbient();
    if (session.chrome === chrome) { session.chrome = null; stopPlayerPanels() }
  };
  player.one('dispose', detach);
  return detach;
}

/** One media item within a follow entry (which video in the group). */
export interface PlayerMedia { index: number; media_type?: string; size?: number | null }

export interface MountPlayerOptions {
  kind: 'item' | 'follow';
  item: PlayerItem;
  media?: PlayerMedia | null;
  /** When omitted, follow the setting (`detailAutoplay`). */
  autoplay?: boolean | undefined;
  resume?: PlayerResume | null;
  /** Before mount, insert the ambient light canvas and the stats badge into the media frame. Inserted by default; switching videos in the mini player does not want them. */
  chrome?: boolean;
  /** Hand out the instance once mounted: the mini player and the expanded view need to recognize this one. On mount failure (Video.js unavailable, fall back to native video)
   *  deliver null. No callback when teardown is faster than mounting. */
  onPlayer?: (player: VjsPlayer | null) => void;
  /** This player has been taken over by the mini player: do not destroy it when tearing down the playback area. */
  handedOff?: (player: VjsPlayer) => boolean;
}

/** The stage play area's entry: attach a player to the `<video>` in the play area and return the teardown function.
 *
 *  The ambient light canvas and stats badge are inserted into the media frame before mounting: once Video.js wraps it, the
 *  `video`'s parent becomes its own layer.
 *  - Video (`item`): the stream source is resolved per source by `mountDetailPlayer`, the poster is a local image, this mount
 *    records one play on first playback, and leave position and real watching are written back to the sidebar via
 *    `wireTelemetry` as playback proceeds.
 *  - Follow (`follow`): the stream source is `/follow-stream`, with quality and byte size (`/follow-qualities`) resolved in
 *    parallel with the default source; it must re-origin-fetch the details and then HEAD the actual file, so it must not block
 *    the player mount.
 *  - An immersive slide (`immerse`): bare Video.js with the slide's own stream session, see `immerse-player.ts`.
 *  The returned cleanup runs when the stage unmounts this media area: switching media tears down only this one player; one
 *  taken over by the mini player only has its telemetry removed. */
export function mountPlayer(video: HTMLVideoElement, options: MountPlayerOptions | ImmersePlayerOptions): () => void {
  if (options.kind === 'immerse') return mountImmersePlayer(video, options);
  const { kind, item, media = null, handedOff, onPlayer } = options;
  const guidePreview = isPlayerGuidePreview();
  const host = playerHost();
  const frame = options.chrome === false ? null : video.parentElement;
  if (frame) preparePlayerFrame(frame, video);
  const key = playbackKey(kind, item, media?.index ?? null);
  let detail: DetailPlayerOptions = { guidePreview, playbackKey: key, resume: guidePreview ? null : options.resume ?? { time: playbackPosition(key, item), autoplay: false } };
  if (kind === 'follow') {
    detail = {
      ...detail,
      source: { src: `/follow-stream?id=${item.id}${media ? `&media=${media.index}` : ''}`, type: media?.media_type || item.media_type || 'video/mp4' },
      checkSourceStatus: false, size: media?.size, poster: item.thumb_url,
      mediaPromise: (api(`/follow-qualities?id=${encodeURIComponent(item.id)}`) as Promise<MediaFacts | null>).catch(() => null),
    };
  } else {
    const poster = detailPosterUrl(item, host.settings().javImage);
    if (poster) video.poster = poster;
  }
  let player: VjsPlayer | null = null, released = false, detachChrome = () => {}, trackedVideo = video;
  const release = () => {
    detachChrome();
    if (player && handedOff?.(player)) return;
    stopPlaybackPosition(trackedVideo);
    if (!player) { stopTelemetry(trackedVideo); return }
    if (detailPlayer() === player) { setDetailPlayer(null); stopPlayerPanels() }
    disposePlayer(player);
  };
  void mountDetailPlayer(item, video, guidePreview ? false : options.autoplay ?? host.settings().detailAutoplay, detail).then((mounted) => {
    player = mounted;
    // The media area changed before the mount came back: this one is torn down the moment it appears.
    if (released) { release(); return }
    trackedVideo = mounted?.el().querySelector('video') ?? video;
    if (guidePreview) {
      mounted?.el().setAttribute('data-player-guide', '');
      onPlayer?.(mounted); return;
    }
    trackPlaybackPosition(key, trackedVideo);
    if (kind === 'follow') wireFollowTelemetry(item, trackedVideo);
    else {
      trackedVideo.addEventListener('play', () => {
        void (api('/api/play', { method: 'POST', body: JSON.stringify({ id: item.id }) }) as Promise<unknown>).catch(() => {});
      }, { once: true });
      wireTelemetry(item, trackedVideo, { watched: '#watched', mark: '#mark', ratio: '#ratioTxt' });
    }
    if (!mounted) { onPlayer?.(null); return }
    if (frame) detachChrome = attachPlayerChrome(mounted, frame);
    onPlayer?.(mounted);
  });
  return () => { released = true; release() };
}
