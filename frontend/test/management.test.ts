import { describe, expect, it } from 'vitest';
import { cleanupSkeletonHtml, SCAN_CARD_TEXT } from '../src/management';

describe('Data management first screen', () => {
  const skeleton = () => {
    const root = document.createElement('div');
    root.innerHTML = cleanupSkeletonHtml();
    return root;
  };

  it('The everyday scan appears immediately; other operations show only their group entries', () => {
    const root = skeleton();
    expect(root.querySelector('#libraryProcessing p')?.textContent).toBe(SCAN_CARD_TEXT);
    expect([...root.querySelectorAll('h2')].map(heading => heading.textContent))
      .toEqual(['Pending review', 'Organize and maintain', 'Clean up and delete']);
    expect(root.querySelector('#mediaRepair, #organize, #link-manager, #resource-sync, table')).toBeNull();
    expect(root.querySelector('#libraryProcessing footer > a')?.getAttribute('href')).toBe('/sources');
  });

  it('The scan button keeps its final size and variant and cannot be used before the data is ready', () => {
    const root = skeleton();
    expect(root.querySelector('[inert]')).not.toBeNull();
    const split = root.querySelector('#libraryProcessing [data-split-button]')!;
    expect(split.getAttribute('data-variant')).toBe('primary');
    expect(split.querySelector('button:last-child use')?.getAttribute('href')).toBe('#i-chevron-down');
    expect(root.querySelector('[aria-label="Library"]')?.getAttribute('aria-disabled')).toBe('true');
    for (const button of root.querySelectorAll('footer button')) {
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.hasAttribute('data-skeleton-action')).toBe(true);
    }
  });
});
