/* Left navigation order: drag to reorder directly, per-row move up/down and hide, then add back from the page list below.
 *
 * Writing shares `sidebar/sidebar-order.ts` with the sidebar column's dragging: first land the local copy (the sidebar reorders on the spot on the store's notice),
 * then write `/api/settings`. */
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { VisuallyHidden } from 'react-aria-components';

import { dismissMenu, presentMenu } from '@peach/legacy/ui';

import { useCommitNavigationOrder } from '../sidebar/sidebar-order';
import { useSidebarReorder } from '../sidebar/use-sidebar-reorder';
import { Icon } from './icon';
import type { SettingsPanelHost } from './settings-panel-api';
import { Button } from '@/components/base/buttons/button';
import { resetSidebarOrder } from '../../sidebar';
import { NavigationDropLine, restoreNavigationOrder } from '../components/navigation-order';

/* The home item's key is an empty string; an empty string written to attributes and dataTransfer is the same as not writing, so it gets a placeholder. */
const HOME = '__home__';
const optionKey = (key: string) => key === '' ? HOME : key;

export function SidebarOrder({ host }: { host: SettingsPanelHost }) {
  const commit = useCommitNavigationOrder(host.store);
  const order = host.store.value.sidebarOrder;
  const byKey = new Map(host.navCatalog.map((item) => [item[0], item]));
  const visible = order.map((key) => byKey.get(key)).filter((item) => item !== undefined);
  const available = host.navCatalog.filter(([key]) => !order.includes(key));
  const defaults = resetSidebarOrder(order);
  const [picked, setPicked] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const reorder = useSidebarReorder(list, order, commit, () => {}, 'y', 'tab');
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);

  const step = (key: string, delta: number) => {
    const from = order.indexOf(key), to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  };

  /* The manifest's currently picked item; once the picked item is added to the sidebar, selection falls back to the manifest's first item. */
  const chosen = available.find(([key]) => optionKey(key) === picked) ?? available[0];
  const closeMenu = () => {
    if (menu.current) dismissMenu(menu.current);
    setMenuOpen(false);
  };
  const toggleMenu = () => {
    const node = menu.current;
    if (!node) return;
    const opening = !menuOpen;
    if (opening) presentMenu(node); else dismissMenu(node);
    setMenuOpen(opening);
    if (opening) node.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  };
  const optionKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); trigger.current?.focus(); return }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const at = all.indexOf(event.currentTarget);
    all[(at + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  };

  return (
    <div data-sidebar-order="" id="sidebarOrderSetting">
      <div ref={list} data-navigation-order="sidebar-settings" data-navigation-axis="y" data-navigation-rows=""
        data-reordering={reorder.picked ? '' : undefined} onClickCapture={reorder.clickCapture}>
      {visible.map(([key, label, glyph], index) => (
        <div key={optionKey(key)} data-sidebar-row={key} data-tab={key} {...reorder.bindings(key)}
          role="group" aria-label={label} tabIndex={0} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          data-dragging={reorder.picked?.key === key ? '' : undefined}
          style={{ '--navigation-picked-left': `${reorder.picked?.bounds.left || 0}px`,
            '--navigation-picked-top': `${reorder.picked?.bounds.top || 0}px`,
            '--navigation-picked-width': `${reorder.picked?.bounds.width || 0}px`,
            '--navigation-picked-offset': `${reorder.picked?.offset || 0}px`,
            '--sidebar-nudge': `${reorder.nudge(key).distance}px`, '--sidebar-delay': `${reorder.nudge(key).delay}ms` } as CSSProperties}>
          <span data-sidebar-label=""><i data-sidebar-grip="" aria-hidden="true"><Icon name="grip-vertical" /></i>
            <Icon name={glyph ?? ''} /><b>{label}</b></span>
          <span data-sidebar-actions="">
            <button type="button" data-sidebar-key={key} data-sidebar-move="-1" aria-label={`Move ${label} up`} title="Move up"
              disabled={index === 0} onClick={() => step(key, -1)}><Icon name="chevron-up" /></button>
            <button type="button" data-sidebar-key={key} data-sidebar-move="1" aria-label={`Move ${label} down`} title="Move down"
              disabled={index === visible.length - 1} onClick={() => step(key, 1)}><Icon name="chevron-down" /></button>
            <button type="button" data-sidebar-key={key} data-sidebar-hide="" aria-label={`Hide ${label}`} title="Hide"
              disabled={visible.length === 1}
              onClick={() => { if (order.length > 1) commit(order.filter((item) => item !== key)) }}><Icon name="eye-off" /></button>
          </span>
        </div>
      ))}
      <NavigationDropLine reorder={reorder} />
      </div>
      <VisuallyHidden role="status" aria-live="polite">{reorder.announcement}</VisuallyHidden>
      <div data-sidebar-add-row="">
        <div data-sidebar-add-picker=""
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu() }}>
          <button type="button" data-sidebar-add-trigger="" aria-haspopup="listbox" aria-expanded={menuOpen}
            disabled={!chosen} ref={trigger} onClick={toggleMenu}>
            {chosen
              ? <><Icon name={chosen[2] ?? ''} /><span data-sidebar-add-label="">{chosen[1]}</span><Icon name="chevron-down" /></>
              : <><Icon name="check" /><span>All pages are shown</span></>}
          </button>
          {available.length
            ? <div className="popmenu" data-sidebar-add-menu="" role="listbox" aria-label="Choose pages to add" hidden ref={menu}>
                {available.map(([key, label, glyph]) => (
                  <button type="button" role="option" key={optionKey(key)} data-sidebar-add-option={optionKey(key)}
                    aria-selected={chosen?.[0] === key} tabIndex={chosen?.[0] === key ? 0 : -1} onKeyDown={optionKeys}
                    onClick={() => { setPicked(optionKey(key)); closeMenu(); trigger.current?.focus() }}>
                    <Icon name={glyph ?? ''} /><span>{label}</span>
                  </button>
                ))}
              </div>
            : null}
        </div>
        <button type="button" className="geist-button primary" data-sidebar-add="" disabled={!chosen}
          onClick={() => { if (chosen && !order.includes(chosen[0])) commit([...order, chosen[0]]) }}>Add</button>
      </div>
      {order.join(',') !== defaults.join(',') ? <div className="peach-react"><Button variant="secondary" size="small"
        onClick={() => restoreNavigationOrder({ label: 'Left navigation', keys: order, defaults, commit })}>Restore the sidebar default order</Button></div> : null}
    </div>
  );
}
