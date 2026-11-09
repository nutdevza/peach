import { emptyStateHtml } from '@peach/legacy/ui';
import { unfilteredWallAddress } from './wall-route';
import { catalogEmptyHtml } from '../../catalog-onboarding';

/** The media library, filter results, and covers each express their own empty state. */
export function wallEmptyHtml({ libraryEmpty, matches, hasMore, catalogEmpty }: {
  libraryEmpty: boolean; matches: number; hasMore: boolean; catalogEmpty?: string;
}): string {
  if (libraryEmpty) return catalogEmpty || catalogEmptyHtml();
  if (!matches) return emptyStateHtml('search', 'No videos match the filter conditions', 'Clear filter conditions to see every video.', {
    actions: `<a class="geist-button primary" href="${unfilteredWallAddress()}">Clear filters</a>`,
  });
  return emptyStateHtml('image', 'These videos have no covers yet', hasMore
    ? 'Load more videos to keep browsing.' : 'After completing a video\'s cover it can be viewed in the video wall.', {
    actions: '<a class="geist-button primary" href="/data-cleanup">Complete covers</a>'
      + (hasMore ? '<button type="button" class="geist-button" data-wall-load-more>Load more</button>' : ''),
  });
}
