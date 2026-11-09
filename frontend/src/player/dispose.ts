/* Tears down one Video.js instance. Every cell in details, mini player and immersive mode goes through this. */
import type { VjsPlayer } from './types';
import { stopPlaybackPosition } from './progress';
import { stopTelemetry } from './telemetry';

/** Tearing down a player: after pausing, save the position synchronously, flush the watch tail, clean up timers and listeners, then destroy the instance. */
export function disposePlayer(player: VjsPlayer | null): void {
  if (!player || player.isDisposed()) return;
  const video = player.el()?.querySelector('video');
  try { player.pause() } catch { /* Torn down */ }
  if (video) {
    stopPlaybackPosition(video);
    stopTelemetry(video);
  }
  try { player.dispose() } catch { /* Torn down */ }
}
