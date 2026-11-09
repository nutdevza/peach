/* The player instance for the details path. Stage and mini player hold one entry at a time: entering the mini player from details moves the same instance over whole,
 *  so there is only one slot here. */
import type { VjsPlayer } from './types';

let detail: VjsPlayer | null = null;

export const detailPlayer = (): VjsPlayer | null => detail;

export function setDetailPlayer(player: VjsPlayer | null): void { detail = player }

/** Deferred to the next frame so Video.js remeasures. By the next frame the player may already have been swapped or destroyed by closing the mini player,
 *  and targeting an empty shell trigger would throw "Invalid target". */
export function resizeSoon(player: VjsPlayer | null): void {
  if (!player || player.isDisposed()) return;
  requestAnimationFrame(() => { if (!player.isDisposed()) player.trigger('resize') });
}
