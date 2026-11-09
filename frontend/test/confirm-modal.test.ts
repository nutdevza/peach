import { afterEach, expect, it, vi } from 'vitest';
import { confirmModal } from '../src/ui-kit';

afterEach(() => document.body.replaceChildren());
it('The confirmation list renders file names one by one as plain text', async () => {
  const names = ['Video One.mp4', '<img src=x onerror=alert(1)>.mp4'];
  const pending = confirmModal({title:'Cleaned records',body:'Clean 2 items',items:names,confirmLabel:'Cleaned records'});
  const list = document.querySelector('dialog ul')!;
  expect([...list.children].map(item => item.textContent)).toEqual(names);
  expect(list.querySelector('img')).toBeNull();
  expect(list.getAttribute('tabindex')).toBe('0');
  document.querySelector<HTMLButtonElement>('[data-modal-cancel]')!.click();
  expect((await pending).confirmed).toBe(false);
});
it('Dangerous actions focus Cancel; cancel writes nothing, and closing returns focus', async () => {
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  const write = vi.fn();
  const pending = confirmModal({title:'Cleaned records',body:'Clean 2 items',confirmLabel:'Cleaned records',danger:true,onConfirm:write});
  const cancel = document.querySelector<HTMLButtonElement>('[data-modal-cancel]')!;
  expect(document.activeElement).toBe(cancel);
  const dialog = document.querySelector('dialog')!;
  expect(dialog.getAttribute('role')).toBe('alertdialog');
  expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('Clean 2 items');
  cancel.click();
  expect((await pending).confirmed).toBe(false);
  expect(write).not.toHaveBeenCalled(); expect(document.activeElement).toBe(trigger);
});
it('While a write waits, repeat submits and closing are blocked; failure keeps the popover for retry', async () => {
  let reject!: (error: Error) => void;
  const write = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValueOnce('done');
  const pending = confirmModal({title:'Cleaned records',body:'Clean 2 items',confirmLabel:'Cleaned records',onConfirm:write});
  const dialog = document.querySelector('dialog')!;
  const accept = dialog.querySelector<HTMLButtonElement>('[data-modal-confirm]')!;
  accept.click(); accept.click();
  dialog.querySelector<HTMLButtonElement>('[data-modal-cancel]')!.click();
  const escape = new Event('cancel', {cancelable: true}); dialog.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true); expect(dialog.open).toBe(true); expect(write).toHaveBeenCalledTimes(1);
  reject(new Error('The disk is offline')); await new Promise(resolve => setTimeout(resolve, 0));
  expect(dialog.textContent).toContain('The disk is offline'); expect(dialog.open).toBe(true);
  accept.click(); expect((await pending).result).toBe('done'); expect(write).toHaveBeenCalledTimes(2);
});
