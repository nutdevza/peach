import { describe, expect, it } from 'vitest';
import { entityCheckSources, validCheckSources } from '../../src/react/follow-feed/follow-check';

describe('The empty state checks the source range', () => {
  const sources = [
    { id: 1, author_key: 'one', entity_id: 12 },
    { id: 2, author_key: 'two', entity_id: 12 },
    { id: 3, author_key: 'other', entity_id: 99 },
  ];
  it('The entity only includes sources bound to it', () => {
    expect(entityCheckSources(sources, 'entity:12')).toEqual([1, 2]);
    expect(entityCheckSources(sources, 'one')).toEqual([1]);
  });
  it('Unbound bylines and invalid sources never fall back to all-source checks', () => {
    expect(entityCheckSources(sources, '')).toEqual([]);
    expect(entityCheckSources(sources, 'missing')).toEqual([]);
    expect(validCheckSources([0, -1, NaN, 1.5, Infinity])).toEqual([]);
    expect(validCheckSources([2, 2, 3])).toEqual([2, 3]);
  });
});
