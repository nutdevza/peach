import { useMemo } from 'react';
import { diffChars } from 'diff';

/** Differences affect display only; source text, whitespace and Unicode characters are preserved and take no part in the adopt-details request. */
export function ComparisonText({ value, reference }: { value: string; reference?: string }) {
  const parts = useMemo(() => reference
    ? diffChars(reference, value).filter(part => !part.removed)
    : [{ value, added: false }], [value, reference]);
  return <>{parts.map((part, index) => part.added
    ? <mark key={index} data-review-difference=""
        className="rounded-sm bg-status-yellow-background text-status-yellow-text">{part.value}</mark>
    : <span key={index}>{part.value}</span>)}</>;
}
