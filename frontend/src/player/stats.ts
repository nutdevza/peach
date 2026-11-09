/* Playback stats: buffering readout, load speed and the stats panel's small chart.
 *
 * Progressive download (HTTP Range) cannot measure the network: the browser plays off one long-lived connection whose requests
 * do not finish during playback, so no new resource timing entries appear. Measured: a local MP4 at 37 seconds still showed
 * only the two mount entries with bytes stuck at 862 KB, so the panel displayed "- 0 requests". HLS is different: every
 * segment is an independently completed request, and VHS reports bandwidth itself, so the resource timing basis only holds
 * there.
 * Progressive sources watch the buffer front's advance instead: seconds newly advanced per second times average bitrate is
 * the byte rate. Bitrate needs the file size, and follow entries get theirs from `/follow-qualities`'s origin HEAD; when even
 * upstream gives no content-length there is no way to convert seconds to bytes, and the badge reports how much longer it can
 * play instead. Once the buffer fills, the browser stops pulling and the delta goes to zero; the last readout is kept rather
 * than jumping back to 0, because that is not a speed drop, it is simply not downloading. */
import { esc, icon, realDuration } from '@peach/legacy/core';

import type { VjsPlayer } from './types';

export function bufferedAhead(video: HTMLVideoElement): number {
  const at = video.currentTime || 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= at && video.buffered.end(i) >= at) return Math.max(0, video.buffered.end(i) - at);
  }
  return 0;
}

/* The buffer frontier: the end of the buffered range containing the current playback position. Watch the frontier, not total buffered length; during playback the browser evicts
   played ranges, so the total stays nearly constant and using it as downloaded amount would read "always 0". */
function bufferedFrontier(video: HTMLVideoElement): number {
  const at = video.currentTime || 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= at + .25 && video.buffered.end(i) >= at) return video.buffered.end(i);
  }
  return video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
}

const BUFFER_METER_WINDOW_MS = 3000;

export function averageBitrate(size: unknown, duration: unknown): number {
  const bytes = Number(size) || 0, seconds = realDuration(duration) || 0;
  return bytes > 0 && seconds > 0 ? bytes * 8 / seconds : 0;
}

export interface BufferMeter {
  bitrate: number;
  readonly bits: number;
  readonly seconds: number;
  bytes(): number;
  sample(video: HTMLVideoElement | null): number;
}

export function createBufferMeter(bitrate: number): BufferMeter {
  const samples: { at: number; advanced: number }[] = [];
  let last: { at: number; frontier: number; ct: number } | null = null, advanced = 0, bits = 0;
  return {
    bitrate: Number(bitrate) || 0,
    get bits() { return bits },
    get seconds() { return advanced },
    bytes() { return this.bitrate > 0 ? advanced * this.bitrate / 8 : 0 },
    sample(video) {
      if (!video) return bits;
      const at = performance.now(), frontier = bufferedFrontier(video), ct = video.currentTime || 0;
      if (last) {
        const gap = (at - last.at) / 1000;
        /* A seek moves the leading edge wholesale, which is not dozens of minutes downloaded in one second; the criterion is the playback position jumping on its own. */
        const seeked = Math.abs(ct - last.ct) > gap * 4 + 1;
        const step = frontier - last.frontier;
        if (!seeked && step > 0) advanced += step;
        /* With both the panel and the badge closed nobody samples, so on reopen the two points are minutes apart and the window must start over. */
        if (gap * 1000 > BUFFER_METER_WINDOW_MS * 2) samples.length = 0;
      }
      last = { at, frontier, ct };
      samples.push({ at, advanced });
      while (samples.length > 2 && at - samples[0]!.at > BUFFER_METER_WINDOW_MS) samples.shift();
      const first = samples[0]!;
      const span = (at - first.at) / 1000, gained = advanced - first.advanced;
      if (span >= .5 && gained > 0 && this.bitrate > 0) bits = gained * this.bitrate / span;
      return bits;
    },
  };
}

const PLAYER_STATS_HISTORY = 24;

