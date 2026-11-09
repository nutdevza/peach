/* Crop cover: the screen opened by the key beside the video details page's title.
 *
 * What is cropped is the **framing box**, not the image. In a landscape sleeve, the front-cover region is not a new image but
 * a set of coordinates written in `<code>.poster.json` (`src/peach/jav_poster_crop.py`), which the page frames by. So after
 * confirming on this screen, not one byte of the original cover changes, and "Restore default" recomputes that coordinate set
 * by the fold criterion: not restoring the image, because the image never changed.
 *
 * The default frame is full height pinned to the right edge, with width by the front cover's aspect ratio: a sleeve is
 * "back | spine | front", and what people usually change is only which column the fold falls in. The ratio can be unlocked,
 * because sleeves with irregular layouts do exist.
 */
import { useState } from 'react';
import { RiCloseLine } from '@remixicon/react';
import { useMutation } from '@tanstack/react-query';
import { Heading } from 'react-aria-components';

import { Button } from '@/components/base/buttons/button';
import { IconButton } from '@/components/base/buttons/icon-button';
import { Switch } from '@/components/base/switch/switch';

import { errorMessage } from '../../api';
import {
  clampBox, defaultPanelBox, isUsableSize, type CropBox, type CropSize,
} from '../../crop-geometry';
import { PANEL_ASPECT } from '../../jav-artwork';
import type { CoverCropProps } from '../bundle';
import { ModalFrame, ModalGlyph } from '../components/modal-frame';
import { Note } from '../components/note';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import { CropFrame } from '../crop/crop-frame';
import { busyProps } from '../settings/use-action';
import { sendCoverCrop } from './cover-crop';

/** The Lucide `crop` in the sprite. This key sits in a row with the legacy toolbar's locate and sync-delete; those two are
 *  15px stroke glyphs with 2px stroke width, while the Remix one is a filled outline and reads a stroke heavier side by side. */
function CropIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <use href="#i-crop" />
    </svg>
  );
}

export function CoverCrop({ code, coverUrl, box, onSaved }: CoverCropProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-haspopup="dialog" data-cover-crop
        aria-label={`Crop ${code}'s cover`} title="Crop cover: box the front cover area"
        onClick={() => setOpen(true)}
        className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-foreground-icon-secondary outline-none transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring">
        <CropIcon className="size-3.75" />
      </button>
      {/* The details overlay is a top-level native dialog, and popovers are mounted into that same layer by the stage (`stage.tsx`). */}
      <ModalFrame isOpen={open} onOpenChange={setOpen} width="cover-crop" label="Crop the cover">
        <CropBody code={code} coverUrl={coverUrl} box={box} onSaved={onSaved}
          close={() => setOpen(false)} />
      </ModalFrame>
    </>
  );
}

function CropBody({ code, coverUrl, box: saved, onSaved, close }: CoverCropProps & { close(): void }) {
  const [size, setSize] = useState<CropSize | null>(null);
  const [box, setBox] = useState<CropBox | null>(null);
  const [locked, setLocked] = useState(true);
  const frame = useOverlayScrollbar<HTMLDivElement>();

  const submit = useMutation({
    mutationFn: (next: CropBox | null) => sendCoverCrop(code, next),
    onSuccess: (result) => { close(); onSaved(result.poster_box) },
  });

  /* On entry it starts at the currently active box: what the person wants to change is "how it is now", and starting from scratch means first undoing the
     current state. Only with no active box (this cover was judged not to need cropping) does it fall back to the default, full-height against the right edge. */
  function ready(next: CropSize) {
    setSize(next);
    const current = saved && saved.px?.[0] === next.width && saved.px?.[1] === next.height
      ? { x0: saved.x0, y0: saved.y0, x1: saved.x1, y1: saved.y1 }
      : defaultPanelBox(next, PANEL_ASPECT);
    setBox(clampBox(current, next, null));
  }

  const busy = submit.isPending;
  return (
    <>
      <div className="flex shrink-0 items-start gap-4 p-5">
        <ModalGlyph><CropIcon className="size-6" /></ModalGlyph>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Heading slot="title" className="text-title-3-semibold text-text-primary">Crop the cover</Heading>
          <p className="text-body-2-regular text-text-secondary">
            {code}: Frames the actual cover block, the original cover image untouched. Drag the box to move it, use the wheel or the corner square to resize.
          </p>
          {submit.error ? <Note tone="error">{errorMessage(submit.error)}</Note> : null}
        </div>
        <IconButton icon={RiCloseLine} size="small" aria-label="Close" onClick={close} />
      </div>
      <div ref={frame} className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto border-t border-separator-border px-5 py-4">
        <CropFrame src={coverUrl} aspect={locked ? PANEL_ASPECT : null} box={box} size={size}
          label={`${code}'s front-cover framing box`}
          onSize={(next) => { if (isUsableSize(next)) ready(next) }}
          onBox={setBox} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-separator-border p-5">
        <Switch isSelected={locked} onChange={(next) => {
          setLocked(next);
          if (next && box && size) setBox(clampBox(box, size, PANEL_ASPECT));
        }}>
          <span className="text-body-2-regular text-text-secondary">Lock front-cover ratio</span>
        </Switch>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <Button variant="secondary" {...busyProps(busy)}
            onClick={() => { if (!busy) submit.mutate(null) }}>Restore defaults</Button>
          <Button disabled={!box || !size} {...busyProps(busy)}
            onClick={() => { if (box && !busy) submit.mutate(box) }}>Use this region</Button>
        </div>
      </div>
    </>
  );
}
