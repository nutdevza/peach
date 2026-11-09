import { afterEach, expect, it, vi } from 'vitest';
import { growCollapse, setCollapseOpen, setCollapseRegionOpen } from '../src/ui-kit';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

it('Grows from the start height to the content height, hands back auto when done, and restores the expanded state', () => {
  vi.useFakeTimers();
  const body = document.createElement('div'); body.className = 'ui-fcollapse ui-fcollapse-settled'; document.body.append(body);
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 480 });
  growCollapse(body, 120);
  expect(body.classList.contains('ui-fcollapse-settled')).toBe(false);
  expect(body.style.height).toBe('480px');
  body.dispatchEvent(Object.assign(new Event('transitionend'), { propertyName: 'opacity' }));
  expect(body.style.height).toBe('480px');
  vi.advanceTimersByTime(260);
  expect(body.style.height).toBe('auto');
  expect(body.classList.contains('ui-fcollapse-settled')).toBe(true);
});

it('A mid transition collapse skips the finishing step', () => {
  vi.useFakeTimers();
  const body = document.createElement('div'); body.className = 'ui-fcollapse'; document.body.append(body);
  let open = true;
  growCollapse(body, 0, () => open);
  open = false; body.style.height = '0px';
  vi.advanceTimersByTime(260);
  expect(body.style.height).toBe('0px');
  expect(body.classList.contains('ui-fcollapse-settled')).toBe(false);
});

const collapse = () => {
  const details = document.createElement('details');
  const body = document.createElement('div');
  details.append(document.createElement('summary'), body); document.body.append(details);
  return { details, body };
};

it('Collapsing takes the height to 0 first and closes the details only after the transition finishes', () => {
  vi.useFakeTimers();
  const { details, body } = collapse();
  setCollapseOpen(details, body, true);
  expect(details.open).toBe(true);
  expect(body.classList.contains('ui-fcollapse')).toBe(true);
  vi.advanceTimersByTime(260);
  setCollapseOpen(details, body, false);
  expect(body.style.height).toBe('0px');
  expect(body.inert).toBe(true);
  expect(details.open).toBe(true);
  vi.advanceTimersByTime(260);
  expect(details.open).toBe(false);
  expect(body.style.height).toBe('');
});

it('Opening again mid-collapse means the collapsing run no longer closes the details at the end', () => {
  vi.useFakeTimers();
  const { details, body } = collapse();
  setCollapseOpen(details, body, true);
  vi.advanceTimersByTime(260);
  setCollapseOpen(details, body, false);
  setCollapseOpen(details, body, true);
  vi.advanceTimersByTime(260);
  expect(details.open).toBe(true);
  expect(body.inert).toBe(false);
  expect(body.style.height).toBe('auto');
});

it('An external trigger keeps the body; collapsing removes it from the focus order, and reverse-expanding un-hides it', () => {
  vi.useFakeTimers();
  const body = document.createElement('div'); document.body.append(body);
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 180 });
  setCollapseRegionOpen(body, false);
  expect(body.hidden).toBe(false);
  expect(body.inert).toBe(true);
  setCollapseRegionOpen(body, true);
  vi.advanceTimersByTime(260);
  expect(body.hidden).toBe(false);
  expect(body.inert).toBe(false);
  expect(body.style.height).toBe('auto');
  setCollapseRegionOpen(body, false);
  vi.advanceTimersByTime(260);
  expect(body.hidden).toBe(true);
});
