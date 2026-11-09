/* The island layer's only fetch entry.
 *
 * It keeps the same failure semantics as the legacy layer's `api()` (`src/core/index.ts`) (read JSON first, then pick a
 * human-readable reason from `message`/`detail`/`error`), with two additions: the return type is declared by the caller, and
 * requests carry an `AbortSignal`. The second is required on islands: when a page is swapped out mid-fetch, a late response
 * must not write into the new page. */

/** The server explicitly answered non-2xx. `status` lets the caller tell apart 401/409/404 cases that need different handling. */
import { requestErrorMessage } from './core/request-error';
import { registerResponseEntities } from './core/entity-links';
import { libraryScopedPath } from './core/library-scope';

export class ApiError extends Error {
  readonly status: number;
  /** The response body as-is. Form-validation style 400s give per-field reasons in `errors`, and the page must write them back into place. */
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(requestErrorMessage(message,status));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const reasonOf = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return '';
  const body = payload as Record<string, unknown>;
  for (const key of ['message', 'detail', 'error']) {
    const value = body[key];
    if (typeof value === 'string' && value) return value;
  }
  return '';
};

/** Collapse whatever was thrown into one displayable reason.
 *
 *  A failed fetch lands in two places at once, the route tree's first-screen state and the shared store's error state,
 *  and both must show the same sentence, otherwise one failure reads differently depending on where it landed. */
export const errorMessage = (cause: unknown): string => requestErrorMessage(cause);

/** GETs a `/api/...` contract endpoint. Throws `AbortError` when `signal` aborts, so the caller can give up writing the DOM. */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  path = libraryScopedPath(path);
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    // The page passphrase is an httponly cookie that every fetch must carry; cross-origin requests are exempt.
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    signal?.throwIfAborted();
    // A failed response is not necessarily JSON (a 401 login page, for example); the status code below is the fallback.
  }
  if (!response.ok) {
    throw new ApiError(reasonOf(payload) || `Request failed (${response.status})`, response.status);
  }
  registerResponseEntities(path, payload);
  return payload as T;
}

/** A write with a JSON request body. On failure the raw response body rides on `ApiError.body`; the caller picks out field-level reasons. */
export async function apiSend<T>(path: string, body: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method, ...(signal ? { signal } : {}),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    signal?.throwIfAborted();
    // Same as above: a failed response is not necessarily JSON.
  }
  if (!response.ok) {
    throw new ApiError(reasonOf(payload) || `Request failed (${response.status})`, response.status, payload);
  }
  return payload as T;
}
