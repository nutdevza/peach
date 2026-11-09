/* The React subtree's entry to the TanStack Query client (ADR-0031, "frontend base libraries ship with the page").
 *
 * The instance is built in `src/query/client.ts` and referenced via `@peach/query`, with the alias resolving directly to the
 * same source: the filter bar data the shell fetches at startup, page-level `prefetch` and components' `useQuery` all read
 * the same cache. */
export { queryClient } from '@peach/query';
