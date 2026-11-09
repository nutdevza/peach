/* The queue column on the right side of the details overlay (Mix, volumes, editions, playlists, followed compilations and multi-media).
 *
 * Queue, rows, and items each carry a `data-mix-*`; styles in
 * `stage/stage.css`, shared by video details and follows details. A dozen-odd items per column must drag-scroll horizontally (the queue is horizontal on narrow screens);
 * dragging borrows the shell's `wireDrag`, wired up by the caller via `listRef`. */
import { useCallback, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { icon } from '@peach/legacy/core';

export function MixQueue({ kind, title, summary, onClose, actions, listRef, children, ...data }: {
  kind: string;
  title: string;
  summary: string;
  onClose(): void;
  /** Action buttons before the close button (things like save as playlist). */
  actions?: ReactNode;
  listRef?: Ref<HTMLDivElement>;
  children: ReactNode;
} & Record<`data-${string}`, string>) {
  const list = useRef<HTMLDivElement | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => {
    list.current = node;
    if (typeof listRef === 'function') listRef(node);
    else if (listRef) listRef.current = node;
  }, [listRef]);
  /* Switching entries rebuilds details per entry and the queue remounts from the top: scroll the row being watched into the list's visible area. Move only the list's own scrolling;
     `scrollIntoView` would scroll the overlay and the page along with it. */
  useLayoutEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>('[data-mix-item][aria-current="true"]');
    if (!box || !row) return;
    const outer = box.getBoundingClientRect();
    const inner = row.getBoundingClientRect();
    if (inner.top < outer.top || inner.bottom > outer.bottom) box.scrollTop += inner.top - outer.top - (outer.height - inner.height) / 2;
    if (inner.left < outer.left || inner.right > outer.right) box.scrollLeft += inner.left - outer.left - (outer.width - inner.width) / 2;
  }, []);
  return (
    <aside data-mix-queue="" data-queue-kind={kind} {...data}>
      <div data-mix-queue-head="">
        {/* Scoped Preflight resets heading font weight to inherit, so this picks semibold from the three weight tiers. */}
        <div><h2 className="font-semibold">{title}</h2><span>{summary}</span></div>
        <div data-mix-queue-actions="">
          {actions}
          {/* The queue header at the detail bottom carries no close key; closing the stage uses the one on the media frame (`stage.css`). */}
          <button type="button" data-queue-close="" title="Close" aria-label="Close" onClick={onClose}
            dangerouslySetInnerHTML={{ __html: icon('x') }} />
        </div>
      </div>
      <div data-mix-list="" ref={attach}>{children}</div>
    </aside>
  );
}

/** A queue row: thumbnail on the left (duration badge placed into `pic` by the caller), two lines of text on the right. Video queues also have an attribution avatar before the text
 *  (`lead`, same set as the card's attribution layer); playlist rows end with a drag handle and remove (`after`),
 *  and drag-reorder recognizes the row's `row` attribute. */
export function MixQueueRow({ current, pic, lead, after, row, children, ...button }: {
  current: boolean;
  pic: ReactNode;
  lead?: ReactNode;
  after?: ReactNode;
  row?: Record<`data-${string}`, string | number>;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string | number>) {
  const text = <span data-mix-item-text="">{children}</span>;
  return (
    <div data-mix-row="" {...row}>
      <button type="button" data-mix-item="" aria-current={current ? 'true' : 'false'} {...button}>
        <span data-mix-item-pic="">{pic}</span>
        {lead === undefined ? text : <span data-mix-item-meta="">{lead}{text}</span>}
      </button>
      {after}
    </div>
  );
}

/** Cloud drive group subtitle: group name plus item count. */
export const MixGroupLabel = ({ label, count }: { label: string; count: number }) => (
  <h3 data-mix-group-label="">{label} <span>{count}</span></h3>
);
