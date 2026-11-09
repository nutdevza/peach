import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright-core';
import { settle, withPageDiagnostics } from './harness.ts';

/** The title and the whole group of actions share one line or split lines; the column settings buttons of the same group stay together. */
async function verifyToolbarWrapping(page: Page) {
  const viewport = page.viewportSize()!;
  try {
    for (const width of [...new Set([viewport.width, 650, 390])]) {
      await page.setViewportSize({ width, height: viewport.height });
      await settle(page);
      const toolbars = await page.locator('[data-responsive-toolbar]').evaluateAll(roots => roots.map(root => {
        const box = (element: Element) => {
          const r = element.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        const actions = root.querySelector('[data-toolbar-actions]')!;
        return { root: box(root), heading: box(root.querySelector('[data-toolbar-heading]')!),
          actions: box(actions), buttons: [...actions.querySelectorAll('button')].map(box),
          columns: [...actions.querySelectorAll('[role="group"]')].map(group =>
            [...group.querySelectorAll(':scope > button')].map(box)) };
      }));
      for (const toolbar of toolbars) {
        assert.ok(toolbar.actions.left >= toolbar.root.left - 1 && toolbar.actions.right <= toolbar.root.right + 1);
        if (toolbar.actions.top < toolbar.heading.bottom - 1) {
          assert.ok(toolbar.actions.left >= toolbar.heading.right);
          const centers = toolbar.buttons.map(b => (b.top + b.bottom) / 2);
          assert.ok(Math.max(...centers) - Math.min(...centers) < 1,
            `At ${width}px some toolbar actions push onto the next line`);
        }
        for (const buttons of toolbar.columns) {
          assert.ok(Math.max(...buttons.map(b => b.top)) - Math.min(...buttons.map(b => b.top)) < 2,
            `At ${width}px the column settings button wraps apart`);
        }
      }
      const footers = await page.locator('[data-table-pagination]').evaluateAll(roots => roots.map(root => {
        const r = root.getBoundingClientRect(), a = root.querySelector('[data-toolbar-actions]')!.getBoundingClientRect();
        return a.left >= r.left - 1 && a.right <= r.right + 1;
      }));
      assert.ok(footers.every(Boolean), `At ${width}px the pagination actions leave the container`);
      const pagination = await page.locator('nav').filter({ has: page.getByRole('button', { name: 'Previous page', exact: true }) })
        .evaluateAll(roots => roots.map(root => {
          const buttons = [...root.querySelectorAll(':scope > button')];
          return buttons.length === 2 && Math.abs(buttons[0]!.getBoundingClientRect().y - buttons[1]!.getBoundingClientRect().y) < 1;
        }));
      assert.ok(pagination.every(Boolean), `At ${width}px previous page and next page split onto different lines`);
    }
  } finally {
    await page.setViewportSize(viewport);
    await settle(page);
  }
}

/** Verify shared column settings, keyboard adjustment, dragging and refresh recovery on a real table. */
export async function verifyTablePreferences(page: Page, table: Locator, label: string, identity: string, optional: { id: string; label: string }, restoreView?: () => Promise<unknown>) {
  await table.waitFor();
  await verifyToolbarWrapping(page);
  const controls = page.getByRole('group', { name: `${label} column settings`, exact: true });
  const header = table.locator(`th[data-key="${identity}"]`);
  const width = async () => header.evaluate(node => node.getBoundingClientRect().width);
  const initial = await width();
  const handle = header.getByRole('slider');
  await withPageDiagnostics(page, `${label} enters keyboard column resizing`, async () => {
    // React Aria focuses row navigation first when entering a collection; confirm that state before moving into the column width handle.
    await table.locator('tbody tr').first().focus();
    await table.locator('tbody tr[data-focused]').first().waitFor();
    await handle.focus();
    assert.equal(await handle.evaluate(node => document.activeElement === node), true,
      `${label} keyboard resizing requires focus on the column width handle first`);
    await handle.press('Enter');
    await header.locator('.react-aria-ColumnResizer[data-resizing]').waitFor();
  });
  await handle.press('ArrowRight'); await handle.press('ArrowRight');
  await page.waitForFunction(({ node, initial }) => node && node.getBoundingClientRect().width > initial,
    { node: await header.elementHandle(), initial }, { timeout: 5000 });
  await handle.press('Tab');
  const resized = await width(); assert.ok(resized > initial, `${label}: ${initial} → ${resized}`);
  const scroll = table.locator('..');
  const range = await scroll.evaluate(node => node.scrollWidth - node.clientWidth);
  if (range > 1) {
    await scroll.evaluate(node => { node.scrollLeft = 0 });
    await table.locator('tbody tr').first().scrollIntoViewIfNeeded();
    const box = (await scroll.boundingBox())!, row = (await table.locator('tbody tr').first().boundingBox())!;
    const x = box.x + box.width - 20, y = row.y + row.height - 4;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 80, y, { steps: 8 }); await page.mouse.up();
    assert.ok(await scroll.evaluate(node => node.scrollLeft) >= Math.min(80, range) - 2, label);
    assert.equal(await table.locator('tbody input[type="checkbox"]:checked:not([role="switch"])').count(), 0, label);
  }
  await controls.getByRole('button', { name: 'Visible columns', exact: true }).click();
  const menu = page.getByRole('dialog', { name: `${label} shown columns`, exact: true });
  const actionLayout = await menu.evaluate(element => {
    const actions = element.querySelector<HTMLElement>('[data-selection-actions]')!;
    const buttons = [...actions.querySelectorAll('button')].map(button => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const naturalWidth = button.lastElementChild!.getBoundingClientRect().width
        + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      return { width: box.width, height: box.height, top: box.top, naturalWidth,
        scrollWidth: button.scrollWidth, clientWidth: button.clientWidth };
    });
    const optionBox = element.querySelector('[data-selection-options]')!.getBoundingClientRect();
    const optionWidths = [...element.querySelectorAll('label')].map(label =>
      label.lastElementChild!.getBoundingClientRect().right - label.getBoundingClientRect().left);
    return { width: actions.getBoundingClientRect().width, top: actions.getBoundingClientRect().top,
      bottom: actions.getBoundingClientRect().bottom, placement: element.getAttribute('data-selection-placement'),
      contentWidth: element.getBoundingClientRect().width, naturalWidth: Math.max(...optionWidths, ...buttons.map(button => button.naturalWidth)),
      optionTop: optionBox.top, optionBottom: optionBox.bottom, buttons };
  });
  assert.ok(actionLayout.placement === 'top' ? actionLayout.bottom <= actionLayout.optionTop
    : actionLayout.top >= actionLayout.optionBottom, `${label} options should sit near the trigger`);
  assert.equal(actionLayout.buttons.length, 2);
  assert.ok(Math.abs(actionLayout.contentWidth - actionLayout.naturalWidth) <= 1, `${label} menu width follows its content`);
  for (const button of actionLayout.buttons) {
    assert.ok(Math.abs(button.width - actionLayout.width) <= 1, `${label} long button fills the action area`);
    assert.ok(button.scrollWidth <= button.clientWidth + 1, `${label} button text should display in full`);
  }
  assert.ok(actionLayout.buttons[1]!.top >= actionLayout.buttons[0]!.top + actionLayout.buttons[0]!.height);
  await menu.locator('label').filter({ has: page.getByRole('checkbox', { name: optional.label, exact: true }) }).click();
  await page.keyboard.press('Escape');
  assert.equal(await table.locator(`th[data-key="${optional.id}"]`).count(), 0);
  await page.reload({ waitUntil: 'load' });
  await restoreView?.();
  await table.waitFor();
  assert.ok(Math.abs(await width() - resized) <= 1, label);
  assert.equal(await table.locator(`th[data-key="${optional.id}"]`).count(), 0);
  await controls.getByRole('button', { name: 'Visible columns', exact: true }).click();
  await menu.getByRole('button', { name: 'Reset display', exact: true }).click();
  await page.keyboard.press('Escape');
  await table.locator(`th[data-key="${optional.id}"]`).waitFor();
  await controls.getByRole('button', { name: 'Reset column widths', exact: true }).click();
  await page.waitForFunction(({ node, initial }) => node && Math.abs(node.getBoundingClientRect().width - initial) <= 1,
    { node: await header.elementHandle(), initial }, { timeout: 5000 });
  assert.ok(Math.abs(await width() - initial) <= 1, label);
  assert.ok(await table.locator('th[data-table-space]').evaluate(node => node.getBoundingClientRect().width) <= 1,
    `${label} default leftover space is taken by the name column`);
  await scroll.evaluate(node => { node.scrollLeft = 0 });
}

