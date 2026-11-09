/* The recommendation reason on the "Continue watching" card: shared by work details and follow details. One line states the relationship (same creator, same series, ...) and the rarest
 * of the shared tags; ones that do not fit can be expanded. Saying only "tags are similar" does not tell the user where the similarity is, so shared tags are written out directly. */
import { useRef, useState } from 'react';
import { Dialog, Popover } from 'react-aria-components';
import { MENU_POPOVER_SURFACE } from '@/components/base/dropdown/menu-styles';

/** The maximum number of common tags to write on one line; the rest go to the overlay. */
const LINE_TAGS = 3;

export function reasonText(reasons: readonly string[], tags: readonly string[], limit = LINE_TAGS): string {
  return [...reasons, tags.slice(0, limit).join('、')].filter(Boolean).join(' · ');
}

export function RecommendationReason({ reasons, tags = [] }: { reasons: readonly string[]; tags?: readonly string[] }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const line = reasonText(reasons, tags);
  if (!line) return null;
  const full = [reasons.join(' · '), tags.length ? `Common tags: ${tags.join('、')}` : ''].filter(Boolean).join('\n');
  return <>
    <button ref={trigger} type="button" data-media-next-reason="" title={full}
      aria-label={`View recommendation reason: ${full}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={event => { event.stopPropagation(); setOpen(true) }}>{line}</button>
    <Popover triggerRef={trigger} isOpen={open} onOpenChange={setOpen} placement="top" offset={8}
      containerPadding={12} className={MENU_POPOVER_SURFACE}>
      <Dialog data-media-reason-dialog="" aria-label="Recommendation reason"
        className="w-64 max-w-full p-2 text-body-regular whitespace-pre-line break-words text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
        {full}
      </Dialog>
    </Popover>
  </>;
}
