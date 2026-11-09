/* The quality upgrade targets' data contract and reductions: `/api/quality-goals` serves the whole page in one request.
 *
 * The endpoint is declared once in `frontend/src`, here only (`tests/test_frontend_build.py` watches this).
 * The data management page's quality card wants the same truth's `total`; when that page migrates to React it reads the
 * `QUALITY_GOALS_KEY` below instead of sending another request: fetching one truth twice is how two displayed numbers drift
 * apart. */
import { coverUrl } from '@peach/card-art';

import { apiGet } from '../../api';
import { queryClient } from '../query';

/** The cap follows the server's 200: `limit` is pinned to 200 too, anything larger just gets truncated. */
export const QUALITY_GOALS_URL = '/api/quality-goals?limit=200';
/** The whole page shares this one key. */
export const QUALITY_GOALS_KEY = ['quality-goals'] as const;

/** A single `/api/quality-goals` entry. Fields align with `web_contract.q_quality_goals`. */
export interface QualityGoal {
  id: number;
  name: string;
  code: string | null;
  location: string;
  size: number | null;
  duration: number | null;
  reason: string | null;
  cost: string;
  has_thumb: boolean;
  has_cover: boolean;
  cover_version?: string;
}

export interface QualityGoalsData {
  total: number;
  items: QualityGoal[];
  offset: number;
  has_more: boolean;
}

export const fetchQualityGoals = (signal?: AbortSignal) =>
  apiGet<QualityGoalsData>(QUALITY_GOALS_URL, signal);

/** First screen: paint only after data arrives.
 *
 * No `staleTime`, so every entry into this page refetches. In the route table `/quality-goals` is
 * `refresh:'reopen'`; refreshing means re-entering, and what is wanted then is fresh data, not a cache from minutes ago.
 * On abort `fetchQuery` throws `AbortError` back to the mounter, which gives up on this attempt. */
export async function prefetchQualityGoals(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: QUALITY_GOALS_KEY,
    queryFn: () => fetchQualityGoals(signal),
  });
}

/** The cover prefers the code's cover image and falls back to the 4th poster. When neither is available the card drops the img. */
export const previewUrl = (item: QualityGoal): string => item.has_cover
  ? coverUrl(item)
  : `/poster?id=${item.id}&c=4`;
