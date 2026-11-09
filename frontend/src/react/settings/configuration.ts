/* The configuration page's first-screen data.
 *
 * The whole page and every section read the same `queryKey`: the mount-status block's "Refresh" also refetches the whole
 * configuration, written back into this one key, so there is only one truth on screen. Endpoint strings are declared once in
 * `frontend/src`, in `../../configuration-endpoints` (`tests/test_frontend_build.py` watches this). */
import { apiGet } from '../../api';
import { CONFIGURATION_URL } from '../../configuration-endpoints';
import type { ConfigurationData } from '../bundle';
import { queryClient } from '../query';

export const CONFIGURATION_KEY = ['configuration'] as const;

export const fetchConfiguration = (signal?: AbortSignal) =>
  apiGet<ConfigurationData>(CONFIGURATION_URL, signal);

/** First screen: renders only once the fetch is back. On abort, `fetchQuery` throws `AbortError` back to the caller, which gives up on this attempt. */
export async function prefetchConfiguration(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: CONFIGURATION_KEY, queryFn: () => fetchConfiguration(signal),
  });
}
