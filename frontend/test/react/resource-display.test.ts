import { expect, it } from 'vitest';
import { resourceSize } from '../../src/react/wants/resource-display';

it('Source sizes without units present as unknown', () => {
  for (const value of ['4219', '4,219', '4219.5']) expect(resourceSize(value)).toBe('Unknown size');
  expect(resourceSize('3 GB')).toBe('3 GB');
  expect(resourceSize('4219 MB')).toBe('4219 MB');
  expect(resourceSize('')).toBe('Unknown size');
});

it('When the source gives no size field, show it as unknown', () => {
  expect(resourceSize(undefined)).toBe('Unknown size');
  expect(resourceSize(null)).toBe('Unknown size');
});
