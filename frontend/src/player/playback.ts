/* The two steps shared by playback shortcuts and immersive gestures: toggle play, seek backward and forward.
 *
 * Native elements are driven directly rather than Video.js instances: the stage's, mini player's and immersive mode's
 * Video.js all read this element, and immersive stays a bare video when the player script cannot be reached, so one
 * implementation covers all. Readers are the shell's keyboard (whichever `Application`'s `activeVideo()` returns) and the
 * immersive island's single and double clicks. */

export function toggleVideoPlayback(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  if (video.paused) video.play()?.catch(() => {}); else video.pause();
}

/** Seeks forward or back some seconds, clamped between 0 and the total length. */
export function seekVideoBy(video: HTMLVideoElement, seconds: number): void {
  const total = video.duration;
  const target = (video.currentTime || 0) + seconds;
  // duration is NaN before metadata lands; clamp only the lower bound then, and never compare NaN against the upper bound.
  video.currentTime = Number.isFinite(total) ? Math.max(0, Math.min(total, target)) : Math.max(0, target);
}