export function pushPlayerStat(samples: number[], value: number): void {
  samples.push(Number.isFinite(value) && value > 0 ? value : 0);
  if (samples.length > PLAYER_STATS_HISTORY) samples.splice(0, samples.length - PLAYER_STATS_HISTORY);
}

/** The settings panel and playback stats both cover the picture and occlude each other when open together. Opening either broadcasts once on document, and the other
 *  collapses itself: the two panels live in different scopes, and sharing an event name is cleaner than holding references to each other. */
export const PLAYER_PANEL_EVENT = 'peach-player-panel';

export function playerStatsPlot(samples: number[], kind: 'speed' | 'activity' | 'buffer', ceiling: number, label: string): string {
  const values: (number | null)[] = [...Array<null>(Math.max(0, PLAYER_STATS_HISTORY - samples.length)).fill(null), ...samples];
  const top = Math.max(1, ceiling || 0);
  const bars = values.map((value) => {
    if (value === null) return '<i aria-hidden="true"></i>';
    const level = value <= 0 ? 0 : Math.max(.08, Math.min(1, value / top));
    const state = kind === 'buffer' ? (value < 5 ? 'low' : value < 15 ? 'mid' : 'good') : 'on';
    return `<i data-bar="${state}" style="height:${(level * 100).toFixed(1)}%" aria-hidden="true"></i>`;
  }).join('');
  return `<span data-player-stats-plot="${kind}" role="img" aria-label="${esc(label)}">${bars}</span>`;
}

/** Stats keys, the playback speed badge, and the stats panel. Video details and follows details share this set; mounted inserted before Video.js wraps
 *  `<video>`, and once Video.js wraps, `video`'s parent becomes its own layer. */
export function playerStatsOverlayHtml(): string {
  return `<button data-player-stats-button="" id="playerStatsBtn" aria-label="Playback stats" title="Playback stats" aria-pressed="false" hidden>${icon('chart')}</button>
       <div data-player-net="" id="playerNet" role="status" aria-live="polite" hidden></div>
       <div data-player-stats="" id="playerStats" role="status" hidden></div>`;
}

export function streamEntries(id: number, session = ''): PerformanceResourceTiming[] {
  const encoded = session ? encodeURIComponent(session) : '';
  return (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((entry) => entry.name.includes('/stream')
    && (entry.name.includes(`/stream?id=${id}`) || entry.name.includes(`/stream/hls/${id}/`))
    && (!encoded || entry.name.includes(`session=${encoded}`)));
}

export function streamSpeedBits(id: number, session = ''): number {
  const entries = streamEntries(id, session);
  const bytes = entries.reduce((n, entry) => n + (entry.transferSize || entry.encodedBodySize || 0), 0);
  const seconds = entries.reduce((n, entry) => n + (entry.duration || 0), 0) / 1000;
  return bytes > 0 && seconds > 0 ? bytes * 8 / seconds : 0;
}

export function playerSpeedBits(player: VjsPlayer | null, id: number, session = '', meter: BufferMeter | null = null): number {
  let bandwidth = 0;
  try { bandwidth = Number(player?.bandwidth?.()) || 0 } catch { /* The playback engine has no bandwidth reading */ }
  if (bandwidth > 0) return bandwidth;
  /* A meter present means a progressive source: its resource timing cannot be measured to begin with, and no other entry may stand in for it. */
  return meter ? Number(meter.bits) || 0 : streamSpeedBits(id, session);
}

export function fmtSpeed(bits: number): string {
  if (!Number.isFinite(bits) || bits <= 0) return 'Loading…';
  const bytes = bits / 8;
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB/s` : `${Math.max(1, Math.round(bytes / 1024))} KB/s`;
}

/** With an unknown bitrate, byte speed cannot be converted, so fall back to buffered seconds: the only directly usable reading in that case,
 *  i.e. how much longer playback can continue offline right now. */
export function fmtLoadRate(bits: number, ahead: number): string {
  if (bits > 0) return fmtSpeed(bits);
  return ahead > 0 ? `Buffered ${Math.round(ahead)} sec` : fmtSpeed(0);
}
