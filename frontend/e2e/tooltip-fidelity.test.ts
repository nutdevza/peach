import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import type { Browser } from 'playwright-core';
import { launch, VIEWPORTS } from './harness.ts';
import { openItemPage } from './item-fixture.ts';

describe('The shared note\'s text and anchor', () => {
  let browser: Browser;
  before(async () => { browser = await launch() });
  after(async () => { await browser.close() });
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name} saved filter names read directly on hover`, async () => {
      const opened = await openItemPage(browser, '/', viewport, { ready: '[data-catalog-frame]' });
      try {
        await opened.page.route('**/api/library-shortcuts', route => route.fulfill({ json: {
          favorites: [], filters: [{ id: 'clear', name: 'HD library', href: '/?quality=hd' }],
        } }));
        await opened.page.locator('[data-shortcuts-trigger]').click();
        await opened.page.getByRole('tab', { name: 'Saved filters', exact: true }).click();
        const saved = opened.page.getByRole('link', { name: 'HD library', exact: true });
        await saved.hover();
        await opened.page.waitForTimeout(500);
        assert.equal(await saved.getAttribute('title'), null);
        assert.equal(await opened.page.locator('#board-control-tooltip:visible').count(), 0);
      } finally { await opened.close() }
    });
    it(`${viewport.name} full text needs no tooltip and truncated text offers the original`, async () => {
      const opened = await openItemPage(browser, '/', viewport, { ready: '[data-catalog-frame]' });
      try {
        await opened.page.evaluate(() => {
          const probe = document.createElement('div');
          probe.style.cssText = 'position:fixed;left:30px;top:200px;z-index:9999;background:white;display:grid;gap:20px;width:280px';
          probe.innerHTML = '<a id="tip-readable" href="#" title="HD library">HD library</a><a id="tip-clipped" href="#" title="This library filter needs the full name to be readable" style="display:block;width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">This library filter needs the full name to be readable</a>';
          document.body.append(probe);
        });
        await opened.page.locator('#tip-readable').focus();
        await opened.page.waitForTimeout(100);
        assert.equal(await opened.page.locator('#board-control-tooltip:visible').count(), 0);
        assert.equal(await opened.page.locator('#tip-readable').getAttribute('title'), null);
        assert.equal(await opened.page.locator('#tip-readable').getAttribute('aria-describedby'), null);
        await opened.page.locator('#tip-clipped').focus();
        await opened.page.locator('#board-control-tooltip').waitFor({ state: 'visible' });
        assert.equal(await opened.page.locator('#board-control-tooltip').textContent(), 'This is a favorite filter that needs the full name visible');
        assert.equal(await opened.page.locator('#tip-readable').getAttribute('title'), 'HD library');
      } finally { await opened.close() }
    });
    it(`${viewport.name} nested-control tooltips follow the mouse target`, async () => {
      const opened = await openItemPage(browser, '/', viewport, { ready: '[data-catalog-frame]' });
      try {
        await opened.page.evaluate(() => {
          const probe = document.createElement('div');
          probe.title = 'Parent note';
          probe.style.cssText = 'position:fixed;left:30px;top:200px;z-index:9999;background:white;display:flex;gap:20px';
          probe.innerHTML = '<button id="tip-parent">Outer</button><button id="tip-child" title="Child description">Inner</button>';
          document.body.append(probe);
        });
        await opened.page.locator('#tip-parent').focus();
        await opened.page.locator('#board-control-tooltip').waitFor({ state: 'visible' });
        await opened.page.locator('#tip-child').hover();
        await opened.page.waitForFunction(() => document.querySelector('#board-control-tooltip')?.textContent === 'Child note');
        assert.equal(await opened.page.locator('#tip-parent').getAttribute('aria-label'), null);
      } finally { await opened.close() }
    });
    it(`${viewport.name} dialog icon tooltips follow the visible anchor`, async () => {
      const opened = await openItemPage(browser, '/', viewport, { ready: '[data-catalog-frame]' });
      try {
        await opened.page.evaluate(() => {
          const modal = document.createElement('dialog');
          modal.id = 'tip-modal';
          modal.style.cssText = 'width:300px;height:200px;padding:40px;transform:translateY(20px)';
          modal.innerHTML = '<span id="tip-contents" title="Filter video sources" style="display:contents"><button id="tip-icon" aria-label="Sources" style="width:40px;height:40px"><svg width="20" height="20"><circle cx="10" cy="10" r="8"/></svg></button></span>';
          document.body.append(modal); modal.showModal();
        });
        await opened.page.locator('#tip-icon').focus();
        await opened.page.locator('#board-control-tooltip').waitFor({ state: 'visible' });
        const geometry = await opened.page.evaluate(() => {
          const tip = document.querySelector('#board-control-tooltip')!.getBoundingClientRect();
          const icon = document.querySelector('#tip-icon')!.getBoundingClientRect();
          return { tip: { x: tip.x, y: tip.y, w: tip.width, h: tip.height }, icon: { x: icon.x, y: icon.y, w: icon.width, h: icon.height }, inModal: !!document.querySelector('#tip-modal #board-control-tooltip') };
        });
        assert(geometry.inModal);
        assert(Math.abs(geometry.tip.x + geometry.tip.w / 2 - geometry.icon.x - geometry.icon.w / 2) <= 1, JSON.stringify(geometry));
        assert(Math.abs(geometry.tip.y + geometry.tip.h + 8 - geometry.icon.y) <= 1, JSON.stringify(geometry));
      } finally { await opened.close() }
    });
    it(`${viewport.name}: the task icon's visible tooltip keeps its own edit key and does not leak to other controls when closed`, async () => {
      const opened = await openItemPage(browser, '/', viewport, { ready: '[data-catalog-frame]' });
      try {
        await opened.page.evaluate(() => {
          const probe = document.createElement('div');
          probe.style.cssText = 'position:fixed;left:30px;top:200px;z-index:9999;display:flex;gap:20px';
          probe.innerHTML = '<div data-copy-bar hidden></div><button id="tip-task-control" aria-label="Pause follow-up tasks" title="Pause follow-up tasks" data-tooltip-copy-key="tasks.control.action.followups.pause" style="width:32px;height:32px"><svg width="16" height="16"><path d="M4 2v12M12 2v12"/></svg></button><button id="tip-other-control" aria-label="Other actions" title="Other actions" style="width:32px;height:32px">…</button>';
          document.body.append(probe);
        });
        await opened.page.locator('#tip-task-control').focus();
        const tip = opened.page.locator('#board-control-tooltip');
        await tip.waitFor({ state: 'visible' });
        assert.equal(await tip.textContent(), 'Pause follow-up tasks');
        assert.equal(await tip.getAttribute('data-copy-key'), 'tasks.control.action.followups.pause');
        assert.equal(await opened.page.locator('#tip-task-control').getAttribute('data-copy-key'), null);
        assert.equal(await tip.evaluate(node => getComputedStyle(node).pointerEvents), 'auto');
        await tip.hover();
        await opened.page.waitForTimeout(300);
        assert.equal(await tip.isVisible(), true);
        // Esc 收起后指针仍停在原处，浏览器随后按原坐标补发边界事件；收起与聚焦放在同一任务里，补发必然落在聚焦之后。
        const closed = await opened.page.evaluate(() => {
          const node = document.querySelector('#board-control-tooltip')!;
          document.addEventListener('pointerover', () => { (window as any).__restingBoundary = true }, { once: true, capture: true });
          document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          const state = { hidden: node.hasAttribute('hidden'), key: node.getAttribute('data-copy-key') };
          document.querySelector<HTMLElement>('#tip-other-control')!.focus();
          return state;
        });
        assert.deepEqual(closed, { hidden: true, key: null });
        await opened.page.waitForFunction(() => (window as any).__restingBoundary === true);
        await tip.waitFor({ state: 'visible' });
        assert.equal(await tip.textContent(), 'Other actions');
        assert.equal(await tip.getAttribute('data-copy-key'), null);
        await opened.page.keyboard.press('Escape');
        await opened.page.locator('#tip-task-control').hover();
        await tip.waitFor({ state: 'visible' });
        assert.equal(await tip.getAttribute('data-copy-key'), 'tasks.control.action.followups.pause');
      } finally { await opened.close() }
    });
    it(`${viewport.name}: the tooltip stays visible while picking a copy source and editing child nodes; Esc cancels editing first`, async () => {
      const opened = await openItemPage(browser, '/', viewport, { ready: '[data-catalog-frame]' });
      try {
        await opened.page.addScriptTag({ content: await readFile(new URL('../src/copy-editor-core.js', import.meta.url), 'utf8') });
        await opened.page.evaluate(() => {
          const button = document.createElement('button');
          button.id = 'tip-edit-action'; button.title = 'Continue'; button.setAttribute('aria-label', 'Continue');
          button.dataset.tooltipCopyKey = 'tasks.control.action.resume';
          button.style.cssText = 'position:fixed;left:120px;top:240px;z-index:9999;width:32px;height:32px';
          button.innerHTML = '<svg width="16" height="16"><path d="M4 2v12l10-6Z"/></svg>';
          document.body.append(button);
          const core = (globalThis as any).PeachCopyEditorCore;
          const tools = core.createTools({ onToggle() {}, onExport() {}, onExit() {} });
          core.create({
            highlight: tools.highlight,
            resolve(node: Text) { return node.parentElement?.closest('#board-control-tooltip') ? {} : null; },
            onBusy: tools.setBusy,
            onStatus: tools.say,
            async prepare(edit: any) {
              const range = document.createRange(); range.selectNodeContents(edit.node);
              const candidate = await tools.choose([
                { label: 'task-controls.tsx', value: { source: 'task-controls.tsx' } },
                { label: 'other.tsx', value: { source: 'other.tsx' } },
              ], range.getBoundingClientRect(), { label: 'Copy source' });
              return candidate ? { candidate } : null;
            },
            async save(_edit: any, replacement: string) { return { text: replacement }; },
          });
        });
        await opened.page.locator('#tip-edit-action').hover();
        const tip = opened.page.locator('#board-control-tooltip');
        await tip.waitFor({ state: 'visible' });
        await tip.click();
        const choice = opened.page.locator('[data-copy-choice]');
        await choice.waitFor({ state: 'visible' });
        assert.equal(await tip.isVisible(), true);
        assert.equal(await tip.getAttribute('data-copy-key'), 'tasks.control.action.resume');
        await choice.selectOption('0');
        const input = tip.locator('[data-copy-inline][aria-label="Edit text"]');
        await input.waitFor({ state: 'visible' });
        await input.fill('Temporary continue');
        await input.press('Escape');
        assert.equal(await tip.locator('[data-copy-inline]').count(), 0);
        assert.equal(await tip.isVisible(), true);
        assert.equal(await tip.textContent(), 'Continue');
        assert.equal(await tip.getAttribute('data-copy-key'), 'tasks.control.action.resume');
        await opened.page.keyboard.press('Escape');
        await tip.waitFor({ state: 'hidden' });
        await opened.page.locator('#tip-edit-action').hover();
        await tip.waitFor({ state: 'visible' });
        await tip.click();
        await choice.waitFor({ state: 'visible' });
        await choice.press('Escape');
        await choice.waitFor({ state: 'detached' });
        assert.equal(await tip.isVisible(), true);
      } finally { await opened.close() }
    });
  }
});
