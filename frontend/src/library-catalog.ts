/* Page-level sharing of the media library list: the shell's media library switcher fetches `/api/libraries` once per load and hands it here;
 * the cards' source colors and the list rows' library names read this copy directly instead of each requesting. Source colors follow server config
 * (`media.library_catalog`, ADR-0116); the local side only caches the last colors so first-screen cards have color before the API returns. */

export interface LibraryRow {
  id: string; name: string; icon?: string; color?: string; policy?: string;
  roots?: { root_id?: string; location: string }[];
}

/** 新建媒体库接在自定义顺序末尾，已删除的 ID 不参与显示。 */
export function orderLibraries<T>(rows: readonly T[], keys: readonly string[], id: (row: T) => string): T[] {
  const rank = new Map(keys.map((key, index) => [key, index]));
  return [...rows].sort((a, b) => (rank.get(id(a)) ?? keys.length) - (rank.get(id(b)) ?? keys.length));
}

const CACHE_KEY = 'peach.library-colors.v1';
let rows: readonly LibraryRow[] | null = null;
const listeners = new Set<(rows: readonly LibraryRow[]) => void>();

/** The colors the server gave last time, `{library_id: accent key}`, for the first screen only. */
export function cachedLibraryColors(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return value && typeof value === 'object' ? value as Record<string, string> : {};
  } catch {
    return {};
  }
}

export function publishLibraries(next: readonly LibraryRow[]): void {
  rows = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(next.filter(row => row.color).map(row => [row.id, row.color]))));
  } catch { /* If saving fails, the next first screen waits for the API before painting. */ }
  listeners.forEach(listener => listener(next));
}

export function publishedLibraries(): readonly LibraryRow[] | null {
  return rows;
}

export function onLibraries(listener: (rows: readonly LibraryRow[]) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}
