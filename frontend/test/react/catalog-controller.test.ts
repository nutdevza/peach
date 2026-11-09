import { describe, expect, it } from 'vitest';

import { CatalogController } from '../../src/react/catalog-grid/catalog-controller';

describe('Grid generation and landing wait', () => {
  it('The first screen provides an abort signal, and after landing same-page filters only update props', async () => {
    const controller = new CatalogController();
    const first = controller.begin('/', false);
    expect(first.mount).toBe(true); expect(first.signal?.aborted).toBe(false);
    expect(controller.taken(false)).toBe(true);
    controller.settle(first.revision); await first.settled; first.finish(true);
    const second = controller.begin('/', true);
    expect(second.mount).toBe(false); expect(second.signal).toBeNull();
    expect(controller.pending).toBe(false); expect(controller.taken(true)).toBe(true);
    controller.settle(second.revision); await second.settled;
  });

  it('Consecutive first-screen filters cancel the old prefetch; old callbacks must not let a new generation through', async () => {
    const controller = new CatalogController();
    const old = controller.begin('/', false), latest = controller.begin('/', false);
    let latestSettled = false; void latest.settled.then(() => { latestSettled = true; });
    expect(old.signal?.aborted).toBe(true); expect(old.isCurrent()).toBe(false);
    expect(latest.isCurrent()).toBe(true); await old.settled;
    old.finish(false); controller.settle(old.revision); await Promise.resolve();
    expect(latestSettled).toBe(false); expect(controller.pending).toBe(true);
    controller.settle(latest.revision); await latest.settled; latest.finish(true);
    expect(latestSettled).toBe(true); expect(controller.pending).toBe(false);
  });

  it('Switching to the junk queue cancels the catalog epoch, and a reopen is required even when the old container is mounted', async () => {
    const controller = new CatalogController(), catalog = controller.begin('/', false);
    const junk = controller.begin('/junk-files', true);
    expect(junk.mount).toBe(true); expect(controller.page).toBe('/junk-files');
    expect(catalog.signal?.aborted).toBe(true); await catalog.settled;
    controller.settle(catalog.revision);
    expect(junk.isCurrent()).toBe(true);
    controller.settle(junk.revision); await junk.settled;
  });

  it('Leaving the page releases the wait and cancels prefetches, and the epoch keeps growing after re-entry', async () => {
    const controller = new CatalogController(), first = controller.begin('/', false);
    controller.clear(); await first.settled;
    expect(first.signal?.aborted).toBe(true); expect(first.isCurrent()).toBe(false);
    expect(controller.taken(false)).toBe(false); expect(controller.page).toBe('');
    const next = controller.begin('/', false);
    expect(next.revision).toBeGreaterThan(first.revision); expect(next.isCurrent()).toBe(true);
    controller.clear(); await next.settled;
  });

  it('A failed first screen releases its own wait; an old failure does not affect the current prefetch', async () => {
    const controller = new CatalogController(), first = controller.begin('/', false);
    first.finish(false); await first.settled;
    expect(controller.pending).toBe(false);
    const next = controller.begin('/', false);
    first.finish(false);
    expect(controller.pending).toBe(true);
    next.finish(false); await next.settled;
    expect(controller.pending).toBe(false);
  });

  it('Every stale wait in quick filters has an endpoint; an unknown future generation must not let the current screen through', async () => {
    const controller = new CatalogController(), obsolete: Promise<void>[] = [];
    for (let i = 0; i < 50; i++) obsolete.push(controller.begin('/', false).settled);
    let settled = false; const latest = controller.begin('/', false);
    void latest.settled.then(() => { settled = true; });
    await Promise.all(obsolete);
    controller.settle(latest.revision + 1); await Promise.resolve();
    expect(settled).toBe(false);
    controller.clear(); await latest.settled; expect(settled).toBe(true);
  });
});
