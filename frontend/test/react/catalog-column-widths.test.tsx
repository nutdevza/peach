import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { defaultColumnVisibility, useCatalogTablePreferences } from '../../src/react/catalog-grid/catalog-column-widths';
import { mountRoot } from './render';

const key = 'peach.catalog-column-widths.v1';
let sizing!: ReturnType<typeof useCatalogTablePreferences>;
let visibility!: ReturnType<typeof useCatalogTablePreferences>;
function Probe() { sizing = useCatalogTablePreferences(); visibility = sizing; return null }
beforeEach(() => localStorage.clear());

it('Corrupt or out-of-range preferences do not break column widths; the selection column stays fixed', async () => {
  for (const [saved, name] of [['broken', '1fr'], ['null', '1fr'], ['[]', '1fr'],
    ['{"name":99999,"select":200,"dur":-10,"size":"wide"}', 2000]] as const) {
    localStorage.setItem(key, saved);
    const root = await mountRoot(<Probe />);
    expect(sizing.widths.name).toBe(name);
    expect(sizing.widths.select).toBe(48);
    expect(sizing.widths.dur).toBeGreaterThanOrEqual(80);
    expect(sizing.widths.size).toBe(96);
    await root.unmount();
  }
});

it('Column visibility preferences only hide data columns, and hidden columns keep their custom widths', async () => {
  localStorage.setItem('peach.catalog-column-visibility.v1', '{"name":false,"select":false,"rating":false,"unknown":false}');
  await mountRoot(<Probe />);
  expect(visibility.visibility).toEqual({ ...defaultColumnVisibility, rating: false });
  await act(() => sizing.save(new Map([['code', 260]])));
  await act(() => sizing.save(new Map([['name', 480]])));
  expect(sizing.widths.code).toBe(260);
  await act(() => visibility.change(current => ({ ...current, played: false })));
  expect(JSON.parse(localStorage.getItem('peach.catalog-column-visibility.v1')!)).toEqual({ ...defaultColumnVisibility, rating: false, played: false });
  await act(() => visibility.change({ code: true }));
  expect(visibility.visibility.code).toBe(true);
  await act(() => visibility.change({}));
  expect(visibility.visibility).toEqual(defaultColumnVisibility);
});

it('Column widths save when resizing ends, reset clears the preference, and resizing still works when storage is disabled', async () => {
  const root = await mountRoot(<Probe />);
  await act(() => sizing.save(new Map([['name', 512], ['select', 100]])));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ name: 512, select: 48 });
  await root.unmount();
  await mountRoot(<Probe />);
  expect(sizing.widths.name).toBe(512);
  await act(() => sizing.reset());
  expect(sizing.widths.name).toBe('1fr');
  expect(localStorage.getItem(key)).toBeNull();
  const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage not permitted') });
  try {
    await act(() => sizing.save(new Map([['name', 480]])));
    expect(sizing.widths.name).toBe(480);
  } finally { blocked.mockRestore() }
});
