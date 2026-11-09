import { fmtSize } from '@peach/legacy/core';

/** A source's byte count is shown using the library capacity standard; other sources keep their units; if a source gives no size, show unknown. */
export function resourceSize(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  const bytes = /^([\d,]+)\s*B$/i.exec(text);
  if (/^[\d,.]+$/.test(text)) return 'Unknown size';
  return bytes ? fmtSize(Number(bytes[1].replaceAll(',', ''))) : value || 'Unknown size';
}

/** A cached source limit only describes what this fetch covered and never infers account permissions. */
export function resourceNotice(value: string): string {
  return /^更多评论.*(?:VIP|官方 App)/.test(value)
    ? 'The source returned only part of the comments; resource links may be incomplete.'
    : value;
}
