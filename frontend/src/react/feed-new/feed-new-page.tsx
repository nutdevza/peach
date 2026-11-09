/* The home new-releases row (the `feed-new` in-page component, rendered by the route tree into `#feedNew`). Only painted on catalog paths: leaving the catalog the shell retracts it, and while the person changes
 * filters within the catalog this row does not remount or refetch, since it does not follow filters. The fetched cards portal back into the host `#feedNew` itself. */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { errorMessage } from '../../api';

import { queryClient } from '../query';
import { feedNewKey, feedNewOptions, postFeedAction, type FeedNewProps } from './feed-new';
import { FeedNewRow } from './feed-new-row';

export function FeedNewPage({ host, revision, helpers, actions }: FeedNewProps) {
  const feed = useQuery(feedNewOptions(null, helpers.feedRowHtml));
  const seen = useRef(revision);
  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    void queryClient.invalidateQueries({ queryKey: feedNewKey(null) });
  }, [revision]);
  return createPortal(<FeedNewRow feedNew={feed.data ?? null} host={host} wire={helpers.wireFeedRow}
    act={postFeedAction} settled={actions.settled} error={!feed.data && feed.isError ? errorMessage(feed.error) : undefined}
    retry={() => { void feed.refetch() }} />, host);
}
