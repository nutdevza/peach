import { expect, it } from 'vitest';

import { feedIdentity } from '../src/card-art/feed-identity';

const render = (item: Parameters<typeof feedIdentity>[0]) => {
  const host = document.createElement('div');
  host.innerHTML = feedIdentity(item);
  return host;
};

it('New-release person avatars carry version and framing and enter the canonical identity page', () => {
  const host = render({ performers: 'Source name', performer_refs: [{ id: 42, name: 'Canonical name', has_image: true,
    image_version: 'v7', avatar_focus: { axis: 'y', pct: 20 } }] });
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/performers/42');
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/entity-image?kind=performer&id=42&thumb=1&v=v7');
  expect(host.querySelector('img')?.style.objectPosition).toBe('50% 20%');
});

it('New releases without an entity image keep the initial letter and never request a nonexistent avatar', () => {
  const host = render({ performers: 'A, B', performer_refs: [{ id: 1, name: 'Alpha', has_image: false }] });
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('.ini')?.textContent).toBe('A');
});

it('The co-star new-release source avatar slot keeps the canonical person link and video identity', () => {
  const host = render({ code: 'EXM-001', performer_refs: [
    { id: 1, name: 'Alpha', has_image: true },
    { id: 2, name: 'Beta', has_image: false, source_avatar: true, source_actor_id: 'Actor2' },
    { name: 'Not cataloged', source_avatar: true, source_actor_id: 'Actor3' },
  ] });
  const slots = [...host.querySelectorAll<HTMLElement>('[data-feed-source-avatar]')];
  expect(slots).toHaveLength(2);
  expect(slots[0]?.getAttribute('href')).toBe('/performers/2');
  expect(slots.map(slot => slot.dataset.actor)).toEqual(['Actor2', 'Actor3']);
  expect(slots.every(slot => slot.dataset.code === 'EXM-001')).toBe(true);
});

it('Unarchived multi-person bylines stack at most three initials with escaped names', () => {
  const host = render({ performers: '<A>, B, C, D' });
  expect(host.querySelectorAll('.mav')).toHaveLength(3);
  expect(host.querySelector('.ini')?.textContent).toBe('<');
  expect(host.querySelector('a')).toBeNull();
  expect(host.querySelector('Alpha')).toBeNull();
  expect(render({}).children).toHaveLength(0);
});
