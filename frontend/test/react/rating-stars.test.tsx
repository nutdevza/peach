import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RatingStars } from '../../src/react/components/rating-stars';
import { CatalogRating } from '../../src/react/catalog-grid/catalog-table-controls';
import { queryClient } from '../../src/react/query';
import { click, mountRoot, settle } from './render';

afterEach(() => queryClient.clear());

it('The rating button exposes the current star value and a clear name; busy state blocks duplicate ratings while staying focusable', async () => {
  const rate = vi.fn();
  const root = await mountRoot(<RatingStars value={3} onRate={rate} />);
  await click(root.host.querySelector('button[aria-label="Rate 4 stars"]'));
  expect(rate).toHaveBeenLastCalledWith(4);
  await click(root.host.querySelector('button[aria-label="Clear rating (currently 3 stars)"]'));
  expect(rate).toHaveBeenLastCalledWith(3);
  await root.rerender(<RatingStars value={3} onRate={rate} busyStar={4} />);
  const buttons = [...root.host.querySelectorAll('button')];
  expect(buttons.every(button => button.getAttribute('aria-disabled') === 'true' && !button.disabled)).toBe(true);
  expect(root.host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Saving rating');
  await click(buttons[4]);
  expect(rate).toHaveBeenCalledTimes(2);
});

it('Read-only ratings keep the fractional fill with no write button', async () => {
  const { host } = await mountRoot(<RatingStars value={3.5} />);
  expect(host.querySelectorAll('[data-rate]')).toHaveLength(5);
  expect(host.querySelectorAll('button')).toHaveLength(0);
  expect([...host.querySelectorAll<HTMLElement>('[data-rating-fill]')].map(node => node.style.width))
    .toEqual(['100%', '100%', '100%', '50%', '0%']);
});

it('Successful table ratings sync the list and details caches; failures keep the reason and can retry', async () => {
  const item = { id: 1, rating: 60 };
  queryClient.setQueryData(['catalog-grid', 'table', 'fixture'], { items: [item], total: 1 });
  queryClient.setQueryData(['item', 1], { ...item, name: 'Sample video' });
  const rate = vi.fn(async (_item, _star, changed) => { changed(80) });
  const root = await mountRoot(<CatalogRating item={item} actions={{ rate }} />);
  await click(root.host.querySelector('button[aria-label="Rate 4 stars"]'));
  await settle();
  expect(queryClient.getQueryData(['item', 1])).toMatchObject({ id: 1, rating: 80, name: 'Sample video' });
  expect(queryClient.getQueryData(['catalog-grid', 'table', 'fixture'])).toMatchObject({ items: [{ id: 1, rating: 80 }] });
  rate.mockRejectedValueOnce(new Error('Sample rating failed'));
  await click(root.host.querySelector('button[aria-label="Rate 5 stars"]'));
  await settle();
  expect(root.host.textContent).toContain('The operation did not finish; please retry. If it keeps failing, check the tray log.Retry now');
  const retry = [...root.host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Retry rating now')!;
  await act(async () => retry.click());
  await settle();
  expect(rate).toHaveBeenCalledTimes(3);
  expect(root.host.textContent).not.toContain('Sample rating failed');
});
