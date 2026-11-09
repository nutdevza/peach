import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SiteMark } from '../../src/react/components/site-mark';

it('When an old response lacks the link favicon ID, the generic icon shows directly and no undefined request is sent', () => {
  const html = renderToStaticMarkup(<SiteMark linkId={undefined} />);
  expect(html).toContain('<svg');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('undefined');
});

it('With a link id and built-in source each still uses its own real site-mark address', () => {
  expect(renderToStaticMarkup(<SiteMark linkId={12} />)).toContain('/link-mark?id=12');
  expect(renderToStaticMarkup(<SiteMark source="github" />)).toContain('/site-icon/github.png');
});
