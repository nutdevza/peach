/* Change avatar: candidates are not fetched before opening; after opening, what each of the three paths provides and what is said when the swap fails.
 *
 * The popover is rendered by React Aria outside the mount container, so queries here search from the whole page.
 * Appearance (scrim, grid columns) is asserted by `frontend/e2e/design-*.test.ts` reading `getComputedStyle`. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import type { AvatarChoice } from '../../src/react/avatar-picker/avatar-picker';
import { AvatarPicker } from '../../src/react/avatar-picker/avatar-picker-page';
import { queryClient } from '../../src/react/query';

import { buttonNamed, click, mount, settle, type } from './render';

afterEach(() => { queryClient.clear() });

/* Query dispatches updates with the real `setTimeout(0)` it captured for itself; the waits in the test case cannot push it along. */
notifyManager.setScheduler((notify) => notify());

const choice = (over: Partial<AvatarChoice> = {}): AvatarChoice => ({
  ref: 'gfriends:7-S1/葵つかさ.jpg',
  source: 'gfriends',
  label: '7-S1',
  width: 0,
  height: 0,
  detail: '葵つかさ.jpg',
  found_by: '',
  current: false,
  crop: false,
  bases: [],
  focus: null,
  cast: 0,
  version: '',
  ...over,
});

const listing = (choices: AvatarChoice[], extra: Record<string, unknown> = {}) => ({
  kind: 'performer', entity_id: 7792, names: ['Tsukasa Aoi', '葵つかさ'],
  matched_names: ['葵つかさ'], choices, index_age_hours: 2, index_stale: false, ...extra,
});

type Call = [string, RequestInit];

/** The cell measured by the server: a 300x400 portrait image with the face in the upper block. */
const FRAMED = { width: 300, height: 400, focus: { x0: 90, y0: 20, x1: 210, y1: 140 } };

/** First fetch returns candidates, framing answers per `framed`, and every later submission succeeds. */
function server(body: unknown, framed: Partial<AvatarChoice> = {}) {
  const calls: Call[] = [];
  const fetched = vi.fn(async (input: string, init?: RequestInit) => {
    calls.push([input, init || {}]);
    const answer = input.startsWith('/api/avatar-frame') ? choice({ ...FRAMED, ...framed })
      : init?.method === 'POST' ? { ok: true } : body;
    return { ok: true, status: 200, json: async () => answer };
  });
  vi.stubGlobal('fetch', fetched);
  return calls;
}

const sent = (calls: Call[], n: number): Call => calls[n] as Call;
const body = (calls: Call[], n: number) => JSON.parse(String(sent(calls, n)[1].body));

const cells = () => [...document.querySelectorAll<HTMLElement>('[data-avatar-choice]')];
const dialog = () => document.querySelector('[role="dialog"]');

/** Mount the profile page plus button and open its popover. */
async function openPicker(props: Record<string, unknown> = {}) {
  const picked = vi.fn();
  const host = await mount(
    <QueryClientProvider client={queryClient}>
      <AvatarPicker kind="performer" entityId={7792} name="Tsukasa Aoi" onPicked={picked} {...props} />
    </QueryClientProvider>,
  );
  await click(host.querySelector('button'));
  await settle();
  return { host, picked };
}

it('Candidates fetch only on open, and images carry only refs the server listed', async () => {
  const calls = server(listing([
    choice(), choice({ ref: 'sha256:abc', source: 'history', label: 'twitter', current: true }),
  ]));
  const picked = vi.fn();
  const host = await mount(
    <QueryClientProvider client={queryClient}>
      <AvatarPicker kind="performer" entityId={7792} name="Tsukasa Aoi" onPicked={picked} />
    </QueryClientProvider>,
  );
  // If the profile page prefetched on every visit, most of the time nobody would open this screen.
  expect(calls).toHaveLength(0);
  expect(dialog()).toBeNull();

  await click(host.querySelector('button'));
  await settle();
  expect(sent(calls, 0)[0]).toBe('/api/avatar-choices?kind=performer&id=7792');
  expect(cells()).toHaveLength(2);
  expect(cells()[0]?.querySelector('img')?.getAttribute('src'))
    .toBe('/avatar-choice?kind=performer&id=7792&ref=gfriends%3A7-S1%2F%E8%91%B5%E3%81%A4%E3%81%8B%E3%81%95.jpg');
  // The active one is highlighted but stays clickable; switching back and switching over are the same operation.
  expect(cells()[1]?.getAttribute('aria-selected')).toBe('true');
  expect(cells()[1]?.getAttribute('aria-disabled')).toBeNull();
  expect(cells()[1]?.textContent).toContain('In use');
});

