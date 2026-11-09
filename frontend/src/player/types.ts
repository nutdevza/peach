/* Peach playback session interface and item shape; Video.js 10 provides media and controls through local ESM modules. */

export type PlayerEvents = string | string[];

/** Video.js's quality track list (the adaptive tiers of HLS/DASH). */
export interface QualityLevel { width?: number; height?: number; id?: string; enabled: boolean }
export interface QualityLevelList {
  length: number;
  selectedIndex?: number;
  [index: number]: QualityLevel;
  on?(events: PlayerEvents, handler: () => void): void;
}

export interface PlayerSource { src: string; type: string }

export interface VjsPlayer {
  /** The entry recorded at mount: the context menu's copy URL takes its id from it. */
  peachItem?: PlayerItem;
  peachPlaybackKey?: string;
  on(events: PlayerEvents, handler: (...args: unknown[]) => void): void;
  off(events: PlayerEvents, handler: (...args: unknown[]) => void): void;
  one(events: PlayerEvents, handler: (...args: unknown[]) => void): void;
  ready(handler: () => void): void;
  el(): HTMLElement;
  isDisposed(): boolean;
  dispose(): void;
  trigger(event: string): void;
  paused(): boolean;
  ended(): boolean;
  error(): unknown;
  error(value: { code: number; message: string }): void;
  play(): Promise<void> | undefined;
  pause(): void;
  currentTime(): number;
  currentTime(seconds: number): void;
  duration(): number;
  duration(seconds: number): void;
  playbackRate(): number;
  playbackRate(rate: number): void;
  loop(): boolean;
  loop(value: boolean): void;
  muted(): boolean;
  volume(): number;
  isFullscreen(): boolean;
  poster(url: string): void;
  src(source: PlayerSource): void;
  currentSrc(): string;
  currentSource(): { type?: string } | undefined;
  qualityLevels?(): QualityLevelList;
  bandwidth?(): number;
  addRemoteTextTrack(track: Record<string, unknown>, manualCleanup: boolean): void;
}

export type VideojsFactory = (video: HTMLVideoElement, options: Record<string, unknown>) => VjsPlayer;

/** The few things videos and follow entries share. Videos come from `/api/item`, follows from `/api/follow/item`. */
export interface PlayerItem {
  id: number;
  root_id?: string;
  library_id?: string;
  name?: string;
  title?: string;
  location?: string;
  cost?: string;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  follow_item_id?: number | null;
  media_type?: string;
  thumb_url?: string;
  [field: string]: unknown;
}

/** A quality tier the source reports itself (high to low). */
export interface SourceQuality { height: number; label?: string }
export interface MediaFacts { qualities?: SourceQuality[] | null; size?: number | null }
