/** Board's Pagination (boardui.com `r/pagination.json`): previous/next are 32px secondary small keys, page numbers are 32×32
 *  cells with 8px radius, the current page borrows the secondary key's face (primary base, border-button outline, xs shadow),
 *  other numbers are text only with a base on hover; with many pages the sides fold into "...", keeping `sibling` neighbors
 *  each side of the current page. Number cells take no transitions: with background and shadow moving, the previous current
 *  page would visibly fade out on page change. */
export const DOTS = '…';

export function paginationRange(current: number, total: number, sibling = 1): (number | typeof DOTS)[] {
  const range = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
  // No wrapping when first page + last page + current page + both neighbors + the two '...' all fit.
  if (sibling * 2 + 5 >= total) return range(1, total);
  const left = Math.max(current - sibling, 1), right = Math.min(current + sibling, total);
  const leftDots = left > 2, rightDots = right < total - 2;
  if (!leftDots && rightDots) return [...range(1, 3 + 2 * sibling), DOTS, total];
  if (leftDots && !rightDots) return [1, DOTS, ...range(total - (2 + 2 * sibling), total)];
  return [1, DOTS, ...range(left, right), DOTS, total];
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

export function clampPage(page: number, pages: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), pages);
}

/** With a single page, render nothing (upstream returns null for `totalPages <= 1`). Clicks are handled by the host via `[data-page]`. */
export function paginationHtml(page: number, pages: number, label: string): string {
  if (pages <= 1) return '';
  const cells = paginationRange(page, pages).map(item => item === DOTS
    ? '<li class="ui-board-page-dots" aria-hidden="true">…</li>'
    : `<li><button type="button" class="ui-board-page" data-page="${item}" aria-label="Page ${item}"${item === page ? ' aria-current="page"' : ''}>${item}</button></li>`).join('');
  return `<nav class="board-pagination" aria-label="${label}">
    <button type="button" class="geist-button" data-page="${page - 1}"${page <= 1 ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron-left"></use></svg>Previous page</button>
    <ul>${cells}</ul>
    <button type="button" class="geist-button" data-page="${page + 1}"${page >= pages ? ' disabled' : ''}>Next page<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron-right"></use></svg></button>
  </nav>`;
}
