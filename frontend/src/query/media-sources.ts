/* Source reachability (/api/sources): address, query key and fetch function are declared only in this module.
 * Application's loadSourceStatus, the data management page, resource sync and the duplicates page all read this key.
 * No staleTime, so explicit refresh and page entry read the server's latest snapshot.
 * Application only reads the call's return value and does not subscribe; page refetches change neither the catalog's default
 * source nor the offline notice. */
import { isCancelledError } from '@tanstack/query-core';

import { apiGet } from '../api';
import { queryClient } from './client';

export const MEDIA_SOURCES_URL = '/api/sources';
export const MEDIA_SOURCES_KEY = ['media-sources'] as const;

/** One row of `/api/sources`. Fields align with `routes_api.source_health`. */
export interface MediaSourceStatus {
  location: string;
  online: boolean | null;
  state?: string;
  message?: string;
  roots?: { root_id?: string; library_id?: string; online: boolean | null; message?: string }[];
}

export interface MediaSourcesData {
  sources: MediaSourceStatus[];
}

export const fetchMediaSources = (signal?: AbortSignal) =>
  apiGet<MediaSourcesData>(MEDIA_SOURCES_URL, signal);

const stopped = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError' || isCancelledError(error);

/** The shell's source detection: called once each at startup, on details' "Refresh status" and when the player reports an
 *  error, asking the server every time.
 *
 *  The query function does not read the `signal` Query hands it: with it read, Query would cancel the trip when the page's
 *  last observer unmounts, leaving the shell the previous stale copy. Simultaneous duplicates of the same request are merged
 *  into one by Query; if the merged one is the page's trip, it carries the page's own `signal`, so the shell's trip ends
 *  aborted when the page aborts, and the shell sends again itself. */
export async function loadMediaSources(signal?: AbortSignal): Promise<MediaSourcesData> {
  signal?.throwIfAborted();
  const fetchOnce = () => queryClient.fetchQuery({ queryKey: MEDIA_SOURCES_KEY, queryFn: () => fetchMediaSources(signal) });
  try {
    const data = await fetchOnce();
    signal?.throwIfAborted();
    return data;
  } catch (error) {
    signal?.throwIfAborted();
    if (!stopped(error)) throw error;
    return await fetchOnce();
  }
}
