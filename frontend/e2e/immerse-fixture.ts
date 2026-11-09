/* Fixtures shared by immersive mode tests: pick one landscape and one portrait from the demo library, pin the random sampling to these entries, and open muted.
 *
 * `/api/items?sort=rand` is a fresh random sample each time; once pinned, play order is decided by the starting id and the given order. */
import assert from 'node:assert/strict';

import type { Page } from 'playwright-core';

export type Clip = { id: number; width: number; height: number; duration: number; cost?: string; [field: string]: unknown };

/** One landscape and one portrait video playable directly from the demo library (whole cards, passed to the sampler as-is). */
export async function pickClips(page: Page): Promise<{ wide: Clip; tall: Clip; all: Clip[] }> {
  const items: Clip[] = await page.evaluate(async () =>
    (await (await fetch('/api/items?limit=60&offset=0&thumb=')).json()).items);
  const all = items.filter((item) => item.duration && item.cost !== 'metered');
  const wide = all.find((item) => item.width > item.height);
  const tall = all.find((item) => item.height > item.width);
  assert.ok(wide && tall, 'The demo library needs one landscape and one portrait video');
  return { wide, tall, all };
}

/** Random sampling returns only these entries, in the given order. */
export const pinQueue = (page: Page, clips: Clip[]) =>
  page.route(/\/api\/items\?.*sort=rand/, (route) => route.fulfill({ json: { items: clips } }));

/** Someone is next to this machine: every video inserted from now on starts muted. */
export const muteVideos = (page: Page) => page.addInitScript(() => {
  new MutationObserver(() => document.querySelectorAll('video').forEach((video) => { video.muted = true; }))
    .observe(document, { childList: true, subtree: true });
});

/** One cell left, the loading notice collapsed, and this cell's video has a frame to show. */
export const settledClip = (page: Page) => page.waitForFunction(() =>
  document.querySelectorAll('[data-immerse-track] [data-immerse-slide]').length === 1
  && Boolean(document.querySelector<HTMLElement>('[data-immerse-loader]')?.hidden)
  && (document.querySelector<HTMLVideoElement>('[data-immerse-track] [data-immerse-slide] video')?.readyState ?? 0) >= 2,
undefined, { timeout: 20_000 });

/** Deep link into immersive mode and wait for the first video to enter the frame. */
export async function openImmerse(page: Page, id: number): Promise<void> {
  await page.goto(new URL(`/immerse?id=${id}`, page.url()).href, { waitUntil: 'domcontentloaded' });
  await settledClip(page);
}

/** The video of the cell currently in frame. */
export const currentVideo = '[data-immerse-track] [data-immerse-slide] video.vjs-tech';
