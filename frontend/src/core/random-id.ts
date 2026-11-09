/* Browsers only provide `crypto.randomUUID` on HTTPS and localhost pages; opened over HTTP on the LAN it does not exist.
 * `getRandomValues` works on any page; use it to assemble a v4 UUID of the same format per RFC 9562, and the server's UUID-checked identity passes as usual. */

/** A random v4 UUID, usable on HTTP pages too. */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
