import type { FollowSource } from './follow-feed';

/** An empty source set must not be converted into the backend's all-sources check. */
export const validCheckSources = (ids: readonly number[]): number[] =>
  [...new Set(ids)].filter(id => Number.isSafeInteger(id) && id > 0);

/** The profile page only checks the sources matching the current byline or the bound entity. */
export function entityCheckSources(sources: readonly Pick<FollowSource, 'id' | 'author_key' | 'entity_id'>[], author: string): number[] {
  if (!author) return [];
  return validCheckSources(sources.filter(source => source.author_key === author
    || (author.startsWith('entity:') && String(source.entity_id) === author.slice(7))).map(source => source.id));
}
