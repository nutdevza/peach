import { describe, expect, it } from 'vitest';
import { wallEmptyHtml } from '../../src/react/video-wall/wall-empty';

function content(options: Parameters<typeof wallEmptyHtml>[0]) {
  const host = document.createElement('div');
  host.innerHTML = wallEmptyHtml(options);
  return host;
}

describe('Video wall empty state', () => {
  it('An empty library offers an add video entry', () => {
    const host = content({ libraryEmpty: true, matches: 0, hasMore: false,
      catalogEmpty: '<h2>No videos yet</h2><button>Add content</button>' });
    expect(host.querySelector('h2')?.textContent).toBe('No videos yet');
    expect(host.querySelector('button')?.textContent).toBe('Add content');
    expect(host.textContent).not.toContain('Cover');
  });

  it('Empty filter results offer a clear filters entry', () => {
    const host = content({ libraryEmpty: false, matches: 0, hasMore: false });
    expect(host.textContent).toContain('No videos match the filter conditions');
    expect(host.querySelector('a')?.textContent).toBe('Clear filters');
    expect(host.textContent).not.toContain('Cover');
  });

  it('Explain the missing cover when a matching video exists', () => {
    const host = content({ libraryEmpty: false, matches: 13, hasMore: false });
    expect(host.textContent).toContain('These videos have no covers yet');
    expect(host.textContent).toContain('These videos have no covers yetAfter completing a video\'s cover it can be viewed in the video wall.Complete covers');
    expect(host.textContent).not.toContain('Nothing matches the filter conditions');
  });
});
