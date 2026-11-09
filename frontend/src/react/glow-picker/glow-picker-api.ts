/* The seam between the sidebar color card (resident component `glow-picker`, `glow-picker-island.tsx`) and the shell.
 *
 * The card's shell (`#boardGlowMenu`: popover, glass material, anchoring and open/close) is built by the shell and managed by
 * its `wireAnchoredMenu`;
 * the route tree only renders content into it. Reads and writes go through the shell's UI preference store, and the two small
 * circles on the button and the settings panel all subscribe to the same one. */
import type { GlowSettings } from '@peach/appearance';

import type { SettingsStore } from '../../settings-store';

export interface GlowPickerHost {
  /** The card itself, the resident component's host: the route tree renders content directly as its children. */
  root: HTMLElement;
  store: SettingsStore<GlowSettings>;
  /** 'Detailed settings': collapse this card, open the settings panel's Appearance page and scroll to the glow parameters. */
  openDetails(): void;
}
