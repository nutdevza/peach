/* Detailed settings for the sidebar glow, following feralui.dev/gradients' workbench panel: parameter rows are "84px label +
 * self-drawn slider + monospace readout at right", and color rows open a palette below themselves.
 * Measurements in docs/reference-snapshots/feralui-studio-boardui-accent-measured.md.
 *
 * The preset swatches are the same group with the same write path as the color card at the bottom of the sidebar
 * (`GlowPresetGrid`); both read the shell's store, so picking on either side aligns the other on the spot. The current scheme
 * name, preset swatches and the five parameters belong to the "Color scheme" group.
 *
 * The "Glass original color" scheme has no three glows: that layer counts as 0 wholesale, and what drifts on the surfaces are
 * each pane's own two reflections. Intensity, grain, blur, size and the three colors then control nothing, so this scheme
 * collapses them and swaps in a line explaining that color comes from the light/dark theme. Drift speed is not collapsed,
 * since the built-in blobs drift too. "Restore defaults" is likewise not collapsed: any scheme must be able to return to the
 * factory set in one step. */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { closeAnchoredMenu, wireAnchoredMenu } from '@peach/legacy/ui';
import {
  GLOW_SPOT_LABELS, GLOW_SWATCH_FAMILIES, GLOW_SWATCHES, HOME_GLOW_SPOTS, glowColor, glowPresetName, isNativeGlass,
  normalizeHomeGlow, type HomeGlow,
} from '@peach/appearance';

import { GlowPresetGrid } from '../components/glow-preset-grid';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import type { SettingsPanelHost } from './settings-panel-api';
import { Icon } from './icon';
import { DialRow } from './legacy-controls';

type Field = 'strength' | 'noise' | 'speed' | 'soften' | 'size';
type Spot = 'spot1' | 'spot2' | 'spot3';

const FIELDS: readonly [Field, string, number][] = [
  ['strength', 'Intensity', 100], ['noise', 'Grain', 60], ['speed', 'Drift speed', 300], ['soften', 'Softness', 100], ['size', 'Size', 100],
];


function StopRow({ host, spot, index, glow }: { host: SettingsPanelHost; spot: Spot; index: number; glow: HomeGlow }) {
  const label = GLOW_SPOT_LABELS[index];
  const row = useRef<HTMLDivElement | null>(null);
  const toggle = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const palette = useOverlayScrollbar<HTMLDivElement>();
  const [family, setFamily] = useState('all');
  /* The popover's left and right edges align with this row: if its width does not follow the row, a swatch narrower than the row gives no clue which row it came from.
     This must run before wireAnchoredMenu, which computes the left edge from the current width. */
  useLayoutEffect(() => {
    const [mount, button, menu] = [row.current, toggle.current, pop.current];
    if (!mount || !button || !menu) return;
    button.addEventListener('click', () => { menu.style.width = `${button.offsetWidth}px` });
    wireAnchoredMenu(mount, button, menu);
  }, []);
  const color = glow[spot].color;
  const pick = (hex: string) => {
    const current = host.store.value.homeGlow;
    current[spot].color = glowColor(hex, current[spot].color);
    current.preset = 'custom';
    host.store.save();
    host.changed('glow');
    closeAnchoredMenu();
    toggle.current?.focus();
  };
  return (
    <div data-glow-stop={spot} ref={row}>
      <button type="button" data-glow-stop-toggle="" aria-haspopup="dialog" aria-expanded="false" ref={toggle}>
        <span aria-hidden="true" data-glow-stop-dot="" style={{ '--glow-swatch': color } as CSSProperties} />
        <span data-glow-stop-text=""><b>{label}</b><small className="mono" data-glow-stop-hex="">{color}</small></span>
        <Icon name="chevron-down" />
      </button>
      <div className="popmenu" data-glow-stop-pop="" popover="manual" hidden ref={pop}>
        <div data-glow-pills="" role="group" aria-label="Colors">
          {GLOW_SWATCH_FAMILIES.map(([key, name]) => (
            <button type="button" key={key} data-glow-pill={key} aria-pressed={key === family}
              onClick={() => setFamily(key)}>{name}</button>
          ))}
        </div>
        <div data-glow-palette-frame="">
        <div ref={palette} data-glow-palette="" role="radiogroup" aria-label={`${label} color`}>
          {GLOW_SWATCHES.map(([swatchFamily, name, hex]) => (
            <button type="button" key={hex} role="radio" aria-checked={hex === color} data-glow-swatch={hex}
              data-glow-family={swatchFamily} style={{ '--glow-swatch': hex } as CSSProperties}
              title={name} aria-label={name} hidden={family !== 'all' && swatchFamily !== family}
              onClick={() => pick(hex)} />
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

export function GlowSettings({ host }: { host: SettingsPanelHost }) {
  const glow = host.store.value.homeGlow;
  const native = isNativeGlass(glow.preset);
  return (
    <section data-glow-setting="" id="homeGlowControls" aria-label="Sidebar glow parameters" hidden={!glow.on}>
      <section data-glow-group=""><h4 data-settings-subheading="">Glow palette</h4>
        <div data-setting-card="" data-glow-card="">
        <p data-glow-current="">Current palette<b data-glow-preset-name="">{glowPresetName(glow.preset)}</b></p>
        <GlowPresetGrid store={host.store} label="Glow palette" />
        <p data-glow-native-note="" hidden={!native}>This tier uses each pane's own reflections, and colors follow the light or dark theme.</p>
        <div data-glow-fields="">
          {/* While dragging, only parameters change and a single repaint is scheduled; persisting waits for release. The other glass surfaces follow only the velocity,
              and its two variables can only be written on the root, so during the drag only the sidebar layer changes and the full page follows on release. */}
          {FIELDS.map(([field, label, max]) => (
            <DialRow key={field} field={field} label={label} max={max} value={glow[field]} hidden={native && field !== 'speed'}
              onStep={(value) => { host.store.value.homeGlow[field] = value; host.changed('glowFrame') }}
              onSettle={() => { host.store.save(); if (field === 'speed') host.changed('glow') }} />
          ))}
        </div>
        <div data-glow-actions="">
          <button type="button" className="geist-button" data-glow-reset=""
            onClick={() => { host.store.value.homeGlow = normalizeHomeGlow(null); host.store.save(); host.changed('glow') }}>Restore defaults</button>
        </div>
        </div>
      </section>
      <section data-glow-group="" data-glow-colours="" hidden={native}><h4 data-settings-subheading="">Custom color</h4>
        <div data-setting-card="" data-glow-colour-card=""><div data-glow-stops="">
          {HOME_GLOW_SPOTS.map((spot, index) => <StopRow key={spot} host={host} spot={spot as Spot} index={index} glow={glow} />)}
        </div></div>
      </section>
    </section>
  );
}
