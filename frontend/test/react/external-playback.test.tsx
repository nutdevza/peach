import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExternalPlayback } from '../../src/react/item-detail/external-playback';
import { choose, click, mount, settle } from './render';

beforeEach(() => {
  for (const key of ['peach.local-player.v1', 'peach.playback-target.v1']) localStorage.removeItem(key);
  const proto = HTMLElement.prototype;
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
    return selector === ':popover-open' ? this.hasAttribute('data-test-popover-open') : matches.call(this, selector);
  });
  proto.showPopover = function () { this.setAttribute('data-test-popover-open', '') };
  proto.hidePopover = function () { this.removeAttribute('data-test-popover-open') };
});

afterEach(() => {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  delete proto.showPopover;
  delete proto.hidePopover;
});

it('The external player issues a link only on request, and keeps the network address for VR players', async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url === '/api/local-players' ? { players: [] } : ({
    url: '/external-stream/1?ticket=short', playlist: '/external-playlist/1.m3u?ticket=short',
  }) }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<ExternalPlayback id={1} />);
  await settle();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/local-players']);
  await choose(host.querySelector('[aria-label="External player"]'), 'Network play address / VR');
  await click(host.querySelector('[aria-label="Open with external player"]'));
  await settle();
  expect(fetcher.mock.calls).toHaveLength(2);
  expect(host.querySelectorAll('[data-local-playback-row]')).toHaveLength(1);
  expect(host.querySelector('details')).toBeNull();
  expect(host.querySelector('input')?.value).toContain('/external-stream/1?ticket=short');
});

it('The player menu lists only detected programs and the generic network play option', async () => {
  localStorage.setItem('peach.playback-target.v1', 'iina');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ players: [
    { id: 'default', label: 'The system default player' }, { id: 'potplayer', label: 'PotPlayer' },
  ] }))));
  const host = await mount(<ExternalPlayback id={3} />);
  await settle();
  expect(host.querySelector('[data-select-trigger]')?.textContent?.trim()).toBe('The system default player');
  await click(host.querySelector('[aria-label="External player"]'));
  expect([...document.querySelectorAll('[role="option"]')].map(node => node.textContent?.trim())).toEqual([
    'The system default player', 'PotPlayer', 'M3U playlist', 'Network play address / VR',
  ]);
});

it('This machine can pick installed players, receipts on successful open, and failures keep their reason', async () => {
  const opened = vi.fn();
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/local-players'
    ? { players: [{ id: 'default', label: 'The system default player' }, { id: 'vlc', label: 'VLC' }] } : { opened: true })));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<ExternalPlayback id={7} onOpened={opened} />);
  await settle();
  expect(host.textContent).toContain('The system default player');
  await click(host.querySelector('[aria-label="Open with external player"]'));
  expect(fetcher).toHaveBeenLastCalledWith('/api/local-playback?id=7&player=default', expect.objectContaining({ method: 'POST' }));
  expect(opened).toHaveBeenCalledOnce();
  fetcher.mockImplementation(async () => new Response(JSON.stringify({ detail: 'The player could not open' }), { status: 503 }));
  await click(host.querySelector('[aria-label="Open with external player"]'));
  expect(host.textContent).toContain('The player could not open');
  expect(opened).toHaveBeenCalledOnce();
});

it('M3U and the local player share the open entry; switching methods clears the network address', async () => {
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/local-players'
    ? { players: [{ id: 'default', label: 'The system default player' }] }
    : { url: '/external-stream/9?ticket=short', playlist: '/external-playlist/9.m3u?ticket=short' })));
  vi.stubGlobal('fetch', fetcher);
  let downloadUrl = '';
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadUrl = this.href;
  });
  const host = await mount(<ExternalPlayback id={9} />);
  await settle();
  await choose(host.querySelector('[aria-label="External player"]'), 'M3U playlist');
  expect(localStorage.getItem('peach.playback-target.v1')).toBe('m3u');
  await click(host.querySelector('[aria-label="Open with external player"]'));
  expect(fetcher).toHaveBeenLastCalledWith('/api/external-playback?id=9', expect.objectContaining({ method: 'POST' }));
  expect(download).toHaveBeenCalledOnce();
  expect(downloadUrl).toContain('/external-playlist/9.m3u?ticket=short');
  expect(host.querySelector('input')?.value).toContain('/external-stream/9?ticket=short');
  await choose(host.querySelector('[aria-label="External player"]'), 'The system default player');
  expect(host.querySelector('input')).toBeNull();
});

it('A failed local detection keeps the network method; after re-detecting, the local player becomes selectable', async () => {
  let attempts = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    attempts++;
    return attempts === 1
      ? new Response(JSON.stringify({ detail: 'Detection is temporarily unavailable' }), { status: 503 })
      : new Response(JSON.stringify({ players: [{ id: 'potplayer', label: 'PotPlayer' }] }));
  }));
  const host = await mount(<ExternalPlayback id={5} />);
  await settle();
  expect(host.querySelector('[aria-label="Open with external player"]')?.hasAttribute('disabled')).toBe(false);
  expect(host.textContent).toContain('Detection is temporarily unavailable');
  await click([...host.querySelectorAll('button')].find(node => node.textContent === 'Re-detect player'));
  await settle();
  await choose(host.querySelector('[aria-label="External player"]'), 'PotPlayer');
  expect(localStorage.getItem('peach.playback-target.v1')).toBe('local:potplayer');
  expect(host.textContent).not.toContain('Detection is temporarily unavailable');
});
