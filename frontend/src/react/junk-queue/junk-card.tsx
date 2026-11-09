/* A card in the junk queue: a 16:9 preview cell on top (the type glyph when there is no preview), then name, type, reason and
 * size, with three equal-width keys at the bottom: open location, judgment (not junk / re-judge), move to trash, plus a status
 * line.
 *
 * The card box reuses the library video card's hooks (`data-media-card`/`data-media-pic`/`data-media-badge`/
 * `data-media-check`): preview cell, source badge, selection outline and check are one set, and during Shift range selection
 * the shell counts the page's cards by `[data-media-grid] > [data-media-card]`, junk cards included. The junk card's own
 * geometry (outlined face, meta area, key row) lives in `./junk-queue.css`, with hooks `data-junk-*`.
 *
 * Titles render as escaped HTML like the legacy layer: `data-middle-truncate` is cut from the middle by middle-truncate
 * (`src/ui-kit/middle-truncate.ts`) according to width, and it rewrites this cell's text directly; handing it to React would
 * make the next re-render fight it. */
import { memo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { esc, fmtSize } from '@peach/legacy/core';
import { spinnerHtml } from '@peach/legacy/ui';

import {
  junkDecision, junkKindMeta,
  type JunkItem, type JunkOperation, type JunkQueueActions, type JunkQueueHelpers, type JunkView,
} from './junk-queue';
import { suppressShiftTextSelection } from '../components/row-click';
import { t } from '../../i18n';

/** A sprite glyph, written like the legacy layer's `icon()`: size and stroke come from the stylesheet by position. */
function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}

export interface JunkCardProps {
  item: JunkItem;
  view: JunkView;
  selected: boolean;
  selectMode: boolean;
  helpers: JunkQueueHelpers;
  actions: JunkQueueActions;
}

type Busy = '' | 'reveal' | JunkOperation;

const picking = (selectMode: boolean, event: MouseEvent) => selectMode || event.shiftKey || event.ctrlKey || event.metaKey;

function JunkCardView({ item, view, selected, selectMode, helpers, actions }: JunkCardProps) {
  const card = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState<Busy>('');
  const [status, setStatus] = useState('');
  const kind = item.junk_kind || 'other';
  const [label, glyph] = junkKindMeta(item);
  const name = String(item.name || '');
  const decision = junkDecision(view);
  const preview = kind === 'video' ? `/thumb?id=${item.id}&c=4` : kind === 'image' ? `/photo-thumb?id=${item.id}` : '';
  const openable = kind === 'video' || kind === 'image';

  /* Multi-select and modifier keys take priority: a click anywhere on the card (except the button row) toggles selection. */
  const clickCard = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('[data-junk-actions]')) return;
    if (!picking(selectMode, event)) return;
    event.preventDefault();
    actions.toggleSelection(item.id, event.shiftKey);
  };
  const clickTitle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (picking(selectMode, event)) {
      event.preventDefault();
      actions.toggleSelection(item.id, event.shiftKey);
      return;
    }
    if (card.current) actions.open(item, card.current);
  };
  const reveal = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy === 'reveal') return;
    setBusy('reveal');
    setStatus('');
    void actions.reveal(item).then(setStatus, () => {}).finally(() => setBusy(''));
  };
  /* The three keys that write the ledger. On success the shell re-reads the queue and this card leaves with it; on failure the shell reports and the keys become clickable again. */
  const operate = (operation: JunkOperation) => (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy === operation) return;
    setBusy(operation);
    setStatus('');
    void actions.operate(item, operation).catch(() => {}).finally(() => setBusy(''));
  };
  const busyAttrs = (key: Busy) => (busy === key ? { 'aria-busy': true, 'aria-disabled': true } as const : {});

  const title = openable
    ? <button type="button" data-junk-title="" data-junk-open="" data-middle-truncate="" title={name}
      onClick={clickTitle} dangerouslySetInnerHTML={{ __html: esc(name || t('cleanup:junk.untitled')) }} />
    : <span data-junk-title="" data-middle-truncate="" title={name}
      dangerouslySetInnerHTML={{ __html: esc(name || t('cleanup:junk.untitled')) }} />;

  return (
    <article ref={card} data-media-card="" data-variant="junk" data-junk-card="" data-id={item.id} data-junk-kind={kind}
      data-selected={selected ? '' : undefined} onClick={clickCard} onMouseDown={suppressShiftTextSelection}>
      <div data-media-pic="" style={{ '--card-ratio': String(16 / 9) } as CSSProperties}>
        <span data-media-glyph=""><Icon name={glyph} /><b>{label}</b></span>
        {preview
          ? <span data-media-art="thumb" dangerouslySetInnerHTML={{
            __html: `<img class="poster" src="${preview}" width="640" height="360" alt="" loading="lazy" data-drop="self">`,
          }} />
          : null}
        <div data-media-badge="" dangerouslySetInnerHTML={{ __html: helpers.badgeHtml(item.location || '', item.cost || '') }} />
        <span data-media-check=""><Icon name="check" /></span>
      </div>
      <div data-junk-meta="">
        {title}
        <div data-junk-facts="">
          <span data-junk-who="">{label}</span>
          {item.why ? <span data-junk-why="">{item.why}</span> : null}
          <span data-junk-size="">{Number(item.size) > 0 ? fmtSize(Number(item.size)) : t('cleanup:junk.unknownSize')}</span>
        </div>
      </div>
      <footer data-junk-actions="">
        <button type="button" data-junk-action="reveal" title={t('cleanup:junk.revealTitle')} aria-label={t('cleanup:junk.revealTitle')}
          {...busyAttrs('reveal')} onClick={reveal}>
          {busy === 'reveal' ? <span data-junk-spinner="" dangerouslySetInnerHTML={{ __html: spinnerHtml(t('cleanup:junk.locating')) }} /> : <Icon name="folder-open" />}
          <span data-junk-label="">{t('cleanup:junk.reveal')}</span>
        </button>
        <button type="button" data-junk-action={decision.operation} title={decision.label} aria-label={decision.label}
          {...busyAttrs(decision.operation)} onClick={operate(decision.operation)}>
          <Icon name={decision.glyph} /><span data-junk-label="">{decision.label}</span>
        </button>
        <button type="button" data-junk-action="dispose" title={t('cleanup:duplicates.moveToTrash')} aria-label={t('cleanup:duplicates.moveToTrash')}
          {...busyAttrs('dispose')} onClick={operate('dispose')}>
          <Icon name="trash" /><span data-junk-label="">{t('cleanup:duplicates.moveToTrash')}</span>
        </button>
        <span data-junk-state="" aria-live="polite">{status}</span>
      </footer>
    </article>
  );
}

/** Over a hundred cards per screen; re-renders beyond selection must not drag every card along: comparisons are by reference, and the helpers and actions the shell passes in keep their identity. */
export const JunkCard = memo(JunkCardView);
