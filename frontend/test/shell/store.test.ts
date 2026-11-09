/* The shell's in-memory state singleton (`src/shell/`): live bindings, whole-object swap versus in-place field mutation, `barsContext.filters` and
 * `state` aliases, two resident selection sets, and subscriptions with version numbers. Each test loads a fresh module copy so initial values do not interfere. */
import { beforeEach, expect, it, vi } from 'vitest';

type Shell = typeof import('../../src/shell');
let shell: Shell;
beforeEach(async () => {
  vi.resetModules();
  shell = await import('../../src/shell');
});

const home = (filters: Record<string, string>) => ({ type: 'home' as const, filters });

it('Initial values match pre-shell-startup: the convention is not written yet, and origins point at home and follows', () => {
  expect(shell.state).toBeUndefined();
  expect(shell.barsContext).toBeUndefined();
  expect(shell.detailReturnBarsContext).toBeNull();
  expect([shell.selectMode, shell.lastSelectedId, shell.followLastSelectedId, shell.selectSurface]).toEqual([false, null, null, '']);
  expect([shell.detailReturnPath, shell.followDetailReturnPath]).toEqual(['/', '/follow']);
  expect([shell.detailOriginAnchor, shell.detailOriginAbove, shell.detailReturnNeedsRestore]).toEqual([null, false, false]);
  expect([shell.activeQueue, shell.pendingQueueRoute, shell.presentedItem]).toEqual([null, null, null]);
  expect([shell.configurationRequestedSection, shell.runtimeConfigurable, shell.cameFromSetup]).toEqual(['', null, false]);
  expect(shell.selected.size + shell.followSelected.size).toBe(0);
  expect(shell.shellVersion()).toBe(0);
});

it('writeShell replaces only the keys present in the patch, writes even when the value is undefined, and notifies once per call', () => {
  const heard: number[] = [];
  shell.subscribeShell(() => heard.push(shell.shellVersion()));
  shell.writeShell({ detailReturnPath: '/stats', selectMode: true, selectSurface: 'catalog' });
  expect([shell.detailReturnPath, shell.selectMode, shell.selectSurface]).toEqual(['/stats', true, 'catalog']);
  expect(shell.followDetailReturnPath).toBe('/follow');
  shell.writeShell({ state: { loc: 'local' } });
  shell.writeShell({ state: undefined });
  expect(shell.state).toBeUndefined();
  expect(heard).toEqual([1, 2, 3]);
});

it('Rebuilding state wholesale does not touch barsContext: the context still points at the old object until a write site points it back at the new one', () => {
  const first = { loc: 'local', tag: '' };
  shell.writeShell({ state: first });
  shell.writeShell({ barsContext: home(shell.state!) });
  expect(shell.barsContext!.filters).toBe(shell.state);

  shell.writeShell({ state: { ...shell.state!, tag: 'Drama' } });
  expect(shell.state).not.toBe(first);
  expect(shell.barsContext!.filters).toBe(first);
  expect(first.tag).toBe('');

  shell.writeShell({ barsContext: home(shell.state!) });
  expect(shell.barsContext!.filters).toBe(shell.state);
});

it('When fields are mutated in place, the context and state are the same object visible to both sides at once; notifyShell bumps the version by one', () => {
  shell.writeShell({ state: { loc: 'local', sort: 'seed' } });
  shell.writeShell({ barsContext: home(shell.state!) });
  const before = shell.shellVersion();
  shell.state!.sort = 'new';
  shell.notifyShell();
  expect(shell.barsContext!.filters.sort).toBe('new');
  expect(shell.shellVersion()).toBe(before + 1);
});

it('The home context recorded when details opened is restored as-is on close, and filters are still that same state', () => {
  shell.writeShell({ state: { loc: 'local' } });
  shell.writeShell({ barsContext: home(shell.state!) });
  const opened = shell.barsContext!;
  shell.writeShell({ detailReturnBarsContext: opened });
  shell.writeShell({ barsContext: { type: 'item', id: 7, filters: { tag: '' } } });
  expect(shell.barsContext!.filters).not.toBe(shell.state);

  shell.writeShell({ barsContext: shell.detailReturnBarsContext ?? home(shell.state!) });
  shell.writeShell({ detailReturnBarsContext: null });
  expect(shell.barsContext).toBe(opened);
  expect(shell.barsContext!.filters).toBe(shell.state);
});

it('The two selection sets are resident instances: adds, removals, and clears all hit the same Set', () => {
  const { selected, followSelected } = shell;
  selected.add(1);
  selected.add(2);
  followSelected.add(9);
  shell.writeShell({ lastSelectedId: 2 });
  selected.clear();
  followSelected.clear();
  shell.writeShell({ lastSelectedId: null, followLastSelectedId: null });
  expect(shell.selected).toBe(selected);
  expect(shell.followSelected).toBe(followSelected);
  expect(selected.size + followSelected.size).toBe(0);
  expect(shell.lastSelectedId).toBeNull();
});

it('Unsubscribing stops notifications; version numbers increase monotonically', () => {
  const listener = vi.fn();
  const stop = shell.subscribeShell(listener);
  shell.notifyShell();
  stop();
  shell.writeShell({ configurationRequestedSection: 'media' });
  shell.notifyShell();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(shell.shellVersion()).toBe(3);
});

it('The shared shell entry hands over the same live binding: writing from the entry, the state module reads it on the spot', async () => {
  const sharedShell = await import('@peach/shell');
  sharedShell.writeShell({ configurationRequestedSection: 'Network & access' });
  expect(shell.configurationRequestedSection).toBe('Network & access');
  expect(sharedShell.selected).toBe(shell.selected);
  expect(sharedShell.configurationRequestedSection).toBe('Network & access');
});