it('When the gallery name differs from the page name, state clearly which one was matched', async () => {
  server(listing([choice()]));
  await openPicker();
  expect(dialog()?.textContent).toContain('found in the image library by "葵つかさ"');
});

it('When several names each bring back a batch of images, every cell states which name it was found by', async () => {
  // Picking the wrong person is the only serious error this screen can produce, and the name is the only clue: the whole screen reports just one line, 'found in the image library',
  // An image with the same name but a different person then carries nothing to raise suspicion.
  server(listing(
    [choice({ found_by: '葵つかさ' }),
      choice({ ref: 'gfriends:3-Prestige/葵ツカサ.jpg', label: '3-Prestige', found_by: '葵ツカサ' })],
    { matched_names: ['葵つかさ', '葵ツカサ'] }));
  await openPicker();
  expect(dialog()?.textContent).toContain('found in the image library by "葵つかさ", "葵ツカサ"');
  expect(cells()[0]?.getAttribute('title')).toContain('found via "葵つかさ"');
  expect(cells()[1]?.getAttribute('title')).toContain('found via "葵ツカサ"');
});

it('Opening a gallery portrait starts with a box selection; the default box lands on the server-detected face, and finishing closes the popover and lets the host rerender', async () => {
  const calls = server(listing([choice()]));
  const { picked } = await openPicker();
  await click(cells()[0]);
  await settle();
  // One click does not swap directly: first ask the server the image size and where the face is, then enter frame selection.
  expect(sent(calls, 1)[0]).toBe('/api/avatar-frame');
  expect(body(calls, 1)).toEqual({ kind: 'performer', id: 7792, ref: 'gfriends:7-S1/葵つかさ.jpg' });
  expect(dialog()?.textContent).toContain('Boxes the avatar region');
  expect(document.querySelector('[role="dialog"] img')?.getAttribute('src'))
    .toBe('/avatar-choice?kind=performer&id=7792&ref=gfriends%3A7-S1%2F%E8%91%B5%E3%81%A4%E3%81%8B%E3%81%95.jpg');
  await reportSize(300, 400);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(sent(calls, 2)[0]).toBe('/api/avatar-pick');
  expect(body(calls, 2)).toEqual({
    kind: 'performer', id: 7792, ref: 'gfriends:7-S1/葵つかさ.jpg', crop: FRAMED.focus, version: '',
  });
  expect(picked).toHaveBeenCalledOnce();
  expect(dialog()).toBeNull();
});

it('Portraits with no detected face center their box', async () => {
  const calls = server(listing([choice()]), { focus: null });
  await openPicker();
  await click(cells()[0]);
  await settle();
  await reportSize(300, 400);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(body(calls, 2).crop).toEqual({ x0: 0, y0: 50, x1: 300, y1: 350 });
});

it('Portrait cropping can use the whole image, while video frames never take this path', async () => {
  const calls = server(listing([choice(), artwork()]));
  await openPicker();
  await click(cells()[1]);
  await settle();
  expect(buttonNamed('Use the whole image')).toBeNull();
  await click(buttonNamed('Return to alternate images'));
  await settle();
  await click(cells()[0]);
  await settle();
  await click(buttonNamed('Use the whole image'));
  await settle();
  expect(body(calls, 2)).toEqual({ kind: 'performer', id: 7792, ref: 'gfriends:7-S1/葵つかさ.jpg' });
  expect(dialog()).toBeNull();
});

it('After switching, reopening refetches, and "in use" never sticks to the previous cell', async () => {
  const calls = server(listing([choice(), choice({ ref: 'sha256:abc', source: 'history', label: 'twitter' })]));
  const { host } = await openPicker();
  await click(cells()[0]);
  await settle();
  await click(buttonNamed('Use the whole image'));
  await settle();
  await click(host.querySelector('button'));
  await settle();
  expect(calls.filter(([url]) => url.startsWith('/api/avatar-choices'))).toHaveLength(2);
});

