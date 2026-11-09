/* The first-screen skeletons of the data-management second-level pages (organize files, resource sync, records of lost files, link management, bulk delete).
 * Each page is drawn after its own React card: the same Fieldset or data-table frame, the same `max-w-board` content width;
 * titles, descriptions, and headers are static text, written out directly; counts, readouts, library names, and templates wait on the data, so only draw placeholders.
 * The description text shares these constants with the React card; writing two copies would make that section on the skeleton a bit shorter than the real card, and the whole card would jump once on takeover.
 * Result sections that only appear after running a task (scan conclusion, dead-link list) are not pre-drawn. */
import { followCheck, SORT_MARK } from './board-skeleton';
import { islandButton, islandGlyph, islandSearchInput, islandSelect } from './island-skeleton';
import type { CleanupToolKey } from './cleanup-tools';
import { cardClass } from './react/components/card';
import { FIELDSET_BODY, FIELDSET_FOOT, fieldsetClass } from './react/components/fieldset-layout';
import { repairCardSkeletonHtml } from './management';
import { t } from './i18n';

export const ORGANIZE_TEXT = t('cleanup:organize.description');
export const ORGANIZE_SCOPE_HINT = t('cleanup:organize.scopeHint');
export const ORGANIZE_PARAMETER_HINT = t('cleanup:organize.parameterHint');
export const RESOURCE_SYNC_TEXT = t('cleanup:resourceSync.description');
export const ORPHAN_RECORDS_TEXT = t('cleanup:orphans.description');
export const BATCH_DELETE_TEXT = t('cleanup:performerDelete.description');

const WAITING = 'disabled data-skeleton-action';
const text = (width: string) => `<span class="skeleton skeleton-text" style="width:${width}"></span>`;
const block = (width: number, height: number, round = false) =>
  `<span class="skeleton" style="width:${width}px;height:${height}px;flex:none${round ? ';border-radius:50%' : ''}"></span>`;
const title = (label: string, gap: '' | 'mb-2' | 'mb-3') =>
  `<h3 class="text-title-2-medium text-text-primary${gap ? ` ${gap}` : ''}">${label}</h3>`;

/** The Board UI Input medium size in its resting state: can carry a block-level label; the box shows placeholder text or a data-waiting placeholder bar. */
const input = (content: string, { label = '', className = '' } = {}) => `<div data-input-size="medium" class="group flex h-max w-full flex-col items-start gap-1${className ? ` ${className}` : ''}">${
  label ? `<span class="flex items-center gap-0.5 text-body-medium text-text-primary">${label}</span>` : ''
}<div class="relative flex w-full items-center rounded-2lg bg-background-tertiary-default text-foreground-icon-tertiary ring-2 ring-inset ring-transparent p-2"><div class="flex w-full items-center gap-2 min-w-0"><div class="flex flex-1 items-center gap-0.5 min-w-0"><span class="flex min-w-0 flex-1 items-center pl-1 font-sans text-body-regular text-text-tertiary">${content}&#8203;</span></div></div></div></div>`;

/* Presets and parameters are two fixed-length tables in `src/peach/organize.py`, nine entries each; the names follow the data, keys are first drawn as placeholders at a small size,
   and the width is taken from the character counts of the two tables (parameter keys additionally sized for the monospaced `{key}`), so the wrap point lands where the real key does. */
const PRESET_WIDTHS = ['3em', '5em', '5em', '6em', '7em', '7em', '8em', '8em', '10em'];
const PARAMETER_WIDTHS = ['5.8em', '6.4em', '7em', '7em', '7em', '8.1em', '5.8em', '9em', '9em'];
const smallKey = (variant: 'secondary' | 'ghost', width: string) =>
  islandButton({ variant, size: 'small', label: text(width) });

