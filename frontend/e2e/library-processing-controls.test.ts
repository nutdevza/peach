import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, requiredEnv, settle, visit, VIEWPORTS } from './harness.ts';

// 'No preview yet' only means the image has not been generated; the media still reuses the valid short clip the test service provides.
const itemId = Number(requiredEnv('PEACH_E2E_ITEM'));

describe('Scan and scrape controls', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser?.close() });
  for (const viewport of VIEWPORTS) it(`${viewport.name}: slow items are skippable, the hint wraps with space, and window dragging is kept`, async () => {
    let state = { status: 'running', job_id: 'skip-preview', checked: 0, total: 2,
      current_asset_id: 1, current_asset_name: 'Video Alpha.mp4', current_action: 'querying_metadata',
      current_source: { key: 'javdb', label: 'JavDB' }, waited_seconds: 130 };
    const opened = await visit(browser, '/data-cleanup#libraryProcessing', viewport, async page => {
      await page.route('**/api/library-processing{,?*}', async route => {
        if (route.request().method() === 'POST') {
          assert.deepEqual(route.request().postDataJSON(), { action: 'skip_current', job_id: 'skip-preview', asset_id: 1 });
          state = { ...state, checked: 1, current_asset_id: 2, current_asset_name: 'Video Beta.mp4', waited_seconds: 0 };
        }
        await route.fulfill({ json: state });
      });
    });
    const { page } = opened;
    try {
      const dock = page.locator('[data-processing-dock]');
      await dock.getByRole('button', { name: 'Skip this one', exact: true }).waitFor();
      assert.equal(await dock.locator('xpath=ancestor::*[@data-sonner-toast]').getAttribute('data-dismissible'), 'false');
      const row = page.locator('[data-note-layout]').filter({ hasText: 'JavDB is very slow to return details' }).first();
      const boxes = await row.evaluate(node => ({ text: node.firstElementChild!.getBoundingClientRect().toJSON(),
        action: node.querySelector('[data-note-action]')!.getBoundingClientRect().toJSON() }));
      if (!viewport.mobile) assert.ok(Math.abs(boxes.text.y + boxes.text.height / 2 - boxes.action.y - boxes.action.height / 2) < 2);
      const box = await dock.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + 80, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x - 60, box.y + 20);
      await page.mouse.up();
      assert.ok(await dock.isVisible());
      await dock.getByRole('button', { name: 'Skip this one', exact: true }).click();
      await dock.getByText(/作品乙/).waitFor();
      assert.ok(await dock.isVisible());
      assert.equal(await dock.getByRole('button', { name: 'Skip this one', exact: true }).count(), 0);
      assert.ok((await layout(page)).scrollWidth <= viewport.width);
    } finally { await opened.close() }
  });
  it('Phone: when the task card, corner mini window, and receipt do not fit, collapse the task details first; tapping expand still honors it', async () => {
    const viewport = VIEWPORTS.find(entry => entry.mobile)!;
    const state = { status: 'failed', job_id: 'crowded-preview', checked: 3, total: 9, completed_at: Date.now() / 1000,
      error: '115 mount read timed out; 3 files were not scanned',
      steps: [{ id: 'scan', label: 'Scan files', status: 'complete' }, { id: 'metadata', label: 'Collect video details', status: 'current' },
        { id: 'preview', label: 'Generate previews and covers', status: 'pending' }] };
    // The mini window is hung in the stage: it only exists once a detail has been entered.
    const opened = await visit(browser, `/assets/${itemId}`, viewport, async page => {
      await page.route('**/api/library-processing{,?*}', route => route.fulfill({ json: state }));
    });
    const { page } = opened;
    try {
      const dock = page.locator('#toasts [data-processing-dock]');
      const toggle = dock.locator('[data-processing-toggle]');
      await dock.waitFor();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      // A mini window that isn't playing has no frame holding its height; here it's set to the real mini window's height on a phone so the three layers genuinely don't fit.
      await page.locator('#miniplayer').evaluate(node => {
        (node as HTMLElement).style.height = '460px'; (node as HTMLElement).hidden = false;
      });
      await page.evaluate(async () => {
        const entry = '/dist/peach-app.js';
        const ui = await import(entry);
        ui.showToast(document.getElementById('toasts'), { success: '<svg/>', error: '<svg/>' },
          'crowded-preview', { html: 'Check failed: the source cannot be reached right now; please retry later.', alert: true, timeout: Infinity, action: null });
      });
      await page.waitForFunction(() => document.querySelector('[data-processing-toggle]')?.getAttribute('aria-expanded') === 'false');
      await settle(page, '#toasts [data-processing-dock]');
      const boxes = await page.evaluate(() => [...document.querySelectorAll('#toasts [data-sonner-toast], #miniplayer')]
        .map(node => node.getBoundingClientRect().toJSON()));
      for (const box of boxes) assert.ok(box.top >= 0 && box.bottom <= viewport.height, JSON.stringify(boxes));
      // Details are only tucked away to free space; they are not written into the session's collapse record.
      assert.equal(await page.evaluate(() => sessionStorage.getItem('peach.library-processing.collapsed')), null);
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    } finally { await opened.close() }
  });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: popovers for hide, refresh, resume, and new task`, async () => {
      let state = { status: 'running', job_id: 'visibility-first', checked: 2, total: 10 };
      const writes: string[] = [];
      const opened = await visit(browser, '/data-cleanup', viewport, async page => {
        await page.route('**/api/library-processing{,?*}', async route => {
          if (route.request().method() !== 'GET') writes.push(route.request().method());
          await route.fulfill({ json: state });
        });
      });
      const { page } = opened;
      const dock = page.locator('[data-processing-dock]');
      const restore = page.getByRole('button', { name: 'Show the progress overlay', exact: true });
      try {
        await dock.getByRole('button', { name: 'Hide the task notice', exact: true }).click();
        await dock.waitFor({ state: 'hidden' });
        await restore.waitFor();
        state = { ...state, status: 'paused', checked: 5 };
        await page.reload();
        await restore.waitFor();
        assert.equal(await dock.count(), 0);
        await restore.click();
        await dock.waitFor();
        await dock.getByText('Scanning and collection paused', { exact: true }).waitFor();
        await dock.getByRole('button', { name: 'Hide the task notice', exact: true }).click();
        await dock.waitFor({ state: 'hidden' });
        state = { ...state, status: 'running', job_id: 'visibility-next' };
        await dock.waitFor();
        const current = await layout(page);
        assert.ok(current.scrollWidth <= current.viewportWidth, JSON.stringify(current));
        assert.deepEqual(writes, []);
      } finally { await opened.close() }
    });

    it(`${viewport.name}: resource hints, rough estimates, mode switching, and pause/resume`, async () => {
      let state = { status: 'idle', job_id: '', checked: 0, total: 100, speed_mode: 'standard',
        steps: [{ id: 'sources', label: 'Scan files', status: 'complete' },
          { id: 'collect', label: 'Collect external profiles and covers', status: 'current' }],
        current_asset_name: '', current_action: '', stage: '',
        stalled: false, waited_seconds: 0,
        traffic: { used_bytes: 0, estimated_min_bytes: 1048576, estimated_max_bytes: 8388608,
          disk: { estimated_bytes: 2097152, temporary_bytes: 1048576, can_fit: false, cache_unknown: true,
            volumes: [{ path:'C:\\', labels:['Preview and cover','Video details','Temporary files'], free_bytes:1048576,
              estimated_bytes:2097152, temporary_bytes:1048576, reserve_bytes:1073741824,
              required_bytes:1076887552, shortfall_bytes:1075838976, can_fit:false }] },
          workload: { video_files: 200, jav_files: 60, jav_titles: 40 },
          estimated_bytes: 6291456, metered_estimated_bytes: 3145728,
          metered_used_bytes: 0, metered_estimated_min_bytes: 0, metered_estimated_max_bytes: 4194304,
          partial: true, unknown_files: true,
          sources: [{ key: 'drive-a', label: 'Sample cloud drive A', root: 'A:\\Media', location: '115', metered: true,
            used_bytes: 0, estimated_bytes: 3145728, estimated_min_bytes: 0, estimated_max_bytes: 4194304, unobserved: ['Mount caches and readahead unobserved'] },
          { key: 'drive-b', label: 'Sample cloud drive B', root: 'B:\\Media', location: 'pikpak', metered: false,
            used_bytes: 0, estimated_bytes: 3145728, estimated_min_bytes: 1048576, estimated_max_bytes: 4194304, unobserved: ['Mount caches and readahead unobserved'] }] },
        eta_kind: 'historical', eta_initial: true, eta_seconds_min: 1200, eta_seconds_max: 2400 };
      const writes: Record<string, unknown>[] = [];
      let inventoryComplete = false;
      let inventoryReads = 0;
      const opened = await visit(browser, '/data-cleanup', viewport, async page => {
        await page.route('**/api/library-processing{,?*}', async route => {
          const url = new URL(route.request().url());
          if (url.searchParams.has('estimate')) {
            assert.equal(url.searchParams.get('incremental'), '1');
            inventoryReads += 1;
            await route.fulfill({ json: { traffic: { ...state.traffic,
              workload: inventoryComplete ? state.traffic.workload : { video_files: 10, jav_files: 3, jav_titles: 2 },
              inventory: inventoryComplete ? { complete: true, errors: 0 } : { complete: false, errors: 0, token: 'inventory' } } } });
            return;
          }
          if (route.request().method() === 'POST') {
            const body = route.request().postDataJSON();
            writes.push(body);
            if (body.action === 'pause') state.status = 'pausing';
            else if (body.action === 'resume') state = { ...state, status: 'running', eta_initial: false,
              eta_kind: 'measured', eta_seconds_min: 600, eta_seconds_max: 900 };
            else if (body.action === 'set_speed') state.speed_mode = body.speed_mode;
            else state = { ...state, status: 'running', job_id: 'controlled', speed_mode: body.speed_mode,
              checked: 38, current_asset_name: 'Sample video.mp4', current_action: 'querying_metadata', stage: 'Scrape missing profiles' };
          }
          await route.fulfill({ json: state });
        });
      });
      const { page } = opened;
      const card = page.getByRole('region', { name: 'Scan and scrape', exact: true });
      const artifacts = path.resolve('..', 'build', 'agent-verification', 'processing-controls');
      await mkdir(artifacts, { recursive: true });
      try {
        await card.waitFor();
        await settle(page);
        assert.equal(await card.locator('[data-processing-controls]').count(), 0);
        assert.equal(await card.getByRole('button', { name: 'Sync new files', exact: true }).locator('svg').count(), 0);
        await card.getByRole('button', { name: 'More sync options', exact: true }).click();
        const menu = page.getByRole('dialog', { name: 'Sync method', exact: true });
        assert.equal(await menu.locator('svg').count(), 0);
        assert.equal(await menu.getByRole('button').count(), 7);
        assert.equal(await menu.getByRole('group', { name: 'Routine sync', exact: true }).getByRole('button').count(), 2);
        assert.equal(await menu.getByRole('group', { name: 'Library maintenance', exact: true }).getByRole('button').count(), 5);
        for (const label of ['Discover new files only', 'Complete pending videos', 'Sync all libraries', 'Scan files only', 'Complete details and previews', 'Complete video details only', 'Complete preview images only']) {
          await menu.getByText(label, { exact: true }).waitFor();
        }
        await menu.getByText('Generates the nine-grid for videos already in the library, skipping traffic-protected folders', { exact: true }).waitFor();
        await menu.screenshot({ path: path.join(artifacts, `${viewport.name}-processing-menu.png`) });
        await menu.press('Escape');
        await card.getByRole('button', { name: 'Sync new files', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Sync new files', exact: true });
        await dialog.waitFor();
        await dialog.getByRole('region', { name: 'Disk estimate' }).waitFor();
        const columns = await dialog.locator('[aria-label="Traffic estimate"], [aria-label="Disk estimate"]').evaluateAll(elements =>
          elements.map(element => { const r = element.getBoundingClientRect(); return { top:r.top,left:r.left,right:r.right } }));
        assert.equal(columns.length, 2);
        assert.ok(Math.abs(columns[0].top - columns[1].top) < 1, JSON.stringify(columns));
        assert.ok(columns[1].left >= columns[0].right, JSON.stringify(columns));
        await dialog.getByText('Cloud drive cache usage pending confirmation', { exact: true }).waitFor();
        assert.match(await dialog.innerText(), /空间不足，还差/);
        assert.match(await dialog.innerText(), /可能让电脑变慢/);
        assert.equal(writes.length, 0);
        const modalLayout = await layout(page);
        assert.ok(modalLayout.scrollWidth <= modalLayout.viewportWidth, JSON.stringify(modalLayout));
        assert.deepEqual(modalLayout.offenders, []);
        await dialog.getByText('Discovering new files; counts and estimates may still change…', { exact: true }).waitFor();
        assert.equal(await dialog.getByRole('button', { name: 'Sync new files', exact: true }).isEnabled(), true);
        await dialog.getByText('Found 10 videos', { exact: true }).waitFor();
        const libraryLink = dialog.getByRole('link', { name: 'Manage libraries', exact: true });
        assert.equal(await libraryLink.getAttribute('href'), '/settings/library');
        const footerOrder = await dialog.locator('.geist-modal-footer').evaluate(el => {
          const link = el.querySelector('a')!.getBoundingClientRect();
          const confirm = el.querySelector('[data-modal-confirm]')!.getBoundingClientRect();
          return link.left < confirm.left && Math.abs((link.top + link.bottom) / 2 - (confirm.top + confirm.bottom) / 2) < 1;
        });
        assert.equal(footerOrder, true, 'Manage libraries and the primary button center on one line at the bottom right');
        await libraryLink.click();
        await page.waitForURL('**/settings/library');
        assert.equal(await page.getByRole('dialog', { name: 'Sync new files', exact: true }).count(), 0);
        const inventoryAtClose = inventoryReads;
        await page.waitForTimeout(600);
        assert.equal(inventoryReads, inventoryAtClose);
        assert.equal(writes.length, 0);
        await page.goto(new URL('/data-cleanup', page.url()).href);
        await card.waitFor();
        await card.getByRole('button', { name: 'Sync new files', exact: true }).click();
        await dialog.getByText('Discovering new files; counts and estimates may still change…', { exact: true }).waitFor();
        inventoryComplete = true;
        await dialog.getByText('Estimated traffic', { exact: true }).waitFor();
        await dialog.getByText('60 JAV files · 40 distinct codes', { exact: true }).waitFor();
        const centering = await dialog.locator('.processing-effort-panel').evaluate(el => {
          const panel = el.getBoundingClientRect();
          const modal = el.closest('dialog')!.getBoundingClientRect();
          return Math.abs((panel.left + panel.right) / 2 - (modal.left + modal.right) / 2);
        });
        assert.ok(centering < 1, `The processing intensity panel is ${centering}px off center`);
        const footer = await dialog.locator('.geist-modal-footer').evaluate(el => ({ display: getComputedStyle(el).display, padding: getComputedStyle(el).padding }));
        assert.equal(footer.display, 'flex');
        assert.notEqual(footer.padding, '0px');
        const disclosure = dialog.getByRole('button', { name: /^(查看|收起)明细$/ });
        assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
        assert.equal(await disclosure.locator('svg').count(), 1);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await dialog.getByText('View details', { exact: true }).click();
        assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
        const sources = dialog.locator('[data-processing-traffic] li');
        assert.match(await sources.nth(0).innerText(), /示例网盘 A[\s\S]*代理/);
        assert.match(await sources.nth(1).innerText(), /示例网盘 B[\s\S]*直连/);
        assert.equal(await sources.locator('svg, img').count(), 2);
        const modalBody = dialog.locator('.ui-geist-modal-body');
        assert.equal(await modalBody.getAttribute('data-overlay-scrollbar'), 'true');
        assert.equal(await dialog.evaluate(el => getComputedStyle(el).overflowY), 'hidden');
        assert.equal(await sources.first().evaluate(el => getComputedStyle(el.parentElement!).overflowY), 'visible',
          'The confirm dialog\'s details must not nest vertical scrolling');
        const frame = () => dialog.locator('.ui-geist-modal-header,.geist-modal-footer').evaluateAll(parts =>
          parts.map(part => { const box = part.getBoundingClientRect(); return [box.top, box.bottom] }));
        const stationary = await frame();
        await modalBody.evaluate(el => { el.scrollTop = el.scrollHeight });
        assert.deepEqual(await frame(), stationary, 'The title or action bar moves while the body scrolls');
        await modalBody.evaluate(el => { el.scrollTop = 0 });
        assert.equal((await dialog.innerText()).includes('Unobserved'), false);
        assert.match(await dialog.innerText(), /约 6MB/);
        await disclosure.click();
        assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
        assert.equal(await sources.first().isVisible(), false);
        await disclosure.click();
        assert.equal(await sources.first().isVisible(), true);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const startupSlider = dialog.getByRole('slider');
        await startupSlider.press('End');
        await dialog.screenshot({ path: path.join(artifacts, `${viewport.name}-high-startup.png`) });
        await startupSlider.press('Home');
        await dialog.screenshot({ path: path.join(artifacts, `${viewport.name}-startup.png`) });
        await dialog.getByRole('button', { name: 'Sync new files', exact: true }).click();
        await card.getByText('About 20-40 minutes remaining (rough estimate)', { exact: true }).waitFor();
        assert.deepEqual(writes[0], { incremental: true, speed_mode: 'low' });
        const dock = page.locator('#toasts [data-processing-dock]');
        await dock.locator('[data-processing-traffic]').waitFor();
        state.traffic = { ...state.traffic, used_bytes: 2097152, metered_used_bytes: 1048576,
          estimated_min_bytes: 2097152, metered_estimated_min_bytes: 1048576, unknown_files: false,
          sources: state.traffic.sources.map(source => ({ ...source, used_bytes: 1048576, estimated_min_bytes: 1048576 })) };
        await dock.getByText('~2MB', { exact: true }).waitFor();
        const pause = dock.getByRole('button', { name: 'Paused', exact: true });
        assert.equal(await pause.innerText(), '');
        assert.equal(await pause.locator('svg').count(), 1);
        await dock.getByRole('button', { name: 'Paused', exact: true }).click();
        await dock.getByText('Pausing; it pauses once the current step ends', { exact: true }).waitFor();
        state.status = 'paused';
        const resume = dock.getByRole('button', { name: 'Continue', exact: true });
        await resume.waitFor();
        assert.equal(await resume.innerText(), '');
        assert.equal(await resume.locator('svg').count(), 1);
        const occupied = card.getByRole('button', { name: 'Sync new files', exact: true });
        assert.equal(await occupied.getAttribute('aria-disabled'), 'true');
        // When a task hasn't ended, tapping sync doesn't send a request, but explain why it didn't start. Playwright treats aria-disabled as unclickable, and keypresses often land on
        // Outside the viewport or under the progress floating window, dispatch the click directly on the key: it still passes through the capture phase of the shared busy intercept.
        const sent = writes.length;
        await occupied.dispatchEvent('click');
        await page.locator('#toasts [data-sonner-toast]').filter({ hasText: 'The current scan and collect task has not finished yet' }).waitFor();
        assert.equal(writes.length, sent);
        // Same icon as cancel in the task center; confirm first; clicking “Cancel” in the confirmation box sends no request.
        const cancelTask = dock.getByRole('button', { name: 'Cancel task', exact: true });
        assert.equal(await cancelTask.innerText(), '');
        await cancelTask.click();
        const confirm = page.getByRole('alertdialog', { name: 'Cancel task “Scan and collect”', exact: true });
        await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
        await confirm.waitFor({ state: 'hidden' });
        assert.equal(writes.length, sent);
        state = { ...state, trigger: 'cli' };
        await page.reload();
        await resume.waitFor();
        await occupied.dispatchEvent('click');
        await page.locator('#toasts [data-sonner-toast]')
          .filter({ hasText: 'The current scan and collect task (started from the command line or tray) has not finished' }).waitFor();
        const lowSpeed = dock.getByRole('button', { name: 'Processing speed: low footprint' });
        assert.equal(await lowSpeed.innerText(), 'Low usage');
        assert.equal(await lowSpeed.locator('use[href="#i-snail"]').count(), 1);
        await dock.getByRole('button', { name: 'Processing speed: low footprint' }).click();
        const effort = page.getByRole('dialog', { name: 'Processing speed', exact: true });
        const scale = effort.locator('.processing-effort-scale');
        const assertSelectedSpeed = async (expected: number) => {
          const marks = await scale.locator(':scope > span').evaluateAll(elements => elements.map(el => ({
            selected: el.hasAttribute('data-selected'), color: getComputedStyle(el).color,
            iconColor: getComputedStyle(el.querySelector('svg')!).color,
          })));
          assert.deepEqual(marks.map(mark => mark.selected), [0, 1, 2].map(index => index === expected));
          assert.ok(marks.every(mark => mark.iconColor === mark.color));
          assert.ok(marks.every((mark, index) => index === expected || mark.color !== marks[expected]!.color));
        };
        await assertSelectedSpeed(0);
        assert.deepEqual(await scale.locator(':scope > span').allTextContents(), ['Slowest', 'Standard', 'Fastest']);
        assert.deepEqual(await scale.locator(':scope > span').evaluateAll(marks => marks.map(mark => mark.querySelectorAll('svg > use, svg > path').length)), [1, 1, 2]);
        const scaleLayout = await scale.evaluate(el => {
          const marks = [...el.children].map(mark => mark.getBoundingClientRect());
          const track = el.parentElement!.querySelector('.processing-effort-track')!.getBoundingClientRect();
          return { above: marks.every(mark => mark.bottom <= track.top),
            centered: Math.abs((marks[1]!.left + marks[1]!.right) / 2 - (track.left + track.right) / 2) < 1 };
        });
        assert.deepEqual(scaleLayout, { above: true, centered: true });
        assert.equal((await effort.innerText()).match(/低占用/g)?.length, 1);
        await effort.screenshot({ path: path.join(artifacts, `${viewport.name}-effort-low.png`) });
        await effort.getByRole('slider').press('ArrowRight');
        await dock.getByRole('button', { name: 'Processing speed: standard' }).waitFor();
        const standardSpeed = dock.getByRole('button', { name: 'Processing speed: standard' });
        assert.equal(await standardSpeed.innerText(), 'Standard');
        assert.equal(await standardSpeed.locator('use[href="#i-zap"]').count(), 1);
        await assertSelectedSpeed(1);
        await effort.screenshot({ path: path.join(artifacts, `${viewport.name}-effort-standard.png`) });
        await effort.press('Escape');
        await resume.click();
        await card.getByText('About 10-15 minutes remaining', { exact: true }).waitFor();
        assert.ok(writes.some(body => body.action === 'pause' && body.job_id === 'controlled'));
        assert.ok(writes.some(body => body.action === 'resume' && body.job_id === 'controlled'));
        assert.ok(writes.some(body => body.action === 'set_speed' && body.speed_mode === 'standard'));
        // The sync entry stays busy for the duration of the background task; this only waits for a bounded set of control requests to finish.
        await settle(page, 'section[aria-label="Scan and scrape"] [data-processing-traffic]');
        const measured = await layout(page);
        assert.ok(measured.scrollWidth <= measured.viewportWidth, JSON.stringify(measured));
        assert.deepEqual(measured.offenders, []);
        await page.screenshot({ path: path.join(artifacts, `${viewport.name}-page.png`), fullPage: true });
        await card.screenshot({ path: path.join(artifacts, `${viewport.name}.png`) });
        await page.route(url => url.pathname === '/api/items', route => route.fulfill({ json: {
          items: [{ id: itemId, name: 'Local video with no preview.mp4', medium: 'video', location: 'local',
            has_thumb: false, has_local_poster: false, size: 12345, duration: 3600 }],
          total: 1, has_more: false,
        } }));
        await page.goto(new URL('/', page.url()).href);
        const completion = page.locator('[data-library-completion]');
        await completion.getByText(/1 部暂无预览，当前任务结束后可单独补全/).waitFor();
        const complete = completion.getByRole('button', { name: 'Sync these videos', exact: true });
        assert.equal(await complete.getAttribute('aria-disabled'), 'true');
        const writesBefore = writes.length;
        await complete.dispatchEvent('click');
        await completion.getByRole('button', { name: 'More sync options', exact: true }).dispatchEvent('click');
        assert.equal(await completion.getByRole('button', { name: 'More sync options', exact: true }).getAttribute('aria-expanded'), 'false');
        assert.equal(writes.length, writesBefore, 'Completion tasks cannot be appended or replaced while running');
        await dock.getByRole('button', { name: 'Paused', exact: true }).waitFor();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await dock.getByText('View details', { exact: true }).click();
        assert.equal(await dock.getByRole('button', { name: 'Collapse details', exact: true }).getAttribute('aria-expanded'), 'true');
        const expandedHeight = (await dock.boundingBox())!.height;
        const noticeMotion = await dock.evaluate(el => ({
          frame: getComputedStyle(el.querySelector('[data-processing-body]')!).transitionProperty,
          arrow: getComputedStyle(el.querySelector('[data-processing-toggle] > svg')!).transitionProperty,
          arrowDuration: getComputedStyle(el.querySelector('[data-processing-toggle] > svg')!).transitionDuration,
        }));
        assert.ok(noticeMotion.frame.includes('height'));
        assert.equal(noticeMotion.arrow, 'transform');
        assert.notEqual(noticeMotion.arrowDuration, '0s');
        await dock.getByRole('button', { name: 'Collapse task details' }).click();
        // After collapsing, only the title and file count remain: estimates, the detail toggle, speed, and entry points all fold away.
        await dock.getByText('View details', { exact: true }).waitFor({ state: 'hidden' });
        await dock.getByRole('link', { name: 'Task details' }).waitFor({ state: 'hidden' });
        assert.equal(await dock.locator('[data-processing-traffic] section').first().isVisible(), false);
        assert.ok((await dock.boundingBox())!.height < expandedHeight);
        await dock.getByRole('button', { name: 'Expand task details' }).click();
        assert.equal(await dock.getByRole('button', { name: 'View details', exact: true }).getAttribute('aria-expanded'), 'false');
        await dock.getByRole('button', { name: 'Collapse task details' }).click();
        assert.equal(await dock.locator('[data-processing-toggle] > svg').evaluate(el => {
          el.getAnimations().forEach(animation => animation.finish());
          return getComputedStyle(el).transform;
        }), 'matrix(-1, 0, 0, -1, 0, 0)', 'The bottom-docked task face expands upward with the arrow pointing up when collapsed');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await dock.locator('[data-processing-body]').evaluate(el => getComputedStyle(el).transitionProperty), 'none');
        assert.equal(await dock.locator('[data-processing-traffic]').isVisible(), true);
        // The details area and estimate area collapse together; wait for the collapse transition to finish before measuring.
        await settle(page, '#toasts [data-processing-dock]');
        const fixed = await dock.boundingBox();
        await dock.hover();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(500);
        const hovered = await dock.boundingBox();
        await page.mouse.move(1, 1);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        const unhovered = await dock.boundingBox();
        assert.ok(fixed && hovered && unhovered);
        assert.ok(Math.abs(fixed.y - hovered.y) < 1 && Math.abs(fixed.y - unhovered.y) < 1,
          `After collapsing details, scrolling and hover keep the task card in place: ${JSON.stringify({ fixed, hovered, unhovered })}`);
        await dock.getByRole('button', { name: 'Expand task details' }).click();
        await dock.getByRole('button', { name: 'Processing speed: standard' }).click();
        const speed = page.getByRole('dialog', { name: 'Processing speed', exact: true });
        await speed.getByRole('slider').press('End');
        await dock.getByRole('button', { name: 'Processing speed: full speed' }).waitFor();
        const highSpeed = dock.getByRole('button', { name: 'Processing speed: full speed' });
        assert.equal(await highSpeed.innerText(), 'Full speed');
        assert.equal(await highSpeed.locator('svg > use[href="#i-zap"]').count(), 1);
        await assertSelectedSpeed(2);
        const theme = await page.evaluate(() => ({ value: document.documentElement.dataset.theme,
          dark: document.documentElement.classList.contains('dark') }));
        for (const dark of [false, true]) {
          await page.evaluate(dark => { document.documentElement.dataset.theme = dark ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', dark) }, dark);
          for (const hovered of [false, true]) {
            if (hovered) await highSpeed.hover();
            else await page.mouse.move(1, 1);
            const paint = await highSpeed.evaluate(el => ({
              rear: getComputedStyle(el.querySelector('.processing-effort-double > path')!).fill,
              foreground: getComputedStyle(el.querySelector('.processing-effort-double > use:last-child')!).fill }));
            assert.equal(paint.foreground, 'none', 'The front bolt\'s interior is transparent, fitting the current surface');
            assert.equal(paint.rear, 'none', 'The back bolt\'s interior is transparent, fitting the current surface');
          }
          await highSpeed.screenshot({ path: path.join(artifacts, `${viewport.name}-double-lightning-${dark ? 'dark' : 'light'}.png`) });
        }
        await page.mouse.move(1, 1);
        await page.evaluate(theme => {
          if (theme.value) document.documentElement.dataset.theme = theme.value;
          else delete document.documentElement.dataset.theme;
          document.documentElement.classList.toggle('dark', theme.dark);
        }, theme);
        assert.ok(writes.some(body => body.action === 'set_speed' && body.speed_mode === 'high'));
        assert.match(await speed.innerText(), /最慢[\s\S]*最快[\s\S]*占用少[\s\S]*占用多/);
        await page.locator('[data-effort-flow]').waitFor();
        const flow = page.locator('.processing-flow-outer');
        const blue = await flow.evaluate(el => getComputedStyle(el).fill);
        const highColor = await highSpeed.evaluate(el => getComputedStyle(el).color);
        assert.equal(await scale.locator(':scope > span[data-selected]').evaluate(el => getComputedStyle(el).color), highColor);
        const readFeedback = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--feedback-success').trim());
        const feedbackBlue = await readFeedback();
        await page.evaluate(() => { document.documentElement.dataset.accent = 'emerald' });
        const emerald = await flow.evaluate(el => getComputedStyle(el).fill);
        assert.notEqual(emerald, blue, 'The top tier shimmer follows the site accent color');
        assert.notEqual(await highSpeed.evaluate(el => getComputedStyle(el).color), highColor, 'The full-speed entry follows the site accent color');
        assert.equal(await scale.locator(':scope > span[data-selected]').evaluate(el => getComputedStyle(el).color),
          await highSpeed.evaluate(el => getComputedStyle(el).color), 'The full speed tick and the entry share the accent color');
        assert.notEqual(await readFeedback(), feedbackBlue, 'The legacy progress feedback color follows the site accent');
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--feed-mark').trim()), '#F78422', 'RSS keeps its orange semantic color');
        await page.screenshot({ path: path.join(artifacts, `${viewport.name}-effort.png`) });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.locator('[data-effort-flow] svg').evaluate(el => getComputedStyle(el).animationName), 'none');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await speed.press('Escape');
        await settle(page, '#toasts [data-processing-dock]');
        await dock.getByRole('link', { name: 'Task details' }).click();
        await dock.getByRole('button', { name: 'Collapse task details' }).waitFor();
        assert.equal(await dock.count(), 1, 'Paging keeps the same task card');
        assert.equal(await dock.locator('[data-processing-step="complete"] s').innerText(), 'Scan files');
        assert.equal(await dock.locator('[aria-current="step"] s').count(), 0);
        await page.evaluate(async () => {
          const entry = '/dist/peach-app.js', ui = await import(entry);
          ui.showToast(document.getElementById('toasts'), { success: '', error: '' }, 'processing-proof',
            { html: 'Settings saved', alert: false, timeout: 6000, action: null });
        });
        const receipt = page.locator('#toasts [data-sonner-toast]').filter({ hasText: 'Settings saved' });
        await receipt.waitFor();
        await page.waitForFunction(() => {
          const task = document.querySelector('#toasts [data-processing-dock]');
          const notice = [...document.querySelectorAll('#toasts [data-sonner-toast]')]
            .find(node => node.textContent?.includes('Settings saved'));
          return task && notice && notice.getBoundingClientRect().bottom <= task.getBoundingClientRect().top - 7;
        });
        const dockBox = await dock.boundingBox(), receiptBox = await receipt.boundingBox();
        assert.ok(dockBox && receiptBox && receiptBox.y + receiptBox.height <= dockBox.y - 7,
          JSON.stringify({ message: 'Ordinary receipts sit above the task card', dockBox, receiptBox,
            space: await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--processing-toast-space')) }));
        const homeLayout = await layout(page);
        assert.ok(homeLayout.scrollWidth <= homeLayout.viewportWidth, JSON.stringify(homeLayout));
        assert.deepEqual(homeLayout.offenders, []);
        await page.screenshot({ path: path.join(artifacts, `${viewport.name}-notice.png`) });
        await page.waitForTimeout(6500);
        assert.equal(await dock.isVisible(), true, 'Task cards never vanish on ordinary receipt timeouts');
        state = { ...state, stalled: true, current_action: 'reading_local_cover',
          current_asset_name: '2026-07-15 Creator compilation multi-angle full version.mp4',
          waited_seconds: 33,
          eta_seconds_min: 63, eta_seconds_max: 94 };
        await dock.getByText('Waiting on the current file\'s response; time remaining pending update', { exact: true }).waitFor();
        await page.waitForFunction(() => document.querySelector('[data-processing-dock]')?.textContent?.includes('Waited 33 sec'));
        await page.waitForFunction(() => {
          const elapsed = document.querySelector('[data-processing-dock]')?.textContent?.match(/已等待 (\d+) 秒/);
          return elapsed && Number(elapsed[1]) >= 34;
        }, undefined, { timeout: 5000 });
        assert.match(await dock.innerText(), /读取配套图片/);
        assert.doesNotMatch(await dock.innerText(), /预计剩余/);
        const stalledLayout = await layout(page);
        assert.ok(stalledLayout.scrollWidth <= stalledLayout.viewportWidth, JSON.stringify(stalledLayout));
        assert.deepEqual(stalledLayout.offenders, []);
        await page.screenshot({ path: path.join(artifacts, `${viewport.name}-stalled.png`) });
        state.status = 'complete';
        await dock.waitFor({ state: 'hidden' });
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close() }
    });
  }
});
