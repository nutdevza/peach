/* Source reachability as used on the React pages side. Data management needs to know which sources this run will scan and
 *  whether the resource sync block appears; the duplicates page needs to know which cloud drives deserve a "prefer to keep"
 *  button.
 *
 * Address, query key and fetch function are shared with the shell, declared in `src/query/media-sources.ts` and referenced
 * via `@peach/query`, with one instance in the main bundle. The server probes periodically; pages read the latest snapshot on
 * entry. */
import { fetchMediaSources, MEDIA_SOURCES_KEY, type MediaSourcesData, type MediaSourceStatus } from '@peach/query';

import { queryClient } from './query';
import { CLOUD_LOCATIONS, SCANNABLE_LOCATIONS } from '../core/media-sources';

export { fetchMediaSources, MEDIA_SOURCES_KEY } from '@peach/query';
export type { MediaSourcesData, MediaSourceStatus } from '@peach/query';

export async function prefetchMediaSources(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({ queryKey: MEDIA_SOURCES_KEY, queryFn: () => fetchMediaSources(signal) });
}

/** Mounts a storage source. Online sources like `online` are not written to disk and take no part in scans or reconciliation. */
export { SCANNABLE_LOCATIONS } from '../core/media-sources';

export const scannableSources = (data: MediaSourcesData | undefined): MediaSourceStatus[] =>
  (data?.sources ?? []).filter((source) => SCANNABLE_LOCATIONS.includes(source.location));

/** Cloud drives with a configured root. An offline drive still counts as a configured source: duplicate copies on it can still be picked to keep. */
export const cloudLocations = (data: MediaSourcesData | undefined): string[] =>
  (data?.sources ?? []).filter((source) => CLOUD_LOCATIONS.includes(source.location)
    && (source.roots === undefined || source.roots.length > 0)).map((source) => source.location);
