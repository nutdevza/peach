import { expect, it, vi } from 'vitest';

import { advanceImageFallback } from '../../src/card-art/image-fallback';
import { feedNewCoverHtml } from '../../src/application/feed.js';

// The cover fragment only reads entry fields; the other domain controllers are swapped for empty shells so the whole app never loads.
vi.mock('../../src/application/catalog.js', () => ({ catalogState: {} }));
vi.mock('../../src/application/preferences.js', () => ({ preferencesState: {}, wireDrag: () => {} }));
vi.mock('../../src/application/entity.js', () => ({ pushEntityPage: () => {} }));
vi.mock('../../src/application/effects', () => ({ applicationEffects: {} }));

const render = (item: Record<string, unknown>) => {
  const host = document.createElement('div');
  host.innerHTML = feedNewCoverHtml(item);
  return host;
};

it('Official covers of unscanned new releases are fetched through the Peach proxy, and no image-host address appears in the page', () => {
  const host = render({ code: 'ABC-001', has_cover: false,
    cover_url: 'https://awsimgsrc.dmm.co.jp/pics_dig/digital/video/abc00001/abc00001pl.jpg' });
  const image = host.querySelector('img')!;
  expect(image.getAttribute('src')).toBe('/cover-image?code=ABC-001');
  expect(host.innerHTML).not.toContain('dmm.co.jp');
});

it('When the proxy cannot fetch a cover it swaps to the "Cover unavailable" placeholder with no broken image', () => {
  const host = render({ code: 'ABC-001', has_cover: false, cover_url: 'https://pics.dmm.co.jp/digital/video/abc00001/abc00001pl.jpg' });
  expect(advanceImageFallback(host.querySelector('img'))).toBe('drop');
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('span.nopic')?.textContent).toBe('No cover available');
});

it('With no cover yet it writes the state and reason; queued ones get "Prioritise", fetched-but-missed ones get "Retry now"', () => {
  for (const [state, title, action] of [['queued', 'Queued', '优先处理'], ['missing', 'No cover', 'Retry now']] as const) {
    const host = render({ code: 'ABC-001', has_cover: false, cover_url: '', cover_state: state, cover_reason: '等下一轮订阅检查分批取图' });
    const cell = host.querySelector(`[data-feed-cover-state="${state}"]`)!;
    expect(cell.querySelector('.nopic')?.textContent).toBe(title);
    expect(cell.querySelector('.feedcoverreason')?.textContent).toBe('等下一轮订阅检查分批取图');
    const button = cell.querySelector<HTMLButtonElement>('button[data-feed-action="prioritise"]')!;
    expect([button.textContent, button.dataset.code]).toEqual([action, 'ABC-001']);
  }
  const fetching = render({ code: 'ABC-001', has_cover: false, cover_url: '', cover_state: 'fetching' });
  expect(fetching.querySelector('[data-feed-cover-state="fetching"] button')).toBeNull();
});

it('With no proxyable address or code it shows no cover directly and sends no request', () => {
  for (const item of [{ code: 'ABC-001', cover_url: '' }, { code: '', cover_url: 'https://pics.dmm.co.jp/a.jpg' }]) {
    const host = render({ ...item, has_cover: false });
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-feed-cover-state="missing"]')?.textContent).toBe('No cover');
  }
});
