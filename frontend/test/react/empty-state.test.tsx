import { expect, it } from 'vitest';
import { RiVideoLine } from '@remixicon/react';
import { EmptyFocusButton, EmptyState } from '../../src/react/components/empty-state';
import { click, mountRoot } from './render';

it('The empty state\'s action focuses the current page\'s existing input', async () => {
  const { host } = await mountRoot(<><input id="empty-focus-input" />
    <EmptyState icon={RiVideoLine} title="No content" actions={<EmptyFocusButton target="#empty-focus-input">Add content</EmptyFocusButton>}>
      Entries appear here once added.
    </EmptyState></>);
  await click(host.querySelector('button'));
  expect(document.activeElement).toBe(host.querySelector('input'));
});

it('Both empty-state tiers keep the same icon semantics with no extra notes', async () => {
  const { host, rerender } = await mountRoot(<EmptyState icon={RiVideoLine} title="No content">{null}</EmptyState>);
  expect(host.querySelector('[data-empty-size="standard"]')).not.toBeNull();
  expect(host.querySelector('p')).toBeNull();
  expect(host.querySelector('svg')?.closest('[aria-hidden]')).not.toBeNull();
  await rerender(<EmptyState size="compact" icon={RiVideoLine} title="No content">Note</EmptyState>);
  expect(host.querySelector('[data-empty-size="compact"]')).not.toBeNull();
  expect(host.querySelector('h3')?.textContent).toBe('No content');
});
