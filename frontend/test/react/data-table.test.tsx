import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataColumn } from '../../src/react/components/data-table';
import { buttonNamed, choose, click, mountRoot } from './render';

type Item = { id: number; name: string };
const columns: DataColumn<Item>[] = [{ id: 'name', label: 'Name', value: (item) => item.name, render: (item) => item.name }];
const items = Array.from({ length: 23 }, (_, index) => ({ id: index + 1, name: `Video ${23 - index}` }));
const checkbox = (host: ParentNode, name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);

function Fixture({ data = items, run, label = 'Test video' }: { data?: Item[]; run(ids: number[]): void; label?: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <DataTable label={label} items={data} columns={columns} rowId={(item) => String(item.id)}
    rowLabel={(item) => item.name} selected={selected} onSelected={setSelected}
    actions={(chosen) => <button onClick={() => run(chosen.map((item) => item.id))}>Process selected</button>} />;
}

describe('Shared data table', () => {
  it('Toolbar sort, direction, and page size sync the header and all rows', async () => {
    const { host } = await mountRoot(<Fixture run={vi.fn()} />);
    const rows = () => [...host.querySelectorAll('tbody tr')];
    await choose(host.querySelector('[role="toolbar"] button[aria-haspopup="listbox"]'), 'Name');
    expect(rows()[0]!.textContent).toContain('Video 1');
    expect(host.querySelector('th[data-key="name"]')?.getAttribute('aria-sort')).toBe('ascending');
    await click(host.querySelector('button[aria-label="Sort Test video descending"]'));
    expect(rows()[0]!.textContent).toContain('Video 23');
    expect(host.querySelector('th[data-key="name"]')?.getAttribute('aria-sort')).toBe('descending');
    await choose(host.querySelector('[data-table-pagination] button[aria-haspopup="listbox"]'), '50 items per page');
    expect(rows()).toHaveLength(23);
    expect(host.textContent).toContain('1–23 / 23 records');
  });

  it('Sorting applies to the whole set, selection survives paging, and bulk scope excludes vanished rows', async () => {
    const run = vi.fn();
    const { host, rerender } = await mountRoot(<Fixture run={run} />);
    const rows = () => [...host.querySelectorAll('tbody tr')];
    expect(rows()).toHaveLength(20);
    expect(buttonNamed('Process selected', host)).toBeNull();
    await click(checkbox(host, 'Select Video 23'));
    await click(buttonNamed('Next page', host));
    await click(checkbox(host, 'Select Video 3'));
    await click(buttonNamed('Process selected', host));
    expect(run).toHaveBeenLastCalledWith([1, 21]);
    await click(host.querySelector('th[data-key="name"]'));
    expect(rows()[0]!.textContent).toContain('Video 1');
    expect(rows()[19]!.textContent).toContain('Video 20');
    expect(host.textContent).toContain('Selected 2 records');
    await click(buttonNamed('Next page', host));
    await rerender(<Fixture data={[items[0]!, items[1]!]} run={run} />);
    expect(rows()).toHaveLength(2);
    expect(host.textContent).toContain('1–2 / 2 records');
    await click(buttonNamed('Process selected', host));
    expect(run).toHaveBeenLastCalledWith([1]);
    await click(buttonNamed('Clear selection', host));
    expect(host.querySelector('[data-selection-dock]:not([aria-hidden="true"])')).toBeNull();
  });

  it('Select-all covers every page, and selecting all again cancels the whole batch', async () => {
    const run = vi.fn();
    const { host } = await mountRoot(<Fixture run={run} />);
    await click(checkbox(host, 'Select all Test video'));
    await click(buttonNamed('Process selected', host));
    expect(run).toHaveBeenLastCalledWith(items.map((item) => item.id));
    await click(buttonNamed('Next page', host));
    expect(checkbox(host, 'Select Video 3')?.checked).toBe(true);
    await click(checkbox(host, 'Select all Test video'));
    expect(host.querySelector('[data-selection-dock]:not([aria-hidden="true"])')).toBeNull();
  });

  it('When another table on the page starts a selection, only the current table keeps its bulk actions', async () => {
    const { host } = await mountRoot(<><Fixture label="First table" run={vi.fn()} /><Fixture label="Second table" run={vi.fn()} /></>);
    const first = host.querySelector('[aria-label="First table"]')!;
    const second = host.querySelector('[aria-label="Second table"]')!;
    await click(checkbox(first, 'Select Video 23'));
    expect(checkbox(first, 'Select Video 23')?.checked).toBe(true);
    await click(checkbox(second, 'Select Video 23'));
    expect(checkbox(first, 'Select Video 23')?.checked).toBe(false);
    expect(checkbox(second, 'Select Video 23')?.checked).toBe(true);
    expect(host.querySelectorAll('[data-selection-dock]:not([aria-hidden="true"])')).toHaveLength(1);
  });
});
