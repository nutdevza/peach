import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { join } from 'node:path';
import type { Browser } from 'playwright-core';
import { launch, layout, requiredEnv, VIEWPORTS } from './harness.ts';

const routes = ['/', '/?browse=folders', '/jav', '/jav?tab=discover', '/jav?tab=wants', '/follow', '/performers', '/creators', '/studios', '/agencies', '/series', '/tags',
  '/performers/demo-performer', '/creators/demo-creator', '/studios/demo-studio', '/series/demo-series', '/agencies/demo-agency', '/tags/demo-tag',
  '/stats', '/taste', '/data-cleanup', '/tasks', '/duplicates', '/quality-goals', '/playlists', '/review', '/sources',
  '/settings/library', '/settings/subscriptions', '/settings/downloads', '/settings/network', '/settings/maintenance', '/settings/diagnostics',
  '/unseen', '/watch-later', '/flagged', '/junk-files', '/trash', '/assets/1', '/posts/1', '/works/EXM-001'];

describe('Per-page skeleton show gates and paint boundaries', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of VIEWPORTS) for (const theme of ['light', 'dark']) for (const [index, path] of routes.entries()) {
    it(`${viewport.name} ${theme} ${path} leaks no shimmer while hidden and never leaves the viewport while shown`, async () => {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve });
      try {
        await context.addInitScript(theme => localStorage.setItem('peach.settings.v1', JSON.stringify({ theme, detailAutoplay: false })), theme);
        const page = await context.newPage();
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url());
          const overlay = /^\/(assets|posts|works)\//.test(path);
          const pending = overlay ? ['/api/item', '/api/follow', '/api/jav/detail'].includes(url.pathname)
            : !['/api/settings', '/api/entity/shapes'].includes(url.pathname);
          if (route.request().method() === 'GET' && pending) await held;
          await route.continue();
        });
        await page.goto(requiredEnv('PEACH_E2E_ORIGIN') + path, { waitUntil: 'load' });
        await page.locator('[data-skeleton]:visible,[data-skeleton-tier]:visible').first().waitFor();
        const leaks = await page.evaluate(() => {
          const roots = [...document.querySelectorAll('[data-skeleton],[data-skeleton-tier]')];
          const marked = roots.filter(node => !node.classList.contains('skeleton-awaiting'));
          marked.forEach(node => node.classList.add('skeleton-awaiting'));
          const leaks = roots.flatMap(root => [root, ...root.querySelectorAll('*')].flatMap(node =>
            ['', '::before', '::after'].filter(pseudo => {
              const css = getComputedStyle(node, pseudo || null);
              return (!pseudo || !['none', 'normal'].includes(css.content)) && css.visibility !== 'hidden';
            }).map(pseudo => `${node.tagName}.${node.className}${pseudo}`)));
          marked.forEach(node => node.classList.remove('skeleton-awaiting'));
          return leaks;
        });
        assert.deepEqual(leaks, []);
        const missing = await page.locator('[data-skeleton] svg use,[data-skeleton-tier] svg use,[data-skeleton-control] svg use').evaluateAll(nodes =>
          nodes.map(node => node.getAttribute('href') || '').filter(href => href.startsWith('#') && !document.getElementById(href.slice(1))));
        assert.deepEqual(missing, [], 'The skeleton used an icon that was not provided');
        const scrollbars = await page.locator('[data-skeleton],[data-skeleton-tier]').evaluateAll(roots =>
          roots.flatMap(root => [root,...root.querySelectorAll('*')]).filter(node => {
            const style=getComputedStyle(node);
            return /^(auto|scroll)$/.test(style.overflowX) || /^(auto|scroll)$/.test(style.overflowY);
          }).filter(node => getComputedStyle(node).scrollbarWidth !== 'none')
            .map(node => `${node.tagName}.${node.className}`));
        assert.deepEqual(scrollbars, [], 'The skeleton shows a native scrollbar');
        assert.deepEqual((await layout(page)).offenders, []);
        const evidence = process.env.PEACH_SKELETON_EVIDENCE;
        if (evidence) await page.screenshot({ path: join(evidence, `${viewport.name}-${theme}-${index}.png`) });
      } finally { release(); await context.close() }
    });
  }
});
