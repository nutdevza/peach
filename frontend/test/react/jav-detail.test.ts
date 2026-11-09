import { describe, expect, it } from 'vitest';
import { nextReviewPage, type JavReviews } from '../../src/react/jav-detail/jav-detail';
import { overlayMatch } from '../../src/history/overlay';

const page = (n: number, ids: string[], more = true): JavReviews => ({ ok: true, page: n, more,
  items: ids.map(id => ({ id, username: 'Example user', content: 'Example comment', created_at: '' })) });
describe('Out-of-library videos and comment identity', () => {
  it('Code routes keep independent identity and reject path fragments', () => {
    expect(overlayMatch('/works/EXM-001')?.target).toEqual({ kind: 'jav', code: 'EXM-001' });
    expect(overlayMatch('/works/../../file')).toBeNull();
    expect(overlayMatch('/assets/3')?.target).toEqual({ kind: 'item', id: 3 });
  });
  it('Pagination stops on duplicate or final page', () => {
    const first = page(1, ['1', '2']);
    expect(nextReviewPage(first, [first])).toBe(2);
    const duplicate = page(2, ['2', '1']);
    expect(nextReviewPage(duplicate, [first, duplicate])).toBeUndefined();
    const last = page(2, ['3'], false);
    expect(nextReviewPage(last, [first, last])).toBeUndefined();
  });
});
