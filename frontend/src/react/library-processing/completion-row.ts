/* Whether the missing-image notice appears is only known once data arrives. The client remembers whether the last list carried the row, the waiting state reserves the same height on that basis, and the table does not shift when the data lands. */
const KEY = 'peach.catalog.completion-row';

export function completionRowRemembered(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function rememberCompletionRow(shown: boolean): void {
  try { if (shown) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* The current page still displays as usual. */ }
}

/** The reserved row matches the hint bar's height: one line of body text plus a default-size button, 8px padding above and below. */
export const COMPLETION_ROW_SKELETON_HTML = '<i data-completion-skeleton class="skeleton-sheen"></i>';
