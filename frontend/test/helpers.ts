import { vi } from 'vitest';

/** A fetch that can be resolved manually: the island's waiting window is itself the behavior under test, not something to guess at with setTimeout. */
export function deferredFetch(body: unknown) {
  let settle = (): void => {};
  let signal: AbortSignal | undefined;
  const fetched = vi.fn((_input: string, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>((resolve, reject) => {
      settle = () => resolve({ ok: true, status: 200, json: async () => body });
      signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  });
  return {
    fetched,
    resolve: () => settle(),
    signal: () => signal,
    install: () => vi.stubGlobal('fetch', fetched),
  };
}