/* In the beat where the skeleton fades out, it's on the page with the real card, so it carries no id or data-* used for test card recognition; only the markers that determine styling remain. */
function organize(): string {
  return `<section class="${fieldsetClass('stack')}">
    <div class="${FIELDSET_BODY.stack}">${title(t('cleanup:organize.title'), 'mb-3')}
      <p class="text-body-regular text-text-secondary">${ORGANIZE_TEXT}</p>
      <div class="mt-3 flex flex-col gap-3">
        <div class="flex min-w-0 flex-wrap items-start gap-2">${islandSelect(text('3em'), { prefix: t('cleanup:organize.storagePrefix'), className: 'w-fit min-w-25', attrs: 'aria-disabled="true"' })}
          <div class="flex min-w-0 basis-64 flex-1 items-start gap-2">${input(t('cleanup:organize.pathPlaceholder'), { className: 'min-w-0 flex-1' })}<button type="button" class="relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-2lg bg-background-primary-default text-foreground-icon-primary border border-border-button-default shadow-xs size-9">${islandGlyph('folder-search', 'size-5 shrink-0')}</button></div>
        </div>
        <p class="text-caption-1-regular text-text-secondary">${ORGANIZE_SCOPE_HINT}</p>
        ${input(text('12em'), { label: t('cleanup:organize.fileTemplate') })}${input(text('8em'), { label: t('cleanup:organize.dirTemplate') })}
        <div class="flex flex-col gap-2"><p class="text-caption-1-medium text-text-secondary">${t('cleanup:organize.applyPreset')}</p><div class="flex flex-wrap gap-2">${PRESET_WIDTHS.map(width => smallKey('secondary', width)).join('')}</div></div>
        <p class="text-caption-1-regular text-text-secondary">${t('cleanup:organize.examplePath')}${text('16em')}</p>
        <div class="flex flex-col gap-2"><p class="text-caption-1-regular text-text-secondary"><strong class="text-caption-1-semibold text-text-primary">${t('cleanup:organize.insertParameter')}</strong>${t('cleanup:organize.insertTarget', { target: t('cleanup:organize.fileTemplate') })}</p><div class="flex flex-wrap gap-1">${PARAMETER_WIDTHS.map(width => smallKey('ghost', width)).join('')}</div></div>
        <p class="text-caption-1-regular leading-4.5 text-text-secondary">${ORGANIZE_PARAMETER_HINT}</p>
      </div>
    </div>
    <footer class="${FIELDSET_FOOT.stack}">${islandButton({ label: t('cleanup:organize.preview'), attrs: WAITING })}</footer>
  </section>`;
}

/* The key names follow the previous scan (Check files / Rescan); the skeleton draws the first-visit version. */
const resourceSync = () => `<section class="flex scroll-mt-20 flex-col gap-4">
  <section class="${fieldsetClass('split')}"><div class="${FIELDSET_BODY.split}">${title(t('cleanup:tools.resourceSync'), 'mb-2')}
    <p class="max-w-190 text-body-2-regular leading-5 text-text-secondary">${RESOURCE_SYNC_TEXT}</p></div>
    <footer class="${FIELDSET_FOOT.split}">${islandButton({ glyph: 'git-compare', label: t('cleanup:resourceSync.checkFiles'), attrs: WAITING })}</footer></section>
</section>`;

/** That card in link management: a four-tile reading (total and three link types) plus data like the three main sites, and the key names are likewise rendered as the first version. */
const linkStat = (label: string, note = false) => `<div class="flex min-w-0 flex-col gap-0.5"><span class="text-caption-1-regular leading-5 text-text-secondary">${label}</span><b class="text-title-2-semibold font-bold leading-5 tabular-nums text-text-primary">${text('3em')}</b>${note ? `<small class="text-caption-1-regular leading-5 text-text-secondary">${text('14em')}</small>` : ''}</div>`;
const links = () => `<section class="flex scroll-mt-20 flex-col gap-4">
  <section class="${fieldsetClass('stack')}"><div class="${FIELDSET_BODY.stack}">${title(t('cleanup:tools.links'), 'mb-2')}
    <div class="link-stat-grid mt-4 gap-x-8 gap-y-3">${linkStat(t('cleanup:links.totalLinks'), true)}${[0, 1, 2].map(() => linkStat(text('5em'))).join('')}</div>
    <div class="mt-4 flex min-w-0 flex-col gap-0.5"><span class="text-caption-1-regular text-text-secondary">${t('cleanup:links.topSites')}</span><div class="flex min-w-0 flex-wrap gap-x-5 gap-y-2">${
      ['7em', '10em', '8em'].map(width => `<span class="inline-flex min-w-0 items-center gap-1.5 text-body-2-medium">${block(16, 16)}${text(width)}${block(28, 24)}</span>`).join('')}</div></div></div>
    <footer class="${FIELDSET_FOOT.stack}">${islandButton({ glyph: 'link', label: t('cleanup:links.checkLinks'), attrs: WAITING })}</footer></section>
</section>`;

/** The loading state of `DataTable`: inside a skeleton card, a toolbar row, the description, the header and a few placeholder rows, and the pagination row; column widths take the column definitions' default widths.
 *  Tables with resizable columns are `table-layout: fixed`: the first column has no width written and absorbs the remaining width; the table's minimum width is the sum of each column's default width,
 *  and on narrow screens it scrolls horizontally just like the real table. The trailing cell's row whitespace is compressed to 0; the pagination keys wait on the total to know how many pages, so don't draw them. */
