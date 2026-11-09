/* The summary block at the top of list pages (legacy `.collection-summary`): a name with one big number on the left, a
 * breakdown sentence on the right.
 *
 * Light mode is a filled panel on the page background; dark mode is one tier brighter than the page instead (the legacy
 * `html:not(.dark)` rule), 14px radius, no shadow. Below 600px it becomes two stacked rows.
 *
 * Before the number arrives, the big-number cell is a 96×32 shimmer placeholder (legacy
 * `.collection-summary strong .countskeleton`) at the same line height, so the block never changes height on arrival.
 * `flush` removes the gap below the block: when it lands in a container that spaces itself (the junk files count row, the
 * quality page where `Page` spaces itself), spacing belongs to that layer. The shell's first-screen skeleton
 * (`islandSummary` in `src/island-skeleton.ts`) copies this module's wait-state class names; changing here means changing
 * there too. */
export function CollectionSummary({ label, figure, detail = '', pending = false, flush = false }: {
  label: string; figure: string; detail?: string; pending?: boolean; flush?: boolean;
}) {
  return (
    <div data-collection-summary=""
      className={`${flush ? '' : 'mb-5 '}flex items-end justify-between gap-4 rounded-surface bg-background-secondary-default px-6 py-5
      max-compact:flex-col max-compact:items-start max-compact:gap-3 max-compact:p-4
      dark:bg-background-primary-default`}>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-body-regular text-text-secondary">{label}</span>
        <strong className="text-display-4-medium tabular-nums text-text-primary">
          {pending
            ? <span data-skeleton="count" aria-hidden className="relative inline-block h-8 w-24 rounded-2lg align-middle skeleton-sheen" />
            : figure}
        </strong>
      </div>
      {detail ? <p className="text-body-regular text-text-secondary">{detail}</p> : null}
    </div>
  );
}
