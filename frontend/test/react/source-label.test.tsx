import { act } from 'react';
import { expect, it } from 'vitest';
import { SiteLabel } from '../../src/react/components/source-label';
import { mount } from './render';

it('Site marks read through this site, falling back to the source name and a generic icon when unavailable', async () => {
  const host = await mount(<SiteLabel site="missav" label="MISSAV URL" />);
  const image = host.querySelector('img')!;
  expect(image.getAttribute('src')).toBe('/site-mark?domain=missav.com');
  await act(async () => { image.dispatchEvent(new Event('error')) });
  expect(host.querySelector('img')).toBeNull();
  expect(host.textContent).toContain('MISSAV URL');
  expect(host.querySelector('svg')).not.toBeNull();
});
