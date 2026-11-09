/* Loading Dots (`peach-web-ui`) for a background job still advancing with no total to speak of.
 *
 * Not a Spinner: a Spinner only answers the click the user just made. No denominator-free progress bar either.
 * The three dots' stagger comes from `../styles.css`'s `dot-wave-*`, and reduce motion turns the animation off globally.
 * The dots are already moving, so `label` carries no ellipsis. */

export function LoadingDots({ label }: { label: string }) {
  return (
    <p role="status" className="flex min-w-0 items-center gap-2 text-caption-1-regular text-text-secondary">
      <span aria-hidden className="inline-flex shrink-0 items-center gap-1">
        <i className="dot-wave-0 size-1 rounded-full bg-current" />
        <i className="dot-wave-1 size-1 rounded-full bg-current" />
        <i className="dot-wave-2 size-1 rounded-full bg-current" />
      </span>
      <span className="min-w-0 wrap-anywhere">{label}</span>
    </p>
  );
}
