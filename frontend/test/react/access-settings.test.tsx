import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import type { AccessState } from '../../src/react/bundle';
import { AccessSettings } from '../../src/react/settings/access-settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function mount(initial: AccessState, receipt = vi.fn()) {
  const host = document.createElement('div');
  host.className = 'peach-react';
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<AccessSettings initial={initial} receipt={receipt} />));
  return host;
}

/** React tracks the input's value itself and ignores a dispatch that fires the event without going through the native setter. */
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const click = (el: HTMLElement) => act(async () => el.click());
const submit = (host: HTMLElement) => act(async () => {
  host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});
const sentBody = (fetcher: ReturnType<typeof vi.fn>) =>
  JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
const checkbox = (host: HTMLElement) => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const newPasswords = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]')];

it('The system passphrase can convert directly to an optional password, and turning it off requires an explicit submit', async () => {
  const receipt = vi.fn();
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ mode: 'open', revision: 'next' }) }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount({ mode: 'legacy', revision: 'legacy' }, receipt);
  expect(host.querySelector('[autocomplete="current-password"]')).toBeNull();
  expect(host.querySelector('button[type="submit"]')?.textContent).toBe('Save configuration');
  await click(checkbox(host));
  expect(newPasswords(host)).toHaveLength(0);
  expect(host.querySelector('[role="note"]')?.textContent).toContain('Access rangeAfter saving, devices that can reach Peach will access the library directly.');
  expect(fetcher).not.toHaveBeenCalled();
  await submit(host);
  expect(sentBody(fetcher)).toMatchObject({ action: 'disable', confirm_disable: true });
  expect(receipt).toHaveBeenCalledWith('Access password disabled');
  expect(host.querySelector('[role="note"]')?.textContent).toContain('No access password set');
});

it('The opt-out sits above the input, keeps the draft, and requires current-password verification', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ mode: 'open', revision: 'next' }) }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount({ mode: 'password', revision: 'one' });
  const current = host.querySelector<HTMLInputElement>('#access-current')!;
  expect(checkbox(host).compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for (const input of newPasswords(host)) await type(input, 'draft-password');
  await click(checkbox(host));
  expect(newPasswords(host)).toHaveLength(0);
  expect(current.disabled).toBe(false);
  expect(current.getAttribute('aria-required')).toBe('true');
  await click(checkbox(host));
  expect(newPasswords(host)).toHaveLength(2);
  expect(newPasswords(host).every((input) => !input.disabled && input.value === 'draft-password')).toBe(true);
  await click(checkbox(host));
  await submit(host);
  expect(current.getAttribute('aria-invalid')).toBe('true');
  expect(fetcher).not.toHaveBeenCalled();
  await type(current, 'current-password');
  await submit(host);
  expect(sentBody(fetcher)).toMatchObject({
    action: 'disable', confirm_disable: true, current_password: 'current-password', password: '', confirmation: '',
  });
});

it('Server per-field reasons write back to their fields', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false, status: 400,
    json: async () => ({ message: 'Current access password is incorrect', errors: { current_password: 'Current access password is incorrect' } }),
  })));
  const host = await mount({ mode: 'password', revision: 'one' });
  for (const input of host.querySelectorAll<HTMLInputElement>('input[type="password"]')) await type(input, 'example-password');
  await submit(host);
  const current = host.querySelector<HTMLInputElement>('#access-current')!;
  expect(current.getAttribute('aria-invalid')).toBe('true');
  const described = (current.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
  expect(described.map((id) => document.getElementById(id)?.textContent)).toContain('Current access password is incorrect');
});

it('A missing password renders as a warning; submitting invalid content turns into a field error and sends no request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const host = await mount({ mode: 'open', revision: 'one' });
  expect(host.querySelector('[role="note"]')?.textContent).toContain('No access password set');
  expect(host.textContent).toContain('At least 8 characters');
  const [password, confirm] = newPasswords(host) as [HTMLInputElement, HTMLInputElement];
  await type(password, 'short');
  await type(confirm, 'other');
  await submit(host);
  expect(password.getAttribute('aria-invalid')).toBe('true');
  expect(confirm.getAttribute('aria-invalid')).toBe('true');
  expect(host.textContent).toContain('The access password needs 8-256 characters');
  expect(host.textContent).toContain('The two passwords do not match');
  expect(fetcher).not.toHaveBeenCalled();
});
