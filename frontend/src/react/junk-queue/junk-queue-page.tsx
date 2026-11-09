/* Junk files queue (`/junk-files`, rendered by the route tree into `#grid`): a count row plus a screen of one-item-at-a-time
 * disposition cards.
 *
 * The page renders in the shell's `#grid`, and the count row portals into a `.peach-react` container it builds inside
 * `#count`: the row itself belongs to the shell (the catalog page uses it too and the shell clears it on page change), while
 * the summary and category bar inside belong here.
 *
 * The first screen does not wait inside `prefetch`. The category bar is decided by the address and its final look is drawable
 * right now; only the readouts wait, so it renders on open: the count row is in wait state (`#count[aria-busy]`, one
 * placeholder in the summary) and the grid is the shell's skeleton; when data arrives the skeleton fades and cards sharpen
 * out of blur (same as the catalog grid). Waiting inside `prefetch` would leave only the shell's static skeleton on screen
 * while the request hangs, with categories unclickable.
 *
 * Changing category or view changes the query key; the grid remounts per the new key and relays its skeleton. When the shell
 * advances `revision` after a disposition, the query also changes keys, but the old copy stays on screen until the new one
 * arrives (`placeholderData`); the disposed card vanishes in place and the sections already scrolled into view are not pulled
 * back. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { requestErrorMessage } from '@peach/legacy/core';
import { LOAD_MORE_STATUS, loadingDotsHtml, popBadges } from '@peach/legacy/ui';
import { ButtonLink } from '@/components/base/buttons/button';

import { EmptyState } from '../components/empty-state';
import { LOAD_MORE_MARGIN, RetryNote, useSkeletonReveal } from '../components/grid-reveal';
import { spriteGlyph } from '../components/sprite-glyph';
import { JunkCard } from './junk-card';
import { JunkCount } from './junk-count';
import { fetchJunkPage, junkQueryKey, type JunkPage, type JunkQueueProps, type JunkRoute } from './junk-queue';
import { t } from '../../i18n';

const CheckGlyph = spriteGlyph('check');

const sameRoute = (key: readonly unknown[], route: JunkRoute) => key[1] === route.view && key[2] === route.kind;

export function JunkQueuePage(props: JunkQueueProps) {
  const route: JunkRoute = { kind: props.kind, view: props.view };
  const query = useQuery<JunkPage, Error>({
    queryKey: junkQueryKey(route, props.revision),
    queryFn: ({ signal }) => fetchJunkPage(route, signal),
    placeholderData: (previous, previousQuery) =>
      (previousQuery && sameRoute(previousQuery.queryKey, route) ? previous : undefined),
  });

  /* Tell the shell once per settled fetch, success, empty, and failure alike: callers in the shell awaiting this re-read are released on it. */
  useEffect(() => {
    if (!query.isFetching) props.settled?.(props.revision);
  }, [query.isFetching, props.revision]);

  const host = useCountHost(props.countRow);
  const waiting = query.isPending;
  useLayoutEffect(() => {
    const row = props.countRow;
    if (!row) return;
    if (waiting) row.setAttribute('aria-busy', 'true');
    else row.removeAttribute('aria-busy');
  }, [props.countRow, waiting]);
  /* After a batch is judged the per-category counts change; only the changed ones pop and the untouched stay put (legacy layer `popBadges`). */
  useLayoutEffect(() => {
    if (host && query.data) popBadges(host, 'junk');
  }, [host, query.data]);

  const { navigate } = props.actions;
  const count = host
    ? createPortal(
      <JunkCount route={route} page={query.data} failed={query.isError && !query.data} onNavigate={navigate} />, host)
    : null;
  return (
    <>
      {count}
      <JunkBody key={`${route.view}:${route.kind}`} props={props} data={query.data} pending={waiting}
        error={query.data ? null : query.error} retry={() => void query.refetch()} />
    </>
  );
}

/** The cell in the count row that belongs to this page. On mount it replaces the shell's skeleton, on unmount it is removed, and the row itself goes back to the shell. */
function useCountHost(row: HTMLElement | null): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!row) return undefined;
    const el = row.ownerDocument.createElement('div');
    el.className = 'peach-react';
    row.replaceChildren(el);
    setHost(el);
    return () => { el.remove(); setHost(null) };
  }, [row]);
  return host;
}

/** One category, one view's grid: skeleton, cards, the next segment peeking in below, and the empty state. */
function JunkBody({ props, data, pending, error, retry }: {
  props: JunkQueueProps; data: JunkPage | undefined; pending: boolean; error: Error | null; retry(): void;
}) {
  const reveal = useSkeletonReveal(pending, props.skeletonHtml);
  const batch = Math.max(1, props.batchSize || 60);
  const [segments, setSegments] = useState(1);
  const items = data?.items || [];
  const shown = items.slice(0, segments * batch);
  const { canLoadMore } = props;
  const more = useCallback(() => {
    if (canLoadMore?.() === false) return;
    setSegments((current) => current + 1);
  }, [canLoadMore]);

  const content = () => {
    if (pending) return null;
    if (!data) return <RetryNote message={requestErrorMessage(error)} onRetry={retry} />;
    if (!items.length) {
      const dismissed = props.view === 'dismissed';
      return (
        <EmptyState icon={CheckGlyph} title={dismissed ? t('cleanup:junk.emptyExcluded') : t('cleanup:junk.emptyUndecided')}
          actions={dismissed ? <ButtonLink size="small" href="/junk-files">{t('cleanup:junk.viewUndecided')}</ButtonLink> : undefined}>
          {dismissed ? t('cleanup:junk.emptyExcludedBody') : t('cleanup:junk.emptyUndecidedBody')}
        </EmptyState>
      );
    }
    return (
      <>
        <div data-media-grid="" data-junk-grid="" data-select-mode={props.selectMode ? '' : undefined}>
          {shown.map((item) => (
            <JunkCard key={item.id} item={item} view={props.view} selected={props.selected.has(item.id)}
              selectMode={props.selectMode} helpers={props.helpers} actions={props.actions} />
          ))}
        </div>
        {shown.length < items.length ? <RevealMore key={segments} onMore={more} /> : null}
        {/* The queue fetches only the first 200 at a time: when the bottom is reached and more remain, make clear it is truncated, not complete. */}
        {shown.length >= items.length && Number(data.total || 0) > items.length
          ? <p data-junk-truncated="" className="py-6 text-center text-caption-1-regular text-text-secondary">
              {t('cleanup:junk.truncated', { shown: items.length.toLocaleString(), count: Number(data.total) })}
            </p>
          : null}
      </>
    );
  };
  return (
    <div data-junk-body="" data-grid-reveal={reveal.fading ? '' : undefined}>
      {reveal.layer}
      {content()}
    </div>
  );
}

/** Reveal the next section below. The data is already in hand in batches, no requests: reveal when the sentinel enters within one screen below the viewport, or when clicked,
 *  same criteria as the catalog grid's next page. Each revealed section remounts under a new key, and keeps revealing while still in the viewport. */
function RevealMore({ onMore }: { onMore(): void }) {
  const node = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = node.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onMore();
    }, { rootMargin: LOAD_MORE_MARGIN });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onMore]);
  return <div ref={node} data-load-more="" onClick={onMore} dangerouslySetInnerHTML={{ __html: loadingDotsHtml(LOAD_MORE_STATUS) }} />;
}
