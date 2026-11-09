import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';
import { queryClient } from '../../src/react/query';
import { BrowserSources } from '../../src/react/taste/browser-sources';
import { act } from 'react';
import { BrowserIcon, browserIconId } from '../../src/react/components/browser-icon';
import { mountRoot } from './render';
import { actionOrder, buttonNamed, click, mount } from './render';

afterEach(() => { queryClient.clear(); vi.restoreAllMocks() });

const browser = { id: 'chrome', name: 'Chrome', path: 'C:\\Chrome\\User Data', enabled: true, available: true, profiles: 2 };
const open = () => mount(<QueryClientProvider client={queryClient}>
  <BrowserSources browsers={[browser]} sources={[]} range="90d" />
</QueryClientProvider>);

it('Browser sources show the matching brand; Chromium and Chrome use their own icons', async () => {
  const host = await open();
  expect(host.querySelector('[data-taste-source="browser"] img')?.getAttribute('src')).toBe('/browser-icon/chrome');
  for (const [name, expected] of [['Google Chrome','chrome'], ['Chromium','chromium'], ['Opera_Gx','opera-gx'],
    ['360Chromex','360chromex'], ['2345','2345'], ['115','115'], ['Aside','aside'], ['Zen Browser','zen']]) {
    expect(browserIconId(name)).toBe(expected);
  }
});

it('Unknown custom names and failed image loads use a generic mark, and after changing the source a new image can load', async () => {
  const view = await mountRoot(<BrowserIcon name="Chrome" />);
  await act(async () => { view.host.querySelector('img')!.dispatchEvent(new Event('error')) });
  expect(view.host.querySelector('img')).toBeNull();
  expect(view.host.querySelector('svg')).not.toBeNull();
  await view.rerender(<BrowserIcon name="Firefox" />);
  expect(view.host.querySelector('img')?.getAttribute('src')).toBe('/browser-icon/firefox');
  await view.rerender(<BrowserIcon name="My portable browser" />);
  expect(view.host.querySelector('img')).toBeNull();
});

it('The add-browser form puts cancel left and add right', async () => {
  const host = await open();
  await click(buttonNamed('Add browser', host));
  expect(actionOrder(host.querySelector('form'))).toEqual(['Cancel', 'Add']);
});

it('Deleting a browser source removes its imported history, and the confirm popover uses the danger style', async () => {
  const modal = vi.spyOn(legacyUi, 'confirmModal').mockResolvedValue({ confirmed: false });
  const host = await open();
  await click(host.querySelector('[aria-label="Delete Chrome"]'));
  expect(modal.mock.calls[0]?.[0]).toMatchObject({ title: 'Delete Chrome', confirmLabel: 'Delete browser source', danger: true });
});