it('Fetching an image is allowed only once the address bar is filled; the fetched one enters crop selection and hands over the server-provided ref', async () => {
  const calls = server(listing([]), {
    ref: 'url:https://example.com/a.jpg', source: 'url', label: 'example.com', bases: ['url:https://example.com/a.jpg'],
  });
  await openPicker();
  expect(buttonNamed('Use this address')?.disabled).toBe(true);
  expect(buttonNamed('Use this address')?.className).not.toContain('bg-button-primary');
  await type(document.querySelector<HTMLInputElement>('input[aria-label="Image address"]'), '  https://example.com/a.jpg  ');
  expect(buttonNamed('Use this address')?.disabled).toBe(false);
  await click(buttonNamed('Use this address'));
  await settle();
  expect(body(calls, 1)).toEqual({ kind: 'performer', id: 7792, url: 'https://example.com/a.jpg' });
  // The preview uses the server cache copy rather than stuffing the hand-typed address straight into <img>.
  expect(document.querySelector('[role="dialog"] img')?.getAttribute('src'))
    .toBe('/avatar-choice?kind=performer&id=7792&ref=url%3Ahttps%3A%2F%2Fexample.com%2Fa.jpg');
  await reportSize(300, 400);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(body(calls, 2)).toEqual({
    kind: 'performer', id: 7792, ref: 'url:https://example.com/a.jpg', crop: FRAMED.focus, version: '',
  });
});

it('Local images preview from conversion candidates, and confirming submits the original bytes with the framing box', async () => {
  const calls = server(listing([]), { ref: 'sha256:upload-image', source: 'upload', label: 'My image.jpg', bases: [] });
  await openPicker();
  const file = new File([new Uint8Array([1, 2, 3])], 'My image.jpg', { type: 'image/jpeg' });
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  // The button only forwards clicks to this input; once a file is picked the browser dispatches change.
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) });
  await settle();
  expect(sent(calls, 1)[0]).toBe('/api/avatar-frame?kind=performer&id=7792&name=My%20image.jpg');
  expect(sent(calls, 1)[1].body).toBe(file);
  expect(document.querySelector('[role="dialog"] img')?.getAttribute('src'))
    .toBe('/avatar-choice?kind=performer&id=7792&ref=sha256%3Aupload-image');
  expect(input.accept).toContain('image/tiff');
  expect(input.accept).toContain('image/webp');
  expect(input.accept).toContain('image/avif');
  await reportSize(300, 400);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(sent(calls, 2)[0])
    .toBe('/api/avatar-pick?kind=performer&id=7792&name=My%20image.jpg&crop=90,20,210,140');
  expect(sent(calls, 2)[1].body).toBe(file);
});

it('Local images used whole carry no frame', async () => {
  const calls = server(listing([]), { ref: 'sha256:upload-image', source: 'upload', label: 'me.jpg', bases: [] });
  await openPicker();
  const file = new File([new Uint8Array([1, 2, 3])], 'me.jpg', { type: 'image/jpeg' });
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) });
  await settle();
  await click(buttonNamed('Use the whole image'));
  await settle();
  expect(sent(calls, 2)[0]).toBe('/api/avatar-pick?kind=performer&id=7792&name=me.jpg');
});

it('When framing fails the reason stays on the candidates screen', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_input: string, init?: RequestInit) => (
    init?.method === 'POST'
      ? { ok: false, status: 400, json: async () => ({ error: 'Only https addresses pointing at the public internet are accepted' }) }
      : { ok: true, status: 200, json: async () => listing([]) }
  )));
  await openPicker();
  await type(document.querySelector<HTMLInputElement>('input[aria-label="Image address"]'), 'https://192.0.2.1/a.jpg');
  await click(buttonNamed('Use this address'));
  await settle();
  expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('Only https addresses pointing at the public internet are accepted');
  expect(dialog()?.textContent).toContain('Change avatar');
});

