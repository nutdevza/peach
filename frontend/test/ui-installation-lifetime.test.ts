import { afterEach, expect, it, vi } from 'vitest';
import { wireAnchoredMenu } from '../src/ui-kit/anchored-menu';
import { wireUiSounds } from '../src/ui-kit/sounds';
import { wireImageFallbacks } from '../src/card-art/image-fallback';
import { initBoardControls } from '../src/board-controls';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

it('Audio and image delegation install once each per host', () => {
  const root = document.createElement('div');
  const add = vi.spyOn(root, 'addEventListener');
  wireUiSounds(root); wireUiSounds(root);
  wireImageFallbacks(root); wireImageFallbacks(root);
  expect(add.mock.calls.map(([name]) => name)).toEqual(['click', 'change', 'error']);
});

it('Reinstalling the Board control reuses the site-wide listener and tooltip', () => {
  const add = vi.spyOn(document, 'addEventListener');
  initBoardControls();
  const installed = add.mock.calls.length;
  initBoardControls();
  expect(add.mock.calls.length).toBe(installed);
  expect(document.querySelectorAll('#board-control-tooltip')).toHaveLength(1);
});

it('Destroying the anchored menu removes its listener, and remounting the same button leaves exactly one toggle', () => {
  const mount = document.createElement('div');
  const toggle = document.createElement('button'), menu = document.createElement('div');
  menu.hidden = true; mount.append(toggle, menu); document.body.append(mount);
  const remove = vi.spyOn(window, 'removeEventListener');
  const first = wireAnchoredMenu(mount, toggle, menu);
  first.setOpen(true); first.dispose(); first.dispose();
  toggle.click(); first.setOpen(true);
  expect([first.isOpen(), menu.hidden]).toEqual([false, true]);
  expect(remove.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
  expect(remove.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(1);
  const second = wireAnchoredMenu(mount, toggle, menu);
  toggle.click(); expect(second.isOpen()).toBe(true);
  mount.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(second.isOpen()).toBe(false);
  second.dispose();
});
