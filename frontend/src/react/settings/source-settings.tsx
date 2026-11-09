/* Source credentials, subscription collection, resource search and profile sites share one Peach configuration section. Credentials and follow collection are the core of this group
 *  and come first; resource search and profile sites that only swap mirror addresses change rarely and come after. */
import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/base/buttons/button';
import type { ConfigurationGroupProps } from '../bundle';
import { Credentials } from '../follow-manage/credentials';
import { fetchCredentials, FOLLOW_CREDENTIALS_KEY } from '../follow-manage/follow-manage';
import { Note } from '../components/note';
import { errorMessage } from '../../api';
import { credentialsSkeleton } from '../../configuration-skeleton';
import { groupRoot } from './configuration-panel';
import { EntryLinksForm } from './entry-links-settings';
import { IndexerSettings } from './indexer-settings';
import { SectionSkeleton } from './section';
import { FollowPreferenceRows } from './service-preferences';

export function SourceSettings({ data, receipt, panel, issues }: ConfigurationGroupProps) {
  const credentials = useQuery({ queryKey: FOLLOW_CREDENTIALS_KEY,
    queryFn: ({ signal }) => fetchCredentials(signal), enabled: panel?.active !== false, refetchOnMount: 'always' });
  return <div {...groupRoot(panel)}>
    {issues}
    <div data-guide-target="sources"><ButtonLink href="/sources" variant="secondary">Scrape sources and login status</ButtonLink></div>
    {credentials.data
      ? <Credentials data={credentials.data} readOnly={Boolean(data.ledger_read_only)} toast={receipt} embedded />
      : credentials.error
        ? <Note tone="error" title="Source credentials not fetched">{errorMessage(credentials.error)}</Note>
        : panel?.active !== false ? <SectionSkeleton label="Reading source credentials" html={credentialsSkeleton} /> : null}
    <FollowPreferenceRows receipt={receipt} />
    <IndexerSettings receipt={receipt} />
    {data.entry_links ? <EntryLinksForm initial={data.entry_links} receipt={receipt} /> : null}
  </div>;
}
