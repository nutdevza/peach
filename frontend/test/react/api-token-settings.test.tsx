/* 访问口令与 HTTPS 证书分区：换口令先说清谁要重新登录，新口令只显示这一次；证书分区画出二维码与指纹。
 * 外观由预览与 e2e 量。 */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import { queryClient } from '../../src/react/query';
import { ApiTokenSettings, rotationEffect } from '../../src/react/settings/api-token-settings';
import { CertificateTrust, type CertificateState } from '../../src/react/settings/certificate-trust';
import { buttonNamed, click, mount, section, settle } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => { queryClient.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() });

type Confirmation = Parameters<typeof legacyUi.confirmModal>[0];
function confirmWith(answer: boolean) {
  const seen: Confirmation[] = [];
  vi.spyOn(legacyUi, 'confirmModal').mockImplementation((async (options: Confirmation) => {
    seen.push(options);
    if (answer) await options.onConfirm?.();
    return { confirmed: answer };
  }) as typeof legacyUi.confirmModal);
  return seen;
}

function serve(body: unknown) {
  const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

const rotatable = { rotatable: true, reason: '', paired: false };
const render = (node: ReactNode) => mount(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);

it('The confirmation copy says, per access method, who must sign in again', () => {
  expect(rotationEffect('password', false)).toContain('Browsers signed in with the access password are unaffected');
  expect(rotationEffect('legacy', false)).toContain('Browsers signed in with this passphrase all sign out and must sign in again with the new one; this machine stays signed in. Scripts and API calls using the old token stop working immediately.');
  expect(rotationEffect('open', false)).toContain('Browsers without sign-in are unaffected. Scripts and API calls using the old token stop working immediately.');
  expect(rotationEffect('password', true)).toContain('Another computer needs the same token file');
  for (const mode of ['password', 'legacy', 'open'] as const) {
    expect(rotationEffect(mode, false)).toContain('Scripts and API calls using the old token stop working immediately');
  }
});

it('Canceling the confirmation sends no request; confirming shows the new token once', async () => {
  const fetcher = serve({ ...rotatable, token: 'new-token-value', mode: 'legacy', signed_out: 2 });
  const receipt = vi.fn();
  const seen = confirmWith(false);
  const host = await render(<ApiTokenSettings initial={rotatable} mode="legacy" receipt={receipt} />);
  await click(buttonNamed('Rotate token', host)!);
  expect(seen[0]!.body).toBe(rotationEffect('legacy', false));
  expect(fetcher).not.toHaveBeenCalled();

  vi.restoreAllMocks();
  confirmWith(true);
  await click(buttonNamed('Rotate token', host)!);
  await settle();
  expect(fetcher).toHaveBeenCalledWith('/api/configuration/access/token/rotate', expect.objectContaining({ method: 'POST' }));
  const card = section(host, 'Access token')!;
  expect(card.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('new-token-value');
  expect(card.textContent).toContain('The new token is shown only once');
  expect(receipt).toHaveBeenCalledWith('Access token rotated; 2 devices must sign in again');
});

it('When the token is overridden by a startup argument only the reason is written; no change button', async () => {
  const host = await render(<ApiTokenSettings initial={{ rotatable: false, reason: '口令由启动参数指定。', paired: false }}
    mode="password" receipt={vi.fn()} />);
  expect(buttonNamed('Change token', host)).toBeNull();
  expect(section(host, 'Access token')!.textContent).toContain('口令由启动参数指定。');
});

it('The certificate section draws the QR code, the segmented fingerprint and the download link', async () => {
  const fingerprint = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const state: CertificateState = {
    fingerprint, not_after: '2036-08-18', download: '/api/configuration/certificate/peach-local-ca.crt',
    phone_url: 'https://peach.local/api/configuration/certificate/peach-local-ca.crt?k=x', expires_in: 600,
    qr: ['101', '010', '101'],
  };
  const host = await render(<CertificateTrust initial={state} />);
  const card = section(host, 'Other devices trusting the HTTPS certificate')!;
  expect(card.querySelector('svg[role="img"] path')!.getAttribute('d')).toBe('M4 4h1v1h-1zM6 4h1v1h-1zM5 5h1v1h-1zM4 6h1v1h-1zM6 6h1v1h-1z');
  expect([...card.querySelectorAll('.font-mono > span')].map(node => node.textContent)).toEqual([
    '00:01:02:03:04:05:06:07', '08:09:0A:0B:0C:0D:0E:0F', '10:11:12:13:14:15:16:17', '18:19:1A:1B:1C:1D:1E:1F']);
  expect(card.querySelector('a[download]')!.getAttribute('href')).toBe(state.download);
  expect(card.textContent).toContain('Other devices trusting the HTTPS certificate');
});
