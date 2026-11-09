/* Local access password, composed from BoardUI's original components; form values stay only in component memory during
 * submission.
 *
 * The fields are BoardUI `Input` (React Aria TextField), the switch is BoardUI `Checkbox`, the submit key is BoardUI
 * `Button`; the new-password and confirm boxes are the `./password-pair` shared with the first-run page, and the section
 * frame and hints use the configuration page's shared `./section`. */
import { useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';

import { ApiError, apiSend, errorMessage } from '../../api';
import type { AccessSettingsProps, AccessState } from '../bundle';
import { Note } from '../components/note';
import { PasswordPair } from './password-pair';
import { ErrorText, Footer, Help, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

type FieldErrors = Partial<Record<'current_password' | 'password' | 'confirmation', string>>;

const HELP: Partial<Record<AccessState['mode'], string>> = {
  legacy: 'A system-generated access passphrase is in use. Set your own password, or turn off the sign-in requirement.',
  locked: 'Access settings could not be read; check the configuration file on this machine.',
  password: 'A password is set. New devices need to sign in; checking "Keep me signed in" keeps the session for 30 days.',
};

export function AccessSettings({ initial, receipt, devices, after }: AccessSettingsProps) {
  const [state, setState] = useState(initial);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [disable, setDisable] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const body = useRef<HTMLDivElement>(null);
  const action = useAction();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const issues: FieldErrors = {};
    if (state.mode === 'password' && !current) issues.current_password = 'Enter the current access password';
    if (!disable) {
      if (password.length < 8 || password.length > 256) issues.password = 'The access password needs 8-256 characters';
      if (password !== confirmation) issues.confirmation = 'The two passwords do not match';
    }
    setFields(issues);
    if (Object.keys(issues).length) {
      requestAnimationFrame(() => body.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus());
      return;
    }
    void action.run('save', (signal) => apiSend<AccessState>('/api/configuration/access', {
      revision: state.revision, action: disable ? 'disable' : 'set', confirm_disable: disable,
      current_password: current, password: disable ? '' : password, confirmation: disable ? '' : confirmation,
    }, 'POST', signal), (next) => {
      setState(next); setCurrent(''); setPassword(''); setConfirmation(''); setDisable(false); setFields({});
      receipt(next.mode === 'open' ? 'Access password disabled' : 'Configuration saved');
    }, (cause) => {
      const payload = cause instanceof ApiError ? cause.body as { errors?: FieldErrors; detail?: { errors?: FieldErrors } } : null;
      const errors = payload?.errors || payload?.detail?.errors;
      if (errors) setFields(errors); else action.setError(errorMessage(cause));
    });
  };

  const help = HELP[state.mode];
  const editable = state.mode !== 'locked';
  return (<>
    <Section guide="access" title="Access password" onSubmit={submit}>
      <div ref={body}>
        <Stack>
          {help ? <Help>{help}</Help> : null}
          {state.mode === 'open'
            ? <Note tone="warning" title="No access password set">Any device that can reach Peach can view the library by opening the address, with no sign-in required.</Note>
            : null}
          {state.mode === 'password' || state.mode === 'legacy'
            ? <Checkbox isSelected={disable} onChange={setDisable}>Turn off the access password</Checkbox>
            : null}
          {state.mode === 'password'
            ? <Input id="access-current" type="password" label="'Current access password'" autoComplete="current-password" maxLength={256}
                value={current} onChange={setCurrent} isRequired validationBehavior="aria"
                isInvalid={Boolean(fields.current_password)} hint={fields.current_password} />
            : null}
          {editable && !disable
            ? <PasswordPair label={state.mode === 'password' ? 'New access password' : 'Set the access password'}
                password={password} confirmation={confirmation} onPassword={setPassword} onConfirmation={setConfirmation}
                passwordError={fields.password} confirmationError={fields.confirmation}
                passwordHint="At least 8 characters. After saving, other devices must sign in again." />
            : null}
          {disable ? <Note tone="warning" title="Access range">After saving, devices that can reach Peach will access the library directly.</Note> : null}
          {action.error ? <ErrorText>{action.error}</ErrorText> : null}
        </Stack>
      </div>
      {editable
        ? <Footer><Button type="submit" {...busyProps(action.busy === 'save')}>Save configuration</Button></Footer>
        : null}
    </Section>
    {devices && (state.mode === 'password' || state.mode === 'legacy') ? devices(state) : null}
    {after ? after(state) : null}
  </>);
}
