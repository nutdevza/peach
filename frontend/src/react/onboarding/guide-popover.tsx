import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Button } from '@/components/base/buttons/button';
import type { GuideStep } from '../../onboarding/guide-catalog';
import { guideEntry } from '../../onboarding/guide-entry';
import { RiRouteLine, RiArrowRightSLine } from '@remixicon/react';
import { Note } from '../components/note';
import { SettingsDialogClose } from '../components/settings-dialog-close';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import { Disclosure } from '../settings/section';
import { GuideFieldDetails } from './guide-help';

interface Props {
  step: GuideStep; position: number; total: number; missing: boolean;
  invitation?: boolean;
  next(skipped?: boolean): void; previous(): void; close(): void;
}
function GuidePopover({ step, position, total, missing, next, previous, close, invitation }: Props) {
  const body = useOverlayScrollbar<HTMLDivElement>();
  const entry = guideEntry(step);
  return <div className="peach-guide-popover-content" onPointerDown={event => event.stopPropagation()}>
    <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-3">
      <h3 id="driver-popover-title" className="text-body-medium text-text-primary">{step.title}</h3>
      <SettingsDialogClose label={invitation ? 'Dismiss the tour tip' : 'End the tour'} onPress={close} />
    </header>
    <div className="peach-guide-step-frame"><div ref={body} className="peach-guide-step-body flex flex-col gap-3 px-4 pb-4">
      {entry ? <section aria-label="How to open" className="flex flex-col gap-2 rounded-xl bg-background-secondary-default p-3">
        <div className="flex items-center gap-2 text-body-2-medium text-text-secondary"><RiRouteLine className="size-4 shrink-0" aria-hidden="true" />How to open</div>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-body-2-medium text-text-primary">
          {entry.path.map((label, index) => <li key={`${index}-${label}`} className="inline-flex items-center gap-1">
            {index ? <RiArrowRightSLine className="size-4 shrink-0 text-text-secondary" aria-hidden="true" /> : null}<span>{label}</span>
          </li>)}
        </ol>
        {entry.hint ? <p className="text-caption-1-regular text-text-secondary">{entry.hint}</p> : null}
      </section> : null}
      <p id="driver-popover-description" className="text-body-regular text-text-secondary">{step.body}</p>
      {step.details?.length ? <Disclosure summary="More details"><GuideFieldDetails details={step.details} /></Disclosure> : null}
      {step.scope ? <p className="text-body-2-regular text-text-secondary">{step.scope}</p> : null}
      {missing ? <Note tone="neutral">{step.surface ? 'No demonstrable video or its controls yet. Add a video first, or skip and revisit later.' : 'This entry is not on the current page — there may be nothing yet, no permission configured, or it is still loading. Skip it and look again later.'}</Note> : null}
    </div></div>
    <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-separator-border px-4 py-3">
      {invitation ? <>
        <Button variant="ghost" size="small" className="ml-auto" onClick={close}>Maybe later</Button>
        <Button size="small" data-guide-next="" onClick={() => next()}>Open the tour</Button>
      </> : <>
      <span className="mr-auto text-body-2-regular tabular-nums text-text-secondary">{position + 1} / {total} step</span>
      <Button variant="ghost" size="small" onClick={close}>Skip this chapter</Button>
      <Button variant="secondary" size="small" disabled={position === 0} onClick={previous}>Previous step</Button><Button size="small" data-guide-next="" onClick={() => next(missing)}>{position === total - 1 ? 'Finish this chapter' : 'Next step'}</Button>
      </>}
    </footer>
  </div>;
}

/** The Driver handles positioning; the highlighted explanation's content and controls are drawn by application components. */
export function mountGuidePopover(wrapper: HTMLElement, arrow: HTMLElement, props: Props) {
  const mount = document.createElement('div');
  wrapper.replaceChildren(mount, arrow);
  const root = createRoot(mount);
  flushSync(() => root.render(<GuidePopover {...props} />));
  return () => root.unmount();
}