it('When the swap fails the popover stays put with the reason inside', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => (
    input === '/api/avatar-pick'
      ? { ok: false, status: 400, json: async () => ({ error: 'This image was never downloaded and going online is not allowed this time' }) }
      : { ok: true, status: 200, json: async () => (init?.method === 'POST' ? choice(FRAMED) : listing([choice()])) }
  )));
  const { picked } = await openPicker();
  await click(cells()[0]);
  await settle();
  await click(buttonNamed('Use the whole image'));
  await settle();
  expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('This image was never downloaded and going online is not allowed this time');
  expect(picked).not.toHaveBeenCalled();
  expect(dialog()).not.toBeNull();
});

it('When the gallery index was never fetched or is expired it does not explain the index; only the two manual paths remain', async () => {
  server(listing([], { matched_names: [], index_age_hours: null, index_stale: true }));
  await openPicker();
  expect(cells()).toHaveLength(0);
  expect(dialog()?.textContent).not.toContain('The gallery index');
  expect(buttonNamed('Pick an image from this machine')).not.toBeNull();
  expect(document.querySelector('input[type=file]')).not.toBeNull();
});

it('Once the index is ready, gallery candidates appear automatically in the current popover', async () => {
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ++calls === 1
      ? listing([], { index_refreshing: true, index_age_hours: null, index_stale: true })
      : listing([choice()], { index_refreshing: false }),
  })));
  await openPicker();
  expect(dialog()?.textContent).toContain('Updating the gallery index');
  await vi.waitFor(() => expect(cells()).toHaveLength(1), { timeout: 2500 });
  expect(dialog()?.textContent).not.toContain('Updating the gallery index');
  const finished = calls;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(calls).toBe(finished);
});

it('A failed index refresh request stops polling and allows a manual retry', async () => {
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (++calls > 1) throw new Error('The service connection dropped');
    return { ok: true, status: 200, json: async () => listing([], {
      index_refreshing: true, index_age_hours: null, index_stale: true,
    }) };
  }));
  await openPicker();
  await vi.waitFor(() => expect(buttonNamed('Retry now')).not.toBeNull(), { timeout: 2500 });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(calls).toBe(2);
});

it('A stale index reads current candidates when the popover reopens', async () => {
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ++calls === 1
      ? listing([], { index_refreshing: false, index_error: 'Connection dropped', index_age_hours: null, index_stale: true })
      : listing([choice()], { index_refreshing: false }),
  })));
  const { host } = await openPicker();
  expect(dialog()?.textContent).toContain('Change avatarTsukasa Aoi: found in the image library by ');
  await click(dialog()?.querySelector('button[aria-label="Close"]'));
  await settle();
  await click(host.querySelector('button'));
  await settle();
  expect(calls).toBe(2);
  expect(cells()).toHaveLength(1);
});

it('When found under many names the note names the first two and counts the rest', async () => {
  const names = ['葵つかさ', '葵ツカサ', 'あおいつかさ', 'Aoi Tsukasa', '葵司 (AV performer)'];
  server(listing([choice({ found_by: names[4] })], { matched_names: names }));
  await openPicker();
  const note = dialog()?.textContent || '';
  expect(note).toContain('found in the image library by "葵つかさ", "葵ツカサ", 5 names in all');
  expect(note).not.toContain('あおいつかさ');
  // The ones not named still land in their own cell's title as before.
  expect(cells()[0]?.getAttribute('title')).toContain('found via "葵司 (AV performer)"');
});

it('With no candidates at all the grid strip is omitted, and the two manual paths stay put', async () => {
  server(listing([], { matched_names: [] }));
  await openPicker();
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(buttonNamed('Pick an image from this machine')).not.toBeNull();
  expect(document.querySelector('input[aria-label="Image address"]')).not.toBeNull();
});

it('When candidates fail to load, a "Retry" sits next to the reason; clicking fetches again', async () => {
  let fail = true;
  const fetched = vi.fn(async () => (fail
    ? { ok: false, status: 500, json: async () => ({ error: 'Candidates cannot be read' }) }
    : { ok: true, status: 200, json: async () => listing([choice()]) }));
  vi.stubGlobal('fetch', fetched);
  await openPicker();
  expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('Candidates cannot be readRetry now');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  fail = false;
  await click(buttonNamed('Retry now'));
  await settle();
  expect(fetched).toHaveBeenCalledTimes(2);
  expect(cells()).toHaveLength(1);
  expect(dialog()?.querySelector('[role="alert"]')).toBeNull();
});

