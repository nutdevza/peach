import { describe, expect, it } from 'vitest';
import { entitySkeletonHtml } from '../src/entity-skeleton';

const HEAD = '<div class="entitycollectionhead" data-filter-row="bottom"><h3 class="skeleton">&nbsp;</h3></div>';

describe('Entity details skeleton', () => {
  it('Agencies use a square mark, profile header, tags, and a members body', () => {
    const html = entitySkeletonHtml('agency', HEAD, '<div class="igrid">Members</div>');
    expect(html).toContain('data-skeleton="entity/agency"');
    expect(html).toContain('entityportrait square skeleton');
    expect(html).toContain('entityhero');
    expect(html).toContain('data-entity-filter-glass');
    expect(html).toContain('<div class="entitysection"><div class="igrid">');
  });
  it('Person profiles use round avatars', () => {
    expect(entitySkeletonHtml('performer', HEAD, '')).toContain('entityportrait skeleton');
  });
  it('The filter bar and video headings share one overlay frame', () => {
    const html = entitySkeletonHtml('performer', HEAD, '');
    const frame = html.slice(html.indexOf('board-filter-frame'), html.indexOf('<div class="entitysection"'));
    expect(frame).toContain('data-filter-row="top"');
    expect(frame).toContain('data-filter-row="bottom"');
    // There is one outer frame, both filter rows live inside it, and the waiting state and the loaded content share the same shape.
    expect(html.match(/board-filter-frame/g)).toHaveLength(1);
  });
});
