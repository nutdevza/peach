import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { JavSelectionProvider, useJavSelection, useVisibleJavWorks } from '../../src/react/jav/jav-selection';
import { JAV_SELECTION_EVENT } from '../../src/jav-controls';
import { addWant } from '../../src/react/wants/wants';
import type { Discovery } from '../../src/react/jav/jav';
import { buttonNamed, click, mountRoot, settle } from './render';

vi.mock('../../src/react/wants/wants', () => ({ addWant: vi.fn(), invalidateWants: vi.fn() }));
vi.mock('../../src/react/jav/jav-batch-resources', () => ({
  JavBatchResources: ({ items }: { items: Discovery[] | null }) =>
    items ? <section aria-label="Resource candidates">{items.map(item => item.code).join(',')}</section> : null,
}));
afterEach(() => { vi.mocked(addWant).mockReset(); delete document.body.dataset.density });
const works = [1, 2, 3].map(id => ({ id, code: `ABC-00${id}`, wanted: false, title: `Video ${id}` } as Discovery));
function Choices({ items }: { items: Discovery[] }) {
  useVisibleJavWorks(items);
  const selection = useJavSelection()!;
  return <div>{items.map(item => <button key={item.code} aria-pressed={selection.selected.has(item.code)}
    onClick={event => selection.toggle(item, event.shiftKey)}>{item.code}</button>)}</div>;
}
const view = (items = works, receipt = vi.fn()) =>
  <JavSelectionProvider readOnly={false} receipt={receipt}><Choices items={items} /></JavSelectionProvider>;
const start = async () => { await act(async () => { window.dispatchEvent(new Event(JAV_SELECTION_EVENT)) }) };

it('Selection starts from the page header; Shift adds to the selection, selection survives across pages, and resource search takes only the selected works', async () => {
  const { host, rerender } = await mountRoot(view());
  await start();
  await click(buttonNamed('ABC-001', host));
  await act(async () => buttonNamed('ABC-003', host)!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })));
  expect(host.textContent).toContain('3 selected');
  await rerender(view([{ ...works[0]!, title: 'Refresh titles' }]));
  expect(host.textContent).toContain('3 selected');
  await click(buttonNamed('Find resources'));
  expect(document.querySelector('[aria-label="Resource candidates"]')?.textContent).toBe('ABC-001,ABC-002,ABC-003');
  await start();
  expect(buttonNamed('ABC-001', host)?.getAttribute('aria-pressed')).toBe('false');
});

it('Select-all affects only the current page; failed adds keep the unfinished entries; retry does not repeat finished ones', async () => {
  const receipt = vi.fn();
  vi.mocked(addWant).mockResolvedValueOnce({} as never).mockRejectedValueOnce(Error('Service unavailable'));
  const { host } = await mountRoot(view(works, receipt));
  await start(); await click(buttonNamed('Select this page'));
  await click(buttonNamed('Add to Wanted')); await settle();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('The operation did not finish; please retry. If it keeps failing, check the tray log.');
  expect(host.textContent).toContain('2 selected');
  vi.mocked(addWant).mockResolvedValue({} as never);
  await click(buttonNamed('Add to Wanted')); await settle();
  expect(vi.mocked(addWant).mock.calls.map(([target]) => target)).toEqual([
    { code: 'ABC-001' }, { code: 'ABC-002' }, { code: 'ABC-002' }, { code: 'ABC-003' },
  ]);
  expect(receipt).toHaveBeenCalledWith('Added 2 to Wanted');
});

it('Exiting selection aborts waiting and later submissions; old requests returning do not pollute the new selection round', async () => {
  let finish!: (value: never) => void;
  vi.mocked(addWant).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }));
  const receipt = vi.fn();
  const { host } = await mountRoot(view(works, receipt));
  await start(); await click(buttonNamed('Select this page')); await click(buttonNamed('Add to Wanted'));
  const signal = vi.mocked(addWant).mock.calls[0]![1]!;
  await click(buttonNamed('Clear selection'));
  expect(signal.aborted).toBe(true);
  await start(); await click(buttonNamed('ABC-001', host));
  await act(async () => finish({} as never));
  await settle();
  expect(addWant).toHaveBeenCalledTimes(1);
  expect(receipt).not.toHaveBeenCalled();
  expect(host.textContent).toContain('1 selected');
  expect(buttonNamed('ABC-001', host)?.getAttribute('aria-pressed')).toBe('true');
});
