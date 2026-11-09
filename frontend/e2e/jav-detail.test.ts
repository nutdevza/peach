import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, layout, requiredEnv, settle, VIEWPORTS, withPageDiagnostics } from './harness.ts';
import { JAV_DETAIL, mockJavDetail } from './jav-detail-fixture.ts';

describe('Out-of-library JAV video details', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  it('Comments expanding and collapsing asynchronously keeps the details body in the scroll area', { timeout: 60000 }, async () => {
    const context = await browser.newContext({ viewport: { width: 1730, height: 1032 }, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await mockJavDetail(page);
      let releaseReviews!: () => void;
      const reviewsReady = new Promise<void>(resolve => { releaseReviews = resolve });
      await page.route(/\/api\/jav\/reviews\?/, async route => {
        await reviewsReady;
        await route.fulfill({ json: { ok: true, page: 1, more: false, items: Array.from({ length: 10 }, (_, i) => ({
          id: String(i), username: 'Source commenters', created_at: '2026-10-12', score: 4,
          content: 'Comment bodies and video info.'.repeat(40),
        })) } });
      });
      await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001');
      const side = page.locator('[data-jav-info]');
      await side.locator('h1').waitFor();
      await page.locator('#stage').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
      const toggle = page.locator('[data-jav-reviews] summary');
      const snapshot = () => side.evaluate(node => {
        const side = node.getBoundingClientRect(), title = node.querySelector('h1')!.getBoundingClientRect();
        return { height: side.height, scroll: node.scrollTop, titleVisible: title.bottom > side.top && title.top < side.bottom };
      });
      const initial = await snapshot();
      await toggle.click();
      const loading = page.locator('[data-skeleton="reviews"]');
      await loading.waitFor();
      const placeholder = await loading.evaluate(node => ({ height: node.getBoundingClientRect().height,
        rows: node.querySelectorAll('[data-jav-review-skeleton]').length,
        radii: [...node.querySelectorAll('.skeleton-sheen')].map(bar => parseFloat(getComputedStyle(bar).borderRadius)),
      }));
      releaseReviews();
      assert.equal(placeholder.rows, 3);
      assert.ok(placeholder.height >= 240, JSON.stringify(placeholder));
      assert.ok(placeholder.radii.every(radius => radius > 0), JSON.stringify(placeholder));
      await page.locator('[data-jav-review]').first().waitFor();
      await loading.waitFor({ state: 'detached' });
      const expanded = await snapshot();
      assert.ok(expanded.titleVisible && Math.abs(expanded.height - initial.height) < 1 && Math.abs(expanded.scroll - initial.scroll) < 1,
        JSON.stringify({ initial, expanded }));
      await side.evaluate(node => { node.scrollTop = node.scrollHeight });
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
      await page.locator('[data-jav-review]').first().waitFor({ state: 'hidden' });
      await side.evaluate(node => { node.scrollTop = 0 });
      assert.ok((await snapshot()).titleVisible);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: '../build/jav-comments-expanded.png' });
    } finally { await context.close() }
  });
  /* The details overlay is a top-layer dialog opened by `showModal()`: popovers and Toasts mounted on body cannot out-z-index it,
     reading as "clicked, nothing happened". Hit testing takes the popover's and toast's own center points. */
  it('The find-resources popover and action receipts layer above the details popover', { timeout: 60000 }, async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await mockJavDetail(page);
      await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001');
      await page.locator('[data-jav-info] h1').waitFor();
      const hit = (selector: string) => page.locator(selector).first().evaluate(node => {
        const box = node.getBoundingClientRect();
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(24, box.height / 2));
        return { onTop: !!target && node.contains(target), inStage: !!node.closest('#stage') };
      });
      await page.locator('[data-jav-actions]').getByRole('button', { name: 'Find resources', exact: true }).click();
      await page.getByRole('heading', { name: 'Find resources', exact: true }).waitFor();
      assert.deepEqual(await hit('[data-modal-surface]'), { onTop: true, inStage: true }, 'The find sources popover sits under the details overlay');
      /* The full-width dropdown in the form: the expanded option panel matches the trigger's width, not the shared menu's 266px. */
      const goal = page.locator('[data-modal-surface]').getByRole('button', { name: /优先寻找/ });
      await goal.click();
      const panel = page.locator('[data-trigger="Select"]');
      await panel.waitFor();
      const [goalBox, panelBox] = [await goal.boundingBox(), await panel.boundingBox()];
      assert.ok(goalBox && panelBox && goalBox.width > 266 && Math.abs(goalBox.width - panelBox.width) <= 1,
        `Options panel ${panelBox?.width}px, trigger box ${goalBox?.width}px`);
      await panel.getByRole('option', { name: 'HD', exact: true }).click();
      await panel.waitFor({ state: 'detached' });
      await page.keyboard.press('Escape');
      await page.locator('[data-modal-surface]').waitFor({ state: 'detached' });
      await withPageDiagnostics(page, 'Escape closes only the innermost popover', async () => {
        assert.equal(await page.locator('#stage[open]').count(), 1, 'Escape closes only the innermost popover');
      });
      /* After the dropdown is torn down, focus returns to the trigger only on the next frame; in that frame focus sits on body and Escape bypasses the overlay. The popover container
         still holds the focus-trap sentinels at that point, so its last child is not the popover. */
      await page.locator('[data-jav-actions]').getByRole('button', { name: 'Find resources', exact: true }).click();
      await goal.click();
      await panel.getByRole('option', { name: 'HD', exact: true }).click();
      await panel.waitFor({ state: 'detached' });
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      const layers = await page.evaluate(() => [...document.querySelectorAll('#stage > [data-react-overlays] > *')]
        .map(node => `${node.tagName}${Object.keys((node as HTMLElement).dataset).map(key => `[${key}]`).join('')}`).join(' '));
      await page.keyboard.press('Escape');
      await page.locator('[data-modal-surface]').waitFor({ state: 'detached' });
      await withPageDiagnostics(page, `With focus on body, Escape closed the entire details; popover containers: ${layers}`, async () => {
        assert.equal(await page.locator('#stage[open]').count(), 1, 'With focus on body, Escape closed the entire details');
      });
      /* Keyboard events are always dispatched from body; focus restoration must not turn them into keypresses inside the popover. */
      await page.locator('[data-jav-actions]').getByRole('button', { name: 'Find resources', exact: true }).click();
      await page.getByRole('heading', { name: 'Find resources', exact: true }).waitFor();
      await page.locator('body').evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      await page.locator('[data-modal-surface]').waitFor({ state: 'detached' });
      await withPageDiagnostics(page, 'A global Escape closes only the innermost popover', async () => {
        assert.equal(await page.locator('#stage[open]').count(), 1, 'The global keyboard entry closes the whole details view');
      });
      /* Fires the native close request directly, so neither fast nor slow focus restoration can bypass the cancel branch. */
      await page.locator('[data-jav-actions]').getByRole('button', { name: 'Find resources', exact: true }).click();
      await page.getByRole('heading', { name: 'Find resources', exact: true }).waitFor();
      await page.locator('#stage').evaluate(node => node.dispatchEvent(new Event('cancel', { cancelable: true })));
      await page.locator('[data-modal-surface]').waitFor({ state: 'detached' });
      await withPageDiagnostics(page, 'The native cancel closes only the innermost popover', async () => {
        assert.equal(await page.locator('#stage[open]').count(), 1, 'The native cancel closed the entire details');
      });
      await page.locator('[data-jav-actions]').getByRole('button', { name: 'Want', exact: true }).click();
      await page.locator('#toasts [data-sonner-toast]').filter({ hasText: 'Added to wants' }).waitFor();
      assert.deepEqual(await hit('#toasts [data-sonner-toast]'), { onTop: true, inStage: true }, 'The action receipt is covered by the details popover');
      await page.locator('#closeStage').click();
      await page.locator('#stage').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#toasts').evaluate(node => node.parentElement?.tagName), 'BODY', 'After the floating window collapses, the Toast stack did not return to body');
    } finally { await context.close() }
  });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}: the trailer-failure notice stays horizontal, retry restores playback, and the details notice is evenly spaced vertically`, { timeout: 60000 }, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        await mockJavDetail(page);
        await page.route(/\/api\/jav\/detail\?/, route => route.fulfill({ json: { ...JAV_DETAIL,
          message: 'Video profile not fetched, please try again later', preview_video_url: `/stream?id=${process.env.PEACH_E2E_ITEM}` } }));
        let unavailable = true;
        await page.route(/\/stream\?/, route => unavailable
          ? route.fulfill({ status: 404, body: '' }) : route.continue());
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001');
        const infoNote = page.locator('[data-jav-info] > [role="note"]');
        await infoNote.waitFor();
        const spacing = await infoNote.evaluate(node => {
          const box = node.getBoundingClientRect();
          return { before: box.top - node.previousElementSibling!.getBoundingClientRect().bottom,
            after: node.nextElementSibling!.getBoundingClientRect().top - box.bottom };
        });
        assert.ok(spacing.before >= 16 && Math.abs(spacing.before - spacing.after) < 1, JSON.stringify(spacing));
        await page.locator('[data-jav-preview-toggle]').click();
        const preview = page.locator('[data-jav-video]');
        const failure = preview.getByRole('note');
        await failure.waitFor();
        assert.equal(await preview.locator('.video-js, video').count(), 0, 'On failure the player and its loading state are removed');
        const bounds = await failure.evaluate(node => {
          const box = node.getBoundingClientRect(), frame = node.parentElement!.getBoundingClientRect();
          const text = node.querySelector('p')!.getBoundingClientRect();
          return { width: box.width, textWidth: text.width, inside: box.left >= frame.left && box.right <= frame.right,
            centerOffset: Math.abs((box.top + box.bottom - frame.top - frame.bottom) / 2) };
        });
        assert.ok(bounds.width >= 260 && bounds.textWidth >= 120 && bounds.inside && bounds.centerOffset < 1, JSON.stringify(bounds));
        unavailable = false;
        await failure.getByRole('button', { name: 'Retry now', exact: true }).click();
        await page.waitForFunction(() => (document.querySelector<HTMLVideoElement>('[data-jav-video] video')?.readyState || 0) >= 1);
        assert.equal(await failure.count(), 0);
        assert.ok((await layout(page)).scrollWidth <= viewport.width + 1);
      } finally { await context.close() }
    });
    it(`${viewport.name}: after page rebuild, comments and resources reuse the successful snapshot`, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        await mockJavDetail(page);
        await page.route(/\/api\/jav\/detail\?/, route => route.fulfill({ json: { ...JAV_DETAIL,
          release_date: '2020-01-01', preview_count: 0, source_image: false } }));
        let reviews = 0, resources = 0;
        const checked = new Date().toISOString();
        await page.route(/\/api\/jav\/reviews\?/, route => {
          reviews++;
          return route.fulfill({ json: { ok: true, page: 1, more: false, checked_at: checked,
            items: [{ id: 'saved', username: 'Example user', content: 'Saved comment body', created_at: checked }] } });
        });
        await page.route(/\/api\/jav\/resources\?/, route => {
          resources++;
          return route.fulfill({ json: { state: 'ready', items: [], warnings: [], error: '', checked_at: checked } });
        });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001');
        for (let visit = 0; visit < 2; visit++) {
          await page.locator('[data-jav-info] h1').waitFor();
          await page.locator('[data-jav-reviews] summary').click();
          await page.getByText('Saved comment body').waitFor();
          await page.locator('[data-jav-resources] summary').click();
          await page.locator('[data-want-magnets]').scrollIntoViewIfNeeded();
          await page.getByText('No resource links found yet').waitFor();
          await settle(page, '#stage');
          assert.deepEqual({ reviews, resources }, { reviews: 1, resources: 1 });
          assert.ok((await layout(page)).scrollWidth <= viewport.width + 1);
          if (visit === 0) await page.reload();
        }
        const refreshed = page.waitForResponse(response => response.url().includes('/api/jav/reviews?') && response.url().includes('refresh=1'));
        await page.getByRole('button', { name: 'Refresh comments', exact: true }).click();
        await refreshed;
        await settle(page, '#stage');
        assert.deepEqual({ reviews, resources }, { reviews: 2, resources: 1 });
        await page.route(/\/api\/jav\/reviews\?/, route => {
          reviews++;
          return route.fulfill({ json: { ok: false, page: 1, items: [], more: false, message: 'The source is temporarily unavailable' } });
        });
        await page.getByRole('button', { name: 'Refresh comments', exact: true }).click();
        await page.getByText('The source is temporarily unavailable').waitFor();
        assert.ok(await page.getByText('Saved comment body').isVisible());
        assert.equal(reviews, 3);
      } finally { await context.close() }
    });
    it(`${viewport.name}: the loading skeleton's two columns stay inside the details frame`, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve });
      try {
        await context.addInitScript(() => localStorage.setItem('peach.settings.v1', JSON.stringify({ detailAutoplay: false })));
        const page = await context.newPage();
        await mockJavDetail(page);
        await page.route(/\/api\/jav\/detail\?/, async route => {
          await held;
          await route.fulfill({ json: { ...JAV_DETAIL, preview_count: 0 } });
        });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001', { waitUntil: 'domcontentloaded' });
        const skeleton = page.locator('#stage [data-skeleton="detail"]');
        await skeleton.waitFor();
        const bounds = await skeleton.evaluate(node => {
          const grid = node.querySelector('[data-stage-grid]')!.getBoundingClientRect();
          const media = node.querySelector('[data-stage-media]')!.getBoundingClientRect();
          const side = node.querySelector('[data-stage-side]')!.getBoundingClientRect();
          const shell = node.closest('[data-stage]')!.getBoundingClientRect();
          const lines = [...node.querySelectorAll('[data-stage-side] .skeleton')].map(line => line.getBoundingClientRect());
          return { grid: { width: grid.width, height: grid.height }, shellHeight: shell.height, mediaHeight: media.height,
            mediaWithin: media.left >= grid.left - 1 && media.right <= grid.right + 1,
            columnsSeparate: side.top >= media.bottom - 1 || media.right <= side.left + 1,
            linesWithin: lines.every(line => line.left >= side.left - 1 && line.right <= side.right + 1) };
        });
        assert.ok(bounds.mediaWithin && bounds.columnsSeparate && bounds.linesWithin, JSON.stringify(bounds));
        await page.screenshot({ path: `../build/jav-detail-pending-${viewport.name}.png` });
        release();
        await page.locator('#stage [data-jav-detail] h1').waitFor();
        const ready = await page.locator('#stage [data-jav-detail][data-stage-grid]').boundingBox();
        const shell = await page.locator('#stage').boundingBox();
        const media = await page.locator('#stage [data-jav-detail] > [data-stage-media]').boundingBox();
        assert.ok(ready && shell && media && Math.abs(ready.width - bounds.grid.width) <= 1
          && Math.abs(shell.height - bounds.shellHeight) <= 1 && Math.abs(media.height - bounds.mediaHeight) <= 1,
          JSON.stringify({ ready, bounds }));
      } finally { release(); await context.close() }
    });
    it(`${viewport.name} new releases open in-app, preview toggles, comments paginate, and closing returns`, { timeout: 60000 }, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile, hasTouch: viewport.mobile, reducedMotion: 'reduce' });
      try {
        await context.addInitScript(() => localStorage.setItem('peach.settings.v1', JSON.stringify({ detailAutoplay: false, feedAutoScroll: false })));
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await mockJavDetail(page);
        await page.route(/\/jav-image\?/, async route => {
          const portrait = new URL(route.request().url()).searchParams.get('image') === '1';
          if (portrait) await new Promise(resolve => setTimeout(resolve, 350));
          const [width, height] = portrait ? [600, 900] : [900, 600];
          await route.fulfill({ contentType: 'image/svg+xml',
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#777"/></svg>` });
        });
        await page.route(/\/api\/entity\/shapes/, route => route.fulfill({ json: { home: { feed: true }, entities: [] } }));
        await page.route(/\/api\/feeds\/discoveries\?/, route => route.fulfill({ json: { ok: true, items: [
          { id: 1, code: 'EXM-001', title: 'Example new release', performers: 'Example person', release_date: '2026-10-30' },
        ] } }));
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/');
        const card = page.locator('#feedNew [data-feed-id="1"]');
        await card.waitFor({ state: 'visible' });
        await card.getByRole('link', { name: 'Open EXM-001\'s video details' }).click();
        await page.waitForURL('**/works/EXM-001');
        await page.locator('#stage [data-jav-detail] h1').waitFor({ state: 'visible' });
        assert.ok(await page.locator('#stage').evaluate(el => (el as HTMLDialogElement).open));
        assert.equal(await card.count(), 1, 'Original list stays under the details');
        await page.getByRole('img', { name: 'EXM-001 cover', exact: true }).waitFor({ state: 'visible' });
        const shared = await page.locator('[data-jav-info]').evaluate(el => {
          const faces = [...el.querySelectorAll('[data-identity-primary] [data-id-face]')].map(face => {
            const box = face.getBoundingClientRect(); return { width: box.width, height: box.height, y: box.y };
          });
          const stars = [...el.querySelectorAll('[data-jav-rating] [data-rate]')];
          const code = el.querySelector('[data-detail-title] b')!.getBoundingClientRect();
          const tag = el.querySelector('[data-jav-tags] [data-detail-tag]')!;
          const tagStyle = getComputedStyle(tag), detailStyle = getComputedStyle(el);
          const range = document.createRange();
          // The title text sits in a span with a language marker: measure its first character.
          const text = el.querySelector('[data-detail-title] > span')!.firstChild!;
          range.setStart(text, 0); range.setEnd(text, 1);
          return { faces, stars: stars.length, filled: stars.filter(star => star.getAttribute('data-on') === 'true').length,
            icons: el.querySelectorAll('[data-stage-meta] [data-spec-item] svg').length,
            codeY: code.y, titleY: range.getBoundingClientRect().y,
            tag: el.querySelector('[data-jav-tags] [data-tag]')?.textContent,
            tagCat: el.querySelector('[data-jav-tags] [data-tag-cat]')?.getAttribute('data-tag-cat'),
            tagShape: { height: parseFloat(tagStyle.height), radius: parseFloat(tagStyle.borderRadius), border: parseFloat(tagStyle.borderTopWidth) },
            tagTokens: { height: parseFloat(detailStyle.getPropertyValue('--control-h-inline')),
              radius: parseFloat(detailStyle.getPropertyValue('--tag-radius')), border: 1 } };
        });
        assert.equal(shared.faces.length, 3, 'Performer, unknown cast, and label each get their own identity cell');
        assert.equal(await page.locator('[data-id-gender="male"]').count(), 0);
        for (const [gender, label] of [['female', 'Performers'], ['unknown', 'Cast']]) {
          assert.equal(await page.locator(`[data-id-gender="${gender}"] [data-id-label]`).textContent(), label);
          assert.equal(await page.locator(`[data-id-gender="${gender}"] [data-id-face]`).count(), 1);
        }
        assert.ok(shared.faces.every(face => face.width === 46 && face.height === 46));
        assert.ok(shared.faces.every(face => Math.abs(face.y - shared.faces[0]!.y) < 1));
        assert.equal(shared.stars, 5);
        assert.equal(shared.filled, 4);
        assert.equal(await page.locator('[data-jav-art]').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(0, 0, 0)');
        await page.locator('[data-jav-rating] [data-rate="1"]').hover();
        const fraction = await page.locator('[data-jav-info] > [data-jav-rating] [data-rate="5"]').evaluate(el =>
          el.querySelector('[data-rating-fill]')!.getBoundingClientRect().width / el.querySelector('[data-rating-icon]')!.getBoundingClientRect().width);
        assert.ok(Math.abs(fraction - 0.4) < 0.01, 'At 4.4 the fifth star fills 40%');
        const starLayers = await page.locator('[data-jav-info] > [data-jav-rating] [data-rate]').evaluateAll(nodes => nodes.map(node => {
          const [outline, fill] = node.querySelectorAll('svg');
          const a = outline!.getBoundingClientRect(), b = fill!.getBoundingClientRect();
          return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
        }));
        assert.ok(starLayers.every(error => error < .5), JSON.stringify(starLayers));
        assert.equal(shared.icons, 2);
        assert.ok(Math.abs(shared.codeY - shared.titleY) < 2, 'The code and title start on the same line');
        assert.equal(shared.tag, 'Nympho'); assert.equal(shared.tagCat, 'role');
        assert.deepEqual(shared.tagShape, shared.tagTokens, 'New-release tags reuse local details\' height, radius, and border');
        await page.locator('[data-id-gender="female"] [data-id-face] img').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-id-cell="studio"]').evaluate(node => node.tagName), 'SPAN', 'Unarchived labels show the name only');
        assert.equal(await page.locator('[data-follow-image-dots] button').count(), 13);
        const dots = await page.locator('[data-follow-image-dots]').evaluate(el => {
          const box = el.getBoundingClientRect();
          const rect = el.querySelector('[aria-current="true"]')!.getBoundingClientRect();
          return el.scrollWidth > el.clientWidth && rect.left >= box.left && rect.right <= box.right;
        });
        assert.ok(dots, 'The dot strip scrolls with the current dot fully visible');
        assert.equal(await page.locator('[data-carousel-video]').evaluate(el => el.getBoundingClientRect().width), 20);
        assert.equal(await page.locator('[data-media-thumbnails]').count(), 1);
        await page.locator('[data-media-thumbnail="1"] img').waitFor({ state: 'visible' });
        const indicator = page.locator('[data-follow-image-dots]');
        const stripBox = await indicator.boundingBox(), mainBox = await page.locator('[data-jav-picture]').boundingBox();
        assert.ok(stripBox && mainBox && stripBox.y >= mainBox.y + mainBox.height);
        await indicator.hover();
        await page.mouse.wheel(0, 180);
        await page.waitForFunction(() => (document.querySelector('[data-follow-image-dots]')?.scrollLeft || 0) > 0);
        await page.evaluate(() => {
          const frames: { width: number; height: number }[] = [];
          Object.assign(window, { detailHeightFrames: frames });
          const sample = () => { const frame = document.querySelector('[data-stage-media]');
            if (frame) frames.push({ width: innerWidth, height: frame.getBoundingClientRect().height });
            if (frames.length < 120) requestAnimationFrame(sample);
          }; sample();
        });
        const imageDot = page.getByRole('button', { name: 'Preview 2', exact: true });
        await page.keyboard.press('Tab');
        await imageDot.focus();
        assert.equal(await page.locator('[data-media-preview-tip]').count(), 0);
        assert.equal(await page.locator('[data-follow-image-item][aria-current="true"]').getAttribute('data-follow-image-item'), '-1', 'Focus previews keep the current image');
        await imageDot.click();
        await page.getByRole('img', { name: 'EXM-001 preview 2', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Cover', exact: true }).click();
        if (viewport.mobile) {
          await page.setViewportSize({ width: 350, height: viewport.height });
          assert.equal(await page.locator('[data-follow-image-dots] button').count(), 13);
          assert.equal(await page.locator('[data-follow-image-count]').count(), 0);
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.locator('[data-follow-image-dots]').waitFor({ state: 'visible' });
        }
        await page.getByRole('button', { name: 'Next media item', exact: true }).click();
        await page.getByRole('img', { name: 'EXM-001 preview 1', exact: true }).waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Previous media item', exact: true }).click();
        await page.getByRole('button', { name: 'Video previews', exact: true }).first().click();
        await page.waitForFunction(() => { const video = document.querySelector<HTMLVideoElement>('[data-jav-video] video'); return video && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0 });
        assert.ok(await page.locator('[data-jav-video] video.vjs-tech').evaluate(video => (video as HTMLVideoElement).paused), 'Preview waits for the user to hit play');
        const preview = page.locator('[data-jav-video]');
        const playerBox = await preview.locator('.video-js').boundingBox();
        assert.ok(playerBox && Math.abs(playerBox.width / playerBox.height - 16 / 9) < 0.02, JSON.stringify(playerBox));
        const indicatorBox = await page.locator('[data-follow-image-dots]').boundingBox();
        assert.ok(playerBox && indicatorBox && indicatorBox.y >= playerBox.y + playerBox.height, 'The video indicator sits below the player');
        await preview.getByRole('button', { name: 'Play', exact: true }).waitFor({ state: 'visible' });
        assert.equal(await preview.locator('.vjs-control-bar').evaluate(el => getComputedStyle(el).visibility), 'visible');
        await preview.locator('video.vjs-tech').evaluate(node => { (node as HTMLVideoElement).muted = true });
        await preview.getByRole('button', { name: 'Play', exact: true }).click();
        await page.waitForFunction(() => (document.querySelector<HTMLVideoElement>('[data-jav-video] video')?.currentTime || 0) > 0);
        await preview.getByRole('button', { name: 'Paused', exact: true }).click();
        assert.ok(await preview.locator('video.vjs-tech').evaluate(node => (node as HTMLVideoElement).paused));
        await preview.getByRole('button', { name: 'Settings', exact: true }).click();
        await preview.getByRole('menuitem', { name: /播放速度/ }).waitFor({ state: 'visible' });
        await preview.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('button', { name: 'View images', exact: true }).click();
        assert.equal(await page.locator('[data-jav-video] video.vjs-tech').count(), 0, 'Switching back to images unmounts the preview player');
        const frames = await page.evaluate(() => (window as unknown as { detailHeightFrames: { width: number; height: number }[] }).detailHeightFrames);
        assert.ok(frames.length > 3);
        for (const width of new Set(frames.map(frame => frame.width))) {
          const heights = frames.filter(frame => frame.width === width).map(frame => frame.height);
          assert.ok(Math.max(...heights) - Math.min(...heights) < 1, JSON.stringify({ width, heights }));
        }
        const reviewsToggle = page.locator('[data-jav-reviews] summary');
        const resourcesToggle = page.locator('[data-jav-resources] > details > summary');
        for (const toggle of [reviewsToggle, resourcesToggle]) {
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.equal(await toggle.locator('svg').count(), 2, 'The object icon and expand arrow are both present');
        }
        const sourceButton = page.getByRole('link', { name: 'Video sources', exact: true });
        assert.deepEqual(await page.locator('[data-jav-actions] :is(button, a)').allTextContents(), ['Video sources', 'Want', 'Find resources']);
        assert.ok(await sourceButton.evaluate(el => parseFloat(getComputedStyle(el).borderWidth) > 0));
        const side = page.locator('[data-jav-info]');
        const before = await page.locator('#stage').boundingBox();
        const title = await side.locator('h1').elementHandle();
        await reviewsToggle.evaluate(node => {
          const state = window as unknown as { commentFrames: { height: number; y: number; media: number }[]; commentSampling: boolean };
          state.commentFrames = []; state.commentSampling = true;
          node.addEventListener('pointerdown', () => {
            const sample = () => {
              const shell = document.querySelector('#stage')!.getBoundingClientRect();
              const media = document.querySelector('[data-jav-art]')!.getBoundingClientRect();
              state.commentFrames.push({ height: shell.height, y: shell.y, media: media.height });
              if (state.commentSampling && state.commentFrames.length < 600) requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          }, { once: true });
        });
        await reviewsToggle.click();
        await page.waitForFunction(() => document.querySelectorAll('[data-jav-review]').length === 10);
        assert.equal(await page.locator('[data-jav-review] img').count(), 0, 'Comment body rendered as text');
        assert.equal(await page.locator('[data-jav-review] time').first().textContent(), '2026-10-12');
        assert.equal(await page.locator('[data-jav-review] [data-rating-stars]').first().locator('[data-rate]').count(), 5);
        const centers = await page.locator('[data-jav-review-meta]').first().evaluate(node => [...node.children].map(child => {
          const box = child.getBoundingClientRect(); return box.y + box.height / 2;
        }));
        assert.ok(Math.max(...centers) - Math.min(...centers) < 1, JSON.stringify(centers));
        assert.ok(await title!.evaluate(node => node.isConnected), 'Comment loading keeps the title node');
        assert.ok(await side.locator('h1').isVisible(), 'The details title is visible once comments load');
        assert.ok(await page.locator('[data-jav-actions]').isVisible(), 'The details actions are visible once comments load');
        if (!viewport.mobile) {
          const after = await page.locator('#stage').boundingBox();
          assert.ok(before && after && Math.abs(before.height - after.height) < 1 && Math.abs(before.y - after.y) < 1, 'Expanding comments keeps the details frame geometry');
        }
        await page.getByRole('button', { name: 'More comments', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('[data-jav-review]').length === 12);
        assert.equal(await page.getByRole('button', { name: 'More comments', exact: true }).count(), 0);
        await reviewsToggle.click();
        await page.locator('[data-jav-review]').first().waitFor({ state: 'hidden' });
        assert.equal(await reviewsToggle.getAttribute('aria-expanded'), 'false');
        await reviewsToggle.click();
        await page.locator('[data-jav-review]').last().waitFor({ state: 'visible' });
        const commentFrames = await page.evaluate(() => {
          const state = window as unknown as { commentFrames: { height: number; y: number; media: number }[]; commentSampling: boolean };
          state.commentSampling = false; return state.commentFrames;
        });
        assert.ok(commentFrames.length > 3);
        for (const field of ['height', 'y', 'media'] as const) {
          const values = commentFrames.map(frame => frame[field]);
          assert.ok(Math.max(...values) - Math.min(...values) < 1, `Comment switching keeps ${field} consistent: ${JSON.stringify(values)}`);
        }
        await withPageDiagnostics(page, 'Expand the video resource list', async () => {
          await resourcesToggle.click();
          await page.getByText('EXM-001 example asset 1', { exact: false }).waitFor({ state: 'visible' });
        });
        assert.equal(await page.locator('[data-jav-resources] [data-resource-protocol]:visible').count(), 3);
        await page.getByText('More resources (3 items)', { exact: true }).click();
        await page.getByText('EXM-001 example asset 6', { exact: true }).waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-jav-resources] [data-resource-protocol]:visible').count(), 6);
        const resources = await page.locator('[data-jav-resources] [data-resource-protocol]:visible').evaluateAll(rows => rows.map(row => {
          const box = row.getBoundingClientRect(), title = row.querySelector('[data-resource-main]')!.getBoundingClientRect();
          const actions = row.querySelector('[data-resource-actions]')!.getBoundingClientRect();
          return { width: box.width, titleWidth: title.width, titleBottom: title.bottom, actionsTop: actions.top, actionsRight: actions.right, right: box.right };
        }));
        assert.ok(resources.every(row => row.titleWidth >= row.width - 1 && row.actionsTop >= row.titleBottom - 1 && row.actionsRight <= row.right + 1), JSON.stringify(resources));
        const lines = await page.locator('[data-jav-resources] [data-resource-protocol]:visible').evaluateAll(rows => rows.map(row => {
          const style = getComputedStyle(row);
          return { width: style.borderBottomWidth, color: style.borderBottomColor,
            expected: getComputedStyle(row.closest('[data-want-magnets]')!).borderTopColor };
        }));
        assert.ok(lines.every(line => line.width === '1px' && line.color === line.expected), JSON.stringify(lines));
        assert.ok(await page.locator('[data-jav-resources]').getByRole('button', { name: 'Add download', exact: true }).first().isDisabled());
        assert.deepEqual(await page.locator('[data-resource-actions]').first().locator('button, a').allTextContents(), ['Link sources', 'Copy link', 'Add download']);
        assert.equal(await page.locator('[data-resource-facts]').first().getByText('HD', { exact: true }).count(), 0);
        const facts = await page.locator('[data-resource-facts]').first().evaluate(node => {
          const boxes = [...node.children].map(child => child.getBoundingClientRect());
          return boxes.map(box => box.y);
        });
        assert.ok(Math.max(...facts) - Math.min(...facts) < 1, JSON.stringify(facts));
        await resourcesToggle.click();
        await page.locator('[data-jav-resources] [data-resource-protocol]').first().waitFor({ state: 'hidden' });
        await resourcesToggle.click();
        await page.locator('[data-jav-resources] [data-resource-protocol]').first().waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Want', exact: true }).click();
        await page.getByRole('button', { name: 'Remove from wants', exact: true }).waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Remove from wants', exact: true }).click();
        await page.getByRole('button', { name: 'Want', exact: true }).waitFor({ state: 'visible' });
        await settle(page, '#stage[open]');
        const geometry = await layout(page);
        assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `../build/jav-detail-${viewport.name}.png` });
        await page.locator('#closeStage').click();
        await page.waitForURL(requiredEnv('PEACH_E2E_ORIGIN') + '/');
        await card.waitFor({ state: 'visible' });
        assert.equal(await page.locator('#stage').count(), 0);
        await page.goBack();
        await page.locator('#stage [data-jav-detail] h1').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await page.waitForURL(requiredEnv('PEACH_E2E_ORIGIN') + '/');
        await card.getByRole('link', { name: 'Open EXM-001\'s video details' }).click();
        const detailUrl = page.url();
        await page.locator('[data-id-cell="studio"]').click();
        assert.equal(page.url(), detailUrl);
        assert.ok(await page.locator('#stage').isVisible(), 'Unarchived labels never jump to filters');
      } finally { await context.close() }
    });
    it(`${viewport.name}: archived labels open their profile`, { timeout: 60000 }, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        await mockJavDetail(page);
        await page.route(/\/api\/jav\/detail\?/, route => route.fulfill({ json: { ...JAV_DETAIL,
          preview_count: 0, source_image: false, studio_refs: [{ id: 50, name: 'Example label', has_logo: false }] } }));
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001');
        const studio = page.locator('button[data-id-cell="studio"]');
        await studio.waitFor();
        await studio.click();
        await page.waitForURL(url => url.pathname === '/studios/50');
        assert.equal(await page.locator('#stage').count(), 0);
      } finally { await context.close() }
    });
    it(`${viewport.name} stays closable on deep-link refresh and when the source is unavailable`, { timeout: 60000 }, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        await mockJavDetail(page);
        await page.addInitScript(() => {
          const heights: number[] = [];
          Object.assign(window, { coldDetailHeights: heights });
          const sample = () => {
            const dialog = document.querySelector<HTMLDialogElement>('#stage[open]');
            if (dialog) heights.push(dialog.clientHeight);
            if (heights.length < 180) requestAnimationFrame(sample);
          }; requestAnimationFrame(sample);
        });
        await page.route(/\/api\/jav\/detail\?/, async route => {
          await new Promise(resolve => setTimeout(resolve, 400));
          await route.fulfill({ json: { ...JAV_DETAIL, state: 'partial', source_image: false,
            preview_count: 0, message: 'Video profile not fetched, please try again later' } });
        });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001');
        await page.getByText('Video profile not fetched, please try again later', { exact: true }).waitFor({ state: 'visible' });
        const heights = await page.evaluate(() => (window as unknown as { coldDetailHeights: number[] }).coldDetailHeights);
        assert.ok(heights.length > 5 && Math.max(...heights) - Math.min(...heights) < 1, JSON.stringify(heights));
        await page.reload();
        await page.getByText('Video profile not fetched, please try again later', { exact: true }).waitFor({ state: 'visible' });
        await page.locator('#closeStage').click();
        await page.waitForURL('**/jav?tab=discover');
      } finally { await context.close() }
    });
    for (const readOnly of [false, true]) it(`${viewport.name}: downloads obey the database read-only state`, { timeout: 60000 }, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        await mockJavDetail(page);
        await page.route('**/healthz', async route => {
          const response = await route.fetch();
          await route.fulfill({ json: { ...await response.json(), configurable: false, ledger_read_only: readOnly } });
        });
        let submitted: Record<string, unknown> | null = null;
        await page.route(/\/api\/downloads(?:\?|$)/, route => {
          if (route.request().method() === 'POST') {
            submitted = route.request().postDataJSON();
            return route.fulfill({ json: { ok: true, outcome: 'submitted', task: { id: 1 } } });
          }
          return route.fulfill({ json: { available: true, providers: [{ key: '115', label: '115', configured: true, target: '/fixture' }], tasks: [] } });
        });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + '/works/EXM-001');
        assert.equal(await page.getByRole('button', { name: 'Want', exact: true }).isDisabled(), readOnly);
        await page.locator('[data-jav-resources] > details > summary').click();
        const add = page.locator('[data-jav-resources]').getByRole('button', { name: 'Add download', exact: true }).first();
        await add.waitFor({ state: 'visible' });
        if (readOnly) assert.ok(await add.isDisabled());
        else {
          await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[data-jav-resources] [data-resource-actions] button:last-child')?.disabled);
          await add.click();
          await page.getByRole('button', { name: 'Added', exact: true }).first().waitFor();
          assert.equal(submitted?.provider, '115');
          assert.equal(submitted?.code, 'EXM-001');
        }
      } finally {
        await Promise.all(context.pages().map(page => page.unrouteAll({ behavior: 'wait' })));
        await context.close();
      }
    });
  }
});
