/* The line carrying the local path: which string gets handed over, how to respond when the dialog is not on this machine, and what to say when it cannot open. */
import { expect, it, vi } from 'vitest';

import { PathLine } from '../../src/react/components/path-line';

import { click, fetchMock, mount, sentBody } from './render';

const LOG = 'C:\\peach-data\\state\\library-processing-one.issues.jsonl';

it('Locate requests submit only this path, with one receipt line on success', async () => {
  const fetcher = fetchMock(200, { ok: true, path: LOG });
  vi.stubGlobal('fetch', fetcher);
  const revealed = vi.fn();
  const host = await mount(<PathLine path={LOG} prefix="Full log:" onRevealed={revealed} />);

  expect(host.textContent).toContain(`Full record: ${LOG}`);
  await click(host.querySelector('button[aria-label="Show in Explorer"]'));

  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/reveal');
  expect(sentBody(fetcher)).toEqual({ path: LOG });
  /* The file explorer pops up on the machine running Peach: viewed from another device, nothing happens on screen. */
  expect(revealed).toHaveBeenCalledWith('Revealed in File Explorer');
});

it('When it cannot open, the reason stays next to the path instead of faking a success receipt', async () => {
  vi.stubGlobal('fetch', fetchMock(410, { error: 'file missing', message: 'This position no longer exists' }));
  const revealed = vi.fn();
  const host = await mount(<PathLine path={LOG} onRevealed={revealed} />);

  await click(host.querySelector('button[aria-label="Show in Explorer"]'));

  expect(host.textContent).toContain('This position no longer exists');
  expect(revealed).not.toHaveBeenCalled();
});

/* 403 has a generic "this device has no permission" line in the site-wide error mapping, but an out-of-bounds path is not that;
   the server's own bundled message must be able to override it, otherwise the person will go retry on another computer. */
it('When the server rejects this path it says so plainly instead of hiding behind a generic permissions line', async () => {
  vi.stubGlobal('fetch', fetchMock(403, {
    error: 'path not in the data root', message: 'This location is not managed by Peach and can only be opened manually',
  }));
  const host = await mount(<PathLine path={'C:\\Windows'} />);

  await click(host.querySelector('button[aria-label="Show in Explorer"]'));

  expect(host.textContent).toContain('This location is not managed by Peach and can only be opened manually');
});

it('The path and that key share one midline', async () => {
  // The key is taller than this small text, so when top-aligned it looks like it floats upward.
  const host = await mount(<PathLine path={LOG} prefix="Full log:" />);

  expect(host.querySelector('p')!.parentElement!.className).toContain('items-center');
});
