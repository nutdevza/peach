import { expect, it, vi } from 'vitest';

import { EntryLinksForm } from '../../src/react/settings/entry-links-settings';
import type { EntryLinksState } from '../../src/react/bundle';
import { fetchMock, mount, sentBody, settle, submit, switches, type } from './render';

const state: EntryLinksState = {
  sites: [
    { key: 'javdb', label: 'JavDB', host: '', default_host: 'javdb.com' },
    { key: 'missav', label: 'MISSAV', host: 'missav.ai', default_host: 'missav.ws' },
  ],
};

it('External entries: one address box each for the two mirrorable sites, empty by default, and saving sends the box value', async () => {
  const fetcher = fetchMock(200, state);
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<EntryLinksForm initial={state} receipt={receipt} />);
  // Whether the entry appears is decided by whether a site id exists in the database; the three buttons already live on the profile page, and there is no toggle here.
  expect(switches(host)).toEqual([]);
  // Minna no AV is one of a kind with no alternate domain, so it does not appear on this page.
  expect(host.querySelector('#entry-link-minnano-av')).toBeNull();
  const javdb = host.querySelector<HTMLInputElement>('#entry-link-javdb');
  // No making the user copy the default first: the field is empty, and the domain currently in use sits in the placeholder.
  expect(javdb?.value).toBe('');
  expect(javdb?.placeholder).toBe('javdb.com');
  expect(host.textContent).toContain('Video detail sitesIf JavDB or MISSAV will not open, enter a mirror domain that does.JavDB addressDomain only; leave blank for the default addressMISSAV addressDomain only; leave blank for the default addressSave configuration');
  expect(host.textContent).not.toContain('Address template');
  await type(javdb, 'javdb521.com');
  expect(fetcher).not.toHaveBeenCalled();
  await submit(host.querySelector('form'));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/entry-links');
  expect(sentBody(fetcher)).toEqual({
    sites: { javdb: { host: 'javdb521.com' }, missav: { host: 'missav.ai' } },
  });
  expect(receipt).toHaveBeenCalledWith('Configuration saved');
});

it('External entry: the description is the first block in the card, with no line drawn above it', async () => {
  const host = await mount(<EntryLinksForm initial={state} receipt={vi.fn()} />);
  const help = [...host.querySelectorAll('p')]
    .find((node) => node.textContent?.startsWith('When JavDB or MISSAV will not open'));
  const block = help?.parentElement;
  // That divider is for blocks placed after the settings rows, separating them from the group above. In this card it is itself the first block,
  // The line renders with nothing on it, so it reads as a section title's built-in bottom border.
  expect(block?.previousElementSibling).toBeNull();
  expect(block?.className).not.toContain('border-t');
});

it('Without a site from the server the address field never backfills', async () => {
  // The site list comes from the server. If the frontend kept its own default copy, it would sooner or later drift from `peach.entry_links`.
  const host = await mount(<EntryLinksForm initial={{ sites: [] }} receipt={vi.fn()} />);
  expect(host.querySelectorAll('input')).toHaveLength(0);
});
