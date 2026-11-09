/* Descriptions of handling modes and library grouping. The settings page and its first-screen skeleton share one copy of the text, with the skeleton's line breaks matching the real page. */

/** The always-visible line above the group: how the three handling tiers differ, with details tucked in the comparison table. */
export const POLICY_SUMMARY = 'Every library reads local NFO and same-directory images first; the processing mode only decides whether to fetch online.';

/** A three-tier comparison table: one step per row, columns in order being autocomplete, local details only, and custom. */
export const POLICY_COLUMNS = ['Auto-complete', 'Use local profiles only', 'Custom'] as const;
export const POLICY_MATRIX: readonly (readonly [step: string, auto: string, local: string, custom: string])[] = [
  ['Read local NFO and images', '✓', '✓', '✓'],
  ['Read video info and build the 3x3 grid', '✓', '✓', 'Optional'],
  ['Fetch profiles online', '✓', '—', 'Optional'],
  ['Fetch covers online', '✓', '—', 'Optional'],
  ['Fetch person images online', '✓', '—', 'Optional'],
];
export const POLICY_COVER_NOTE = 'When only a portrait poster exists locally: automatic completion searches online for the full cover (except FC2 product images), and local-only mode uses the portrait directly.';

/** The line under the two add buttons: folders belong to media libraries, and when to add a folder versus when to add a media library. */
export const LIBRARY_FOLDER_HELP = 'A library can hold several folders and shows their videos together, sharing one name, color, and handling; add another library to keep things separate.';
