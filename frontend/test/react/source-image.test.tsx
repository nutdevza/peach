import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { SourceImage } from '../../src/react/review/review-evidence';
import { click, mountRoot } from './render';

it('Source images request only after a click, failures can retry, and changing sources asks for confirmation again', async () => {
  const { host, rerender } = await mountRoot(<SourceImage url="https://example.org/one.jpg" />);
  expect(host.querySelector('img')).toBeNull();
  await click(host.querySelector('button'));
  expect(host.querySelector('img')?.getAttribute('src')).toBe('https://example.org/one.jpg');
  expect(host.querySelector('[role=status]')?.textContent).toContain('Loading image');
  await act(async () => { host.querySelector('img')!.dispatchEvent(new Event('error')) });
  expect(host.querySelector('img')).toBeNull();
  expect(host.textContent).toContain('Source image not fetchedRetry now');
  await click(host.querySelector('button'));
  await act(async () => { host.querySelector('img')!.dispatchEvent(new Event('load')) });
  expect(host.querySelector('[role=status]')).toBeNull();
  expect(host.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
  await rerender(<SourceImage url="https://example.org/two.jpg" />);
  expect(host.querySelector('img')).toBeNull();
  await rerender(<SourceImage url="javascript:alert(1)" />);
  expect(host.querySelector('button')).toBeNull();
});

it('Source image timeouts end the wait and offer retry', async () => {
  vi.useFakeTimers();
  const { host } = await mountRoot(<SourceImage url="https://example.org/slow.jpg" />);
  await click(host.querySelector('button'));
  await act(async () => { vi.advanceTimersByTime(30_000) });
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('[role=status]')).toBeNull();
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Retry loading source images now');
});
