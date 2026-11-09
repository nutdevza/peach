/* The manage header's view model and startup skeleton (`src/manage-header.ts`): which name the title takes, which pages paint breadcrumbs,
 * the narrow-screen title collapse criterion, the trash explainer row's three states, and skeleton escaping. How the island takes over is tested by `react/manage-header.test.tsx`. */
import { describe, expect, it } from 'vitest';

import { manageHeaderSkeletonHtml, manageHeaderView, type ManageEntry, type ManageHeaderProps } from '../src/manage-header';

const SECTIONS: ManageEntry[] = [
  ['stats', 'Stats', 'chart'], ['cleanup', 'Data management', 'database'], ['trash', 'Trash', 'trash'],
  ['configuration', 'Peach configuration', 'settings'],
];
const MENU = SECTIONS.filter(([key]) => key !== 'trash');

const props = (section: string, path: string, patch: Partial<ManageHeaderProps> = {}): ManageHeaderProps =>
  ({ section, path, sections: SECTIONS, menu: MENU, trash: null, ...patch });

describe('Header rules', () => {
  it('Diagnostics sections share the configuration page title', () => {
    expect(manageHeaderView(props('configuration', '/settings/diagnostics'))).toMatchObject({ title: 'Peach configuration', compact: true });
  });
  it('Outside manage areas the whole block never paints', () => {
    expect(manageHeaderView(props('', '/'))).toBeNull();
    expect(manageHeaderSkeletonHtml(props('', '/'))).toBe('');
  });

  it('Subpages under data management draw breadcrumbs titled with the subpage name; the hub itself and other admin areas draw none', () => {
    expect(manageHeaderView(props('cleanup', '/junk-files'))).toMatchObject({ title: 'Junk files', crumb: 'Junk files' });
    expect(manageHeaderView(props('cleanup', '/sources'))).toMatchObject({ title: 'Sources and credentials', crumb: 'Sources and credentials' });
    expect(manageHeaderView(props('cleanup', '/data-cleanup'))).toMatchObject({ title: 'Data management', crumb: '' });
    expect(manageHeaderView(props('stats', '/stats'))).toMatchObject({ title: 'Stats', crumb: '' });
    expect(manageHeaderView(props('trash', '/trash'))).toMatchObject({ title: 'Trash', crumb: 'Trash' });
  });

  it('Repairs and migrations hang under Apps and maintenance: the title takes the subpage name, the breadcrumb returns to Apps and maintenance, and the manage bar opens configuration', () => {
    const view = manageHeaderView(props('configuration', '/settings/maintenance/repairs'))!;
    expect(view).toMatchObject({ title: 'Repairs and migrations', crumb: 'Repairs and migrations', pressed: 'configuration',
      parent: { label: 'App and maintenance', href: '/settings/maintenance' } });
    const node = document.createElement('div');
    node.innerHTML = manageHeaderSkeletonHtml(props('configuration', '/settings/maintenance/repairs'));
    expect(node.querySelector('[data-manage-crumb] a')!.getAttribute('href')).toBe('/settings/maintenance');
  });

  it('Only the data management hub, sources, credentials, and configuration titles step down one size on narrow screens', () => {
    const compact = (section: string, path: string) => manageHeaderView(props(section, path))!.compact;
    expect([compact('cleanup', '/data-cleanup'), compact('cleanup', '/sources'), compact('configuration', '/settings/library')])
      .toEqual([true, true, true]);
    expect([compact('cleanup', '/junk-files'), compact('cleanup', '/duplicates'), compact('stats', '/stats')])
      .toEqual([false, false, false]);
  });

  it('The caption row exists only in trash: a placeholder until the count arrives, then the count; no empty trash button while trash is empty', () => {
    expect(manageHeaderView(props('stats', '/stats'))!.lede).toEqual({ kind: 'none' });
    expect(manageHeaderView(props('trash', '/trash'))!.lede).toEqual({ kind: 'skeleton' });
    expect(manageHeaderView(props('trash', '/trash', { trash: { total: 1234, shown: 8 } }))!.lede)
      .toEqual({ kind: 'count', text: '1,234 matches · showing 8', total: 1234 });
    const empty = document.createElement('div');
    empty.innerHTML = manageHeaderSkeletonHtml(props('trash', '/trash', { trash: { total: 0, shown: 0 } }));
    expect(empty.querySelector('[data-lede-text]')!.textContent).toBe('0 matches · showing 0');
    expect(empty.querySelector('[data-empty-trash]')).toBeNull();
  });
});

describe('Startup skeleton', () => {
  it('Manage nav, breadcrumbs, and page titles stack by hierarchy', () => {
    const node = document.createElement('div');
    node.innerHTML = manageHeaderSkeletonHtml(props('cleanup', '/review'));
    expect([...node.children].map(child => child.tagName)).toEqual(['NAV', 'NAV', 'H2']);
    expect(node.firstElementChild?.hasAttribute('data-manage-bar')).toBe(true);
    expect(node.children[1]?.hasAttribute('data-manage-crumb')).toBe(true);
  });
  it('The manage bar highlights the current item; two placeholder cells are laid out until the trash count arrives', () => {
    const node = document.createElement('div');
    node.innerHTML = manageHeaderSkeletonHtml(props('trash', '/trash'));
    expect([...node.querySelectorAll<HTMLElement>('[data-manage]')].map((button) => button.dataset.manage))
      .toEqual(['stats', 'cleanup', 'configuration']);
    expect([...node.querySelectorAll<HTMLElement>('[aria-pressed="true"]')].map((button) => button.dataset.manage))
      .toEqual(['cleanup']);
    expect([...node.querySelectorAll<HTMLElement>('[data-trash-lede-skeleton]')].map((cell) => cell.dataset.trashLedeSkeleton))
      .toEqual(['text', 'action']);
    expect(node.querySelector('[data-manage-crumb] a')!.getAttribute('href')).toBe('/data-cleanup');
    node.innerHTML = manageHeaderSkeletonHtml(props('stats', '/stats'));
    const pressed = node.querySelector('[data-manage="stats"]')!;
    expect([pressed.getAttribute('aria-pressed'), pressed.getAttribute('aria-current')]).toEqual(['true', 'page']);
    expect(node.querySelector('[data-manage-lede]')).toBeNull();
  });

  it('Names write in literally', () => {
    const node = document.createElement('div');
    node.innerHTML = manageHeaderSkeletonHtml({ ...props('x', '/x'), sections: [['x', '<img src=x>', 'a"b']], menu: [['x', '<img src=x>', 'a"b']] });
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('[data-manage-title]')!.textContent).toBe('<img src=x>');
  });
});