it('No "Retry" appears beside a failed submission\'s reason: the submit key itself is what reruns', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_input: string, init?: RequestInit) => (
    init?.method === 'POST'
      ? { ok: false, status: 400, json: async () => ({ error: 'Only https addresses pointing at the public internet are accepted' }) }
      : { ok: true, status: 200, json: async () => listing([choice()]) }
  )));
  await openPicker();
  await click(cells()[0]);
  await settle();
  expect(dialog()?.querySelector('[role="alert"]')).not.toBeNull();
  expect(buttonNamed('Retry now')).toBeNull();
});

it('After a failed save returns candidates and a new image is picked, only the current operation\'s error shows', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (input.startsWith('/api/avatar-pick')) {
      return { ok: false, status: 400, json: async () => ({ error: 'Image data is incomplete or undecodable' }) };
    }
    return { ok: true, status: 200, json: async () => input.startsWith('/api/avatar-frame')
      ? choice(FRAMED) : listing([choice()]) };
  }));
  await openPicker();
  await click(cells()[0]);
  await settle();
  await reportSize(300, 400);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(dialog()?.textContent).toContain('Boxes the avatar region7-S1: drag the box to pick an area; the wheel or the corner square resizes it.Image data is incomplete or undecodableReturn to alternate imagesUse the whole imageUse this region');
  await click(buttonNamed('Return to alternate images'));
  await settle();
  expect(dialog()?.textContent).not.toContain('Image data is incomplete or undecodable');
  await click(cells()[0]);
  await settle();
  expect(dialog()?.querySelector('[role="alert"]')).toBeNull();
  expect(buttonNamed('Use this region')).not.toBeNull();
});

it('Group-work cells show the cast count, and framing reminds you to find her own face first', async () => {
  server(listing([choice({
    ref: 'asset:11:cover', source: 'asset', label: 'DVAJ-495', crop: true,
    width: 800, height: 540, bases: ['asset:11:cover'], cast: 15,
  })]));
  await openPicker();
  const [cell] = cells();
  expect(cell?.textContent).toContain('15 people');
  expect(cell?.getAttribute('title')).toContain('Video frames · DVAJ-495 · 800×540 · 15 co-stars · 葵つかさ.jpg');
  await click(cell);
  expect(dialog()?.textContent).toContain('Boxes the avatar regionDVAJ-495: 15 people co-starring; find her own face first, then drag the box to select a region.Return to alternate imagesUse this region');
});

it('Account video-frame cells note in their caption that it is a representative work, not the person', async () => {
  server(listing([choice({
    ref: 'asset:11:cover', source: 'asset', label: 'Goodnight Live', crop: true,
    detail: 'Representative work, not the person · Goodnight Live', bases: ['asset:11:cover'],
  })]));
  await openPicker();
  expect(cells()[0]?.getAttribute('title')).toContain('Video frames · Goodnight Live · Representative work, not the person · Goodnight Live');
});

/** The video frame tier: clicking opens frame selection instead of applying it directly. */
const artwork = () => choice({
  ref: 'asset:11:cover', source: 'asset', label: 'ABW-232', detail: '',
  crop: true, bases: ['asset:11:cover', 'asset:11:cell4'],
});

it('Before candidates arrive the grid shows skeletons of the same cell kind; once they arrive it switches to real cells', async () => {
  let answer: (value: unknown) => void = () => {};
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { answer = resolve })));
  await openPicker();
  const grid = document.querySelector('[role="listbox"]');
  expect(grid?.getAttribute('aria-busy')).toBe('true');
  expect(document.querySelectorAll('[data-avatar-skeleton]').length).toBeGreaterThan(0);
  // The skeleton gives assistive tech only a busy state, with no separate "Loading" sentence.
  expect(dialog()?.textContent).not.toContain('Running');
  await act(async () => answer({ ok: true, status: 200, json: async () => listing([choice()]) }));
  await settle();
  expect(grid?.getAttribute('aria-busy')).toBeNull();
  expect(document.querySelectorAll('[data-avatar-skeleton]')).toHaveLength(0);
  expect(cells()).toHaveLength(1);
});

