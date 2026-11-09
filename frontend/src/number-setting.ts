/** The read-back criterion for numeric preferences: only integers within the interval count, otherwise fall back to `fallback`.
 *  The shell uses it to normalize `appSettings` at startup, and the settings panel's numeric controls (`react/settings-panel/number-setting.tsx`) use it too. */
export function boundedPreference(value: number, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
