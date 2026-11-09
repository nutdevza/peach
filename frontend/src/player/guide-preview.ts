let active = false;

/** The tour only displays real player controls; it doesn't modify persistent preferences or read the video content. */
export const isPlayerGuidePreview = () => active;
export function beginPlayerGuidePreview(): () => void {
  active = true;
  return () => { active = false };
}
