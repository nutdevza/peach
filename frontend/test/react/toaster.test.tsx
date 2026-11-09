import { act } from 'react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { mountToaster, showToast, unmountToaster } from '../../src/react/toaster';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The Toaster mounts once site-wide; the tests in this file share one stack, each using distinct ids.
const host = document.createElement('div');
beforeAll(async () => {
  document.body.append(host);
  await act(async () => mountToaster(host, { success: '<svg data-glyph="check"></svg>', error: '<svg data-glyph="alert"></svg>' }));
});
afterAll(async () => { await act(async () => unmountToaster()); host.remove(); });

const toastsWith = (text: string) => [...host.querySelectorAll<HTMLElement>('[data-sonner-toast]')]
  .filter((node) => node.textContent?.includes(text));

it('Undo writes its result back to the same entry without starting another stack entry', async () => {
  const run = vi.fn();
  await act(async () => showToast('undo', {
    html: 'Deleted the tag "<b>Drama</b>"', alert: false, timeout: 8000, action: { label: 'Undo', run },
  }));
  await vi.waitFor(() => expect(toastsWith('Tag deleted')).toHaveLength(1));
  const [receipt] = toastsWith('Tag deleted');
  const button = receipt.querySelector<HTMLButtonElement>('[data-action]')!;
  expect(button.textContent).toBe('Undo');
  await act(async () => button.click());
  // Clicking does not close: the request is still in flight and the result must be written back to this entry.
  expect(run).toHaveBeenCalledWith(button);
  expect(receipt.dataset.removed).toBe('false');

  await act(async () => showToast('undo', { html: 'Undone', alert: false, timeout: 4000, action: null }));
  await vi.waitFor(() => expect(toastsWith('Undone')).toHaveLength(1));
  expect(toastsWith('Tag deleted')).toHaveLength(0);
  // The same node was replaced with new content, so the undo button went away with it.
  expect(toastsWith('Undone')[0]).toBe(receipt);
  expect(receipt.querySelector('[data-action]')).toBeNull();
});

it('Successes draw a check and failures draw no circle; the body inserts the HTML provided by the call site', async () => {
  await act(async () => showToast('ok', { html: 'Checked <b>3</b> sources', alert: false, timeout: Infinity, action: null }));
  await act(async () => showToast('bad', { html: 'Save failed: disk full', alert: true, timeout: Infinity, action: null }));
  await vi.waitFor(() => expect(toastsWith('Save failed')).toHaveLength(1));
  const [ok] = toastsWith('Checked');
  const [bad] = toastsWith('Save failed');
  expect(ok.dataset.type).toBe('success');
  expect(ok.querySelector('[data-toast-glyph="draw"] [data-glyph="check"]')).not.toBeNull();
  expect(ok.querySelector('b')?.textContent).toBe('3');
  expect(bad.dataset.type).toBe('error');
  expect(bad.querySelector('[data-toast-glyph="still"] [data-glyph="alert"]')).not.toBeNull();
});

it('Remounting on the same host shares the stack, unmount allows remounting, and switching hosts tears down the original stack', async () => {
  const next = document.createElement('div'); document.body.append(next);
  const icons = { success: '', error: '' };
  await act(async () => mountToaster(next, icons));
  const original = next.firstElementChild;
  expect(original).not.toBeNull(); expect(host.children).toHaveLength(0);
  await act(async () => mountToaster(next, icons)); expect(next.firstElementChild).toBe(original);
  await act(async () => { unmountToaster(); unmountToaster(); }); expect(next.children).toHaveLength(0);
  await act(async () => mountToaster(next, icons)); expect(next.firstElementChild).not.toBe(original);
  await act(async () => unmountToaster()); next.remove();
});
