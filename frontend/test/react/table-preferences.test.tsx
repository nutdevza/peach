import { act } from 'react';
import { beforeEach, expect, it } from 'vitest';
import { useTablePreferences } from '../../src/react/components/table-column-preferences';
import { mountRoot } from './render';

const columns = [{ id: 'name', label: 'Name', width: 280, required: true }, { id: 'extra', label: 'Backfill', width: 160 }];
let first!: ReturnType<typeof useTablePreferences>, second!: ReturnType<typeof useTablePreferences>;
function Probe() { first = useTablePreferences('first', columns); second = useTablePreferences('second', columns); return null }
beforeEach(() => localStorage.clear());

it('Each table saves column visibility and widths independently, hidden columns keep their widths, and the identity column stays visible', async () => {
  const root = await mountRoot(<Probe />);
  await act(() => first.save(new Map([['extra', 360]])));
  await act(() => first.change({ name: false, extra: false }));
  expect(first.visibility).toEqual({ extra: false });
  expect(first.widths.extra).toBe(360);
  expect(second.widths.extra).toBe(160);
  expect(second.visibility).toEqual({});
  await root.unmount();
  await mountRoot(<Probe />);
  expect(first.widths.extra).toBe(360);
  expect(first.visibility.extra).toBe(false);
  await act(() => first.reset());
  expect(first.widths.extra).toBe(160);
  expect(first.visibility.extra).toBe(false);
});

it('Name defaults to the remaining width, manual widths can be restored, and after reset it stays adaptive', async () => {
  let preferences!: ReturnType<typeof useTablePreferences>;
  function Flexible() {
    preferences = useTablePreferences('flexible', [{ ...columns[0]!, flex: true }, columns[1]!]);
    return null;
  }
  localStorage.setItem('peach.table.flexible.widths.v1', JSON.stringify({ name: 280, extra: 160 }));
  const root = await mountRoot(<Flexible />);
  expect(preferences.columnProps('name').width).toBe('1fr');
  expect(preferences.columnProps('name').maxWidth).toBeUndefined();
  expect(preferences.columnProps('name').minWidth).toBe(280);
  expect(preferences.spaceWidth).toBe(0);
  await act(() => preferences.save(new Map([['name', 720], ['extra', 180]])));
  expect(preferences.columnProps('name').width).toBe(720);
  expect(preferences.columnProps('name').minWidth).toBe(96);
  expect(preferences.spaceWidth).toBe('1fr');
  await root.unmount();
  await mountRoot(<Flexible />);
  expect(preferences.columnProps('name').width).toBe(720);
  await act(() => preferences.reset());
  expect(preferences.columnProps('name').width).toBe('1fr');
  await act(() => preferences.save(new Map<string, number | '1fr'>([['name', '1fr'], ['extra', 200]])));
  expect(preferences.columnProps('name').width).toBe('1fr');
  expect(preferences.columnProps('extra').width).toBe(200);
});
