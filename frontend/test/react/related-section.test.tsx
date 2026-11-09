import { describe, expect, it, vi } from 'vitest';
import { RelatedSection } from '../../src/react/components/related-section';
import { click, mountRoot } from './render';

describe('Continue watching state', () => {
  it('The skeleton holds while waiting to read, showing the empty state on completion', async () => {
    const wireDrag = vi.fn();
    const { host, rerender } = await mountRoot(<RelatedSection wireDrag={wireDrag} busy empty><span data-skeleton="" /></RelatedSection>);
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(host.querySelector('[data-skeleton]')).not.toBeNull();
    expect(host.querySelector('[data-empty-state]')).toBeNull();
    await rerender(<RelatedSection wireDrag={wireDrag} empty />);
    expect(host.querySelector('[data-empty-state] h3')?.textContent).toBe('Nothing to continue watching yet');
    expect(host.querySelector('[data-related-row]')).toBeNull();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/');
    await rerender(<RelatedSection wireDrag={wireDrag} online empty />);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/follow');
  });

  it('Failure shows reason and retry, and recovery shows recommendations', async () => {
    const retry = vi.fn();
    const wireDrag = vi.fn();
    const { host, rerender } = await mountRoot(<RelatedSection wireDrag={wireDrag} empty error="Failed to load Continue watching" onRetry={retry} />);
    expect(host.textContent).toContain('Failed to load Continue watching');
    expect(host.querySelector('[data-empty-state]')).toBeNull();
    await click(host.querySelector('[data-note-action]'));
    expect(retry).toHaveBeenCalledOnce();
    await rerender(<RelatedSection wireDrag={wireDrag}><span>Next video</span></RelatedSection>);
    expect(host.querySelector('[data-related-row]')?.textContent).toBe('Next video');
    expect(host.querySelector('[data-empty-state],[data-media-error]')).toBeNull();
  });
});
