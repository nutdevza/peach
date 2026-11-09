/* Horizontal skeletons lay to the right edge: fill completely, and let the browser lay out only a few times for the whole batch.
 *
 * Reading a width after mutating the DOM forces the browser to lay out the whole page on the spot. On cold start the profile page's skeleton rows appended and
 * measured one by one, measured at over a hundred milliseconds per row. Here a stubbed geometry counts how many "mutate then read" rounds happened. */
import { afterEach, describe, expect, it } from 'vitest';

import { fillSkeletonTier, fitSkeleton } from '../src/ui-kit';

const ROW = 1000;
const SLOT = 100;
let layouts = 0;
let dirty = false;
const rect = (left: number, right: number) => ({ left, right, top: 0, bottom: 20, width: right - left, height: 20 });
const original = HTMLElement.prototype.getBoundingClientRect;

function row(kind: string): HTMLElement {
  const node = document.createElement('div');
  node.dataset.skeletonTier = kind;
  const read = () => { if (dirty) { layouts++; dirty = false; } };
  Object.defineProperty(node, 'clientWidth', { get: () => { read(); return ROW; } });
  Object.defineProperty(node, 'scrollWidth', { get: () => { read(); return Math.max(ROW, node.children.length * SLOT); } });
  const insert = node.insertAdjacentHTML.bind(node);
  node.insertAdjacentHTML = (where: InsertPosition, html: string) => { dirty = true; insert(where, html); };
  return node;
}

HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
  const parent = this.parentElement;
  if (this.dataset.skeletonTier) { if (dirty) { layouts++; dirty = false; } return rect(0, ROW) as DOMRect; }
  if (parent?.dataset.skeletonTier) {
    if (dirty) { layouts++; dirty = false; }
    const index = [...parent.children].indexOf(this);
    return rect(index * SLOT, (index + 1) * SLOT) as DOMRect;
  }
  return original.call(this);
};

afterEach(() => { layouts = 0; dirty = false; document.body.replaceChildren(); });

describe('The horizontal skeleton fills', () => {
  it('Rows fill in together: each row crosses the right edge, and the whole batch lays out only twice', () => {
    const root = document.createElement('div');
    const rows = [row('av'), row('brandpill'), row('pill')];
    root.append(...rows);
    document.body.append(root);
    fitSkeleton(root);
    for (const node of rows) expect(node.children.length * SLOT).toBeGreaterThan(ROW);
    expect(layouts).toBe(2);
  });

  it('Backfilling an already-full row adds nothing', () => {
    const root = document.createElement('div');
    const node = row('pill');
    root.append(node);
    document.body.append(root);
    fitSkeleton(root);
    const filled = node.children.length;
    fitSkeleton(root);
    expect(node.children.length).toBe(filled);
  });

  it('Even a standalone backfilled row crosses the right edge, with extras never exceeding one round of the width sequence', () => {
    const node = row('av');
    document.body.append(node);
    fillSkeletonTier(node, 'av');
    expect(node.children.length * SLOT).toBeGreaterThan(ROW);
    expect(node.children.length).toBeLessThanOrEqual(ROW / SLOT + 2);
  });
});
