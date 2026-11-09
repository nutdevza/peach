/* Progress bar for known totals. The update download, job activity, and the stats page's coverage and capacity share it.
 *
 * The registry has no progress component, so SVG rects are used: width is written proportionally into the `rect`'s attribute,
 * no inline styles, so `no-inline-styles` needs no exception. Differences registered in `../boardui/ORIGIN.md`.
 *
 * The canvas is fixed at `SCALE` cells wide, with fill and ticks first converted into its units; the screen-reader value
 * carries the real unit. Byte-based capacity reaches the trillions, and writing it directly as the `viewBox` width makes
 * Chrome draw a zero-width rect. */

/** Canvas width: fills and ticks both convert into this many parts. */
const SCALE = 100;
/** The width of one tick, measured in `SCALE`. */
const STOP_WIDTH = 0.4;

/** `tinted`: when placed on the gray background of a callout bar, the track overlays the text color with a light layer, slightly darker than the background (slightly lighter in dark mode), not blending into the background.
 *
 * `meter`: it draws a quantity within a known range (space usage, coverage, proportion), not a task progressing toward completion. Screen readers read
 * `progressbar` as "in progress", so this kind of reading switches to `meter`; the drawing is unchanged (same as BoardUI Meter). */
export function Progress({ label, value, max = 100, stops = [], tinted = false, meter = false }: {
  label: string; value: number; max?: number; stops?: number[]; tinted?: boolean; meter?: boolean;
}) {
  const total = max > 0 ? max : 1;
  const clamp = (at: number) => Math.min(Math.max(Number.isFinite(at) ? at : 0, 0), total);
  const share = (at: number) => (clamp(at) / total) * SCALE;
  /* The screen-reader value is clamped to [0, max] like the visual: reading an overrun as "150 / 100" would be taken as a miscalculation. */
  return (
    <svg role={meter ? 'meter' : 'progressbar'} aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={clamp(value)}
      viewBox={`0 0 ${SCALE} 1`} preserveAspectRatio="none" className="h-1.5 w-full overflow-hidden rounded-full">
      <rect width={SCALE} height={1} className={tinted ? 'fill-text-primary/10' : 'fill-background-tertiary-default'} />
      <rect width={share(value)} height={1} className="fill-border-focus-ring" />
      {stops.map((stop) => <rect key={stop} x={share(stop)} width={STOP_WIDTH} height={1} className="fill-background-secondary-default" />)}
    </svg>
  );
}
