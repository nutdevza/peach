/* Readings that change with polling: when a new value arrives, roll from the old value to the new instead of jumping in one frame.
 *
 * First mount paints the final value directly; only a value change transitions; the transition uses Motion's `animate` writing text frame by frame,
 * and with the system's reduced motion on it paints the final value directly. Numbers are always tabular, so the row does not jitter while rolling. */
import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion';
import { useReducedMotion } from 'motion/react';

/** Transition duration in seconds. Shorter than the fastest polling interval anywhere (1.5 s), so it always settles before the next value arrives. */
const DURATION = 0.6;

export function AnimatedNumber(
  { value, format = (at) => Math.round(at).toLocaleString(), className }:
  { value: number; format?: (value: number) => string; className?: string },
) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: DURATION, ease: 'easeOut',
      onUpdate: (at) => { from.current = at; setShown(at); },
    });
    return () => controls.stop();
  }, [value, reduced]);
  return <span className={className ? `tabular-nums ${className}` : 'tabular-nums'}>{format(shown)}</span>;
}
