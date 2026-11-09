import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRevealSourceAction } from '../../src/application/source-action';

afterEach(() => { document.body.innerHTML = '' });

function surface() {
  const button = document.createElement('button'), status = document.createElement('p');
  button.innerHTML = '<span>Locate source file &amp; folder</span>';
  status.textContent = 'The previous error';
  document.body.append(button, status);
  button.focus();
  return { button, status, html: button.innerHTML };
}

describe('The locate-asset action', () => {
  it('The wait stays on the focusable button and repeated triggers do not resend; only success settles and restores the original button', async () => {
    let release!: () => void;
    const request = vi.fn(() => new Promise<void>((done) => { release = done })), success = vi.fn();
    const reveal = createRevealSourceAction({ request, success, failureText: () => '' });
    const { button, status, html } = surface();
    const pending = reveal(41, status, { button });
    expect(request).toHaveBeenCalledWith(41);
    expect(status.textContent).toBe('');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(button.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Locating');
    expect(button.textContent).toContain('Locate source file & folder');
    await reveal(41, status, { button });
    expect(request).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
    release(); await pending;
    expect(success).toHaveBeenCalledTimes(1);
    expect(status.textContent).toBe('');
    expect(button.innerHTML).toBe(html);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });

  it('Failures stay beside the action without sending success receipts, and retry is available once the busy state clears', async () => {
    const missing = new Error('Source file offline'), request = vi.fn().mockRejectedValueOnce(missing).mockResolvedValueOnce(undefined);
    const success = vi.fn(), failureText = vi.fn(() => 'The source file is not on this machine');
    const reveal = createRevealSourceAction({ request, success, failureText });
    const { button, status, html } = surface();
    await reveal(41, status, { button });
    expect(failureText).toHaveBeenCalledWith(missing);
    expect(status.textContent).toBe('The source file is not on this machine');
    expect(success).not.toHaveBeenCalled();
    expect(button.innerHTML).toBe(html);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    await reveal(41, status, { button });
    expect(request).toHaveBeenCalledTimes(2);
    expect(status.textContent).toBe('');
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('React callers receive the failure text and render their own waiting state; no button needs to be provided', async () => {
    const status = { textContent: '' }, success = vi.fn();
    const reveal = createRevealSourceAction({ request: async () => { throw new Error('offline') },
      success, failureText: () => 'Dead links' });
    await reveal(42, status);
    expect(status.textContent).toBe('Dead links');
    expect(success).not.toHaveBeenCalled();
  });
});