it('While a candidate image is missing it shows retry; only after a successful retry does cropping begin', async () => {
  const calls = server(listing([choice(), choice({ ref: 'sha256:abc', source: 'history', label: 'twitter' })]));
  await openPicker();
  const [first, second] = cells();
  const layers = (cell: HTMLElement | undefined) =>
    [...(cell?.querySelectorAll('img, [aria-hidden]') ?? [])];
  expect(layers(first).map((one) => one.hasAttribute('data-revealed'))).toEqual([false, false]);
  await act(async () => { first?.querySelector('img')?.dispatchEvent(new Event('load')) });
  expect(layers(first).map((one) => one.hasAttribute('data-revealed'))).toEqual([true, true]);
  await act(async () => { second?.querySelector('img')?.dispatchEvent(new Event('error')) });
  expect(second?.querySelector('img')).toBeNull();
  expect(second?.querySelector('[data-choice-lost]')).not.toBeNull();
  expect(second?.querySelector('.reveal-skeleton')?.hasAttribute('data-revealed')).toBe(true);
  expect(second?.textContent).toContain('twitter');
  expect(second?.textContent).toContain('Image not obtained; click to retry');
  await click(second);
  expect(calls).toHaveLength(1);
  expect(second?.querySelector('img')).not.toBeNull();
  expect(second?.querySelector('[data-choice-lost]')).toBeNull();
  await act(async () => { second?.querySelector('img')?.dispatchEvent(new Event('load')) });
  await click(second);
  await settle();
  expect(sent(calls, 1)[0]).toBe('/api/avatar-frame');
});

it('Cover cells crop a 3:4 region of the framing area, while gallery portraits keep filling', async () => {
  server(listing([
    choice(),
    choice({ ref: 'asset:11:cover', source: 'asset', label: 'ABW-232', crop: true,
      width: 800, height: 540, bases: ['asset:11:cover'],
      focus: { x0: 592, y0: 114, x1: 688, y1: 210 } }),
  ]));
  await openPicker();
  const [portrait, cover] = cells().map((cell) => cell.querySelector('img'));
  expect(portrait?.style.getPropertyValue('--tile-width')).toBe('');
  // The largest 3:4 that fits in a 96px square is 72×96, centered at (640, 162): top-left (604, 114).
  expect({
    left: cover?.style.getPropertyValue('--tile-left'),
    top: cover?.style.getPropertyValue('--tile-top'),
    width: cover?.style.getPropertyValue('--tile-width'),
    height: cover?.style.getPropertyValue('--tile-height'),
  }).toEqual({
    left: `${(-604 / 72) * 100}%`, top: `${(-114 / 96) * 100}%`,
    width: `${(800 / 72) * 100}%`, height: `${(540 / 96) * 100}%`,
  });
});

it('Covers fetched by code go straight into box selection; the default box is the face area, and submitting states which cover edition was boxed', async () => {
  const code = choice({
    ref: 'cover:ABW-999', source: 'code', label: 'ABW-999', crop: true,
    width: 800, height: 540, bases: ['cover:ABW-999'],
    focus: { x0: 592, y0: 114, x1: 688, y1: 210 }, version: '18f3a',
  });
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push([input, init || {}]);
    const answer = input === '/api/avatar-code-cover' ? code
      : init?.method === 'POST' ? { ok: true } : listing([]);
    return { ok: true, status: 200, json: async () => answer };
  }));
  await openPicker();
  expect(buttonNamed('Use cover to frame')?.disabled).toBe(true);
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Code"]');
  await type(input, ' abw-999 ');
  // Enter submits, the same thing as pressing that button.
  await act(async () => { input?.form?.requestSubmit() });
  await settle();
  expect(sent(calls, 1)[0]).toBe('/api/avatar-code-cover');
  expect(body(calls, 1)).toEqual({ code: 'abw-999' });
  expect(dialog()?.textContent).toContain('Boxes the avatar region');
  expect([...document.querySelectorAll('[data-crop-base]')]).toHaveLength(0);
  // Covers are replaced in place: the base image URL carries a version, a swapped cover is a different URL, and the old image is never reused.
  expect(document.querySelector('[role="dialog"] img')?.getAttribute('src'))
    .toBe('/avatar-choice?kind=performer&id=7792&ref=cover%3AABW-999&v=18f3a');
  await reportSize(800, 540);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(body(calls, 2)).toEqual({
    kind: 'performer', id: 7792, ref: 'cover:ABW-999',
    crop: { x0: 592, y0: 114, x1: 688, y1: 210 }, version: '18f3a',
  });
});

