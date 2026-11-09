import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { followSource, openFollowManage } from './design-fixture.ts';
import { launch, VIEWPORTS } from './harness.ts';

describe('Retry sources with failed follows', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of VIEWPORTS) it(`${viewport.name}: retries only enabled failed sources and hides the entry once one succeeds`, async () => {
    const paused = { ...followSource(5, 'paused', 'Kemono', 'paused', 'error'), enabled: false };
    const opened = await openFollowManage(browser, viewport, { extra: [
      followSource(4, 'login', 'FANBOX', 'login', 'unauthorized'), paused,
    ] });
    try {
      const page = opened.page;
      const requests: unknown[] = [];
      let started = false;
      const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      await page.route('**/api/follow/check', route => {
        if (route.request().method() === 'POST') {
          requests.push(route.request().postDataJSON());
          started = true;
          return route.fulfill(json({ status: 'running', job_id: 'retry', total: 2, checked: 0 }));
        }
        return route.fulfill(json(started ? { status: 'complete', job_id: 'retry', total: 2, checked: 2,
          results: [{ source: 3, ok: true }, { source: 4, ok: true }] } : { status: 'idle' }));
      });
      await page.route('**/api/follow?summary=1', route => started ? route.fulfill(json({
        sources: [followSource(1, 'kou', 'Kemono', 'kou'), paused], counts: {}, author_aliases: [], suggestions: [],
      })) : route.fallback());
      const retry = page.getByRole('button', { name: 'Check failed items', exact: true });
      await retry.waitFor();
      await retry.focus();
      await retry.press('Enter');
      await retry.waitFor({ state: 'hidden', timeout: 15_000 });
      assert.deepEqual(requests, [{ background: true, sources: [3, 4] }]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('button', { name: 'Check all', exact: true }).waitFor();
    } finally { await opened.close() }
  });
});
