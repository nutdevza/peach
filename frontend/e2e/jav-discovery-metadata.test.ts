import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, settle, visit, VIEWPORTS } from './harness.ts';

describe('Discover details and sorting', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of VIEWPORTS) it(`${viewport.name}: profile polling fills in tags, five sorts, and stop/resume`, { timeout: 60000 }, async () => {
    const opened = await visit(browser, '/?jav=1', viewport);
    const { page } = opened;
    /* 每次请求记一笔：`list` 是推荐列表（只读，带打分），`progress` 是进度轮询，`control:*` 是起停。 */
    const requests: string[] = [];
    let details = 0, status = '', completed = false, polls = 0;
    const job = () => (status ? { job_id: 'fixed-batch', status, completed: completed ? 2 : 0, total: 2,
      failed: 0, requests: completed ? 4 : 0, bytes: 1000, message: status === 'stopped' ? 'Video profile fetching stopped' : '' } : null);
    const reply = () => ({ metadata_job: job(), ...(status === 'running' ? { poll_after_ms: 1000 } : {}) });
    try {
      await settle(page);
      await page.route('**/api/taste?*', route => route.fulfill({ json: { summary: { history_visits: 20 }, rankings: {} } }));
      await page.route('**/api/jav/detail?*', route => { details++; return route.fulfill({ json: {} }) });
      await page.route('**/api/jav/discoveries/metadata', route => {
        if (route.request().method() === 'POST') {
          const { action } = route.request().postDataJSON() as { action: string };
          requests.push(`control:${action}`);
          status = action === 'cancel' ? 'stopped' : completed ? 'complete' : 'running';
          polls = 0;
        } else {
          requests.push('progress');
          // 起任务后第二次轮询才读完：「停止读取」至少停留一个轮询间隔，负载高时也看得到。
          if (status === 'running' && ++polls >= 2) { status = 'complete'; completed = true }
        }
        return route.fulfill({ json: reply() });
      });
      await page.route('**/api/jav/discoveries?*', route => {
        const params = new URL(route.request().url()).searchParams;
        requests.push('list');
        assert.ok(!params.has('metadata_refresh') && !params.has('metadata_cancel'), 'The recommendation list is read-only; it never starts or stops tasks');
        const items = [777, 778].map((id, index) => ({ id, code: `DEMO-${id}`, title: 'Example recommendation', performers: '', studio: '',
          release_date: `2026-10-${20 + index}`, has_cover: false, cover_url: '', wanted: false,
          tags: completed ? ['Foot fetish'] : [], taste_score: index ? 0 : 0.004, ranking_score: index ? -0.02 : 0.003,
          source_score: completed ? 4.2 : null, reasons: ['Matching tags'], metadata_state: completed ? 'ready' : 'pending' }));
        if (params.get('direction') === 'asc') items.reverse();
        return route.fulfill({ json: { items, candidate_total: 2, limited: false,
          ranking_method: params.get('sort') === 'taste' ? 'mmr' : 'field-sort', ...reply() } });
      });
      await page.goto(new URL('/jav?tab=discover', page.url()).href);
      await page.getByRole('button', { name: 'Stop reading', exact: true }).waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-jav-filter]').getByRole('button', { name: 'My favorites', exact: true }).count(), 1);
      await page.locator('[data-catalog-tag="Foot fetish"]').waitFor({ state: 'visible' });
      assert.equal(details, 0);
      // 打开页面补读一次；读的过程中进度单独轮询，推荐列表只在打开时与读完后各取一次。
      assert.equal(requests.filter(kind => kind === 'control:start').length, 1);
      assert.ok(requests.includes('progress'));
      assert.ok(requests.filter(kind => kind === 'list').length <= 2, requests.join(','));
      const cards = page.locator('[data-jav-card]');
      assert.equal(await cards.first().locator('[data-jav-taste-score]').textContent(), 'Explore');
      const score = cards.first().getByRole('button', { name: 'Recommendation score 0, explore', exact: true });
      await score.scrollIntoViewIfNeeded();
      await score.focus();
      await page.getByRole('tooltip').filter({ hasText: 'Taste 0.004 · sort 0.003 · source rating 4.2 / 5' }).waitFor({ state: 'visible' });
      const otherScore = cards.last().getByRole('button', { name: 'Recommendation score 0, explore', exact: true });
      await otherScore.scrollIntoViewIfNeeded();
      await otherScore.focus();
      await page.getByRole('tooltip').filter({ hasText: 'Taste 0.000 · Sort -0.020' }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Sort by taste match', exact: true }).focus();
      assert.equal(await cards.first().getByRole('button', { name: 'Foot fetish', exact: true }).count(), 1);
      for (const [sort, name, direction] of [
        ['source_score', 'Sort by source rating', 'desc'], ['duration', 'Sort by duration', 'desc'],
        ['code', 'Sort by code', 'asc'], ['release_date', 'Sort by release date', 'desc'], ['taste', 'Sort by taste match', 'desc'],
      ]) {
        await Promise.all([page.getByRole('button', { name, exact: true }).click(),
          page.waitForResponse(response => { const params = new URL(response.url()).searchParams;
            return response.url().includes('/api/jav/discoveries?') && params.get('sort') === sort && params.get('direction') === direction })]);
        assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
      }
      await page.getByRole('button', { name: 'Sort by taste match', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-jav-card] h3')?.textContent?.startsWith('DEMO-778'));
      completed = false; status = 'running';
      await page.getByRole('button', { name: 'Update details', exact: true }).click();
      await page.getByRole('button', { name: 'Stop reading', exact: true }).click();
      await page.getByText('Video profile fetching stopped', { exact: true }).waitFor({ state: 'visible' });
      const count = requests.length;
      await page.waitForTimeout(2200);
      assert.equal(requests.length, count, 'No auto restart or polling after stop');
      completed = true;
      await page.getByRole('button', { name: 'Retry reading video details now', exact: true }).click();
      await page.getByRole('button', { name: 'Update details', exact: true }).waitFor({ state: 'visible' });
      await settle(page);
      assert.equal(details, 0);
      const geometry = await layout(page);
      assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1);
      assert.deepEqual(opened.problems.filter(line => !line.includes('/api/links/check')), []);
    } finally { await opened.close() }
  });
});
