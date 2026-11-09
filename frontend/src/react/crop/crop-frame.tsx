/* Boxing a region on one image. Avatars and covers share it.
 *
 * No crop library is imported: what is wanted is "a rectangle that drags and resizes", the arithmetic all in
 * `crop-geometry.ts`, and the picture is one image plus five absolutely positioned blocks. Importing a library buys only
 * handle styling at the cost of one new dependency and its own coordinate conventions.
 *
 * Box coordinates are always **source-image pixels**, converted once on entering and once on leaving; display pixels measured
 * on screen are never passed out. After confirming, the backend crops by the same integers, so the two sides never round
 * differently.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import {
  boxPercent, clampBox, handleOutside, isUsableSize, moveBox, resizeFromCorner, scaleBox, toNatural,
  type CropBox, type CropSize,
} from '../../crop-geometry';

export interface CropFrameProps {
  src: string;
  /** Width/height. When given, the ratio locks and dragging changes only position and size, never shape. */
  aspect: number | null;
  box: CropBox | null;
  size: CropSize | null;
  onBox(box: CropBox): void;
  onSize(size: CropSize): void;
  /** The accessible name, saying exactly which part of which image in the frame. */
  label: string;
}

/** One keyboard step covers this fraction of the frame width. Holding an arrow key crosses from one side to the other within a screen, yet
 *  never jumps past a face in a single press. */
const KEY_STEP = 0.02;
/** The zoom factor per wheel notch. */
const WHEEL_STEP = 1.08;

export function CropFrame({ src, aspect, box, size, onBox, onSize, label }: CropFrameProps) {
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; x: number; y: number; box: CropBox } | null>(null);
  const [failed, setFailed] = useState(false);
  /* The image's current display size, used only to judge whether the frame is big enough on screen and whether the corner handles go inside or outside it. */
  const [shown, setShown] = useState<CropSize | null>(null);

  useEffect(() => { setFailed(false) }, [src]);
  useEffect(() => {
    const node = image.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(() => setShown({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /** Display pixel offsets to source image pixels. The image scales by `max-w-full`, so both axes share one ratio. */
  const scale = useCallback((dx: number, dy: number) => {
    const node = image.current;
    if (!node || !size) return { dx: 0, dy: 0 };
    return {
      dx: toNatural(dx, node.clientWidth, size.width),
      dy: toNatural(dy, node.clientHeight, size.height),
    };
  }, [size]);

  function start(mode: 'move' | 'resize') {
    return (event: ReactPointerEvent) => {
      if (!box || !size || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { mode, x: event.clientX, y: event.clientY, box };
    };
  }

  function move(event: ReactPointerEvent) {
    const active = drag.current;
    const node = image.current;
    if (!active || !node || !size) return;
    const shift = scale(event.clientX - active.x, event.clientY - active.y);
    if (active.mode === 'move') {
      onBox(moveBox(active.box, shift.dx, shift.dy, size));
      return;
    }
    onBox(resizeFromCorner(active.box, active.box.x0 + (active.box.x1 - active.box.x0) + shift.dx,
      active.box.y0 + (active.box.y1 - active.box.y0) + shift.dy, size, aspect));
  }

  function end(event: ReactPointerEvent) {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function keys(event: ReactKeyboardEvent) {
    if (!box || !size) return;
    const step = Math.max(1, (box.x1 - box.x0) * KEY_STEP);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      onBox(moveBox(box, moves[event.key][0], moves[event.key][1], size));
      return;
    }
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault();
      onBox(scaleBox(box, event.key === '-' ? 1 / WHEEL_STEP : WHEEL_STEP, size, aspect));
    }
  }

  const rect = box && size ? boxPercent(clampBox(box, size, aspect), size) : null;
  const outside = rect ? handleOutside(rect, shown) : false;
  /* Positions reach CSS only through custom properties: six percentages hang on the container, and the dimming block and the frame itself each consume them by class name,
     so styles still live entirely in classes (`docs/FRONTEND.md`). */
  const frame = rect ? {
    '--crop-l': `${rect.left}%`, '--crop-t': `${rect.top}%`,
    '--crop-w': `${rect.width}%`, '--crop-h': `${rect.height}%`,
    '--crop-r': `${rect.left + rect.width}%`, '--crop-b': `${rect.top + rect.height}%`,
  } as CSSProperties : undefined;
  return (
    <div className="relative inline-block max-w-full select-none" style={frame}>
      <img ref={image} src={src} alt="" draggable={false}
        onLoad={(event) => {
          const node = event.currentTarget;
          if (isUsableSize({ width: node.naturalWidth, height: node.naturalHeight })) {
            onSize({ width: node.naturalWidth, height: node.naturalHeight });
          }
        }}
        onError={() => setFailed(true)}
        className="block max-h-crop-frame max-w-full object-contain" />
      {failed || !rect ? null : (
        <>
          {/* Dimming outside the frame. Four blocks rather than one giant box-shadow: the latter would spill outside the popover under this layer's
              rounding and overflow. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-(--crop-t) bg-scrim" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-(--crop-b) bg-scrim" />
          <div aria-hidden className="pointer-events-none absolute left-0 top-(--crop-t) h-(--crop-h) w-(--crop-l) bg-scrim" />
          <div aria-hidden className="pointer-events-none absolute right-0 left-(--crop-r) top-(--crop-t) h-(--crop-h) bg-scrim" />
          {/* The box itself. The whole thing drags; the small square at the bottom-right resizes; the arrow keys and plus/minus do the same two things.
              When the box is tiny on screen (very flat, very long images) the handle moves entirely outside the box's bottom-right, leaving the box to dragging. */}
          <div role="group" tabIndex={0} aria-label={label} data-crop-box
            onPointerDown={start('move')} onPointerMove={move}
            onPointerUp={end} onPointerCancel={end} onKeyDown={keys}
            onWheel={(event) => {
              if (!box || !size) return;
              onBox(scaleBox(box, event.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP, size, aspect));
            }}
            className="absolute left-(--crop-l) top-(--crop-t) h-(--crop-h) w-(--crop-w) cursor-move touch-none outline-none ring-2 ring-border-focus-ring ring-inset focus-visible:ring-4">
            <span data-crop-handle data-outside={outside || undefined} onPointerDown={start('resize')}
              onPointerMove={move} onPointerUp={end} onPointerCancel={end}
              className="absolute -right-1.5 -bottom-1.5 data-outside:-right-3.5 data-outside:-bottom-3.5 size-3 cursor-nwse-resize touch-none rounded-xs border border-separator-border bg-background-full" />
          </div>
        </>
      )}
      {failed
        ? <p className="p-4 text-body-2-regular text-text-secondary">This image cannot be read. Pick another one to crop.</p>
        : null}
    </div>
  );
}