/** The content's available width follows column changes, and the text stays fully in the DOM. */
export async function verifyColumnContentWidth(table: Locator, id: string, selector: string) {
  const header = table.locator(`th[data-key="${id}"]`);
  const index = await header.evaluate(node => [...node.parentElement!.children].indexOf(node));
  const cell = table.locator('tbody tr').first().locator('td').nth(index);
  const content = cell.locator(selector).first();
  const measure = () => content.evaluate(node => ({ width: node.getBoundingClientRect().width,
    cell: node.closest('td')!.getBoundingClientRect().width,
    text: node.getAttribute('title') || node.getAttribute('aria-label') || node.textContent }));
  const initial = await measure();
  // The user drags the column edge with the pointer; with keyboard resizing the table's arrow-key navigation steals focus and the content width cannot be measured.
  const resizer = header.locator('.react-aria-ColumnResizer');
  // Scroll to the middle of the viewport to avoid the toast popping up in the bottom right.
  await resizer.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const box = (await resizer.boundingBox())!;
  const page = content.page(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 100, y, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction(({ node, initial }) => node && node.closest('td')!.getBoundingClientRect().width > initial + 70,
    { node: await content.elementHandle(), initial: initial.cell }, { timeout: 5000 }).catch(() => undefined);
  const resized = await measure();
  assert.ok(resized.cell > initial.cell + 70, `The ${id} column did not widen: ${JSON.stringify({ initial, resized })}`);
  assert.ok(Math.abs((resized.width - initial.width) - (resized.cell - initial.cell)) <= 2,
    `${id} content did not stretch with the column: ${JSON.stringify({ initial, resized })}`);
  assert.equal(resized.text, initial.text);
  const geometry = await content.evaluate(node => ({ content: node.getBoundingClientRect().right,
    cell: node.closest('td')!.getBoundingClientRect().right }));
  assert.ok(geometry.content <= geometry.cell, JSON.stringify(geometry));
}
