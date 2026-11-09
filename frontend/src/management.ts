import { islandButton, islandGlyph, islandSelect } from './island-skeleton';
import { FIELDSET_BODY, FIELDSET_FOOT, fieldsetClass, type FieldsetLayout } from './react/components/fieldset-layout';
import { CLEANUP_TOOLS } from './cleanup-tools';
import { CLEANUP_ENTRY, CLEANUP_ENTRY_GRID } from './react/data-cleanup/cleanup-entry';
import { PLAIN_STAT_STRIP, plainStatClass } from './react/components/stat-card';

/* Body copy for the "Scan and collect" and "Media repair" cards. The card body is rendered by React, and the skeleton and the legacy layer's fetch placeholder
   draw the same passage: with two copies, the skeleton's sentence would run shorter than the real card and the whole card would jump at takeover. */
export const SCAN_CARD_TEXT = 'New files found; fetch profiles and previews for new and unfinished videos. First choose a library, then the sync scope.';
export const REPAIR_CARD_TEXT = 'Some video files may stutter or fail to open; fixes missing timestamp tables and missing indexes.';

const bar = '<span class="skeleton skeleton-text" aria-hidden="true"></span>';
/* Keys that need data to execute are genuinely unpressable: native `disabled` blocks click and focus, and `data-skeleton-action`
   gives each tier's keys a unified disabled face in the skeleton (`board.css`), at the final tier's size, so data's arrival only swaps colors. */

/* The skeletons of the two React cards live in the same `.peach-react` layer; keys and dropdowns are drawn to Board UI dimensions (see
   `island-skeleton.ts`). The card layer's structure copies the two React cards: an outer column with `gap-4`, title and body
   sharing one pair of text styles. The dropdown holds only a placeholder bar, not a control; `aria-disabled` is enough. */
const waitingAction = 'disabled data-skeleton-action';
const unavailable = 'aria-disabled="true"';
const island = (card: string) => `<div class="peach-react"><div class="flex flex-col gap-4">${card}</div></div>`;
const cardText = (title: string, text: string, layout: FieldsetLayout, controls = '') => `<div class="${FIELDSET_BODY[layout]}"><div class="flex flex-col gap-2">
          <h3 class="text-title-2-medium text-text-primary">${title}</h3>
          <p class="text-body-2-regular text-text-secondary">${text}</p>${controls}</div></div>`;

/** The "Scan and collect" card: the same container, body copy and keys as the React `LibraryProcessingCard`.
 *  "Review profiles" only appears when candidates exist and is not pre-drawn here. */
export function scanCardSkeletonHtml(): string {
  const links = [['/sources', 'Sources and credentials'], ['/settings/diagnostics', 'Diagnostics and logs']]
    .map(([href, label]) => `<a href="${href}" class="inline-flex items-center justify-center gap-1 whitespace-nowrap font-sans rounded-sm text-body-medium text-accent-600"><span>${label}</span>${islandGlyph('arrow-up', 'size-(--icon-inline) shrink-0 rotate-90')}</a>`).join('');
  return island(`<section aria-label="Scan and collect" class="${fieldsetClass('stack')}" data-cleanup-task data-cleanup-processing>
        ${cardText('Scan and collect', SCAN_CARD_TEXT, 'stack', `<div class="w-full max-w-80"><p class="mb-1 text-body-2-medium text-text-secondary">Library</p>${islandSelect(bar, { attrs: `${unavailable} aria-label="Library"` })}</div>`)}
        <footer class="${FIELDSET_FOOT.stack}">${links}<span data-button-group data-split-button data-variant="primary">${islandButton({ label: 'Sync new files', attrs: waitingAction })}${islandButton({ glyph: 'chevron-down', attrs: `${waitingAction} aria-label="More ways to sync"` })}</span></footer>
      </section>`);
}

/** The "Media repair" card: the footer's library select is drawn at final size first, with the library name waiting on data; "Start repair" waits for a chosen
 *  library, so the skeleton shows it disabled. */
export function repairCardSkeletonHtml(): string {
  return island(`<section aria-label="Media repair" class="${fieldsetClass('split')}" data-cleanup-task data-cleanup-processing>
        ${cardText('Media repair', REPAIR_CARD_TEXT, 'split')}
        <footer class="${FIELDSET_FOOT.split}">${islandSelect(bar, { className: 'w-48', attrs: unavailable })}${islandButton({ label: 'Start repair', attrs: waitingAction })}</footer>
      </section>`);
}

/** The home-page skeleton and the final page share the tool order; the full form, results, and list load on the sub-page. */
export function cleanupSkeletonHtml(): string {
  const entry = (label: string, glyph: string, summary: string, detail = '') => `<div class="${CLEANUP_ENTRY.face}"><span class="${CLEANUP_ENTRY.icon}">${islandGlyph(glyph, 'size-5')}</span><span class="${CLEANUP_ENTRY.body}"><span class="${CLEANUP_ENTRY.title}">${label}</span><span class="${CLEANUP_ENTRY.summary}">${summary}</span>${detail ? `<span class="${CLEANUP_ENTRY.detail}">${detail}</span>` : ''}</span>${islandGlyph('chevron-right', CLEANUP_ENTRY.arrow)}</div>`;
  const stat = (label: string, glyph: string) => `<div class="${plainStatClass()}"><span class="flex min-w-0 items-center gap-2 text-body-medium text-text-secondary"><i class="flex size-8 shrink-0 items-center justify-center rounded-md bg-background-primary-default text-text-primary">${islandGlyph(glyph, 'size-4')}</i><span>${label}</span></span><strong class="block text-title-1-medium tabular-nums text-text-primary">${bar}</strong><span class="block min-h-4 text-caption-1-regular text-text-tertiary">${bar}</span></div>`;
  const heading = (label: string) => `<h2 class="text-title-2-medium! m-0! text-text-primary">${label}</h2>`;
  const tools = (deletion: boolean) => CLEANUP_TOOLS.filter(tool => (tool.key === 'batch-delete') === deletion)
    .map(tool => entry(tool.title, tool.icon, tool.description)).join('');
  return `<div class="peach-react" data-skeleton="cleanup" aria-busy="true" role="status" aria-label="Loading the data management status"><div aria-hidden="true" inert class="mx-auto flex w-full max-w-board flex-col gap-8">
    <section class="flex flex-col gap-4">${heading('Pending review')}<div class="${PLAIN_STAT_STRIP}">${[['Manual review', 'square-check-big'], ['Duplicates', 'file-stack'], ['Junk files', 'file-archive'], ['Better versions', 'sparkles'], ['Trash', 'trash']].map(([label, glyph]) => stat(label!, glyph!)).join('')}</div></section>
    <div id="libraryProcessing" class="scroll-mt-20">${scanCardSkeletonHtml()}</div>
    <section class="flex flex-col gap-4">${heading('Organize and maintain')}<div class="${CLEANUP_ENTRY_GRID}">${tools(false)}</div></section>
    <section class="flex flex-col gap-4">${heading('Clean up and delete')}<div class="${CLEANUP_ENTRY_GRID}">${tools(true)}</div></section>
    </div></div>`;
}
