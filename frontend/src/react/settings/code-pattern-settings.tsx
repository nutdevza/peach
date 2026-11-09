/* "Code recognition rules": for naming the built-in rules cannot recognize, the user writes regexes.
 *
 * One per line, searched against the full file name, case-insensitive; the code is taken from the named group `code`, else
 * the first parenthesized group, else the whole match. What is extracted must still look like a code
 * (`catalog_rules.compile_code_patterns`). Rules follow the ledger (`/api/settings`'s `codePatterns`) and take effect on
 * videos without a code at the next "Process". Validation is server-side only: a broken line is reported back on save, and
 * the frontend keeps no regex judgment of its own. */
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/base/buttons/button';
import { Textarea } from '@/components/base/textarea/textarea';

import { apiSend, errorMessage } from '../../api';
import { queryClient } from '../query';
import { SETTINGS_KEY, SETTINGS_URL, fetchSettings, type SyncedSettings } from '../settings-panel/settings-data';
import { Footer, Help, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

const PLACEHOLDER = '^\\+{3}\\s*(?<code>FC2-PPV-\\d+)\n\\[(?<code>[A-Z]+-\\d+)\\]';

export function CodePatternSettings({ receipt }: { receipt(message: string): void }) {
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal) });
  /* Untouched shows the ledger copy; once edited it is a local draft, and after a successful save the draft is dropped in favor of the ledger copy. */
  const [draft, setDraft] = useState<string | null>(null);
  const action = useAction();
  const value = draft ?? (settings.data?.codePatterns ?? []).join('\n');
  const failure = action.error || (settings.error ? errorMessage(settings.error) : '');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const codePatterns = value.split('\n').map((rule) => rule.trim()).filter(Boolean);
    void action.run('save', (signal) =>
      apiSend<SyncedSettings>(SETTINGS_URL, { codePatterns }, 'POST', signal),
      (saved) => {
        queryClient.setQueryData(SETTINGS_KEY, saved);
        setDraft(null);
        receipt('Configuration saved');
      });
  };

  return (
    <Section guide="codes" title="Code recognition rules" onSubmit={submit}>
      <Stack>
        <Help>When the built-in rules cannot recognize a code, it is taken from the file name by the rules here. One regular expression per line; write the code in (?&lt;code&gt;...), and without a named group the first parenthesized group is used. Rules take effect on the next processing run, for videos that do not have a code yet.</Help>
        <Textarea id="codePatternSetting" aria-label="Code recognition rules" rows={3} autoResize maxRows={12}
          spellCheck="false" autoComplete="off" placeholder={PLACEHOLDER} value={value}
          isDisabled={!settings.data} isInvalid={!!failure} hint={failure || undefined}
          onChange={setDraft} />
      </Stack>
      <Footer>
        <Button type="submit" {...busyProps(action.busy === 'save')}>Save configuration</Button>
      </Footer>
    </Section>
  );
}
