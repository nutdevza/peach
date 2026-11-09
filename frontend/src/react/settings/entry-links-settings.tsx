/* "External entries": the direct-entry buttons on the person profile page leading to Minna no AV, JavDB and MISSAV.
 *
 * Only JavDB and MISSAV have address boxes here: when either site's main domain is unreachable, a working mirror is entered
 * here; Minna no AV has only the one site with nothing to swap, so it does not appear on this page. The boxes default empty,
 * with the placeholder showing the domain currently in use, so the default needs no copying first and clearing returns to it.
 *
 * Whether an entry appears is not decided here: the address is assembled by the server (`peach.entry_links`), and a missing
 * site id means that button is simply not on the profile page, so there are no switches here. Validation is server-side too;
 * a duplicated judgment in the frontend would only drift. */
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';

import { apiSend } from '../../api';
import { ENTRY_LINKS_HELP, ENTRY_LINKS_HINT } from '../../configuration-copy';
import type { EntryLinkSite, EntryLinksState } from '../bundle';
import { ErrorText, Footer, Help, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';
import { SiteLabel } from '../components/source-label';

export function EntryLinksForm({ initial, receipt }: {
  initial: EntryLinksState;
  receipt(message: string): void;
}) {
  const [sites, setSites] = useState<EntryLinkSite[]>(initial.sites);
  const action = useAction();

  const change = (key: string, host: string) =>
    setSites((rows) => rows.map((row) => (row.key === key ? { ...row, host } : row)));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = { sites: Object.fromEntries(sites.map((site) => [site.key, { host: site.host }])) };
    void action.run('save', (signal) =>
      apiSend<EntryLinksState>('/api/configuration/entry-links', body, 'POST', signal),
      (next) => {
        setSites(next.sites);
        receipt('Configuration saved');
      });
  };

  return (
    <Section guide="entry-links" title="Video detail sites" onSubmit={submit}>
      <Stack>
        <Help>{ENTRY_LINKS_HELP}</Help>
        {sites.map((site) => (
          <Input key={site.key} id={`entry-link-${site.key}`} label={<SiteLabel site={site.key} label={`${site.label} address`} />}
            autoComplete="off" maxLength={100} value={site.host}
            placeholder={site.default_host}
            onChange={(host) => change(site.key, host)}
            validationBehavior="aria" hint={ENTRY_LINKS_HINT} />
        ))}
        {action.error ? <ErrorText>{action.error}</ErrorText> : null}
      </Stack>
      <Footer>
        <Button type="submit" {...busyProps(action.busy === 'save')}>Save configuration</Button>
      </Footer>
    </Section>
  );
}
