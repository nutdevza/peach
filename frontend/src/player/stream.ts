/* Stream sessions and source criteria.
 *
 * Each playback carries a session id, by which the server registers in-flight reads; switching away, closing, or leaving the page cancels by session,
 * so reads nobody watches stop holding 115 or the local disk. Details and immersive mode share this set (immersive mode: one session per cell). */
import { api } from '@peach/legacy/core';

import { randomId } from '../core/random-id';
import type { PlayerItem, PlayerSource } from './types';

export function newStreamSession(): string {
  return randomId();
}

export function directStreamSource(item: PlayerItem, session: string): PlayerSource {
  return {
    src: `/stream?id=${item.id}&session=${encodeURIComponent(session)}`,
    type: String(item.name || '').toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4',
  };
}

/* An online video's `path` is the source's video page, not a playable address. The playable one is proxied at `/follow-stream?id=<follow_item>`,
   with `follow_item.asset_id` written at save time, and `/api/item` looks it up and returns `follow_item_id`. */
function followStreamSource(item: PlayerItem): PlayerSource | null {
  return item.location === 'online' && item.follow_item_id
    ? { src: `/follow-stream?id=${item.follow_item_id}`, type: 'video/mp4' } : null;
}

/** This is the only criterion for choosing the playback source, shared by details and immersive mode: if the server says transcode to segments, stream segments; otherwise read directly.
 *  An MP4 with B-frames but missing ctts drops frames in the wrong display order when read directly, and the whole video stutters. */
export async function playableStreamSource(item: PlayerItem, session: string): Promise<PlayerSource> {
  const proxied = followStreamSource(item);
  if (proxied) return proxied;
  try {
    const plan = await api(`/api/stream-plan?id=${item.id}&session=${encodeURIComponent(session)}`) as
      { protocol?: string; src?: string; mime_type?: string } | null;
    if (plan?.src) return { src: plan.src, type: plan.mime_type || (plan.protocol === 'hls' ? 'application/vnd.apple.mpegurl' : 'video/mp4') };
  } catch { /* If the plan is unavailable, read directly */ }
  return directStreamSource(item, session);
}

/** Tells the server to drop this read. The result is written onto `<html data-peach-stream-cancel>`, which e2e checks against. */
export function cancelStreamSession(session: string): void {
  if (!session) return;
  fetch(`/api/stream-cancel?session=${encodeURIComponent(session)}`, {
    method: 'POST', credentials: 'same-origin', keepalive: true,
  }).then((response) => response.json()).then((result: unknown) => {
    document.documentElement.dataset.peachStreamCancel = JSON.stringify(result);
  }).catch(() => {});
}

/* ── The details path ──
   Stage and mini player hold one entry at a time and share one session: the read carries over when entering the mini player from details, and is cancelled only when
   switching videos in the mini player or closing it. */
let detailSession = '';

export function detailStreamSession(): string { return detailSession }

function ensureDetailSession(): string {
  if (!detailSession) detailSession = newStreamSession();
  return detailSession;
}

export const directDetailSource = (item: PlayerItem): PlayerSource => directStreamSource(item, ensureDetailSession());
export const detailStreamSource = (item: PlayerItem): Promise<PlayerSource> => playableStreamSource(item, ensureDetailSession());

export function cancelDetailStream(): void {
  const session = detailSession;
  if (!session) return;
  detailSession = '';
  cancelStreamSession(session);
}
