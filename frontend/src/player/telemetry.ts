/* Watch reporting: videos go to `/api/activity`, follow entries to `/api/follow/activity`, both every ten seconds plus a flush on pause, on end,
 *  and on source change. */
import { api, realDuration } from '@peach/legacy/core';

import type { PlayerItem } from './types';

const cleanup = new WeakMap<HTMLVideoElement, () => void>();

/** 心跳回执里的观看进度，在 `document` 上广播。心跳不推账本版本（migration 0054），网格不会因此重取，
 *  卡片上的进度条靠这一份改写缓存里那张卡。 */
export const PLAYBACK_PROGRESS_EVENT = 'peach-playback-progress';
export interface PlaybackProgress { id: number; play_seconds: number; leave_ratio?: number }
interface ActivityReceipt { play_seconds?: number; leave_ratio?: number | null; real_ratio?: number | null }

export function stopTelemetry(video: HTMLVideoElement): void {
  cleanup.get(video)?.();
  cleanup.delete(video);
}

function lifecycle(video: HTMLVideoElement, flush: (ended: boolean) => void, stop: () => void, seeking: () => void): void {
  const leave = () => flush(false);
  const empty = () => { stop(); flush(false) };
  video.addEventListener('seeking', seeking);
  video.addEventListener('emptied', empty);
  window.addEventListener('pagehide', leave);
  cleanup.set(video, () => {
    stop(); flush(false);
    video.onplay = null; video.ontimeupdate = null; video.onpause = null; video.onended = null;
    video.removeEventListener('seeking', seeking);
    video.removeEventListener('emptied', empty);
    window.removeEventListener('pagehide', leave);
  });
}

export interface TelemetryOptions {
  /** The three nodes of the sidebar's 'left off' row (progress bar, tick and percentage); nothing renders when they are missing. */
  watched?: string;
  mark?: string;
  ratio?: string;
  /** What to do after playback ends (immersive mode goes on to the next one). */
  onEnded?: () => void;
}

/** Watch reporting for videos.
 *
 *  The same -1 sentinel: `it.duration||v.duration||0` evaluated against -1 is still -1, which passes the truthiness check, so
 *  currentTime/-1 yields a negative ratio and the panel shows a leave position of -3320%. The backend w_activity has a
 *  `dur > 0` guard, so the dirty ratio never reaches the database; only the display was broken.
 *
 *  The ten-second report has one timer. If onplay started a new one each time and only onpause cleared it, sequences like
 *  "play, seek, play" that never pass through pause would stack timers; more importantly, leaving details fires neither pause
 *  nor ended, and the setInterval kept running against a destroyed video, hitting /api/activity every ten seconds. So
 *  `emptied` wraps up, and `disposePlayer` synchronously flushes the last segment and removes the whole group when the player
 *  is dismantled. Handlers hang on `on*` properties, so the report never stops while the player moves from stage into mini
 *  player. */
export function wireTelemetry(item: PlayerItem, video: HTMLVideoElement | null, options: TelemetryOptions = {}): void {
  if (!video) return;
  let last = 0, acc = 0, seeks = 0, timer: ReturnType<typeof setInterval> | null = null;
  const node = (selector?: string) => (selector ? document.querySelector<HTMLElement>(selector) : null);
  const paint = () => {
    const duration = realDuration(item.duration) || realDuration(video.duration); if (!duration) return;
    const ratio = Math.min(video.currentTime / duration, 1);
    const watched = node(options.watched), mark = node(options.mark), text = node(options.ratio);
    if (watched) watched.style.width = `${(ratio * 100).toFixed(1)}%`;
    if (mark) mark.style.left = `${(ratio * 100).toFixed(1)}%`;
    if (text) text.textContent = `${(ratio * 100).toFixed(0)}%`;
  };
  const flush = (ended: boolean) => {
    const duration = realDuration(item.duration) || realDuration(video.duration);
    if (!acc && !ended && !seeks) return;
    (api('/api/activity', { method: 'POST', keepalive: true, body: JSON.stringify(
      { id: item.id, position: video.currentTime, duration, delta: acc, ended: !!ended, seeks }) }) as Promise<ActivityReceipt | null>)
      .then((result) => { // Fill the panel's real watch rate back in
        if (result && typeof result.play_seconds === 'number') {
          const detail: PlaybackProgress = { id: item.id, play_seconds: result.play_seconds,
            ...(result.leave_ratio != null ? { leave_ratio: result.leave_ratio } : {}) };
          document.dispatchEvent(new CustomEvent(PLAYBACK_PROGRESS_EVENT, { detail }));
        }
        const real = document.getElementById('realTxt');
        if (real && result && result.real_ratio != null) {
          const percent = Math.min(result.real_ratio, 1) * 100;
          real.textContent = `${percent.toFixed(0)}%`;
          const bar = document.getElementById('realBar'); if (bar) bar.style.width = `${percent.toFixed(1)}%`;
        }
      }).catch(() => {});
    acc = 0; seeks = 0;
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null } };
  video.onplay = () => { last = video.currentTime; stop(); timer = setInterval(() => flush(false), 10000) };
  video.ontimeupdate = () => { const delta = video.currentTime - last; if (!video.paused && !video.seeking && delta > 0 && delta < 2) acc += delta; last = video.currentTime; paint() };
  video.onpause = () => { stop(); flush(false) };
  video.onended = () => { stop(); flush(true); options.onEnded?.() };
  lifecycle(video, flush, stop, () => { seeks++ });
  paint();
}

/** Watch reporting for follow entries; the first playback logs an extra play, and receipts rewrite the state onto the entry. */
export function wireFollowTelemetry(item: PlayerItem & { status?: string | undefined }, video: HTMLVideoElement): void {
  let last = 0, acc = 0, started = false, timer: ReturnType<typeof setInterval> | null = null;
  const flush = (ended: boolean) => {
    const duration = realDuration(item.duration) || realDuration(video.duration);
    if (!acc && !ended) return;
    (api('/api/follow/activity', { method: 'POST', keepalive: true, body: JSON.stringify({
      item: item.id, position: video.currentTime, duration, delta: acc, ended: !!ended,
    }) }) as Promise<unknown>).catch(() => {});
    acc = 0;
  };
  const stop = () => { if (timer) clearInterval(timer); timer = null };
  video.onplay = () => {
    if (!started) {
      started = true;
      (api('/api/follow/play', { method: 'POST', body: JSON.stringify({ item: item.id }) }) as Promise<{ status?: string } | null>)
        .then((result) => { item.status = result?.status || item.status }).catch(() => {});
    }
    last = video.currentTime;
    stop(); timer = setInterval(() => flush(false), 10000);
  };
  video.ontimeupdate = () => {
    const delta = video.currentTime - last; if (!video.paused && !video.seeking && delta > 0 && delta < 2) acc += delta; last = video.currentTime;
  };
  video.onpause = () => { stop(); flush(false) };
  video.onended = () => { stop(); flush(true) };
  lifecycle(video, flush, stop, () => {});
}
