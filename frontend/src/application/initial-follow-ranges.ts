/** History range for the first collection; the value is days submitted to the settings API, 0 means no time limit. */
export const FOLLOW_INITIAL_RANGE_OPTIONS = [
  ['0', 'Any duration'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
] as const satisfies readonly (readonly [value: string, label: string])[];

export type InitialFollowRange = typeof FOLLOW_INITIAL_RANGE_OPTIONS[number][0];
