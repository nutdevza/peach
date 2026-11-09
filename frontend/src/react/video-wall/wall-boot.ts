import { visibleWallTiles } from './wall-layout';

/** On a cold start landing directly on `/wall`, the React wall waits for the directory element and first-screen data before mounting, leaving a few seconds of blank. The shell first lays down the same skeleton with the geometry the wall itself is
 * reading (camera origin, 0.68× on narrow screens), and removes it when the wall mounts, so tiles do not jump at the handoff. */
export function paintWallBootSkeleton(): void {
  if (document.querySelector('[data-wall-boot]')) return;
  const scale = innerWidth < 640 ? .68 : 1;
  const host = document.createElement('div');
  host.className = 'peach-react'; host.dataset.wallBoot = '';
  host.innerHTML = '<div data-video-wall="" data-fullscreen=""><div data-wall-viewport="" data-skeleton="wall" role="status" aria-busy="true" aria-label="Loading the playback wall">'
    + `<div data-wall-world="" style="transform:translate3d(0px, 0px, 0) scale(${scale})"></div></div></div>`;
  document.body.append(host);
  const viewport = host.querySelector<HTMLElement>('[data-wall-viewport]')!.getBoundingClientRect();
  host.querySelector('[data-wall-world]')!.innerHTML = visibleWallTiles(12, false, { x: 0, y: 0, scale }, viewport)
    .map(tile => `<span data-wall-skeleton="" aria-hidden="true" style="--wall-left:${tile.x}px;--wall-top:${tile.y}px;--wall-width:${tile.width}px;--wall-height:${tile.height}px"></span>`)
    .join('');
}

export function removeWallBootSkeleton(): void {
  document.querySelectorAll('[data-wall-boot]').forEach(node => node.remove());
}
