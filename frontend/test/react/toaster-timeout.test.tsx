import { beforeEach, expect, it, vi } from 'vitest';

const sonner = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: sonner, Toaster: () => null }));

import { showToast } from '../../src/react/toaster';

beforeEach(() => { sonner.success.mockClear(); sonner.error.mockClear() });

const durationOf = (call: unknown[] | undefined) => (call?.[1] as { duration?: number } | undefined)?.duration;

it('A duration of 0 or negative disappears after the default 6 sec; only an explicit Infinity stays', () => {
  showToast('zero', { html: 'Saved', alert: false, timeout: 0, action: null });
  showToast('negative', { html: 'Saved', alert: false, timeout: -1, action: null });
  showToast('pinned', { html: 'Saved', alert: false, timeout: Infinity, action: null });
  showToast('short', { html: 'Saved', alert: true, timeout: 4000, action: null });
  expect(sonner.success.mock.calls.map(durationOf)).toEqual([6000, 6000, Infinity]);
  expect(durationOf(sonner.error.mock.calls[0])).toBe(4000);
});

it('Textless receipts never pop an empty bar', () => {
  showToast('empty', { html: '', alert: false, timeout: 6000, action: null });
  showToast('blank', { html: '  \n ', alert: true, timeout: 6000, action: null });
  expect(sonner.success).not.toHaveBeenCalled();
  expect(sonner.error).not.toHaveBeenCalled();
});
