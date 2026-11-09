/* What the player needs from outside: settings, receipts, source state and stage elements.
 *
 * The player is an imperative module and holds none of these: settings belong to the legacy shell's `appSettings` (stored in
 * localStorage's `peach.settings.v1`), receipts to the site's one Toast, and the stage's ambient light and theater-mode class
 * hang on `#stage`. Whoever mounts the player calls `configurePlayer` once to connect them. */

/** The settings the player reads and writes. The holder supplies the object; the player writes changes back in place and then calls `save`. */
export interface PlayerSettings {
  ambientMode: boolean;
  theaterMode: boolean;
  seekSeconds: number;
  miniplayer: boolean;
  detailAutoplay: boolean;
  /** Whether the cover layer before a coded video starts plays the official cover or the preview image (`card-art`'s `detailPosterUrl` picks by it). */
  javImage: string;
}

export interface PlayerHost {
  settings(): PlayerSettings;
  saveSettings(): void;
  toast(text: string, options: { timeout?: number; warn?: boolean }): void;
  /** Whether each source is online right now (a snapshot of `/api/sources`; `false` means off disk). */
  loadSourceStatus(): Promise<Record<string, boolean>>;
  /** The human-readable reason shown when a source is unmounted. */
  offlineReason(location: string): string;
  /** The stage element: ambient light's `--video-glow`, plus `data-ambient` and `data-theater`, hang on it. */
  stage(): HTMLElement | null;
}

let current: PlayerHost | null = null;

export function configurePlayer(host: PlayerHost): void { current = host }

export function playerHost(): PlayerHost {
  if (!current) throw new Error('The player has no host attached yet (configurePlayer)');
  return current;
}
