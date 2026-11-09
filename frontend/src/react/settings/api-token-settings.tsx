/* 访问口令：脚本和 API 调用放在 `X-Token` 请求头里的那串，和访问密码是两套凭据。
 *
 * 口令平时不回给页面；换的那一次响应带新值，这里只显示到离开本页为止（ADR-0142）。
 * 换之前用 `confirmModal()` 说清谁要重新登录：用访问密码登录的浏览器不受影响；还没设
 * 访问密码的部署拿口令当登录凭据，其他浏览器全部退出，本机由服务端当场补签。
 * 新口令用 BoardUI 只读 `Input` 加复制键，形状同端口分区的地址行。 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { confirmModal } from '@peach/legacy/ui';

import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';

import { apiSend } from '../../api';
import type { AccessState } from '../bundle';
import { Note } from '../components/note';
import { Footer, Help, Section, Stack } from './section';
import { useAction } from './use-action';

export interface ApiTokenState {
  /** 这次启动的口令取自口令文件才能在这里换；被启动参数覆盖或没有口令时为 false。 */
  rotatable: boolean;
  /** 不能换时的原因，能换时为空。 */
  reason: string;
  /** 开着双机复制或复核镜像：两台要用同一份口令文件。 */
  paired: boolean;
}

interface Rotated extends ApiTokenState {
  token: string;
  mode: AccessState['mode'];
  /** 口令即登录凭据的部署里，这次被登出的其他设备数。 */
  signed_out: number;
  /** 本机的登录没能续上，要用新口令重新登录。 */
  relogin?: boolean;
}

const URL = '/api/configuration/access/token/rotate';

/** 确认框里那句后果：按这台的访问方式说清哪些设备要重新登录。 */
export function rotationEffect(mode: AccessState['mode'], paired: boolean): string {
  const scripts = 'Scripts and API calls using the old token stop working immediately.';
  const sentence = mode === 'legacy'
    ? `Browsers signed in with this passphrase all sign out and must sign in again with the new one; this machine stays signed in.${scripts}`
    : mode === 'open'
      ? `Browsers without sign-in are unaffected.${scripts}`
      : `Browsers signed in with the access password are unaffected.${scripts}`;
  return paired ? `${sentence}another computer needs the same token file for the two to keep exchanging review results.` : sentence;
}

export function ApiTokenSettings({ initial, mode, receipt }: {
  initial: ApiTokenState; mode: AccessState['mode']; receipt(message: string): void;
}) {
  const [state, setState] = useState(initial);
  const [rotated, setRotated] = useState<Rotated | null>(null);
  const copy = useAction();
  const queries = useQueryClient();

  const rotate = () => void confirmModal({
    title: 'Rotate the access token',
    body: rotationEffect(mode, state.paired),
    confirmLabel: 'Change token',
    onConfirm: async () => {
      const next = await apiSend<Rotated>(URL, {});
      setState(next); setRotated(next);
      // 口令即登录凭据时设备记录整份清空，列表要重取。
      if (next.mode === 'legacy') void queries.invalidateQueries({ queryKey: ['access-sessions'] });
      receipt(next.signed_out ? `Access token rotated; ${next.signed_out} devices must sign in again` : 'Access token rotated');
    },
  });

  return (
    <Section title="Access token">
      <Stack>
        <Help>Scripts and API calls carry the access token in the X-Token header. The token stays on this machine and is never shown on the page.</Help>
        {rotated ? (
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-end gap-2">
              <Input className="min-w-0 flex-1" label="New access token" value={rotated.token} isReadOnly autoComplete="off" />
              <Button variant="secondary" aria-label="Copy the new access token"
                onClick={() => void copy.run('copy', () => navigator.clipboard.writeText(rotated.token), () => receipt('Token copied'))}>
                Copy token
              </Button>
            </div>
            {copy.error ? <Help role="status">Copy failed; select the token and copy it manually.</Help> : null}
            <Note tone="info" title="The new token is shown only once">
              Takes effect immediately, no restart needed. It stops showing once you leave this page; afterwards run peach token in a terminal to see it.
            </Note>
          </div>
        ) : null}
        {rotated?.relogin ? <Note tone="warning" title="This machine must sign in again">Refresh the page and sign in with the new token.</Note> : null}
        {state.rotatable ? null : <Help>{state.reason}</Help>}
      </Stack>
      {state.rotatable
        ? <Footer status="Takes effect immediately.">
            <Button variant="secondary" onClick={rotate}>Rotate token</Button>
          </Footer>
        : null}
    </Section>
  );
}