interface TableColumn { label: string; width: number; cell: string }
function dataTable({ title: name, description, search = '', columns, rows }:
  { title: string; description: string; search?: string; columns: TableColumn[]; rows: number }): string {
  const least = columns.reduce((sum, { width }) => sum + width, 48);
  const head = `<th style="width:48px"><span class="flex items-center gap-0.5">${followCheck()}</span></th>${columns.map(({ label, width }, index) =>
    `<th${index ? ` style="width:${width}px"` : ''}><span class="flex items-center gap-0.5">${label}<span data-sort-indicator>${SORT_MARK}</span></span></th>`).join('')}<th data-table-space style="width:0"></th>`;
  const row = `<tr><td>${followCheck()}</td>${columns.map(({ cell }) => `<td>${cell}</td>`).join('')}<td data-table-space></td></tr>`;
  const searchBox = search ? `<div data-index-search class="ml-auto min-w-0 max-w-80 flex-1">${islandSearchInput('', '', search)}</div>` : '';
  return `<div data-data-table-panel class="${cardClass({ padding: 'none', className: 'flex flex-col gap-4 px-6 py-5 max-sm:px-4' })}">
    <div data-responsive-toolbar><div data-toolbar-heading>${title(name, '')}<span class="text-body-2-regular tabular-nums text-text-secondary">${text('4em')}</span></div>
      <div data-toolbar-actions>${searchBox}<div class="flex flex-none gap-2">${islandButton({ variant: 'secondary', label: 'Show columns' })}${islandButton({ variant: 'secondary', label: 'Reset column widths' })}</div>
        <span class="flex flex-none items-center gap-2">${islandSelect('Default order', { prefix: 'Sort' })}${islandButton({ variant: 'secondary', glyph: 'arrow-up', attrs: WAITING })}</span></div></div>
    <p class="text-body-2-regular text-text-secondary">${description}</p>
    <div data-board-data-table data-resizable-table data-follow-table><div class="relative min-w-0"><div class="w-full overflow-x-auto"><table class="bui-table bui-table-sm" style="min-width:${least}px"><thead><tr>${head}</tr></thead><tbody>${row.repeat(rows)}</tbody></table></div></div></div>
    <div data-table-pagination class="flex flex-wrap items-center justify-between gap-3"><span class="mr-auto text-body-2-regular tabular-nums text-text-secondary">${text('8em')}</span><div data-toolbar-actions>${islandSelect('20 per page', { size: 'sm' })}</div></div>
  </div>`;
}

const twoLines = (first: string, second: string) => `<span class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="text-body-regular">${text(first)}</span><small class="text-caption-1-regular">${text(second)}</small></span>`;
const orphanRecords = () => `<section class="flex scroll-mt-20 flex-col gap-4">${dataTable({
  title: t('cleanup:tools.orphanRecords'), description: ORPHAN_RECORDS_TEXT, rows: 4,
  columns: [
    { label: t('cleanup:shared.video'), width: 480, cell: `<span class="flex min-w-0 items-center gap-3"><span class="skeleton flex-none rounded-lg max-cleanup-tight:hidden" style="width:96px;height:60px"></span>${twoLines('70%', '40%')}</span>` },
    { label: t('cleanup:orphans.columnActivity'), width: 176, cell: text('6em') },
    { label: t('cleanup:shared.actions'), width: 128, cell: islandButton({ variant: 'secondary', size: 'small', label: t('cleanup:orphans.deleteRecord'), attrs: WAITING }) },
  ],
})}</section>`;

const batchDelete = () => `<section class="flex min-w-0 scroll-mt-20 flex-col gap-3">${dataTable({
  title: t('cleanup:tools.bulkDelete'), description: BATCH_DELETE_TEXT, search: t('cleanup:performerDelete.search'), rows: 12,
  columns: [
    { label: t('cleanup:shared.actress'), width: 280, cell: `<span class="flex min-w-0 items-center gap-3">${block(32, 32, true)}${text('5em')}</span>` },
    { label: t('cleanup:shared.videos'), width: 104, cell: text('3em') },
    { label: t('cleanup:shared.files'), width: 104, cell: text('3em') },
    { label: t('cleanup:performerDelete.columnSize'), width: 136, cell: text('4em') },
  ],
})}</section>`;

const BODIES: Record<CleanupToolKey, { label: string; body: () => string }> = {
  organize: { label: t('cleanup:organize.loading'), body: organize },
  'resource-sync': { label: t('cleanup:resourceSync.statusLoading'), body: resourceSync },
  'orphan-records': { label: t('cleanup:orphans.loading'), body: orphanRecords },
  'media-repair': { label: t('cleanup:mediaRepair.loading'), body: repairCardSkeletonHtml },
  links: { label: t('cleanup:links.loading'), body: links },
  'batch-delete': { label: t('cleanup:performerDelete.loadingLabel'), body: batchDelete },
};

/** Second-level page skeleton: the outer layer is the screen reader's waiting state; the inner column is the same width and spacing as the React Page, the whole block inert. */
export function cleanupToolSkeletonHtml(key: CleanupToolKey): string {
  const { label, body } = BODIES[key];
  return `<div class="peach-react" data-skeleton="cleanup/${key}" aria-busy="true" role="status" aria-label="${label}"><div aria-hidden="true" inert class="mx-auto flex w-full max-w-board flex-col gap-8">${body()}</div></div>`;
}
