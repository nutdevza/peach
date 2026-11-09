import { UNSAFE_PortalProvider } from 'react-aria';
import { expect, it, vi } from 'vitest';

import { ModalFrame } from '../../src/react/components/modal-frame';
import { overlayHost, topOverlay } from '../../src/react/components/overlay-host';
import { mountRoot } from './render';

function stage(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.open = true;
  document.body.append(dialog);
  return dialog;
}

it('A real modal popover with a trailing focus sentinel still yields the dialog, and after unmount there is no popover', async () => {
  const dialog = stage();
  const host = overlayHost(dialog);
  const root = await mountRoot(
    <UNSAFE_PortalProvider getContainer={() => host}>
      <ModalFrame isOpen onOpenChange={vi.fn()} width="form" label="Resources">
        <button type="button">Off</button>
      </ModalFrame>
    </UNSAFE_PortalProvider>,
  );
  const layer = host.querySelector<HTMLElement>('[role="dialog"]');
  expect(layer).not.toBeNull();
  expect(host.lastElementChild?.hasAttribute('data-focus-scope-end')).toBe(true);
  expect(topOverlay(dialog)).toBe(layer);
  await root.unmount();
  expect(topOverlay(dialog)).toBeNull();
});

it('Stacked popovers take the last layer by actual role nodes, ignoring the focus sentinels on either side', () => {
  const dialog = stage();
  const host = overlayHost(dialog);
  host.innerHTML = '<span hidden data-focus-scope-start></span><div role="dialog"></div><span hidden data-focus-scope-end></span><span hidden data-focus-scope-start></span><div role="listbox"></div><span hidden data-focus-scope-end></span>';
  const list = host.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(topOverlay(dialog)).toBe(list);
  list.remove();
  expect(topOverlay(dialog)).toBe(host.querySelector('[role="dialog"]'));
});

it('Only queries the current details popover host and does not take over other dialogs on the page', () => {
  const dialog = stage();
  const other = document.createElement('div');
  other.setAttribute('role', 'dialog');
  document.body.append(other);
  expect(topOverlay(dialog)).toBeNull();
  overlayHost(dialog);
  expect(topOverlay(dialog)).toBeNull();
});
