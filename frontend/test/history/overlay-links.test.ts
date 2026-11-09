import { afterEach, expect, it } from 'vitest';
import { navigationLinkPath } from '../../src/history/links';

afterEach(() => { document.body.innerHTML = ''; document.head.querySelector('base')?.remove() });

function clickPath(href: string, init: MouseEventInit = {}, attributes: Record<string, string> = {}, prevented = false) {
  const link = document.createElement('a'), child = document.createElement('span');
  link.href = href;
  for (const [key, value] of Object.entries(attributes)) link.setAttribute(key, value);
  link.append(child); document.body.append(link);
  let result: string | null = null;
  link.addEventListener('click', event => {
    if (prevented) event.preventDefault();
    result = navigationLinkPath(event);
    event.preventDefault();
  });
  child.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  return result;
}

it.each(['/assets/11', '/assets/21?parts=21&t=30', '/assets/31?editions=31', '/assets/11?mix=11',
  '/assets/11?playlist=2', '/posts/3?t=20', '/works/ABP-968#comments'])(
  'In-site detail links enter overlay navigation: %s', path => {
    expect(clickPath(path)).toBe(path);
    expect(clickPath(new URL(path, window.location.href).href, {}, { target: '_self' })).toBe(path);
  },
);

it('Browser modifier keys, other buttons, already-handled links, and other windows never enter overlay navigation', () => {
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    expect(clickPath('/assets/11', init)).toBeNull();
  }
  for (const attributes of [{ target: '_blank' }, { target: 'preview' }, { download: '' }]) {
    expect(clickPath('/assets/11', {}, attributes)).toBeNull();
  }
  expect(clickPath('/assets/11', {}, {}, true)).toBeNull();
  const base = document.createElement('base'); base.target = '_blank'; document.head.append(base);
  expect(clickPath('/assets/11')).toBeNull();
  expect(clickPath('/assets/11', {}, { target: '_self' })).toBe('/assets/11');
});

it.each(['/', '/subscriptions?tab=add', '/settings/library', '/follow?status=new', '/tags?scope=online&view=alphabet',
  '/data-cleanup', '/junk-files?phase=pending', '/taste', '/jav?tab=discover'])(
  'Registered pages are taken over by client navigation: %s', path => { expect(clickPath(path)).toBe(path) },
);

it.each(['https://other.invalid/assets/11', '/api/export', '/unregistered', '/assets/0', '/assets/no-id', '/works/!', '/posts/0'])(
  'External sites, unregistered pages, and invalid detail addresses keep their original behavior: %s', path => { expect(clickPath(path)).toBeNull() },
);

it('In-page anchors, empty addresses, and invalid URLs on details pages keep their original behavior', () => {
  window.history.replaceState(null, '', '/assets/11');
  for (const href of ['#comments', '', 'http://[']) expect(clickPath(href)).toBeNull();
});

it('In-page anchors on the catalog keep the browser\'s native scrolling', () => {
  window.history.replaceState(null, '', '/');
  expect(clickPath('#main')).toBeNull();
});

it('Manage-area anchors go through in-site navigation, and in-page anchors keep the current page too', () => {
  expect(clickPath('/data-cleanup#resource-sync')).toBe('/data-cleanup#resource-sync');
  expect(clickPath('/settings/library#peachProxy')).toBe('/settings/library#peachProxy');
  window.history.replaceState(null, '', '/data-cleanup');
  expect(clickPath('#libraryProcessing')).toBe('/data-cleanup#libraryProcessing');
});
