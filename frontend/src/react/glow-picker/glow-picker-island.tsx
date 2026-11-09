/* The sidebar color card: the card opened by the color button at the bottom of the sidebar, modeled on the "Accent color"
 * button at boardui.com's bottom right.
 *
 * The header is a title plus a "Reset" text key; the body is two groups of 6-column balls, glow presets on top (the same group
 * as the settings panel's "Color scheme", `GlowPresetGrid`) and accent colors below (BoardUI's own radial-gradient ball), with
 * a full-width primary button at the bottom leading to detailed settings. Measurements in
 * docs/reference-snapshots/feralui-studio-boardui-accent-measured.md.
 *
 * Resident component `glow-picker` (the resident table in `router/managed-routes.tsx`): the route tree renders the content
 * directly as children of the shell's resident `#boardGlowMenu` at the end of body, the host being the card itself; the shell
 * opens it at startup. The card has no imperative handle and reads and writes the shell's UI preference store. Anchoring,
 * open/close, glass material and mutual exclusion with the media library menu all live in the shell's `wireAnchoredMenu`; the
 * card does not switch to a BoardUI Popover: that motion and material would have to be re-created outside Popover to match
 * pixels, and the re-creation would be a second copy.
 *
 * When glow is off only the accent color remains to pick on the card: the upper group of balls and its "Reset" control a layer
 * that is not rendered anymore, and clicking them does nothing on screen, so the group collapses and the card only states the
 * one thing that still works. */
import { useSyncExternalStore } from 'react';

import { ACCENT_CHOICES, chooseAccent, resetGlowColors } from '@peach/appearance';

import { GlowPresetGrid } from '../components/glow-preset-grid';
import type { GlowPickerHost } from './glow-picker-api';
import './glow-picker.css';

let host: GlowPickerHost | null = null;

/** Wire up the host the shell provides. Called once; the shell's `loadGlowPicker` then opens this panel inside the route tree. */
export function configureGlowPicker(next: GlowPickerHost): void {
  host = next;
}

/** The face in the resident table: not drawn while the host is not yet attached. */
export function GlowPickerSurface() {
  return host ? <GlowPicker host={host} /> : null;
}

function GlowPicker({ host: at }: { host: GlowPickerHost }) {
  const { store } = at;
  useSyncExternalStore(store.subscribe, store.version);
  const { homeGlow: glow, accent } = store.value;
  return (
    <>
      <header data-glow-head="" data-glow-presets="" hidden={!glow.on}>
        <span>Glow</span>
        {/* What resets here is the palette, not the whole glow: clearing intensity and grain together makes people think they pressed the wrong key. The full restore to defaults lives on the detailed settings screen. */}
        <button type="button" data-glow-preset-reset="" onClick={() => resetGlowColors(store)}>Reset</button>
      </header>
      <GlowPresetGrid store={store} label="Glow" hidden={!glow.on} />
      <p data-glow-head="" data-glow-sub=""><span>Accent color</span></p>
      <div data-accent-grid="" role="group" aria-label="Accent color">
        {/* The accent color row likewise carries no color: the balls use exactly the 400 and 600 levels this tier would actually write. */}
        {ACCENT_CHOICES.map(([key, label]) => (
          <button type="button" key={key} data-glow-chip="" data-accent={key} aria-pressed={key === accent}
            title={label} aria-label={label} onClick={() => chooseAccent(key, store)}>
            <span data-glow-ball="" aria-hidden="true" data-accent-ball={key} />
          </button>
        ))}
      </div>
      <footer><button type="button" className="geist-button primary" data-glow-detail="" onClick={() => at.openDetails()}>Detailed settings</button></footer>
    </>
  );
}
