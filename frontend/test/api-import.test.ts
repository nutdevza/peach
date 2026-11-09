import { expect, it, vi } from 'vitest';

it('API error feedback on standalone pages never initializes UI segmenters', async () => {
  vi.resetModules();
  const segmenter = vi.spyOn(Intl, 'Segmenter');
  const { errorMessage } = await import('../src/api');
  expect(errorMessage(new TypeError('Failed to fetch'))).toContain('Could not connect to the Peach service. Check the network connection and make sure the tray service is running.');
  expect(segmenter).not.toHaveBeenCalled();
});
