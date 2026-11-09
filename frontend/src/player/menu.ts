/* Player context menu.
 *
 * Items follow YouTube player f572e43c's .ytp-contextmenu: loop, miniplayer (expanded in the mini window),
 * picture-in-picture, copy video URL, copy video URL at current time, stats for nerds; embed code, debug info, and troubleshoot playback have
 * no Peach equivalent and are not listed. */
import { esc, icon } from '@peach/legacy/core';
import { dismissMenu, presentMenu, scrollMovesAnchor } from '@peach/legacy/ui';

import { playerHost } from './host';
import type { VjsPlayer } from './types';

/** The two menu items related to the mini player ask the mini player's owner. */
export interface PlayerMenuHooks {
  /** Whether this player is currently in the mini player. */
  inMiniplayer(player: VjsPlayer): boolean;
  /** Whether this player plays a video or a follows entry: the copied address follows it. */
  kind(player: VjsPlayer): 'item' | 'follow';
  /** The "Expand" action in the mini player. */
  expand(): void;
  /** The 'mini player' action in the details: bypasses the playing-state check and sends the currently playing video into the mini player. */
  toMiniplayer(): void;
}

let hooks: PlayerMenuHooks | null = null;
export function configurePlayerMenu(next: PlayerMenuHooks): void { hooks = next }

/* The menu node belongs to this module: created on body on first use, temporarily moved into the stage while it is open, moved back on close.
   It never enters a React tree; React would fail to find a reparented node's parent on unmount. */
function menuElement(): HTMLElement {
  let menu = document.getElementById('playerMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'popmenu';
    menu.setAttribute('data-player-context-menu', '');
    menu.id = 'playerMenu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Player menu');
    menu.hidden = true;
    document.body.append(menu);
  }
  return menu;
}

let cleanup: (() => void) | null = null;

/** Attach an empty data attribute to the icon's `<svg>`: the filled icon and the check mark each have a style rule. */
const mark = (svg: string, attribute: string) => attribute ? svg.replace('<svg', `<svg ${attribute}=""`) : svg;

export function closePlayerMenu(): void {
  const menu = document.getElementById('playerMenu');
  if (menu?.matches(':popover-open')) menu.hidePopover();
  if (menu && menu.parentElement !== document.body) document.body.append(menu);
  if (menu) dismissMenu(menu, () => { menu.innerHTML = '' });
  if (cleanup) { cleanup(); cleanup = null }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.append(area); area.select();
    let ok = false; try { ok = document.execCommand('copy') } catch { /* The browser does not provide it */ }
    area.remove(); return ok;
  }
}

interface MenuItem { icon: string; label: string; fill?: boolean; checked?: boolean; run(): void }

function playerMenuItems(player: VjsPlayer): MenuItem[] {
  const mini = !!hooks?.inMiniplayer(player);
  const item = player.peachItem;
  const kind = hooks?.kind(player) ?? 'item';
  const url = (withTime: boolean) => {
    const link = new URL(kind === 'follow' ? `/posts/${item?.id}` : `/assets/${item?.id}`, location.origin);
    if (kind !== 'follow' && location.pathname === link.pathname) {
      const context = new URLSearchParams(location.search);
      for (const key of ['mix', 'parts', 'editions', 'playlist']) {
        const value = context.get(key);
        if (value && /^[1-9]\d*$/.test(value)) link.searchParams.set(key, value);
      }
    }
    if (withTime) link.searchParams.set('t', String(Math.floor(player.currentTime() || 0)));
    return link.href;
  };
  const copy = (withTime: boolean, receipt: string) => {
    void copyTextToClipboard(url(withTime)).then((ok) =>
      playerHost().toast(ok ? receipt : 'Copy failed, copy the address bar manually', { timeout: 4000, warn: !ok }));
  };
  const items: MenuItem[] = [
    { icon: 'repeat', label: 'Loop playback', checked: !!player.loop(), run: () => player.loop(!player.loop()) },
    mini ? { icon: 'maximize-2', label: 'Expand', run: () => hooks?.expand() }
      : { icon: 'picture-in-picture-2', label: 'Mini player', run: () => hooks?.toMiniplayer() },
  ];
  if (document.pictureInPictureEnabled) {
    items.push({ icon: 'player-pip', fill: true, label: 'Picture in picture',
      run: () => player.el().querySelector<HTMLElement>('.vjs-picture-in-picture-control')?.click() });
  }
  items.push({ icon: 'link', label: 'Copy video URL', run: () => copy(false, 'Video URL copied') });
  items.push({ icon: 'link', label: 'Copy the video URL at the current time', run: () => copy(true, 'Copied the video URL at the current time') });
  const stats = document.getElementById('playerStatsBtn');
  if (!mini && stats && !stats.hidden) items.push({ icon: 'chart', label: 'Play stats', run: () => stats.click() });
  return items;
}

export function openPlayerMenu(player: VjsPlayer, x: number, y: number): void {
  const menu = menuElement();
  closePlayerMenu();
  /* The stage is a modal dialog at the top layer: menus must mount inside it to stack above, otherwise they land beneath the backdrop. */
  const stage = playerHost().stage();
  if (stage instanceof HTMLDialogElement && stage.open) stage.append(menu);
  menu.setAttribute('popover', 'manual');
  const items = playerMenuItems(player);
  menu.innerHTML = items.map((item, index) => {
    const checkable = item.checked !== undefined;
    return `<button type="button" role="${checkable ? 'menuitemcheckbox' : 'menuitem'}"${checkable ? ` aria-checked="${item.checked}"` : ''} data-player-menu="${index}">${
      mark(icon(item.icon), item.fill ? 'data-player-menu-fill' : '')}<span>${esc(item.label)}</span>${checkable ? mark(icon('check'), 'data-player-menu-check') : ''}</button>`;
  }).join('');
  presentMenu(menu); menu.showPopover();
  // Measure offsetWidth/offsetHeight: the enter animation starts at scale(.95), so getBoundingClientRect measures the scaled box.
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  const buttons = [...menu.querySelectorAll<HTMLElement>('[data-player-menu]')];
  buttons.forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation(); const item = items[Number(button.dataset.playerMenu)]; closePlayerMenu(); item?.run();
    };
  });
  const onDown = (event: Event) => { if (!menu.contains(event.target as Node)) closePlayerMenu() };
  const onKey = (event: KeyboardEvent) => {
    /* This Escape closes only the menu: `preventDefault` also blocks the stage dialog's `cancel`, keeping the stage up. */
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePlayerMenu(); return }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLElement);
    buttons[(current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };
  const onScroll = (event: Event) => { if (scrollMovesAnchor(event, player.el())) closePlayerMenu() };
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  }, 0);
  cleanup = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, true);
  };
  buttons[0]?.focus();
}

export function wirePlayerContextMenu(player: VjsPlayer): void {
  player.el().addEventListener('contextmenu', (event) => {
    if ((event.target as Element).closest('.vjs-peach-settings-menu')) return;
    event.preventDefault(); openPlayerMenu(player, event.clientX, event.clientY);
  });
  player.on('dispose', closePlayerMenu);
}