it('When a code cannot fetch a cover the reason stays in the popover', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => (
    input === '/api/avatar-code-cover'
      ? { ok: false, status: 400, json: async () => ({ error: 'Official channels have no cover for this code' }) }
      : { ok: true, status: 200, json: async () => listing([]) }
  )));
  await openPicker();
  await type(document.querySelector<HTMLInputElement>('input[aria-label="Code"]'), 'ABW-999');
  await click(buttonNamed('Use cover to frame'));
  await settle();
  expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('Official channels have no cover for this code');
  expect(dialog()?.textContent).toContain('Change avatar');
});

/** happy-dom does not actually load images, so it reports a size itself: everything about the frame starts from this step. */
async function reportSize(width: number, height: number) {
  const image = document.querySelector('[role="dialog"] img');
  if (!image) throw new Error('The framed image never painted');
  for (const [name, value] of [['naturalWidth', width], ['naturalHeight', height],
    ['clientWidth', width], ['clientHeight', height]] as const) {
    Object.defineProperty(image, name, { value, configurable: true });
  }
  image.dispatchEvent(new Event('load', { bubbles: false }));
  await settle();
}

it('Video frames box a region before fitting, with the box square', async () => {
  const calls = server(listing([artwork()]));
  const { picked } = await openPicker();
  await click(cells()[0]);
  await settle();
  // A click should not swap the avatar directly: this step only enters frame selection.
  expect(calls).toHaveLength(1);
  expect(dialog()?.textContent).toContain('Boxes the avatar region');
  await reportSize(800, 540);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(sent(calls, 1)[0]).toBe('/api/avatar-pick');
  expect(body(calls, 1)).toEqual({
    kind: 'performer', id: 7792, ref: 'asset:11:cover',
    // The avatar is round, so the frame must be square: 540 on the short side, centered.
    crop: { x0: 130, y0: 0, x1: 670, y1: 540 }, version: '',
  });
  expect(picked).toHaveBeenCalledOnce();
});

it('Changing the base image swaps to another image, leaving none of the previous image\'s box values', async () => {
  server(listing([artwork()]));
  await openPicker();
  await click(cells()[0]);
  await settle();
  const bases = [...document.querySelectorAll<HTMLElement>('[data-crop-base]')];
  expect(bases.map((one) => one.textContent?.trim())).toEqual(['Cover', 'Cell 5']);
  await reportSize(800, 540);
  await click(bases[1]);
  await settle();
  // The new base image has not been measured yet, so there is no frame to submit at this moment.
  expect(buttonNamed('Use this region')?.getAttribute('disabled')).not.toBeNull();
});

it('Online videos can choose the base image between cover and body images, and cropping passes back the creator and original media index', async () => {
  const calls = server(listing([choice({ ref: 'follow:11:cover', source: 'online', label: 'Online videos', crop: true,
    bases: ['follow:11:cover', 'follow:11:image3'] })]));
  await openPicker({ kind: 'creator', entityId: 8892, name: 'Online Author' });
  await click(cells()[0]);
  await settle();
  const bases = [...document.querySelectorAll<HTMLElement>('[data-crop-base]')];
  expect(bases.map((one) => one.textContent?.trim())).toEqual(['Video cover', 'Content image 4']);
  await click(bases[1]);
  await reportSize(800, 540);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(body(calls, 1)).toEqual({ kind: 'creator', id: 8892, ref: 'follow:11:image3',
    crop: { x0: 130, y0: 0, x1: 670, y1: 540 }, version: '' });
});

it('A wrong box can return to alternate images, landing back on the same screen', async () => {
  const calls = server(listing([artwork()]));
  await openPicker();
  await click(cells()[0]);
  await settle();
  await click(buttonNamed('Return to alternate images'));
  await settle();
  expect(cells()).toHaveLength(1);
  expect(calls).toHaveLength(1);
});
