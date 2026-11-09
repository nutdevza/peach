/* Immersive mode (resident component `immerse`, `immerse-island.tsx`) contract with the shell: the shell only takes the imperative entry; the film list, each cell's player,
 * gestures, action keys, and the work title all live in `peach-app.js`. The address bar, home filters, avatar spelling, and "where to go after closing" belong to the shell. */

export interface ImmerseHost {
  /** The home page's current filters (the shell's `state`): playlists sample randomly by them, aspect excluded. */
  filters(): Record<string, string | number | null | undefined>;
  /** Seconds for double-click rewind/forward on the left and right halves (`appSettings.seekSeconds`). */
  seekSeconds(): number;
  /** Source dropped off disk: such a video cannot pull a stream and shows up in the playlist as a black screen stuck loading. */
  sourceOffline(location: string): boolean;
  /** Plain text of the title line (the legacy layer's `javDisplayName`). */
  displayName(item: Record<string, unknown>): string;
  /** On every switch: the shell writes `/immerse?id=` into the address bar with replace, so a refresh lands back on the same item. */
  route(id: number): void;
  /** After immersive mode is turned off: the shell goes back to home. */
  closed(): void;
  openItem(id: number): void;
  openEntity(kind: 'performer' | 'creator', name: string): void;
  openUnowned(): void;
  /** The operation receipt; when `undo` is provided, an undo button comes with it. */
  toast(message: string, options?: { undo?: () => Promise<void> }): void;
  /** A warning with a sound cue (empty playlist). */
  warn(message: string): void;
  failure(action: string, error: unknown): void;
}

export interface ImmerseApi {
  /** Opens immersive mode; when `startId` is not in this random sample its detail is fetched and inserted at the front. */
  open(startId: number | null): Promise<void>;
  /** The path the close key and Escape take: tear down all cells, cancel reads per session, then hand off to the shell's `closed`. */
  close(): void;
  isOpen(): boolean;
  /** The video that responds to playback shortcuts: the cell currently on screen. */
  activeVideo(): HTMLVideoElement | null;
}
