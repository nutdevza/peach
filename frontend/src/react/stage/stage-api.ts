/* The stage island's contract with the shell: the shell gets only imperative entry points, and the stage, the two details, the player, and the mini player all live in `peach-app.js`. */
import type { PlayerItem, PlayerResume } from '../../player';
import type { FollowDetailActions, FollowDetailProps } from '../follow-detail/follow-detail';
import type { ItemDetailActions, ItemDetailProps } from '../item-detail/item-detail';
import type { StagePlayerHost } from './stage-player';
import type { JavDetailProps } from '../jav-detail/jav-detail';

export type StageHost = StagePlayerHost;

/** Opens video detail. No `mountPlayer` in the actions: the media frame goes to the stage's own player. */
export interface StageItemRequest extends Omit<ItemDetailProps, 'actions'> {
  kind: 'item';
  actions: Omit<ItemDetailActions, 'mountPlayer'>;
  /** A deep link arrives with `?t=`: the first time this entry mounts, playback resumes from that moment. */
  resume?: PlayerResume | null;
}

export interface StageFollowRequest extends Omit<FollowDetailProps, 'actions'> {
  kind: 'follow';
  actions: Omit<FollowDetailActions, 'mountPlayer'>;
  resume?: PlayerResume | null;
}

export interface StageJavRequest extends JavDetailProps { kind: 'jav'; id?: never; resume?: never }
export type StageRequest = StageItemRequest | StageFollowRequest | StageJavRequest;

/** What changes on an open detail: selection state and layout are pushed to the "Continue watching" row. */
export type StagePatch = Partial<Pick<ItemDetailProps, 'layout' | 'selectMode' | 'selected' | 'seekSeconds' | 'relatedLimit'>>;

export interface StageApi {
  /** The playback wall's media host. Once collapsed it can hand off to the mini player; details can claim the same instance. */
  mountWallPlayer(item: PlayerItem, frame: HTMLElement, signal: AbortSignal): Promise<(continuePlaying?: boolean) => void>;
  /** Opens a details view: draw the skeleton, call `showModal()`, then swap in content once data arrives. When the mini player is already holding this exact entry, the same
   *  player is moved back the moment content renders. When an overlay already shows the same kind of details, do not reopen; swap content in place after the fetch. */
  open(request: StageRequest): Promise<void>;
  update(patch: StagePatch): void;
  /** Exit animation; wait for it to finish before tearing down the stage. */
  exit(): Promise<void>;
  /** Tear down the stage. When `miniplayer` is false the playing video does not enter the mini player (explicit close, switching details, deleting the current item). */
  dispose(options?: { miniplayer?: boolean }): void;
  isOpen(): boolean;
  /** The kind of detail that is currently open in the overlay and can swap items in place; empty when not open, exiting, or already asked to close. The shell decides from this whether to tear down the stage before swapping. */
  showing(): StageRequest['kind'] | null;
  /** Explicitly close the details: hand it to the current detail's own `close`; a second request during the exit does not double it. */
  requestClose(): void;
  /** Escape closes the topmost popover first; details only close when no popover is open. */
  requestEscape(): void;
  /** The video that should respond to playback shortcuts: the stage's one when the stage is open, otherwise the mini player's. */
  activeVideo(): HTMLVideoElement | null;
  toggleTheater(): void;
  /** The i key: from details it enters the mini player, from the mini player it expands back to details. */
  toggleMiniplayer(): void;
  closeMiniplayer(): void;
  miniplayerActive(): boolean;
  miniplayerTakesCard(item: PlayerItem | null | undefined): boolean;
  miniplayerPlay(id: number): void;
  /** The default cover changed: any open video detail swaps its poster slot along with it. */
  repaintPoster(): void;
}
