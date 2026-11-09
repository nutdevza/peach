/* The junk files page's count row: a summary panel (how many in this view, this category) and a category bar.
 *
 * Which categories exist, which is selected, and whether this is pending or excluded are all decided by the address, so the
 * final look is available while data is pending; only the number in the summary and the per-category count badges change with
 * the request, and they yield to placeholders until data arrives. The version the shell lays before the React bundle loads
 * (`junkCountSkeletonHtml` in `src/junk-queue.ts`) is item-for-item identical to this one's wait state.
 *
 * The category bar is the home filter bar's pair: a glass overlay with a sliding pane of glass under the current category,
 * sliding to the key under the pointer on hover (`components/use-view-glide.ts`). The "Excluded / back to pending" to the
 * right of the divider is a view switch, outside this glass: in the excluded view it and "All" are current at the same time,
 * and it rests on a same-material glass pane of its own.
 *
 * Categories are still `<a href>`: they must land in the address, survive deep links and refresh, and middle-click and
 * modifier keys open new tabs per browser defaults. A plain left click goes to the shell, which exits multi-select, writes
 * the address and re-reads. A category with a zero count does not paint its badge at all. */
import { useRef, type MouseEvent } from 'react';

import { JUNK_KIND_OPTIONS, junkPath, junkSummaryLabel, junkViewLink } from '../../junk-queue';
import { CollectionSummary } from '../components/collection-summary';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import { useViewGlide } from '../components/use-view-glide';
import { junkCount, type JunkPage, type JunkRoute } from './junk-queue';
import { t } from '../../i18n';

function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}

function Badge({ scope, count }: { scope: string; count: number }) {
  if (!count) return null;
  return <>{' '}<span data-count-badge={`junk:${scope}`}>{count.toLocaleString()}</span></>;
}

export function JunkCount({ route, page, failed, onNavigate }: {
  route: JunkRoute; page: JunkPage | undefined; failed: boolean; onNavigate(path: string): void;
}) {
  const nav = useOverlayScrollbar<HTMLElement>();
  const pane = useRef<HTMLSpanElement>(null);
  const { kind, view } = route;
  /* When a count badge arrives or counts change after a batch is judged, each chip's width changes: those numbers go into the key too, and the glass repositions. */
  const counts = page ? JUNK_KIND_OPTIONS.map(([key]) => junkCount(page, key)).join(',') : '';
  const glide = useViewGlide(pane, nav, '[data-junk-kind-link][aria-current="page"]', `${view}:${kind}:${counts}`);
  const other = junkViewLink(view);
  const click = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement).closest('a');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(link.getAttribute('href') || junkPath());
  };
  /* No spinner once a read fails: the reason goes in the grid cell, and this only says "no data". */
  const figure = page ? t('cleanup:junk.countFigure', { count: Number(page.total || 0) }) : failed ? '—' : '';
  return (
    <div data-junk-count="">
      <div data-junk-summary="" aria-live="polite">
        <CollectionSummary label={junkSummaryLabel(view)} figure={figure} pending={!page && !failed} flush />
      </div>
      <div data-junk-filters-frame="" data-filter-glass="" data-glass-pane="">
        <span ref={pane} data-view-glide="" aria-hidden="true" />
        <nav ref={nav} data-junk-filters="" aria-label={t('cleanup:junk.categories')} onClick={click} onPointerLeave={glide.leave}>
          {JUNK_KIND_OPTIONS.map(([key, label, glyph]) => (
            <a key={key || 'all'} href={junkPath(key, view)} data-junk-kind-link={key}
              aria-current={key === kind ? 'page' : undefined} onPointerEnter={glide.hover}>
              <Icon name={glyph} />{label}<Badge scope={key} count={page ? junkCount(page, key) : 0} />
            </a>
          ))}
          <i data-junk-divider="" aria-hidden="true" />
          <a href={other.href} data-junk-view-link={other.view} aria-current={view === 'dismissed' ? 'page' : undefined}
            onPointerEnter={view === 'dismissed' ? undefined : glide.hover}>
            <Icon name={other.glyph} />{other.label}<Badge scope="dismissed" count={Number(page?.dismissed_total || 0)} />
          </a>
        </nav>
      </div>
    </div>
  );
}
