import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { appSettingsStore } from '../../src/appearance/settings';
import { orderLibraries } from '../../src/library-catalog';
import { navigationDefaults, normalizeNavigationOrder } from '../../src/navigation-order';
import { SortableBoardTabs, restoreNavigationOrder } from '../../src/react/components/navigation-order';
import { ObjectOrderDialog } from '../../src/react/components/object-order-dialog';
import { queryClient } from '../../src/react/query';
import { showToast } from '../../src/react/toaster';
import { buttonNamed, click, mount, settle } from './render';

vi.mock('../../src/react/toaster', () => ({ showToast: vi.fn() }));
afterEach(() => {
  queryClient.clear();
  appSettingsStore().value.navigationOrders = {};
  appSettingsStore().save();
});

it('Favorites pin everything as the first item; navigation appends new entries and removes duplicate and expired keys', () => {
  expect(normalizeNavigationOrder('favorites', ['tag', 'all', 'tag', 'removed']).slice(0, 3)).toEqual(['all', 'tag', 'filters']);
  expect(normalizeNavigationOrder('jav', null)).toEqual(['library', 'wants', 'releases', 'discover']);
  expect(orderLibraries([{ id: 'a' }, { id: 'b' }, { id: 'new' }], ['gone', 'b', 'a'], row => row.id).map(row => row.id))
    .toEqual(['b', 'a', 'new']);
});

it('Keyboard reordering of navigation saves stable IDs, keeps the selected section, and can be undone after reset', async () => {
  const writes: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    writes.push(body);
    return { ok: true, json: async () => body };
  }));
  const change = vi.fn();
  const host = await mount(<SortableBoardTabs group="jav" value="library" onChange={change} label="JAV sections"
    tabs={navigationDefaults('jav').map(value => ({ value, label: value }))} />);
  expect(host.querySelector('[data-navigation-menu]')).toBeNull();
  await act(async () => host.querySelector('[data-tab="wants"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })));
  await settle();
  expect([...host.querySelectorAll('[role="tab"]')].map(el => el.getAttribute('data-tab'))).toEqual(['wants', 'library', 'releases', 'discover']);
  expect(host.querySelector('[aria-selected="true"]')?.getAttribute('data-tab')).toBe('library');
  expect(change).not.toHaveBeenCalled();
  expect(host.querySelector('[data-navigation-menu]')).not.toBeNull();
  expect(writes).toContainEqual({ navigationOrders: { jav: ['wants', 'library', 'releases', 'discover'] } });
  const commit = vi.fn();
  restoreNavigationOrder({ label: 'JAV section', keys: ['wants', 'library', 'releases', 'discover'], defaults: navigationDefaults('jav'), commit });
  expect(commit).toHaveBeenLastCalledWith(navigationDefaults('jav'));
  const options = vi.mocked(showToast).mock.calls.at(-1)![1];
  options.action?.run(document.createElement('button'));
  expect(commit).toHaveBeenLastCalledWith(['wants', 'library', 'releases', 'discover']);
});

it('Object order is adjusted in the dialog first; a failed save keeps the order and the error, and closes only after a successful retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('The list has changed')).mockResolvedValueOnce(undefined);
  const close = vi.fn();
  await mount(<ObjectOrderDialog title="Adjust filter order" items={[{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]} save={save} close={close} />);
  await click(document.querySelector('[aria-label="Move up Beta"]'));
  expect(save).not.toHaveBeenCalled();
  await click(buttonNamed('Save order', document));
  await settle();
  expect(save).toHaveBeenLastCalledWith(['b', 'a']);
  expect(document.body.textContent).toContain('Adjust filter orderBetaAlphaThe operation did not finish; please retry. If it keeps failing, check the tray log.CancelSave order');
  expect(close).not.toHaveBeenCalled();
  await click(buttonNamed('Save order', document));
  await settle();
  expect(close).toHaveBeenCalledOnce();
});
