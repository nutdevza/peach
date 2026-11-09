import { beforeEach, expect, it, vi } from 'vitest';

import { ExpandableRanking } from '../../src/react/components/expandable-ranking';
import { click, mount } from './render';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

const rows = (count: number) => Array.from(
  { length: count },
  (_value, index) => <li key={index}>{`Rank ${index + 1}`}</li>,
);

it('When rows do not exceed the preview limit, no expandable mark and no expand button are drawn', async () => {
  const host = await mount(<ExpandableRanking previewCount={5}>{rows(5)}</ExpandableRanking>);
  const frame = host.querySelector('[data-expandable-ranking]')!;
  expect(frame.hasAttribute('data-expandable')).toBe(false);
  expect(host.querySelector('[data-ranking-toggle]')).toBeNull();
});

it('When rows exceed the preview limit, mark expandable and the expand button toggles direction', async () => {
  const host = await mount(<ExpandableRanking previewCount={5}>{rows(9)}</ExpandableRanking>);
  const frame = host.querySelector('[data-expandable-ranking]')!;
  expect(frame.hasAttribute('data-expandable')).toBe(true);
  const toggle = host.querySelector<HTMLButtonElement>('[data-ranking-toggle]')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(frame.hasAttribute('data-expanded')).toBe(true);
});
