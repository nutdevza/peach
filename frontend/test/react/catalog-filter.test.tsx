/* Home filter bar island: the two rows when the library is empty and during first-screen waiting, and what the tag bar holds.
 *
 * Selection, continuation pages, sorting, layout, and details round trips need real fetching and layout measurement, exercised by `frontend/e2e/catalog-filter.test.ts` in a real browser. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogFilterPage } from '../../src/react/catalog-filter/catalog-filter-page';
import {
  EMPTY_SLOTS, rememberedTiers, rememberTiers, TIERS_SHAPE_KEY, type CatalogFilterProps, type TierPerformer,
} from '../../src/react/catalog-filter/catalog-filter';
import { catalogFilterSkeletonHtml } from '../../src/catalog-filter-skeleton';
import { mount, mountRoot, pending, settle } from './render';

function props(patch: Partial<CatalogFilterProps> = {}): CatalogFilterProps {
  return {
    tiers: { key: 'k', performers: [], studios: [] }, tiersPending: false, empty: false, tags: [], tagFirst: 0,
    views: [{ k: '', label: 'All', href: '/' }], state: '', count: { total: 0, shown: 0 }, trash: false,
    sorts: [], layout: null, refreshing: false, offscreen: false, combo: [], comboHidden: true, comboHost: null,
    actions: {
      openEntity: vi.fn(), setView: vi.fn(), toggleTag: vi.fn(), clearFilter: vi.fn(), clearAll: vi.fn(),
      setSort: vi.fn(), reshuffle: vi.fn(async () => {}), setLayout: vi.fn(), moreTops: vi.fn(async () => []),
    },
    helpers: { wireDrag: vi.fn(), wireScroller: vi.fn() },
    ...patch,
  };
}

const count = (host: HTMLElement, selector: string) => host.querySelectorAll(selector).length;

describe('Empty library', () => {
  it('Two avatar rows and the tag bar each lay a static placeholder row: no busy state, no pointer handlers, and excluded from screen readers', async () => {
    const host = await mount(<CatalogFilterPage {...props({ empty: true })} />);
    for (const kind of ['performer', 'studio']) {
      expect(count(host, `[data-catalog-placeholder="${kind}"]`)).toBe(EMPTY_SLOTS);
    }
    expect(count(host, '[data-catalog-placeholder="tag"] > span')).toBe(EMPTY_SLOTS);
    expect([...host.querySelectorAll('[data-catalog-placeholder]')].every((node) => node.getAttribute('aria-hidden') === 'true'))
      .toBe(true);
    // An empty library says 'something will live here eventually', not 'fetching now': no shimmer.
    expect(host.querySelector('[data-loading]')).toBeNull();
    expect(host.querySelector('[data-catalog-tier] [aria-busy="true"]')).toBeNull();
  });

  it('When collapsed the two avatar rows stay and the popover\'s two rows never paint', async () => {
    const host = await mount(<CatalogFilterPage {...props({ empty: true, offscreen: true })} />);
    expect(count(host, '[data-catalog-placeholder="performer"]')).toBe(EMPTY_SLOTS);
    expect(host.querySelector('[data-catalog-frame]')).toBeNull();
  });
});

describe('The first screen waits on two avatar rows', () => {
  beforeEach(() => localStorage.clear());
  const rows = (host: HTMLElement) => [...host.querySelectorAll('[data-catalog-tier]')].map((row) => row.getAttribute('data-catalog-tier'));

  it('With no local record or a broken one, both rows lay placeholders and the shell busy-states the whole block while fetching', async () => {
    for (const saved of [null, 'broken', 'null']) {
      if (saved !== null) localStorage.setItem(TIERS_SHAPE_KEY, saved);
      const host = await mount(<CatalogFilterPage {...props({ tiers: null, tiersPending: true })} />);
      expect(rows(host)).toEqual(['performers', 'studios']);
      expect(host.querySelector('[data-catalog-tiers]')?.getAttribute('aria-busy')).toBe('true');
      document.body.innerHTML = '';
    }
  });

  it('Pages that never fetch avatars and collapsed filter bars carry no busy state: no fetch pass would ever come to clear it', async () => {
    for (const patch of [{ tiersPending: false }, { tiersPending: true, offscreen: true }]) {
      const host = await mount(<CatalogFilterPage {...props({ tiers: null, ...patch })} />);
      expect(host.querySelector('[data-catalog-tiers]')?.hasAttribute('aria-busy'), JSON.stringify(patch)).toBe(false);
      document.body.innerHTML = '';
    }
  });

  it('Lays out by the last painted structure: an empty row from last time is not drawn, and with both rows empty the whole block takes no space', async () => {
    rememberTiers({ performers: false, studios: true });
    const studiosOnly = await mount(<CatalogFilterPage {...props({ tiers: null })} />);
    expect(rows(studiosOnly)).toEqual(['studios']);
    document.body.innerHTML = '';
    rememberTiers({ performers: false, studios: false });
    const none = await mount(<CatalogFilterPage {...props({ tiers: null })} />);
    expect(rows(none)).toEqual([]);
    expect(none.querySelector<HTMLElement>('[data-catalog-tiers]')?.hidden).toBe(true);
  });

  it('Busy state clears after fetch, noting which rows painted this time; with an empty library both placeholder rows count as painted', async () => {
    const { host, rerender } = await mountRoot(<CatalogFilterPage {...props({ tiers: null, tiersPending: true })} />);
    await rerender(<CatalogFilterPage {...props({ tiers: { key: 'k', performers: [], studios: [{ name: 'S1', logo: '', fallback: 'S1' }] } })} />);
    expect(host.querySelector('[data-catalog-tiers]')?.hasAttribute('aria-busy')).toBe(false);
    expect(rows(host)).toEqual(['studios']);
    expect(rememberedTiers()).toEqual({ performers: false, studios: true });
    await rerender(<CatalogFilterPage {...props({ empty: true })} />);
    expect(rememberedTiers()).toEqual({ performers: true, studios: true });
  });

  it('The shell skeleton before the island mounts reads the same record', () => {
    const skeleton = () => {
      const host = document.createElement('div');
      host.innerHTML = catalogFilterSkeletonHtml([{ k: '', label: 'All', href: '/' }], '');
      return host;
    };
    expect(rows(skeleton())).toEqual(['performers', 'studios']);
    rememberTiers({ performers: true, studios: false });
    expect(rows(skeleton())).toEqual(['performers']);
    rememberTiers({ performers: false, studios: false });
    const none = skeleton();
    expect(rows(none)).toEqual([]);
    expect(none.querySelector<HTMLElement>('[data-catalog-tiers]')?.hidden).toBe(true);
  });
});

describe('Count', () => {
  it('A shimmer shows while fetching; it collapses when the run fails, never leaving a shimmer spinning forever', async () => {
    const waiting = await mount(<CatalogFilterPage {...props({ count: null })} />);
    expect(count(waiting, '[data-skeleton="count"]')).toBe(1);
    document.body.innerHTML = '';
    const failed = await mount(<CatalogFilterPage {...props({ count: false })} />);
    expect(count(failed, '[data-skeleton="count"]')).toBe(0);
    expect(count(failed, '[data-count-readout]')).toBe(1);
    expect(failed.querySelector('[data-count-readout] [aria-busy="true"]')).toBeNull();
    expect(failed.querySelector('[data-catalog-readout]')?.textContent).toBe('');
  });
});

describe('Continuation', () => {
  it('Switching lists while the previous list\'s requested page is still in flight: the new list keeps paginating, and the old page does not enter the row once back', async () => {
    // One item per row never fills a line: with no overflow it keeps resting at the right end, and every draw asks for the next page.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000);
    const stale = pending<TierPerformer[]>();
    const moreTops = vi.fn<CatalogFilterProps['actions']['moreTops']>()
      .mockReturnValueOnce(stale.answer)
      .mockResolvedValueOnce([{ name: 'New two', ringHtml: '' }])
      .mockResolvedValue([]);
    const tiers = (key: string, name: string) => ({ key, performers: [{ name, ringHtml: '' }], studios: [] });
    const base = props();
    const page = (key: string, name: string) =>
      <CatalogFilterPage {...base} tiers={tiers(key, name)} actions={{ ...base.actions, moreTops }} />;
    const { host, rerender } = await mountRoot(page('old', 'Old one'));
    expect(moreTops).toHaveBeenCalledTimes(1);

    await rerender(page('new', 'New one'));
    await settle();
    await stale.release([{ name: 'Old two', ringHtml: '' }]);
    await settle();

    const names = [...host.querySelectorAll('[data-tier-performer]')].map((node) => node.getAttribute('data-entity-name'));
    expect(names).toEqual(['New one', 'New two']);
    expect(moreTops).toHaveBeenCalledTimes(3);
  });
});
