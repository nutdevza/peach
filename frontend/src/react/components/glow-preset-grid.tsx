/* The glow preset cell: the settings panel's "Color scheme" group and the top half of the sidebar's bottom color card are the
 * same swatches with the same write path. Both read the same store (`appSettingsStore` in `@peach/appearance`), so picking on
 * either side aligns the other on the spot via the store's notification.
 *
 * What selecting a scheme writes (glow, glass surface hues and accent color together) is in `appearance/glow.ts`'s
 * `chooseGlowPreset`; this only paints balls. The "Custom" cell appears or disappears; keyed by scheme name, the ball
 * holding focus stays the same node, so keyboard selection never drops focus back to the top of the page.
 *
 * Styles in `./glow-preset-grid.css`. */
import type { CSSProperties } from 'react';

import { chooseGlowPreset, glowChips, type GlowSettings } from '@peach/appearance';

import type { SettingsStore } from '../../settings-store';
import './glow-preset-grid.css';

export function GlowPresetGrid({ store, label, hidden }: {
  store: SettingsStore<GlowSettings>; label: string; hidden?: boolean;
}) {
  const glow = store.value.homeGlow;
  return (
    <div data-glow-grid="" role="group" aria-label={label} hidden={hidden}>
      {glowChips(glow).map((chip) => (
        <button type="button" key={chip.key} data-glow-chip="" data-glow-preset={chip.key}
          aria-pressed={chip.key === glow.preset} title={chip.label} aria-label={chip.label}
          onClick={() => chooseGlowPreset(chip.key, store)}>
          <span data-glow-ball="" aria-hidden="true" data-glow-native={chip.native ? '' : undefined}
            style={chip.native ? undefined : { '--glow-chip': chip.fill } as CSSProperties} />
        </button>
      ))}
    </div>
  );
}
