/* The performer page's local roster identity filter: a set of small keys filtering the roster by identity, sharing this
 * vocabulary between the React page (`react/index/index-page.tsx`) and the entry skeleton (`index-skeleton.ts`).
 *
 * Changing the filter only changes the address and does not wait for data, so the skeleton holds the final look: the address
 * tier is primary and the rest secondary, just not yet wired. Which categories have people waits for counts, so the whole row
 * lays out first and the empty ones are removed once counts arrive. */
import { islandButton } from './island-skeleton';

export const IDENTITY_CATEGORIES: readonly (readonly [string, string])[] = [
  ['all', 'All'], ['japanese_av', 'Performers'], ['amateur', 'Amateur'], ['western', 'Western'], ['blogger', 'Adult web creators'], ['animation', 'Animation authors'],
];

/** The container classes of the page row; skeleton and page share the same string. */
export const IDENTITY_ROW_CLASS = 'mb-4 flex flex-wrap gap-2';

export function identityFilterSkeletonHtml(category: string): string {
  const known = IDENTITY_CATEGORIES.some(([key]) => key === category) ? category : 'all';
  const buttons = IDENTITY_CATEGORIES.map(([key, label]) => islandButton({
    variant: key === known ? 'primary' : 'secondary', size: 'small', label, attrs: `aria-pressed="${key === known}"`,
  })).join('');
  return `<div class="peach-react"><div aria-label="Identity categories" class="${IDENTITY_ROW_CLASS}">${buttons}</div></div>`;
}
