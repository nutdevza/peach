import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { SelectionPopover } from '../../src/react/components/selection-popover';
import { SelectionActions } from '../../src/react/components/selection-actions';
import { actionOrder, buttonNamed, click, linkNamed, mount } from './render';

it('Bulk actions and per-row checks share selection state, and the popover stays open after acting', async () => {
  function Picker() {
    const [selected, setSelected] = useState(false);
    return <SelectionPopover label="Sample filter" triggerLabel="Select source"
      items={[{ id: 'source', label: 'Source 1', selected }]}
      onChange={(_id, on) => setSelected(on)} actions={[
        { label: 'Select all', onPress: () => setSelected(true) },
        { label: 'Deselect all', onPress: () => setSelected(false) },
        { label: 'Credential setup', href: '/settings/subscriptions' },
      ]} />;
  }
  const host = await mount(<Picker />);
  await click(buttonNamed('Select source', host));
  const dialog = () => document.querySelector('[role="dialog"][aria-label="Example filter"]')!;
  const checkbox = () => dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(actionOrder(dialog().querySelector('[data-selection-actions]'))).toEqual(['Select all', 'Deselect all', 'Credential setup']);
  await click(buttonNamed('Select all', dialog()));
  expect(checkbox().checked).toBe(true);
  await click(checkbox());
  expect(checkbox().checked).toBe(false);
  expect(linkNamed('Credential setup', dialog())?.getAttribute('href')).toBe('/settings/subscriptions');
});

it('Bulk actions keep disabled states and full button names', async () => {
  const press = vi.fn();
  const host = await mount(<SelectionActions layout="fullWidth" actions={[
    { label: 'Show all columns', onPress: press, disabled: true },
    { label: 'Reset display', onPress: press },
  ]} />);
  expect(buttonNamed('Show all columns', host)?.disabled).toBe(true);
  await click(buttonNamed('Show all columns', host));
  expect(press).not.toHaveBeenCalled();
  await click(buttonNamed('Reset display', host));
  expect(press).toHaveBeenCalledOnce();
});
