/* Each immersive slide's player: only the media itself stays. The progress bar, loading hint and action keys are drawn by the
 * immersive island itself, so Video.js mounts bare, with no control bar, poster, spinner or error layer.
 *
 * The stream source shares the details' criterion (`playableStreamSource`); only Video.js can play videos needing transcode
 * segments, and segment errors fall back to direct read, the same fallback as the details player. Each slide gets one stream
 * session built by the caller and passed in: tearing the slide down cancels by session, and the caller also cancels by it on
 * page leave. */
import { disposePlayer } from './dispose';
import { cancelStreamSession, directStreamSource, playableStreamSource } from './stream';
import { stopTelemetry, wireTelemetry } from './telemetry';
import type { PlayerItem, VjsPlayer } from './types';
import { ensureVideojs } from './videojs';
import { mountPlayerSubtitles } from './controls';
import { playbackKey } from './progress';
import { SubtitleSession } from './subtitle-memory';
import { mountCaptionStyle } from './subtitle-style';
import { mountPlaybackRate, playerMemory } from './memory';
import { mountPlayerRotation } from './rotation';

export interface ImmersePlayerOptions {
  kind: 'immerse';
  item: PlayerItem;
  /** This cell's stream session (`newStreamSession()`). */
  session: string;
  /** After playback ends (immersive mode goes on to the next one). */
  onEnded?: () => void;
  /** The stream has been handed to the video element: from this moment the caller can wait for picture. Not called when teardown beats stream resolution. */
  onLoaded?: () => void;
}

const BARE = {
  controls: false, preload: 'auto', posterImage: false, titleBar: false, textTrackDisplay: false, loadingSpinner: false,
  bigPlayButton: false, controlBar: false, errorDisplay: false, textTrackSettings: false,
};

export function mountImmersePlayer(video: HTMLVideoElement, options: ImmersePlayerOptions): () => void {
  const { item, session } = options;
  let player: VjsPlayer | null = null, released = false;
  void Promise.all([playableStreamSource(item, session), ensureVideojs().catch(() => null)]).then(([source, vjs]) => {
    if (released) return;
    const direct = directStreamSource(item, session);
    const segmented = String(source.type || '').includes('mpegurl');
    // When the player script cannot load, fall back to the native video element; it cannot play segmented streams, only direct reads.
    if (!vjs) video.src = (segmented ? direct : source).src;
    else {
      const mounted = vjs(video, BARE);
      player = mounted;
      mounted.peachItem = item;
      mounted.peachPlaybackKey = playbackKey('item', item);
      const captions = new AbortController();
      mountCaptionStyle(mounted.el(), video, captions.signal, playerMemory(mounted));
      mountPlayerRotation(mounted, video);
      mountPlaybackRate(mounted, video);
      mounted.on('dispose', () => captions.abort());
      new SubtitleSession(mounted, video);
      mountPlayerSubtitles(mounted, item.id);
      if (segmented) mounted.one('error', () => { if (!released) mounted.src(direct) });
      mounted.src(source);
    }
    wireTelemetry(item, video, options.onEnded ? { onEnded: options.onEnded } : {});
    options.onLoaded?.();
  });
  return () => {
    if (released) return;
    released = true;
    cancelStreamSession(session);
    if (player) disposePlayer(player);
    else { video.pause(); stopTelemetry(video); video.removeAttribute('src'); video.load() }
  };
}
