import { describe, expect, it, vi } from 'vitest';
import { catalogEmptyHtml, catalogSuggestions, clearCatalogAddress } from '../src/catalog-onboarding';

describe('Current library recommendations', () => {
  it('Empty instance shows no sample words', async () => {
    expect(await catalogSuggestions({}, async () => ({ items: [], tags: [] }))).toEqual([]);
  });
  it('Even little content recommends, with every entry having a search hit under the current filter', async () => {
    const request = vi.fn(async (url: string) => {
      const parsed = new URL(url, 'http://localhost');
      expect(parsed.searchParams.get('jav')).toBe('1');
      expect(parsed.searchParams.has('q')).toBe(false);
      if (parsed.pathname === '/api/facets') return { tags: [{ k: 'Local tags', n: 2 }, { k: 'Stale terms', n: 0 }] };
      return { items: [{ name: 'local-video.mp4' }] };
    });
    expect(await catalogSuggestions({ jav: '1', q: 'Never carried in' }, request)).toEqual(['Local tags', 'local-video.mp4']);
  });
  it('Opening the search box sends only two requests, the filter options and the samples, without counting per-word searches', async () => {
    const request = vi.fn(async (url: string) => url.startsWith('/api/facets')
      ? { creators: Array.from({ length: 6 }, (_, n) => ({ k: `Seller${n}`, n: 1 })),
          tags: Array.from({ length: 6 }, (_, n) => ({ k: `Tag${n}`, n: 3 })) }
      : { items: [{ code: 'ABC-001' }] });
    expect(await catalogSuggestions({}, request)).toHaveLength(10);
    expect(request).toHaveBeenCalledTimes(2);
    const sample = new URL(request.mock.calls.map(([url]) => url).find(url => url.startsWith('/api/items'))!, 'http://localhost');
    expect(sample.searchParams.get('count')).toBe('0');
  });
});

describe('Library and details empty states', () => {
  it('An empty home offers real add-content and add-source entries', () => {
    const html = catalogEmptyHtml({ configurable: true });
    expect(html).toContain('data-geist-empty-state');
    expect(html).toContain('href="/settings/library"');
    expect(html).toContain('href="/subscriptions?tab=add"');
    expect(catalogEmptyHtml()).toContain('href="/settings/library"');
    expect(catalogEmptyHtml({ online: true })).toContain('class="geist-button primary" href="/subscriptions?tab=add"');
    expect(catalogEmptyHtml({ configurable: true }).match(/class="geist-button primary"/g)).toHaveLength(1);
  });
  it('JAV and filtered empty states offer viewing unfiltered content', () => {
    expect(catalogEmptyHtml({ jav: true })).toContain('<div class=');
    expect(catalogEmptyHtml({ filtered: true })).toContain('Clear filters');
    const page = document.createElement('div');
    page.innerHTML = catalogEmptyHtml({ jav: true, filtered: true });
    expect([...page.querySelectorAll('a')].map(link => link.getAttribute('href')))
      .toEqual(['/?loc=&thumb=0', '/data-cleanup#libraryProcessing']);
  });
  it('Tags and every entity kind show a note when details are missing', () => {
    for (const kind of ['tags', 'performers', 'creators', 'studios', 'agencies', 'series']) {
      expect(catalogEmptyHtml({ kind })).toContain('data-geist-empty-state');
    }
    expect(catalogEmptyHtml({ kind: 'tags', online: true })).toContain('<div class=');
    expect(catalogEmptyHtml({ kind: 'creators' })).toContain('<div class=');
  });
  it('Clearing conditions keeps the current index, view, and online range', () => {
    expect(clearCatalogAddress('/tags?scope=online&view=alphabet&q=missing&tag=x&category=role'))
      .toBe('/tags?scope=online&view=alphabet&thumb=0');
    expect(clearCatalogAddress('/?q=x&dur_min=60&state=seen&view=list')).toBe('/?view=list&thumb=0');
  });
});
