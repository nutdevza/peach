/* Skeuomorphic keycaps, one per key: while recording a shortcut, show the key currently being pressed, the still-empty slots, and the result of this press. The usual binding hints
 * still use the BoardUI Kbd pill; BoardUI has no such component, so this is a Peach composition of its own. Styles in `keycap.css`. */
import { Fragment } from 'react';
import './keycap.css';

/** down is being pressed; slot is a still-empty position; invalid this one didn't pass; done was just recorded. */
export type KeycapState = 'idle' | 'down' | 'slot' | 'invalid' | 'done';
export interface KeycapItem { label: string; state: KeycapState }

/** A row of key caps. When plus is true, put a plus sign between keys (the Windows convention); Mac writes them together. */
export function Keycaps({ keys, plus }: { keys: KeycapItem[]; plus: boolean }) {
  return (
    <span data-keycaps="">
      {keys.map((key, index) => (
        <Fragment key={`${index}-${key.label}`}>
          {plus && index ? <span data-keycap-plus="" aria-hidden>+</span> : null}
          <kbd data-keycap="" data-state={key.state}>{key.label}</kbd>
        </Fragment>
      ))}
    </span>
  );
}
