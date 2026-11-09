/* How the image inside the round frame is written when `avatarInner`'s (`card-art/markup.ts`) avatar lands in a React island.
 *
 * The image fills the round frame, cropped by cover. With a face box, `avatarFrame` (`card-art/framing.ts`) writes inline
 * left/top/width/height percentages onto the image at load, zooming the face into the frame, with width often above 100%.
 * Tailwind preflight in the island gives every image `max-width:100%`; without releasing it, the width is clamped back to the
 * frame width while the height still scales, pushing the face left and exposing the initial letter underneath on the right.
 * The legacy layer's own `.searchface img` has no such preflight. */
export const LEGACY_AVATAR_IMG =
  '[&_img]:absolute [&_img]:inset-0 [&_img]:size-full [&_img]:max-w-none [&_img]:max-h-none [&_img]:object-cover';
