/* Numeric controls in the settings panel, with unit, optional toggle, and field errors. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { boundedPreference } from '../../src/number-setting';
import { dayReading, NumberSetting, type NumberSettingId } from '../../src/react/settings-panel/number-setting';
import './render';

const unmounts: (() => void)[] = [];
beforeEach(() => { localStorage.clear() });
afterEach(() => { for (const unmount of unmounts.splice(0)) act(unmount) });

/** Mounts a control, then `rerender` with a different external value (database reconciliation, a response arriving). */
async function setup(id: NumberSettingId, value: number | null, label = 'Search history') {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  unmounts.push(() => root.unmount());
  const apply = vi.fn();
  const render = (next: number | null) => act(async () => {
    root.render(<NumberSetting id={id} label={label} value={next} onApply={apply} />);
  });
  await render(value);
  return {
    host, apply, rerender: render,
    input: () => host.querySelector<HTMLInputElement>('input[type=number]')!,
    toggle: () => host.querySelector<HTMLInputElement>('[role=switch]')!,
  };
}

/** The native number input's `change`: commits on blur or Enter, never mid-typing. */
const commit = (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
const flip = (toggle: HTMLInputElement) => act(async () => { toggle.click() });

it('Out-of-range numbers are not submitted and are marked with an error; the error clears once corrected', async () => {
  const { host, apply, input } = await setup('searchHistoryLimitSetting', 10);
  await commit(input(), '51');
  expect(apply).not.toHaveBeenCalled();
  expect(input().getAttribute('aria-invalid')).toBe('true');
  const error = host.querySelector<HTMLElement>('[role=status]')!;
  expect(error.hidden).toBe(false);
  expect(error.textContent).toBe('Enter a whole number from 1 to 50 (items)');
  await commit(input(), '17');
  expect(apply).toHaveBeenLastCalledWith(17);
  expect(input().hasAttribute('aria-invalid')).toBe(false);
  expect(error.hidden).toBe(true);
});

it('Turning it off collapses the number box and submits 0; turning it on refills the pre-off value', async () => {
  const { host, apply, input, toggle } = await setup('searchHistoryLimitSetting', 10);
  await commit(input(), '23');
  await flip(toggle());
  expect(apply).toHaveBeenLastCalledWith(0);
  expect(host.querySelector<HTMLElement>('[data-number-fields]')!.hidden).toBe(true);
  await flip(toggle());
  expect(input().value).toBe('23');
  expect(apply).toHaveBeenLastCalledWith(23);
  expect(localStorage.getItem('peach.number.searchHistoryLimitSetting')).toBe('23');
});

it('Values swapped in externally refill after closing and reopening', async () => {
  const { apply, input, toggle, rerender } = await setup('searchHistoryLimitSetting', 10);
  await rerender(37);
  expect(input().value).toBe('37');
  await flip(toggle());
  await flip(toggle());
  expect(input().value).toBe('37');
  expect(apply).toHaveBeenLastCalledWith(37);
});

it('The whole block is disabled until the value arrives, then opens and closes by tier', async () => {
  const { input, toggle, rerender, host } = await setup('followScheduleSetting', null, 'Follow auto-update');
  expect(input().disabled).toBe(true);
  expect(toggle().disabled).toBe(true);
  await rerender(0);
  expect(toggle().disabled).toBe(false);
  expect(toggle().checked).toBe(false);
  expect(host.querySelector<HTMLElement>('[data-number-fields]')!.hidden).toBe(true);
  await rerender(180);
  expect(toggle().checked).toBe(true);
  expect(input().value).toBe('180');
});

it('Required fields have no toggles', async () => {
  const { host, input } = await setup('batchSizeSetting', 60, 'Videos per batch');
  expect(host.querySelector('[role=switch]')).toBeNull();
  expect(input().value).toBe('60');
  expect(host.querySelector('[data-number-control] span')!.textContent).toBe('items');
});

it('Preferences read back accept only in range integers', () => {
  expect(boundedPreference(0, 0, 50, 10)).toBe(0);
  expect(boundedPreference(2.5, 1, 50, 10)).toBe(10);
  expect(boundedPreference(99, 1, 50, 10)).toBe(10);
});

it('Minute-based intervals of a day or more convert to days beside the unit; under a day or non-minute values say nothing', () => {
  expect(dayReading(10080, 'min')).toBe('7 days');
  expect(dayReading(2160, 'min')).toBe('~1.5 days');
  expect(dayReading(1439, 'min')).toBe('');
  expect(dayReading(10080, 'sec')).toBe('');
});
