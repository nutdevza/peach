import { afterEach, expect, it, vi } from 'vitest';

import { randomId } from '../src/core/random-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** LAN HTTP page: only `getRandomValues`, no `randomUUID`. */
const insecureContext = () => {
  const real = globalThis.crypto;
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
};

afterEach(() => vi.unstubAllGlobals());

it('Secure contexts use the browser\'s randomUUID directly', () => {
  const native = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  expect(randomId()).toBe('00000000-0000-4000-8000-000000000000');
  expect(native).toHaveBeenCalledOnce();
});

it('Still generates a v4 UUID on HTTP pages without randomUUID, different each time', () => {
  insecureContext();
  const ids = Array.from({ length: 64 }, randomId);
  for (const id of ids) expect(id).toMatch(UUID_V4);
  expect(new Set(ids).size).toBe(ids.length);
});

it('Version and variant bits are fixed with the rest from random bytes', () => {
  vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) });
  expect(randomId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
});
