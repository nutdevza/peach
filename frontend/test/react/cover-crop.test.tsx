/* Crop cover: where the box sits after opening, and what confirm and reset-to-default each send.
 *
 * What is cropped is the framing box, not the image, so what is checked here is "whether the coordinates sent are the right ones". */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { PANEL_ASPECT } from '../../src/jav-artwork';
import { CoverCrop } from '../../src/react/cover-crop/cover-crop-page';
import { queryClient } from '../../src/react/query';

import { buttonNamed, click, mount, settle } from './render';

afterEach(() => { queryClient.clear() });

notifyManager.setScheduler((notify) => notify());

type Call = [string, RequestInit];

const SAVED_BOX = { x0: 420, y0: 0, x1: 800, y1: 540, method: 'manual', px: [800, 540] };

function server() {
  const calls: Call[] = [];
  const fetched = vi.fn(async (input: string, init?: RequestInit) => {
    calls.push([input, init || {}]);
    return { ok: true, status: 200, json: async () => ({ ok: true, code: 'ABW-232', poster_box: SAVED_BOX }) };
  });
  vi.stubGlobal('fetch', fetched);
  return calls;
}

const sentBox = (calls: Call[], n = 0) => JSON.parse(String(calls[n]?.[1]?.body)).box;

/** happy-dom does not actually load images, so it reports a size itself: everything about the frame starts from this step. */
async function reportSize(width: number, height: number) {
  const image = document.querySelector('img');
  if (!image) throw new Error('The framed image never painted');
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true });
  Object.defineProperty(image, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(image, 'clientHeight', { value: height, configurable: true });
  image.dispatchEvent(new Event('load', { bubbles: false }));
  await settle();
}

async function openCrop(props: Record<string, unknown> = {}) {
  const saved = vi.fn();
  const host = await mount(
    <QueryClientProvider client={queryClient}>
      <CoverCrop code="ABW-232" coverUrl="/cover?code=ABW-232" box={null} onSaved={saved}
        {...props} />
    </QueryClientProvider>,
  );
  await click(host.querySelector('[data-cover-crop]'));
  await settle();
  return { host, saved };
}

it('The details page key can say which image it crops', async () => {
  const { host } = await openCrop();
  expect(host.querySelector('[data-cover-crop]')?.getAttribute('aria-label'))
    .toBe('Crop ABW-232\'s cover');
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
});

it('Without an active box the default box runs full height against the right edge, sized to front-cover ratio', async () => {
  const calls = server();
  const { saved } = await openCrop();
  await reportSize(800, 540);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(calls[0]?.[0]).toContain('/api/cover-crop');
  // 540×0.704≈380, measured back from the right edge that is 420; not a single pixel cropped vertically.
  expect(sentBox(calls)).toEqual({ x0: 420, y0: 0, x1: 800, y1: 540 });
  // The host receives the box the write endpoint returned: the grid behind swaps it in place, no refetch needed.
  expect(saved).toHaveBeenCalledExactlyOnceWith(SAVED_BOX);
});

it('An existing box is where it lands; edits adjust what is there rather than starting over', async () => {
  const calls = server();
  await openCrop({ box: { x0: 300, y0: 20, x1: 700, y1: 500, method: 'manual', px: [800, 540] } });
  await reportSize(800, 540);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(sentBox(calls)).toEqual({ x0: 300, y0: 20, x1: 700, y1: 500 });
});

it('A box computed against a different cover is rejected, falling back to default', async () => {
  const calls = server();
  await openCrop({ box: { x0: 300, y0: 20, x1: 700, y1: 500, method: 'fold', px: [1600, 1080] } });
  await reportSize(800, 540);
  await click(buttonNamed('Use this region'));
  await settle();
  expect(sentBox(calls).x1).toBe(800);
});

it('Restore defaults sends an empty box for the backend to recompute by the crease rule', async () => {
  const calls = server();
  const { saved } = await openCrop();
  await reportSize(800, 540);
  await click(buttonNamed('Restore defaults'));
  await settle();
  expect(sentBox(calls)).toBeNull();
  expect(saved).toHaveBeenCalledTimes(1);
});

it('The front-cover ratio is the backend\'s copy, with neither side writing its own number', () => {
  expect(PANEL_ASPECT).toBe(0.704);
});
