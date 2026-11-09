/* Access password and confirm, the two boxes: shared by the configuration page's "Access password" and the first-run page.
 *
 * Both are BoardUI `Input`s with `id` fixed to `access-password` and `access-confirm`, recognized by browser password
 * managers via `new-password`. When off, both gray out, become optional and stop showing errors; errors are written under
 * each box, and `confirmationInvalid` lets a caller with only one error message (the first-run page's `access_password`)
 * mark the confirm box red as well. Errors go verbatim into the hint under the box, and the caller may pass a node with
 * `role="alert"` for screen readers to announce. */
import type { ReactNode } from 'react';

import { Input } from '@/components/base/input/input';

export function PasswordPair({
  label, password, confirmation, onPassword, onConfirmation, disabled = false,
  passwordError, passwordHint, confirmationError, confirmationInvalid = false,
}: {
  label: string;
  password: string;
  confirmation: string;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  disabled?: boolean;
  passwordError?: ReactNode;
  passwordHint?: string;
  confirmationError?: ReactNode;
  confirmationInvalid?: boolean;
}) {
  return (
    <>
      <Input id="access-password" type="password" label={label}
        autoComplete="new-password" maxLength={256} value={password} onChange={onPassword}
        isDisabled={disabled} isRequired={!disabled} validationBehavior="aria"
        isInvalid={!disabled && Boolean(passwordError)}
        hint={disabled ? passwordHint : passwordError || passwordHint} />
      <Input id="access-confirm" type="password" label="Confirm the access password" autoComplete="new-password" maxLength={256}
        value={confirmation} onChange={onConfirmation} isDisabled={disabled} isRequired={!disabled} validationBehavior="aria"
        isInvalid={!disabled && (Boolean(confirmationError) || confirmationInvalid)}
        hint={disabled ? undefined : confirmationError} />
    </>
  );
}
